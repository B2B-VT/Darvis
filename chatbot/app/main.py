import logging
import time
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
from app.safety.entity_resolver import EntityResolver

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("darvis")

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
    entity_resolver = EntityResolver(df, courses_df, instructors_df=rmp_df, sections_df=sections_df)

    # Precomputed lookup indexes — O(1) instructor GPA / course stats / sections
    # at request time instead of full-DataFrame scans.
    print("Building precomputed indexes...")
    indexes = DataIndexes(df, courses_df, sections_df, rmp_df)

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


@app.post("/chat", response_model=ChatResponse)
@limiter.limit("10/minute")
def chat(request: Request, body: ChatRequest):
    df = STATE.get("df")
    vector_store = STATE.get("vector_store")
    llm = STATE.get("llm")
    if df is None or vector_store is None or llm is None:
        raise HTTPException(status_code=503, detail="Backend is not fully initialized.")

    question = normalize_question(body.question.strip())
    warnings = default_warnings() + privacy_warnings(body.question)
    timings: dict[str, int] = {}

    # ── Stage 1: plan ──────────────────────────────────────────────────────────
    # QueryPlanner handles typos/slang via the LLM, validates through Pydantic,
    # and falls back to a deterministic keyword classifier. Route disambiguation
    # (section_lookup vs course_profile) lives in the planner prompt now — the
    # old hardcoded section-signal override is gone.
    t0 = time.time()
    planner = STATE.get("planner")
    intent = planner.plan(question) if planner else None
    timings["plan_ms"] = int((time.time() - t0) * 1000)

    # ── Stage 2: resolve entities ──────────────────────────────────────────────
    t0 = time.time()
    if intent is not None:
        er = STATE.get("entity_resolver")
        if er is not None:
            if intent.professor_name:
                resolved = er.resolve_professor_ex(intent.professor_name)
                if resolved.value and resolved.confidence >= 0.6:
                    intent.professor_name = resolved.value
                if resolved.warning and resolved.ambiguous:
                    warnings.append(resolved.warning)
            if intent.subject and intent.course_no:
                intent.subject, intent.course_no = er.resolve_course_code(
                    intent.subject, intent.course_no
                )
            # If no professor name was extracted but the question likely names one, scan it
            if not intent.professor_name and intent.route == "professor_profile":
                resolved_prof, _ = er.resolve_question_entities(question)
                if resolved_prof:
                    intent.professor_name = resolved_prof
        route = intent.route
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

    # ── Stage 3: sufficiency gate ──────────────────────────────────────────────
    # Honest short-circuit for data the DB is known to lack (prereqs, descriptions,
    # pathways), nonexistent course codes, and unanswerable questions.
    if intent is not None:
        gate = check_plan(intent, indexes=STATE.get("indexes"))
        warnings.extend(gate.warnings)
        if not gate.sufficient:
            honest = gate.answer_override or gate.clarification
            return ChatResponse(
                answer=honest,
                route=route,
                warnings=warnings,
                tables=[], charts=[],
                metadata={"honest_no_data": bool(gate.answer_override), "timings_ms": timings},
                schedule_actions=[],
            )

    # ── Stage 4: handler ───────────────────────────────────────────────────────
    t0 = time.time()
    try:
        if route == "major_requirements":
            answer, tables, charts, metadata = handle_major_requirements(
                question, STATE.get("requirements_df"), llm, vector_store=vector_store,
                intent=intent,
            )
        elif route == "section_lookup":
            from app.features.section_lookup import handle_section_lookup
            course_no = getattr(intent, "course_no", None) if intent else None
            if not course_no and body.history:
                # No specific course — likely a follow-up about a prior schedule
                # (e.g. "what building are those classes in?"). Route to general_chat
                # which intercepts schedule follow-ups using sections_df directly.
                answer, tables, charts, metadata = handle_general_chat(
                    question, df, llm, vector_store, intent=intent,
                    history=[m.model_dump() for m in body.history],
                    user_profile=body.user_profile,
                    rmp_df=STATE.get("rmp_df"),
                    sections_df=STATE.get("sections_df"),
                )
            else:
                answer, tables, charts, metadata = handle_section_lookup(
                    question, df, llm, rmp_df=STATE.get("rmp_df"), intent=intent,
                    sections_df=STATE.get("sections_df"),
                )
        elif route == "schedule_builder":
            answer, tables, charts, metadata = handle_schedule_builder(
                question, user_profile=body.user_profile, intent=intent, df=df,
                history=[m.model_dump() for m in body.history],
                sections_df=STATE.get("sections_df"),
                rmp_df=STATE.get("rmp_df"),
                indexes=STATE.get("indexes"),
            )
        elif route == "out_of_scope":
            answer, tables, charts, metadata = out_of_scope_response(), [], [], {}
        elif route == "course_profile":
            result = handle_course_profile(
                question, df, llm, vector_store,
                body.min_students, body.top_n, body.use_recency,
                rmp_df=STATE.get("rmp_df"),
                intent=intent,
                history=[m.model_dump() for m in body.history],
                user_profile=body.user_profile,
                sections_df=STATE.get("sections_df"),
            )
            if result is None:
                answer, tables, charts, metadata = handle_general_chat(question, df, llm, vector_store, history=[m.model_dump() for m in body.history], user_profile=body.user_profile, rmp_df=STATE.get("rmp_df"))
            else:
                answer, tables, charts, metadata = result
        elif route == "professor_profile":
            answer, tables, charts, metadata = handle_professor_profile(
                question, df, llm, vector_store,
                body.min_students, body.top_n, body.use_recency,
                rmp_df=STATE.get("rmp_df"),
                intent=intent,
                history=[m.model_dump() for m in body.history],
                user_profile=body.user_profile,
                sections_df=STATE.get("sections_df"),
            )
        elif route == "natural_filter":
            answer, tables, charts, metadata = handle_natural_filter(
                question, df, llm, vector_store,
                body.top_n, body.use_recency,
                intent=intent,
                history=[m.model_dump() for m in body.history],
                user_profile=body.user_profile,
            )
        else:
            answer, tables, charts, metadata = handle_general_chat(question, df, llm, vector_store, intent=intent, history=[m.model_dump() for m in body.history], user_profile=body.user_profile, rmp_df=STATE.get("rmp_df"), sections_df=STATE.get("sections_df"))
    except Exception as exc:
        # Log the full traceback server-side; return a generic message to the client
        logger.error("Chat error for question %r: %s\n%s", question, exc, traceback.format_exc())
        raise HTTPException(status_code=500, detail="Something went wrong. Please try again.")
    timings["handler_ms"] = int((time.time() - t0) * 1000)

    metadata.update({
        "use_recency": body.use_recency,
        "min_students": body.min_students,
        "top_n": body.top_n,
        "timings_ms": timings,
        "confidence": getattr(intent, "confidence", None) if intent is not None else None,
    })
    logger.info(
        "chat done route=%s plan=%dms resolve=%dms handler=%dms",
        route, timings.get("plan_ms", 0), timings.get("resolve_ms", 0), timings.get("handler_ms", 0),
    )

    answer = sanitize_answer(answer) or answer

    return ChatResponse(
        answer=answer,
        route=route,
        warnings=warnings,
        tables=tables,
        charts=charts,
        metadata=metadata,
        schedule_actions=metadata.pop("schedule_actions", []),
    )


@app.post("/feedback", status_code=204)
@limiter.limit("30/minute")
def feedback(request: Request, body: FeedbackRequest):
    """Log a thumbs up (1) or thumbs down (-1) for a chatbot answer."""
    supabase = STATE.get("supabase")
    if supabase is None:
        raise HTTPException(status_code=503, detail="Backend is not fully initialized.")
    try:
        supabase.table("feedback").insert({
            "question": body.question,
            "answer": body.answer,
            "route": body.route,
            "rating": body.rating,
        }).execute()
    except Exception as exc:
        logger.error("Feedback insert failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to record feedback.")
