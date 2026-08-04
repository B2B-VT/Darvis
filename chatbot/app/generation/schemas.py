from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator


AnswerType = Literal[
    "course_recommendation",
    "course_comparison",
    "professor_recommendation",
    "professor_profile",
    "current_schedule",
    "schedule_recommendation",
    "major_requirements",
    "clarification_required",
    "insufficient_data",
    "refusal",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EvidenceItem(StrictModel):
    evidence_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_evidence_ids(self):
        if not self.evidence_ids:
            raise ValueError("factual item requires evidence_ids")
        return self


class CourseRecommendationItem(EvidenceItem):
    course: str
    title: str | None = None
    reason: str
    description: str | None = None
    limitations: list[str] = Field(default_factory=list)


class CourseRecommendationResponse(StrictModel):
    answer_type: Literal["course_recommendation"]
    summary: str
    recommendations: list[CourseRecommendationItem] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class CourseComparisonItem(EvidenceItem):
    course: str
    title: str | None = None
    description: str | None = None


class CourseComparisonResponse(StrictModel):
    answer_type: Literal["course_comparison"]
    summary: str
    courses: list[CourseComparisonItem] = Field(default_factory=list)
    comparison: list[dict[str, str | int | float | None]] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class ProfessorRecommendationItem(EvidenceItem):
    name: str
    reason: str
    avg_gpa: float | None = None
    student_count: int | None = None
    section_count: int | None = None
    limitations: list[str] = Field(default_factory=list)


class ProfessorRecommendationResponse(StrictModel):
    answer_type: Literal["professor_recommendation"]
    summary: str
    professors: list[ProfessorRecommendationItem] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class ProfessorProfileResponse(StrictModel):
    answer_type: Literal["professor_profile"]
    summary: str
    name: str
    evidence_ids: list[str] = Field(default_factory=list)
    courses: list[str] = Field(default_factory=list)
    avg_gpa: float | None = None
    student_count: int | None = None
    rating: float | None = None
    difficulty: float | None = None
    limitations: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_evidence_ids(self):
        if not self.evidence_ids:
            raise ValueError("professor profile requires evidence_ids")
        return self


class ScheduleSectionItem(EvidenceItem):
    course: str
    title: str | None = None
    instructor: str | None = None
    term: str | None = None
    days: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    open_seats: int | None = None
    limitations: list[str] = Field(default_factory=list)


class CurrentScheduleResponse(StrictModel):
    answer_type: Literal["current_schedule"]
    summary: str
    sections: list[ScheduleSectionItem] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class ScheduleRecommendationResponse(StrictModel):
    answer_type: Literal["schedule_recommendation"]
    summary: str
    sections: list[ScheduleSectionItem] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class MajorRequirementItem(EvidenceItem):
    course: str
    title: str | None = None
    requirement_group: str | None = None
    reason: str | None = None
    limitations: list[str] = Field(default_factory=list)


class MajorRequirementsResponse(StrictModel):
    answer_type: Literal["major_requirements"]
    summary: str
    requirements: list[MajorRequirementItem] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class ClarificationRequiredResponse(StrictModel):
    answer_type: Literal["clarification_required"]
    question: str
    options: list[str] = Field(default_factory=list)
    reason: str


class InsufficientDataResponse(StrictModel):
    answer_type: Literal["insufficient_data"]
    message: str
    missing_fields: list[str] = Field(default_factory=list)
    available_evidence: list[str] = Field(default_factory=list)
    next_question: str | None = None


class RefusalResponse(StrictModel):
    answer_type: Literal["refusal"]
    message: str
    reason: str


StructuredResponse = Annotated[
    Union[
        CourseRecommendationResponse,
        CourseComparisonResponse,
        ProfessorRecommendationResponse,
        ProfessorProfileResponse,
        CurrentScheduleResponse,
        ScheduleRecommendationResponse,
        MajorRequirementsResponse,
        ClarificationRequiredResponse,
        InsufficientDataResponse,
        RefusalResponse,
    ],
    Field(discriminator="answer_type"),
]


SCHEMA_BY_ANSWER_TYPE = {
    "course_recommendation": CourseRecommendationResponse,
    "course_comparison": CourseComparisonResponse,
    "professor_recommendation": ProfessorRecommendationResponse,
    "professor_profile": ProfessorProfileResponse,
    "current_schedule": CurrentScheduleResponse,
    "schedule_recommendation": ScheduleRecommendationResponse,
    "major_requirements": MajorRequirementsResponse,
    "clarification_required": ClarificationRequiredResponse,
    "insufficient_data": InsufficientDataResponse,
    "refusal": RefusalResponse,
}


def parse_structured_response(data: dict, expected_answer_type: str) -> StrictModel:
    if data.get("answer_type") != expected_answer_type:
        raise ValueError(f"answer_type_mismatch: expected {expected_answer_type}, got {data.get('answer_type')}")
    schema = SCHEMA_BY_ANSWER_TYPE.get(expected_answer_type)
    if schema is None:
        raise ValueError(f"unsupported_answer_type: {expected_answer_type}")
    return schema.model_validate(data)
