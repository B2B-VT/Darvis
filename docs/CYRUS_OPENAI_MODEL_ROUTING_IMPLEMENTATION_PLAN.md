# Cyrus OpenAI Model Routing — Implementation Plan

## 1. Freeze snapshot (2026-08-04)

| | |
|---|---|
| Commit | `a3e7da8789f86d81ed7fc3ee15f694ae4425f2e8` |
| Working tree | clean |
| Test results | 186 passed, 1 failed (`test_load_test_cases_from_xlsx` — pre-existing, unrelated tempfile/zipfile issue, not caused by generation code) |
| Retrieval-only metrics (`evals/reports/generation_remediation_prechange/retrieval_only/summary.json`) | precision@5 0.216, recall@5 0.599, nDCG@5 0.670, MRR 0.846, prohibited_candidate_rate 0.0 |
| Generation config | `GemmaAnswerClient` (Groq `openai/gpt-oss-120b`) is the sole generation provider, hard-instantiated inside `StructuredGenerationAdapter.__init__`. `StructuredGenerationAdapter` is eval-only — not referenced by `chatbot/app/main.py`'s live `/chat` dispatch. |
| TinyBERT | `rag_enable_local_reranker=False` by default (`chatbot/app/config.py:85`) — confirmed disabled. |
| RRF | `reranker.py` default provider `"passthrough"` sorts by the existing hybrid-retrieval RRF fusion order — confirmed production default. |
| Database | No schema changes planned or required by this iteration. |
| OPENAI_API_KEY | Present in `chatbot/.env` but **empty**. No Luna/Terra/Sol model IDs configured anywhere. Live OpenAI calls are blocked until this is set — code/router/tests proceed using mocked clients. |

## 2. Scope boundaries (explicitly out of scope this iteration)

- Retrieval, ranking, database schemas, entity resolution, evidence fixtures — untouched.
- TinyBERT — remains disabled; no config default changes.
- Fine-tuning — none.
- `GemmaAnswerClient` — zero modifications. A new adapter wraps it; the class itself is untouched.
- Production shadow routing — not implemented. `CYRUS_MODEL_ROUTING_ENABLED=false` by default; the live `/chat` path is unaffected because `StructuredGenerationAdapter` isn't wired into it.
- End-to-end evaluation — not run as part of this iteration (stop condition F).

## 3. Files

### New
| File | Purpose |
|---|---|
| `chatbot/app/generation/model_types.py` | `ModelTier`, `ModelConfig`, `RoutingDecision`, `GenerationResult` |
| `chatbot/app/generation/providers.py` | `GenerationClient` Protocol, `GemmaClientAdapter` (wraps `GemmaAnswerClient` without modifying it), `OpenAIModelClient` |
| `chatbot/app/generation/model_router.py` | Deterministic Luna/Terra/Sol router |
| `chatbot/tests/test_model_router.py` | Router unit tests |
| `chatbot/tests/test_generation_provider_routing.py` | Provider + escalation + metadata tests |
| `docs/CYRUS_OPENAI_MODEL_ROUTING_IMPLEMENTATION_PLAN.md` | This document |

### Modified
| File | Change |
|---|---|
| `chatbot/app/config.py` | Add `OPENAI_LUNA/TERRA/SOL_MODEL`, reasoning-effort fields, `CYRUS_MODEL_ROUTING_ENABLED` (default `false`), `CYRUS_DEFAULT_MODEL_TIER` (default `terra`), `CYRUS_MODEL_ESCALATION_ENABLED` (default `true`), `CYRUS_MODEL_MAX_ESCALATIONS` (default `2`), and a pricing table. `openai_api_key` field already exists — reused. |
| `chatbot/app/generation/structured_generator.py` | `StructuredGenerationAdapter` depends on the `GenerationClient` protocol instead of importing `GemmaAnswerClient` directly. Adds `forced_tier`, `use_router`, `escalation_enabled`, `strict_eval` constructor params. Legacy no-router, no-forced-tier path is behaviorally identical to today (same repair-once-then-fallback sequence, same default client). |
| `evals/run.py` | Adds `--force-model {luna,terra,sol}`, `--allow-escalation`, `--all-models`, `--use-model-router` to `--generation-only` mode. |
| `chatbot/tests/test_structured_generation.py` | `FakeLLM` (duck-typed `answer_raw`) becomes `FakeGenerationClient` (implements `GenerationClient.generate_json`), matching the new protocol. Assertions unchanged in spirit — same call counts, same repair semantics. |

## 4. Interfaces

```python
class GenerationClient(Protocol):
    def generate_json(self, *, prompt: str, model: str, max_tokens: int, reasoning_effort: str | None = None) -> GenerationResult: ...
    def reset_call_history(self) -> None: ...
    def call_history(self) -> list[dict]: ...
```

- `GemmaClientAdapter(GemmaAnswerClient)` implements this by calling `.answer_raw()` internally and wrapping the result into a `GenerationResult`, reading `.call_history()` for token/latency data. Zero changes to `GemmaAnswerClient`.
- `OpenAIModelClient` implements this directly against the OpenAI SDK (already a transitive dependency via the existing `openai` package used by `GemmaAnswerClient` against Groq's OpenAI-compatible endpoint).

## 5. Configuration fields (new)

```
OPENAI_API_KEY=                       (existing field, reused)
OPENAI_LUNA_MODEL=
OPENAI_TERRA_MODEL=
OPENAI_SOL_MODEL=
OPENAI_LUNA_REASONING_EFFORT=
OPENAI_TERRA_REASONING_EFFORT=
OPENAI_SOL_REASONING_EFFORT=
CYRUS_MODEL_ROUTING_ENABLED=false
CYRUS_DEFAULT_MODEL_TIER=terra
CYRUS_MODEL_ESCALATION_ENABLED=true
CYRUS_MODEL_MAX_ESCALATIONS=2
```

Plus a centralized `MODEL_PRICING` table (per-million input/output USD) keyed by tier, used only for estimated cost reporting — never treated as a billing record.

All fields default such that production behavior is unchanged: `CYRUS_MODEL_ROUTING_ENABLED=false` means the legacy single-client path runs unconditionally regardless of the other new fields' values.

## 6. Test coverage (Phase 14, see plan section 3 for file list)

Provider: provider/model recording, token usage, cost calc, rate-limit/timeout capture, strict-mode no hidden retry, missing-model-config fails clearly.
Router: Luna/Terra/Sol selection per the conservative policy in the spec, determinism, uncertainty-favors-stronger-tier.
Forced tier: bypasses router, no default escalation, `--allow-escalation` override.
Escalation: Luna→Terra, Terra→Sol, max two escalations, immutable evidence/answer-type/sufficiency, no retrieval calls.
Metadata: attempts recorded, escalation reason recorded, aggregate tokens/cost correct.
Regression: full existing suite continues to pass; retrieval-only metrics unchanged (not re-run — no retrieval code touched); prohibited-candidate rate untouched; TinyBERT still disabled by default (config default unchanged).

## 7. Rollback path

Every new piece is additive and gated:
- `CYRUS_MODEL_ROUTING_ENABLED=false` (default) → `StructuredGenerationAdapter` behaves exactly as before the PR, using `GemmaClientAdapter` wrapping the same `GemmaAnswerClient`.
- `StructuredGenerationAdapter` is not called from `main.py`, so there is no production `/chat` rollback surface — the live endpoint is unaffected regardless of this branch's state.
- To fully revert: `git revert` the commit(s) from this iteration. No migrations, no data written, no schema changes — a plain revert is sufficient.

## 8a. Policy revision (2026-08-04, post-sanity-check)

The original spec's stated policy was conservative-by-default: *"prefer Terra
over Luna when uncertain... do not optimize cost at the expense of grounding
or sufficiency."* Section 6's router implemented that literally — Luna was
gated to a narrow answer-type list, Terra was the default for everything
else.

The user explicitly revised this after reviewing early sanity-check results:
**Luna is now the default floor for every answer type.** Sol's high-stakes
signal list is unchanged (still conservative, still forces Sol regardless of
anything else). A new, smaller Terra-trigger list (moderate constraint count,
genuine multi-entity comparison, unresolved ambiguity, incomplete evidence,
repair-required) is checked between Sol and the Luna default — anything not
matching either list now goes to Luna, including `course_recommendation` and
`course_comparison` questions that previously defaulted to Terra
unconditionally by category. `compared_entity_count` was also narrowed to
only count evidence candidates for genuine comparison-type answers
(`course_comparison`), so a `course_recommendation` with several candidate
options isn't mistaken for a multi-entity comparison and pushed to Terra.

The escalation safety net is the reason this is safe to do: a wrong Luna
guess still self-corrects (Luna fails validation → Terra → Sol), so the cost
of being wrong is one extra cheap call, not a bad answer reaching the user.

## 8. Migration risks

- **No OpenAI API key configured** — blocks any live OpenAI call (Phases 8, 13, and live forced-tier runs). Code, router logic, and tests proceed against mocked `GenerationClient` implementations; this is a hard stop for real model-comparison data until the user supplies a key and (optionally) real model IDs.
- **Model IDs unset** — `OPENAI_LUNA_MODEL` etc. are read from env with no hardcoded default; a forced-tier request with a missing ID fails clearly (`SystemExit`/`ValueError`) rather than silently using a guessed model name.
- **Groq quota instability** (observed earlier this session, and in the existing `generation_only_fixture_replay` report, `run_valid: false` due to `rate_limited`/`request_or_provider_error`) is unrelated to this work but is a standing risk for any future Groq-tier comparison; OpenAI-side quota/rate-limit behavior is unknown until live calls are attempted.
- **Escalation design choice**: each tier keeps the existing one-repair-then-check semantics internally (same-model retry with validation-error feedback) before deciding to escalate to the next tier; this preserves today's proven repair behavior while adding cross-tier escalation on top, bounded by `CYRUS_MODEL_MAX_ESCALATIONS`. Documented here because the spec's phrasing ("repair required on Luna" as an escalation trigger, "failed repair on Terra") is compatible with either a single-attempt-per-tier or repair-then-escalate design; the latter was chosen to avoid throwing away the validated one-retry-repair mechanism already in production evals.
