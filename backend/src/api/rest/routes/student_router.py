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


class EnrollRequest(BaseModel):
    user_id: str
    course_id: str
    selected_modules: List[SelectedModule]


class VisitRequest(BaseModel):
    submodule_key: str  # "{mi}-{si}" format


class TestSubmitRequest(BaseModel):
    module_id: str
    score: int
    total: int


class FinalTestSubmitRequest(BaseModel):
    score: int
    total: int


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


# ══════════════════════════════════════════════════════════════════════════════
# Enrollment endpoints
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/enroll")
async def enroll(req: EnrollRequest, db: AsyncSession = Depends(get_db)):
    """Enroll student in a course with selected modules."""
    return await student_svc.enroll_student(
        req.user_id,
        req.course_id,
        [m.dict() for m in req.selected_modules],
        db,
    )


@router.get("/enrollments/{user_id}")
async def list_enrollments(user_id: str, db: AsyncSession = Depends(get_db)):
    """List all enrollments for a user."""
    return await student_svc.get_student_enrollments(user_id, db)


@router.get("/enrollment/{enrollment_id}")
async def get_enrollment_detail(enrollment_id: str, db: AsyncSession = Depends(get_db)):
    """Get enrollment with filtered course data and progress."""
    return await student_svc.get_enrollment_data(enrollment_id, db)


@router.patch("/enrollment/{enrollment_id}/visit")
async def visit_submodule(enrollment_id: str, req: VisitRequest, db: AsyncSession = Depends(get_db)):
    """Mark a submodule as visited."""
    return await student_svc.mark_submodule_visited(enrollment_id, req.submodule_key, db)


@router.get("/enrollment/{enrollment_id}/questions/{module_id}")
async def module_questions(enrollment_id: str, module_id: str, db: AsyncSession = Depends(get_db)):
    """Get or generate module quiz questions (5 per module)."""
    return await student_svc.get_or_generate_module_questions(enrollment_id, module_id, db)


@router.get("/enrollment/{enrollment_id}/final-questions")
async def final_questions(enrollment_id: str, db: AsyncSession = Depends(get_db)):
    """Get or generate final assessment questions (15)."""
    return await student_svc.get_or_generate_final_questions(enrollment_id, db)


@router.post("/enrollment/{enrollment_id}/submit-module-test")
async def submit_module_test(enrollment_id: str, req: TestSubmitRequest, db: AsyncSession = Depends(get_db)):
    """Submit module test results."""
    return await student_svc.submit_module_test_service(enrollment_id, req.module_id, req.score, req.total, db)


@router.post("/enrollment/{enrollment_id}/submit-final-test")
async def submit_final_test(enrollment_id: str, req: FinalTestSubmitRequest, db: AsyncSession = Depends(get_db)):
    """Submit final assessment results."""
    return await student_svc.submit_final_test_service(enrollment_id, req.score, req.total, db)


@router.post("/enrollment/{enrollment_id}/complete")
async def complete_course(enrollment_id: str, db: AsyncSession = Depends(get_db)):
    """Mark enrollment as completed (Done button)."""
    return await student_svc.complete_enrollment_service(enrollment_id, db)


# ══════════════════════════════════════════════════════════════════════════════
# Legacy customization endpoints (kept for backward compat)
# ══════════════════════════════════════════════════════════════════════════════

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


@router.get("/customize/status/{job_id}")
async def customization_status(job_id: str):
    """SSE stream — sends log lines in real time."""
    return await student_svc.stream_customization_status(job_id)


@router.get("/customize/result/{job_id}")
async def customization_result(job_id: str):
    return await student_svc.get_customization_result(job_id)


@router.get("/my-courses/{user_id}")
async def my_custom_courses(user_id: str, db: AsyncSession = Depends(get_db)):
    """List all custom courses for a user."""
    return await student_svc.list_my_custom_courses(user_id, db)


@router.get("/my-course/{custom_course_id}/{user_id}")
async def my_custom_course(
    custom_course_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get full data for a specific custom course."""
    return await student_svc.get_my_custom_course(custom_course_id, user_id, db)
