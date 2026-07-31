"""
app/rag/query_planner.py

LLM query planner — the single routing/parameter-extraction layer for /chat.

Replaces both the old IntentExtractor and the hardcoded section-signal override
that lived in main.py. The LLM reads the question (handling typos, slang, and
abbreviations natively) and returns structured JSON; the JSON is validated
strictly through the Pydantic QueryPlan model, repaired once if malformed. The
LLM planning is preferred, but network/model failures must not become a
chat-wide outage. When the planner cannot classify safely, the request falls
back to general_rag so the normal answer path can still respond.

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

MISSING / UNSUPPORTED FIELDS: for questions about a course's prerequisites or official catalog description, set missing_data_field to "prerequisites" or "description" (route can stay course_profile) — a deterministic lookup answers these precisely from catalog data. Darvis has NO VT Pathways data — for Pathways questions set missing_data_field to "pathways". Darvis has NO homework-load/workload data — for homework, workload, amount of work, or least/most homework questions set missing_data_field to "workload" and do not invent professor names.

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
                    "[planner] low-confidence plan (%.2f) for %r — trying deterministic fallback",
                    plan.confidence, question,
                )
            else:
                logger.warning(
                    "[planner] LLM planning returned no usable plan for %r — trying deterministic fallback",
                    question,
                )
            plan = self._deterministic_fallback_plan(question) or self._fallback_plan()

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

    @staticmethod
    def _course_codes(question: str) -> list[tuple[str, str]]:
        return [
            (m.group(1).upper(), m.group(2))
            for m in re.finditer(r"\b([A-Za-z]{2,5})\s*-?\s*(\d{4})\b(?![-\s]?level)", question)
        ]

    @staticmethod
    def _sort_goal(question: str) -> str:
        q = question.lower()
        if any(w in q for w in ("hardest", "hard", "brutal", "tough", "avoid", "worst")):
            return "lowest_gpa"
        if any(w in q for w in ("fail", "f rate", "f-rate")):
            return "highest_f_rate" if any(w in q for w in ("highest", "most", "worst")) else "lowest_f_rate"
        if any(w in q for w in ("a rate", "easy a", "highest a")):
            return "highest_a_rate"
        return "highest_gpa"

    @staticmethod
    def _time_bounds(question: str) -> tuple[str | None, str | None]:
        q = question.lower()
        start, end = None, None
        if re.search(r"\b(?:no|avoid|without|skip)\s+(?:any\s+)?8\s*ams?\b", q):
            start = "09:00"
        if re.search(r"\b(?:only\s+morning|morning\s+classes\s+only|mornings\s+only)\b", q):
            end = "12:00"
        m = re.search(r"\bafter\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", q)
        if m:
            start = _coerce_simple_ampm(m)
        m = re.search(r"\bbefore\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", q)
        if m:
            end = _coerce_simple_ampm(m)
        return start, end

    def _deterministic_fallback_plan(self, question: str) -> QueryPlan | None:
        """
        Conservative fallback for explicit, low-ambiguity requests when the LLM
        planner is unavailable. This intentionally covers only patterns where a
        deterministic route is safer than asking the user to retry.
        """
        q = question.lower()
        codes = self._course_codes(question)
        requested_courses = codes
        subject, course_no = codes[0] if codes else (None, None)

        if _is_greeting_or_help(question):
            return QueryPlan(
                route="general_rag",
                confidence=0.7,
                capabilities=["general_question"],
            )

        if _needs_ambiguous_clarification(q):
            return QueryPlan(
                route="general_rag",
                confidence=0.7,
                capabilities=["general_question"],
                needs_clarification=True,
                clarifying_question=(
                    "Which course, professor, schedule, or requirement should we compare? "
                    "We can rank options by historical grade outcomes, time fit, or major relevance once you give the context."
                ),
            )

        if _asks_missing_workload_data(q):
            return QueryPlan(
                route="general_rag",
                confidence=0.82,
                capabilities=["unsupported_or_missing_data"],
                subject=subject,
                course_no=course_no,
                missing_data_field="workload",
            )

        schedule_words = ("schedule", "build", "create", "make", "plan my classes", "classes")
        if any(w in q for w in schedule_words) and (
            codes or any(w in q for w in ("no ", "avoid", "after", "before", "morning", "credits"))
        ):
            time_start, time_end = self._time_bounds(question)
            return QueryPlan(
                route="schedule_builder",
                confidence=0.72,
                capabilities=["schedule_build"],
                requested_courses=requested_courses,
                time_start=time_start,
                time_end=time_end,
                sort_goal=self._sort_goal(question),
            )

        if any(w in q for w in ("requirement", "requirements", "graduate", "graduation", "degree", "major")):
            return QueryPlan(
                route="major_requirements",
                confidence=0.7,
                capabilities=["major_requirement_lookup"],
                major_query=_extract_major_hint(question),
            )

        if subject and course_no:
            section_words = (
                "who teaches", "who is teaching", "teaching", "taught by",
                "time", "when", "where", "building", "location", "seat",
                "seats", "open", "full", "semester", "fall", "spring",
            )
            if any(w in q for w in section_words):
                return QueryPlan(
                    route="section_lookup",
                    confidence=0.78,
                    capabilities=["section_lookup"],
                    subject=subject,
                    course_no=course_no,
                    sort_goal=self._sort_goal(question),
                    open_seats_only=any(w in q for w in ("open", "available", "seat", "seats")),
                )
            return QueryPlan(
                route="course_profile",
                confidence=0.78,
                capabilities=["course_lookup", "grade_distribution"],
                subject=subject,
                course_no=course_no,
                wants_rmp=any(w in q for w in ("rmp", "rate my professor", "rating", "rated")),
                sort_goal=self._sort_goal(question),
            )

        if any(w in q for w in ("highest", "lowest", "easiest", "hardest", "best", "worst", "elective", "gpa")):
            subject_filter = _extract_subject_hint(question)
            level_low, level_high = _extract_level_hint(question)
            return QueryPlan(
                route="natural_filter",
                confidence=0.68,
                capabilities=["natural_language_filter"],
                subject=subject_filter,
                level_low=level_low,
                level_high=level_high,
                sort_goal=self._sort_goal(question),
            )

        return None

    def _fallback_plan(self) -> QueryPlan:
        """
        Last-resort planner fallback.

        This must not surface as a transient error. A failed planner call only
        means route extraction was unavailable, not that chat itself is down.
        Let the general handler answer broad/ordinary prompts and reserve
        clarification for explicit planner output that identifies missing
        entities.
        """
        return QueryPlan(
            route="general_rag",
            confidence=0.45,
            capabilities=["general_question"],
            needs_clarification=False,
            clarifying_question=None,
        )


def _coerce_simple_ampm(match) -> str | None:
    h = int(match.group(1))
    minute = int(match.group(2) or 0)
    ampm = match.group(3)
    if ampm == "pm" and h != 12:
        h += 12
    elif ampm == "am" and h == 12:
        h = 0
    if 0 <= h <= 23:
        return f"{h:02d}:{minute:02d}"
    return None


def _extract_subject_hint(question: str) -> str | None:
    m = re.search(r"\b([A-Za-z]{2,5})\s+[1-5]000[-\s]?level\b", question, re.I)
    if m:
        return m.group(1).upper()
    m = re.search(r"\b([A-Za-z]{2,5})\s+(?:course|courses|class|classes|elective|electives|professor|professors)\b", question)
    if not m:
        return None
    code = m.group(1).upper()
    if code in {"LEVEL", "COURSE", "CLASS", "ELECTIVE", "PROF", "PROFS", "BEST", "WORST"}:
        return None
    return code


def _extract_level_hint(question: str) -> tuple[int | None, int | None]:
    m = re.search(r"\b([1-5])000[-\s]?level\b", question.lower())
    if not m:
        return None, None
    level = int(m.group(1))
    return level * 1000, level * 1000 + 999


def _extract_major_hint(question: str) -> str | None:
    m = re.search(r"\b(?:requirements?|degree|major|graduate|graduation)\s+(?:for|in|with)?\s*(?:the\s+)?(.+?)(?:\?|$)", question, re.I)
    if not m:
        return None
    raw = re.sub(r"\b(major|degree|requirements?|courses?|classes?)\b", " ", m.group(1), flags=re.I)
    raw = re.sub(r"\s+", " ", raw).strip(" ?.,!")
    return raw or None


def _is_greeting_or_help(question: str) -> bool:
    q = re.sub(r"[^\w\s]", " ", question.lower())
    q = re.sub(r"\s+", " ", q).strip()
    if q in {"hi", "hello", "hey", "yo", "sup", "thanks", "thank you"}:
        return True
    if q in {"how are you", "what can you do", "help", "help me"}:
        return True
    return bool(re.match(r"^(hi|hello|hey|yo|sup)\s+(cyrus|darvis)\b", q))


def _needs_ambiguous_clarification(q: str) -> bool:
    q = re.sub(r"\s+", " ", q).strip()
    ambiguous = {
        "what is the best professor",
        "who is the best professor",
        "what's the best professor",
        "whats the best professor",
        "what is the best class",
        "what's the best class",
        "whats the best class",
        "which professor should i take",
        "compare these two",
        "is this schedule good",
    }
    return q.rstrip("?.!") in ambiguous


def _asks_missing_workload_data(q: str) -> bool:
    return any(
        phrase in q
        for phrase in (
            "homework",
            "workload",
            "least work",
            "most work",
            "amount of work",
            "how much work",
        )
    )
