from typing import List, Optional, TypedDict
from pydantic import BaseModel, Field

class CourseState(TypedDict):
    job_id:        str
    course_id:     str
    course_title:  str
    skill_level:   int
    subject_domain: str
    subject_type:  str
    education_level: str
    modules:       List[dict]

    cur_mod_idx:   int
    cur_sub_idx:   int

    raw_results:   List[dict]
    eval_refs:     List[dict]
    clean_context: str
    cand_images:   List[dict]
    cur_images:    List[dict]   

    used_urls:     List[str]
    covered:       List[str]   

    status:        str
    progress_log:  List[str]
    error:         Optional[str]

class GenerateRequest(BaseModel):
    course_input: dict

class SyllabusRequest(BaseModel):
    syllabus: str

class SubModule(BaseModel):
    submodule_id: str = Field(..., description="Unique submodule ID like M1.1")
    title: str


class Module(BaseModel):
    module_id: str = Field(..., description="Unique module ID like M1")
    title: str
    submodules: List[SubModule]


class CourseStructure(BaseModel):
    course_title: str
    modules: List[Module]