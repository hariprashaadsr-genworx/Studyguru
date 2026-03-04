import os
import re
from typing import List
import src.control.prompts as P
from src.schemas.generation import CourseState


async def _mod(state: CourseState):
    return state["modules"][state["cur_mod_idx"]]


async def _sub(state: CourseState):
    mod = await _mod(state)
    return mod["submodules"][state["cur_sub_idx"]]


async def _prof(state: CourseState):
    return P.SKILL_PROFILES[state["skill_level"]]


async def _strip_json(text: str) -> str:
    """Remove markdown fences if present."""
    text = text.strip()

    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) > 1:
            text = parts[1]
            if text.startswith("json"):
                text = text[4:]

    return text.strip()


async def _parse_slides(raw: str) -> List[dict]:
    """Split ---SLIDE--- delimited content into slide objects."""
    parts = re.split(r"\n?---SLIDE---\n?", raw.strip())
    slides = []

    for part in parts:
        part = part.strip()
        if not part:
            continue

        match = re.match(r"^#{1,3}\s+(.+)", part)
        title = match.group(1).strip() if match else "Section"

        body = re.sub(r"^#{1,3}\s+.+\n?", "", part, count=1).strip()

        slides.append({
            "title": title,
            "content": body,
            "has_image": bool(re.search(r"!\[.+?\]\(.+?\)", body)),
        })

    return slides or [{
        "title": "Content",
        "content": raw,
        "has_image": False,
    }]