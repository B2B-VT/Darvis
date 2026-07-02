"""
app/rag/planner_models.py

Pydantic models for the query-planning layer.

QueryPlan is a strict, validated superset of the old ChatIntent dataclass:
every handler-facing field keeps its old name and semantics so existing
handlers work unchanged, while new fields (capabilities, excluded_days,
min_rmp, missing_data_field, needs_clarification) power capability-based
routing and honest missing-data answers.

Validation strategy: the LLM's raw JSON is coerced field-by-field with
safe defaults — a single malformed field degrades to its default instead of
discarding the whole plan.
"""

from __future__ import annotations

import re

from pydantic import BaseModel, Field, field_validator

VALID_ROUTES = {
    "course_profile", "professor_profile", "natural_filter",
    "major_requirements", "schedule_builder", "section_lookup",
    "general_rag", "out_of_scope",
}

VALID_CAPABILITIES = {
    "course_lookup", "course_comparison", "instructor_lookup",
    "instructor_comparison", "grade_distribution", "section_lookup",
    "schedule_build", "major_requirement_lookup", "natural_language_filter",
    "general_question", "unsupported_or_missing_data",
}

VALID_SORT_GOALS = {
    "highest_gpa", "lowest_gpa", "highest_f_rate", "lowest_f_rate",
    "most_withdraws", "lowest_withdraws", "highest_a_rate",
    "largest_sample", "times_taught",
}

# Catalog fields the DB is known to lack (verified empty) — the planner flags
# questions about them so the answer layer can be honest instead of guessing.
MISSING_DATA_FIELDS = {"prerequisites", "description", "pathways"}

_DAY_CODES = {"M", "T", "W", "R", "F", "S", "U"}
_DAY_NAME_TO_CODE = {
    "monday": "M", "tuesday": "T", "wednesday": "W", "thursday": "R",
    "friday": "F", "saturday": "S", "sunday": "U",
    "mon": "M", "tue": "T", "tues": "T", "wed": "W", "thu": "R",
    "thur": "R", "thurs": "R", "fri": "F", "sat": "S", "sun": "U",
}


def coerce_time(val) -> str | None:
    """
    Accept 'HH:MM', 'HH:MM:SS', 'H:MM am/pm', '1pm', '8am', 'noon' → 'HH:MM' 24h.
    Returns None for anything unparseable. The old parser only accepted 'HH:MM',
    which silently dropped LLM outputs like '13:00:00' or '1:00 PM'.
    """
    if val is None:
        return None
    s = str(val).strip().lower()
    if not s or s in ("null", "none"):
        return None
    if s == "noon":
        return "12:00"
    if s == "midnight":
        return "00:00"
    m = re.match(r"^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$", s)
    if m:
        h, mi, ampm = int(m.group(1)), m.group(2), m.group(3)
        if ampm == "pm" and h != 12:
            h += 12
        elif ampm == "am" and h == 12:
            h = 0
        if 0 <= h <= 23:
            return f"{h:02d}:{mi}"
        return None
    m = re.match(r"^(\d{1,2})\s*(am|pm)$", s)
    if m:
        h, ampm = int(m.group(1)), m.group(2)
        if ampm == "pm" and h != 12:
            h += 12
        elif ampm == "am" and h == 12:
            h = 0
        if 0 <= h <= 23:
            return f"{h:02d}:00"
    return None


class QueryPlan(BaseModel):
    """Structured plan for one user question. Field names match the old ChatIntent."""

    route: str = "general_rag"
    capabilities: list[str] = Field(default_factory=list)
    confidence: float = 1.0

    # course_profile
    subject: str | None = None
    course_no: str | None = None
    wants_rmp: bool = False
    # professor_profile
    professor_name: str | None = None
    # natural_filter
    sort_goal: str = "highest_gpa"
    min_students: int = 30
    min_gpa: float | None = None
    min_terms: int | None = None
    level_low: int | None = None
    level_high: int | None = None
    wants_professors: bool | None = None
    # major_requirements
    major_query: str | None = None
    # schedule_builder
    time_start: str | None = None
    time_end: str | None = None
    subject_filter: str | None = None
    requested_courses: list = Field(default_factory=list)
    excluded_days: list[str] = Field(default_factory=list)
    min_rmp: float | None = None
    target_credits: int | None = None
    open_seats_only: bool = False
    # display hint
    display_n: int | None = None
    # honest-missing-data flag: user asks about a field the DB doesn't have
    missing_data_field: str | None = None
    # clarification
    needs_clarification: bool = False
    clarifying_question: str | None = None

    # ── validators: degrade bad fields to defaults instead of failing the plan ──

    @field_validator("route", mode="before")
    @classmethod
    def _route(cls, v):
        return v if v in VALID_ROUTES else "general_rag"

    @field_validator("capabilities", mode="before")
    @classmethod
    def _caps(cls, v):
        if not isinstance(v, list):
            return []
        return [c for c in v if c in VALID_CAPABILITIES]

    @field_validator("sort_goal", mode="before")
    @classmethod
    def _sort(cls, v):
        return v if v in VALID_SORT_GOALS else "highest_gpa"

    @field_validator("confidence", mode="before")
    @classmethod
    def _conf(cls, v):
        try:
            return min(1.0, max(0.0, float(v)))
        except (TypeError, ValueError):
            return 0.8

    @field_validator("time_start", "time_end", mode="before")
    @classmethod
    def _times(cls, v):
        return coerce_time(v)

    @field_validator("subject", "subject_filter", mode="before")
    @classmethod
    def _upper(cls, v):
        s = str(v or "").strip().upper()
        return s or None

    @field_validator("course_no", "professor_name", "major_query", mode="before")
    @classmethod
    def _strip(cls, v):
        s = str(v or "").strip()
        return s or None

    @field_validator("min_students", mode="before")
    @classmethod
    def _min_students(cls, v):
        try:
            return max(0, int(v))
        except (TypeError, ValueError):
            return 30

    @field_validator("min_gpa", "min_rmp", mode="before")
    @classmethod
    def _floats(cls, v):
        if v is None:
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    @field_validator("min_terms", "level_low", "level_high", "display_n", "target_credits", mode="before")
    @classmethod
    def _ints(cls, v):
        if v is None:
            return None
        try:
            return int(v)
        except (TypeError, ValueError):
            return None

    @field_validator("excluded_days", mode="before")
    @classmethod
    def _days(cls, v):
        if not isinstance(v, list):
            return []
        out = []
        for d in v:
            s = str(d or "").strip()
            code = s.upper() if s.upper() in _DAY_CODES else _DAY_NAME_TO_CODE.get(s.lower())
            if code and code not in out:
                out.append(code)
        return out

    @field_validator("requested_courses", mode="before")
    @classmethod
    def _course_list(cls, v):
        out = []
        for c in (v or []):
            if isinstance(c, (list, tuple)) and len(c) >= 2:
                out.append((str(c[0]).upper().strip(), str(c[1]).strip()))
            elif isinstance(c, dict):
                s = c.get("subject") or c.get("s", "")
                n = c.get("course_no") or c.get("no") or c.get("number", "")
                if s and n:
                    out.append((str(s).upper().strip(), str(n).strip()))
            elif isinstance(c, str):
                m = re.match(r"^([A-Za-z]{2,5})\s*-?\s*(\d{4})$", c.strip())
                if m:
                    out.append((m.group(1).upper(), m.group(2)))
        return out

    @field_validator("missing_data_field", mode="before")
    @classmethod
    def _missing(cls, v):
        s = str(v or "").strip().lower()
        return s if s in MISSING_DATA_FIELDS else None
