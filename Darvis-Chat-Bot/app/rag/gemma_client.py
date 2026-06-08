import logging

from google import genai
from google.genai import types
from app.config import get_settings
from app.rag.prompts import SYSTEM_PROMPT
from app.safety.guardrails import sanitize_answer

logger = logging.getLogger("darvis.llm")


class GemmaAnswerClient:
    """
    LLM client backed by Google AI Studio (Gemma via google-genai SDK).
    Timeout is set at the HTTP layer so a slow or stuck model call never
    blocks the Render worker indefinitely.
    """

    def __init__(self):
        settings = get_settings()
        if not settings.google_api_key:
            raise ValueError("GOOGLE_API_KEY is missing. Add it to your .env file.")
        self._client = genai.Client(
            api_key=settings.google_api_key,
            http_options=types.HttpOptions(timeout=30),  # 30-second hard cap per request
        )
        self._model  = settings.google_model
        self._system = SYSTEM_PROMPT

    def _generate(self, prompt: str, max_tokens: int, use_system: bool = True) -> str | None:
        """Raw Gemma call shared by answer() and answer_raw()."""
        try:
            config = types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=max_tokens,
            )
            if use_system:
                config = types.GenerateContentConfig(
                    system_instruction=self._system,
                    temperature=0.2,
                    max_output_tokens=max_tokens,
                )
            response = self._client.models.generate_content(
                model=self._model,
                contents=prompt,
                config=config,
            )
            return response.text
        except TimeoutError as exc:
            logger.error("[GemmaClient] timeout: %s", exc)
            return None
        except Exception as exc:
            logger.error("[GemmaClient] error (%s): %s", type(exc).__name__, exc)
            return None

    def answer(self, prompt: str, max_tokens: int = 800) -> str | None:
        """
        Call Gemma and return sanitized advisor-tone prose.
        Returns None on any failure so callers can fall back to template answers.
        """
        raw = self._generate(prompt, max_tokens, use_system=True)
        if not raw:
            return None
        result = sanitize_answer(raw)
        if not result:
            logger.warning("[GemmaClient] sanitize_answer returned empty string — using template fallback")
            return None
        return result

    def answer_raw(self, prompt: str, max_tokens: int = 300) -> str | None:
        """
        Call Gemma without the advisor system prompt and without sanitization.
        Used for structured tasks (intent extraction, query rewriting) where the
        output is JSON or keywords, not prose. Low temperature for determinism.
        """
        return self._generate(prompt, max_tokens, use_system=False)
