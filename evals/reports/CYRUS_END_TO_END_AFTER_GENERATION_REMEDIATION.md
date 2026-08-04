# Cyrus End-To-End After Generation Remediation

## Status

Not run as a valid release comparison.

The required prerequisite has not been met: two valid generation-only runs with provider success have not passed. The current endpoint-backed baseline is provider-contaminated by rate limits and request failures.

## Current Reference Run

Reference only:

- `evals/reports/generation_remediation_prechange/end_to_end/latest_summary.json`

Summary:

- pass: `4`
- partial: `17`
- fail: `16`
- blocked: `3`
- schema compliance: `1.0`
- unsupported claim rate: `0.0811`
- prohibited candidate rate: `0.027`

Invalidity reasons:

- API 429 request failures
- Groq 429 provider failures in server logs
- planner timeout and deterministic fallback behavior mixed into the run

## Decision

Do not compare this run against generation-remediation targets. End-to-end release validation should resume only after:

1. generation-only fixtures are exercised through the structured generation path
2. `--require-provider-success` passes
3. two generation-only runs show acceptable variance
4. retrieval-only metrics remain stable
