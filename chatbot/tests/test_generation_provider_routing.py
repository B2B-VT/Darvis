from __future__ import annotations

import inspect
import json

import pytest

from app.config import get_settings
from app.generation.model_types import GenerationResult, ModelConfig, ModelTier
from app.generation.providers import MissingModelConfigurationError, OpenAIModelClient, resolve_model_config
from app.generation.structured_generator import StructuredGenerationAdapter

import app.generation.providers as providers_mod


# ── Fakes ─────────────────────────────────────────────────────────────────────

class _FakeUsage:
    def __init__(self, prompt_tokens, completion_tokens):
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens


class _FakeMessage:
    def __init__(self, content):
        self.content = content


class _FakeChoice:
    def __init__(self, content):
        self.message = _FakeMessage(content)


class _FakeChatCompletion:
    def __init__(self, content, prompt_tokens=10, completion_tokens=5):
        self.choices = [_FakeChoice(content)]
        self.usage = _FakeUsage(prompt_tokens, completion_tokens)


class _FakeRateLimitError(Exception):
    pass


class _FakeTimeoutError(Exception):
    pass


class _FakeCompletions:
    def __init__(self, responses):
        self._responses = list(responses)

    def create(self, **kwargs):
        item = self._responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


class _FakeChat:
    def __init__(self, responses):
        self.completions = _FakeCompletions(responses)


class FakeOpenAISDK:
    def __init__(self, responses):
        self.chat = _FakeChat(responses)


class QueueGenerationClient:
    """
    GenerationClient test double returning a fixed queue of either raw JSON
    strings or pre-built GenerationResult objects (for rate-limit/timeout
    scenarios), one per call — implements the same protocol OpenAIModelClient
    and GemmaClientAdapter do.
    """

    def __init__(self, outputs):
        self._queue = list(outputs)
        self.history = []
        self.calls: list[dict] = []

    def reset_call_history(self):
        self.history = []

    def call_history(self):
        return list(self.history)

    def generate_json(self, *, prompt, model, max_tokens, reasoning_effort=None):
        self.calls.append({"model": model, "reasoning_effort": reasoning_effort})
        item = self._queue.pop(0) if self._queue else None
        if isinstance(item, GenerationResult):
            result = item
        else:
            result = GenerationResult(
                raw_text=item, provider="fake", model=model,
                input_tokens=10, output_tokens=5, latency_ms=1.0,
            )
        self.history.append({
            "provider": result.provider, "model": result.model, "attempt_count": 1,
            "fallback_used": False, "fallback_reason": None,
            "rate_limited": result.rate_limited, "timeout": result.timeout,
            "latency_ms": result.latency_ms,
            "input_tokens": result.input_tokens, "output_tokens": result.output_tokens,
        })
        return result


GOOD_COURSE_REC = json.dumps({
    "answer_type": "course_recommendation",
    "summary": "Take CS 4824 for machine learning basics.",
    "recommendations": [{
        "course": "CS 4824", "title": "Machine Learning", "reason": "It is the approved ML course.",
        "description": "Machine learning.", "evidence_ids": ["COURSE:CS 4824"], "limitations": [],
    }],
    "limitations": [],
})
BAD_JSON = "{not valid json"
UNSUPPORTED_CLAIM = json.dumps({
    "answer_type": "course_recommendation",
    "summary": "Avg GPA is 3.99 for this course.",
    "recommendations": [], "limitations": [],
})
FILLER_ONLY = json.dumps({
    "answer_type": "course_recommendation",
    "summary": "Ok.",
    "recommendations": [{
        "course": "CS 4824", "title": "Machine Learning", "reason": "It is the approved ML course.",
        "description": "Machine learning.", "evidence_ids": ["COURSE:CS 4824"], "limitations": [],
    }],
    "limitations": [],
})


def course_rec_fixture():
    return {
        "case_id": "case_esc",
        "query": "What AI class should I take?",
        "user_profile": {"major": "Computer Science"},
        "answer_type": "course_recommendation",
        "resolved_entities": {},
        "approved_evidence": {
            "evidence_ids": ["COURSE:CS 4824"],
            "approved_candidates": [{
                "stable_id": "COURSE:CS 4824", "entity_type": "course",
                "subject": "CS", "course_number": "4824", "source": "fixture", "approval_status": "approved",
            }],
            "structured_payload": {"course": "CS 4824", "title": "Machine Learning"},
        },
        "sufficiency": {"passed": True, "status": "sufficient", "reasons": []},
        "required_fields": [],
        "forbidden_claims": [],
    }


def professor_profile_fixture():
    f = course_rec_fixture()
    f["answer_type"] = "professor_profile"
    return f


@pytest.fixture
def routing_settings(monkeypatch):
    monkeypatch.setenv("OPENAI_LUNA_MODEL", "luna-test-model")
    monkeypatch.setenv("OPENAI_TERRA_MODEL", "terra-test-model")
    monkeypatch.setenv("OPENAI_SOL_MODEL", "sol-test-model")
    monkeypatch.delenv("CYRUS_MODEL_MAX_ESCALATIONS", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


# ── Provider tests ────────────────────────────────────────────────────────────

def test_openai_client_records_provider_and_model(monkeypatch):
    resp = _FakeChatCompletion('{"ok": true}')
    monkeypatch.setattr(providers_mod.openai, "OpenAI", lambda **kw: FakeOpenAISDK([resp]))
    client = OpenAIModelClient("test-key")
    result = client.generate_json(prompt="hi", model="gpt-test", max_tokens=100)
    assert result.provider == "openai"
    assert result.model == "gpt-test"
    assert result.raw_text == '{"ok": true}'


def test_openai_client_captures_token_usage(monkeypatch):
    resp = _FakeChatCompletion("{}", prompt_tokens=42, completion_tokens=17)
    monkeypatch.setattr(providers_mod.openai, "OpenAI", lambda **kw: FakeOpenAISDK([resp]))
    client = OpenAIModelClient("test-key")
    result = client.generate_json(prompt="hi", model="gpt-test", max_tokens=100)
    assert result.input_tokens == 42
    assert result.output_tokens == 17


def test_cost_calculation_correct():
    config = ModelConfig(
        tier=ModelTier.TERRA, model_id="x", reasoning_effort=None,
        input_price_per_million=2.0, output_price_per_million=8.0,
    )
    cost = config.estimated_cost_usd(1_000_000, 500_000)
    assert cost == pytest.approx(2.0 + 4.0)


def test_openai_client_captures_rate_limit(monkeypatch):
    monkeypatch.setattr(providers_mod.openai, "RateLimitError", _FakeRateLimitError)
    monkeypatch.setattr(providers_mod.openai, "OpenAI", lambda **kw: FakeOpenAISDK([_FakeRateLimitError("rate limited")]))
    client = OpenAIModelClient("test-key")
    result = client.generate_json(prompt="hi", model="gpt-test", max_tokens=100)
    assert result.rate_limited is True
    assert result.raw_text is None
    assert result.error == "rate_limited"


def test_openai_client_captures_timeout(monkeypatch):
    monkeypatch.setattr(providers_mod.openai, "APITimeoutError", _FakeTimeoutError)
    monkeypatch.setattr(providers_mod.openai, "OpenAI", lambda **kw: FakeOpenAISDK([_FakeTimeoutError("timed out")]))
    client = OpenAIModelClient("test-key")
    result = client.generate_json(prompt="hi", model="gpt-test", max_tokens=100)
    assert result.timeout is True
    assert result.raw_text is None
    assert result.error == "timeout"


def test_strict_mode_disables_sdk_retry(monkeypatch):
    captured = {}

    def fake_ctor(**kwargs):
        captured.update(kwargs)
        return FakeOpenAISDK([_FakeChatCompletion("{}")])

    monkeypatch.setattr(providers_mod.openai, "OpenAI", fake_ctor)
    OpenAIModelClient("test-key", strict=True)
    assert captured["max_retries"] == 0


def test_non_strict_mode_allows_configured_retries(monkeypatch):
    captured = {}

    def fake_ctor(**kwargs):
        captured.update(kwargs)
        return FakeOpenAISDK([_FakeChatCompletion("{}")])

    monkeypatch.setattr(providers_mod.openai, "OpenAI", fake_ctor)
    OpenAIModelClient("test-key", strict=False, max_retries=3)
    assert captured["max_retries"] == 3


def test_missing_api_key_fails_clearly():
    with pytest.raises(ValueError):
        OpenAIModelClient("")


def test_missing_model_configuration_fails_clearly():
    from types import SimpleNamespace
    settings = SimpleNamespace(
        openai_luna_model="", openai_terra_model="terra-x", openai_sol_model="sol-x",
        openai_luna_reasoning_effort="", openai_terra_reasoning_effort="", openai_sol_reasoning_effort="",
    )
    with pytest.raises(MissingModelConfigurationError):
        resolve_model_config(ModelTier.LUNA, settings)


# ── Forced-tier tests ─────────────────────────────────────────────────────────

def test_forced_luna_bypasses_router(routing_settings):
    client = QueueGenerationClient([GOOD_COURSE_REC])
    adapter = StructuredGenerationAdapter(client, forced_tier=ModelTier.LUNA)
    result = adapter.generate(course_rec_fixture())
    assert result["routing"]["selected_tier"] == "luna"
    assert result["routing"]["routing_reason"] == "forced_by_eval_cli"


def test_forced_terra_bypasses_router(routing_settings):
    client = QueueGenerationClient([GOOD_COURSE_REC])
    adapter = StructuredGenerationAdapter(client, forced_tier=ModelTier.TERRA)
    result = adapter.generate(course_rec_fixture())
    assert result["routing"]["selected_tier"] == "terra"
    assert result["routing"]["routing_reason"] == "forced_by_eval_cli"


def test_forced_sol_bypasses_router(routing_settings):
    client = QueueGenerationClient([GOOD_COURSE_REC])
    adapter = StructuredGenerationAdapter(client, forced_tier=ModelTier.SOL)
    result = adapter.generate(course_rec_fixture())
    assert result["routing"]["selected_tier"] == "sol"
    assert result["routing"]["routing_reason"] == "forced_by_eval_cli"


def test_forced_evaluation_does_not_escalate_by_default(routing_settings):
    client = QueueGenerationClient([BAD_JSON, BAD_JSON])
    adapter = StructuredGenerationAdapter(client, forced_tier=ModelTier.LUNA, escalation_enabled=False)
    result = adapter.generate(course_rec_fixture())
    assert result["escalation"]["attempted"] is False
    assert len(result["attempts"]) == 1
    assert result["validation"]["safe_fallback"] is True


def test_forced_evaluation_escalates_when_explicitly_enabled(routing_settings):
    client = QueueGenerationClient([BAD_JSON, BAD_JSON, GOOD_COURSE_REC])
    adapter = StructuredGenerationAdapter(client, forced_tier=ModelTier.LUNA, escalation_enabled=True)
    result = adapter.generate(course_rec_fixture())
    assert result["escalation"]["attempted"] is True
    assert result["escalation"]["final_tier"] == "terra"


# ── Escalation tests ──────────────────────────────────────────────────────────

def test_luna_escalates_to_terra_on_schema_failure(routing_settings):
    client = QueueGenerationClient([BAD_JSON, BAD_JSON, GOOD_COURSE_REC])
    adapter = StructuredGenerationAdapter(client, forced_tier=ModelTier.LUNA, escalation_enabled=True)
    result = adapter.generate(course_rec_fixture())
    assert result["escalation"]["attempted"] is True
    assert result["escalation"]["from_tier"] == "luna"
    assert result["escalation"]["final_tier"] == "terra"
    assert [a["tier"] for a in result["attempts"]] == ["luna", "terra"]
    assert result["validation"]["valid"] is True


def test_luna_escalates_to_terra_on_unsupported_claim(routing_settings):
    client = QueueGenerationClient([UNSUPPORTED_CLAIM, UNSUPPORTED_CLAIM, GOOD_COURSE_REC])
    adapter = StructuredGenerationAdapter(client, forced_tier=ModelTier.LUNA, escalation_enabled=True)
    result = adapter.generate(course_rec_fixture())
    assert result["escalation"]["attempted"] is True
    assert "unsupported_numeric_claim" in result["attempts"][0]["validation_errors"]


def test_terra_escalates_to_sol_on_quality_gate_failure(routing_settings):
    client = QueueGenerationClient([FILLER_ONLY, FILLER_ONLY, GOOD_COURSE_REC])
    adapter = StructuredGenerationAdapter(client, forced_tier=ModelTier.TERRA, escalation_enabled=True)
    result = adapter.generate(course_rec_fixture())
    assert result["escalation"]["attempted"] is True
    assert result["escalation"]["from_tier"] == "terra"
    assert result["escalation"]["final_tier"] == "sol"
    assert "missing_direct_answer" in result["attempts"][0]["validation_errors"]


def test_sol_failure_returns_deterministic_fallback(routing_settings):
    client = QueueGenerationClient([BAD_JSON, BAD_JSON])
    adapter = StructuredGenerationAdapter(client, forced_tier=ModelTier.SOL, escalation_enabled=True)
    result = adapter.generate(course_rec_fixture())
    assert result["validation"]["safe_fallback"] is True
    assert result["response"]["answer_type"] == "insufficient_data"
    assert result["escalation"]["attempted"] is False  # Sol has no next tier to escalate to


def test_maximum_two_escalations(routing_settings):
    client = QueueGenerationClient([BAD_JSON] * 6)
    adapter = StructuredGenerationAdapter(client, use_router=True, escalation_enabled=True)
    result = adapter.generate(professor_profile_fixture())
    assert result["escalation"]["count"] == 2
    assert [a["tier"] for a in result["attempts"]] == ["luna", "terra", "sol"]
    assert result["validation"]["safe_fallback"] is True


def test_escalation_preserves_answer_type_and_evidence(routing_settings):
    client = QueueGenerationClient([BAD_JSON, BAD_JSON, GOOD_COURSE_REC])
    fixture = course_rec_fixture()
    original_evidence = json.loads(json.dumps(fixture["approved_evidence"]))
    original_answer_type = fixture["answer_type"]
    adapter = StructuredGenerationAdapter(client, forced_tier=ModelTier.LUNA, escalation_enabled=True)
    result = adapter.generate(fixture)
    # The caller's original fixture dict is untouched by the adapter.
    assert fixture["approved_evidence"] == original_evidence
    assert fixture["answer_type"] == original_answer_type
    assert result["response"]["answer_type"] == "course_recommendation"


def test_no_retrieval_planner_or_resolver_imported_by_generation():
    import app.generation.structured_generator as sg
    source = inspect.getsource(sg)
    for forbidden in ("app.rag.retriever", "app.rag.vector_store", "app.rag.query_planner", "app.safety.entity_resolver"):
        assert forbidden not in source


# ── Metadata tests ────────────────────────────────────────────────────────────

def test_metadata_records_selected_and_final_model(routing_settings):
    client = QueueGenerationClient([BAD_JSON, BAD_JSON, GOOD_COURSE_REC])
    adapter = StructuredGenerationAdapter(client, forced_tier=ModelTier.LUNA, escalation_enabled=True)
    result = adapter.generate(course_rec_fixture())
    assert result["routing"]["selected_model"] == "luna-test-model"
    assert result["escalation"]["final_model"] == "terra-test-model"


def test_metadata_all_attempts_recorded(routing_settings):
    client = QueueGenerationClient([BAD_JSON, BAD_JSON, GOOD_COURSE_REC])
    adapter = StructuredGenerationAdapter(client, forced_tier=ModelTier.LUNA, escalation_enabled=True)
    result = adapter.generate(course_rec_fixture())
    assert [a["tier"] for a in result["attempts"]] == ["luna", "terra"]


def test_metadata_escalation_reason_recorded(routing_settings):
    client = QueueGenerationClient([BAD_JSON, BAD_JSON, GOOD_COURSE_REC])
    adapter = StructuredGenerationAdapter(client, forced_tier=ModelTier.LUNA, escalation_enabled=True)
    result = adapter.generate(course_rec_fixture())
    assert result["escalation"]["reason"] == "malformed_json"


def test_metadata_aggregate_tokens_and_cost_correct(routing_settings):
    r1 = GenerationResult(raw_text=BAD_JSON, provider="fake", model="luna-test-model", input_tokens=100, output_tokens=20, latency_ms=5.0)
    r2 = GenerationResult(raw_text=BAD_JSON, provider="fake", model="luna-test-model", input_tokens=100, output_tokens=20, latency_ms=5.0)
    r3 = GenerationResult(raw_text=GOOD_COURSE_REC, provider="fake", model="terra-test-model", input_tokens=200, output_tokens=50, latency_ms=8.0)
    client = QueueGenerationClient([r1, r2, r3])
    adapter = StructuredGenerationAdapter(client, forced_tier=ModelTier.LUNA, escalation_enabled=True)
    result = adapter.generate(course_rec_fixture())
    assert result["cost"]["total_input_tokens"] == 100 + 100 + 200
    assert result["cost"]["total_output_tokens"] == 20 + 20 + 50
    assert result["cost"]["total_estimated_cost_usd"] > 0
    assert "luna" in result["cost"]["by_tier"]
    assert "terra" in result["cost"]["by_tier"]


# ── Regression / config-default tests ─────────────────────────────────────────

def test_tinybert_remains_disabled_by_default():
    from app.config import Settings
    assert Settings.model_fields["rag_enable_local_reranker"].default is False


def test_model_routing_disabled_by_default():
    from app.config import Settings
    assert Settings.model_fields["cyrus_model_routing_enabled"].default is False


def test_legacy_path_unaffected_when_no_tier_options_passed():
    from tests.test_structured_generation import FakeGenerationClient, fixture as legacy_fixture
    client = FakeGenerationClient([GOOD_COURSE_REC])
    adapter = StructuredGenerationAdapter(client)
    result = adapter.generate(legacy_fixture())
    assert "routing" not in result
    assert "attempts" not in result
    assert "escalation" not in result
    assert result["validation"]["valid"] is True
