# Cyrus Reranker NaN Diagnostic

Date: 2026-08-04

## Phase 1 Freeze

Current commit:

- `9f2976d8fdf1d3e8c2422688d5d30ed176fe96e7`

Current working tree is dirty from prior Cyrus remediation work. Diff hash excluding generated eval reports and outputs:

- `241714f895a50c1f1586f551d4991b9dcabde3b1083a364350d982e1dc33c736`

Environment:

| Field | Value |
| --- | --- |
| Python | `3.13.1` |
| OS | `macOS-15.6.1-arm64-arm-64bit-Mach-O` |
| Kernel | `Darwin 24.6.0` |
| CPU arch | `arm64` |
| PyTorch | `2.13.0` |
| Transformers | `5.13.0` |
| Sentence Transformers | `5.6.0` |
| NumPy | `2.5.1` |
| tokenizers | `0.22.2` |
| safetensors | `0.8.0` |
| CUDA | `false` |
| MPS | `false` |

Saved environment artifact:

- `evals/reports/reranker_remediation_prechange/environment.json`

## Smoke Reproduction

Model:

- `cross-encoder/ms-marco-MiniLM-L-6-v2`

Smoke-test output:

```json
{
  "model": "cross-encoder/ms-marco-MiniLM-L-6-v2",
  "load_ms": 1099.1,
  "infer_ms": 154.3,
  "scores": [NaN, NaN, NaN],
  "finite": false,
  "order": [0, 1, 2],
  "rss_mb": 481440.0
}
```

Saved artifact:

- `evals/reports/reranker_remediation_prechange/smoke_current_model.jsonl`

Conclusion: the local model still loads on CPU but returns non-finite scores.

## Prechange Tests

Command:

```bash
chatbot/.venv/bin/python -m pytest chatbot/tests/test_reranker.py
```

Result:

- `11 passed, 1 warning`

Saved artifact:

- `evals/reports/reranker_remediation_prechange/test_reranker_prechange.txt`

## Prechange Retrieval-Only Evaluation

Command:

```bash
chatbot/.venv/bin/python evals/run_reranker_ab.py --dataset evals/datasets --top-k 5 --candidate-k 18 --out-dir evals/reports/reranker_remediation_prechange
```

Result:

| Metric | Control | Experiment |
| --- | ---: | ---: |
| Precision@5 | `0.2308` | `0.2308` |
| Recall@5 | `0.6574` | `0.6574` |
| nDCG@5 | `0.6477` | `0.6477` |
| MRR | `0.7438` | `0.7438` |
| Prohibited candidate rate | `0.1111` | `0.1111` |
| Exact entity match | `0.4667` | `0.4667` |
| Fallback rate | n/a | `0.963` |
| Introduced candidates | n/a | `0` |

Saved artifacts:

- `evals/reports/reranker_remediation_prechange/summary.json`
- `evals/reports/reranker_remediation_prechange/control_results.json`
- `evals/reports/reranker_remediation_prechange/cross_encoder_results.json`
- `evals/reports/reranker_remediation_prechange/ab_results.json`
- `evals/reports/reranker_remediation_prechange/reranker_ab_prechange_stdout.txt`

## Current Finding

The current A/B comparison is not a valid quality comparison because every non-empty local cross-encoder case fell back to RRF passthrough after non-finite scores. The next step is a standalone numerical diagnostic that does not import Cyrus application code.

## Phase 2/3 Numerical Diagnosis

Standalone diagnostic script:

- `tools/diagnose_cross_encoder.py`

Current failing model:

- `cross-encoder/ms-marco-MiniLM-L-6-v2`

Findings:

- tokenization is finite
- all model parameters are finite
- embedding outputs are finite
- NaNs first appear in the first encoder layer
- raw logits are NaN
- Sentence Transformers postprocessed scores are NaN
- batch size 1, 2, and 3 all fail
- single-pair inference fails
- `torch.no_grad()` and `model.eval()` still fail
- a clean Hugging Face cache still fails
- a clean temporary venv still fails

Working comparison model:

- `cross-encoder/ms-marco-TinyBERT-L2-v2`

TinyBERT findings:

- parameters finite
- tokenization finite
- embedding outputs finite
- first encoder layer finite
- raw logits finite
- Sentence Transformers scores finite
- candidate A ranked first on the required smoke test

Root-cause classification:

- not cache corruption
- not malformed tokenization
- not Sentence Transformers score conversion
- not all local cross-encoders in this environment
- likely MiniLM-specific incompatibility with the current macOS arm64 CPU / PyTorch / Transformers execution path

Smallest safe fix:

- keep `RAG_ENABLE_LOCAL_RERANKER=false`
- replace the configurable default local reranker model with `cross-encoder/ms-marco-TinyBERT-L2-v2`
- keep non-finite score validation and RRF fallback

Compatibility details:

- `docs/CYRUS_RERANKER_COMPATIBILITY_MATRIX.md`
