import os
import asyncio
from pathlib import Path
from datetime import datetime, timezone

_locks: dict[str, asyncio.Lock] = {}

LOG_DIR = Path(os.getenv("LOG_DIR", "logs"))
LOG_DIR.mkdir(exist_ok=True)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def _path(job_id: str) -> Path:
    return LOG_DIR / f"{job_id}.txt"


async def _write(job_id: str, text: str):

    if job_id not in _locks:
        _locks[job_id] = asyncio.Lock()

    async with _locks[job_id]:
        await asyncio.to_thread(_append_file, job_id, text)


def _append_file(job_id: str, text: str):
    with open(_path(job_id), "a", encoding="utf-8") as f:
        f.write(text + "\n")


async def init(job_id: str, course_title: str, skill_label: str, n_modules: int):
    header = f"""{'='*70}
  COURSE ENGINE — GENERATION LOG
  Job     : {job_id}
  Course  : {course_title}
  Level   : {skill_label}
  Modules : {n_modules}
  Started : {_now()}
{'='*70}
"""
    await _write(job_id, header)


async def step(job_id: str, num: int, label: str, detail: str = ""):
    line = f"\n[STEP {num:02d}] {label}"
    if detail:
        line += f"\n         {detail}"
    line += f"\n         {_now()}"
    await _write(job_id, line)


async def error(job_id: str, msg: str):
    await _write(job_id, f"\n[ERROR] {msg}\n        {_now()}")


async def done(job_id: str, stats: dict):
    footer = f"""
{'='*70}
  COMPLETE  {_now()}
  Modules   : {stats.get('modules', 0)}
  Submodules: {stats.get('submodules', 0)}
  Slides    : {stats.get('slides', 0)}
  References: {stats.get('refs', 0)}
  Videos    : {stats.get('videos', 0)}
  Backend   : {stats.get('backend', '?')}
{'='*70}
"""
    await _write(job_id, footer)


def get_path(job_id: str) -> Path:
    return _path(job_id)