from __future__ import annotations

import logging
import time
from typing import Any, Protocol, runtime_checkable

import openai

from app.generation.model_types import GenerationResult, ModelConfig, ModelTier

logger = logging.getLogger("darvis.generation.providers")

# Estimated USD per 1M tokens, keyed by tier. These are cost-reporting
# ESTIMATES only (see Phase 12 of the routing plan) — never a billing record.
# Actual model IDs are read from config/env (Phase 3); pricing here tracks
# the tier's intended cost class (Luna cheap, Terra mid, Sol premium), not a
# specific model SKU, since no model IDs are configured yet.
MODEL_PRICING: dict[ModelTier, tuple[float, float]] = {
    ModelTier.LUNA: (0.15, 0.60),
    ModelTier.TERRA: (2.50, 10.00),
    ModelTier.SOL: (15.00, 60.00),
}


class MissingModelConfigurationError(RuntimeError):
    """Raised when a forced/routed tier has no model ID configured."""


@runtime_checkable
class GenerationClient(Protocol):
    def generate_json(
        self,
        *,
        prompt: str,
        model: str,
        max_tokens: int,
        reasoning_effort: str | None = None,
    ) -> GenerationResult: ...

    def reset_call_history(self) -> None: ...

    def call_history(self) -> list[dict]: ...


def resolve_model_config(tier: ModelTier, settings: Any) -> ModelConfig:
    """
    Builds a ModelConfig for `tier` from settings. Fails clearly (rather than
    guessing a model name) when the tier's model ID is not configured.
    """
    model_id, reasoning_effort = {
        ModelTier.LUNA: (settings.openai_luna_model, settings.openai_luna_reasoning_effort),
        ModelTier.TERRA: (settings.openai_terra_model, settings.openai_terra_reasoning_effort),
        ModelTier.SOL: (settings.openai_sol_model, settings.openai_sol_reasoning_effort),
    }[tier]
    if not model_id:
        raise MissingModelConfigurationError(
            f"No model ID configured for tier '{tier.value}'. "
            f"Set OPENAI_{tier.value.upper()}_MODEL in the environment/.env."
        )
    input_price, output_price = MODEL_PRICING[tier]
    return ModelConfig(
        tier=tier,
        model_id=model_id,
        reasoning_effort=reasoning_effort or None,
        input_price_per_million=input_price,
        output_price_per_million=output_price,
    )


class GemmaClientAdapter:
    """
    Wraps the existing, unmodified GemmaAnswerClient so it satisfies the
    GenerationClient protocol. Preserves GemmaAnswerClient for legacy/
    production compatibility without changing a line of it.
    """

    def __init__(self, gemma_client: Any):
        self._client = gemma_client

    def generate_json(
        self,
        *,
        prompt: str,
        model: str,
        max_tokens: int,
        reasoning_effort: str | None = None,
    ) -> GenerationResult:
        started = time.time()
        raw = self._client.answer_raw(prompt, max_tokens=max_tokens)
        latency_ms = round((time.time() - started) * 1000, 1)
        calls = self._client.call_history() if hasattr(self._client, "call_history") else []
        last = calls[-1] if calls else {}
        return GenerationResult(
            raw_text=raw,
            provider=last.get("provider") or "groq",
            model=last.get("model") or model,
            input_tokens=last.get("input_tokens"),
            output_tokens=last.get("output_tokens"),
            latency_ms=float(last.get("latency_ms") or latency_ms),
            rate_limited=bool(last.get("rate_limited")),
            timeout=bool(last.get("timeout")),
            error=last.get("fallback_reason") if raw is None else None,
        )

    def reset_call_history(self) -> None:
        if hasattr(self._client, "reset_call_history"):
            self._client.reset_call_history()

    def call_history(self) -> list[dict]:
        if hasattr(self._client, "call_history"):
            return self._client.call_history()
        return []


class OpenAIModelClient:
    """
    GenerationClient implementation backed by the official OpenAI SDK.
    Model is supplied per-request (generate_json's `model` kwarg) rather than
    bound at construction, since router/forced-tier selection can vary the
    model between calls on the same client instance.
    """

    def __init__(self, api_key: str, *, strict: bool = False, max_retries: int = 2, timeout: float = 60.0):
        if not api_key:
            raise ValueError("OPENAI_API_KEY is missing. Add it to your .env file.")
        # Strict evaluation mode disables the SDK's own hidden retry-on-error
        # behavior so every attempt/failure is visible and attributable to a
        # single real call. Non-strict (production) mode allows configured
        # retries.
        self._client = openai.OpenAI(
            api_key=api_key,
            timeout=timeout,
            max_retries=0 if strict else max_retries,
        )
        self._strict = strict
        self._provider = "openai"
        self._call_history: list[dict] = []

    def reset_call_history(self) -> None:
        self._call_history = []

    def call_history(self) -> list[dict]:
        return [dict(item) for item in self._call_history]

    def generate_json(
        self,
        *,
        prompt: str,
        model: str,
        max_tokens: int,
        reasoning_effort: str | None = None,
    ) -> GenerationResult:
        state = {
            "provider": self._provider,
            "model": model,
            "attempt_count": 1,
            "rate_limited": False,
            "timeout": False,
            "latency_ms": 0.0,
            "input_tokens": None,
            "output_tokens": None,
            "error": None,
        }
        started = time.time()
        kwargs: dict[str, Any] = {
            "model": model,
            "max_completion_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
        }
        if reasoning_effort:
            kwargs["reasoning_effort"] = reasoning_effort
        try:
            response = self._client.chat.completions.create(**kwargs)
            state["latency_ms"] = round((time.time() - started) * 1000, 1)
            usage = getattr(response, "usage", None)
            if usage is not None:
                state["input_tokens"] = getattr(usage, "prompt_tokens", None)
                state["output_tokens"] = getattr(usage, "completion_tokens", None)
            self._call_history.append(dict(state))
            raw_text = response.choices[0].message.content if response.choices else None
            return GenerationResult(
                raw_text=raw_text,
                provider=self._provider,
                model=model,
                input_tokens=state["input_tokens"],
                output_tokens=state["output_tokens"],
                latency_ms=state["latency_ms"],
            )
        except openai.RateLimitError as exc:
            state["latency_ms"] = round((time.time() - started) * 1000, 1)
            state["rate_limited"] = True
            state["error"] = "rate_limited"
            self._call_history.append(dict(state))
            logger.error("[OpenAIModelClient] rate limited (model=%s): %s", model, exc)
            return GenerationResult(
                raw_text=None, provider=self._provider, model=model,
                input_tokens=None, output_tokens=None, latency_ms=state["latency_ms"],
                rate_limited=True, error="rate_limited",
            )
        except openai.APITimeoutError as exc:
            state["latency_ms"] = round((time.time() - started) * 1000, 1)
            state["timeout"] = True
            state["error"] = "timeout"
            self._call_history.append(dict(state))
            logger.error("[OpenAIModelClient] timeout (model=%s): %s", model, exc)
            return GenerationResult(
                raw_text=None, provider=self._provider, model=model,
                input_tokens=None, output_tokens=None, latency_ms=state["latency_ms"],
                timeout=True, error="timeout",
            )
        except Exception as exc:
            state["latency_ms"] = round((time.time() - started) * 1000, 1)
            state["error"] = type(exc).__name__
            self._call_history.append(dict(state))
            # Never include the API key in any logged/returned string.
            logger.error("[OpenAIModelClient] request error (model=%s): %s", model, type(exc).__name__)
            return GenerationResult(
                raw_text=None, provider=self._provider, model=model,
                input_tokens=None, output_tokens=None, latency_ms=state["latency_ms"],
                error=type(exc).__name__,
            )
