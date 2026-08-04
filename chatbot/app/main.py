import logging
import asyncio
import json
import math
import re
import time
import traceback
import urllib.error
import urllib.request
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from supabase import create_client as create_supabase_client
from app.config import get_settings
from app.models import ChatRequest, ChatResponse, FeedbackRequest, SearchItem
from app.data.loader import (
    load_from_supabase, load_rmp_from_supabase,
    load_courses_from_supabase, load_requirements_from_supabase,
    load_sections_from_supabase,
    search_courses, search_professors,
)
from app.rag.vector_store import GradeVectorStore
from app.rag.gemma_client import GemmaAnswerClient
from app.rag.query_planner import QueryPlanner
from app.rag.planner_models import QueryPlan
from app.rag.verifier import check_plan
from app.data.indexes import DataIndexes
from app.features.course_profile import handle_course_profile
from app.features.professor_profile import handle_professor_profile
from app.features.natural_filter import handle_natural_filter
from app.features.general_chat import handle_general_chat
from app.features.schedule_builder import handle_schedule_builder
from app.features.major_requirements import handle_major_requirements
from app.safety.guardrails import default_warnings, out_of_scope_response, normalize_question, sanitize_answer
from app.safety.privacy import privacy_warnings
from app.safety.refusals import classify_safety, refusal_answer
from app.safety.entity_resolver import EntityResolver

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("darvis")

RMP_GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql"
RMP_HEADERS = {
    "Content-Type": "application/json",
    "Authorization": "Basic dGVzdDp0ZXN0",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://www.ratemyprofessors.com/",
}

# ── Rate limiter (slowapi) ─────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=[])

# ── App state ─────────────────────────────────────────────────────────────────
STATE = {
    "df": None,
    "rmp_df": None,
    "courses_df": None,
    "requirements_df": None,
    "sections_df": None,
    "vector_store": None,
    "llm": None,
    "planner": None,
    "entity_resolver": None,
    "indexes": None,
    "supabase": None,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    df = load_from_supabase()

    print("Loading RMP instructor ratings...")
    rmp_df = load_rmp_from_supabase()

    print("Loading full course catalog...")
    courses_df = load_courses_from_supabase()

    print("Loading major requirements...")
    requirements_df = load_requirements_from_supabase()

    print("Loading Fall 2026 sections...")
    sections_df = load_sections_from_supabase()

    print("Building RAG retrieval pipeline...")
    vector_store = GradeVectorStore()
    vector_store.rebuild(df, courses_df=courses_df, requirements_df=requirements_df)

    llm = GemmaAnswerClient()

    # Attach Supabase + LLM together so the pipeline gets the query rewriter wired
    # at construction time rather than via a post-hoc attribute mutation.
    _supabase = create_supabase_client(settings.supabase_url, settings.supabase_key)
    vector_store.set_clients(_supabase, llm_client=llm)
    STATE["supabase"] = _supabase

    # Query planner: LLM understands the question (typos/slang included), returns
    # a validated QueryPlan; falls back to a deterministic keyword classifier.
    planner = QueryPlanner(llm)

    # Entity resolver: fuzzy-matches professor names and course codes post-extraction.
    # Pass rmp_df (the full instructors table) so it knows every canonical name and
    # can reject hallucinated names the LLM fabricates; sections_df adds Fall-term
    # instructors who have no grade history yet.
    entity_resolver = EntityResolver(
        df, courses_df, instructors_df=rmp_df, sections_df=sections_df,
        supabase_client=_supabase,
    )

    # Precomputed lookup indexes — O(1) instructor GPA / course stats / sections
    # at request time instead of full-DataFrame scans.
    print("Building precomputed indexes...")
    indexes = DataIndexes(df, courses_df, sections_df, rmp_df, supabase_client=_supabase)

    STATE["df"] = df
    STATE["rmp_df"] = rmp_df
    STATE["courses_df"] = courses_df
    STATE["requirements_df"] = requirements_df
    STATE["sections_df"] = sections_df
    STATE["vector_store"] = vector_store
    STATE["llm"] = llm
    STATE["planner"] = planner
    STATE["entity_resolver"] = entity_resolver
    STATE["indexes"] = indexes
    yield


# ── App factory ────────────────────────────────────────────────────────────────
settings = get_settings()

app = FastAPI(
    title="Darvis Grade RAG Backend",
    version="2.0.0",
    lifespan=lifespan,
    # Docs are disabled by default; set SHOW_DOCS=true in local .env only
    docs_url="/docs" if settings.show_docs else None,
    redoc_url="/redoc" if settings.show_docs else None,
    openapi_url="/openapi.json" if settings.show_docs else None,
)

# Attach slowapi
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


# ── Request body size cap (16 KB is generous for this API) ────────────────────
class LimitBodySizeMiddleware(BaseHTTPMiddleware):
    MAX_BYTES = 16_384  # 16 KB

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.MAX_BYTES:
            return JSONResponse(
                status_code=413,
                content={"detail": "Request body too large."},
            )
        return await call_next(request)


app.add_middleware(LimitBodySizeMiddleware)


# ── Security headers ──────────────────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# ── Request logging ───────────────────────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    ms = (time.time() - start) * 1000
    ip = request.client.host if request.client else "unknown"
    ua = request.headers.get("user-agent", "")[:100]
    logger.info(
        "%s %s %d %.0fms ip=%s ua=%s",
        request.method,
        request.url.path,
        response.status_code,
        ms,
        ip,
        ua,
    )
    return response


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/ping")
async def ping():
    """No auth, no processing — Render healthcheck target to keep the instance warm."""
    return {"status": "ok", "ts": int(time.time())}


@app.get("/health")
def health():
    df = STATE.get("df")
    vector_store = STATE.get("vector_store")
    rag_status = vector_store.rag_status() if vector_store else {}

    def _loaded(key: str) -> int:
        loaded_df = STATE.get(key)
        return 0 if loaded_df is None else int(len(loaded_df))

    return {
        "status": "ok",
        "rows_loaded": 0 if df is None else int(len(df)),
        "instructors_loaded": _loaded("rmp_df"),
        "sections_loaded": _loaded("sections_df"),
        "courses_loaded": _loaded("courses_df"),
        "requirements_loaded": _loaded("requirements_df"),
        "vector_records": 0 if vector_store is None else vector_store.count(),
        "rag": rag_status,
    }


def _normalize_rmp_review(node: dict) -> dict:
    helpful = node.get("helpfulRating")
    clarity = node.get("clarityRating")
    quality_values = [float(v) for v in (helpful, clarity) if isinstance(v, (int, float))]
    quality = round(sum(quality_values) / len(quality_values), 1) if quality_values else None
    difficulty = node.get("difficultyRating")

    return {
        "id": node.get("id") or node.get("legacyId"),
        "comment": (node.get("comment") or "").strip(),
        "class": node.get("class"),
        "date": node.get("date"),
        "quality": quality,
        "difficulty": float(difficulty) if isinstance(difficulty, (int, float)) else None,
        "grade": node.get("grade"),
        "tags": node.get("ratingTags") if isinstance(node.get("ratingTags"), list) else [],
    }


def _fetch_rmp_reviews_sync(rmp_id: str, limit: int) -> list[dict]:
    query = """
      query TeacherReviewsQuery($id: ID!, $count: Int!) {
        node(id: $id) {
          ... on Teacher {
            ratings(first: $count) {
              edges {
                node {
                  id
                  legacyId
                  comment
                  class
                  date
                  difficultyRating
                  helpfulRating
                  clarityRating
                  grade
                  ratingTags
                }
              }
            }
          }
        }
      }
    """
    payload = json.dumps({
        "query": query,
        "variables": {"id": rmp_id, "count": max(1, min(limit, 20))},
    }).encode("utf-8")
    request = urllib.request.Request(
        RMP_GRAPHQL_URL,
        data=payload,
        headers=RMP_HEADERS,
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        data = json.loads(response.read().decode("utf-8"))

    if data.get("errors"):
        raise ValueError(data["errors"][0].get("message", "RMP GraphQL request failed."))

    edges = data.get("data", {}).get("node", {}).get("ratings", {}).get("edges", [])
    reviews = [_normalize_rmp_review(edge.get("node") or {}) for edge in edges]
    return [review for review in reviews if review.get("comment")]


@app.get("/rmp/reviews")
@limiter.limit("30/minute")
async def rmp_reviews(
    request: Request,
    rmp_id: str = Query(..., min_length=3, max_length=80),
    limit: int = Query(12, ge=1, le=20),
):
    """Fetch live public RateMyProfessors review excerpts for a known RMP teacher id."""
    try:
        reviews = await asyncio.to_thread(_fetch_rmp_reviews_sync, rmp_id, limit)
        return {"reviews": reviews}
    except urllib.error.HTTPError as exc:
        logger.warning("RMP review fetch failed for %s: HTTP %s", rmp_id, exc.code)
        raise HTTPException(status_code=502, detail="RateMyProfessors reviews are temporarily unavailable.")
    except Exception as exc:
        logger.warning("RMP review fetch failed for %s: %s", rmp_id, exc)
        raise HTTPException(status_code=502, detail="RateMyProfessors reviews are temporarily unavailable.")


@app.post("/retrieval/debug")
@limiter.limit("30/minute")
def retrieval_debug(request: Request, body: ChatRequest):
    """
    Debug endpoint: runs the full RAG retrieval pipeline and returns detailed
    telemetry including candidate chunks, scores, and reranking results.

    Use this to inspect and tune retrieval quality without running the full
    chat pipeline. Response includes:
      - original + rewritten query
      - all retrieved candidates with vector/keyword/combined scores
      - reranked selection with rerank scores
      - per-stage timing breakdown
    """
    if not settings.rag_debug_mode:
        raise HTTPException(status_code=404, detail="Not found.")

    vector_store = STATE.get("vector_store")
    if vector_store is None:
        raise HTTPException(status_code=503, detail="Backend not initialized.")

    question = normalize_question(body.question.strip())

    # Run retrieval pipeline
    vector_store.query(question, n_results=body.top_n)

    debug_info = vector_store.last_debug_info()
    if debug_info is None:
        return {"message": "RAG pipeline not active — keyword fallback mode only."}

    return debug_info.to_dict()


@app.get("/professors/search", response_model=list[SearchItem])
@limiter.limit("60/minute")
def professors_search(
    request: Request,
    query: str = Query(..., min_length=1, max_length=100),
    limit: int = Query(20, ge=1, le=50),
):
    df = STATE.get("df")
    if df is None:
        raise HTTPException(status_code=503, detail="Data not loaded.")
    return search_professors(df, query, limit)


@app.get("/courses/search", response_model=list[SearchItem])
@limiter.limit("60/minute")
def courses_search(
    request: Request,
    query: str = Query(..., min_length=1, max_length=100),
    limit: int = Query(20, ge=1, le=50),
):
    df = STATE.get("df")
    if df is None:
        raise HTTPException(status_code=503, detail="Data not loaded.")
    return search_courses(df, query, limit)


# Route pairs allowed to fan out to a secondary handler. Unordered — either
# route may be primary. Anything outside this set is ignored even if the
# planner populates secondary_routes.
_SECONDARY_ROUTE_PAIRS = {
    frozenset({"course_profile", "section_lookup"}),
    frozenset({"professor_profile", "section_lookup"}),
    frozenset({"course_profile", "professor_profile"}),
    # "which CS electives have open seats this semester?" — natural_filter ranks
    # by GPA/grades, section_lookup adds current-term open-seat data.
    frozenset({"natural_filter", "section_lookup"}),
    # "who teaches the easiest CS 3000-level courses?" — natural_filter ranks
    # courses, professor_profile adds instructor RMP/grade detail.
    frozenset({"natural_filter", "professor_profile"}),
    # "what CS major requirements have the lowest GPA?" — major_requirements
    # supplies the course list, course_profile adds grade outcomes.
    frozenset({"major_requirements", "course_profile"}),
    # "build me an easy schedule this semester" — schedule_builder picks
    # sections, course_profile adds GPA/difficulty data on each one.
    frozenset({"schedule_builder", "course_profile"}),
}


def _dispatch_route(route: str, question: str, body: ChatRequest, intent, df, llm, vector_store):
    """Run one route's handler and return (answer, tables, charts, metadata).
    Shared by the primary dispatch and the secondary-route fan-out in
    _run_chat_pipeline so the two can't drift."""
    if route == "major_requirements":
        return handle_major_requirements(
            question, STATE.get("requirements_df"), llm, vector_store=vector_store,
            intent=intent,
            history=[m.model_dump() for m in body.history],
        )
    elif route == "section_lookup":
        from app.features.section_lookup import handle_section_lookup
        course_no = getattr(intent, "course_no", None) if intent else None
        professor_name = getattr(intent, "professor_name", None) if intent else None
        if not course_no and not professor_name and body.history:
            # No specific course or professor — likely a follow-up about a prior
            # schedule (e.g. "what building are those classes in?"). Route to
            # general_chat which intercepts schedule follow-ups using sections_df directly.
            return handle_general_chat(
                question, df, llm, vector_store, intent=intent,
                history=[m.model_dump() for m in body.history],
                user_profile=body.user_profile,
                rmp_df=STATE.get("rmp_df"),
                sections_df=STATE.get("sections_df"),
            )
        else:
            return handle_section_lookup(
                question, df, llm, rmp_df=STATE.get("rmp_df"), intent=intent,
                sections_df=STATE.get("sections_df"),
                indexes=STATE.get("indexes"),
            )
    elif route == "schedule_builder":
        return handle_schedule_builder(
            question, user_profile=body.user_profile, intent=intent, df=df,
            history=[m.model_dump() for m in body.history],
            sections_df=STATE.get("sections_df"),
            rmp_df=STATE.get("rmp_df"),
            indexes=STATE.get("indexes"),
        )
    elif route == "out_of_scope":
        return out_of_scope_response(), [], [], {}
    elif route == "course_profile":
        result = handle_course_profile(
            question, df, llm, vector_store,
            body.min_students, body.top_n, body.use_recency,
            rmp_df=STATE.get("rmp_df"),
            intent=intent,
            history=[m.model_dump() for m in body.history],
            user_profile=body.user_profile,
            sections_df=STATE.get("sections_df"),
            indexes=STATE.get("indexes"),
            resolver=STATE.get("entity_resolver"),
        )
        if result is None:
            return handle_general_chat(question, df, llm, vector_store, history=[m.model_dump() for m in body.history], user_profile=body.user_profile, rmp_df=STATE.get("rmp_df"))
        return result
    elif route == "professor_profile":
        return handle_professor_profile(
            question, df, llm, vector_store,
            body.min_students, body.top_n, body.use_recency,
            rmp_df=STATE.get("rmp_df"),
            intent=intent,
            history=[m.model_dump() for m in body.history],
            user_profile=body.user_profile,
            sections_df=STATE.get("sections_df"),
            resolver=STATE.get("entity_resolver"),
        )
    elif route == "natural_filter":
        return handle_natural_filter(
            question, df, llm, vector_store,
            body.top_n, body.use_recency,
            intent=intent,
            history=[m.model_dump() for m in body.history],
            user_profile=body.user_profile,
            indexes=STATE.get("indexes"),
            sections_df=STATE.get("sections_df"),
        )
    else:
        return handle_general_chat(question, df, llm, vector_store, intent=intent, history=[m.model_dump() for m in body.history], user_profile=body.user_profile, rmp_df=STATE.get("rmp_df"), sections_df=STATE.get("sections_df"))


def _ambiguous_professor_shorthand(question: str, intent, er=None) -> bool:
    """
    True only when a bare "professor/prof <name>" the LLM failed to extract
    is GENUINELY ambiguous or unresolvable in the database. Previously this
    assumed any non-stopword word after "professor" meant ambiguity, with no
    actual database check — verified live that this incorrectly triggered
    clarification for real, unambiguous single-match instructors (e.g.
    "Professor Hamouda", the only Hamouda in the database). When `er` can
    resolve the name to exactly one confident match, fill it into
    intent.professor_name and let the normal flow proceed instead.
    """
    if intent is None or getattr(intent, "professor_name", None):
        return False
    q = question.lower()
    match = re.search(r"\bprof(?:essor)?\s+([a-z]+)\b", q)
    if not match:
        # Also catch bare-name mentions with no "professor/prof" qualifier at
        # all (e.g. "Tell me about Smith.", "Who's better, Smith or Johnson?")
        # — only when the word resolves against real instructor last names,
        # to avoid false-triggering on unrelated topics.
        match = re.search(r"\b(?:tell me about|who'?s better,?)\s+([a-z]+)\b", q)
        if not match:
            return False
    word = match.group(1)
    if word in _PROF_SHORTHAND_STOPWORDS:
        return False
    if getattr(intent, "route", None) not in {"professor_profile", "section_lookup", "course_profile", "general_rag"}:
        return False
    if er is None:
        return True
    resolved = er.resolve_professor_ex(word)
    if resolved.ambiguous:
        return True
    if resolved.value and resolved.confidence >= 0.6:
        intent.professor_name = resolved.value
        return False
    return True


_PROF_SHORTHAND_STOPWORDS = {
    "has", "have", "with", "for", "who", "what", "that", "this", "best",
    "worst", "is", "are", "and", "or", "the", "a", "an", "should", "gives",
    "give", "teaches", "teach", "smth",
}


def _bare_surname_from_question(question: str) -> str | None:
    """
    Returns a bare surname when the question says "professor/prof <one word>"
    with no first name attached (e.g. "Professor Smith", not "Professor Jane
    Smith"). Used to independently re-check ambiguity against the *literal*
    question text, regardless of what the planner LLM extracted into
    intent.professor_name — verified live that the LLM sometimes embellishes
    a bare surname into a specific invented full name (e.g. "Smith" ->
    "Michael Smith"), which then exact-matches with confidence 1.0 and skips
    the entity resolver's own ambiguity detection entirely.
    """
    match = re.search(r"\bprof(?:essor)?\s+([A-Za-z]+)\b(?!\s+[A-Z][a-z]+)", question)
    if not match:
        return None
    word = match.group(1)
    if word.lower() in _PROF_SHORTHAND_STOPWORDS or len(word) < 2:
        return None
    return word


def _missing_user_major_context(question: str, intent, body: ChatRequest) -> bool:
    if intent is None or getattr(intent, "route", None) != "major_requirements":
        return False
    q = question.lower()
    if "my major" not in q and "required courses" not in q:
        return False
    profile_major = getattr(body.user_profile, "major", None) if body.user_profile else None
    if profile_major:
        return False
    major_query = (getattr(intent, "major_query", None) or "").strip().lower()
    return not major_query or major_query in {"my", "my major", "required", "required courses", "courses"}


def _explicit_prompt_injection_attempt(question: str) -> bool:
    q = question.lower()
    return any(
        phrase in q
        for phrase in (
            "ignore previous instructions",
            "ignore all previous instructions",
            "bypass filters",
            "override retrieval",
            "make up",
            "invent records",
            "invent a professor",
        )
    )


def _professor_query_signal(question: str) -> bool:
    q = question.lower()
    return any(
        phrase in q
        for phrase in (
            "who should i take",
            "who teaches",
            "which professor",
            "which prof",
            "best professor",
            "best prof",
            "chill prof",
            "chill professor",
            "tell me about professor",
            "tell me about prof",
            "is professor",
            "is prof",
            "best proffesor",
            "which proffesor",
        )
    ) or bool(re.search(r"\bprof(?:essor)?|proffesor|dr\.\s+[a-z]", q))


def _professor_name_candidate(question: str) -> str | None:
    q = question.strip()
    patterns = (
        r"\bdr\.\s+([A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*)?)\b",
        r"\bprof(?:essor)?\s+([A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*)?)\b",
        r"\btell me about\s+([A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*)?)\b",
        r"\bis\s+([A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*)?)\s+good\b",
    )
    stop = {"good", "best", "chill", "hard", "hardest", "easiest", "easy", "for", "systems"}
    for pattern in patterns:
        match = re.search(pattern, q, re.I)
        if not match:
            continue
        name = re.sub(r"\s+", " ", match.group(1)).strip(" ?.,")
        if name and name.lower() not in stop:
            return name
    return None


def _deterministic_professor_plan(question: str, body: ChatRequest, er=None):
    if er is None or not _professor_query_signal(question):
        return None
    q = question.lower()
    refs = er.resolve_course_references(question)
    approved = [r for r in refs if r.status == "resolved"]
    rejected = [r for r in refs if r.status == "rejected"]
    name_candidate = _professor_name_candidate(question)

    if "systems" in q and not approved:
        return QueryPlan(
            route="general_rag",
            capabilities=["instructor_lookup", "unsupported_or_missing_data"],
            confidence=1.0,
            requested_courses=[["CS", "3214"], ["CS", "3204"]],
            needs_clarification=True,
            clarifying_question=(
                "Which systems course do you mean: CS 3214, CS 3204, or another systems course?"
            ),
        ), rejected

    subject = approved[0].subject if approved else None
    course_no = approved[0].course_number if approved else None
    wants_schedule = any(phrase in q for phrase in ("who teaches", "teaching", "this fall", "schedule", "when does", "what time"))

    if name_candidate:
        surname_matches = er.surname_candidates(name_candidate) if hasattr(er, "surname_candidates") else []
        if len(surname_matches) > 1:
            return QueryPlan(
                route="professor_profile",
                capabilities=["instructor_lookup"],
                confidence=1.0,
                subject=subject,
                course_no=course_no,
                professor_name=name_candidate,
                needs_clarification=True,
                clarifying_question=(
                    "Which professor did you mean? Multiple verified instructors match that name: "
                    + ", ".join(surname_matches[:4])
                    + "."
                ),
            ), rejected
        checked = er.resolve_professors_for_course(name_candidate, subject, course_no)
        if checked.ambiguous:
            return QueryPlan(
                route="professor_profile",
                capabilities=["instructor_lookup"],
                confidence=1.0,
                subject=subject,
                course_no=course_no,
                professor_name=name_candidate,
                needs_clarification=True,
                clarifying_question=(
                    "Which professor did you mean? Multiple verified instructors match that name: "
                    + ", ".join(checked.candidates[:4])
                    + "."
                ),
            ), rejected
        if not checked.value:
            return QueryPlan(
                route="professor_profile",
                capabilities=["instructor_lookup", "unsupported_or_missing_data"],
                confidence=1.0,
                subject=subject,
                course_no=course_no,
                professor_name=name_candidate,
                missing_data_field="professor",
            ), rejected
        return QueryPlan(
            route="section_lookup" if wants_schedule else "professor_profile",
            capabilities=["section_lookup", "instructor_lookup"] if wants_schedule else ["instructor_lookup", "grade_distribution"],
            confidence=1.0,
            subject=subject,
            course_no=course_no,
            professor_name=checked.value,
            requested_courses=[[r.subject, r.course_number] for r in approved],
        ), rejected

    if approved:
        return QueryPlan(
            route="section_lookup" if wants_schedule else "course_profile",
            capabilities=["section_lookup", "instructor_lookup"] if wants_schedule else ["course_lookup", "instructor_lookup", "grade_distribution"],
            confidence=1.0,
            subject=subject,
            course_no=course_no,
            requested_courses=[[r.subject, r.course_number] for r in approved],
        ), rejected

    return None


def _history_course_referent(history: list | None, er=None) -> tuple[str, str] | None:
    if er is None or not history:
        return None
    for msg in reversed(history[-6:]):
        content = msg.content if hasattr(msg, "content") else msg.get("content") if isinstance(msg, dict) else None
        if not content:
            continue
        refs = [r for r in er.resolve_course_references(content) if r.status == "resolved"]
        if refs:
            return refs[-1].subject, refs[-1].course_number
    return None


def _apply_exact_course_policy(question: str, intent, body: ChatRequest, er=None) -> list:
    """Make explicit course entities authoritative before route dispatch."""
    if intent is None or er is None:
        return []
    refs = er.resolve_course_references(question, default_subject=getattr(intent, "subject", None))
    approved = [r for r in refs if r.status == "resolved"]
    rejected = [r for r in refs if r.status == "rejected"]

    if not approved and re.search(r"\b(it|that course|this course)\b", question, re.I):
        prior = _history_course_referent(body.history, er=er)
        if prior:
            subj, num = prior
            approved = er.resolve_course_references(f"{subj} {num}")

    if approved:
        intent.requested_courses = [[r.subject, r.course_number] for r in approved]
        if len(approved) == 1:
            intent.subject = approved[0].subject
            intent.course_no = approved[0].course_number
        q = question.lower()
        comparison = len(approved) >= 2 and (
            "course_comparison" in (getattr(intent, "capabilities", None) or [])
            or any(word in q for word in ("compare", "differ", "different", "versus"))
            or " vs " in f" {q} "
        )
        if comparison:
            intent.route = "course_profile"
        elif not getattr(intent, "professor_name", None) and any(phrase in q for phrase in ("who should", "best professor", "best prof", "which professor", "which prof")):
            intent.route = "course_profile"
        elif any(phrase in q for phrase in ("this fall", "teaching", "who teaches", "what time", "when does", "open seats")):
            intent.route = "section_lookup"
    return rejected


def _asks_workload_question(question: str) -> bool:
    q = question.lower()
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


def _asks_curve_question(question: str) -> bool:
    """
    "Which teacher curves the most?" — grading-curve policy isn't in Darvis'
    data model at all (no course/professor context to attach a deterministic
    missing-data answer to, unlike workload). Verified live the prior
    behavior deflected to "could you specify a department" without ever
    stating curve data doesn't exist — more specificity wouldn't produce
    data that isn't tracked. Short-circuits honestly instead.
    """
    q = question.lower()
    return "curve" in q or "curves" in q or "curving" in q


def _clarification_response(answer: str, route: str, warnings: list[str], timings: dict[str, int], reason: str, eval_trace: dict | None = None) -> ChatResponse:
    metadata = {
        "needs_clarification": True,
        "clarification_reason": reason,
        "fallback_used": False,
        "generation": _generation_metadata(),
        "timings_ms": timings,
    }
    if eval_trace is not None:
        eval_trace["final_response"] = {"route": route, "answer": answer}
        metadata["eval_trace"] = eval_trace
    return ChatResponse(
        answer=answer,
        route=route,
        warnings=warnings,
        tables=[],
        charts=[],
        metadata=metadata,
        schedule_actions=[],
    )


def _safe_plan_dict(intent) -> dict:
    if intent is None:
        return {}
    try:
        data = intent.model_dump()
    except Exception:
        return {}
    allowed = {
        "route", "secondary_routes", "capabilities", "confidence", "subject",
        "course_no", "professor_name", "sort_goal", "min_students", "min_gpa",
        "min_terms", "level_low", "level_high", "wants_professors",
        "major_query", "time_start", "time_end", "subject_filter",
        "requested_courses", "excluded_days", "min_rmp", "target_credits",
        "open_seats_only", "display_n", "missing_data_field",
        "needs_clarification", "clarifying_question",
    }
    return {k: data.get(k) for k in allowed if k in data}


def _safe_table_preview(tables: list, max_rows: int = 8) -> list[dict]:
    out = []
    for table in tables or []:
        title = getattr(table, "title", None) or (table.get("title") if isinstance(table, dict) else "")
        columns = getattr(table, "columns", None) or (table.get("columns") if isinstance(table, dict) else [])
        rows = getattr(table, "rows", None) or (table.get("rows") if isinstance(table, dict) else [])
        out.append({"title": title, "columns": columns, "rows": list(rows or [])[:max_rows]})
    return out


def _retrieval_trace(vector_store) -> dict:
    if vector_store is None:
        return {}
    try:
        info = vector_store.last_debug_info()
        return info.to_dict() if info is not None else {}
    except Exception:
        return {}


def _course_candidate(subject: str, course_no: str, source: str, role: str = "primary") -> dict:
    subj = str(subject or "").upper().strip()
    num = str(course_no or "").strip()
    return {
        "stable_id": f"COURSE:{subj} {num}",
        "entity_type": "course",
        "subject": subj,
        "course_number": num,
        "professor_name": None,
        "source": source,
        "evidence_role": role,
        "approval_status": "approved",
    }


def _prof_course_candidate(professor: str, course: str | None, source: str, role: str = "ranked_professor") -> dict:
    course = str(course or "").strip()
    subject = None
    course_no = None
    m = re.search(r"\b([A-Z]{2,5})\s*-?\s*(\d{4})\b", course, re.I)
    if m:
        subject, course_no = m.group(1).upper(), m.group(2)
    stable_course = f"{subject} {course_no}" if subject and course_no else course
    return {
        "stable_id": f"PROF_COURSE:{stable_course}:{professor}".upper().replace(" ", "_"),
        "entity_type": "professor_course",
        "subject": subject,
        "course_number": course_no,
        "professor_name": professor,
        "source": source,
        "evidence_role": role,
        "approval_status": "approved",
    }


def _section_candidate(row: dict, source: str = "sections", fallback_subject: str | None = None, fallback_course_no: str | None = None) -> dict:
    subject = str(row.get("Subject") or row.get("subject") or "").upper().strip()
    course_no = str(row.get("Course Number") or row.get("course_number") or "").strip()
    course = str(row.get("Course") or "").strip()
    if course and (not subject or not course_no):
        m = re.search(r"\b([A-Z]{2,5})\s*-?\s*(\d{4})\b", course, re.I)
        if m:
            subject, course_no = m.group(1).upper(), m.group(2)
    if not subject and fallback_subject:
        subject = str(fallback_subject).upper().strip()
    if not course_no and fallback_course_no:
        course_no = str(fallback_course_no).strip()
    crn = str(row.get("CRN") or row.get("crn") or "").strip()
    instructor = str(row.get("Instructor") or row.get("instructor") or "").strip() or None
    stable = f"SECTION:{subject} {course_no}:{crn or instructor or 'UNKNOWN'}"
    return {
        "stable_id": stable,
        "entity_type": "section",
        "subject": subject or None,
        "course_number": course_no or None,
        "professor_name": instructor,
        "source": source,
        "evidence_role": "current_section",
        "approval_status": "approved",
    }


def _table_rows_for_trace(tables: list) -> list[dict]:
    rows: list[dict] = []
    for table in tables or []:
        title = getattr(table, "title", None) or (table.get("title") if isinstance(table, dict) else "")
        for row in (getattr(table, "rows", None) or (table.get("rows") if isinstance(table, dict) else []) or []):
            if isinstance(row, dict):
                rows.append({"title": title, "row": row})
    return rows


def _canonical_evidence(route: str, intent, tables: list, metadata: dict) -> tuple[list[dict], list[str]]:
    evidence: list[dict] = []
    seen: set[str] = set()

    def add(candidate: dict):
        sid = candidate.get("stable_id")
        if not sid or sid in seen:
            return
        seen.add(sid)
        evidence.append(candidate)

    for subj, num in getattr(intent, "requested_courses", None) or []:
        if subj and num:
            add(_course_candidate(subj, num, "entity_resolver", "requested_course"))
    if getattr(intent, "subject", None) and getattr(intent, "course_no", None):
        add(_course_candidate(intent.subject, intent.course_no, "entity_resolver", "resolved_course"))

    for subj, num in (metadata or {}).get("comparison_courses") or []:
        add(_course_candidate(subj, num, "course_profile", "comparison_course"))
    if (metadata or {}).get("subject") and (metadata or {}).get("course_no"):
        add(_course_candidate(metadata["subject"], metadata["course_no"], "course_profile", "course_profile"))
    if (metadata or {}).get("professor_query"):
        prof = metadata["professor_query"]
        add({
            "stable_id": f"PROFESSOR:{str(prof).upper().replace(' ', '_')}",
            "entity_type": "professor",
            "subject": getattr(intent, "subject", None),
            "course_number": getattr(intent, "course_no", None),
            "professor_name": prof,
            "source": "instructors",
            "evidence_role": "resolved_professor",
            "approval_status": "approved",
        })

    for item in _table_rows_for_trace(tables):
        title = item["title"]
        row = item["row"]
        course = row.get("Course")
        if course:
            m = re.search(r"\b([A-Z]{2,5})\s*-?\s*(\d{4})\b", str(course), re.I)
            if m:
                add(_course_candidate(m.group(1), m.group(2), "table", "table_course"))
            instructor = row.get("Instructor") or row.get("Best Instructor") or row.get("Professor")
            if instructor:
                add(_prof_course_candidate(str(instructor), str(course), "grades", "ranked_professor"))
        if "section" in str(title).lower() or row.get("CRN"):
            add(_section_candidate(row, fallback_subject=getattr(intent, "subject", None), fallback_course_no=getattr(intent, "course_no", None)))

    rejected = []
    for cand, reason in zip((metadata or {}).get("excluded_candidates") or [], (metadata or {}).get("exclusion_reasons") or []):
        rejected.append({
            "stable_id": f"REJECTED:{cand}",
            "entity_type": "unknown",
            "subject": None,
            "course_number": None,
            "professor_name": None,
            "source": "entity_resolver",
            "evidence_role": reason or "rejected",
            "approval_status": "rejected",
        })

    return evidence, [c["stable_id"] for c in rejected]


def _answer_type_for_route(route: str, metadata: dict) -> str:
    if route == "refusal":
        return "refusal"
    if (metadata or {}).get("needs_clarification") or (metadata or {}).get("validation_errors"):
        if "unknown_professor" in ((metadata or {}).get("validation_errors") or []):
            return "insufficient_data"
        return "clarification_required"
    return route or "general_rag"


def _init_eval_trace(body: ChatRequest, question: str) -> dict | None:
    if not getattr(body, "eval_mode", False):
        return None
    return {
        "case_id": body.eval_case_id,
        "query": question,
        "parsed_intent": None,
        "resolved_entities": {},
        "retrieval": {
            "route": "",
            "queries": [],
            "raw_candidates": [],
            "approved_candidates": [],
            "rejected_candidates": [],
        },
        "evidence_ids": [],
        "ranking": {
            "method": "",
            "model": None,
            "enabled": False,
            "input_ids": [],
            "input_rrf_order": [],
            "cross_encoder_scores": {},
            "output_order": [],
            "selected_ids": [],
            "ordered_ids": [],
            "scores": {},
            "fallback_used": False,
            "fallback_reason": None,
            "latency_ms": 0,
        },
        "retrieved_candidates": [],
        "retrieved_ids": [],
        "reranked_candidates": [],
        "approved_candidates": [],
        "excluded_candidates": [],
        "exclusion_reasons": [],
        "analytics": {},
        "sufficiency": {"passed": None, "reasons": []},
        "answer_type": "",
        "structured_payload": {},
        "final_response": {},
        "latency_ms": {},
        "errors": [],
    }


def _generation_metadata() -> dict:
    llm = STATE.get("llm")
    calls = llm.call_history() if hasattr(llm, "call_history") else []
    provider = calls[0].get("provider") if calls else "groq"
    model = calls[0].get("model") if calls else settings.groq_model
    return {
        "provider": provider,
        "model": model,
        "attempt_count": sum(int(call.get("attempt_count") or 0) for call in calls),
        "fallback_used": any(bool(call.get("fallback_used")) for call in calls),
        "fallback_reason": next((call.get("fallback_reason") for call in calls if call.get("fallback_reason")), None),
        "rate_limited": any(bool(call.get("rate_limited")) for call in calls),
        "timeout": any(bool(call.get("timeout")) for call in calls),
        "latency_ms": round(sum(float(call.get("latency_ms") or 0) for call in calls), 1),
        "input_tokens": sum(int(call.get("input_tokens") or 0) for call in calls) if calls else None,
        "output_tokens": sum(int(call.get("output_tokens") or 0) for call in calls) if calls else None,
        "calls": calls,
    }


def _run_chat_pipeline(body: ChatRequest, question: str) -> ChatResponse:
    """
    Shared 4-stage pipeline (plan -> resolve -> sufficiency gate -> handler)
    used by both /chat and /chat/stream so the two endpoints can't drift —
    /chat/stream used to duplicate a stale pre-planner copy of this logic.
    """
    df = STATE.get("df")
    vector_store = STATE.get("vector_store")
    llm = STATE.get("llm")
    if df is None or vector_store is None or llm is None:
        raise HTTPException(status_code=503, detail="Backend is not fully initialized.")
    if hasattr(llm, "reset_call_history"):
        llm.reset_call_history()

    warnings = default_warnings() + privacy_warnings(body.question)
    timings: dict[str, int] = {}
    eval_trace = _init_eval_trace(body, question)

    safety = classify_safety(question)
    if safety.blocked:
        if eval_trace is not None:
            eval_trace["sufficiency"] = {"passed": False, "reasons": [safety.reason]}
            eval_trace["retrieval"]["route"] = "refusal"
            eval_trace["retrieval"]["not_run_reason"] = safety.reason
            eval_trace["answer_type"] = "refusal"
            eval_trace["final_response"] = {"route": "refusal", "answer": refusal_answer(safety)}
            eval_trace["latency_ms"] = timings
        return ChatResponse(
            answer=refusal_answer(safety),
            route="refusal",
            warnings=warnings,
            tables=[],
            charts=[],
            metadata={
                "safety_decision": safety.decision,
                "refusal_reason": safety.reason,
                "normalized_query": question,
                "fallback_used": False,
                "generation": _generation_metadata(),
                "timings_ms": timings,
                **({"eval_trace": eval_trace} if eval_trace is not None else {}),
            },
            schedule_actions=[],
        )

    if _explicit_prompt_injection_attempt(question):
        if eval_trace is not None:
            eval_trace["sufficiency"] = {"passed": False, "reasons": ["prompt_injection_rejected"]}
            eval_trace["retrieval"]["route"] = "refusal"
            eval_trace["retrieval"]["not_run_reason"] = "prompt_injection_rejected"
            eval_trace["answer_type"] = "refusal"
            eval_trace["final_response"] = {"route": "refusal", "answer": "I can't follow instructions that try to override Darvis' retrieval or invent academic records."}
            eval_trace["latency_ms"] = timings
        return ChatResponse(
            answer="I can't follow instructions that try to override Darvis' retrieval or invent academic records.",
            route="refusal",
            warnings=warnings,
            tables=[],
            charts=[],
            metadata={
                "safety_decision": "refuse",
                "refusal_reason": "prompt_injection_rejected",
                "normalized_query": question,
                "fallback_used": False,
                "generation": _generation_metadata(),
                "timings_ms": timings,
                **({"eval_trace": eval_trace} if eval_trace is not None else {}),
            },
            schedule_actions=[],
        )

    # ── Stage 1: plan ──────────────────────────────────────────────────────────
    # QueryPlanner handles typos/slang via the LLM, validates through Pydantic,
    # and falls back to a deterministic keyword classifier. Route disambiguation
    # (section_lookup vs course_profile) lives in the planner prompt now — the
    # old hardcoded section-signal override is gone.
    t0 = time.time()
    planner = STATE.get("planner")
    er = STATE.get("entity_resolver")
    deterministic_professor = _deterministic_professor_plan(question, body, er=er)
    if deterministic_professor is not None:
        intent, pre_rejected_course_refs = deterministic_professor
    else:
        intent = planner.plan(question, history=body.history) if planner else None
        pre_rejected_course_refs = []
    timings["plan_ms"] = int((time.time() - t0) * 1000)
    if eval_trace is not None:
        eval_trace["parsed_intent"] = _safe_plan_dict(intent)
        eval_trace["latency_ms"] = dict(timings)
        if pre_rejected_course_refs:
            eval_trace["excluded_candidates"].extend([r.normalized_code for r in pre_rejected_course_refs])
            eval_trace["exclusion_reasons"].extend([r.reason or "injected_entity_rejected" for r in pre_rejected_course_refs])

    if intent is not None and _asks_workload_question(question):
        intent.missing_data_field = "workload"
        intent.professor_name = None
        if not (intent.subject and intent.course_no):
            intent.route = "general_rag"

    if _asks_curve_question(question):
        timings["resolve_ms"] = 0
        if eval_trace is not None:
            eval_trace["sufficiency"] = {"passed": False, "reasons": ["curve_data_unavailable"]}
            eval_trace["retrieval"]["route"] = "general_rag"
            eval_trace["retrieval"]["not_run_reason"] = "curve_data_unavailable"
            eval_trace["answer_type"] = "insufficient_data"
            eval_trace["latency_ms"] = dict(timings)
        return ChatResponse(
            answer=(
                "Darvis doesn't track grading-curve policies — that's not something the historical "
                "grade data can tell you, and I won't guess at it from GPA/F-rate numbers alone."
            ),
            route="general_rag",
            warnings=warnings,
            tables=[], charts=[],
            metadata={"missing_data_field": "curve", "generation": _generation_metadata(), "timings_ms": timings, **({"eval_trace": eval_trace} if eval_trace is not None else {})},
            schedule_actions=[],
        )

    # ── Stage 2: resolve entities ──────────────────────────────────────────────
    t0 = time.time()
    if intent is not None:
        rejected_course_refs = _apply_exact_course_policy(question, intent, body, er=er)
        if eval_trace is not None and rejected_course_refs:
            eval_trace["excluded_candidates"].extend([r.normalized_code for r in rejected_course_refs])
            eval_trace["exclusion_reasons"].extend([r.reason or "injected_entity_rejected" for r in rejected_course_refs])
        if er is not None:
            if intent.professor_name:
                before_professor_name = intent.professor_name
                resolved = er.resolve_professor_ex(intent.professor_name)
                if resolved.value and resolved.confidence >= 0.6:
                    intent.professor_name = resolved.value
                if eval_trace is not None:
                    eval_trace["resolved_entities"]["professor"] = {
                        "input": before_professor_name,
                        "value": resolved.value,
                        "confidence": resolved.confidence,
                        "ambiguous": resolved.ambiguous,
                        "candidates": resolved.candidates[:5],
                    }

                ambiguity_warning = resolved.warning if resolved.ambiguous else None

                # The planner LLM can embellish a bare surname into a specific
                # invented full name (e.g. "Smith" -> "Michael Smith"), which
                # then exact-matches with confidence 1.0 and skips ambiguity
                # detection entirely. Detect this by checking whether any
                # first-name token the LLM added is actually present anywhere
                # in the raw question — if not, it was invented, and the
                # surname alone should be re-checked for ambiguity.
                if not ambiguity_warning:
                    name_tokens = intent.professor_name.lower().split()
                    if len(name_tokens) > 1:
                        q_lower = question.lower()
                        first_name_tokens = name_tokens[:-1]
                        if not any(tok in q_lower for tok in first_name_tokens):
                            surname_resolved = er.resolve_professor_ex(name_tokens[-1])
                            if surname_resolved.ambiguous:
                                ambiguity_warning = surname_resolved.warning

                # Ambiguous surname (either directly, or via the bare-surname
                # form embedded in the question, e.g. "Tell me about Smith"
                # or "Professor Smith") — force clarification rather than
                # silently proceeding with an arbitrary match. A previous
                # version only appended resolved.warning to `warnings` (a
                # footnote) while still answering with owners[0] as if
                # confirmed — verified live this presented one specific real
                # person's data as "the" answer with no disambiguation.
                if not ambiguity_warning:
                    bare_surname = _bare_surname_from_question(question)
                    if bare_surname and bare_surname.lower() not in intent.professor_name.lower().split():
                        bare_resolved = er.resolve_professor_ex(bare_surname)
                        if bare_resolved.ambiguous:
                            ambiguity_warning = bare_resolved.warning

                if ambiguity_warning:
                    timings["resolve_ms"] = int((time.time() - t0) * 1000)
                    if eval_trace is not None:
                        eval_trace["sufficiency"] = {"passed": False, "reasons": ["ambiguous_professor_surname"]}
                        eval_trace["latency_ms"] = dict(timings)
                    return _clarification_response(
                        ambiguity_warning,
                        intent.route,
                        warnings,
                        timings,
                        "ambiguous_professor_surname",
                        eval_trace,
                    )
            if intent.subject and intent.course_no:
                before_course = {"subject": intent.subject, "course_no": intent.course_no}
                intent.subject, intent.course_no = er.resolve_course_code(
                    intent.subject, intent.course_no
                )
                if eval_trace is not None:
                    eval_trace["resolved_entities"]["course"] = {
                        "input": before_course,
                        "value": {"subject": intent.subject, "course_no": intent.course_no},
                    }
            # If no professor name was extracted but the question likely names one, scan it
            if not intent.professor_name and intent.route == "professor_profile":
                resolved_prof, _ = er.resolve_question_entities(question)
                if resolved_prof:
                    intent.professor_name = resolved_prof
        route = intent.route
        if (
            len(getattr(intent, "requested_courses", None) or []) >= 2
            and (
                "course_comparison" in (getattr(intent, "capabilities", None) or [])
                or "compare" in question.lower()
                or "differ" in question.lower()
                or "versus" in question.lower()
                or " vs " in f" {question.lower()} "
            )
        ):
            route = "course_profile"
            intent.route = "course_profile"
        logger.info(
            "plan route=%s conf=%.2f caps=%s subj=%s course=%s prof=%s sort=%s",
            route, intent.confidence, ",".join(intent.capabilities) or "-",
            intent.subject, intent.course_no,
            intent.professor_name, intent.sort_goal,
        )
    else:
        from app.features.router import route_question
        route = route_question(question)
    timings["resolve_ms"] = int((time.time() - t0) * 1000)
    if eval_trace is not None:
        eval_trace["parsed_intent"] = _safe_plan_dict(intent)
        eval_trace["latency_ms"] = dict(timings)

    if intent is not None and getattr(intent, "needs_clarification", False):
        if eval_trace is not None:
            approved_evidence, _ = _canonical_evidence(route, intent, [], {})
            eval_trace["sufficiency"] = {"passed": False, "status": "clarification_required", "reasons": ["deterministic_professor_ambiguity"]}
            eval_trace["retrieval"]["route"] = route
            eval_trace["retrieval"]["not_run_reason"] = "clarification_required"
            eval_trace["retrieval"]["approved_candidates"] = approved_evidence
            eval_trace["approved_candidates"] = approved_evidence
            eval_trace["evidence_ids"] = [item["stable_id"] for item in approved_evidence]
            eval_trace["retrieved_ids"] = [item["stable_id"] for item in approved_evidence]
            eval_trace["ranking"] = {
                "method": "deterministic",
                "ordered_ids": [item["stable_id"] for item in approved_evidence],
                "scores": {},
            }
            eval_trace["answer_type"] = "clarification_required"
            eval_trace["latency_ms"] = dict(timings)
        return _clarification_response(
            intent.clarifying_question or "Which professor or course did you mean?",
            route,
            warnings,
            timings,
            "deterministic_professor_ambiguity",
            eval_trace,
        )

    if _ambiguous_professor_shorthand(question, intent, er=STATE.get("entity_resolver")):
        if eval_trace is not None:
            eval_trace["sufficiency"] = {"passed": False, "reasons": ["ambiguous_professor_shorthand"]}
            eval_trace["latency_ms"] = dict(timings)
        return _clarification_response(
            "Which professor did you mean? Please provide the full name or department, and we can compare the available course, schedule, or grade data.",
            route,
            warnings,
            timings,
            "ambiguous_professor_shorthand",
            eval_trace,
        )

    if _missing_user_major_context(question, intent, body):
        if eval_trace is not None:
            eval_trace["sufficiency"] = {"passed": False, "reasons": ["missing_major_context"]}
            eval_trace["latency_ms"] = dict(timings)
        return _clarification_response(
            "Which major should we check? We need your major or a specific requirement list before we can identify required courses that fit your constraints.",
            route,
            warnings,
            timings,
            "missing_major_context",
            eval_trace,
        )

    # ── Stage 3: sufficiency gate ──────────────────────────────────────────────
    # Honest short-circuit for data the DB is known to lack (prereqs, descriptions,
    # pathways), nonexistent course codes, and unanswerable questions.
    if intent is not None:
        gate = check_plan(intent, indexes=STATE.get("indexes"))
        warnings.extend(gate.warnings)
        if eval_trace is not None:
            eval_trace["sufficiency"] = {
                "passed": bool(gate.sufficient),
                "reasons": list(gate.warnings or []) + ([gate.clarification] if gate.clarification else []),
            }
        if not gate.sufficient:
            honest = gate.answer_override or gate.clarification
            if eval_trace is not None:
                eval_trace["latency_ms"] = dict(timings)
                eval_trace["retrieval"]["route"] = route
                eval_trace["retrieval"]["not_run_reason"] = "sufficiency_gate"
                eval_trace["answer_type"] = "insufficient_data"
                eval_trace["final_response"] = {"route": route, "answer": honest}
            return ChatResponse(
                answer=honest,
                route=route,
                warnings=warnings,
                tables=[], charts=[],
                metadata={"honest_no_data": bool(gate.answer_override), "generation": _generation_metadata(), "timings_ms": timings, **({"eval_trace": eval_trace} if eval_trace is not None else {})},
                schedule_actions=[],
            )

    # ── Stage 4: handler ───────────────────────────────────────────────────────
    t0 = time.time()
    try:
        answer, tables, charts, metadata = _dispatch_route(route, question, body, intent, df, llm, vector_store)
        if eval_trace is not None:
            semantic_routes = {"general_rag", "natural_filter"}
            retrieval_info = _retrieval_trace(vector_store) if route in semantic_routes else {}
            eval_trace["retrieved_candidates"] = retrieval_info.get("retrieved_candidates") or retrieval_info.get("candidates") or []
            eval_trace["reranked_candidates"] = retrieval_info.get("reranked_candidates") or retrieval_info.get("selected") or []
            eval_trace["analytics"] = {
                "route": route,
                "metadata_keys": sorted(list((metadata or {}).keys())),
                "table_titles": [getattr(t, "title", None) or (t.get("title") if isinstance(t, dict) else "") for t in (tables or [])],
                "chart_titles": [getattr(c, "title", None) or (c.get("title") if isinstance(c, dict) else "") for c in (charts or [])],
            }

        # ── Secondary route fan-out ──────────────────────────────────────────
        # A question can span two intents ("who teaches CS 3114 and what's their
        # GPA?"). Only fan out for a fixed set of route pairings, capped at one
        # secondary route, and never let a secondary failure break the primary
        # answer that already succeeded.
        if intent is not None and intent.secondary_routes:
            secondary_route = intent.secondary_routes[0]
            if secondary_route != route and frozenset({route, secondary_route}) in _SECONDARY_ROUTE_PAIRS:
                try:
                    sec_answer, sec_tables, sec_charts, sec_metadata = _dispatch_route(
                        secondary_route, question, body, intent, df, llm, vector_store
                    )
                    answer = f"{answer}\n\n{sec_answer}"
                    tables = list(tables) + list(sec_tables)
                    charts = list(charts) + list(sec_charts)
                    metadata = {**sec_metadata, **metadata}  # primary wins on key conflicts
                    logger.info("secondary route fan-out: %s + %s", route, secondary_route)
                except Exception as exc:
                    logger.warning("secondary route %s failed, keeping primary-only answer: %s", secondary_route, exc)
    except Exception as exc:
        # Log the full traceback server-side; return a generic message to the client
        logger.error("Chat error for question %r: %s\n%s", question, exc, traceback.format_exc())
        raise HTTPException(status_code=500, detail="Something went wrong. Please try again.")
    timings["handler_ms"] = int((time.time() - t0) * 1000)
    if eval_trace is not None:
        eval_trace["latency_ms"] = dict(timings)

    metadata.update({
        "use_recency": body.use_recency,
        "min_students": body.min_students,
        "top_n": body.top_n,
        "generation": _generation_metadata(),
        "timings_ms": timings,
        "confidence": getattr(intent, "confidence", None) if intent is not None else None,
    })
    logger.info(
        "chat done route=%s plan=%dms resolve=%dms handler=%dms",
        route, timings.get("plan_ms", 0), timings.get("resolve_ms", 0), timings.get("handler_ms", 0),
    )

    answer = sanitize_answer(answer) or answer
    if eval_trace is not None:
        approved_evidence, rejected_evidence_ids = _canonical_evidence(route, intent, tables, metadata)
        rejected_candidates = []
        for code, reason in zip(eval_trace.get("excluded_candidates") or [], eval_trace.get("exclusion_reasons") or []):
            rejected_candidates.append({
                "stable_id": f"REJECTED:{code}",
                "entity_type": "course",
                "subject": str(code).split()[0] if " " in str(code) else None,
                "course_number": str(code).split()[1] if " " in str(code) else None,
                "professor_name": None,
                "source": "entity_resolver",
                "evidence_role": reason or "rejected",
                "approval_status": "rejected",
            })
        eval_trace["retrieval"] = {
            "route": route,
            "queries": [question],
            "raw_candidates": eval_trace.get("retrieved_candidates") or [],
            "approved_candidates": approved_evidence,
            "rejected_candidates": rejected_candidates,
        }
        eval_trace["approved_candidates"] = approved_evidence
        eval_trace["evidence_ids"] = [item["stable_id"] for item in approved_evidence]
        eval_trace["retrieved_ids"] = [item["stable_id"] for item in approved_evidence]
        semantic_ranking = retrieval_info.get("ranking") if route in {"general_rag", "natural_filter"} else None
        if semantic_ranking:
            eval_trace["ranking"] = {
                **semantic_ranking,
                "ordered_ids": semantic_ranking.get("selected_ids") or semantic_ranking.get("output_order") or [],
                "scores": semantic_ranking.get("cross_encoder_scores") or {},
            }
        else:
            eval_trace["ranking"] = {
                "method": "deterministic",
                "model": None,
                "enabled": False,
                "input_ids": [item["stable_id"] for item in approved_evidence],
                "input_rrf_order": [item["stable_id"] for item in approved_evidence],
                "cross_encoder_scores": {},
                "output_order": [item["stable_id"] for item in approved_evidence],
                "selected_ids": [item["stable_id"] for item in approved_evidence],
                "ordered_ids": [item["stable_id"] for item in approved_evidence],
                "scores": {},
                "fallback_used": False,
                "fallback_reason": None,
                "latency_ms": 0,
            }
        eval_trace["answer_type"] = _answer_type_for_route(route, metadata)
        eval_trace["structured_payload"] = {
            "tables": _safe_table_preview(tables),
            "charts_count": len(charts or []),
            "metadata": {
                k: v for k, v in (metadata or {}).items()
                if k not in {"eval_trace"} and not any(secret in k.lower() for secret in ("key", "token", "secret", "password"))
            },
        }
        eval_trace["final_response"] = {"route": route, "answer": answer, "warnings": warnings}
        metadata["eval_trace"] = eval_trace

    return ChatResponse(
        answer=answer,
        route=route,
        warnings=warnings,
        tables=_json_safe(tables),
        charts=_json_safe(charts),
        metadata=metadata,
        schedule_actions=metadata.pop("schedule_actions", []),
    )


@app.post("/chat", response_model=ChatResponse)
@limiter.limit("10/minute")
def chat(request: Request, body: ChatRequest):
    question = normalize_question(body.question.strip())
    return _run_chat_pipeline(body, question)


def _json_safe(obj):
    """
    Recursively replace non-finite floats (NaN/Infinity — routine in pandas
    GPA aggregates) with None. Plain json.dumps emits bare NaN/Infinity
    tokens, which isn't valid JSON and silently breaks a strict JSON.parse
    on the client — the streaming endpoint was swallowing that parse error
    and dropping the whole final payload, including the answer text.
    """
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_safe(v) for v in obj]
    return obj


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(_json_safe(data), default=str)}\n\n"


def _stream_status_for_route(route: str) -> str:
    if route == "section_lookup":
        return "Checking available sections"
    if route == "schedule_builder":
        return "Reviewing schedule options"
    if route == "major_requirements":
        return "Checking major requirements"
    if route == "course_profile":
        return "Checking course data"
    if route == "professor_profile":
        return "Checking instructor data"
    if route == "natural_filter":
        return "Filtering academic data"
    if route == "out_of_scope":
        return "Preparing your answer"
    return "Looking through Darvis data"


def _answer_chunks(text: str, target_size: int = 26):
    words = text.split(" ")
    chunk = ""
    for word in words:
        candidate = word if not chunk else f"{chunk} {word}"
        if len(candidate) >= target_size:
            yield candidate + " "
            chunk = ""
        else:
            chunk = candidate
    if chunk:
        yield chunk


@app.post("/chat/stream")
@limiter.limit("10/minute")
def chat_stream(request: Request, body: ChatRequest):
    def events():
        try:
            yield _sse("status", {"message": "Thinking"})
            question = normalize_question(body.question.strip())
            yield _sse("status", {"message": "Understanding your question"})

            response = _run_chat_pipeline(body, question)

            yield _sse("route", {"route": response.route})
            yield _sse("status", {"message": _stream_status_for_route(response.route)})
            yield _sse("status", {"message": "Preparing your answer"})
            for chunk in _answer_chunks(response.answer):
                yield _sse("answer_chunk", {"text": chunk})
            yield _sse("final", response.model_dump())
        except HTTPException as exc:
            yield _sse("error", {"message": str(exc.detail)})
        except Exception as exc:
            logger.error("Streaming chat error for question %r: %s\n%s", body.question, exc, traceback.format_exc())
            yield _sse("error", {"message": "Something went wrong while preparing the response. Try again."})

    return StreamingResponse(events(), media_type="text/event-stream")


@app.get("/feedback/recent")
@limiter.limit("20/minute")
def recent_feedback(
    request: Request,
    limit: int = Query(default=100, ge=1, le=250),
    x_darvis_dev_token: str | None = Header(default=None),
):
    """Return recent chatbot feedback for internal review."""
    if not settings.dev_feedback_token or x_darvis_dev_token != settings.dev_feedback_token:
        raise HTTPException(status_code=403, detail="Feedback review is restricted.")
    supabase = STATE.get("supabase")
    if supabase is None:
        raise HTTPException(status_code=503, detail="Backend is not fully initialized.")
    try:
        data = (
            supabase.table("feedback")
            .select("id, question, answer, route, rating, reason, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
    except Exception:
        data = (
            supabase.table("feedback")
            .select("id, question, answer, route, rating, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
        for row in data:
            row["reason"] = None
    return {"feedback": data}


@app.post("/feedback", status_code=204)
@limiter.limit("30/minute")
def feedback(request: Request, body: FeedbackRequest):
    """Log a thumbs up (1) or thumbs down (-1) for a chatbot answer."""
    supabase = STATE.get("supabase")
    if supabase is None:
        raise HTTPException(status_code=503, detail="Backend is not fully initialized.")
    try:
        row = {
            "question": body.question,
            "answer": body.answer,
            "route": body.route,
            "rating": body.rating,
        }
        if body.reason:
            row["reason"] = body.reason.strip()
        try:
            supabase.table("feedback").insert(row).execute()
        except Exception:
            row.pop("reason", None)
            supabase.table("feedback").insert(row).execute()
    except Exception as exc:
        logger.error("Feedback insert failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to record feedback.")
