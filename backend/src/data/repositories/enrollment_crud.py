"""
CRUD operations for student enrollments and questions.
"""
from typing import Optional, List
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError
from src.data.models.postgres.enrollment import StudentEnrollment, Question


# ── Enrollment CRUD ──────────────────────────────────────────────────────────

async def create_enrollment(
    db: AsyncSession,
    enrollment_id: str,
    user_id: str,
    course_id: str,
    selected_modules: list,
) -> None:
    """Create a new student enrollment."""
    try:
        db.add(StudentEnrollment(
            enrollment_id=enrollment_id,
            user_id=user_id,
            course_id=course_id,
            selected_modules=selected_modules,
            progress={"visited": [], "module_tests_passed": [], "final_passed": False},
            status="active",
        ))
        await db.commit()
    except SQLAlchemyError as e:
        await db.rollback()
        raise e


async def get_enrollment(
    db: AsyncSession,
    enrollment_id: str,
) -> Optional[StudentEnrollment]:
    """Get a single enrollment by ID."""
    result = await db.execute(
        select(StudentEnrollment).where(
            StudentEnrollment.enrollment_id == enrollment_id
        )
    )
    return result.scalar_one_or_none()


async def get_enrollments_for_user(
    db: AsyncSession,
    user_id: str,
) -> List[dict]:
    """Get all enrollments for a user."""
    result = await db.execute(
        select(StudentEnrollment)
        .where(StudentEnrollment.user_id == user_id)
        .order_by(StudentEnrollment.created_at.desc())
    )
    rows = result.scalars().all()
    return [
        {
            "enrollment_id": e.enrollment_id,
            "user_id": e.user_id,
            "course_id": e.course_id,
            "selected_modules": e.selected_modules,
            "progress": e.progress or {"visited": [], "module_tests_passed": [], "final_passed": False},
            "status": e.status,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in rows
    ]


async def get_enrollment_for_course(
    db: AsyncSession,
    user_id: str,
    course_id: str,
) -> Optional[StudentEnrollment]:
    """Check if user already has an active enrollment for this course."""
    result = await db.execute(
        select(StudentEnrollment).where(
            and_(
                StudentEnrollment.user_id == user_id,
                StudentEnrollment.course_id == course_id,
                StudentEnrollment.status == "active",
            )
        )
    )
    return result.scalar_one_or_none()


async def update_enrollment_progress(
    db: AsyncSession,
    enrollment_id: str,
    progress: dict,
) -> None:
    """Update the progress JSON of an enrollment."""
    try:
        result = await db.execute(
            select(StudentEnrollment).where(
                StudentEnrollment.enrollment_id == enrollment_id
            )
        )
        enrollment = result.scalar_one_or_none()
        if enrollment:
            enrollment.progress = progress
            await db.commit()
    except SQLAlchemyError as e:
        await db.rollback()
        raise e


async def complete_enrollment(
    db: AsyncSession,
    enrollment_id: str,
) -> None:
    """Mark an enrollment as completed."""
    try:
        result = await db.execute(
            select(StudentEnrollment).where(
                StudentEnrollment.enrollment_id == enrollment_id
            )
        )
        enrollment = result.scalar_one_or_none()
        if enrollment:
            enrollment.status = "completed"
            await db.commit()
    except SQLAlchemyError as e:
        await db.rollback()
        raise e


# ── Question CRUD ────────────────────────────────────────────────────────────

async def get_questions_for_module(
    db: AsyncSession,
    course_id: str,
    module_id: str,
    enrollment_id: str = None,
) -> List[dict]:
    """Get questions for a specific module. If enrollment_id given, get per-user questions."""
    conditions = [
        Question.course_id == course_id,
        Question.module_id == module_id,
        Question.is_final == False,
    ]
    if enrollment_id:
        conditions.append(Question.enrollment_id == enrollment_id)
    else:
        conditions.append(Question.enrollment_id == None)
    result = await db.execute(
        select(Question).where(and_(*conditions))
    )
    rows = result.scalars().all()
    return [
        {
            "question_id": q.question_id,
            "question_type": q.question_type,
            "question_text": q.question_text,
            "options": q.options,
            "correct_answer": q.correct_answer,
            "hints": q.hints,
        }
        for q in rows
    ]


async def get_final_questions(
    db: AsyncSession,
    course_id: str,
    enrollment_id: str = None,
) -> List[dict]:
    """Get final assessment questions for a course. If enrollment_id given, get per-user questions."""
    conditions = [
        Question.course_id == course_id,
        Question.is_final == True,
    ]
    if enrollment_id:
        conditions.append(Question.enrollment_id == enrollment_id)
    else:
        conditions.append(Question.enrollment_id == None)
    result = await db.execute(
        select(Question).where(and_(*conditions))
    )
    rows = result.scalars().all()
    return [
        {
            "question_id": q.question_id,
            "question_type": q.question_type,
            "question_text": q.question_text,
            "options": q.options,
            "correct_answer": q.correct_answer,
            "hints": q.hints,
        }
        for q in rows
    ]


async def save_questions(
    db: AsyncSession,
    questions: List[dict],
) -> None:
    """Bulk save question rows."""
    try:
        for q in questions:
            db.add(Question(
                course_id=q["course_id"],
                enrollment_id=q.get("enrollment_id"),
                module_id=q.get("module_id"),
                question_type=q["question_type"],
                question_text=q["question_text"],
                options=q["options"],
                correct_answer=q["correct_answer"],
                hints=q["hints"],
                is_final=q.get("is_final", False),
            ))
        await db.commit()
    except SQLAlchemyError as e:
        await db.rollback()
        raise e
