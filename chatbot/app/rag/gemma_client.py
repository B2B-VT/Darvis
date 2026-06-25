import logging
import anthropic
from app.config import get_settings
from app.rag.prompts import SYSTEM_PROMPT
from app.safety.guardrails import sanitize_answer

logger = logging.getLogger("darvis.llm")


class GemmaAnswerClient:
    """LLM client backed by Anthropic (Claude Haiku by default)."""

    def __init__(self):
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY is missing. Add it to your .env file.")
        self._client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            timeout=30.0,
        )
        self._model = settings.anthropic_model
        self._system = SYSTEM_PROMPT

    def _generate(
        self,
        prompt: str,
        max_tokens: int,
        use_system: bool = True,
        history: list | None = None,
    ) -> str | None:
        try:
            messages = []
            for msg in (history or []):
                role = msg.get("role") if isinstance(msg, dict) else getattr(msg, "role", None)
                content = msg.get("content") if isinstance(msg, dict) else getattr(msg, "content", None)
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": str(content)[:1000]})
            messages.append({"role": "user", "content": prompt})
            kwargs: dict = {
                "model": self._model,
                "max_tokens": max_tokens,
                "messages": messages,
                "temperature": 0.2 if use_system else 0.1,
            }
            if use_system:
                kwargs["system"] = self._system
            response = self._client.messages.create(**kwargs)
            if not response.content:
                return None
            return response.content[0].text
        except anthropic.APITimeoutError as exc:
            logger.error("[LLMClient] timeout: %s", exc)
            return None
        except Exception as exc:
            logger.error("[LLMClient] error (%s): %s", type(exc).__name__, exc)
            return None

    def answer(self, prompt: str, max_tokens: int = 800, history: list | None = None) -> str | None:
        raw = self._generate(prompt, max_tokens, use_system=True, history=history)
        if not raw:
            return None
        result = sanitize_answer(raw)
        if not result:
            logger.warning("[LLMClient] sanitize_answer returned empty — using template fallback")
            return None
        return result

    def answer_raw(self, prompt: str, max_tokens: int = 300) -> str | None:
        return self._generate(prompt, max_tokens, use_system=False)

    def judge_relevance(self, question: str, context: str) -> bool | None:
        if not context or not context.strip():
            return False
        prompt = (
            "Question: " + question.strip() + "\n\n"
            "Retrieved context:\n" + context.strip()[:2000] + "\n\n"
            "Does the retrieved context above contain information that "
            "directly answers the question? Reply with exactly one word: "
            "YES or NO."
        )
        raw = self._generate(prompt, max_tokens=10, use_system=False)
        if raw is None:
            return None
        verdict = raw.strip().upper()
        if verdict.startswith("YES"):
            return True
        if verdict.startswith("NO"):
            return False
        logger.warning("[LLMClient] judge_relevance got unexpected output: %r", raw[:50])
        return None
