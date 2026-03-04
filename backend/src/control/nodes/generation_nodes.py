"""
workflow.py — AI Course Content Engine v1

Pipeline (15 steps + YouTube):
  1  Admin Input Collection       → preprocessor
  2  Orchestrator Init            → preprocessor
  3  Planning Agent               → planning_agent
  4  Module Loop Start            → (conditional edge)
  5  Submodule Loop Start         → (conditional edge)
  6  Tavily Search                → tavily_search
  7  Reference Evaluator          → reference_evaluator
  8  Context Builder              → context_builder
  9a Image Retrieval              → image_retrieval
  9b Grok Vision (validate+explain) → image_validator
  10 Content Writer               → content_writer
  11 Store Submodule (PostgreSQL) → store_submodule_node
  12 Submodule Loop Check         → advance_submodule
  13 Attach Module References     → attach_module_refs
  13b YouTube Video Search        → fetch_module_videos
  14 Module Loop Check            → advance_module
  15 Final Course Assembly        → compile_course
"""

from curses import raw
import os
import re
import json
import uuid
from typing import TypedDict, List, Optional
from json_repair import repair_json


from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from tavily import TavilyClient
from langgraph.graph import StateGraph, END

from src.control.agents.agent import _tavily, _llm
import src.observability.logging as LOG
import src.control.prompts as P
from src.schemas.generation import CourseState
from src.utils.generation_engine import _mod, _sub, _prof, _strip_json, _parse_slides
import asyncio
from langchain_core.runnables import RunnableConfig
from src.data.repositories.crud import ensure_course_row, store_course, store_submodule, store_modules, store_videos, store_references
from src.constants.base import AUTHORITY, JUNK, GOOD_DOMAINS
from langchain_core.output_parsers import PydanticOutputParser
from src.schemas.generation import CourseStructure
from src.config.settings import settings

# ── LLM + Tavily ──────────────────────────────────────────────────────────────

tavily = _tavily()

async def _log(state: CourseState, msg: str) -> None:
    state["progress_log"].append(msg)
    print(f"[WF] {msg}")


parser = PydanticOutputParser(pydantic_object=CourseStructure)


async def generate_course_structure(syllabus: str) -> dict:
    """
    Generate structured course JSON from syllabus string.
    """

    prompt = f"""
You are an experienced instructional designer and curriculum architect who specializes in creating clear, logical, progressive university-level and professional courses.

Task:
Convert the provided raw syllabus (or topic list) into a well-structured, modular online/in-person course in JSON format.

Requirements:
• Create 4–8 modules (choose based on content natural size — aim for good balance)
• Each module must represent a coherent major theme or progression stage
• Modules should follow pedagogical progression: foundational → core concepts → advanced/application → synthesis/integration
• Every module must contain 3–7 submodules (lessons/topics)
• Use academic, concise, professional titles (avoid casual phrasing)
• Learning should feel incremental and cumulative
• Include brief but meaningful descriptions (1–2 sentences) for each module and submodule
• Use clear module_id and submodule_id pattern: M1, M2, … and M1.1, M1.2, M2.1, etc.
• Do NOT include duration, assessments, learning objectives, or resources unless they already appear in the input syllabus
• Output ONLY valid JSON — no explanations, no markdown, no preamble, no trailing commas

** OUTPUT MUST HAVE course_title, course_description, and a modules list with module_id, title, description, and submodules (with submodule_id, title, description).

Output schema you must follow exactly:

```json
{{
  "course_title": "Concise Academic Course Title",
  "course_description": "One-paragraph high-level overview of the whole course",
  "modules": [
    {{
      "module_id": "M1",
      "title": "Module Title",
      "description": "1–2 sentence description of the module purpose and scope",
      "submodules": [
        {{
          "submodule_id": "M1.1",
          "title": "Clear, concise lesson/topic title",
          "description": "1–2 sentence explanation what this session covers"
        }},
        {{
          "submodule_id": "M1.2",
          ...
        }}
      ]
    }},
    ...
  ]
}}
"""

    response = await _llm(system=prompt, user=syllabus)

    parsed = parser.parse(response)

    return parsed.dict()


# ══════════════════════════════════════════════════════════════════════════════
# STEP 1 + 2 — Preprocessor (LangGraph Node)
# ══════════════════════════════════════════════════════════════════════════════

async def preprocessor(state: CourseState, config: RunnableConfig) -> CourseState:
    db = config["configurable"]["db"]
    sk = state["skill_level"]
    prof = P.SKILL_PROFILES[sk]

    await _log(
        state,
        f"[STEP 1] Input: '{state['course_title']}' — "
        f"Level {sk}/5 {prof['label']}"
    )

    await LOG.init(
        state["job_id"],
        state["course_title"],
        prof["label"],
        len(state["modules"])
    )

    normalised = []

    for m in state["modules"]:
        subs = []

        for idx, s in enumerate(m["submodules"], start=1):
            subs.append({
                "submodule_id": s.get(
                    "submodule_id",
                    f"{m['module_id']}.{idx}"
                ),
                "title": s["title"],
                "focus_plan": "",
                "keywords": [],
                "needs_analogy": False,
                "image_search_query": "",
                "sections": [],
                "content": "",
                "slides": [],
                "images": [],
                "stored": False,
            })

        normalised.append({
            "module_id": m["module_id"],
            "title": m["title"],
            "module_plan": "",
            "complexity": "medium",
            "youtube_query": "",
            "youtube_videos": [],
            "submodules": subs,
            "references": [],
        })

    state["modules"] = normalised
    state["cur_mod_idx"] = 0
    state["cur_sub_idx"] = 0
    state["used_urls"] = []
    state["covered"] = []
    state["raw_results"] = []
    state["eval_refs"] = []
    state["clean_context"] = ""
    state["cand_images"] = []
    state["cur_images"] = []
    state["subject_domain"] = ""

    total_subs = sum(len(m["submodules"]) for m in normalised)

    await _log(
        state,
        f"[STEP 2] Orchestrator: "
        f"{len(normalised)} modules · {total_subs} submodules"
    )

    # Ensure course row exists before submodules reference it
    await ensure_course_row(
        db,
        state["course_id"],
        state["course_title"],
        sk,
        prof["label"]
    )

    # Store module rows so submodule FKs can reference them
    await store_modules(db, state["course_id"], normalised)

    return state


# ══════════════════════════════════════════════════════════════════════════════
# STEP 3 — Planning Agent (LangGraph Node)
# ══════════════════════════════════════════════════════════════════════════════

async def planning_agent(state: CourseState, config: RunnableConfig) -> CourseState:
    sk = state["skill_level"]
    prof = P.SKILL_PROFILES[sk]

    await _log(
        state,
        f"🧠 [STEP 3] Planning Agent — {prof['label']} level…"
    )

    state["status"] = "planning"


    prompt = P.planning_prompt(
        state["course_title"],
        sk,
        prof,
        state["modules"],
    )

    raw = await _llm(
        system="Return ONLY valid JSON. No markdown fences. BE EXTRA CAREFUL IN HANDLING BACKSPACE CHARACTERS AND OTHER CHARACTERS THAT MAY CAUSE JSON PARSING ISSUES. DOUBLE QUOTES ON ALL KEYS AND CAREFUL WITH ESCAPE CHARACTERS",
        user=prompt,
    )

    clean = repair_json(raw)
    data = json.loads(clean)

    data = json.loads(await _strip_json(raw))

    # Persist subject domain
    state["subject_domain"] = data.get(
        "subject_domain",
        state["course_title"]
    )

    await _log(
        state,
        f"  → Subject domain: {state['subject_domain']}"
    )

    plan_by = {
        m["module_id"]: m
        for m in data.get("modules", [])
    }

    for mod in state["modules"]:
        pm = plan_by.get(mod["module_id"], {})

        mod["module_plan"] = pm.get("module_plan", "")
        mod["complexity"] = pm.get("complexity", "medium")
        mod["youtube_query"] = pm.get(
            "youtube_query",
            f"{mod['title']} tutorial"
        )

        sub_by = {
            s["submodule_id"]: s
            for s in pm.get("submodules", [])
        }

        for sub in mod["submodules"]:
            ps = sub_by.get(sub["submodule_id"], {})

            sub["focus_plan"] = ps.get("focus_plan", "")
            sub["keywords"] = ps.get(
                "keywords",
                [sub["title"]]
            )
            sub["needs_analogy"] = bool(
                ps.get("needs_analogy", False)
            )
            sub["image_search_query"] = ps.get(
                "image_search_query",
                f"{sub['title']} diagram"
            )
            sub["sections"] = ps.get("sections", [
                f"Introduction: {sub['title']}",
                "Core Concepts",
                "Step-by-Step Breakdown",
                f"Worked Example: {sub['title']}",
                "Check Your Understanding",
            ])

    total = sum(len(m["submodules"]) for m in state["modules"])

    await _log(
        state,
        f"[STEP 3] Plans set for "
        f"{len(state['modules'])} modules · {total} submodules"
    )

    await LOG.step(
        state["job_id"],
        3,
        "Planning Agent done",
        state["subject_domain"],
    )

    return state


# ══════════════════════════════════════════════════════════════════════════════
# STEP 6 — Tavily Search
# ══════════════════════════════════════════════════════════════════════════════

async def tavily_search(state: CourseState, config: RunnableConfig) -> CourseState:
    sub = await _sub(state)
    label = f"M{state['cur_mod_idx']+1}.S{state['cur_sub_idx']+1}"

    await _log(state, f"🔍 [STEP 6] Search — {label}: '{sub['title']}'")
    state["status"] = "searching"

    kws = sub.get("keywords", [])
    if len(kws) < 2:
        kws = kws + [sub["title"]]

    queries = [
        f"{kws[0]} {kws[1]} {state['subject_domain']}",
        f"{sub['title']} {' '.join(kws[2:])}".strip(),
    ]

    results = []

    for q in queries:
        try:
            # Tavily is sync → move to thread pool
            r = await asyncio.to_thread(
                tavily.search,
                query=q,
                max_results=5,
                include_answer=False,
                include_raw_content=False,
            )
            results.extend(r.get("results", []))
        except Exception as e:
            await _log(state, f"  ⚠ Search error: {e}")

    state["raw_results"] = [
        {
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "content": r.get("content", "")[:600],
            "score": float(r.get("score", 0.5)),
        }
        for r in results
    ]

    await _log(state, f"  → {len(state['raw_results'])} results")

    await LOG.step(
        state["job_id"],
        6,
        f"Search: {label}",
        f"{len(state['raw_results'])} results",
    )

    return state


# ══════════════════════════════════════════════════════════════════════════════
# STEP 7 — Reference Evaluator
# ══════════════════════════════════════════════════════════════════════════════




async def reference_evaluator(state: CourseState, config: RunnableConfig) -> CourseState:
    sub = await _sub(state)

    await _log(state, "⚖️  [STEP 7] Evaluating references…")
    state["status"] = "evaluating"

    seen = set(state.get("used_urls", []))
    evals = []

    focus_words = set(
        sub.get("focus_plan", "").lower().split()
        + sub.get("keywords", [])
    )

    for r in state.get("raw_results", []):
        url = r.get("url")
        if not url or url in seen:
            continue

        # Authority score
        auth = next(
            (v for k, v in AUTHORITY.items() if k in url),
            0.0
        )

        # Relevance score
        words = set(r.get("content", "").lower().split())
        rel = min(
            len(focus_words & words) / max(len(focus_words), 1),
            1.0,
        )

        final_score = round(
            rel * 0.5
            + float(r.get("score", 0.5)) * 0.35
            + auth * 0.15,
            3,
        )

        evals.append({
            "title": r.get("title", ""),
            "url": url,
            "snippet": r.get("content", ""),
            "final_score": final_score,
        })

        seen.add(url)

    evals = sorted(
        evals,
        key=lambda x: x["final_score"],
        reverse=True,
    )[:4]

    state["used_urls"] = list(seen)
    state["eval_refs"] = evals

    await _log(state, f"  → {len(evals)} refs selected")

    await LOG.step(
        state["job_id"],
        7,
        "Refs evaluated",
        f"{len(evals)} selected",
    )

    return state


# ══════════════════════════════════════════════════════════════════════════════
# STEP 8 — Context Builder
# ══════════════════════════════════════════════════════════════════════════════

async def context_builder(state: CourseState, config: RunnableConfig) -> CourseState:
    sub = await _sub(state)

    await _log(state, "🧹 [STEP 8] Building clean context…")
    state["status"] = "building_context"

    if not state.get("eval_refs"):
        state["clean_context"] = ""
        await LOG.step(
            state["job_id"],
            8,
            "Context",
            "No refs — using model knowledge",
        )
        return state

    sources = "\n\n".join(
        f"SOURCE {i+1}: {r['title']}\n{r['snippet']}"
        for i, r in enumerate(state["eval_refs"])
    )

    covered = "; ".join(state.get("covered", [])[-20:])

    state["clean_context"] = await _llm(
        system="Precise educational content curator. Return clean prose only.",
        user=P.context_clean_prompt(
            sub.get("focus_plan", ""),
            covered,
            sources,
        ),
    )

    wc = len(state["clean_context"].split())

    await _log(state, f"  → {wc} words")

    await LOG.step(
        state["job_id"],
        8,
        "Context built",
        f"{wc} words",
    )

    return state


# ══════════════════════════════════════════════════════════════════════════════
# STEP 9a — Image Retrieval
# ══════════════════════════════════════════════════════════════════════════════

async def image_retrieval(state: CourseState, config: RunnableConfig) -> CourseState:
    sub = await _sub(state)

    await _log(state, "🖼️  [STEP 9a] Image retrieval…")
    state["status"] = "retrieving_images"

    keywords = sub.get("keywords", [])
    first_kw = keywords[0] if keywords else sub["title"]

    query = sub.get("image_search_query", f"{sub['title']} diagram")
    queries = [
        f"{query} explanation labeled",
        f"{sub['title']} {first_kw} diagram",
    ]

    candidates = []
    seen = set()

    for q in queries:
        try:
            r = await asyncio.to_thread(
                tavily.search,
                query=q,
                max_results=5,
                include_images=True,
                include_answer=False,
            )

            for img in r.get("images", []):
                url = img if isinstance(img, str) else img.get("url", "")
                if not url or url in seen:
                    continue

                ul = url.lower()

                if any(j in ul for j in JUNK):
                    continue

                has_ext = any(
                    ul.endswith(e)
                    for e in [".jpg", ".jpeg", ".png", ".webp"]
                )

                if not has_ext and "image" not in ul and "img" not in ul:
                    continue

                score = sum(3 for d in GOOD_DOMAINS if d in ul)
                score += sum(
                    2 for kw in keywords[:2]
                    if kw.lower().replace(" ", "") in ul.replace("-", "").replace("_", "")
                )
                score += 1 if has_ext else 0

                candidates.append({"url": url, "score": score})
                seen.add(url)

        except Exception as e:
            await _log(state, f"  ⚠ Image search error: {e}")

    state["cand_images"] = sorted(
        candidates,
        key=lambda x: x["score"],
        reverse=True,
    )[:6]

    await _log(state, f"  → {len(state['cand_images'])} candidates")

    return state


# ══════════════════════════════════════════════════════════════════════════════
# STEP 9b — Grok Vision (validate + explain)
# ══════════════════════════════════════════════════════════════════════════════

async def _grok_vision(image_url: str, topic: str, context: str) -> tuple:
    """
    Returns (is_valid: bool, explanation: str)
    """

    xai_key = os.getenv("XAI_API_KEY", "")
    if not xai_key:
        return True, f"This diagram illustrates key concepts related to {topic}."

    try:
        from openai import OpenAI as OAI

        def _call():
            client = OAI(api_key=xai_key, base_url="https://api.x.ai/v1")
            prompt_text = P.image_vision_prompt(topic, context[:150])

            resp = client.chat.completions.create(
                model="grok-2-vision-latest",
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": image_url, "detail": "low"},
                        },
                        {"type": "text", "text": prompt_text},
                    ],
                }],
                max_tokens=120,
                timeout=15,
            )
            return resp

        resp = await asyncio.to_thread(_call)

        text = resp.choices[0].message.content.strip()
        valid = "VERDICT: YES" in text.upper()

        exp = re.search(
            r"EXPLANATION:\s*(.+?)(?:\n|$)",
            text,
            re.IGNORECASE | re.DOTALL,
        )

        explanation = (
            exp.group(1).strip()
            if exp and valid
            else f"This diagram illustrates {topic}."
        )

        return valid, explanation

    except Exception as e:
        return True, f"This diagram illustrates key concepts in {topic}. ({e})"


async def image_validator(state: CourseState, config: RunnableConfig) -> CourseState:
    sub = await _sub(state)

    topic = sub["title"]
    context = sub.get("focus_plan", "")
    grok_on = bool(os.getenv("XAI_API_KEY", ""))

    await _log(
        state,
        f"🔎 [STEP 9b] Grok Vision "
        f"{'(active)' if grok_on else '(no key — using heuristic)'}…"
    )

    state["status"] = "validating_images"

    validated = []

    for cand in state.get("cand_images", []):
        if len(validated) >= 2:
            break

        url = cand["url"]
        valid, explanation = await _grok_vision(url, topic, context)

        await _log(
            state,
            f"  {'✓' if valid else '✗'} {url[:70]}"
        )

        if valid:
            validated.append({
                "url": url,
                "alt": f"{topic} diagram",
                "caption": f"Figure: {topic}",
                "explanation": explanation,
                "validated": grok_on,
                "markdown": (
                    f"![{topic} diagram]({url})\n"
                    f"*{explanation}*"
                ),
            })

    # Fallback if none validated
    if not validated and state.get("cand_images"):
        best = state["cand_images"][0]
        validated.append({
            "url": best["url"],
            "alt": f"{topic} illustration",
            "caption": f"Concept: {topic}",
            "explanation": f"This image illustrates {topic}.",
            "validated": False,
            "markdown": (
                f"![{topic} illustration]({best['url']})\n"
                f"*Concept: {topic}*"
            ),
        })

    state["cur_images"] = validated

    await _log(state, f"  → {len(validated)} image(s) approved")

    await LOG.step(
        state["job_id"],
        9,
        "Images validated",
        f"{len(validated)} approved",
    )

    return state


# ══════════════════════════════════════════════════════════════════════════════
# STEP 10 — Content Writer
# ══════════════════════════════════════════════════════════════════════════════

async def content_writer(state: CourseState, config: RunnableConfig) -> CourseState:
    mod = await _mod(state)
    sub = await _sub(state)
    prof = await _prof(state)

    await _log(
        state,
        f"✍️  [STEP 10] Writing: '{sub['title']}' ({prof['label']})…"
    )

    state["status"] = "writing"

    covered_str = ""
    if state.get("covered"):
        covered_str = (
            "\n⛔ DO NOT REPEAT — already covered:\n"
            + "\n".join(f"  - {c}" for c in state["covered"][-25:])
        )

    img_blocks = [
        {
            "markdown": img["markdown"],
            "explanation": img["explanation"],
        }
        for img in state.get("cur_images", [])
    ]

    prompt = P.content_writer_prompt(
        course_title=state["course_title"],
        subject_domain=state["subject_domain"],
        mod_title=mod["title"],
        mod_plan=mod["module_plan"],
        sub_title=sub["title"],
        focus_plan=sub["focus_plan"],
        skill_level=state["skill_level"],
        prof=prof,
        sections=sub["sections"],
        context=state["clean_context"],
        images=img_blocks,
        covered_str=covered_str,
    )

    content = await _llm(
        system=(
            f"Expert educational content writer for {prof['label']} level. "
            f"Subject: {state['subject_domain']}. Clean markdown. "
            "LaTeX for math only if level >= 3."
        ),
        user=prompt,
    )

    slides = await _parse_slides(content)

    mi = state["cur_mod_idx"]
    si = state["cur_sub_idx"]

    state["modules"][mi]["submodules"][si]["content"] = content
    state["modules"][mi]["submodules"][si]["slides"] = slides
    state["modules"][mi]["submodules"][si]["images"] = state["cur_images"]

    bold_terms = re.findall(r"\*\*(.+?)\*\*", content)
    new_terms = [
        t.strip()
        for t in bold_terms
        if 2 < len(t) < 60
    ]

    state["covered"] = (
        state.get("covered", []) + new_terms
    )[-60:]

    await _log(
        state,
        f"  → {len(slides)} slides · {len(content.split())} words"
    )

    await LOG.step(
        state["job_id"],
        10,
        f"Written: {sub['title']}",
        f"{len(slides)} slides",
    )

    return state


# ══════════════════════════════════════════════════════════════════════════════
# STEP 11 — Store Submodule
# ══════════════════════════════════════════════════════════════════════════════

async def store_submodule_node(state: CourseState, config: RunnableConfig) -> CourseState:
    db = config["configurable"]["db"]

    mod = await _mod(state)
    sub = await _sub(state)

    label = f"M{state['cur_mod_idx']+1}.S{state['cur_sub_idx']+1}"

    await _log(state, f"💾 [STEP 11] Storing {label}…")
    state["status"] = "storing"

    payload = {
        "title": sub.get("title"),
        "focus_plan": sub.get("focus_plan"),
        "keywords": sub.get("keywords", []),
        "content": sub.get("content", ""),
        "slides": sub.get("slides", []),
        "images": state.get("cur_images", []),
        "skill_level": state.get("skill_level"),
        "refs_count": len(state.get("eval_refs", [])),
    }

    # If db.store_submodule is sync → run in thread
    backend = await store_submodule(
        db,
        state["course_id"],
        mod["module_id"],
        sub["submodule_id"],
        payload,
    )

    mi = state["cur_mod_idx"]
    si = state["cur_sub_idx"]

    state["modules"][mi]["submodules"][si]["stored"] = True

    # ──────────────────────────────────────────────────────────────────────────
    # Accumulate module-level references (deduplicated)
    # ──────────────────────────────────────────────────────────────────────────

    existing = state["modules"][mi].get("references", [])
    used_urls = {r["url"] for r in existing if "url" in r}

    for ref in state.get("eval_refs", []):
        url = ref.get("url")
        if url and url not in used_urls:
            existing.append(ref)
            used_urls.add(url)

    state["modules"][mi]["references"] = existing

    # ──────────────────────────────────────────────────────────────────────────
    # Clear scratch-pad memory
    # ──────────────────────────────────────────────────────────────────────────

    state["raw_results"] = []
    state["eval_refs"] = []
    state["clean_context"] = ""
    state["cand_images"] = []
    state["cur_images"] = []

    await _log(state, f"  → Stored in {backend}")

    await LOG.step(
        state["job_id"],
        11,
        f"Stored {label}",
        str(backend),
    )

    return state


# ══════════════════════════════════════════════════════════════════════════════
# STEP 12 — Submodule Loop
# ══════════════════════════════════════════════════════════════════════════════

async def advance_submodule(state: CourseState, config: RunnableConfig) -> CourseState:
    state["cur_sub_idx"] += 1

    mod = await _mod(state)
    remaining = len(mod.get("submodules", [])) - state["cur_sub_idx"]

    await _log(
        state,
        f"🔄 [STEP 12] Submodule check — {remaining} remaining",
    )

    await LOG.step(
        state["job_id"],
        12,
        "Submodule loop",
        f"{remaining} remaining",
    )

    return state


async def _route_sub(state: CourseState) -> str:
    mod = await _mod(state)
    return (
        "more"
        if state["cur_sub_idx"] < len(mod.get("submodules", []))
        else "done"
    )


# ══════════════════════════════════════════════════════════════════════════════
# STEP 13 — Attach Module References
# ══════════════════════════════════════════════════════════════════════════════

async def attach_module_refs(state: CourseState, config: RunnableConfig) -> CourseState:
    mod = await _mod(state)

    await _log(
        state,
        f"📎 [STEP 13] Finalising refs for '{mod['title']}'…",
    )

    state["status"] = "attaching_refs"

    seen = set()
    final = []

    sorted_refs = sorted(
        mod.get("references", []),
        key=lambda x: x.get("final_score", 0),
        reverse=True,
    )

    for r in sorted_refs:
        url = r.get("url")
        if url and url not in seen and len(final) < 8:
            final.append(r)
            seen.add(url)

    state["modules"][state["cur_mod_idx"]]["references"] = final

    # Persist references to DB
    db = config["configurable"]["db"]
    await store_references(db, state["course_id"], mod["module_id"], final)

    await _log(state, f"  → {len(final)} refs")

    await LOG.step(
        state["job_id"],
        13,
        f"Refs for '{mod['title']}'",
        f"{len(final)} refs",
    )

    return state
# ══════════════════════════════════════════════════════════════════════════════
# STEP 13b — YouTube Video Search (per module)
# ══════════════════════════════════════════════════════════════════════════════


async def fetch_module_videos(state: CourseState, config: RunnableConfig) -> CourseState:
    mod = await _mod(state)
    query = mod.get(
        "youtube_query",
        f"{mod['title']} {state['course_title']} tutorial"
    )

    await _log(state, f"[STEP 13b] YouTube search: '{query}'…")
    state["status"] = "fetching_videos"

    videos = []

    try:
        results = await asyncio.to_thread(
            tavily.search,
            query=f"{query} site:youtube.com",
            max_results=6,
            include_answer=False,
            include_raw_content=False,
        )

        for r in results.get("results", []):
            url = r.get("url", "")
            if "youtube.com/watch" in url or "youtu.be/" in url:
                videos.append({
                    "title":   r.get("title", "")[:120],
                    "url":     url,
                    "snippet": r.get("content", "")[:200],
                    "channel": "",
                })
            if len(videos) >= 3:
                break

    except Exception as e:
        await _log(state, f"YouTube search error: {e}")

    state["modules"][state["cur_mod_idx"]]["youtube_videos"] = videos

    # Persist videos to DB
    db = config["configurable"]["db"]
    await store_videos(db, state["course_id"], mod["module_id"], videos)

    await _log(state, f"→ {len(videos)} video(s) found")
    await LOG.step(state["job_id"], 14, f"Videos for '{mod['title']}'", f"{len(videos)} found")

    return state
# ══════════════════════════════════════════════════════════════════════════════
# STEP 14 — Module Loop
# ══════════════════════════════════════════════════════════════════════════════

async def advance_module(state: CourseState, config: RunnableConfig) -> CourseState:
    state["cur_mod_idx"] += 1
    state["cur_sub_idx"] = 0

    remaining = len(state["modules"]) - state["cur_mod_idx"]
    await _log(state, f"[STEP 14] Module check — {remaining} remaining")

    return state

def _route_mod(state: CourseState) -> str:
    return ("more" if state["cur_mod_idx"] < len(state["modules"]) else "done")


# ══════════════════════════════════════════════════════════════════════════════
# STEP 15 — Compile Course
# ══════════════════════════════════════════════════════════════════════════════

async def compile_course(state: CourseState, config: RunnableConfig) -> CourseState:
    db = config["configurable"]["db"]

    await _log(state, "[STEP 15] Compiling final course…")
    state["status"] = "compiling"

    sk   = state["skill_level"]
    prof = P.SKILL_PROFILES[sk]

    total_subs = sum(len(m["submodules"]) for m in state["modules"])
    total_slides = sum(
        sum(len(s.get("slides", [])) for s in m["submodules"])
        for m in state["modules"]
    )
    total_refs = sum(len(m["references"]) for m in state["modules"])
    total_images = sum(
        sum(len(s.get("images", [])) for s in m["submodules"])
        for m in state["modules"]
    )
    total_videos = sum(len(m.get("youtube_videos", [])) for m in state["modules"])

    course_data = {
        "course_id":        state["course_id"],
        "course_title":     state["course_title"],
        "subject_domain":   state["subject_domain"],
        "skill_level":      sk,
        "skill_label":      prof["label"],
        "total_modules":    len(state["modules"]),
        "total_submodules": total_subs,
        "total_slides":     total_slides,
        "total_refs":       total_refs,
        "total_images":     total_images,
        "total_videos":     total_videos,
        "modules":          state["modules"],
    }

    backend = await store_course(db, state["course_id"], course_data)

    state["status"] = "complete"

    await _log(
        state,
        f"Done! {len(state['modules'])} modules · "
        f"{total_subs} subs · {total_slides} slides · "
        f"{total_refs} refs · {total_videos} videos → {backend}"
    )

    await LOG.done(state["job_id"], {
        "modules": len(state["modules"]),
        "submodules": total_subs,
        "slides": total_slides,
        "refs": total_refs,
        "videos": total_videos,
        "backend": backend,
    })

    return state