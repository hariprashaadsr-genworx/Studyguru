from sqlalchemy import Column, String, Integer, JSON, DateTime, Text, func
from src.data.clients.postgresql_client import Base


class CustomCourse(Base):
    __tablename__ = "custom_courses"

    custom_course_id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)  # from auth JWT
    base_course_id = Column(String, nullable=False, index=True)
    course_title = Column(String, nullable=False)
    subject_domain = Column(String)

    # Customization settings
    tone = Column(String, default="friendly")           # formal, friendly, casual
    easiness_level = Column(Integer, default=3)         # 1-5
    use_analogies = Column(String, default="no")        # yes / no
    analogy_style = Column(String, default="everyday")  # everyday, technical, creative
    course_mode = Column(String, default="custom")      # "base" or "custom"

    # Selected module/submodule IDs from the base course
    selected_modules = Column(JSON)     # [{"module_id": "...", "submodule_ids": [...]}]

    # Full custom course data (same structure as base course data)
    total_modules = Column(Integer, default=0)
    total_submodules = Column(Integer, default=0)
    total_slides = Column(Integer, default=0)
    data = Column(JSON)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
