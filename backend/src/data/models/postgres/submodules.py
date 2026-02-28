from sqlalchemy import Column, String, Integer, Text, JSON, DateTime, ForeignKey, ARRAY, func
from sqlalchemy.orm import relationship
from src.data.clients.postgresql_client import Base


class Submodule(Base):
    __tablename__ = "submodules"

    id = Column(String, primary_key=True)
    course_id = Column(String, ForeignKey("courses.course_id", ondelete="CASCADE"))

    module_id = Column(String)
    submodule_id = Column(String)
    title = Column(String)
    skill_level = Column(Integer)

    content = Column(Text)
    slides = Column(JSON)
    images = Column(JSON)
    keywords = Column(ARRAY(String))
    refs_count = Column(Integer, default=0)

    stored_at = Column(DateTime(timezone=True), server_default=func.now())

    course = relationship("Course", back_populates="submodules")

