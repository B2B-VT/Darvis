# Cyrus Structured Generation Report

## 1. Executive Summary

Implemented the structured generation-only path:

Approved evidence fixture -> deterministic answer type -> deterministic sufficiency input -> structured JSON prompt -> configured provider/model call -> strict schema validation -> unsupported-claim validation -> one repair attempt -> deterministic safe fallback -> generation grading.

The path does not rerun retrieval and does not access vector search.

Strict generation run 1 was invalid because Groq rate limits prevented provider-stable execution:

- `run_valid`: `false`
- invalid reasons: `blocked_cases`, `fallback_used`, `rate_limited`
- rate-limited cases: `32`
- fallback rate: `0.825`

Per the stop condition, strict run 2 and end-to-end evaluation were not run.

## 2. Architecture

New modules:

- `chatbot/app/generation/schemas.py`
- `chatbot/app/generation/validator.py`
- `chatbot/app/generation/structured_generator.py`

Generation-only mode in `evals/run.py` now:

1. Reads approved-evidence fixtures.
2. Calls `StructuredGenerationAdapter`.
3. Builds a schema-guided prompt from fixture evidence only.
4. Calls Groq using the configured `GROQ_MODEL`.
5. Parses JSON only.
6. Validates the selected answer type.
7. Validates strict Pydantic schemas.
8. Validates unsupported claims and evidence IDs.
9. Retries once on validation failure.
10. Returns safe deterministic fallback if repair fails.
11. Emits a legacy-compatible `answer`, `tables`, and `eval_trace` for existing graders.

The adapter uses `GemmaAnswerClient(max_retries=0)` so strict evals fail fast on provider 429s. Production `GemmaAnswerClient()` behavior is unchanged.

## 3. Files Changed

Created:

- `docs/CYRUS_STRUCTURED_GENERATION_IMPLEMENTATION_PLAN.md`
- `chatbot/app/generation/__init__.py`
- `chatbot/app/generation/schemas.py`
- `chatbot/app/generation/validator.py`
- `chatbot/app/generation/structured_generator.py`
- `chatbot/tests/test_structured_generation.py`
- `evals/reports/CYRUS_STRUCTURED_GENERATION_REPORT.md`

Modified:

- `evals/run.py`
- `chatbot/app/rag/gemma_client.py`

## 4. Tests Run

Compile:

- `chatbot/.venv/bin/python -m py_compile evals/run.py chatbot/app/generation/schemas.py chatbot/app/generation/validator.py chatbot/app/generation/structured_generator.py`
- `chatbot/.venv/bin/python -m py_compile chatbot/app/rag/gemma_client.py chatbot/app/generation/structured_generator.py evals/run.py`

Structured generation tests:

- `chatbot/.venv/bin/python -m pytest chatbot/tests/test_structured_generation.py`
- result: `15 passed, 1 warning`

Full chatbot suite:

- `chatbot/.venv/bin/python -m pytest chatbot/tests/`
- result: `187 passed, 2 warnings`

Retrieval-only regression:

- `chatbot/.venv/bin/python evals/run.py --retrieval-only --out-dir evals/reports/generation_structured_retrieval_check`
- completed successfully

Strict generation run 1:

- `chatbot/.venv/bin/python evals/run.py --generation-only --fixtures evals/fixtures/generation/prechange_approved_payloads.jsonl --out-dir evals/reports/generation_structured_run_1 --require-provider-success`
- exited invalid due provider instability

## 5. Provider Validity

Source: `evals/reports/generation_structured_run_1/latest_summary.json`

```json
{
  "run_valid": false,
  "invalid_reasons": [
    "blocked_cases",
    "fallback_used",
    "rate_limited"
  ],
  "provider_count": 1,
  "model_count": 1,
  "fallback_rate": 0.825,
  "rate_limited_count": 32,
  "timeout_count": 0,
  "error_count": 0
}
```

Provider and model were stable where calls completed:

- provider count: `1`
- model count: `1`

The run is still invalid because rate limits and safe fallbacks occurred.

## 6. Schema Compliance

Strict run 1 schema compliance over non-blocked graded rows:

- `response_schema_compliance`: `1.0`

This is not a release metric because the provider run is invalid.

## 7. Answer Type Accuracy

Strict run 1:

- `answer_type_accuracy`: `0.2857`

This is not release-comparable because the run is invalid and most cases were blocked by provider/fallback behavior.

## 8. Sufficiency Behavior

Strict run 1:

- `sufficiency_behavior`: `0.2857`

This is not release-comparable because the run is invalid.

## 9. Grounding

Strict run 1:

- `grounding`: `1.0`
- `unsupported_claim_rate`: `0.0`
- `prohibited_candidate_rate`: `0.0`

These are promising but not release-comparable because the run is invalid and many cases were blocked/fallback.

## 10. Format Compliance

Strict run 1:

- `format_compliance_rate`: `1.0`

This is not release-comparable because the run is invalid.

## 11. Run-To-Run Variance

Not measured.

Strict generation run 2 was not run because strict run 1 failed provider validity. Running a second suite after a known provider failure would not satisfy the task gates.

## 12. Retrieval Regression Check

Source: `evals/reports/generation_structured_retrieval_check/summary.json`

Control RRF:

- precision@5: `0.208`
- recall@5: `0.5957`
- nDCG@5: `0.6164`
- MRR: `0.7438`
- prohibited candidate rate: `0.0`

Retrieval metrics are unchanged from the prior generation freeze.

TinyBERT remains disabled by default.

## 13. Remaining Blockers

Primary blocker:

- Groq TPM rate limits prevent a valid strict generation-only run across the 40-case fixture set.

Secondary product/engineering work still pending:

- improve structured prompt compactness to reduce TPM pressure
- implement richer deterministic safe responses for sparse fixtures
- broaden fixture evidence payload quality for cases whose approved evidence is empty
- run two valid strict generation-only suites before any end-to-end release comparison

## 14. End-To-End Status

End-to-end evaluation may not proceed yet.

Required prerequisite not met:

- two valid generation-only runs with `--require-provider-success`

## 15. Production Recommendation

Do not deploy structured generation behavior to production yet.

Keep the implementation in eval-only mode and address provider capacity or prompt/token reduction before rerunning strict generation-only evaluation. End-to-end eval should resume only after two valid strict generation-only runs pass.
