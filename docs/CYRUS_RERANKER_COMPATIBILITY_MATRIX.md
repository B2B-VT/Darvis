# Cyrus Reranker Compatibility Matrix

Date: 2026-08-04

| Environment | Model | Torch | Transformers | Sentence Transformers | Scores finite | Correct ordering | Load time | Inference time |
|---|---|---:|---:|---:|---|---|---:|---:|
| Project venv, primary cache | `cross-encoder/ms-marco-MiniLM-L-6-v2` | `2.13.0` | `5.13.0` | `5.6.0` | No | No | `37.7 ms` ST reload / `126.6 ms` Transformers | `11.6 ms` batch-3 ST / `19.7 ms` Transformers |
| Project venv, clean HF cache | `cross-encoder/ms-marco-MiniLM-L-6-v2` | `2.13.0` | `5.13.0` | `5.6.0` | No | No | `1003.5 ms` ST reload / `3581.6 ms` Transformers | `9.4 ms` batch-3 ST / `10.8 ms` Transformers |
| Clean temp venv | `cross-encoder/ms-marco-MiniLM-L-6-v2` | `2.13.0` | `5.14.1` | `5.6.1` | No | No | `1208.0 ms` ST reload / `532.5 ms` Transformers | `10.2 ms` batch-3 ST / `15.6 ms` Transformers |
| Project venv | `cross-encoder/ms-marco-TinyBERT-L2-v2` | `2.13.0` | `5.13.0` | `5.6.0` | Yes | Yes, candidate A ranked first | `739.0 ms` ST reload / `1871.5 ms` Transformers | `2.0 ms` batch-3 ST / `2.8 ms` Transformers |

## Diagnosis

`cross-encoder/ms-marco-MiniLM-L-6-v2` fails numerically in both the project environment and a clean temporary environment. Cache corruption is unlikely: a clean Hugging Face cache reproduces the same NaN behavior. The model parameters and tokenized inputs are finite; embeddings are finite; NaNs first appear inside the first encoder layer and propagate to logits.

`cross-encoder/ms-marco-TinyBERT-L2-v2` works in the same project environment, returns finite logits, and ranks the machine-learning candidate first in the required smoke test.

## Selected Local Model

Use `cross-encoder/ms-marco-TinyBERT-L2-v2` as the replaceable default for the feature-flagged local reranker.

The production feature flag remains disabled:

```text
RAG_ENABLE_LOCAL_RERANKER=false
```

## Artifacts

- `evals/reports/reranker_remediation_prechange/diagnose_current_model_local_cache.json`
- `evals/reports/reranker_remediation_prechange/diagnose_current_model_clean_hf_cache.json`
- `evals/reports/reranker_remediation_prechange/diagnose_current_model_clean_venv.json`
- `evals/reports/reranker_remediation_prechange/diagnose_tinybert_l2.json`
