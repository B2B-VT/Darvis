# Cyrus Generation Iteration 1

## Executive Summary

Iteration 1 focused on evaluation stabilization, not answer-generation behavior changes.

Completed:

- froze current repo, environment, provider, model, and feature flags
- recorded full tests, retrieval-only eval, and current mixed end-to-end baseline
- created `docs/CYRUS_GENERATION_REMEDIATION_PLAN.md`
- split `evals/run.py` into retrieval-only, generation-only, and end-to-end modes
- added `--require-provider-success`
- generated fixed generation fixtures from approved trace evidence
- added provider-stability metadata instrumentation

Not completed in this iteration:

- answer-type router hardening
- deterministic sufficiency engine expansion
- unsupported-claim validator
- repair policy
- strict per-answer schemas
- deterministic renderer
- prompt hardening

Reason: the current generation baseline remains provider-contaminated. Release comparisons must wait until provider behavior is stable or the generation-only suite can exercise a fixed provider successfully.

## Eval Separation

`evals/run.py` now supports:

```bash
python evals/run.py --retrieval-only
python evals/run.py --generation-only
python evals/run.py --end-to-end
python evals/run.py --generation-only --require-provider-success
python evals/run.py --end-to-end --require-provider-success
```

Retrieval-only delegates to the existing deterministic Redis/RRF retrieval evaluator and does not call Groq.

Generation-only consumes saved fixtures from `evals/fixtures/generation/` and grades the fixed responses without rerunning retrieval.

End-to-end preserves the endpoint-backed integration eval and now records provider validity in the summary.

## Generation Fixtures

Fixture file:

- `evals/fixtures/generation/prechange_approved_payloads.jsonl`

Each fixture includes:

- case id
- query
- user profile
- original eval case
- parsed intent when available
- resolved entities
- approved candidates only
- evidence IDs
- structured payload from the eval trace
- sufficiency trace
- expected answer type
- required fields
- forbidden claims
- baseline response or recorded error

Rejected candidates are not included as approved evidence.

## Provider Stability

Generation responses now include aggregate provider metadata under `metadata.generation`:

```json
{
  "provider": "groq",
  "model": "openai/gpt-oss-120b",
  "attempt_count": 0,
  "fallback_used": false,
  "fallback_reason": null,
  "rate_limited": false,
  "timeout": false,
  "latency_ms": 0,
  "input_tokens": null,
  "output_tokens": null,
  "calls": []
}
```

The eval summary includes:

```json
{
  "provider": {
    "run_valid": false,
    "invalid_reasons": []
  }
}
```

Strict provider checking was validated against the contaminated generation fixtures and correctly failed with:

- `blocked_cases`
- `rate_limited`
- `request_or_provider_error`

## Results

Full tests:

- `172 passed`
- `2 warnings`

Retrieval-only CLI check:

- completed successfully against Redis
- output: `evals/reports/generation_remediation_prechange/retrieval_only_cli_check/summary.json`

Generation-only fixture replay:

- pass: `4`
- partial: `17`
- fail: `16`
- blocked: `3`
- schema compliance: `1.0`
- unsupported claim rate: `0.0811`
- provider run valid: `false`

## Release Gate Status

Generation release gates did not run to a valid pass/fail conclusion.

Blocked by provider instability:

- endpoint rate limits contaminated the current end-to-end baseline
- Groq rate limits and planner timeouts occurred during the baseline
- strict provider success mode correctly rejects the contaminated run

## Recommendation

Continue remediation with provider-stable generation-only evaluation before modifying downstream answer behavior. The next engineering step is to add a true structured generation adapter that consumes `approved_evidence` fixtures and emits strict answer schemas, then run `--generation-only --require-provider-success` twice before touching end-to-end gates.
