# Cyrus Generation Baseline

## Executive Summary

The generation-remediation freeze is recorded under `evals/reports/generation_remediation_prechange/`.

The current end-to-end baseline is diagnostically useful but invalid for release comparison because provider instability and API rate limiting occurred during the run:

- 3 endpoint-level HTTP 429 failures from `/chat`
- repeated Groq 429 responses in server logs
- planner timeouts followed by deterministic fallback behavior

TinyBERT remains disabled by default:

- `RAG_ENABLE_LOCAL_RERANKER=false`
- configured local model: `cross-encoder/ms-marco-TinyBERT-L2-v2`

## Frozen State

- Current commit: `9f2976d8fdf1d3e8c2422688d5d30ed176fe96e7`
- Working-tree diff: `evals/reports/generation_remediation_prechange/working_tree_diff.patch`
- Diff hash: `evals/reports/generation_remediation_prechange/working_tree_diff.sha256`
- Environment: `evals/reports/generation_remediation_prechange/environment.json`
- Provider and feature flags: `evals/reports/generation_remediation_prechange/provider_and_flags.json`

Provider:

- `groq`
- `openai/gpt-oss-120b`

## Tests

Full chatbot suite:

- `172 passed`
- `2 warnings`
- output: `evals/reports/generation_remediation_prechange/full_chatbot_tests.txt`

## Retrieval-Only Baseline

Source: `evals/reports/generation_remediation_prechange/retrieval_only/summary.json`

Initial pool:

- recall@candidate_k: `0.6451`
- has any relevant: `0.8889`
- has all required: `0.7037`

Control, RRF passthrough:

- precision@5: `0.208`
- recall@5: `0.5957`
- nDCG@5: `0.6164`
- MRR: `0.7438`
- prohibited candidate rate: `0.0`
- exact entity match: `0.4667`

TinyBERT experiment remains disabled in production, but the retrieval-only tool still validates the optional experiment path:

- precision@5: `0.216`
- recall@5: `0.5988`
- nDCG@5: `0.6704`
- MRR: `0.8457`
- prohibited candidate rate: `0.0`
- fallback rate: `0.0`
- introduced candidates: `0`

## End-To-End Baseline

Source: `evals/reports/generation_remediation_prechange/end_to_end/latest_summary.json`

- total: `40`
- pass: `4`
- partial: `17`
- fail: `16`
- blocked: `3`
- critical security failures: `0`

Metrics:

- answer type accuracy: `0.6216`
- sufficiency behavior: `0.6216`
- grounding: `0.9189`
- format compliance: `0.6216`
- schema compliance: `1.0`
- unsupported claim rate: `0.0811`
- prohibited candidate rate: `0.027`
- retrieval precision@5: `0.6929`
- retrieval recall@5: `0.8125`
- retrieval nDCG@5: `0.7142`
- MRR: `0.8125`

Invalidity reasons:

- `rate_limited`
- `request_or_provider_error`
- provider fallback/timeout behavior was visible in server logs

Do not compare this end-to-end run as a valid generation release metric.

## Separated Eval Artifacts

- Retrieval-only CLI check: `evals/reports/generation_remediation_prechange/retrieval_only_cli_check/summary.json`
- Generation fixture file: `evals/fixtures/generation/prechange_approved_payloads.jsonl`
- Generation-only fixture replay: `evals/reports/generation_remediation_prechange/generation_only_fixture_replay/latest_summary.json`
- Strict provider check output: `evals/reports/generation_remediation_prechange/generation_only_require_provider_stdout.txt`

The strict generation-only provider check correctly fails the contaminated fixture set with:

- `blocked_cases`
- `rate_limited`
- `request_or_provider_error`

## Baseline Failure Themes

High-priority generation failures:

- unsupported entities in final prose
- wrong or underspecified answer type
- insufficient-data wording not direct enough
- missing required caveats such as sample size, method, or unavailable workload/guarantee data
- free-form formatting not reliably matching expected tables or paragraphs

Provider stability must be fixed as an evaluation property before generation metrics can be used for release decisions.
