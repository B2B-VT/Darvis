# Cyrus Generation Remediation Plan

## Current Freeze

- Freeze directory: `evals/reports/generation_remediation_prechange/`
- Current commit is recorded in `current_commit.txt`.
- Current working tree status and diff are recorded in `git_status.txt`, `working_tree_diff.patch`, and `working_tree_diff.sha256`.
- Environment versions are recorded in `environment.json`.
- Provider and feature flags are recorded in `provider_and_flags.json`.

Current generation provider is Groq with `openai/gpt-oss-120b`. Local reranking remains disabled by default with `RAG_ENABLE_LOCAL_RERANKER=false`; TinyBERT remains the configurable local reranker model.

## Non-Negotiable Gates

No production generation behavior changes are allowed until:

1. Current full chatbot tests have been recorded.
2. Retrieval-only eval has been recorded.
3. Existing mixed end-to-end generation baseline has been recorded.
4. Eval modes are separated into retrieval-only, generation-only, and end-to-end.
5. Generation fixtures exist for cases where generation behavior matters.

Invalid generation runs must not be compared against prior metrics.

## Evaluation Separation

### Retrieval-Only

Purpose: measure deterministic upstream quality without Groq.

Scope:
- intent and entity resolution
- typed retrieval
- hard exclusions
- RRF ranking
- evidence coverage
- sufficiency inputs

Required behavior:
- no generation model call
- deterministic
- canonical trace evidence
- precision, recall, nDCG, MRR, exact entity, exclusions, and sufficiency-input metrics

Implementation target:
- extend `evals/run.py` with `--retrieval-only`
- reuse the existing retrieval-only mechanics from `evals/run_reranker_ab.py` where practical
- preserve pre-reranker exclusions and candidate-preservation checks

### Generation-Only

Purpose: measure response behavior using fixed approved evidence.

Scope:
- answer type
- grounding
- unsupported claims
- sufficiency wording
- schema compliance
- response formatting

Required behavior:
- consume saved approved structured payloads
- never rerun retrieval
- use one provider and one model for every case
- record provider metadata for every call
- fail the run when `--require-provider-success` is enabled and provider behavior changes, falls back, rate limits, times out, or returns unrecoverable malformed output

Implementation target:
- add fixed generation fixtures under `evals/fixtures/generation/`
- add `--generation-only` and `--require-provider-success`
- write run validity summary with `run_valid` and `invalid_reasons`

### End-To-End

Purpose: final integration validation after retrieval-only and generation-only suites pass.

Required behavior:
- records every provider call and fallback
- does not silently mix LLM and deterministic fallback behavior
- supports `--require-provider-success`

Implementation target:
- add `--end-to-end`
- preserve current end-to-end behavior as the default path only during transition

## Provider Stability Instrumentation

Every generation call must record:

```json
{
  "provider": "",
  "model": "",
  "attempt_count": 0,
  "fallback_used": false,
  "fallback_reason": null,
  "rate_limited": false,
  "timeout": false,
  "latency_ms": 0,
  "input_tokens": null,
  "output_tokens": null
}
```

Run summaries must include:

```json
{
  "run_valid": true,
  "invalid_reasons": []
}
```

Provider errors must not be converted into normal responses when a valid generation eval is required.

## Deterministic Answer-Type Routing

Before generation, Cyrus must select one answer type from:

- `course_recommendation`
- `course_comparison`
- `professor_recommendation`
- `professor_profile`
- `current_schedule`
- `schedule_recommendation`
- `major_requirements`
- `clarification_required`
- `insufficient_data`
- `refusal`

The selected answer type becomes part of the approved generation payload. The LLM may not change it.

Targeted cases:
- `prof_ambiguous_systems_001`
- `prof_ambiguous_lastname_001`
- `unsupported_workload_001`
- `unsupported_guarantee_a_001`
- `unsupported_pathways_001`
- `unsupported_non_vt_001`
- `course_rec_low_data_001`
- `prof_schedule_current_001`

## Sufficiency Engine

Sufficiency must run before generation and return structured output:

```json
{
  "passed": false,
  "status": "insufficient_data",
  "reasons": [
    {
      "code": "PREREQUISITE_DATA_UNAVAILABLE",
      "message": "Prerequisite data is not available for this course."
    }
  ],
  "missing_fields": ["prerequisites"],
  "allowed_answer_types": ["insufficient_data"]
}
```

Clarification is required for ambiguous surnames, unresolved course topics, missing follow-up context, undefined criteria, and plausible multi-department ambiguity.

Insufficient data is required for unavailable prerequisites, workload, grading curves, guaranteed outcomes, unavailable pathways, unverified current teaching, low sample size, incomplete comparisons, or no surviving candidates.

The LLM must not override sufficiency.

## Unsupported-Claim Validation

Post-generation validation must extract and validate:

- course codes
- professor names
- term references
- prerequisite claims
- grade statistics and GPA values
- enrollment counts
- section counts
- ratings and difficulty scores
- workload claims
- availability claims
- pathways claims
- guarantees
- ranking claims

Every factual claim must map to approved evidence. Plausibility is not support.

Validation error codes:

- `unsupported_course`
- `unsupported_professor`
- `unsupported_term`
- `unsupported_numeric_claim`
- `unsupported_prerequisite`
- `unsupported_workload`
- `unsupported_availability`
- `unsupported_pathway`
- `unsupported_guarantee`
- `unsupported_ranking_claim`

## Repair Policy

If generation output fails validation:

1. Retry once with the original approved payload, validation errors, the same answer type, and explicit repair instructions.
2. Revalidate.
3. If repair fails, return a deterministic safe structured response.

Invalid free text must never be returned.

## Structured Response Schemas

Create strict schemas per answer type. Schemas must reject unrelated fields and require evidence IDs where factual recommendations are made.

Initial schema targets:
- course recommendation
- course comparison
- professor recommendation
- professor profile
- clarification required
- insufficient data
- refusal

## Deterministic Rendering

Move layout decisions out of the LLM. The backend or frontend renderer should control course cards, comparison tables, professor tables, limitations, clarification prompts, and insufficient-data responses.

The LLM should produce structured content only.

## Prompt Hardening

Prompt changes are allowed only after routing, sufficiency, schemas, validators, and repair logic exist.

The prompt should instruct the LLM to use only approved evidence, keep the selected answer type, avoid unsupported calculations, avoid inferred prerequisites/workload/current availability, avoid outcome promises, and return schema-compliant structured output.

## Grader Hardening

Before changing grader behavior, add unit tests. Graders should:

- accept semantic equivalents where exact wording is not a product requirement
- use exact text checks only for exact wording requirements
- validate unsupported entities and numbers against structured evidence
- avoid penalizing correct insufficient-data answers for empty recommendations
- avoid rewarding query echoing
- let deterministic failures override subjective judges

## Targeted Tests

Add tests for unsupported claims, sufficiency, answer type, formatting, and repair. Initial focus:

- invented professor
- invented course
- unsupported semester
- unsupported prerequisite
- unsupported GPA
- unsupported enrollment count
- unsupported workload
- unsupported pathway
- guaranteed grade
- unsupported current teaching claim
- low sample size
- missing prerequisite data
- incomplete comparison evidence
- clarification with verified options only
- one successful repair
- one failed repair followed by safe deterministic response

## Validation Order

1. Unit tests for sufficiency
2. Unit tests for answer-type routing
3. Unit tests for unsupported-claim validator
4. Unit tests for response schemas
5. Unit tests for deterministic renderer
6. Full chatbot test suite
7. Retrieval-only eval
8. Generation-only eval with `--require-provider-success`
9. Generation-only eval a second time
10. End-to-end eval only when both generation runs are valid

## Success Criteria

Required:

- schema compliance = 1.0
- prohibited candidate rate = 0
- unsupported entity rate = 0
- unsupported numeric claim rate = 0
- no invented professor
- no invented course
- no unsupported prerequisite claims
- no unsupported current teaching claims
- provider fallback rate = 0 in valid generation evals
- generation eval marked invalid if provider fails
- TinyBERT remains disabled by default
- retrieval metrics do not materially regress

Targets:

- answer type accuracy >= 0.90
- sufficiency behavior >= 0.90
- grounding >= 0.98
- format compliance >= 0.95
- clarification accuracy >= 0.95
- insufficient-data behavior >= 0.95
- unsupported claim rate = 0
- pass rate materially improves from the previous 4/40

## Stop Conditions

Stop when generation release gates pass, provider instability prevents valid evaluation, remaining failures require product-policy decisions, remaining failures require missing database fields, three repair iterations fail to improve the same metric, or fine-tuning becomes the next logical step.

Fine-tuning is out of scope.
