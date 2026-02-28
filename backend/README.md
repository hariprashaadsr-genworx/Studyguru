# Studyguru v1 — AI Learning Platform

A complete AI course generation system.

---

## Quick Start

```bash
# 1. Install
pip install -r requirements.txt

# 2. Configure
cp .env.example .env
# Edit .env: add OpenAI, Tavily, XAI (Grok), and PostgreSQL keys

# 3. Run
python main.py

# 5. Open
# http://localhost:8000
```

---

## Files

```
backend
├── Dockerfile
├── README.md
├── main.py
├── requirements.txt
├── .env
├── .env.example
└── src
    ├── api
    │   └── rest
    │       ├── app.py
    │       ├── routes
    │       └── static
    │           └── index.html
    ├── constants
    │   └── base.py
    ├── control
    │   ├── __init__.py
    │   ├── agents
    │   │   └── generation_engine.py
    │   ├── nodes
    │   │   └── generation_nodes.py
    │   ├── prompts.py
    │   └── workflows
    │       └── generation_engine.py
    ├── core
    │   └── services
    │       └── generation_service.py
    ├── data
    │   ├── clients
    │   │   └── postgresql_client.py
    │   ├── models
    │   │   └── postgres
    │   │       ├── course.py
    │   │       └── submodules.py
    │   └── repositories
    │       └── crud.py
    ├── observability
    │   ├── __init__.py
    │   └── logging.py
    ├── schemas
    │   └── generation.py
    └── utils
        ├── __init__.py
        └── generation_engine.py
```

---

## The Pipeline

```
Input JSON
    │
    ▼ STEP 1+2  preprocessor       — validate + normalise input
    ▼ STEP 3    planning_agent     — design section titles, keywords, YouTube query
    │
    ╔══ For each Module ════════════════════════════════════════╗
    ║   ╔══ For each Submodule ════════════════════════════╗   ║
    ║   ║ STEP 6   tavily_search       — fetch web content  ║   ║
    ║   ║ STEP 7   reference_evaluator — score + dedup refs  ║   ║
    ║   ║ STEP 8   context_builder     — clean context prose ║   ║
    ║   ║ STEP 9a  image_retrieval     — find diagrams       ║   ║
    ║   ║ STEP 9b  image_validator     — Grok validate+explain║   ║
    ║   ║ STEP 10  content_writer      — write 5 slides      ║   ║
    ║   ║ STEP 11  store_submodule     — save to PostgreSQL  ║   ║
    ║   ║ STEP 12  submodule loop      ←──────────────────── ║   ║
    ║   ╚═══════════════════════════════════════════════════╝   ║
    ║   STEP 13  attach_refs        — finalise module refs       ║
    ║   STEP 13b fetch_videos       — YouTube search per module  ║
    ║   STEP 14  module loop        ←─────────────────────────── ║
    ╚═══════════════════════════════════════════════════════════╝
    │
    ▼ STEP 15  compile_course      — store full course in PostgreSQL
```

---

## Input Format (POST /api/generate)

```json
{
  "course_input": {
    "course_title": "Photosynthesis for Class 8",
    "skill_level": 2,
    "modules": [
      {
        "module_id": "M1",
        "title": "What is Photosynthesis?",
        "submodules": [
          { "submodule_id": "M1.1", "title": "Plants as Food Factories" },
          { "submodule_id": "M1.2", "title": "Sunlight, Water and Carbon Dioxide" }
        ]
      },
      {
        "module_id": "M2",
        "title": "Inside the Chloroplast",
        "submodules": [
          { "submodule_id": "M2.1", "title": "Chlorophyll and Light Absorption" },
          { "submodule_id": "M2.2", "title": "Glucose: The Plant's Energy Currency" }
        ]
      }
    ]
  }
}
```

**Skill levels:**

| Level | Label | Example audience |
|---|---|---|
| 1 | Beginner | No background, total newcomers |
| 2 | Elementary | School students, curious beginners |
| 3 | Intermediate | Undergrad, self-learners |
| 4 | Advanced | Professionals, grad students |
| 5 | Expert | Researchers, specialists |

---

## PostgreSQL Schema(INITIAL PHASE)

```sql
courses (
    course_id        TEXT PRIMARY KEY,
    course_title     TEXT,
    subject_domain   TEXT,     
    skill_level      INTEGER,
    skill_label      TEXT,
    total_modules    INTEGER,
    total_submodules INTEGER,
    total_slides     INTEGER,
    total_refs       INTEGER,
    total_images     INTEGER,
    total_videos     INTEGER,
    created_at       TIMESTAMPTZ,
    data             JSONB       
)

submodules (
    id           TEXT PRIMARY KEY, 
    course_id    TEXT (FK),
    module_id    TEXT,
    submodule_id TEXT,
    title        TEXT,
    skill_level  INTEGER,
    content      TEXT,
    slides       JSONB,
    images       JSONB,
    keywords     TEXT[],
    refs_count   INTEGER,
    stored_at    TIMESTAMPTZ
)
```

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Dashboard SPA |
| `GET` | `/api/courses` | List all courses |
| `GET` | `/api/course/{id}` | Full course JSON |
| `POST` | `/api/generate` | Start generation |
| `GET` | `/api/status/{job_id}` | SSE log stream |
| `GET` | `/api/result/{job_id}` | Final result |
| `GET` | `/api/logs/{job_id}` | Download text log |
| `GET` | `/api/health` | Status check |
