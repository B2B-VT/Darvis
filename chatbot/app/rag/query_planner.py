"""
app/rag/query_planner.py

LLM query planner — the single routing/parameter-extraction layer for /chat.

Replaces both the old IntentExtractor and the hardcoded section-signal override
that lived in main.py. The LLM reads the question (handling typos, slang, and
abbreviations natively) and returns structured JSON; the JSON is validated
strictly through the Pydantic QueryPlan model, repaired once if malformed, and
falls back to a deterministic keyword classifier when the LLM is unavailable.

Plans for repeated questions are served from a bounded in-memory cache keyed on
the normalized question, so back-to-back identical queries skip the LLM
entirely.
"""

from __future__ import annotations

import concurrent.futures
import json
import logging
import re
from collections import OrderedDict

from pydantic import ValidationError

from app.rag.planner_models import QueryPlan

logger = logging.getLogger("darvis.planner")

_CACHE_MAX = 256

_PLAN_PROMPT = """Extract a structured query plan from this Virginia Tech student question as JSON. Return ONLY valid JSON, nothing else. The student may use typos, slang, or abbreviations — interpret them naturally ("least cooked" = easiest, "avoid 8ams" = no classes before 09:00, "easy A" = highest A rate).

ROUTES (pick exactly one):
- "course_profile": asking about a specific course's professors/grades (CS 3114, algorithms, etc.)
- "professor_profile": asking about a specific professor by name, or their RMP/rating
- "natural_filter": ranking/filtering/comparing courses or professors without a specific one
- "major_requirements": graduation requirements, what courses are needed for a degree/major
- "schedule_builder": building/creating/making a class schedule
- "section_lookup": CURRENT-SEMESTER timetable facts — who is teaching a course this semester/fall, what times/days a course meets, where it is held, seat availability ("is CS 3114 full?", "open seats", "what building"), which sections are offered
- "general_rag": general VT questions, campus info, anything else

ROUTE DISAMBIGUATION (these matter — read carefully):
- "who is teaching CS 1114 this fall?" → section_lookup (current-term fact), NOT course_profile
- "who should I take for CS 1114?" → course_profile (historical grade comparison)
- "what time does CS 3114 meet?" → section_lookup
- "of the professors teaching CS 3114, who is best?" → section_lookup
- "make me a schedule with CS 1114" → schedule_builder

CAPABILITIES (list all that apply):
course_lookup, course_comparison, instructor_lookup, instructor_comparison, grade_distribution, section_lookup, schedule_build, major_requirement_lookup, natural_language_filter, general_question, unsupported_or_missing_data

VT COURSE NICKNAMES (use to fill course_no):
algorithms or data structures and algorithms = CS 3114; intro data structures = CS 2114; systems software = CS 3214; software design or software engineering = CS 3704; computer organization = CS 2506; intro programming = CS 1064 or CS 1114; operating systems = CS 3204; discrete math = CS 2505; machine learning = CS 4824; artificial intelligence = CS 4804; databases = CS 4604; calc or calculus = MATH 1225 or MATH 1226; linear algebra = MATH 2114

SORT GOAL — pick the most fitting:
"highest_gpa" (easiest, best grades, easy A, chill), "lowest_gpa" (hardest, brutal, avoid), "highest_f_rate", "lowest_f_rate", "highest_a_rate", "most_withdraws", "lowest_withdraws", "largest_sample", "times_taught"

CATALOG FIELDS: for questions about a course's prerequisites or official catalog description, set missing_data_field to "prerequisites" or "description" (route can stay course_profile) — a deterministic lookup answers these precisely from catalog data. Darvis has NO VT Pathways data — for Pathways questions set missing_data_field to "pathways".

IMPORTANT RULES:
- professor_name must be a PERSON'S name. NEVER put adjectives (hardest, easiest, best, chill) there — those belong in sort_goal.
- A course number without a subject (e.g. "2505") defaults subject to "CS" unless context says otherwise.
- Times: output 24h "HH:MM". "after 1pm" → time_start="13:00". "before 5pm" → time_end="17:00". "no 8ams"/"avoid 8ams" → time_start="09:00". "morning classes only" → time_end="12:00".
- excluded_days: day codes for days the student wants NO classes. "no friday classes" → ["F"]. Codes: M T W R F.
- min_gpa: a GPA floor ("nothing below 3.5", "gpa of 3.5 or higher") → 3.5.
- min_rmp: an RMP floor ("professors rated 4+", "RMP above 3.5") → the number.
- open_seats_only: true if they ask for open/available seats only.
- target_credits: "19 credits" → 19.
- requested_courses: explicit course codes as [["CS","1114"],["MATH","1225"]]. "cs1114 and math1225" → [["CS","1114"],["MATH","1225"]].
- needs_clarification: true ONLY if the question is impossible to act on without more info (e.g. bare "which professor?" with no course anywhere in it). Prefer false — assume sensibly and note assumptions.

Return this JSON shape (omit fields that don't apply):
{
  "route": "...",
  "capabilities": ["..."],
  "confidence": 0.0-1.0,
  "subject": "CS",
  "course_no": "3114",
  "professor_name": null,
  "wants_rmp": false,
  "sort_goal": "highest_gpa",
  "min_students": 30,
  "min_gpa": null,
  "min_terms": null,
  "level_low": null,
  "level_high": null,
  "wants_professors": null,
  "major_query": null,
  "time_start": null,
  "time_end": null,
  "subject_filter": null,
  "requested_courses": [],
  "excluded_days": [],
  "min_rmp": null,
  "target_credits": null,
  "open_seats_only": false,
  "display_n": null,
  "missing_data_field": null,
  "needs_clarification": false,
  "clarifying_question": null
}

Question: """


def _msg_role_content(msg) -> tuple[str | None, str | None]:
    role = msg.get("role") if isinstance(msg, dict) else getattr(msg, "role", None)
    content = msg.get("content") if isinstance(msg, dict) else getattr(msg, "content", None)
    return role, content


def _format_question_with_history(question: str, history: list | None) -> str:
    """Prepend the last 4 turns of conversation history as grounding context, so
    follow-ups like "who teaches it?" resolve against the prior turn."""
    if not history:
        return question
    lines = ["Prior conversation:"]
    for msg in history[-4:]:
        role, content = _msg_role_content(msg)
        if not content:
            continue
        label = "User" if role == "user" else "Assistant"
        lines.append(f"{label}: {content}")
    lines.append(f"Current question: {question}")
    return "\n".join(lines)


def _repair_json(raw: str) -> str:
    """
    One-shot deterministic repair for near-valid LLM JSON: trailing commas,
    Python literals, and unquoted null-ish values. Never calls the LLM again.
    """
    s = raw
    s = re.sub(r",\s*([}\]])", r"\1", s)            # trailing commas
    s = re.sub(r"\bTrue\b", "true", s)
    s = re.sub(r"\bFalse\b", "false", s)
    s = re.sub(r"\bNone\b", "null", s)
    s = re.sub(r"\bNaN\b", "null", s)
    return s


class QueryPlanner:
    """
    plan(question) → QueryPlan.
    LLM extraction with strict validation → deterministic repair → keyword fallback.
    """

    def __init__(self, llm_client, settings=None):
        from app.config import get_settings
        cfg = settings or get_settings()
        self._llm = llm_client
        self._timeout_s: float = getattr(cfg, "rag_intent_timeout_s", 5.0)
        self._cache: OrderedDict[str, QueryPlan] = OrderedDict()
        logger.info("[planner] QueryPlanner ready (timeout=%.1fs, cache=%d)", self._timeout_s, _CACHE_MAX)

    def plan(self, question: str, history: list | None = None) -> QueryPlan:
        cache_key = re.sub(r"\s+", " ", question.strip().lower())
        if history:
            # Fold the same grounding window into the cache key so a repeated
            # question with different prior context (e.g. "who teaches it?"
            # after two different courses) doesn't serve a stale cached plan.
            fingerprint = "|".join(f"{r}:{c}" for r, c in (_msg_role_content(m) for m in history[-4:]))
            cache_key = f"{cache_key}::{fingerprint}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            self._cache.move_to_end(cache_key)
            logger.debug("[planner] cache hit")
            return cached.model_copy(deep=True)

        plan = None
        if self._llm is not None:
            try:
                plan = self._llm_plan(question, history=history)
            except Exception as exc:
                logger.warning("[planner] LLM planning failed: %s", exc)

        if plan is None or plan.confidence < 0.5:
            plan = self.keyword_fallback(question)

        self._cache[cache_key] = plan.model_copy(deep=True)
        if len(self._cache) > _CACHE_MAX:
            self._cache.popitem(last=False)
        return plan

    # ── LLM path ──────────────────────────────────────────────────────────────

    def _llm_plan(self, question: str, history: list | None = None) -> QueryPlan | None:
        prompt = _PLAN_PROMPT + _format_question_with_history(question, history)
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        future = executor.submit(self._llm.answer_raw, prompt, 400)
        try:
            raw = future.result(timeout=self._timeout_s)
        except concurrent.futures.TimeoutError:
            logger.debug("[planner] LLM timed out after %.1fs", self._timeout_s)
            return None
        except Exception as exc:
            logger.debug("[planner] LLM call failed: %s", exc)
            return None
        finally:
            executor.shutdown(wait=False)

        if not raw:
            return None

        raw = raw.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            logger.debug("[planner] no JSON in LLM output: %r", raw[:100])
            return None
        blob = m.group(0)

        data = None
        try:
            data = json.loads(blob)
        except json.JSONDecodeError:
            try:
                data = json.loads(_repair_json(blob))
                logger.debug("[planner] JSON repaired successfully")
            except json.JSONDecodeError as e:
                logger.debug("[planner] JSON unrecoverable: %s | %r", e, blob[:120])
                return None

        try:
            plan = QueryPlan.model_validate(data)
        except ValidationError as e:
            logger.debug("[planner] plan validation failed: %s", e)
            return None

        # Bare course number → default CS (mirrors old behavior)
        if plan.course_no and not plan.subject:
            plan.subject = "CS"
        return plan

    # ── Deterministic fallback ────────────────────────────────────────────────

    def keyword_fallback(self, question: str) -> QueryPlan:
        """
        Deterministic lightweight classifier — used when the LLM is down, times
        out, or returns garbage. Reuses the battle-tested keyword extractors.
        """
        from app.features.router import route_question, extract_professor_name_from_profile_question
        from app.data.analytics import (
            detect_natural_params, extract_course_parts,
            detect_subject_filter, detect_course_level,
        )
        from app.features.schedule_builder import (
            parse_time_constraints, parse_requested_courses,
            parse_subject_filter, parse_excluded_days, parse_min_gpa, parse_min_rmp,
        )
        from app.features.major_requirements import _extract_major_query

        route = route_question(question)
        params = detect_natural_params(question)
        subject, course_no = extract_course_parts(question)
        if subject is None and course_no is None:
            subject = detect_subject_filter(question)
        level_low, level_high = detect_course_level(question)

        is_sched = route == "schedule_builder"
        t_start, t_end = parse_time_constraints(question) if is_sched else (None, None)

        q = question.lower()
        missing_field = None
        if course_no or subject:
            if re.search(r"\bprereq", q):
                missing_field = "prerequisites"
            elif re.search(r"\bdescription\b", q):
                missing_field = "description"
            elif "pathway" in q:
                missing_field = "pathways"

        return QueryPlan(
            route=route,
            confidence=0.7,
            subject=subject,
            course_no=course_no,
            wants_rmp=any(kw in q for kw in ["rmp", "rate my professor"]),
            professor_name=(
                extract_professor_name_from_profile_question(question)
                if route == "professor_profile" else None
            ),
            sort_goal=params.get("sort_goal", "highest_gpa"),
            min_students=params.get("min_students", 30),
            min_gpa=params.get("min_gpa") or (parse_min_gpa(question) if is_sched else None),
            min_terms=params.get("min_terms"),
            level_low=level_low,
            level_high=level_high,
            major_query=(
                _extract_major_query(question)
                if route == "major_requirements" else None
            ),
            time_start=t_start if is_sched else None,
            time_end=t_end if is_sched else None,
            subject_filter=parse_subject_filter(question) if is_sched else None,
            requested_courses=parse_requested_courses(question) if is_sched else [],
            excluded_days=sorted(parse_excluded_days(question)) if is_sched else [],
            min_rmp=parse_min_rmp(question) if is_sched else None,
            target_credits=None,
            missing_data_field=missing_field,
        )
