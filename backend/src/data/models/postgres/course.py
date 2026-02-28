from sqlalchemy import Column, String, Integer, JSON, DateTime, func
from sqlalchemy.orm import relationship
from src.data.models.postgres.submodules import Base


class Course(Base):
    __tablename__ = "courses"

    course_id = Column(String, primary_key=True)
    course_title = Column(String)
    subject_domain = Column(String)
    skill_level = Column(Integer)
    skill_label = Column(String)

    total_modules = Column(Integer, default=0)
    total_submodules = Column(Integer, default=0)
    total_slides = Column(Integer, default=0)
    total_refs = Column(Integer, default=0)
    total_images = Column(Integer, default=0)
    total_videos = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    data = Column(JSON)

    submodules = relationship(
        "Submodule",
        back_populates="course",
        cascade="all, delete-orphan"
    )

