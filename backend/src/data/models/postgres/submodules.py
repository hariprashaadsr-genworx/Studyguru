from sqlalchemy import Column, String, Integer, Text, JSON, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from src.data.clients.postgresql_client import Base


class Module(Base):
    __tablename__ = "modules"

    module_id = Column(String, primary_key=True)
    course_id = Column(String, ForeignKey("courses.course_id", ondelete="CASCADE"))
    title = Column(String, nullable=False)

    course = relationship("Course", back_populates="modules")
    submodules = relationship("Submodule", back_populates="module", cascade="all, delete-orphan")
    videos = relationship("Video", back_populates="module", cascade="all, delete-orphan")
    references = relationship("Reference", back_populates="module", cascade="all, delete-orphan")


class Submodule(Base):
    __tablename__ = "submodules"

    submodule_id = Column(String, primary_key=True)
    module_id = Column(String, ForeignKey("modules.module_id", ondelete="CASCADE"))
    course_id = Column(String, ForeignKey("courses.course_id", ondelete="CASCADE"))
    title = Column(String, nullable=False)
    skill_level = Column(Integer)
    content = Column(Text)
    stored_at = Column(DateTime(timezone=True), server_default=func.now())

    module = relationship("Module", back_populates="submodules")
    course = relationship("Course", back_populates="submodules")
    slides = relationship("Slide", back_populates="submodule", cascade="all, delete-orphan")


class Slide(Base):
    __tablename__ = "slides"

    slide_id = Column(Integer, primary_key=True, autoincrement=True)
    submodule_id = Column(String, ForeignKey("submodules.submodule_id", ondelete="CASCADE"))
    slide_content = Column(JSON)

    submodule = relationship("Submodule", back_populates="slides")


class Video(Base):
    __tablename__ = "videos"

    video_id = Column(Integer, primary_key=True, autoincrement=True)
    module_id = Column(String, ForeignKey("modules.module_id", ondelete="CASCADE"))
    youtube_url = Column(String)

    module = relationship("Module", back_populates="videos")


class Reference(Base):
    __tablename__ = "references"

    ref_id = Column(Integer, primary_key=True, autoincrement=True)
    module_id = Column(String, ForeignKey("modules.module_id", ondelete="CASCADE"))
    ref_link = Column(String)

    module = relationship("Module", back_populates="references")

