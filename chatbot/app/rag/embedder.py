"""
app/rag/embedder.py

Multi-provider embedding service. Provider priority:
  1. OpenAI text-embedding-3-small  (needs OPENAI_API_KEY)
  2. Google gemini-embedding-001    (uses existing GOOGLE_API_KEY)
  3. fastembed all-MiniLM-L6-v2    (local, no API key)

All providers output RAG_EMBEDDING_DIM dimensions (default 384) to stay
compatible with the existing Supabase schema. OpenAI supports dimension
reduction natively; Google and fastembed natively output 384.

To upgrade to higher-dim embeddings:
  1. Set RAG_EMBEDDING_DIM=1536 and RAG_EMBEDDING_PROVIDER=openai in .env
  2. Run the migration SQL (alters the embedding column dimension)
  3. Run: python -m scripts.rebuild_embeddings
"""

import logging
import time

logger = logging.getLogger("darvis.embedder")

_GOOGLE_EMBED_MODEL = "gemini-embedding-001"
_OPENAI_EMBED_MODEL_DEFAULT = "text-embedding-3-small"


class EmbeddingService:
    """
    Thread-safe embedding service with automatic provider fallback.
    Initialize once at startup; pass to RAGPipeline.
    """

    def __init__(self, settings=None):
        from app.config import get_settings
        cfg = settings or get_settings()

        self._dim: int = getattr(cfg, "rag_embedding_dim", 384)
        self._provider: str = "none"
        self._openai_client = None
        self._openai_model: str = _OPENAI_EMBED_MODEL_DEFAULT
        self._google_client = None
        self._fastembed_model = None

        forced = getattr(cfg, "rag_embedding_provider", "").lower()

        # Respect forced provider, or try in priority order
        if forced in ("openai", ""):
            openai_key = getattr(cfg, "openai_api_key", "")
            if openai_key:
                self._openai_client = self._init_openai(openai_key, cfg)
                if self._openai_client:
                    self._provider = "openai"
                    logger.info("[embedder] Provider: OpenAI %s (dim=%d)", self._openai_model, self._dim)

        if self._provider == "none" and forced in ("google", ""):
            google_key = getattr(cfg, "google_api_key", "")
            if google_key:
                self._google_client = self._init_google(google_key)
                if self._google_client:
                    self._provider = "google"
                    logger.info("[embedder] Provider: Google gemini-embedding-001 (dim=%d)", self._dim)

        if self._provider == "none" and forced in ("local", "fastembed", ""):
            self._fastembed_model = self._init_fastembed()
            if self._fastembed_model:
                self._provider = "fastembed"
                self._dim = 384  # fastembed all-MiniLM-L6-v2 is always 384
                logger.info("[embedder] Provider: fastembed all-MiniLM-L6-v2 (dim=384, local)")

        if self._provider == "none":
            logger.error(
                "[embedder] No provider available. Set OPENAI_API_KEY or GOOGLE_API_KEY."
            )

    # ── Provider initializers ───────────────────────────────────────────────────

    def _init_openai(self, api_key: str, cfg):
        try:
            from openai import OpenAI
            model = getattr(cfg, "rag_openai_model", _OPENAI_EMBED_MODEL_DEFAULT)
            self._openai_model = model
            return OpenAI(api_key=api_key)
        except ImportError:
            logger.debug("[embedder] openai package not installed")
            return None

    def _init_google(self, api_key: str):
        try:
            from google import genai
            return genai.Client(api_key=api_key)
        except ImportError:
            logger.debug("[embedder] google-genai package not installed")
            return None

    def _init_fastembed(self):
        try:
            from fastembed import TextEmbedding
            return TextEmbedding("sentence-transformers/all-MiniLM-L6-v2")
        except ImportError:
            logger.debug("[embedder] fastembed package not installed")
            return None

    # ── Public API ──────────────────────────────────────────────────────────────

    @property
    def provider(self) -> str:
        return self._provider

    @property
    def dim(self) -> int:
        return self._dim

    @property
    def available(self) -> bool:
        return self._provider != "none"

    def embed(self, text: str) -> list[float] | None:
        """Embed a single text. Returns None on any failure."""
        if not text or not text.strip():
            return None
        try:
            if self._provider == "openai":
                return self._openai_single(text)
            if self._provider == "google":
                return self._google_single(text)
            if self._provider == "fastembed":
                return self._fastembed_single(text)
        except Exception as exc:
            logger.error("[embedder] embed() failed (%s): %s", self._provider, exc)
        return None

    def embed_batch(
        self,
        texts: list[str],
        batch_size: int = 50,
        delay_s: float = 0.0,
    ) -> list[list[float] | None]:
        """
        Embed multiple texts. Returns list aligned with input; None where embedding failed.
        `delay_s` adds a sleep between batches (useful for Google free-tier rate limits).
        """
        results: list[list[float] | None] = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            try:
                if self._provider == "openai":
                    results.extend(self._openai_batch(batch))
                elif self._provider == "google":
                    results.extend(self._google_batch(batch, delay_s))
                elif self._provider == "fastembed":
                    results.extend(self._fastembed_batch(batch))
                else:
                    results.extend([None] * len(batch))
            except Exception as exc:
                logger.error(
                    "[embedder] embed_batch() batch %d failed (%s): %s",
                    i // batch_size, self._provider, exc,
                )
                results.extend([None] * len(batch))
        return results

    # ── Provider-specific implementations ──────────────────────────────────────

    def _openai_single(self, text: str) -> list[float]:
        resp = self._openai_client.embeddings.create(
            model=self._openai_model,
            input=text,
            dimensions=self._dim,
        )
        return resp.data[0].embedding

    def _openai_batch(self, texts: list[str]) -> list[list[float]]:
        resp = self._openai_client.embeddings.create(
            model=self._openai_model,
            input=texts,
            dimensions=self._dim,
        )
        # API guarantees results in the same order as input
        return [item.embedding for item in sorted(resp.data, key=lambda x: x.index)]

    def _google_single(self, text: str) -> list[float]:
        from google.genai import types
        resp = self._google_client.models.embed_content(
            model=_GOOGLE_EMBED_MODEL,
            contents=text,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY",
                output_dimensionality=self._dim,
            ),
        )
        return resp.embeddings[0].values

    def _google_batch(self, texts: list[str], delay_s: float) -> list[list[float] | None]:
        results = []
        for text in texts:
            vec = None
            for attempt in range(3):
                try:
                    vec = self._google_single(text)
                    break
                except Exception as exc:
                    msg = str(exc)
                    if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                        wait = 60
                        logger.warning("[embedder] Google rate limited, waiting %ds", wait)
                        time.sleep(wait)
                    elif attempt < 2:
                        time.sleep(2 ** attempt)
                    else:
                        logger.error("[embedder] Google embed failed after 3 attempts: %s", exc)
            results.append(vec)
            if delay_s > 0:
                time.sleep(delay_s)
        return results

    def _fastembed_single(self, text: str) -> list[float]:
        return list(next(iter(self._fastembed_model.embed([text]))))

    def _fastembed_batch(self, texts: list[str]) -> list[list[float]]:
        return [list(v) for v in self._fastembed_model.embed(texts)]
