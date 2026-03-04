import os
import uuid
import asyncio
import json
import threading
import traceback
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from dotenv import load_dotenv
import src.observability.logging as LOG
import src.control.workflows.generation_engine as wf
from src.schemas.generation import GenerateRequest
import src.control.nodes.generation_nodes as generation_nodes
from sqlalchemy.ext.asyncio import AsyncSession
from src.data.clients.postgresql_client import SessionLocal, get_db, engine
from fastapi import Depends
from src.data.repositories.crud import list_courses, get_course
import src.control.prompts as P
from src.control.nodes.generation_nodes import generate_course_structure

load_dotenv()

router = APIRouter(prefix='/api', tags = ['Base course generation Engine'])


jobs: dict = {} 


async def _worker(job_id: str, course_input: dict):

    jobs[job_id]["status"] = "running"

    orig_log = generation_nodes._log

    def patched_log(state, msg):
        jobs[job_id]["progress_log"].append(msg)
        return orig_log(state, msg)

    generation_nodes._log = patched_log

    try:
        async with SessionLocal() as db:

            result = await wf.run_workflow(
                course_input=course_input,
                job_id=job_id,
                db=db,
            )

        sk = result["skill_level"]

        jobs[job_id]["status"] = "complete"
        jobs[job_id]["result"] = {
            "course_id": result["course_id"],
            "course_title": result["course_title"],
            "subject_domain": result.get("subject_domain", ""),
            "skill_level": sk,
            "skill_label": P.SKILL_PROFILES[sk]["label"],
            "modules": result["modules"],
            "total_modules": len(result["modules"]),
            "total_submodules": sum(
                len(m["submodules"]) for m in result["modules"]
            ),
            "total_slides": sum(
                sum(len(s.get("slides", [])) for s in m["submodules"])
                for m in result["modules"]
            ),
            "total_videos": sum(
                len(m.get("youtube_videos", []))
                for m in result["modules"]
            ),
            "total_refs": sum(
                len(m["references"]) for m in result["modules"]
            ),
        }

    except Exception as e:
        traceback.print_exc()
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"] = str(e)
        jobs[job_id]["progress_log"].append(f"Fatal: {e}")
        await LOG.error(job_id, str(e))

    finally:
        generation_nodes._log = orig_log


async def list_courses_ap(db: AsyncSession):
    courses = await list_courses(db)
    return JSONResponse(courses)


async def get_course_ap(course_id: str, db: AsyncSession):
    course = await get_course(db, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    return JSONResponse(course)


async def generate_course(req: GenerateRequest):

    ci = req.course_input

    if not ci.get("course_title") or not ci.get("modules"):
        raise HTTPException(400, "Need course_title and modules")

    ci["skill_level"] = max(1, min(5, int(ci.get("skill_level", 3))))

    job_id = str(uuid.uuid4())

    jobs[job_id] = {
        "status": "queued",
        "progress_log": [],
        "result": None,
        "error": None,
    }

    asyncio.create_task(_worker(job_id, ci))

    return {"job_id": job_id, "message": "Generation started"}


async def stream_status_service(job_id: str):
    """SSE stream — sends log lines in real time."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")

    async def generator():
        last = 0
        while True:
            job  = jobs[job_id]
            logs = job["progress_log"]
            for msg in logs[last:]:
                yield {"event": "log", "data": json.dumps({"message": msg})}
            last = len(logs)

            if job["status"] == "complete":
                yield {"event": "complete",
                       "data": json.dumps({"course_id": job["result"]["course_id"]})}
                break
            elif job["status"] == "error":
                yield {"event": "error",
                       "data": json.dumps({"error": job["error"]})}
                break
            await asyncio.sleep(0.4)

    return EventSourceResponse(generator())


async def get_syllabus(syllabus: str):
    return await generate_course_structure(syllabus)


async def get_results(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    job = jobs[job_id]
    if job["status"] == "error":
        raise HTTPException(500, job.get("error", "Unknown"))
    if job["status"] != "complete":
        raise HTTPException(202, "Still processing")
    return JSONResponse(job["result"])


async def get_logs(job_id: str):
    path = LOG.get_path(job_id)
    if not path.exists():
        raise HTTPException(404, "Log not found")
    return FileResponse(
        str(path), media_type="text/plain",
        filename=f"course_log_{job_id[:8]}.txt",
    )


async def health():
    return {
        "status": "ok",
        "openai": bool(os.getenv("OPENAI_API_KEY")),
        "tavily": bool(os.getenv("TAVILY_API_KEY")),
        "xai_grok": bool(os.getenv("XAI_API_KEY")),
        "db_connected": engine is not None,
    }