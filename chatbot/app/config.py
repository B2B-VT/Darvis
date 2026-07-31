from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── LLM (Groq) ─────────────────────────────────────────────────────────────
    groq_api_key: str = Field(default="", alias="GROQ_API_KEY")
    groq_model: str = Field(default="openai/gpt-oss-120b", alias="GROQ_MODEL")

    # ── Supabase (service role key — bypasses RLS) ──────────────────────────────
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_key: str = Field(default="", alias="SUPABASE_KEY")

    # ── Redis (redisvl vector store — semantic + keyword search at runtime) ────
    # Supabase `embeddings` stays the durable source of truth; this is the hot
    # serving index, populated by scripts/sync_redis_index.py.
    redis_url: str = Field(default="", alias="REDIS_URL")
    rag_redis_index_name: str = Field(default="darvis_embeddings", alias="RAG_REDIS_INDEX_NAME")

    # ── Academic term (sections table) ──────────────────────────────────────────
    # Single source of truth for the current registration term. Update via env
    # each semester instead of hunting hardcodes across loader/features/scripts.
    current_term: str = Field(default="202609", alias="CURRENT_TERM")
    current_term_label: str = Field(default="Fall 2026", alias="CURRENT_TERM_LABEL")

    # ── Optional embedding / reranking providers ────────────────────────────────
    # OpenAI: used for text-embedding-3-small or text-embedding-3-large.
    # Falls back to Google gemini-embedding-001, then fastembed if not set.
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")

    # Cohere: used for Rerank API (free tier: 1,000 calls/month).
    # Falls back to local cross-encoder (sentence-transformers) if not set.
    cohere_api_key: str = Field(default="", alias="COHERE_API_KEY")

    # ── RAG pipeline settings ───────────────────────────────────────────────────
    # Embedding provider: "openai" | "google" | "local" | "" (auto-detect)
    rag_embedding_provider: str = Field(default="", alias="RAG_EMBEDDING_PROVIDER")

    # OpenAI model for embeddings (supports dimension reduction)
    rag_openai_model: str = Field(
        default="text-embedding-3-small", alias="RAG_OPENAI_MODEL"
    )

    # Embedding vector dimension — must match the Supabase schema.
    # Default 384 keeps backward compat with existing embeddings.
    # To upgrade: run migration + rebuild script, then set to 1536.
    rag_embedding_dim: int = Field(default=384, alias="RAG_EMBEDDING_DIM")

    # Vector weight in hybrid RRF fusion (0.0=keyword-only, 1.0=vector-only)
    rag_vector_weight: float = Field(default=0.7, alias="RAG_VECTOR_WEIGHT")

    # Minimum cosine similarity for vector candidates (pre-rerank filter)
    rag_min_similarity: float = Field(default=0.2, alias="RAG_MIN_SIMILARITY")

    # Number of candidates to retrieve before reranking
    rag_top_k_retrieve: int = Field(default=20, alias="RAG_TOP_K_RETRIEVE")

    # Number of top chunks to pass to the LLM after reranking
    rag_top_k_rerank: int = Field(default=5, alias="RAG_TOP_K_RERANK")

    # Enable/disable query rewriting (adds ~100–300ms latency when LLM is used)
    rag_enable_query_rewrite: bool = Field(
        default=True, alias="RAG_ENABLE_QUERY_REWRITE"
    )

    # Per-request timeout for LLM query rewriting. Caps how long we wait for Gemma
    # to expand a query before falling back to rule-based expansion. Keeps total
    # request latency bounded even on slow model days.
    rag_rewrite_timeout_s: float = Field(default=8.0, alias="RAG_REWRITE_TIMEOUT_S")

    # Enable full debug capture (slightly more memory per request)
    rag_debug_mode: bool = Field(default=False, alias="RAG_DEBUG_MODE")

    # Per-request timeout for LLM intent extraction (seconds).
    # Intent extraction is on the critical path of every /chat request.
    rag_intent_timeout_s: float = Field(default=20.0, alias="RAG_INTENT_TIMEOUT_S")

    # Disable local cross-encoder reranker to save RAM on Render free tier.
    # When false, falls back to passthrough if Cohere is not configured.
    rag_enable_local_reranker: bool = Field(default=False, alias="RAG_ENABLE_LOCAL_RERANKER")

    # LLM-judgement fallback: when retrieval quality is borderline on the last
    # critic attempt, ask Gemma whether the context actually answers the
    # question instead of blindly accepting "best available". Set false to
    # restore the old heuristic-only behavior (e.g. to save the extra call).
    rag_enable_llm_judge: bool = Field(default=True, alias="RAG_ENABLE_LLM_JUDGE")

    # Skip startup embedding-provider consistency validation.
    rag_skip_embedding_validation: bool = Field(default=False, alias="RAG_SKIP_EMBEDDING_VALIDATION")

    # ── API behaviour ───────────────────────────────────────────────────────────
    allowed_origins: str = Field(
        default=(
            "http://localhost:3000,http://127.0.0.1:3000,"
            "http://localhost:5173,http://127.0.0.1:5173"
        ),
        alias="ALLOWED_ORIGINS",
    )
    max_question_chars: int = Field(default=800, alias="MAX_QUESTION_CHARS")
    max_rows_to_llm: int = Field(default=15, alias="MAX_ROWS_TO_LLM")

    # Enable /docs only locally
    show_docs: bool = Field(default=False, alias="SHOW_DOCS")

    class Config:
        env_file = ".env"
        populate_by_name = True
        extra = "ignore"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
