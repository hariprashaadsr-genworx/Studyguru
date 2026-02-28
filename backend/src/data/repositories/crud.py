from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError
from src.data.models.postgres.course import Course
from src.data.models.postgres.submodules import Submodule


async def ensure_course_row(
    db: AsyncSession,
    course_id: str,
    course_title: str,
    skill_level: int,
    skill_label: str,
    subject_domain: str = "",
) -> None:
    try:
        result = await db.execute(
            select(Course).where(Course.course_id == course_id)
        )
        course = result.scalar_one_or_none()

        if not course:
            db.add(
                Course(
                    course_id=course_id,
                    course_title=course_title,
                    skill_level=skill_level,
                    skill_label=skill_label,
                    subject_domain=subject_domain,
                )
            )
            await db.commit()

    except SQLAlchemyError as e:
        await db.rollback()
        raise e


async def store_course(
    db: AsyncSession,
    course_id: str,
    data: dict,
) -> None:
    try:
        result = await db.execute(
            select(Course).where(Course.course_id == course_id)
        )
        course = result.scalar_one_or_none()

        if not course:
            course = Course(course_id=course_id)
            db.add(course)

        course.course_title = data.get("course_title", "")
        course.subject_domain = data.get("subject_domain", "")
        course.skill_level = data.get("skill_level", 3)
        course.skill_label = data.get("skill_label", "")

        course.total_modules = data.get("total_modules", 0)
        course.total_submodules = data.get("total_submodules", 0)
        course.total_slides = data.get("total_slides", 0)
        course.total_refs = data.get("total_refs", 0)
        course.total_images = data.get("total_images", 0)
        course.total_videos = data.get("total_videos", 0)

        course.data = data

        await db.commit()

    except SQLAlchemyError as e:
        await db.rollback()
        raise e


async def get_course(
    db: AsyncSession,
    course_id: str,
) -> Optional[dict]:
    result = await db.execute(
        select(Course).where(Course.course_id == course_id)
    )
    course = result.scalar_one_or_none()
    return course.data if course else None


async def list_courses(
    db: AsyncSession,
) -> List[dict]:
    result = await db.execute(
        select(Course).order_by(Course.created_at.desc())
    )
    rows = result.scalars().all()

    return [
        {
            "course_id": c.course_id,
            "course_title": c.course_title,
            "subject_domain": c.subject_domain,
            "skill_level": c.skill_level,
            "skill_label": c.skill_label,
            "total_modules": c.total_modules,
            "total_submodules": c.total_submodules,
            "total_slides": c.total_slides,
            "total_refs": c.total_refs,
            "total_images": c.total_images,
            "total_videos": c.total_videos,
            "created_at": c.created_at.isoformat()
            if c.created_at
            else None,
        }
        for c in rows
    ]


async def store_submodule(
    db: AsyncSession,
    course_id: str,
    module_id: str,
    submodule_id: str,
    data: dict,
) -> None:
    row_id = f"{course_id}::{module_id}::{submodule_id}"

    try:
        result = await db.execute(
            select(Submodule).where(Submodule.id == row_id)
        )
        sub = result.scalar_one_or_none()

        if not sub:
            sub = Submodule(id=row_id, course_id=course_id)
            db.add(sub)

        sub.module_id = module_id
        sub.submodule_id = submodule_id
        sub.title = data.get("title", "")
        sub.skill_level = data.get("skill_level", 3)
        sub.content = data.get("content", "")
        sub.slides = data.get("slides", [])
        sub.images = data.get("images", [])
        sub.keywords = data.get("keywords", [])
        sub.refs_count = data.get("refs_count", 0)

        await db.commit()

    except SQLAlchemyError as e:
        await db.rollback()
        raise e