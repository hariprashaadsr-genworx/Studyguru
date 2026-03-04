"""
student_router.py — API routes for the student workflow.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from src.data.clients.postgresql_client import get_db
import src.core.services.student_service as student_svc


router = APIRouter(prefix="/api/student", tags=["Student Workflow"])


# ── Request schemas ──────────────────────────────────────────────────────────

class SelectedModule(BaseModel):
    module_id: str
    submodule_ids: List[str]


class CustomizationRequest(BaseModel):
    base_course_id: str
    user_id: str
    selected_modules: List[SelectedModule]
    course_mode: str = "custom"     # "base" or "custom"
    tone: str = "friendly"          # formal, friendly, casual
    easiness_level: int = 3         # 1-5
    use_analogies: str = "no"       # yes / no
    analogy_style: str = "everyday" # everyday, technical, creative


# ── Browse all base courses ──────────────────────────────────────────────────

@router.get("/courses")
async def list_courses(db: AsyncSession = Depends(get_db)):
    """List all available base courses for students to browse."""
    return await student_svc.list_all_courses(db)


# ── Get full course (for viewing base content) ──────────────────────────────

@router.get("/course/{course_id}")
async def get_course(course_id: str, db: AsyncSession = Depends(get_db)):
    """Get full base course data."""
    return await student_svc.get_base_course(course_id, db)


# ── Get course structure (modules + submodules — no content) ─────────────────

@router.get("/course/{course_id}/structure")
async def get_structure(course_id: str, db: AsyncSession = Depends(get_db)):
    """Get module/submodule tree for checkbox selection."""
    return await student_svc.get_course_structure(course_id, db)


# ── Start customization ─────────────────────────────────────────────────────

@router.post("/customize")
async def customize(req: CustomizationRequest):
    """Start a customization job. Returns job_id for SSE tracking."""
    params = {
        "user_id": req.user_id,
        "base_course_id": req.base_course_id,
        "selected_modules": [m.dict() for m in req.selected_modules],
        "course_mode": req.course_mode,
        "tone": req.tone,
        "easiness_level": req.easiness_level,
        "use_analogies": req.use_analogies,
        "analogy_style": req.analogy_style,
    }
    return await student_svc.start_customization(params)


# ── SSE status stream for customization ──────────────────────────────────────

@router.get("/customize/status/{job_id}")
async def customization_status(job_id: str):
    """SSE stream — sends log lines in real time."""
    return await student_svc.stream_customization_status(job_id)


# ── Get customization result ─────────────────────────────────────────────────

@router.get("/customize/result/{job_id}")
async def customization_result(job_id: str):
    return await student_svc.get_customization_result(job_id)


# ── My custom courses ───────────────────────────────────────────────────────

@router.get("/my-courses/{user_id}")
async def my_custom_courses(user_id: str, db: AsyncSession = Depends(get_db)):
    """List all custom courses for a user."""
    return await student_svc.list_my_custom_courses(user_id, db)


# ── Get a specific custom course ─────────────────────────────────────────────

@router.get("/my-course/{custom_course_id}/{user_id}")
async def my_custom_course(
    custom_course_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get full data for a specific custom course."""
    return await student_svc.get_my_custom_course(custom_course_id, user_id, db)
