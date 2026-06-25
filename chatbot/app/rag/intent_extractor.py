"""
app/rag/intent_extractor.py

LLM-based intent extraction. Replaces the keyword router and detect_natural_params().

Instead of ~150 hardcoded keyword phrases deciding what the user wants, Gemma reads
the question and returns structured JSON describing exactly what data to fetch.

Flow:
  question → Gemma (fast, low-token, no system prompt) → JSON intent
                ↓ on failure
          keyword fallback (existing router + detect_natural_params)

The intent JSON drives all downstream handlers:
  - Which Pandas analytics function to call (route)
  - What parameters to pass (course, professor, sort goal, filters, etc.)
  - What to show the user (display_n)

Why this is better than keyword matching:
  - "which prof is brutal for algorithms?" → route=course_profile, course_no=3114, sort_goal=lowest_gpa
  - "is Hamouda good?" → route=professor_profile, professor_name=Hamouda
  - "I want to keep my GPA up, what should I avoid?" → route=natural_filter, sort_goal=lowest_gpa
  - "what do I need for cs?" → route=major_requirements, major_query=Computer Science
  All of these would fail or misroute with pure keyword matching.
"""

from __future__ import annotations

import concurrent.futures
import json
import logging
import re
from dataclasses import dataclass, field

logger = logging.getLogger("darvis.intent")

# ── Intent model ──────────────────────────────────────────────────────────────

@dataclass
class ChatIntent:
    route: str = "general_rag"
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
    subject_filter: str | None = None        # "just CS courses"
    requested_courses: list = field(default_factory=list)
    # display hint
    display_n: int | None = None
    # confidence (0–1): low means fallback to keywords
    confidence: float = 1.0


# ── Intent extraction prompt ──────────────────────────────────────────────────

_INTENT_PROMPT = """Extract the intent from this VT student question as JSON. Return ONLY valid JSON, nothing else.

ROUTES:
- "course_profile": asking about a specific course (CS 3114, algorithms, data structures, etc.)
- "professor_profile": asking about a specific professor by name, or RMP/rating
- "natural_filter": ranking/filtering/comparing courses or professors without a specific one
- "major_requirements": graduation requirements, what courses needed for a degree/major
- "schedule_builder": building or creating a class schedule
- "section_lookup": who is teaching a course this semester, what times/days is a course offered, when does a specific professor teach a specific course this semester
- "general_rag": general VT questions, campus info, anything else

VT COURSE NICKNAMES (use these to fill course_no):
algorithms or data structures and algorithms = CS 3114
intro data structures = CS 2114
systems software = CS 3214
software design or software engineering = CS 3704
computer organization = CS 2506
intro programming = CS 1064 or CS 1114
networks or computer networks = CS 4264
operating systems = CS 3204
theory of computation = CS 4504
compilers = CS 4205
discrete math = CS 2505
machine learning = CS 4824
artificial intelligence = CS 4804
databases = CS 4604

SORT GOAL — pick the most fitting one:
- "highest_gpa": best grades, easiest, strongest outcomes, high GPA
- "lowest_gpa": hardest, brutal, worst grades, tough, avoid
- "highest_f_rate": most failing, highest failure rate
- "lowest_f_rate": fewest failures, easiest to pass
- "highest_a_rate": most As, best A rate
- "most_withdraws": most drops/withdrawals
- "lowest_withdraws": fewest drops
- "largest_sample": most data, most students, most reliable
- "times_taught": most experienced, taught most often

DISPLAY HINT:
- 3 for ranking questions ("who is best", "top professors")
- 1 for single profile lookups
- null for list/browse questions

Return this JSON shape (omit fields that don't apply):
{
  "route": "...",
  "confidence": 0.0-1.0,
  "subject": "CS",
  "course_no": "3114",
  "professor_name": "Hamouda",
  "wants_rmp": false,
  "sort_goal": "highest_gpa",
  "min_students": 30,
  "min_gpa": null,
  "min_terms": null,
  "level_low": null,
  "level_high": null,
  "wants_professors": null,
  "major_query": "Computer Science",
  "time_start": null,
  "time_end": null,
  "subject_filter": null,
  "requested_courses": [],
  "display_n": null
}

Question: """


# ── Extractor ─────────────────────────────────────────────────────────────────

class IntentExtractor:
    """
    Calls Gemma to extract structured intent from a user question.
    Falls back to keyword extraction silently on any failure.
    """

    def __init__(self, gemma_client, settings=None):
        from app.config import get_settings
        cfg = settings or get_settings()
        self._llm = gemma_client
        self._enabled = True
        self._timeout_s: float = getattr(cfg, "rag_intent_timeout_s", 5.0)
        logger.info("[intent] LLM intent extractor ready (timeout=%.1fs)", self._timeout_s)

    def extract(self, question: str) -> ChatIntent:
        """
        Returns a ChatIntent derived from LLM understanding.
        Falls back to keyword extraction if the LLM call fails or returns garbage.
        """
        if not self._enabled or self._llm is None:
            return self._keyword_fallback(question)

        try:
            intent = self._llm_extract(question)
            if intent is not None and intent.confidence >= 0.5:
                logger.debug(
                    "[intent] LLM route=%s conf=%.2f subject=%s course=%s prof=%s sort=%s",
                    intent.route, intent.confidence,
                    intent.subject, intent.course_no,
                    intent.professor_name, intent.sort_goal,
                )
                return intent
        except Exception as exc:
            logger.warning("[intent] LLM extraction failed, using keyword fallback: %s", exc)

        return self._keyword_fallback(question)

    def _llm_extract(self, question: str) -> ChatIntent | None:
        """
        Call Gemma with the intent prompt, bounded by _timeout_s. Returns None on
        failure or timeout.

        Same shutdown(wait=False) pattern as QueryRewriter: avoids blocking for the
        full HTTP timeout when future.result() raises TimeoutError.
        """
        prompt = _INTENT_PROMPT + question
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        future = executor.submit(self._llm.answer_raw, prompt, 300)
        try:
            raw = future.result(timeout=self._timeout_s)
        except concurrent.futures.TimeoutError:
            executor.shutdown(wait=False)
            logger.debug("[intent] LLM extraction timed out after %.1fs", self._timeout_s)
            return None
        except Exception as exc:
            executor.shutdown(wait=False)
            logger.debug("[intent] LLM call failed: %s", exc)
            return None
        executor.shutdown(wait=False)

        if not raw:
            return None

        # Gemma sometimes wraps JSON in markdown — strip it
        raw = raw.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

        # Extract just the JSON object if there's surrounding text
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            logger.debug("[intent] No JSON found in LLM output: %r", raw[:100])
            return None

        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError as e:
            logger.debug("[intent] JSON parse failed: %s | raw=%r", e, raw[:100])
            return None

        return self._dict_to_intent(data, question)

    def _dict_to_intent(self, data: dict, question: str) -> ChatIntent:
        """Safely coerce the parsed JSON dict into a ChatIntent."""
        valid_routes = {
            "course_profile", "professor_profile", "natural_filter",
            "major_requirements", "schedule_builder", "section_lookup",
            "general_rag", "out_of_scope",
        }
        valid_sort_goals = {
            "highest_gpa", "lowest_gpa", "highest_f_rate", "lowest_f_rate",
            "most_withdraws", "lowest_withdraws", "highest_a_rate",
            "largest_sample", "times_taught",
        }

        route = data.get("route", "general_rag")
        if route not in valid_routes:
            route = "general_rag"

        sort_goal = data.get("sort_goal", "highest_gpa")
        if sort_goal not in valid_sort_goals:
            sort_goal = "highest_gpa"

        # Parse time values — accept "HH:MM" or null
        def parse_time(val) -> str | None:
            if not val or not isinstance(val, str):
                return None
            val = val.strip()
            if re.match(r"^\d{1,2}:\d{2}$", val):
                h, m = val.split(":")
                return f"{int(h):02d}:{m}"
            return None

        # Parse requested_courses — accept [["CS","3114"]] or [{"subject":"CS","no":"3114"}]
        raw_courses = data.get("requested_courses") or []
        requested_courses = []
        for c in raw_courses:
            if isinstance(c, (list, tuple)) and len(c) >= 2:
                requested_courses.append((str(c[0]).upper(), str(c[1])))
            elif isinstance(c, dict):
                s = c.get("subject") or c.get("s", "")
                n = c.get("course_no") or c.get("no") or c.get("number", "")
                if s and n:
                    requested_courses.append((str(s).upper(), str(n)))

        return ChatIntent(
            route=route,
            confidence=float(data.get("confidence", 0.8)),
            subject=(data.get("subject") or "").upper() or None,
            course_no=str(data.get("course_no", "") or "").strip() or None,
            wants_rmp=bool(data.get("wants_rmp", False)),
            professor_name=str(data.get("professor_name", "") or "").strip() or None,
            sort_goal=sort_goal,
            min_students=int(data.get("min_students") or 30),
            min_gpa=float(data["min_gpa"]) if data.get("min_gpa") is not None else None,
            min_terms=int(data["min_terms"]) if data.get("min_terms") is not None else None,
            level_low=int(data["level_low"]) if data.get("level_low") is not None else None,
            level_high=int(data["level_high"]) if data.get("level_high") is not None else None,
            wants_professors=data.get("wants_professors"),  # may be None/True/False
            major_query=str(data.get("major_query", "") or "").strip() or None,
            time_start=parse_time(data.get("time_start")),
            time_end=parse_time(data.get("time_end")),
            subject_filter=(data.get("subject_filter") or "").upper() or None,
            requested_courses=requested_courses,
            display_n=int(data["display_n"]) if data.get("display_n") is not None else None,
        )

    # ── Keyword fallback ──────────────────────────────────────────────────────

    def _keyword_fallback(self, question: str) -> ChatIntent:
        """
        Reproduces the old keyword system as a ChatIntent.
        Used when the LLM is unavailable or returns low-confidence output.
        """
        from app.features.router import route_question, extract_professor_name_from_profile_question
        from app.data.analytics import detect_natural_params, extract_course_parts, detect_subject_filter, detect_course_level
        from app.features.schedule_builder import parse_time_constraints, parse_requested_courses, parse_subject_filter
        from app.features.major_requirements import _extract_major_query

        route = route_question(question)
        params = detect_natural_params(question)
        subject, course_no = extract_course_parts(question)
        if subject is None and course_no is None:
            subject = detect_subject_filter(question)
        level_low, level_high = detect_course_level(question)

        return ChatIntent(
            route=route,
            confidence=0.7,
            subject=subject,
            course_no=course_no,
            wants_rmp=any(kw in question.lower() for kw in ["rmp", "rate my professor"]),
            professor_name=(
                extract_professor_name_from_profile_question(question)
                if route == "professor_profile" else None
            ),
            sort_goal=params.get("sort_goal", "highest_gpa"),
            min_students=params.get("min_students", 30),
            min_gpa=params.get("min_gpa"),
            min_terms=params.get("min_terms"),
            level_low=level_low,
            level_high=level_high,
            major_query=(
                _extract_major_query(question)
                if route == "major_requirements" else None
            ),
            time_start=parse_time_constraints(question)[0] if route == "schedule_builder" else None,
            time_end=parse_time_constraints(question)[1] if route == "schedule_builder" else None,
            subject_filter=parse_subject_filter(question) if route == "schedule_builder" else None,
            requested_courses=parse_requested_courses(question) if route == "schedule_builder" else [],
        )
