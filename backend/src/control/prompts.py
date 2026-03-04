"""
prompts.py — All AI prompts in one place.
Edit this file to tune what the AI generates — workflow.py just calls these functions.
"""

import json

# ── Skill Profiles ─────────────────────────────────────────────────────────────
SKILL_PROFILES = {
    1: {
        "label": "Beginner",
        "language": "Very simple everyday language. Short sentences. Define every term immediately.",
        "math": "No formulas or equations. Describe relationships in plain words only.",
        "analogy": "3–4 vivid, high-quality, perfectly accurate everyday analogies (food, sports, household items, daily routines, games) that make the concept crystal-clear, memorable, and intuitive without any confusion.",
        "depth": "Core idea explained thoroughly with 3–4 simple examples and multiple high-quality analogies. Build rock-solid intuition. Skip edge cases entirely.",
        "code_ok": False,
    },
    2: {
        "label": "Elementary",
        "language": "Mostly plain English with a few technical terms, each defined inline.",
        "math": "Simple formulas only (e.g. area = length × width). Always explain every symbol.",
        "analogy": "2–3 strong, relatable, high-quality analogies per major concept that directly illuminate the idea and help students 'see' it clearly.",
        "depth": "Core mechanics explained in detail with multiple worked examples (one main + 2 variations), high-quality analogies, and patient breakdowns.",
        "code_ok": False,
    },
    3: {
        "label": "Intermediate",
        "language": "Standard academic language. Technical terms with first-use definitions.",
        "math": "LaTeX formulas with brief derivation steps. Explain notation on first use.",
        "analogy": "One insightful, precise, high-quality analogy for each abstract or tricky concept to deepen understanding and connect ideas beautifully.",
        "depth": "Full mechanisms with rich explanations, multiple worked examples, common pitfalls, high-quality analogies, and clear reasoning.",
        "code_ok": True,
    },
    4: {
        "label": "Advanced",
        "language": "Technical and precise. Field terminology assumed known.",
        "math": "Full rigor. LaTeX for all derivations, proofs, complexity analysis.",
        "analogy": "Selective high-quality analogies only when they provide genuine, powerful insight into complex relationships or bridge concepts elegantly.",
        "depth": "Deep coverage: rich explanations, multiple detailed examples, edge cases, complexity analysis, theoretical nuance, and insightful analogies where they add real value.",
        "code_ok": True,
    },
    5: {
        "label": "Expert",
        "language": "Research-level dense prose. Graduate-level background assumed.",
        "math": "Full proofs in LaTeX. Reference theorems by name.",
        "analogy": "Omit entirely unless an analogy offers exceptional illumination for connecting state-of-the-art ideas.",
        "depth": "Exhaustive: foundations, rich explanations, numerous advanced examples, state-of-the-art, open problems, and analogies only when truly enlightening.",
        "code_ok": True,
    },
}


# ── Step 3: Planning Agent Prompt ──────────────────────────────────────────────

def planning_prompt(course_title: str, skill_level: int, prof: dict, modules: list) -> str:
    """
    Returns the planning prompt. The planning agent decides:
    - subject domain (to enforce content rules)
    - per-submodule: dynamic section titles, keywords, image query
    - per-module: YouTube search query
    """
    no_code_rule = (
        "NEVER include code examples unless this course is explicitly about programming/CS."
    )
    code_rule = (
        "Code examples are allowed ONLY when directly relevant to the concept."
    )
    math_rule = (
        "NEVER use formulas or equations. Describe everything in plain words."
        if skill_level <= 2
        else "Use LaTeX for math. Never write equations as plain text."
    )

    return f"""You are a senior curriculum architect designing an online course.

Course: "{course_title}"
Level: {skill_level}/5 — {prof["label"]}

STRICT CONTENT RULES:
• Language: {prof["language"]}
• Math: {prof["math"]}
• {no_code_rule if not prof["code_ok"] else code_rule}
• {math_rule}
• All examples must fit the subject domain — do NOT mix domains
• Class 6–8 science: NO calculus, NO algebra beyond simple equations
• Chemistry/Biology: NO Python code, NO programming examples
• If course is for beginners, use ONLY everyday examples
• Explanations: Plan for highly detailed, patient, comprehensive explanations that cover EVERY aspect of the topic so students truly understand everything.
• Examples: Ensure every submodule plan supports 2–4 concrete examples (real-world, numerical, hypothetical) per major idea.
• Analogies: Plan for high-quality, vivid, accurate analogies exactly as described in the skill profile to make concepts intuitive and memorable.

COURSE STRUCTURE:
{json.dumps([{
    "module_id": m["module_id"],
    "title": m["title"],
    "submodules": [{"id": s["submodule_id"], "title": s["title"]} for s in m["submodules"]]
} for m in modules], indent=2)}

Return ONLY valid JSON (no markdown fences, no extra text), MAKE SURE TO PUT DOUBLE QUOTES FOR ALL THE KEYS:
{{
  "subject_domain": "precise domain e.g. 'Class 8 Science', 'Machine Learning', 'Organic Chemistry'",
  "modules": [
    {{
      "module_id": "...",
      "module_plan": "2 sentences: unique focus of this module and how it builds on the previous",
      "complexity": "low|medium|high",
      "youtube_query": "search query to find educational YouTube videos e.g. 'photosynthesis explanation class 8 CBSE'",
      "submodules": [
        {{
          "submodule_id": "...",
          "focus_plan": "2 sentences: exact teaching objective — what the student will understand",
          "keywords": ["specific diagram keyword 1", "keyword 2", "keyword 3", "keyword 4"],
          "needs_analogy": true,
          "image_search_query": "very specific query e.g. 'mitosis cell division diagram labeled'",
          "sections": [
            "Introduction: [specific concept name]",
            "[Mechanism/Process title specific to topic]",
            "[Step-by-step or How-it-works title]",
            "Worked Example: [specific example name relevant to topic] if related to math/chemistry/physics, or [Case Study: specific real-world example] for other subjects ",
            "Check Your Understanding"
          ]
        }}
      ]
    }}
  ]
}}

SECTION TITLE RULES (critical):
• NEVER use generic titles like "Core Concept", "How It Works", "Real-World Application"
• Every section title must be SPECIFIC to the topic
• Section 4 MUST start with "Worked Example:" followed by a specific example name
• Section 5 MUST be "Check Your Understanding" or "Test Yourself"
• Bad: "Core Concept: [title]"  ✓ Good: "What is Osmosis?"
• Bad: "Real-World Application"  ✓ Good: "Osmosis in Your Kitchen: Salting Cucumbers"
"""


# ── Step 8: Context Cleaner Prompt ─────────────────────────────────────────────

def context_clean_prompt(focus_plan: str, covered: str, sources_text: str) -> str:
    """Clean up raw Tavily results into usable educational context."""
    return f"""Submodule focus: "{focus_plan}"
{"Already covered — DO NOT repeat: " + covered if covered else ""}

Sources:
{sources_text}

Extract ONLY information directly relevant to the focus above.
Merge duplicate facts. Remove any already-covered content.
Write 200–300 words of clean educational prose.
Cite source URLs inline like: concept [url]. No headings or lists."""


# ── Step 9b: Grok Vision — Validate + Explain ─────────────────────────────────

def image_vision_prompt(topic: str, image_context: str) -> str:
    """
    Single Grok Vision call that both validates the image AND explains it.
    topic: submodule title
    image_context: focus_plan excerpt
    """
    return (
        f"This image is from an educational course on '{topic}'.\n"
        f"Context: {image_context}\n\n"
        f"TASK 1 — VALIDATION:\n"
        f"ACCEPT if: technical diagram, flowchart, annotated chart, labeled illustration,\n"
        f"           step-by-step visual, scientific/mathematical diagram.\n"
        f"REJECT if: blog thumbnail, stock photo, marketing banner, portrait,\n"
        f"           decorative image, PPT cover slide, screenshot of text.\n\n"
        f"TASK 2 — EXPLANATION (only if ACCEPTED):\n"
        f"In 2–3 sentences, explain for a student:\n"
        f"  - What this diagram shows\n"
        f"  - How it relates to {topic}\n"
        f"  - What the learner should pay attention to\n\n"
        f"Reply in EXACTLY this format:\n"
        f"VERDICT: YES\n"
        f"REASON: <one sentence>\n"
        f"EXPLANATION: <2–3 sentences explaining the image for the student>\n\n"
        f"or:\n"
        f"VERDICT: NO\n"
        f"REASON: <one sentence>\n"
        f"EXPLANATION: (none)"
    )


# ── Step 10: Content Writer Prompt ────────────────────────────────────────────

def content_writer_prompt(
    course_title: str,
    subject_domain: str,
    mod_title: str,
    mod_plan: str,
    sub_title: str,
    focus_plan: str,
    skill_level: int,
    prof: dict,
    sections: list,
    context: str,
    images: list,          # list of {markdown, explanation} dicts
    covered_str: str,
) -> str:
    """
    Main content generation prompt. Uses dynamic section titles from planning agent.
    """
    # Build image instructions
    img_instructions = ""
    for i, img in enumerate(images[:2], 1):
        slide_num = i + 1  # embed in slides 2 and 3
        img_instructions += (
            f"\nFor Slide {slide_num}, embed this image EXACTLY:\n"
            f"{img['markdown']}\n"
            f"Then write this explanation (adapt to context):\n"
            f"{img['explanation']}\n"
        )

    # Code + math rules
    no_code = "NEVER include code examples or programming syntax." if not prof["code_ok"] else ""
    math = (
        "Use LaTeX for ALL math: $inline formula$ or $$display formula$$. Never plain text."
        if skill_level >= 3
        else "NO formulas or equations. Plain language descriptions only."
    )

    # Enhanced notes for explanation-oriented slides with more examples & high-quality analogies
    slide_blocks = []
    for i, section in enumerate(sections, 1):
        notes = {
            1: f"Give a rich, engaging introduction to '{section.replace('Introduction: ', '')}'. Start with a high-quality analogy from the skill profile, then provide 2–3 simple examples to immediately build intuition and cover the full idea clearly.",
            2: f"Deliver a thorough, patient explanation of the mechanism/process. Break everything down step-by-step. Use 1–2 high-quality analogies and at least 3 concrete examples (real-world + hypothetical) so students understand every single detail.",
            3: f"Provide a detailed step-by-step breakdown. For EACH step, give a clear explanation, a concrete example, and a mini-analogy where helpful. Make sure the learner grasps 'how' and 'why' completely.",
            4: "MUST include a concrete, specific worked example with full step-by-step reasoning and numbers/names. Follow it with 1–2 additional related examples or variations to show the concept in different situations and reinforce full understanding.",
            5: "Summarise all key points with short recaps and one quick review example. Tie everything together with a final high-quality analogy if it helps. End with a thought-provoking question that makes the student apply what they learned.",
        }
        block = f"---SLIDE---\n## {section}\n[{notes.get(i, 'Continue explanation')}]"
        if i == 2 and images:
            block += "\n[Embed Slide 2 image here]"
        slide_blocks.append(block)

    return f"""You are an expert Udemy-style course writer.

Course: "{course_title}"
Subject Domain: {subject_domain}
Module: "{mod_title}" — {mod_plan}
Submodule: "{sub_title}"
Objective: {focus_plan}
Level: {skill_level}/5 — {prof["label"]}

CONTENT RULES (strictly enforce every rule):
• Language: {prof["language"]}
• Math: {prof["math"]}
• {math}
• {no_code}
• Analogies: {prof["analogy"]}
• Depth: {prof["depth"]}
• Stay STRICTLY within subject domain: {subject_domain}
• NEVER introduce concepts from other domains
• Explanations: Make every slide HIGHLY explanation-oriented. Provide thorough, patient, comprehensive breakdowns that cover EVERY aspect of the topic so the student truly understands everything about it.
• Examples: Include 2–4 concrete, relevant examples on almost every slide (real-world scenarios, numerical cases, hypothetical situations, everyday applications). Use them generously to reinforce understanding from multiple angles.
• Analogies: Always use the high-quality, vivid, accurate analogies specified in the skill profile — they must be creative yet perfectly mapped to the concept and extremely effective at building intuition.
{covered_str}

IMAGES:
{img_instructions if img_instructions else "(No images available for this submodule.)"}

RESEARCH CONTEXT (use this knowledge):
{context if context else "Use your expert knowledge."}

══════════════════════════════════════════
WRITE EXACTLY 5 SLIDES using these section titles.
Separate slides with: ---SLIDE---
Each slide starts with: ## [exact section title below]
══════════════════════════════════════════

{chr(10).join(slide_blocks)}

══════════════════════════════════════════
OUTPUT RULES:
1. Use EXACTLY the section titles given above (do not rename them)
2. **Bold** every technical term on FIRST use only
3. Embed images with the EXACT markdown provided — do not change URLs
4. Slide 4 MUST have a specific, step-by-step worked example PLUS 1–2 additional examples
5. Slide 5 MUST end with: > **Question:** [thought-provoking question]
6. Keep content level-appropriate: {prof["label"]} students should fully understand every sentence
7. NO references section in slides — those are added separately
8. Prioritise explanation depth and clarity — write as if patiently teaching a curious student who wants to know absolutely everything about the topic
9. Weave in high-quality analogies and multiple examples naturally throughout to make concepts stick perfectly
══════════════════════════════════════════"""