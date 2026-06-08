from typing import Any, Literal
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=800)
    use_recency: bool = True
    min_students: int = Field(default=30, ge=0, le=10000)
    top_n: int = Field(default=10, ge=1, le=25)
    user_profile: dict | None = None  # major, interests, coursesTaken from Clerk unsafeMetadata


class TableSpec(BaseModel):
    title: str
    columns: list[str]
    rows: list[dict[str, Any]]


class ChartSpec(BaseModel):
    chart_type: Literal["bar", "scatter", "line"]
    title: str
    description: str | None = None
    x_key: str
    y_key: str
    orientation: Literal["horizontal", "vertical"] = "vertical"
    data: list[dict[str, Any]]
    series: list[dict[str, Any]] | None = None


class ChatResponse(BaseModel):
    answer: str
    route: str
    warnings: list[str] = []
    tables: list[TableSpec] = []
    charts: list[ChartSpec] = []
    metadata: dict[str, Any] = {}
    schedule_actions: list[dict] = []  # sections for the frontend to add to the scheduler


class SearchItem(BaseModel):
    label: str
    metadata: dict[str, Any] = {}


class FeedbackRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=800)
    answer: str = Field(..., min_length=1, max_length=5000)
    route: str = Field(..., min_length=1, max_length=100)
    rating: Literal[1, -1]  # 1 = thumbs up, -1 = thumbs down
