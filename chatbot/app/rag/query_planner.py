"""
app/rag/query_planner.py

LLM query planner — the single routing/parameter-extraction layer for /chat.

Replaces both the old IntentExtractor and the hardcoded section-signal override
that lived in main.py. The LLM reads the question (handling typos, slang, and
abbreviations natively) and returns structured JSON; the JSON is validated
strictly through the Pydantic QueryPlan model, repaired once if malformed. The
LLM is the only routing logic — when it fails or returns low-confidence
output, the planner returns a graceful clarification instead of falling back
to hardcoded keyword routing.

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

SECONDARY ROUTES: list any additional routes needed to fully answer the question. Only set this when the question genuinely spans two domains. Do not set it for single-domain questions — most questions have exactly one intent, so leave secondary_routes as an empty list [] by default. Use the same route values as ROUTES above. List at most one secondary route — pick the single most important second intent.

Examples:
"which CS professors teach the easiest 3000-level courses?" → primary: natural_filter, secondary: [professor_profile]
"who's teaching CS 3114 and what's their average GPA?" → primary: section_lookup, secondary: [professor_profile]
"are there open seats in the easiest CS electives?" → primary: natural_filter, secondary: [section_lookup]
"what's left for my CS major and how hard are those courses?" → primary: major_requirements, secondary: [course_profile]

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
- wants_professors: true when the user wants professor-level results ("which professors have the best GPA?"), null or false for course-level results.

Return this JSON shape (omit fields that don't apply):
{
  "route": "...",
  "secondary_routes": [],
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
    LLM extraction with strict validation → deterministic JSON repair → graceful
    clarification if the LLM is unavailable or low-confidence.
    """

    def __init__(self, llm_client, settings=None):
        from app.config import get_settings
        cfg = settings or get_settings()
        self._llm = llm_client
        self._timeout_s: float = getattr(cfg, "rag_intent_timeout_s", 15.0)
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
            if plan is not None:
                logger.warning(
                    "[planner] low-confidence plan (%.2f) for %r — falling back to clarification",
                    plan.confidence, question,
                )
            else:
                logger.warning(
                    "[planner] LLM planning returned no usable plan for %r — falling back to clarification",
                    question,
                )
            plan = self._fallback_plan()

        self._cache[cache_key] = plan.model_copy(deep=True)
        if len(self._cache) > _CACHE_MAX:
            self._cache.popitem(last=False)
        return plan

    # ── LLM path ──────────────────────────────────────────────────────────────

    def _llm_plan(self, question: str, history: list | None = None) -> QueryPlan | None:
        prompt = _PLAN_PROMPT + _format_question_with_history(question, history)
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        future = executor.submit(self._llm.answer_raw, prompt, 1200)
        try:
            raw = future.result(timeout=self._timeout_s)
        except concurrent.futures.TimeoutError:
            logger.warning("[planner] LLM timed out after %.1fs", self._timeout_s)
            return None
        except Exception as exc:
            logger.warning("[planner] LLM call raised %s: %s", type(exc).__name__, exc)
            return None
        finally:
            executor.shutdown(wait=False)

        if not raw:
            logger.warning("[planner] LLM returned empty/None response (answer_raw gave no text)")
            return None

        raw = raw.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            logger.warning("[planner] no JSON in LLM output: %r", raw[:200])
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
                logger.warning("[planner] JSON unrecoverable: %s | %r", e, blob[:200])
                return None

        try:
            plan = QueryPlan.model_validate(data)
        except ValidationError as e:
            logger.warning("[planner] plan validation failed: %s", e)
            return None

        # Bare course number → default CS (mirrors old behavior)
        if plan.course_no and not plan.subject:
            plan.subject = "CS"
        return plan

    # ── Fallback ─────────────────────────────────────────────────────────────

    def _fallback_plan(self) -> QueryPlan:
        """
        LLM planning is the only routing logic — when it fails, times out, or
        returns low-confidence output, do not silently route through hardcoded
        keyword logic. Ask the student to retry instead.
        """
        return QueryPlan(
            route="general_rag",
            needs_clarification=True,
            clarifying_question=(
                "I'm having trouble right now. Try your question again in a moment."
            ),
        )
