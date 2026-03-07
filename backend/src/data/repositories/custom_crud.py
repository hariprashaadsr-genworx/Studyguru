"""
CRUD operations for the custom_courses table.
"""
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError
from src.data.models.postgres.custom_course import CustomCourse


async def save_custom_course(
    db: AsyncSession,
    custom_course_id: str,
    user_id: str,
    base_course_id: str,
    course_title: str,
    subject_domain: str,
    tone: str,
    easiness_level: int,
    use_analogies: str,
    analogy_style: str,
    course_mode: str,
    selected_modules: list,
    data: dict,
) -> None:
    """Insert or update a custom course."""
    try:
        result = await db.execute(
            select(CustomCourse).where(CustomCourse.custom_course_id == custom_course_id)
        )
        cc = result.scalar_one_or_none()

        if not cc:
            cc = CustomCourse(custom_course_id=custom_course_id)
            db.add(cc)

        cc.user_id = user_id
        cc.base_course_id = base_course_id
        cc.course_title = course_title
        cc.subject_domain = subject_domain
        cc.tone = tone
        cc.easiness_level = easiness_level
        cc.use_analogies = use_analogies
        cc.analogy_style = analogy_style
        cc.course_mode = course_mode
        cc.selected_modules = selected_modules

        cc.total_modules = data.get("total_modules", 0)
        cc.total_submodules = data.get("total_submodules", 0)
        cc.total_slides = data.get("total_slides", 0)
        cc.data = data

        await db.commit()
    except SQLAlchemyError as e:
        await db.rollback()
        raise e


async def get_custom_courses_for_user(
    db: AsyncSession,
    user_id: str,
) -> List[dict]:
    """Get all custom courses for a specific user."""
    result = await db.execute(
        select(CustomCourse)
        .where(CustomCourse.user_id == user_id)
        .order_by(CustomCourse.created_at.desc())
    )
    rows = result.scalars().all()
    return [
        {
            "custom_course_id": c.custom_course_id,
            "base_course_id": c.base_course_id,
            "course_title": c.course_title,
            "subject_domain": c.subject_domain,
            "tone": c.tone,
            "easiness_level": c.easiness_level,
            "use_analogies": c.use_analogies,
            "course_mode": c.course_mode,
            "total_modules": c.total_modules,
            "total_submodules": c.total_submodules,
            "total_slides": c.total_slides,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in rows
    ]


async def get_custom_course(
    db: AsyncSession,
    custom_course_id: str,
    user_id: str,
) -> Optional[dict]:
    """Get a single custom course (only if it belongs to the user)."""
    result = await db.execute(
        select(CustomCourse).where(
            CustomCourse.custom_course_id == custom_course_id,
            CustomCourse.user_id == user_id,
        )
    )
    cc = result.scalar_one_or_none()
    return cc.data if cc else None
