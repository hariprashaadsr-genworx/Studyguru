"""
student_service.py — Business logic for student workflows.
"""
import uuid
import asyncio
import json
import traceback

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.ext.asyncio import AsyncSession

from src.data.repositories.crud import list_courses, get_course
from src.data.repositories.custom_crud import (
    get_custom_courses_for_user,
    get_custom_course,
)
from src.data.clients.postgresql_client import SessionLocal
from src.control.workflows.student_customization_engine import run_customization_workflow


# ── In-memory job tracker for customization ──────────────────────────────────
custom_jobs: dict = {}


async def list_all_courses(db: AsyncSession):
    """Return all base courses (available to students for browsing)."""
    courses = await list_courses(db)
    return JSONResponse(courses)


async def get_base_course(course_id: str, db: AsyncSession):
    """Return a single base course (for module selection)."""
    course = await get_course(db, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    return JSONResponse(course)


async def get_course_structure(course_id: str, db: AsyncSession):
    """Return just the module/submodule tree (no content) for checkbox selection."""
    course = await get_course(db, course_id)
    if not course:
        raise HTTPException(404, "Course not found")

    structure = {
        "course_id": course.get("course_id", course_id),
        "course_title": course.get("course_title", ""),
        "subject_domain": course.get("subject_domain", ""),
        "skill_level": course.get("skill_level", 3),
        "skill_label": course.get("skill_label", ""),
        "modules": [],
    }

    for mod in course.get("modules", []):
        m = {
            "module_id": mod.get("module_id", ""),
            "title": mod.get("title", ""),
            "submodules": [
                {
                    "submodule_id": sub.get("submodule_id", ""),
                    "title": sub.get("title", ""),
                }
                for sub in mod.get("submodules", [])
            ],
        }
        structure["modules"].append(m)

    return JSONResponse(structure)


async def list_my_custom_courses(user_id: str, db: AsyncSession):
    """Return all custom courses for the logged-in student."""
    courses = await get_custom_courses_for_user(db, user_id)
    return JSONResponse(courses)


async def get_my_custom_course(custom_course_id: str, user_id: str, db: AsyncSession):
    """Return a single custom course (if it belongs to the user)."""
    data = await get_custom_course(db, custom_course_id, user_id)
    if not data:
        raise HTTPException(404, "Custom course not found")
    return JSONResponse(data)


async def _customization_worker(job_id: str, params: dict):
    """Background worker for customization."""
    custom_jobs[job_id]["status"] = "running"

    try:
        async with SessionLocal() as db:
            result = await run_customization_workflow(
                user_id=params["user_id"],
                base_course_id=params["base_course_id"],
                selected_modules=params["selected_modules"],
                course_mode=params["course_mode"],
                tone=params["tone"],
                easiness_level=params["easiness_level"],
                use_analogies=params["use_analogies"],
                analogy_style=params["analogy_style"],
                db=db,
            )

        custom_jobs[job_id]["progress_log"] = result.get("progress_log", [])

        if result.get("error"):
            custom_jobs[job_id]["status"] = "error"
            custom_jobs[job_id]["error"] = result["error"]
        else:
            custom_jobs[job_id]["status"] = "complete"
            custom_jobs[job_id]["result"] = {
                "custom_course_id": result["custom_course_id"],
                "course_mode": result["course_mode"],
            }

    except Exception as e:
        traceback.print_exc()
        custom_jobs[job_id]["status"] = "error"
        custom_jobs[job_id]["error"] = str(e)
        custom_jobs[job_id]["progress_log"].append(f"Fatal: {e}")


async def start_customization(params: dict):
    """Start a customization job. Returns job_id."""
    job_id = str(uuid.uuid4())

    custom_jobs[job_id] = {
        "status": "queued",
        "progress_log": [],
        "result": None,
        "error": None,
    }

    asyncio.create_task(_customization_worker(job_id, params))

    return {"job_id": job_id, "message": "Customization started"}


async def stream_customization_status(job_id: str):
    """SSE stream for customization progress."""
    if job_id not in custom_jobs:
        raise HTTPException(404, "Job not found")

    async def generator():
        last = 0
        while True:
            job = custom_jobs[job_id]
            logs = job["progress_log"]
            for msg in logs[last:]:
                yield {"event": "log", "data": json.dumps({"message": msg})}
            last = len(logs)

            if job["status"] == "complete":
                yield {
                    "event": "complete",
                    "data": json.dumps(job["result"]),
                }
                break
            elif job["status"] == "error":
                yield {
                    "event": "error",
                    "data": json.dumps({"error": job["error"]}),
                }
                break
            await asyncio.sleep(0.4)

    return EventSourceResponse(generator())


async def get_customization_result(job_id: str):
    """Get the result of a completed customization job."""
    if job_id not in custom_jobs:
        raise HTTPException(404, "Job not found")
    job = custom_jobs[job_id]
    if job["status"] == "error":
        raise HTTPException(500, job.get("error", "Unknown"))
    if job["status"] != "complete":
        raise HTTPException(202, "Still processing")
    return JSONResponse(job["result"])
