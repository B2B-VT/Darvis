# Cyrus Local Reranker Audit

Date: 2026-08-04

## Current Behavior

Retrieval follows:

`query rewrite -> hybrid retrieval -> optional reranker -> formatted context`

Initial candidate retrieval happens in `chatbot/app/rag/pipeline.py`:

- `top_k_retrieve = max(n_results * 3, 15)`
- common `n_results=5` or `6` calls retrieve `15` or `18` candidates.

Initial ordering is hybrid vector plus keyword retrieval in `chatbot/app/rag/retriever.py`.
`HybridRetriever._rrf_fuse()` uses Reciprocal Rank Fusion:

```text
alpha * (1 / (60 + vector_rank + 1))
+ (1 - alpha) * (1 / (60 + keyword_rank + 1))
```

Default `alpha` is `0.7`.

`chatbot/app/rag/reranker.py` has three provider paths:

- Cohere rerank, if `COHERE_API_KEY` is configured.
- Local cross-encoder, if `RAG_ENABLE_LOCAL_RERANKER=true`.
- RRF passthrough, default.

## Phase 1 Answers

1. Does the configured model identifier load successfully?  
   Yes, `cross-encoder/ms-marco-MiniLM-L-6-v2` resolves and loads locally after Hugging Face download.

2. Is the correct dependency installed?  
   Yes. `sentence_transformers 5.6.0` is installed in `chatbot/.venv`.

3. Does the model run on CPU?  
   The model loads on CPU, but the initial smoke-test inference returned non-finite scores in this environment.

4. Is GPU support optional?  
   Yes. CUDA was unavailable locally (`torch.cuda.is_available() == False`), and CPU is the configured default.

5. Is model loading lazy or performed at application startup?  
   Pre-change: startup/eager when enabled. Post-change: lazy on first local rerank call and cached on the `Reranker` instance.

6. Is the model cached after first load?  
   Pre-change: yes after startup load. Post-change: yes after first use.

7. What happens if model loading fails?  
   Pre-change: provider silently remained or fell back to passthrough during initialization. Post-change: failure is recorded in `ranking.fallback_reason` and RRF order is returned.

8. What happens if inference fails?  
   Pre-change: exception is logged and passthrough is used, but no structured reason is exposed. Post-change: fallback reason is recorded and RRF order is preserved.

9. Does fallback preserve the original RRF ordering?  
   Post-change: yes. Passthrough sorts by `combined_score` with original index as stable tie-breaker.

10. Does the reranker receive raw candidate text, normalized candidate text, or only titles?  
   Pre-change: raw `candidate.content`. Post-change: canonical text built from trusted metadata plus content.

11. Does the reranker receive user profile context?  
   Production `vector_store.query()` call sites do not pass profile context. The retrieval-only A/B runner does include major/minor/interests in the normalized reranker query.

12. Does it preserve candidate IDs and metadata?  
   Post-change: yes. It returns copied `RetrievalResult` objects with original IDs and metadata.

13. Does it handle empty candidate lists?  
   Yes, returns `[]` and records empty trace.

14. Does it handle fewer candidates than requested top-k?  
   Yes, `top_k` is capped to input length.

15. Does it return deterministic ordering for equal scores?  
   Post-change: yes, original RRF order is used as the tie-breaker.

16. Does it expose reranker scores in the trace?  
   Post-change: yes, via `ranking.cross_encoder_scores`, `output_order`, `selected_ids`, and `latency_ms`.

17. Can the current implementation distinguish passthrough, local cross-encoder, Cohere, and failed local fallback?  
   Post-change: yes, via `ranking.method`, `ranking.enabled`, `ranking.model`, `ranking.fallback_used`, and `ranking.fallback_reason`.

## Smoke Test

Command:

```bash
chatbot/.venv/bin/python -c "import time, math, resource; from sentence_transformers import CrossEncoder; model='cross-encoder/ms-marco-MiniLM-L-6-v2'; q='I\\'m a CS student interested in artificial intelligence and machine learning.'; docs=['CS 4824 Machine Learning. Covers supervised learning, classification, regression, model evaluation, and predictive methods.','BIT 3414 Operations and Supply Chain Management. Covers business processes and operational planning.','BCHM 4115 Biochemical Methods. Covers laboratory methods in biochemical analysis.']; t0=time.perf_counter(); ce=CrossEncoder(model, max_length=512, device='cpu'); load=(time.perf_counter()-t0)*1000; t1=time.perf_counter(); scores=[float(x) for x in ce.predict([(q,d) for d in docs])]; infer=(time.perf_counter()-t1)*1000; print({'model':model,'load_ms':round(load,1),'infer_ms':round(infer,1),'scores':scores,'finite':all(math.isfinite(s) for s in scores),'order':sorted(range(len(scores)), key=lambda i:(-scores[i], i)),'rss_mb':round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,1)})"
```

Result:

```json
{
  "model": "cross-encoder/ms-marco-MiniLM-L-6-v2",
  "load_ms": 6911.3,
  "infer_ms": 40.6,
  "scores": [NaN, NaN, NaN],
  "finite": false,
  "order": [0, 1, 2],
  "rss_mb": 582272.0
}
```

The memory value is `ru_maxrss` as reported by macOS units and should be treated as approximate. The important correctness result is that inference produced `NaN`; the local reranker must therefore validate finite scores and fall back.

## Implementation Plan Outcome

Implemented hardening keeps default behavior unchanged:

- `RAG_ENABLE_LOCAL_RERANKER=false` remains the default.
- Local model loading is lazy.
- CPU device is configurable and defaulted.
- Non-finite scores trigger passthrough fallback.
- Candidate IDs and metadata are preserved.
- No new candidates are introduced.
- Canonical ranking trace is populated for control and experiment paths.

## Risk And Rollback

The local model should not be enabled by default unless the retrieval-only A/B run passes safety, quality, and latency gates. Rollback is to leave `RAG_ENABLE_LOCAL_RERANKER=false` or revert the scoped reranker/config/trace/eval files.
