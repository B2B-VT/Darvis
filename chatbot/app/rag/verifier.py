"""
app/rag/verifier.py

Sufficiency checking and honest missing-data handling.

Before a handler runs, main.py consults this module to decide whether the
question can be answered from data at all:

  - missing_data_answer(): the user asked about a catalog field the DB is
    known to lack (prerequisites, descriptions, Pathways) → return an honest
    deterministic answer instead of letting the LLM invent one.
  - check_plan(): entity-level sufficiency — does the referenced course exist,
    is the professor resolvable — returning warnings and (rarely) a
    clarification request.

The retry ladder for retrieval lives in the handlers themselves (exact →
fuzzy → semantic); this module is the gate that decides whether to run them
and what caveats must reach the user.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

logger = logging.getLogger("darvis.verifier")

# What to say when a catalog field is still genuinely empty DB-wide (currently
# just Pathways — description/prerequisites are scraped from catalog.vt.edu).
_MISSING_FIELD_ANSWERS = {
    "prerequisites": (
        "Darvis doesn't currently have prerequisite data for {course}. "
        "Check the official VT course catalog (catalog.vt.edu) for prerequisites — "
        "I can help with grade history, professors, and sections for it instead."
    ),
    "description": (
        "Darvis doesn't currently have course descriptions loaded for {course}. "
        "The official VT catalog (catalog.vt.edu) has the full description — "
        "I can tell you about its grade history, professors, or Fall 2026 sections."
    ),
    "pathways": (
        "Darvis doesn't currently have Pathways data for {course}. "
        "Check the VT Pathways site or the official catalog for Pathways designations — "
        "I can help with grade outcomes and scheduling for it instead."
    ),
}


@dataclass
class SufficiencyResult:
    sufficient: bool = True
    answer_override: str | None = None      # deterministic answer to return immediately
    warnings: list[str] = field(default_factory=list)
    clarification: str | None = None        # question to ask the user instead of answering


def missing_data_answer(plan, indexes=None) -> str | None:
    """
    Deterministic catalog-field answer for prerequisites/description/pathways
    questions. Two cases:
      - Field still empty DB-wide (indexes.empty_course_fields) → the honest
        "Darvis doesn't have this" message.
      - Field populated (post-scrape) → look up the specific course's value in
        indexes.course_descriptions / course_prerequisites and answer directly,
        instead of falling through to a handler that ignores the field.
    Returns None when the question isn't about one of these fields, or when a
    field is populated DB-wide but this specific course has no scraped value
    (stays silent rather than guessing "none exist").
    """
    fld = getattr(plan, "missing_data_field", None)
    if not fld or fld not in _MISSING_FIELD_ANSWERS:
        return None

    subject = getattr(plan, "subject", None)
    course_no = getattr(plan, "course_no", None)

    still_empty = indexes is None or fld in getattr(indexes, "empty_course_fields", set())
    if still_empty:
        if subject and course_no:
            course = f"{subject} {course_no}"
        elif course_no:
            course = str(course_no)
        else:
            course = "that course"
        return _MISSING_FIELD_ANSWERS[fld].format(course=course)

    if fld not in ("description", "prerequisites") or not (subject and course_no):
        return None
    key = (subject.upper(), course_no.strip())
    lookup = indexes.course_descriptions if fld == "description" else indexes.course_prerequisites
    val = lookup.get(key)
    if not val:
        return None
    return f"{subject} {course_no} — {val}" if fld == "description" else f"Prerequisites for {subject} {course_no}: {val}"


def check_plan(plan, indexes=None, resolver=None) -> SufficiencyResult:
    """
    Entity-level sufficiency check before handler dispatch.
    Non-fatal problems become warnings; fatal ones become an answer_override
    or clarification so the user gets an honest response instead of a wrong one.
    """
    result = SufficiencyResult()

    # Honest missing-data short-circuit (prereqs/descriptions/pathways)
    override = missing_data_answer(plan, indexes)
    if override:
        result.sufficient = False
        result.answer_override = override
        return result

    # Referenced course doesn't exist in any dataset → say so, don't guess
    subject = getattr(plan, "subject", None)
    course_no = getattr(plan, "course_no", None)
    if subject and course_no and indexes is not None and indexes.known_course_codes:
        if not indexes.course_exists(subject, course_no):
            result.sufficient = False
            result.answer_override = (
                f"I couldn't find {subject} {course_no} in the VT data Darvis has "
                f"(grade history 2020–2026 and Fall 2026 sections). "
                "Double-check the course code, or try browsing the Courses page."
            )
            return result

    # Explicit clarification request from the planner — honor it only when the
    # plan really has nothing to work with (avoid over-asking).
    if getattr(plan, "needs_clarification", False) and getattr(plan, "clarifying_question", None):
        has_entity = any([
            subject, course_no,
            getattr(plan, "professor_name", None),
            getattr(plan, "major_query", None),
            getattr(plan, "requested_courses", None),
        ])
        if not has_entity:
            result.sufficient = False
            result.clarification = plan.clarifying_question
            return result

    return result


def resolution_warnings(resolved) -> list[str]:
    """Convert a ResolvedEntity's ambiguity/low-confidence state into user warnings."""
    out: list[str] = []
    if resolved is None:
        return out
    if getattr(resolved, "warning", None):
        out.append(resolved.warning)
    return out
