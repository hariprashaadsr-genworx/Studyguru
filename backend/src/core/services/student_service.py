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
from json_repair import repair_json

from src.data.repositories.crud import list_courses, get_course
from src.data.repositories.custom_crud import (
    get_custom_courses_for_user,
    get_custom_course,
)
from src.data.repositories.enrollment_crud import (
    create_enrollment,
    get_enrollment,
    get_enrollments_for_user,
    get_enrollment_for_course,
    update_enrollment_progress,
    complete_enrollment,
    get_questions_for_module,
    get_final_questions,
    save_questions,
)
from src.data.clients.postgresql_client import SessionLocal
from src.control.workflows.student_customization_engine import run_customization_workflow
from src.control.agents.agent import _llm
import src.control.prompts as P


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


# ══════════════════════════════════════════════════════════════════════════════
# Enrollment + Progress + Questions
# ══════════════════════════════════════════════════════════════════════════════

async def enroll_student(user_id: str, course_id: str, selected_modules: list, db: AsyncSession):
    """Create or return existing enrollment. Kicks off background question generation."""
    existing = await get_enrollment_for_course(db, user_id, course_id)
    if existing:
        return JSONResponse({
            "enrollment_id": existing.enrollment_id,
            "already_enrolled": True,
        })

    enrollment_id = str(uuid.uuid4())
    await create_enrollment(db, enrollment_id, user_id, course_id, selected_modules)

    # Launch background question generation
    asyncio.create_task(_generate_all_questions_worker(enrollment_id, course_id, selected_modules))

    return JSONResponse({
        "enrollment_id": enrollment_id,
        "already_enrolled": False,
    })


async def _generate_all_questions_worker(enrollment_id: str, course_id: str, selected_modules: list):
    """Background worker: generate module quizzes + final assessment per enrollment."""
    try:
        async with SessionLocal() as db:
            course_data = await get_course(db, course_id)
            if not course_data:
                return

            selected_module_ids = [m["module_id"] for m in selected_modules]

            # Generate per-enrollment module questions in parallel
            tasks = []
            for mid in selected_module_ids:
                tasks.append(_generate_questions_for_module(course_id, mid, course_data, db, enrollment_id=enrollment_id))

            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)

            # Generate per-enrollment final assessment
            await _generate_final_questions(course_id, course_data, db, enrollment_id=enrollment_id)

            # Mark questions as ready in enrollment progress
            enrollment = await get_enrollment(db, enrollment_id)
            if enrollment:
                progress = enrollment.progress or {"visited": [], "module_tests_passed": [], "final_passed": False}
                progress["questions_ready"] = True
                await update_enrollment_progress(db, enrollment_id, progress)
    except Exception as e:
        traceback.print_exc()
        # Even on error, mark as ready so UI doesn't hang forever
        try:
            async with SessionLocal() as db:
                enrollment = await get_enrollment(db, enrollment_id)
                if enrollment:
                    progress = enrollment.progress or {"visited": [], "module_tests_passed": [], "final_passed": False}
                    progress["questions_ready"] = True
                    await update_enrollment_progress(db, enrollment_id, progress)
        except Exception:
            pass


async def get_student_enrollments(user_id: str, db: AsyncSession):
    """List all enrollments for a user, enriched with course metadata."""
    enrollments = await get_enrollments_for_user(db, user_id)

    enriched = []
    for e in enrollments:
        course = await get_course(db, e["course_id"])
        enriched.append({
            **e,
            "course_title": course.get("course_title", "") if course else "",
            "subject_domain": course.get("subject_domain", "") if course else "",
            "skill_level": course.get("skill_level", 3) if course else 3,
            "skill_label": course.get("skill_label", "") if course else "",
            "total_modules": course.get("total_modules", 0) if course else 0,
            "total_submodules": course.get("total_submodules", 0) if course else 0,
        })

    return JSONResponse(enriched)


async def get_enrollment_data(enrollment_id: str, db: AsyncSession):
    """Get enrollment + filtered course data."""
    enrollment = await get_enrollment(db, enrollment_id)
    if not enrollment:
        raise HTTPException(404, "Enrollment not found")

    course = await get_course(db, enrollment.course_id)
    if not course:
        raise HTTPException(404, "Course not found")

    # Filter modules/submodules based on enrollment selection
    sel_lookup = {}
    for sel in (enrollment.selected_modules or []):
        sel_lookup[sel["module_id"]] = set(sel.get("submodule_ids", []))

    filtered_modules = []
    for mod in course.get("modules", []):
        mid = mod.get("module_id", "")
        if mid not in sel_lookup:
            continue
        selected_sub_ids = sel_lookup[mid]
        filtered_subs = [
            sub for sub in mod.get("submodules", [])
            if sub.get("submodule_id", "") in selected_sub_ids
        ]
        if filtered_subs:
            filtered_modules.append({**mod, "submodules": filtered_subs})

    progress = enrollment.progress or {"visited": [], "module_tests_passed": [], "final_passed": False}

    return JSONResponse({
        "enrollment_id": enrollment.enrollment_id,
        "course_id": enrollment.course_id,
        "user_id": enrollment.user_id,
        "status": enrollment.status,
        "selected_modules": enrollment.selected_modules,
        "progress": progress,
        "course_title": course.get("course_title", ""),
        "subject_domain": course.get("subject_domain", ""),
        "skill_level": course.get("skill_level", 3),
        "skill_label": course.get("skill_label", ""),
        "modules": filtered_modules,
    })


async def mark_submodule_visited(enrollment_id: str, submodule_key: str, db: AsyncSession):
    """Mark a submodule as visited in the enrollment progress."""
    enrollment = await get_enrollment(db, enrollment_id)
    if not enrollment:
        raise HTTPException(404, "Enrollment not found")

    progress = enrollment.progress or {"visited": [], "module_tests_passed": [], "final_passed": False}
    visited = progress.get("visited", [])

    if submodule_key not in visited:
        visited.append(submodule_key)
        progress["visited"] = visited
        await update_enrollment_progress(db, enrollment_id, progress)

    return JSONResponse({"ok": True, "progress": progress})


async def _generate_questions_for_module(course_id: str, module_id: str, course_data: dict, db: AsyncSession, enrollment_id: str = None):
    """Generate and cache 5 questions for a module, optionally per-enrollment."""
    # Find the module in course data
    target_mod = None
    for mod in course_data.get("modules", []):
        if mod.get("module_id") == module_id:
            target_mod = mod
            break

    if not target_mod:
        return []

    submodule_titles = [s.get("title", "") for s in target_mod.get("submodules", [])]

    prompt = P.module_questions_prompt(
        course_title=course_data.get("course_title", ""),
        module_title=target_mod.get("title", ""),
        submodule_titles=submodule_titles,
        skill_level=course_data.get("skill_level", 3),
    )

    raw = await _llm(
        system="Expert quiz generator. Return ONLY valid JSON array. No markdown fences.",
        user=prompt,
    )

    raw = raw.strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    cleaned = repair_json(raw)
    questions_data = json.loads(cleaned)

    # Ensure it's a list and has max 5
    if not isinstance(questions_data, list):
        questions_data = [questions_data]
    questions_data = questions_data[:5]

    # Save to DB
    to_save = []
    for q in questions_data:
        to_save.append({
            "course_id": course_id,
            "enrollment_id": enrollment_id,
            "module_id": module_id,
            "question_type": q.get("question_type", "mcq"),
            "question_text": q.get("question_text", ""),
            "options": q.get("options", []),
            "correct_answer": q.get("correct_answer", ""),
            "hints": q.get("hints", ["", "", ""]),
            "is_final": False,
        })

    await save_questions(db, to_save)
    return to_save


async def _generate_final_questions(course_id: str, course_data: dict, db: AsyncSession, enrollment_id: str = None):
    """Generate and cache 15 final assessment questions, optionally per-enrollment."""
    module_summaries = []
    for mod in course_data.get("modules", []):
        module_summaries.append({
            "title": mod.get("title", ""),
            "submodule_titles": [s.get("title", "") for s in mod.get("submodules", [])],
        })

    prompt = P.final_assessment_prompt(
        course_title=course_data.get("course_title", ""),
        module_summaries=module_summaries,
        skill_level=course_data.get("skill_level", 3),
    )

    raw = await _llm(
        system="Expert quiz generator. Return ONLY valid JSON array. No markdown fences.",
        user=prompt,
    )

    raw = raw.strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    cleaned = repair_json(raw)
    questions_data = json.loads(cleaned)

    if not isinstance(questions_data, list):
        questions_data = [questions_data]
    questions_data = questions_data[:15]

    to_save = []
    for q in questions_data:
        to_save.append({
            "course_id": course_id,
            "enrollment_id": enrollment_id,
            "module_id": None,
            "question_type": q.get("question_type", "mcq"),
            "question_text": q.get("question_text", ""),
            "options": q.get("options", []),
            "correct_answer": q.get("correct_answer", ""),
            "hints": q.get("hints", ["", "", ""]),
            "is_final": True,
        })

    await save_questions(db, to_save)
    return to_save


async def get_or_generate_module_questions(enrollment_id: str, module_id: str, db: AsyncSession):
    """Get cached questions or generate new ones for a module (per-enrollment)."""
    enrollment = await get_enrollment(db, enrollment_id)
    if not enrollment:
        raise HTTPException(404, "Enrollment not found")

    # Check per-enrollment cache first
    existing = await get_questions_for_module(db, enrollment.course_id, module_id, enrollment_id=enrollment_id)
    if existing:
        return JSONResponse(existing)

    # Fallback to shared cache (legacy)
    existing_shared = await get_questions_for_module(db, enrollment.course_id, module_id)
    if existing_shared:
        return JSONResponse(existing_shared)

    # Generate new questions
    course_data = await get_course(db, enrollment.course_id)
    if not course_data:
        raise HTTPException(404, "Course not found")

    questions = await _generate_questions_for_module(enrollment.course_id, module_id, course_data, db, enrollment_id=enrollment_id)

    return JSONResponse([
        {
            "question_type": q["question_type"],
            "question_text": q["question_text"],
            "options": q["options"],
            "correct_answer": q["correct_answer"],
            "hints": q["hints"],
        }
        for q in questions
    ])


async def get_or_generate_final_questions(enrollment_id: str, db: AsyncSession):
    """Get cached final questions or generate new ones (per-enrollment)."""
    enrollment = await get_enrollment(db, enrollment_id)
    if not enrollment:
        raise HTTPException(404, "Enrollment not found")

    # Check per-enrollment cache first
    existing = await get_final_questions(db, enrollment.course_id, enrollment_id=enrollment_id)
    if existing:
        return JSONResponse(existing)

    # Fallback to shared cache (legacy)
    existing_shared = await get_final_questions(db, enrollment.course_id)
    if existing_shared:
        return JSONResponse(existing_shared)

    course_data = await get_course(db, enrollment.course_id)
    if not course_data:
        raise HTTPException(404, "Course not found")

    questions = await _generate_final_questions(enrollment.course_id, course_data, db, enrollment_id=enrollment_id)

    return JSONResponse([
        {
            "question_type": q["question_type"],
            "question_text": q["question_text"],
            "options": q["options"],
            "correct_answer": q["correct_answer"],
            "hints": q["hints"],
        }
        for q in questions
    ])


async def submit_module_test_service(enrollment_id: str, module_id: str, score: int, total: int, answers: dict, db: AsyncSession):
    """Record module test result. Pass = score >= 60%."""
    enrollment = await get_enrollment(db, enrollment_id)
    if not enrollment:
        raise HTTPException(404, "Enrollment not found")

    progress = enrollment.progress or {"visited": [], "module_tests_passed": [], "final_passed": False}
    passed = score >= (total * 0.6)  # 60% pass threshold

    if passed and module_id not in progress.get("module_tests_passed", []):
        progress.setdefault("module_tests_passed", []).append(module_id)

    # Store test results (answers per question)
    test_results = progress.get("test_results", {})
    test_results[module_id] = {"score": score, "total": total, "passed": passed, "answers": answers}
    progress["test_results"] = test_results

    # Track attempts history
    test_attempts = progress.get("test_attempts", {})
    existing_attempts = test_attempts.get(module_id, [])
    existing_attempts.append({"score": score, "total": total, "passed": passed})
    test_attempts[module_id] = existing_attempts
    progress["test_attempts"] = test_attempts

    await update_enrollment_progress(db, enrollment_id, progress)

    return JSONResponse({
        "passed": passed,
        "score": score,
        "total": total,
        "progress": progress,
    })


async def submit_final_test_service(enrollment_id: str, score: int, total: int, answers: dict, db: AsyncSession):
    """Record final assessment result."""
    enrollment = await get_enrollment(db, enrollment_id)
    if not enrollment:
        raise HTTPException(404, "Enrollment not found")

    progress = enrollment.progress or {"visited": [], "module_tests_passed": [], "final_passed": False}
    passed = score >= (total * 0.6)

    if passed:
        progress["final_passed"] = True

    # Store test results
    test_results = progress.get("test_results", {})
    test_results["final"] = {"score": score, "total": total, "passed": passed, "answers": answers}
    progress["test_results"] = test_results

    # Track attempts history
    test_attempts = progress.get("test_attempts", {})
    existing_attempts = test_attempts.get("final", [])
    existing_attempts.append({"score": score, "total": total, "passed": passed})
    test_attempts["final"] = existing_attempts
    progress["test_attempts"] = test_attempts

    await update_enrollment_progress(db, enrollment_id, progress)

    return JSONResponse({
        "passed": passed,
        "score": score,
        "total": total,
        "progress": progress,
    })


async def complete_enrollment_service(enrollment_id: str, db: AsyncSession):
    """Mark enrollment as completed (Done button)."""
    enrollment = await get_enrollment(db, enrollment_id)
    if not enrollment:
        raise HTTPException(404, "Enrollment not found")

    await complete_enrollment(db, enrollment_id)
    return JSONResponse({"ok": True, "status": "completed"})
