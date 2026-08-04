# Cyrus Structured Generation Implementation Plan

## Current Generation Flow

Production `/chat` flow:

1. `chatbot/app/main.py` normalizes the question and runs `_run_chat_pipeline`.
2. Safety, prompt-injection, deterministic professor/course policy, entity resolution, and sufficiency gates run before handler dispatch.
3. Route handlers build route-specific prompts:
   - `chatbot/app/features/general_chat.py`
   - `chatbot/app/features/natural_filter.py`
   - `chatbot/app/features/course_profile.py`
   - `chatbot/app/features/professor_profile.py`
   - `chatbot/app/features/major_requirements.py`
4. Prompt helpers live in `chatbot/app/rag/prompts.py`.
5. The configured model client is `chatbot/app/rag/gemma_client.py::GemmaAnswerClient`, backed by Groq and `GROQ_MODEL`.
6. Handler output is currently free-form `answer` text plus deterministic `tables`, `charts`, and `metadata`.
7. Fallback behavior is template-based when `llm.answer()` or `llm.answer_raw()` returns `None`.
8. `ChatResponse` in `chatbot/app/models.py` is the current response schema; it is not a strict per-answer-type generation schema.
9. Provider metadata is collected in `GemmaAnswerClient` and exposed as `metadata.generation`.

## Fixture Entry Point

Saved fixtures under `evals/fixtures/generation/` contain:

- query
- user profile
- expected answer type
- resolved entities
- approved evidence
- evidence IDs
- sufficiency trace
- required fields
- forbidden claims

The structured generation adapter will consume this fixture shape directly. It must not import or call retrieval, vector search, `GradeVectorStore`, `HybridRetriever`, or endpoint `/chat`.

## Files To Modify

- `evals/run.py`
  - Change `--generation-only` from baseline replay to structured generation through the adapter.
  - Keep baseline replay only as historical data inside fixtures.
  - Preserve `--require-provider-success`.

- `evals/README.md`
  - Document structured generation-only behavior.

## New Modules

- `chatbot/app/generation/__init__.py`
- `chatbot/app/generation/schemas.py`
  - Strict Pydantic schemas per answer type.
- `chatbot/app/generation/validator.py`
  - Unsupported-claim and answer-type validation.
- `chatbot/app/generation/structured_generator.py`
  - Fixture-to-prompt adapter, JSON parsing, schema validation, repair retry, and safe fallback.

## Schemas To Create

Strict schemas with extra fields forbidden:

- `course_recommendation`
- `course_comparison`
- `professor_recommendation`
- `professor_profile`
- `clarification_required`
- `insufficient_data`
- `refusal`
- `current_schedule`

Every factual recommendation item must include `evidence_ids`.

## Tests To Add

New file:

- `chatbot/tests/test_structured_generation.py`

Coverage:

- valid course recommendation schema
- invalid extra fields
- wrong answer type
- missing evidence IDs
- malformed JSON fallback
- clarification cannot return recommendation
- insufficient data cannot return recommendation
- refusal cannot return normal answer
- invented course validation
- invented professor validation
- unsupported term/prerequisite/GPA/enrollment/workload/pathway/guarantee/current-teaching validation
- successful repair
- failed repair safe deterministic fallback
- maximum one retry

Provider-stability tests will target `evals/run.py` summary behavior and existing provider metadata parsing.

## Expected Behavior

Generation-only mode:

1. Reads approved-evidence fixtures.
2. Builds a deterministic adapter input from the fixture.
3. Selects/preserves fixture answer type.
4. Enforces fixture sufficiency status.
5. Builds a JSON-only structured prompt from approved evidence.
6. Calls the configured Groq model once.
7. Parses strict JSON.
8. Validates answer type, schema, evidence IDs, and unsupported claims.
9. Retries once on schema/grounding failure.
10. Returns deterministic safe structured output if repair fails.
11. Grades the new generated response.
12. Marks the run invalid under `--require-provider-success` if provider/model/fallback/rate-limit/timeout/repair failure rules require it.

Retrieval-only and production endpoint behavior should not change.

## Risks

- Groq rate limits may still prevent two valid strict runs.
- Generic JSON prompting may produce malformed output; repair is limited to one retry.
- The current fixtures have sparse approved evidence for blocked cases, so safe fallback may be expected for those cases.
- The existing deterministic grader still grades legacy `ChatResponse` fields, so structured output must be rendered into a compatible `answer` and `tables` surface for grading.

## Rollback Path

- Revert `evals/run.py` generation-only integration to fixture replay.
- Remove `chatbot/app/generation/*`.
- Keep provider metadata instrumentation if desired; it is non-behavioral for production answers.
- `RAG_ENABLE_LOCAL_RERANKER=false` remains unchanged throughout.
