from src.schemas.generation import CourseState
from src.control.nodes.generation_nodes import preprocessor, planning_agent, tavily_search, reference_evaluator, context_builder, image_retrieval, image_validator, content_writer, _route_mod, _route_sub
from src.control.nodes.generation_nodes import store_submodule_node, advance_submodule, attach_module_refs, fetch_module_videos, advance_module, compile_course
import uuid
from langgraph.graph import StateGraph, END
from sqlalchemy.ext.asyncio import AsyncSession


def _build():
    g = StateGraph(CourseState)

    for name, fn in [
        ("preprocessor",      preprocessor),
        ("planning_agent",    planning_agent),
        ("tavily_search",     tavily_search),
        ("ref_evaluator",     reference_evaluator),
        ("context_builder",   context_builder),
        ("image_retrieval",   image_retrieval),
        ("image_validator",   image_validator),
        ("content_writer",    content_writer),
        ("store_submodule",   store_submodule_node),
        ("advance_sub",       advance_submodule),
        ("attach_refs",       attach_module_refs),
        ("fetch_videos",      fetch_module_videos),
        ("advance_mod",       advance_module),
        ("compile_course",    compile_course),
    ]:
        g.add_node(name, fn)

    g.set_entry_point("preprocessor")
    g.add_edge("preprocessor",    "planning_agent")
    g.add_edge("planning_agent",  "tavily_search")

    g.add_edge("tavily_search",  "ref_evaluator")
    g.add_edge("ref_evaluator",  "context_builder")
    g.add_edge("context_builder","image_retrieval")
    g.add_edge("image_retrieval","image_validator")
    g.add_edge("image_validator","content_writer")
    g.add_edge("content_writer", "store_submodule")
    g.add_edge("store_submodule","advance_sub")

    g.add_conditional_edges("advance_sub", _route_sub,
        {"more": "tavily_search", "done": "attach_refs"})

    g.add_edge("attach_refs", "fetch_videos")
    g.add_edge("fetch_videos","advance_mod")

    g.add_conditional_edges("advance_mod", _route_mod,
        {"more": "tavily_search", "done": "compile_course"})

    g.add_edge("compile_course", END)
    return g.compile()

workflow = _build()




async def run_workflow(course_input: dict, job_id: str, 
    db: AsyncSession) -> CourseState:

    modules = course_input["modules"]
    total_mods = len(modules)
    total_subs = sum(len(m.get("submodules", [])) for m in modules)

    rec_limit = max(150, (total_subs * 10 + total_mods * 3 + 5) * 2)

    sk = max(1, min(5, int(course_input.get("skill_level", 3))))

    initial: CourseState = {
        "job_id": job_id,
        "course_id": str(uuid.uuid4()),
        "course_title": course_input["course_title"],
        "skill_level": sk,
        "subject_domain": "",
        "modules": modules,
        "cur_mod_idx": 0,
        "cur_sub_idx": 0,
        "raw_results": [],
        "eval_refs": [],
        "clean_context": "",
        "cand_images": [],
        "cur_images": [],
        "used_urls": [],
        "covered": [],
        "status": "starting",
        "progress_log": [],
        "error": None,
    }

    result = await workflow.ainvoke(
        initial,
        config={
            "recursion_limit": rec_limit,
            "configurable": {
                "db": db,
            }, 
        },
    )

    return result