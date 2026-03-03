from typing import Optional, List
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError
from src.data.models.postgres.course import Course
from src.data.models.postgres.submodules import Module, Submodule, Slide, Video, Reference


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


async def store_modules(
    db: AsyncSession,
    course_id: str,
    modules: list,
) -> None:
    """Store module rows for a course (upsert by composite key)."""
    try:
        for m in modules:
            row_id = f"{course_id}::{m['module_id']}"
            result = await db.execute(
                select(Module).where(Module.module_id == row_id)
            )
            mod = result.scalar_one_or_none()
            if not mod:
                db.add(Module(
                    module_id=row_id,
                    course_id=course_id,
                    title=m["title"],
                ))
            else:
                mod.title = m["title"]
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
    mod_row_id = f"{course_id}::{module_id}"

    try:
        result = await db.execute(
            select(Submodule).where(Submodule.submodule_id == row_id)
        )
        sub = result.scalar_one_or_none()

        if not sub:
            sub = Submodule(
                submodule_id=row_id,
                module_id=mod_row_id,
                course_id=course_id,
            )
            db.add(sub)

        sub.title = data.get("title", "")
        sub.skill_level = data.get("skill_level", 3)
        sub.content = data.get("content", "")

        # Store slides in the slides table
        await db.execute(
            delete(Slide).where(Slide.submodule_id == row_id)
        )
        for slide_data in data.get("slides", []):
            db.add(Slide(
                submodule_id=row_id,
                slide_content=slide_data,
            ))

        await db.commit()

    except SQLAlchemyError as e:
        await db.rollback()
        raise e


async def store_videos(
    db: AsyncSession,
    course_id: str,
    module_id: str,
    videos: list,
) -> None:
    """Store YouTube videos for a module."""
    mod_row_id = f"{course_id}::{module_id}"
    try:
        await db.execute(
            delete(Video).where(Video.module_id == mod_row_id)
        )
        for v in videos:
            url = v.get("url", "")
            if url:
                db.add(Video(module_id=mod_row_id, youtube_url=url))
        await db.commit()
    except SQLAlchemyError as e:
        await db.rollback()
        raise e


async def store_references(
    db: AsyncSession,
    course_id: str,
    module_id: str,
    references: list,
) -> None:
    """Store references for a module."""
    mod_row_id = f"{course_id}::{module_id}"
    try:
        await db.execute(
            delete(Reference).where(Reference.module_id == mod_row_id)
        )
        for ref in references:
            link = ref.get("url", "")
            if link:
                db.add(Reference(module_id=mod_row_id, ref_link=link))
        await db.commit()
    except SQLAlchemyError as e:
        await db.rollback()
        raise e