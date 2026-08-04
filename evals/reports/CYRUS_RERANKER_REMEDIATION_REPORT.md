# Cyrus Remediation Report

## 1. Executive Summary

The NaN root cause is not corrupted cache or tokenization. `cross-encoder/ms-marco-MiniLM-L-6-v2` has finite parameters and finite embeddings, but produces NaNs inside the first encoder layer on the current macOS arm64 CPU stack. The same failure occurs from a clean Hugging Face cache and a clean temporary virtual environment.

The working local reranker selected for the feature-flagged path is:

- `cross-encoder/ms-marco-TinyBERT-L2-v2`

The default remains disabled:

- `RAG_ENABLE_LOCAL_RERANKER=false`

TinyBERT produced finite scores, ranked the smoke-test ML candidate first, and completed a valid retrieval-only A/B with zero fallback and zero introduced candidates. It improved nDCG@5 and MRR, but precision@5 improved by only `0.008`, below the required `0.03` release gate. Recommendation: keep local reranking optional and do not enable it by default.

Downstream generation remediation was not started because the reranker quality gate did not fully pass. Stop condition: quality improvement below release gates.

## 2. Environment and Compatibility

Frozen environment:

- Commit: `9f2976d8fdf1d3e8c2422688d5d30ed176fe96e7`
- Working-tree diff hash: `241714f895a50c1f1586f551d4991b9dcabde3b1083a364350d982e1dc33c736`
- Python: `3.13.1`
- OS: `macOS-15.6.1-arm64`
- PyTorch: `2.13.0`
- Transformers: `5.13.0`
- Sentence Transformers: `5.6.0`
- NumPy: `2.5.1`
- tokenizers: `0.22.2`
- safetensors: `0.8.0`
- CUDA: `false`
- MPS: `false`

Compatibility matrix:

- `docs/CYRUS_RERANKER_COMPATIBILITY_MATRIX.md`

## 3. Reranker Diagnosis

Standalone diagnostic:

- `tools/diagnose_cross_encoder.py`

MiniLM diagnostic summary:

- token tensors finite
- parameters finite
- first parameter finite
- embeddings finite
- first encoder layer contains NaNs
- raw logits are NaN
- postprocessed scores are NaN
- batch size 1, 2, 3 all fail
- single-pair inference fails
- clean cache and clean venv still fail

TinyBERT diagnostic summary:

- finite parameters
- finite first encoder layer
- finite logits
- finite Sentence Transformers scores
- correct smoke-test ordering: candidate A first

## 4. Reranker Fix

Exact fix:

- Changed the configurable default local reranker model from `cross-encoder/ms-marco-MiniLM-L-6-v2` to `cross-encoder/ms-marco-TinyBERT-L2-v2`.
- Kept local reranking disabled by default.
- Preserved non-finite score validation and RRF fallback.
- Added compatibility diagnostics and matrix documentation.
- Added pre-reranker prohibited-candidate exclusions in the retrieval-only A/B runner.
- Added three-repetition A/B support for warm latency measurement.

Rollback:

- Set `RAG_LOCAL_RERANKER_MODEL=cross-encoder/ms-marco-MiniLM-L-6-v2` if future dependencies fix MiniLM.
- Or leave `RAG_ENABLE_LOCAL_RERANKER=false` to retain RRF passthrough.

## 5. Valid A/B Results

Run:

- `evals/reports/reranker_remediation_tinybert_ab/`

| Metric | Control | TinyBERT | Delta |
| --- | ---: | ---: | ---: |
| Precision@5 | `0.2080` | `0.2160` | `+0.0080` |
| Recall@5 | `0.5957` | `0.5988` | `+0.0031` |
| nDCG@5 | `0.6164` | `0.6704` | `+0.0540` |
| MRR | `0.7438` | `0.8457` | `+0.1019` |
| Exact entity match | `0.4667` | `0.4667` | `0.0000` |
| Prohibited candidate rate | `0.0` | `0.0` | `0.0000` |
| Duplicate candidate rate | `0.0` | `0.0` | `0.0000` |

Release-gate result:

- nDCG gate passed: `+0.0540 >= +0.05`
- MRR gate passed: `+0.1019 >= +0.03`
- precision gate failed: `+0.0080 < +0.03`
- recall did not decline
- exact entities did not decline
- prohibited candidates remained zero after pre-reranker filtering

## 6. Safety Results

- Introduced candidates: `0`
- Fallback rate: `0.0`
- Error rate: `0.0`
- Pre-reranker exclusions: `36`
- Prohibited candidate rate after exclusions: `0.0`
- Exact entity delta: `0.0`

The reranker did not add candidates and did not restore excluded candidates.

## 7. Latency and Resource Results

TinyBERT A/B performance:

- average latency across repetitions: `85.1481 ms`
- p50 latency: `13.3 ms`
- p95 latency: `30.6 ms`
- cold max latency: `5775.7 ms`
- warm average latency: `13.6611 ms`
- warm p50 latency: `12.3 ms`
- warm p95 latency: `30.6 ms`
- changed-order rate: `0.9259`

Performance gate:

- warm p95 passed: `30.6 ms <= 400 ms`

## 8. Trace and Parser Improvements

This turn focused on reranker numerical remediation. Existing reranker trace improvements are preserved:

- `ranking.method`
- `ranking.model`
- `ranking.enabled`
- `ranking.input_ids`
- `ranking.input_rrf_order`
- `ranking.cross_encoder_scores`
- `ranking.output_order`
- `ranking.selected_ids`
- `ranking.fallback_used`
- `ranking.fallback_reason`
- `ranking.latency_ms`

Parser hardening beyond previous work was not started because the reranker release gate did not fully pass.

## 9. Generation Eval Stabilization

Not started. The workflow explicitly gates downstream generation stabilization on a valid reranker experiment that passes release gates. TinyBERT produced a valid experiment but did not pass the precision gate.

## 10. Downstream Accuracy Results

Not run in this phase. No generation prompt, renderer, or downstream answer behavior changes were made.

## 11. Regressions

No unit-test regressions observed.

Known A/B regressions by nDCG:

- `major_req_cs_ai_001`
- `interest_business_analytics_001`
- `course_rec_ai_prereq_001`

These are why the recommendation is not to enable by default despite aggregate nDCG/MRR gains.

## 12. Files Changed

New/updated in this remediation step:

- `docs/CYRUS_RERANKER_NAN_DIAGNOSTIC.md`
- `docs/CYRUS_RERANKER_COMPATIBILITY_MATRIX.md`
- `tools/diagnose_cross_encoder.py`
- `chatbot/app/config.py`
- `chatbot/app/rag/reranker.py`
- `evals/run_reranker_ab.py`
- `evals/reports/CYRUS_RERANKER_REMEDIATION_REPORT.md`

Prior dirty worktree files from earlier Cyrus iterations remain present and were not reverted.

## 13. Commands Run

- `git rev-parse HEAD`
- `git diff --stat`
- `git diff --binary -- . ':(exclude)evals/reports' ':(exclude)outputs' | shasum -a 256`
- `chatbot/.venv/bin/python --version`
- `uname -a`
- `chatbot/.venv/bin/python -c "import torch, transformers, sentence_transformers, numpy, tokenizers, safetensors; ..."`
- `chatbot/.venv/bin/python -m pytest chatbot/tests/test_reranker.py`
- `chatbot/.venv/bin/python evals/run_reranker_ab.py --dataset evals/datasets --top-k 5 --candidate-k 18 --out-dir evals/reports/reranker_remediation_prechange`
- `chatbot/.venv/bin/python tools/diagnose_cross_encoder.py --model cross-encoder/ms-marco-MiniLM-L-6-v2 --device cpu --local-files-only --out evals/reports/reranker_remediation_prechange/diagnose_current_model_local_cache.json`
- `chatbot/.venv/bin/python tools/diagnose_cross_encoder.py --model cross-encoder/ms-marco-TinyBERT-L2-v2 --device cpu --out evals/reports/reranker_remediation_prechange/diagnose_tinybert_l2.json`
- `HF_HOME=/private/tmp/cyrus_hf_clean chatbot/.venv/bin/python tools/diagnose_cross_encoder.py --model cross-encoder/ms-marco-MiniLM-L-6-v2 --device cpu --out evals/reports/reranker_remediation_prechange/diagnose_current_model_clean_hf_cache.json`
- `python3 -m venv /private/tmp/cyrus_ce_clean_venv ... tools/diagnose_cross_encoder.py --model cross-encoder/ms-marco-MiniLM-L-6-v2 ...`
- `chatbot/.venv/bin/python evals/run_reranker_ab.py --dataset evals/datasets --top-k 5 --candidate-k 18 --repetitions 3 --out-dir evals/reports/reranker_remediation_tinybert_ab`
- `chatbot/.venv/bin/python -m pytest chatbot/tests/`

## 14. Remaining Risks

- TinyBERT is generic MS MARCO, not Cyrus/domain-specific.
- Precision improvement is below gate.
- Three ranking cases regressed.
- Raw retrieval still has cases where relevant items are absent or weak before reranking.
- The full generation suite remains sensitive to Groq quota and was intentionally not run as the primary validation here.

## 15. Recommendation

Recommendation: **keep local reranking optional and retain RRF passthrough as default**.

Do not enable local reranking globally. TinyBERT is viable as a limited experimental flag for more data, but it does not meet the full release gates. The next useful options are:

- gather more ranking data behind an explicit feature flag, or
- test a hosted reranker such as Cohere as a benchmark, or
- later train a domain-specific reranker after more labeled evidence is available.
