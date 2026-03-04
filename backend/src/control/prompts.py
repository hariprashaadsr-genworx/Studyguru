"""
prompts.py — All AI prompts in one place.
Edit this file to tune what the AI generates — workflow.py just calls these functions.
"""

import json

# ── Skill Profiles ─────────────────────────────────────────────────────────────
# Level 1-2  → Beginner
# Level 3-4  → Standard (school / college level)
# Level 5    → Advanced (more questions, deeper treatment)
SKILL_PROFILES = {
    1: {
        "label": "Beginner",
        "tier": "beginner",
        "language": "Very simple everyday language. Short sentences. Define every term immediately.",
        "math": "No formulas or equations. Describe relationships in plain words only.",
        "analogy": "3–4 vivid, high-quality, perfectly accurate everyday analogies (food, sports, household items, daily routines, games) that make the concept crystal-clear, memorable, and intuitive.",
        "depth": "Core idea explained thoroughly with 3–4 simple examples and multiple analogies. Build rock-solid intuition. Skip edge cases entirely.",
        "slides_range": (4, 6),
        "questions_per_topic": 1,
        "code_ok": False,
    },
    2: {
        "label": "Beginner",
        "tier": "beginner",
        "language": "Mostly plain English with a few technical terms, each defined inline.",
        "math": "Simple formulas only (e.g. area = length × width). Always explain every symbol.",
        "analogy": "2–3 strong, relatable analogies per major concept that help students 'see' it clearly.",
        "depth": "Core mechanics with multiple worked examples (one main + 2 variations), analogies, and patient breakdowns.",
        "slides_range": (4, 7),
        "questions_per_topic": 1,
        "code_ok": False,
    },
    3: {
        "label": "Standard",
        "tier": "standard",
        "language": "Standard academic language appropriate for school/college. Technical terms with first-use definitions.",
        "math": "LaTeX formulas with derivation steps. Explain notation on first use.",
        "analogy": "One insightful analogy for each abstract or tricky concept.",
        "depth": "Full mechanisms with rich explanations, multiple worked examples, common pitfalls, and clear reasoning. Syllabus-aligned coverage.",
        "slides_range": (5, 8),
        "questions_per_topic": 2,
        "code_ok": True,
    },
    4: {
        "label": "Standard",
        "tier": "standard",
        "language": "Standard academic language. Technical terms used freely with brief definitions where new.",
        "math": "Full LaTeX for all formulas, derivations, and proofs relevant to syllabus.",
        "analogy": "Selective analogies only when they provide genuine insight into complex relationships.",
        "depth": "Deep coverage: rich explanations, multiple detailed examples, edge cases, and thorough conceptual clarity. Syllabus-aligned.",
        "slides_range": (5, 9),
        "questions_per_topic": 2,
        "code_ok": True,
    },
    5: {
        "label": "Advanced",
        "tier": "advanced",
        "language": "Technical and precise. Field terminology assumed known. Dense prose.",
        "math": "Full rigor. LaTeX for all derivations, proofs, complexity analysis.",
        "analogy": "Only when an analogy offers exceptional illumination.",
        "depth": "Exhaustive: foundations, numerous advanced examples, edge cases, state-of-the-art, open problems. Include extra practice questions and challenge problems.",
        "slides_range": (6, 9),
        "questions_per_topic": 3,
        "code_ok": True,
    },
}


# ── Step 3: Planning Agent Prompt ──────────────────────────────────────────────

def planning_prompt(course_title: str, skill_level: int, prof: dict, modules: list) -> str:
    """
    Strong curriculum architect prompt.
    Forces education-level detection + strict subject enforcement.
    Dynamic slide planning per submodule.
    """
    min_slides, max_slides = prof.get("slides_range", (5, 8))
    questions_count = prof.get("questions_per_topic", 2)

    return f"""You are a senior curriculum architect designing a structured academic course.

Course Title: "{course_title}"
Skill Level: {skill_level}/5 — {prof["label"]} (Tier: {prof.get("tier", "standard")})

══════════════════════════════════════════
STEP 1 — DETERMINE COURSE CONTEXT (CRITICAL)
══════════════════════════════════════════

From the course title, PRECISELY determine:

• education_level — pick ONE:
  "School (Class 6–8)", "School (Class 9–10)", "School (Class 11–12)",
  "Undergraduate", "Professional", "General Interest"

• subject_type — pick ONE:
  "Mathematics", "Physics", "Chemistry", "Biology",
  "Social Science", "History", "Geography", "Political Science",
  "Economics", "Computer Science", or another precise subject

This detection is CRITICAL. A course called "Class 10 Social Science" must be detected
as education_level = "School (Class 9–10)", subject_type = "Social Science".
A course called "Class 10 Maths" → subject_type = "Mathematics".

══════════════════════════════════════════
STRICT SUBJECT RULES (NON-NEGOTIABLE)
══════════════════════════════════════════

These rules are absolute and must be followed by ALL downstream content:

1. Social Science / History / Geography / Political Science / Economics:
   - ZERO formulas, ZERO equations, ZERO mathematical derivations
   - ZERO programming or code
   - Focus on: causes, effects, timelines, case studies, processes, key events, people, policies
   - Content must be narrative-driven with explanations, not numbers

2. Biology:
   - ZERO programming or code
   - Formulas only if truly standard in syllabus (genetics ratios, Hardy-Weinberg)
   - Focus on: diagrams, processes, classifications, mechanisms, examples

3. Mathematics:
   - MUST include formulas with LaTeX
   - MUST plan step-by-step worked examples
   - Every topic must have at least one numerical example

4. Physics:
   - MUST include formulas, derivations (age-appropriate)
   - MUST have conceptual explanation + numerical worked example
   - If derivation exists for this topic, plan a dedicated derivation section

5. Chemistry:
   - Include chemical equations, reaction mechanisms
   - Balance conceptual understanding + numerical problems

6. Computer Science:
   - Code allowed only if the topic explicitly requires it

EDUCATION LEVEL CAPS:
- Class 6–10: NO calculus, NO advanced algebra beyond syllabus
- Social Science at ANY level: NO scientific equations whatsoever

══════════════════════════════════════════
DYNAMIC SLIDE PLANNING (CRITICAL)
══════════════════════════════════════════

For each submodule, plan {min_slides}–{max_slides} sections (slides) dynamically based on topic depth.

DO NOT use static/fixed section templates. Plan sections SPECIFIC to each topic:

Example for "Newton's Second Law" (Physics, 7 slides):
1. "Introduction: What is Newton's Second Law?"
2. "Conceptual Foundation: Force, Mass, and Acceleration"
3. "The Formula: F = ma — Derivation and Meaning"
4. "Units and Dimensional Analysis"
5. "Worked Example: Calculating Force on a Moving Object"
6. "Real-World Applications of Newton's Second Law"
7. "Summary & Questions to Ponder"

Example for "French Revolution" (History, 6 slides):
1. "Introduction: Why Did France Revolt?"
2. "Causes: Social, Economic, and Political Triggers"
3. "Key Events: From Bastille to the Reign of Terror"
4. "Key Figures: Robespierre, Louis XVI, Marie Antoinette"
5. "Impact and Legacy of the Revolution"
6. "Summary & Questions to Ponder"

RULES:
• Slide 1 = Introduction (hook + overview)
• Last slide = Summary + {questions_count} thought-provoking question(s) for the student
• If subject has derivation → include a dedicated derivation slide
• If subject has formula → include formula + worked example slide
• NEVER create a slide dedicated to just an image
• Vary slide count per topic: simple topics = fewer, complex topics = more
• Each slide section title must be SPECIFIC to the topic — never generic

══════════════════════════════════════════
COURSE STRUCTURE INPUT
══════════════════════════════════════════
{json.dumps([{{
    "module_id": m["module_id"],
    "title": m["title"],
    "submodules": [{{"id": s["submodule_id"], "title": s["title"]}} for s in m["submodules"]]
}} for m in modules], indent=2)}

══════════════════════════════════════════
RETURN STRICT JSON (NO MARKDOWN)
══════════════════════════════════════════

{{
  "education_level": "...",
  "subject_domain": "... precise domain e.g. 'Class 10 CBSE Physics'",
  "subject_type": "...",
  "modules": [
    {{
      "module_id": "...",
      "module_plan": "2 sentences explaining full conceptual coverage of this module.",
      "complexity": "low|medium|high",
      "youtube_query": "precise syllabus-aligned search query",
      "submodules": [
        {{
          "submodule_id": "...",
          "focus_plan": "2 sentences clearly stating what COMPLETE understanding means for this topic.",
          "coverage_expectation": "Explain the topic fully from definition to applications and examples.",
          "topic_depth": "low|medium|high",
          "planned_slide_count": <number between {min_slides} and {max_slides}>,
          "keywords": ["keyword 1", "keyword 2", "keyword 3"],
          "needs_analogy": true,
          "needs_derivation": false,
          "needs_formula": false,
          "image_search_query": "specific academic diagram query",
          "sections": [
            "Introduction: [Specific Topic Name]",
            "[Dynamic Section Title Specific to This Topic]",
            "[Another Dynamic Section Specific to This Topic]",
            "...",
            "Summary & Questions to Ponder"
          ]
        }}
      ]
    }}
  ]
}}

SECTION TITLE RULES:
• ALL titles must be specific and unique to the topic
• NEVER use generic titles like "Core Concepts" or "Step-by-Step"
• The final section MUST be "Summary & Questions to Ponder"
• Do NOT create image-only sections
• Number of sections must match planned_slide_count
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
    subject_type: str,
    education_level: str,
    mod_title: str,
    mod_plan: str,
    sub_title: str,
    focus_plan: str,
    skill_level: int,
    prof: dict,
    sections: list,
    context: str,
    images: list,
    covered_str: str,
    needs_derivation: bool = False,
    needs_formula: bool = False,
    topic_depth: str = "medium",
) -> str:

    no_code = "NEVER include programming or code." if not prof["code_ok"] else ""
    min_slides, max_slides = prof.get("slides_range", (5, 8))
    questions_count = prof.get("questions_per_topic", 2)

    subject_locks = {
        "Social Science": "ABSOLUTELY NO formulas, equations, mathematical derivations, or scientific notation. Content must be purely narrative: causes, effects, events, case studies, people, policies.",
        "History": "ABSOLUTELY NO formulas or equations. Focus entirely on causes, consequences, timelines, key figures, case studies, and historical analysis.",
        "Geography": "NO equations unless standard school-level geography formulas. Focus on processes, regions, data interpretation, case studies.",
        "Political Science": "NO formulas. Focus on concepts, governance, policies, case studies, constitutional provisions.",
        "Economics": "Only basic graphs and simple formulas if part of syllabus. Focus on concepts, theories, real-world applications.",
        "Biology": "NO programming examples. Focus on processes, mechanisms, classifications, diagrams, examples.",
        "Mathematics": "MUST include formulas (LaTeX) and step-by-step worked examples with numerical solutions.",
        "Physics": "MUST include formula, derivation explanation, and numerical worked examples with step-by-step solutions.",
        "Chemistry": "MUST include chemical equations, reaction mechanisms where relevant, and numerical examples.",
    }

    subject_rule = subject_locks.get(subject_type, "")

    img_instruction = ""
    if images:
        img_instruction = (
            "\n\nIMAGE EMBEDDING RULES:\n"
            "• Embed images INSIDE explanation slides, never as a standalone slide.\n"
            "• Place the image markdown naturally after the paragraph that explains the concept the image illustrates.\n"
            "• Add 1–2 sentences AFTER the image explaining what the student should notice.\n"
            "• Each image must SUPPORT text content, never replace it.\n"
            "• Available images:\n" +
            "\n".join(f"  - {img['markdown']}" for img in images)
        )

    derivation_instruction = ""
    if needs_derivation:
        derivation_instruction = (
            "\n\nDERIVATION REQUIRED:\n"
            "Include a dedicated slide with a step-by-step derivation. "
            "Show each step clearly, explain the reasoning behind each transformation, "
            "and state assumptions."
        )

    formula_instruction = ""
    if needs_formula:
        formula_instruction = (
            "\n\nFORMULA REQUIRED:\n"
            "Present the formula prominently in LaTeX. Explain every symbol. "
            "Follow with at least one fully worked numerical example showing substitution and calculation."
        )

    sections_text = "\n".join(f"  {i+1}. {s}" for i, s in enumerate(sections))

    return f"""
You are an expert academic teacher creating COMPLETE topic mastery content.

Course: {course_title}
Domain: {subject_domain}
Subject Type: {subject_type}
Education Level: {education_level}
Module: {mod_title}
Submodule: {sub_title}
Objective: {focus_plan}
Topic Depth: {topic_depth}
Skill Tier: {prof.get("tier", "standard")} — {prof["label"]}

══════════════════════════════════════════
STRICT SUBJECT ENFORCEMENT (NON-NEGOTIABLE)
══════════════════════════════════════════
{subject_rule}
{no_code}
Stay STRICTLY within {subject_domain}.
Do NOT mix domains. If this is Social Science, there must be ZERO math.
If this is Physics, include formulas and examples.

══════════════════════════════════════════
COMPLETE TOPIC COVERAGE (CRITICAL)
══════════════════════════════════════════

You must explain "{sub_title}" COMPLETELY from beginning to end.
The student should NOT need any other resource after reading your slides.

MANDATORY coverage for this topic:
• Clear definition of the concept
• Why it matters / real-world relevance
• Detailed conceptual explanation
• Multiple examples (at least 2-3 real-world examples)
• If applicable: formula + derivation + worked numerical example
• Common misconceptions or mistakes
• Applications in daily life or exams
• Summary of key takeaways
• {questions_count} thought-provoking question(s) for the student to ponder

══════════════════════════════════════════
SLIDE STRUCTURE
══════════════════════════════════════════

Generate exactly {len(sections)} slides using these section titles:
{sections_text}

SLIDE FORMAT — use this EXACTLY:
---SLIDE---
## [Section Title]

[Rich content here — multiple paragraphs, examples, bold terms, etc.]

---SLIDE---
## [Next Section Title]

[Content...]

SLIDE RULES:
• First slide = Introduction: hook the student, overview what they'll learn, why it matters
• Last slide = Summary + Reflection:
  - Recap the 3-5 most important points
  - End with:
    > **Question:** [thought-provoking question]
  {"- Include " + str(questions_count) + " questions if advanced level" if questions_count > 1 else ""}
• Middle slides must BUILD understanding progressively
• Every slide must have SUBSTANTIAL text content (150-400 words per slide)
• NEVER create a slide with just an image — images must be embedded within text
• NEVER waste a slide — every slide must teach something valuable
{derivation_instruction}
{formula_instruction}
{img_instruction}

══════════════════════════════════════════
WRITING STYLE
══════════════════════════════════════════

• Write as an expert teacher who TRULY wants the student to understand
• Be explanation-oriented: don't just state facts, explain WHY and HOW
• Use **bold** for technical terms on first use
• Include 2-4 examples per major concept
• Build deep conceptual clarity — the student should feel "I get it!"
• Analogies: {prof["analogy"]}
• Math: {prof["math"]}
• Language: {prof["language"]}
• Depth: {prof["depth"]}

{f"ALREADY COVERED — DO NOT REPEAT:" + covered_str if covered_str else ""}

CONTEXT FROM RESEARCH:
{context if context else "Use your expert knowledge for this topic."}

══════════════════════════════════════════
Write ALL {len(sections)} slides now. Start with ---SLIDE--- for each one.
"""