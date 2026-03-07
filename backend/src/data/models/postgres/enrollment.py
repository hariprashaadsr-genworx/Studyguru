"""
Models for student enrollments and questions.
"""
from sqlalchemy import Column, String, Integer, JSON, DateTime, Boolean, Text, func
from src.data.clients.postgresql_client import Base


class StudentEnrollment(Base):
    __tablename__ = "student_enrollments"

    enrollment_id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    course_id = Column(String, nullable=False, index=True)
    selected_modules = Column(JSON)  # [{"module_id":"M1","submodule_ids":["M1.1","M1.2"]}]
    progress = Column(JSON, default=dict)
    # progress schema:
    # {
    #   "visited": ["M1::M1.1", "M1::M1.2", ...],  # "module_id::submodule_id" keys
    #   "module_tests_passed": ["M1", "M2"],         # module_ids that passed quiz
    #   "final_passed": false
    # }
    status = Column(String, default="active")   # active | completed
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Question(Base):
    __tablename__ = "questions"

    question_id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(String, nullable=False, index=True)
    enrollment_id = Column(String, nullable=True, index=True)  # per-user questions; null = legacy shared
    module_id = Column(String, nullable=True, index=True)  # null for final assessment
    question_type = Column(String, nullable=False)  # "mcq" | "true_false"
    question_text = Column(Text, nullable=False)
    options = Column(JSON)        # ["opt A","opt B","opt C","opt D"] or ["True","False"]
    correct_answer = Column(String, nullable=False)
    hints = Column(JSON)          # ["hint1","hint2","hint3"]
    is_final = Column(Boolean, default=False)
