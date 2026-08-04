import logging
import time
import openai
from app.config import get_settings
from app.rag.prompts import SYSTEM_PROMPT
from app.safety.guardrails import sanitize_answer

logger = logging.getLogger("darvis.llm")


class GemmaAnswerClient:
    """LLM client backed by Groq (openai/gpt-oss-120b by default)."""

    def __init__(self, max_retries: int | None = None):
        settings = get_settings()
        if not settings.groq_api_key:
            raise ValueError("GROQ_API_KEY is missing. Add it to your .env file.")
        client_kwargs = {
            "base_url": "https://api.groq.com/openai/v1",
            "api_key": settings.groq_api_key,
            "timeout": 30.0,
        }
        if max_retries is not None:
            client_kwargs["max_retries"] = max_retries
        self._client = openai.OpenAI(**client_kwargs)
        self._model = settings.groq_model
        self._system = SYSTEM_PROMPT
        self._provider = "groq"
        self._call_history: list[dict] = []

    def reset_call_history(self) -> None:
        self._call_history = []

    def call_history(self) -> list[dict]:
        return [dict(item) for item in self._call_history]

    def _base_call_state(self) -> dict:
        return {
            "provider": self._provider,
            "model": self._model,
            "attempt_count": 1,
            "fallback_used": False,
            "fallback_reason": None,
            "rate_limited": False,
            "timeout": False,
            "latency_ms": 0,
            "input_tokens": None,
            "output_tokens": None,
        }

    def _record_call_state(self, state: dict) -> None:
        self._call_history.append(dict(state))

    def _generate(
        self,
        prompt: str,
        max_tokens: int,
        use_system: bool = True,
        history: list | None = None,
    ) -> str | None:
        state = self._base_call_state()
        started = time.time()
        try:
            messages = []
            if use_system:
                messages.append({"role": "system", "content": self._system})
            for msg in (history or []):
                role = msg.get("role") if isinstance(msg, dict) else getattr(msg, "role", None)
                content = msg.get("content") if isinstance(msg, dict) else getattr(msg, "content", None)
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": str(content)[:1000]})
            messages.append({"role": "user", "content": prompt})
            response = self._client.chat.completions.create(
                model=self._model,
                max_tokens=max_tokens,
                messages=messages,
                temperature=0.2 if use_system else 0.1,
                reasoning_effort="low",
            )
            state["latency_ms"] = round((time.time() - started) * 1000, 1)
            usage = getattr(response, "usage", None)
            if usage is not None:
                state["input_tokens"] = getattr(usage, "prompt_tokens", None)
                state["output_tokens"] = getattr(usage, "completion_tokens", None)
            self._record_call_state(state)
            if not response.choices:
                return None
            return response.choices[0].message.content
        except openai.APITimeoutError as exc:
            state["latency_ms"] = round((time.time() - started) * 1000, 1)
            state["timeout"] = True
            state["fallback_used"] = True
            state["fallback_reason"] = "timeout"
            self._record_call_state(state)
            logger.error("[LLMClient] timeout: %s", exc)
            return None
        except openai.RateLimitError as exc:
            state["latency_ms"] = round((time.time() - started) * 1000, 1)
            state["rate_limited"] = True
            state["fallback_used"] = True
            state["fallback_reason"] = "rate_limited"
            self._record_call_state(state)
            logger.error("[LLMClient] rate limited: %s", exc)
            return None
        except Exception as exc:
            state["latency_ms"] = round((time.time() - started) * 1000, 1)
            state["fallback_used"] = True
            state["fallback_reason"] = type(exc).__name__
            self._record_call_state(state)
            logger.error("[LLMClient] error (%s): %s", type(exc).__name__, exc)
            return None

    def answer(self, prompt: str, max_tokens: int = 1200, history: list | None = None) -> str | None:
        raw = self._generate(prompt, max_tokens, use_system=True, history=history)
        if not raw:
            return None
        result = sanitize_answer(raw)
        if not result:
            if self._call_history:
                self._call_history[-1]["fallback_used"] = True
                self._call_history[-1]["fallback_reason"] = "sanitize_empty"
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
        raw = self._generate(prompt, max_tokens=80, use_system=False)
        if raw is None:
            return None
        verdict = raw.strip().upper()
        if verdict.startswith("YES"):
            return True
        if verdict.startswith("NO"):
            return False
        logger.warning("[LLMClient] judge_relevance got unexpected output: %r", raw[:50])
        return None
