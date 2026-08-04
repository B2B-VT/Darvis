# Cyrus Evals

This directory contains the JSONL-based Cyrus evaluation harness. It is separate from the older workbook QA harness so it can grade stage traces, retrieval candidates, answer type, formatting, and grounding.

## Run

Start the backend first:

```bash
cd chatbot
uvicorn app.main:app --reload
```

Run the full endpoint-backed suite:

```bash
python evals/run.py --end-to-end --all --endpoint http://127.0.0.1:8000/chat
```

Run one dataset or one case:

```bash
python evals/run.py --dataset course_recommendations.jsonl
python evals/run.py --id course_rec_ai_001
```

Run retrieval-only evaluation without generation:

```bash
python evals/run.py --retrieval-only --out-dir evals/reports/retrieval_only
```

Run structured generation from saved approved-evidence fixtures without rerunning retrieval:

```bash
python evals/run.py --generation-only \
  --fixtures evals/fixtures/generation/prechange_approved_payloads.jsonl \
  --out-dir evals/reports/generation_only
```

Fail invalid provider-contaminated generation or end-to-end runs:

```bash
python evals/run.py --end-to-end --all --require-provider-success
python evals/run.py --generation-only --require-provider-success
```

When `--generation-only` is used, the evaluator calls the structured generation adapter with fixture evidence only; it does not call retrieval or the `/chat` endpoint. Baseline responses stored inside fixtures are historical comparison data, not the generated answer under test.

When `--require-provider-success` is enabled, the run fails if cases hit rate limits, timeouts, request/model errors, fallback usage, unrepaired malformed output, or provider/model changes. Summaries include a `provider` block with `run_valid` and `invalid_reasons`.

Results are written to `evals/reports/latest_results.json`, `evals/reports/latest_summary.json`, per-case traces under `evals/reports/traces/`, and `evals/reports/CYRUS_BASELINE_REPORT.md`.

## Case Schema

Each JSONL case supports:

- `id`
- `query`
- `user_profile`
- optional `history`
- `expected_intent`
- `expected_entities`
- `must_retrieve`
- `acceptable_retrieve`
- `must_not_retrieve`
- `relevance`
- `must_include_in_answer`
- `must_not_include_in_answer`
- `expected_answer_type`
- `expected_format`
- `required_table_columns`
- `forbidden_behavior`
- `notes`

Relevance labels use `3` for directly relevant, `2` for strongly related, `1` for defensible but secondary, `0` for irrelevant, and `-1` for prohibited.

## Feedback Conversion

Raw thumbs-up/down feedback must not become training data automatically. Convert reviewed feedback into this reviewable format first:

```json
{
  "query": "...",
  "user_profile": {},
  "bad_answer": "...",
  "failure_labels": ["wrong_retrieval", "bad_ranking", "unsupported_claim", "wrong_format", "missed_constraint"],
  "reviewer_reason": "...",
  "corrected_answer": "...",
  "expected_courses": [],
  "excluded_courses": [],
  "approved_for_eval": false,
  "approved_for_training": false
}
```

Only cases with `approved_for_eval: true` should be converted into JSONL regression cases. Keep `approved_for_training: false` unless a human reviewer has separately approved training use.
