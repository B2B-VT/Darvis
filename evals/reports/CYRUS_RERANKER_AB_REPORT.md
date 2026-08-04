# Cyrus Local Reranker A/B Report

## 1. Executive Summary

- Model identifier loaded successfully if no load fallback is reported; finite-score usability is reflected by fallback rate.
- Implementation worked without introducing candidates outside the initial pool.
- Ranking improved: `True`
- p95 latency: `35.3` ms
- Recommendation: B. Keep it optional and gather more data.

## 2. Current Architecture

Hybrid retrieval -> RRF -> optional reranker -> selected context

## 3. Implementation Changes

- Added lazy local cross-encoder loading, stable fallback, canonical candidate text, and ranking trace support.
- Added retrieval-only A/B evaluation that uses identical initial candidate pools.

## 4. Control Results

```json
{
  "precision_at_5": 0.208,
  "recall_at_5": 0.5957,
  "ndcg_at_5": 0.6164,
  "mrr": 0.7438,
  "prohibited_candidate_rate": 0.0,
  "exact_entity_match_rate": 0.4667,
  "avg_first_grade3_rank": 1.3478,
  "avg_selected_count": 4.6296,
  "duplicate_candidate_rate": 0.0
}
```

## 5. Cross-Encoder Results

```json
{
  "precision_at_5": 0.216,
  "recall_at_5": 0.5988,
  "ndcg_at_5": 0.6704,
  "mrr": 0.8457,
  "prohibited_candidate_rate": 0.0,
  "exact_entity_match_rate": 0.4667,
  "avg_first_grade3_rank": 1.125,
  "avg_selected_count": 4.6296,
  "duplicate_candidate_rate": 0.0
}
```

## 6. Per-Metric Comparison

```json
{
  "avg_first_grade3_rank": -0.2228,
  "avg_selected_count": 0.0,
  "duplicate_candidate_rate": 0.0,
  "exact_entity_match_rate": 0.0,
  "mrr": 0.1019,
  "ndcg_at_5": 0.054,
  "precision_at_5": 0.008,
  "prohibited_candidate_rate": 0.0,
  "recall_at_5": 0.0031
}
```

## 7. Per-Case Analysis

- Improved cases: interest_no_8ams_schedule_001, course_cmp_ml_ai_001, course_rec_ai_001, course_rec_cyber_001, course_rec_math_ai_001, course_rec_interdisciplinary_bio_ai_001
- Unchanged cases: followup_course_context_001, adv_prompt_injection_001, adv_wrong_entity_instruction_001, adv_invent_professor_001, adv_format_001, course_cmp_cs1114_cs2114_001, course_cmp_cs2505_cs2506_001, course_cmp_wrong_entity_guard_001, course_cmp_no_subject_001, course_cmp_prereq_sequence_001, course_rec_biology_001, course_rec_data_science_001, course_rec_easiest_cs_elective_001, prof_rec_cs2114_001, prof_rec_typo_cs2114_001, prof_rec_cs3114_001, prof_exact_instructor_001, prof_schedule_current_001
- Regressed cases: major_req_cs_ai_001, interest_business_analytics_001, course_rec_ai_prereq_001

## 8. Latency and Resource Impact

- Average reranker latency: `14.2926` ms
- p50 reranker latency: `14.3` ms
- p95 reranker latency: `35.3` ms
- Maximum reranker latency: `44.6` ms
- Memory impact: see model smoke-test numbers in `docs/CYRUS_LOCAL_RERANKER_AUDIT.md`.
- Fallback rate: `0.0`

## 9. Safety Validation

- Prohibited candidate rate: `0.0`
- Exact-entity delta: `0.0`
- No candidate outside the initial retrieved pool is returned; this is asserted per row.
- Fallback preserves RRF order by construction.
- Pre-reranker exclusions: `36` candidate(s)

## 10. Limitations

- Generic MS MARCO reranker may not understand Virginia Tech course semantics.
- If relevant items are absent from initial retrieval, reranking cannot recover them.
- CPU latency and local PyTorch behavior must be verified on deployment hardware.
- This eval does not call Groq or measure generated answer quality.

## 11. Recommendation

B. Keep it optional and gather more data.

## 12. Exact Commands Run

- `python evals/run_reranker_ab.py --dataset /Users/kushpatel/Desktop/b2b/Darvis/evals/datasets --top-k 5 --candidate-k 18 --repetitions 3 --out-dir evals/reports/generation_structured_retrieval_check`

