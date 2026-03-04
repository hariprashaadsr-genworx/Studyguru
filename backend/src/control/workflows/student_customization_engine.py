"""
student_customization_engine.py — LangGraph workflow for customizing course content.

Flow:
  1. extract_selected_content → Pull selected modules/submodules from base course
  2. customize_content → Rewrite content with user preferences (tone, easiness, analogies)
  3. assemble_custom_course → Package everything into final custom course structure
"""
import uuid
import json
from typing import TypedDict, List, Optional

from langgraph.graph import StateGraph, END
from langchain_core.runnables import RunnableConfig

from src.control.agents.agent import _llm
from src.data.repositories.crud import get_course
from src.data.repositories.custom_crud import save_custom_course


# ── State ────────────────────────────────────────────────────────────────────

class CustomizationState(TypedDict):
    # Input
    user_id: str
    base_course_id: str
    custom_course_id: str
    selected_modules: List[dict]   # [{"module_id":..., "submodule_ids":[...]}]
    course_mode: str               # "base" or "custom"

    # Customization prefs
    tone: str                      # formal, friendly, casual
    easiness_level: int            # 1-5
    use_analogies: str             # yes / no
    analogy_style: str             # everyday, technical, creative

    # Intermediate
    base_course_data: Optional[dict]
    extracted_modules: List[dict]

    # Output
    custom_course_data: Optional[dict]
    status: str
    progress_log: List[str]
    error: Optional[str]


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _log(state: CustomizationState, msg: str):
    state["progress_log"].append(msg)
    print(f"[CUSTOM-WF] {msg}")


# ── Node 1: Extract selected content ────────────────────────────────────────

async def extract_selected_content(state: CustomizationState, config: RunnableConfig) -> CustomizationState:
    db = config["configurable"]["db"]

    await _log(state, "📋 Extracting selected modules from base course…")
    state["status"] = "extracting"

    base_data = await get_course(db, state["base_course_id"])
    if not base_data:
        state["error"] = "Base course not found"
        state["status"] = "error"
        return state

    state["base_course_data"] = base_data

    # Build a lookup of selected submodule IDs per module
    sel_lookup = {}
    for sel in state["selected_modules"]:
        sel_lookup[sel["module_id"]] = set(sel.get("submodule_ids", []))

    extracted = []
    for mod in base_data.get("modules", []):
        mid = mod.get("module_id", "")
        if mid not in sel_lookup:
            continue

        selected_sub_ids = sel_lookup[mid]
        filtered_subs = []
        for sub in mod.get("submodules", []):
            sid = sub.get("submodule_id", "")
            if sid in selected_sub_ids:
                filtered_subs.append(sub)

        if filtered_subs:
            extracted.append({
                **mod,
                "submodules": filtered_subs,
            })

    state["extracted_modules"] = extracted
    total_subs = sum(len(m["submodules"]) for m in extracted)
    await _log(state, f"  → {len(extracted)} modules, {total_subs} submodules extracted")
    return state


# ── Node 2: Customize content ───────────────────────────────────────────────

def _build_customization_prompt(tone, easiness, use_analogies, analogy_style, sub_title, content, subject_domain):
    """Build a prompt to rewrite content with user preferences."""
    tone_map = {
        "formal": "Use a formal, academic tone. Be precise and professional.",
        "friendly": "Use a warm, friendly, encouraging tone. Be conversational but informative.",
        "casual": "Use a relaxed, casual tone. Think of explaining to a friend over coffee.",
    }
    ease_map = {
        1: "Explain as if to an absolute beginner. Use the simplest words possible. Short sentences. Define everything.",
        2: "Explain simply. Use mostly plain language with occasional technical terms defined inline.",
        3: "Standard academic level. Technical terms with definitions on first use.",
        4: "Advanced level. Assume good foundational knowledge. Technical terms used freely.",
        5: "Expert level. Dense, precise prose. Graduate-level background assumed.",
    }
    analogy_instruction = ""
    if use_analogies == "yes":
        analogy_map = {
            "everyday": "Include 2–3 vivid, relatable everyday analogies (food, sports, daily life) that make concepts crystal clear and memorable.",
            "technical": "Include 1–2 analogies drawn from related technical/scientific domains to bridge understanding.",
            "creative": "Include 2–3 creative, imaginative analogies (stories, adventures, thought experiments) that make learning fun and memorable.",
        }
        analogy_instruction = analogy_map.get(analogy_style, analogy_map["everyday"])

    return f"""You are rewriting educational course content with specific customization preferences.

Topic: {sub_title}
Subject Domain: {subject_domain}

CUSTOMIZATION RULES:
• Tone: {tone_map.get(tone, tone_map['friendly'])}
• Difficulty: {ease_map.get(easiness, ease_map[3])}
{f'• Analogies: {analogy_instruction}' if analogy_instruction else '• Analogies: Do NOT include any analogies.'}

ORIGINAL CONTENT:
{content}

REWRITE RULES:
1. Keep ALL factual information, examples, and key concepts from the original
2. Preserve any image markdown (![...](...)) exactly as-is
3. Preserve any LaTeX math ($...$ or $$...$$) exactly as-is, but adjust surrounding explanation per difficulty level
4. Restructure the explanation according to tone and difficulty preferences
5. Keep the same slide structure (separated by ---SLIDE---)
6. Maintain section headers (## ...)
7. If analogies are requested, weave them naturally into the explanation
8. Keep blockquotes (> **Question:** ...) at the end
9. Output clean markdown only — no meta-commentary

Rewrite the content now:"""


async def customize_content(state: CustomizationState, config: RunnableConfig) -> CustomizationState:
    if state.get("error"):
        return state

    # If mode is "base", skip customization entirely
    if state["course_mode"] == "base":
        await _log(state, "📖 Base mode selected — using original content as-is")
        state["status"] = "assembled"
        return state

    await _log(state, "✨ Customizing content with your preferences…")
    state["status"] = "customizing"

    subject_domain = state["base_course_data"].get("subject_domain", "")
    total = sum(len(m["submodules"]) for m in state["extracted_modules"])
    done = 0

    for mod in state["extracted_modules"]:
        for sub in mod["submodules"]:
            done += 1
            await _log(state, f"  ✍ [{done}/{total}] Customizing: {sub.get('title', '')}")

            original_content = sub.get("content", "")
            if not original_content:
                continue

            prompt = _build_customization_prompt(
                tone=state["tone"],
                easiness=state["easiness_level"],
                use_analogies=state["use_analogies"],
                analogy_style=state["analogy_style"],
                sub_title=sub.get("title", ""),
                content=original_content,
                subject_domain=subject_domain,
            )

            try:
                customized = await _llm(
                    system=f"Expert educational content rewriter. Subject: {subject_domain}. Output clean markdown only.",
                    user=prompt,
                )
                sub["content"] = customized

                # Re-parse slides from customized content
                slides = _parse_slides_simple(customized)
                sub["slides"] = slides

            except Exception as e:
                await _log(state, f"  ⚠ Error customizing {sub.get('title', '')}: {e}")
                # Keep original content on error

    await _log(state, f"  → {done} submodules customized")
    return state


def _parse_slides_simple(content: str) -> list:
    """Split content by ---SLIDE--- markers and extract title + body."""
    import re
    raw_slides = re.split(r'---SLIDE---', content)
    slides = []
    for raw in raw_slides:
        raw = raw.strip()
        if not raw:
            continue
        title_match = re.match(r'^##\s+(.+)', raw)
        title = title_match.group(1).strip() if title_match else "Section"
        body = raw[title_match.end():].strip() if title_match else raw
        slides.append({"title": title, "content": body})
    return slides if slides else [{"title": "Content", "content": content}]


# ── Node 3: Assemble custom course ──────────────────────────────────────────

async def assemble_custom_course(state: CustomizationState, config: RunnableConfig) -> CustomizationState:
    if state.get("error"):
        return state

    db = config["configurable"]["db"]

    await _log(state, "📦 Assembling custom course…")
    state["status"] = "assembling"

    base = state["base_course_data"]
    modules = state["extracted_modules"]

    total_subs = sum(len(m["submodules"]) for m in modules)
    total_slides = sum(
        sum(len(s.get("slides", [])) for s in m["submodules"])
        for m in modules
    )
    total_refs = sum(len(m.get("references", [])) for m in modules)
    total_videos = sum(len(m.get("youtube_videos", [])) for m in modules)

    course_data = {
        "custom_course_id": state["custom_course_id"],
        "base_course_id": state["base_course_id"],
        "course_title": base.get("course_title", ""),
        "subject_domain": base.get("subject_domain", ""),
        "skill_level": base.get("skill_level", 3),
        "skill_label": base.get("skill_label", ""),
        "course_mode": state["course_mode"],
        "tone": state["tone"],
        "easiness_level": state["easiness_level"],
        "use_analogies": state["use_analogies"],
        "analogy_style": state["analogy_style"],
        "total_modules": len(modules),
        "total_submodules": total_subs,
        "total_slides": total_slides,
        "total_refs": total_refs,
        "total_videos": total_videos,
        "modules": modules,
    }

    # Save to DB
    await save_custom_course(
        db=db,
        custom_course_id=state["custom_course_id"],
        user_id=state["user_id"],
        base_course_id=state["base_course_id"],
        course_title=base.get("course_title", ""),
        subject_domain=base.get("subject_domain", ""),
        tone=state["tone"],
        easiness_level=state["easiness_level"],
        use_analogies=state["use_analogies"],
        analogy_style=state["analogy_style"],
        course_mode=state["course_mode"],
        selected_modules=state["selected_modules"],
        data=course_data,
    )

    state["custom_course_data"] = course_data
    state["status"] = "complete"

    await _log(state, f"✅ Custom course saved! {len(modules)} modules · {total_subs} submodules · {total_slides} slides")
    return state


# ── Build LangGraph workflow ─────────────────────────────────────────────────

def _build_customization_workflow():
    g = StateGraph(CustomizationState)

    g.add_node("extract", extract_selected_content)
    g.add_node("customize", customize_content)
    g.add_node("assemble", assemble_custom_course)

    g.set_entry_point("extract")
    g.add_edge("extract", "customize")
    g.add_edge("customize", "assemble")
    g.add_edge("assemble", END)

    return g.compile()


customization_workflow = _build_customization_workflow()


async def run_customization_workflow(
    user_id: str,
    base_course_id: str,
    selected_modules: list,
    course_mode: str,
    tone: str,
    easiness_level: int,
    use_analogies: str,
    analogy_style: str,
    db,
) -> CustomizationState:
    """Run the customization workflow and return the result state."""

    custom_id = str(uuid.uuid4())

    initial: CustomizationState = {
        "user_id": user_id,
        "base_course_id": base_course_id,
        "custom_course_id": custom_id,
        "selected_modules": selected_modules,
        "course_mode": course_mode,
        "tone": tone,
        "easiness_level": max(1, min(5, easiness_level)),
        "use_analogies": use_analogies,
        "analogy_style": analogy_style,
        "base_course_data": None,
        "extracted_modules": [],
        "custom_course_data": None,
        "status": "starting",
        "progress_log": [],
        "error": None,
    }

    total_selected = sum(len(s.get("submodule_ids", [])) for s in selected_modules)
    rec_limit = max(50, total_selected * 5 + 20)

    result = await customization_workflow.ainvoke(
        initial,
        config={
            "recursion_limit": rec_limit,
            "configurable": {"db": db},
        },
    )

    return result
