from fastapi import APIRouter, HTTPException
from dotenv import load_dotenv
from openai import BaseModel
from src.schemas.generation import GenerateRequest
from sqlalchemy.ext.asyncio import AsyncSession
from src.data.clients.postgresql_client import get_db
from fastapi import Depends
import src.core.services.generation_service as services
from src.schemas.generation import SyllabusRequest


router = APIRouter(prefix='/api', tags = ['Base course generation Engine'])

@router.get("/courses")
async def list_courses_api(db: AsyncSession = Depends(get_db)):
    return await services.list_courses_ap(db)


@router.get("/course/{course_id}")
async def get_course_api(course_id: str, db: AsyncSession = Depends(get_db)):
    return await services.get_course_ap(course_id, db)

@router.post("/generate")
async def generate(req: GenerateRequest):
    return await services.generate_course(req)


@router.get("/status/{job_id}")
async def stream_status(job_id: str):
    """SSE stream — sends log lines in real time."""
    return await services.stream_status_service(job_id)


@router.get("/result/{job_id}")
async def get_result(job_id: str):
    return await services.get_results(job_id)


@router.get("/logs/{job_id}")
async def get_log(job_id: str):
    return await services.get_logs(job_id)


@router.post("/get_syllabus")
async def get_syllabus(payload: SyllabusRequest):
    try:
        result = await services.generate_course_structure(payload.syllabus)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/health")
async def health():
    return await services.health()