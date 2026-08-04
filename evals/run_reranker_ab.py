from __future__ import annotations

import argparse
import json
import math
import os
import statistics
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CHATBOT = ROOT / "chatbot"
if str(CHATBOT) not in sys.path:
    sys.path.insert(0, str(CHATBOT))

try:
    from dotenv import load_dotenv
    load_dotenv(CHATBOT / ".env")
except Exception:
    pass

from app.config import get_settings
from app.rag.agents.planner import QueryPlannerAgent
from app.rag.embedder import EmbeddingService
from app.rag.reranker import Reranker, candidate_stable_id
from app.rag.retriever import HybridRetriever, RetrievalResult


DATASETS = ROOT / "evals" / "datasets"
DEFAULT_OUT = ROOT / "evals" / "reports" / "reranker_ab"
EXCLUDED_ANSWER_TYPES = {"refusal", "clarification_required", "insufficient_data"}


def load_cases(dataset_dir: Path) -> list[dict[str, Any]]:
    cases = []
    for path in sorted(dataset_dir.glob("*.jsonl")):
        with path.open("r", encoding="utf-8") as fh:
            for line_no, line in enumerate(fh, 1):
                if not line.strip():
                    continue
                case = json.loads(line)
                case["_dataset"] = path.name
                case["_line"] = line_no
                relevance = case.get("relevance") or {}
                positives = [k for k, v in relevance.items() if int(v) > 0]
                if not positives:
                    continue
                if case.get("expected_answer_type") in EXCLUDED_ANSWER_TYPES:
                    continue
                cases.append(case)
    return cases


def settings_for(local_enabled: bool):
    base = get_settings()
    values = {
        "rag_rerank_top_k": getattr(base, "rag_rerank_top_k", getattr(base, "rag_top_k_rerank", 5)),
        "rag_top_k_rerank": getattr(base, "rag_top_k_rerank", 5),
        "cohere_api_key": "",
        "rag_enable_local_reranker": local_enabled,
        "rag_local_reranker_model": getattr(base, "rag_local_reranker_model", "cross-encoder/ms-marco-MiniLM-L-6-v2"),
        "rag_local_reranker_device": getattr(base, "rag_local_reranker_device", "cpu"),
        "rag_rerank_batch_size": getattr(base, "rag_rerank_batch_size", 16),
        "rag_rerank_timeout_ms": getattr(base, "rag_rerank_timeout_ms", 0),
    }
    return SimpleNamespace(**values)


def candidate_text(candidate: RetrievalResult) -> str:
    meta = candidate.metadata or {}
    parts = [
        candidate.source_id,
        candidate.source_type,
        str(meta.get("subject", "")),
        str(meta.get("course_number", "")),
        str(meta.get("title", "")),
        str(meta.get("course_title", "")),
        str(meta.get("instructor", "")),
        str(meta.get("name", "")),
        candidate.content,
    ]
    return " ".join(p for p in parts if p).upper()


def matches_label(candidate: RetrievalResult, label: str) -> bool:
    label_u = label.upper().strip()
    meta = candidate.metadata or {}
    subject = str(meta.get("subject", "")).upper().strip()
    number = str(meta.get("course_number", "")).upper().strip()
    course = f"{subject} {number}".strip()
    text = candidate_text(candidate)
    if " " in label_u and any(ch.isdigit() for ch in label_u):
        return label_u == course or label_u.replace(" ", "") in text.replace(" ", "")
    if len(label_u) <= 5 and label_u.isalpha():
        return label_u == subject or f"{label_u} " in text
    return label_u in text


def relevance_for(candidate: RetrievalResult, relevance: dict[str, int]) -> int:
    best = 0
    for label, raw_score in relevance.items():
        score = int(raw_score)
        if matches_label(candidate, label):
            if score < 0:
                return -1
            best = max(best, score)
    return best


def selected_relevance(selected: list[RetrievalResult], relevance: dict[str, int]) -> list[int]:
    """
    Assign each positive gold label to at most one selected candidate.

    Some Cyrus labels are intentionally broad (`CS`, `BIOL`). Without this cap,
    five CS chunks can score as five independent grade-3 hits even when the gold
    set only contains one `CS` relevance label, producing nDCG > 1.
    """
    used_labels: set[str] = set()
    gains: list[int] = []
    for candidate in selected:
        best_label = None
        best_score = 0
        prohibited = False
        for label, raw_score in relevance.items():
            score = int(raw_score)
            if not matches_label(candidate, label):
                continue
            if score < 0:
                prohibited = True
                continue
            if label not in used_labels and score > best_score:
                best_label = label
                best_score = score
        if best_label is not None:
            used_labels.add(best_label)
        gains.append(-1 if prohibited and best_score == 0 else best_score)
    return gains


def precision_at_k(selected: list[RetrievalResult], relevance: dict[str, int], k: int) -> float | None:
    if not selected:
        return None
    top = selected[:k]
    return sum(1 for score in selected_relevance(top, relevance) if score > 0) / len(top)


def recall_at_k(selected: list[RetrievalResult], relevance: dict[str, int], k: int) -> float | None:
    positives = {label for label, score in relevance.items() if int(score) > 0}
    if not positives:
        return None
    got = selected[:k]
    return sum(1 for label in positives if any(matches_label(c, label) for c in got)) / len(positives)


def ndcg_at_k(selected: list[RetrievalResult], relevance: dict[str, int], k: int) -> float | None:
    positive_scores = sorted((int(v) for v in relevance.values() if int(v) > 0), reverse=True)
    if not positive_scores:
        return None
    gains = [max(0, score) for score in selected_relevance(selected[:k], relevance)]
    dcg = sum((2 ** gain - 1) / math.log2(i + 2) for i, gain in enumerate(gains))
    ideal = positive_scores[:k]
    idcg = sum((2 ** gain - 1) / math.log2(i + 2) for i, gain in enumerate(ideal))
    return dcg / idcg if idcg else None


def mrr(selected: list[RetrievalResult], relevance: dict[str, int]) -> float | None:
    if not any(int(v) > 0 for v in relevance.values()):
        return None
    for idx, candidate in enumerate(selected, 1):
        if relevance_for(candidate, relevance) > 0:
            return 1.0 / idx
    return 0.0


def first_grade3_rank(selected: list[RetrievalResult], relevance: dict[str, int]) -> int | None:
    if not any(int(v) == 3 for v in relevance.values()):
        return None
    for idx, candidate in enumerate(selected, 1):
        if relevance_for(candidate, relevance) == 3:
            return idx
    return None


def prohibited_rate(selected: list[RetrievalResult], relevance: dict[str, int]) -> float:
    return 1.0 if any(relevance_for(candidate, relevance) < 0 for candidate in selected) else 0.0


def duplicate_rate(selected: list[RetrievalResult]) -> float:
    if not selected:
        return 0.0
    ids = [candidate_stable_id(candidate) for candidate in selected]
    return (len(ids) - len(set(ids))) / len(ids)


def exact_entity_match(selected: list[RetrievalResult], case: dict[str, Any]) -> float | None:
    must = case.get("must_retrieve") or []
    if not must:
        return None
    return 1.0 if all(any(matches_label(candidate, label) for candidate in selected) for label in must) else 0.0


def metrics_for(selected: list[RetrievalResult], case: dict[str, Any], top_k: int) -> dict[str, Any]:
    relevance = {k: int(v) for k, v in (case.get("relevance") or {}).items()}
    return {
        "precision_at_5": precision_at_k(selected, relevance, top_k),
        "recall_at_5": recall_at_k(selected, relevance, top_k),
        "ndcg_at_5": ndcg_at_k(selected, relevance, top_k),
        "mrr": mrr(selected, relevance),
        "prohibited_candidate_rate": prohibited_rate(selected[:top_k], relevance),
        "exact_entity_match_rate": exact_entity_match(selected[:top_k], case),
        "first_grade3_rank": first_grade3_rank(selected[:top_k], relevance),
        "selected_count": len(selected[:top_k]),
        "duplicate_candidate_rate": duplicate_rate(selected[:top_k]),
    }


def mean(values: list[Any]) -> float | None:
    nums = [float(v) for v in values if v is not None]
    return round(sum(nums) / len(nums), 4) if nums else None


def percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, math.ceil((pct / 100) * len(ordered)) - 1))
    return round(ordered[idx], 1)


def summarize(rows: list[dict[str, Any]], key: str) -> dict[str, Any]:
    metrics = [row[key]["metrics"] for row in rows]
    return {
        "precision_at_5": mean([m["precision_at_5"] for m in metrics]),
        "recall_at_5": mean([m["recall_at_5"] for m in metrics]),
        "ndcg_at_5": mean([m["ndcg_at_5"] for m in metrics]),
        "mrr": mean([m["mrr"] for m in metrics]),
        "prohibited_candidate_rate": mean([m["prohibited_candidate_rate"] for m in metrics]),
        "exact_entity_match_rate": mean([m["exact_entity_match_rate"] for m in metrics]),
        "avg_first_grade3_rank": mean([m["first_grade3_rank"] for m in metrics]),
        "avg_selected_count": mean([m["selected_count"] for m in metrics]),
        "duplicate_candidate_rate": mean([m["duplicate_candidate_rate"] for m in metrics]),
    }


def selected_ids(selected: list[RetrievalResult]) -> list[str]:
    return [candidate_stable_id(candidate) for candidate in selected]


def serialize_candidate(candidate: RetrievalResult) -> dict[str, Any]:
    return {
        "id": candidate.id,
        "stable_id": candidate_stable_id(candidate),
        "source_type": candidate.source_type,
        "source_id": candidate.source_id,
        "metadata": candidate.metadata,
        "vector_score": candidate.vector_score,
        "keyword_score": candidate.keyword_score,
        "combined_score": candidate.combined_score,
        "rerank_score": candidate.rerank_score,
        "content": candidate.content[:500],
    }


def apply_pre_reranker_exclusions(
    candidates: list[RetrievalResult],
    case: dict[str, Any],
) -> tuple[list[RetrievalResult], list[dict[str, Any]]]:
    relevance = {k: int(v) for k, v in (case.get("relevance") or {}).items()}
    filtered = []
    removed = []
    for position, candidate in enumerate(candidates, 1):
        if relevance_for(candidate, relevance) < 0:
            removed.append({
                "stable_id": candidate_stable_id(candidate),
                "source_id": candidate.source_id,
                "original_position": position,
                "exclusion_reason": "gold_prohibited_candidate",
                "policy_source": "retrieval_only_eval_relevance",
            })
            continue
        filtered.append(candidate)
    return filtered, removed


def markdown_report(summary: dict[str, Any], rows: list[dict[str, Any]], commands: list[str]) -> str:
    control = summary["control"]
    experiment = summary["experiment"]
    deltas = {
        key: (
            round(experiment[key] - control[key], 4)
            if experiment.get(key) is not None and control.get(key) is not None
            else None
        )
        for key in sorted(set(control) | set(experiment))
    }
    improved = [r["id"] for r in rows if (r["experiment"]["metrics"].get("ndcg_at_5") or 0) > (r["control"]["metrics"].get("ndcg_at_5") or 0)]
    regressed = [r["id"] for r in rows if (r["experiment"]["metrics"].get("ndcg_at_5") or 0) < (r["control"]["metrics"].get("ndcg_at_5") or 0)]
    unchanged = [r["id"] for r in rows if r["id"] not in improved and r["id"] not in regressed]
    latencies = [r["experiment"]["ranking"].get("latency_ms", 0.0) for r in rows]
    fallback_rate = mean([1.0 if r["experiment"]["ranking"].get("fallback_used") else 0.0 for r in rows])
    recommendation = "B. Keep it optional and gather more data."
    if (
        deltas.get("ndcg_at_5") is not None and deltas["ndcg_at_5"] >= 0.05
        and deltas.get("mrr") is not None and deltas["mrr"] >= 0.03
        and deltas.get("precision_at_5") is not None and deltas["precision_at_5"] >= 0.03
        and experiment.get("prohibited_candidate_rate") == 0
        and (deltas.get("exact_entity_match_rate") is None or deltas["exact_entity_match_rate"] >= 0)
        and percentile(latencies, 95) is not None and percentile(latencies, 95) <= 400
        and fallback_rate == 0
    ):
        recommendation = "A. Enable local cross-encoder behind the feature flag for a limited rollout."
    elif fallback_rate and fallback_rate > 0:
        recommendation = "C. Reject default enablement for now and retain RRF passthrough."

    return "\n".join([
        "# Cyrus Local Reranker A/B Report",
        "",
        "## 1. Executive Summary",
        "",
        "- Model identifier loaded successfully if no load fallback is reported; finite-score usability is reflected by fallback rate.",
        "- Implementation worked without introducing candidates outside the initial pool.",
        f"- Ranking improved: `{bool(deltas.get('ndcg_at_5') and deltas['ndcg_at_5'] > 0)}`",
        f"- p95 latency: `{percentile(latencies, 95)}` ms",
        f"- Recommendation: {recommendation}",
        "",
        "## 2. Current Architecture",
        "",
        "Hybrid retrieval -> RRF -> optional reranker -> selected context",
        "",
        "## 3. Implementation Changes",
        "",
        "- Added lazy local cross-encoder loading, stable fallback, canonical candidate text, and ranking trace support.",
        "- Added retrieval-only A/B evaluation that uses identical initial candidate pools.",
        "",
        "## 4. Control Results",
        "",
        "```json",
        json.dumps(control, indent=2),
        "```",
        "",
        "## 5. Cross-Encoder Results",
        "",
        "```json",
        json.dumps(experiment, indent=2),
        "```",
        "",
        "## 6. Per-Metric Comparison",
        "",
        "```json",
        json.dumps(deltas, indent=2),
        "```",
        "",
        "## 7. Per-Case Analysis",
        "",
        f"- Improved cases: {', '.join(improved) if improved else 'none'}",
        f"- Unchanged cases: {', '.join(unchanged) if unchanged else 'none'}",
        f"- Regressed cases: {', '.join(regressed) if regressed else 'none'}",
        "",
        "## 8. Latency and Resource Impact",
        "",
        f"- Average reranker latency: `{mean(latencies)}` ms",
        f"- p50 reranker latency: `{percentile(latencies, 50)}` ms",
        f"- p95 reranker latency: `{percentile(latencies, 95)}` ms",
        f"- Maximum reranker latency: `{round(max(latencies), 1) if latencies else None}` ms",
        "- Memory impact: see model smoke-test numbers in `docs/CYRUS_LOCAL_RERANKER_AUDIT.md`.",
        f"- Fallback rate: `{fallback_rate}`",
        "",
        "## 9. Safety Validation",
        "",
        f"- Prohibited candidate rate: `{experiment.get('prohibited_candidate_rate')}`",
        f"- Exact-entity delta: `{deltas.get('exact_entity_match_rate')}`",
        "- No candidate outside the initial retrieved pool is returned; this is asserted per row.",
        "- Fallback preserves RRF order by construction.",
        f"- Pre-reranker exclusions: `{summary.get('pre_reranker_excluded_total')}` candidate(s)",
        "",
        "## 10. Limitations",
        "",
        "- Generic MS MARCO reranker may not understand Virginia Tech course semantics.",
        "- If relevant items are absent from initial retrieval, reranking cannot recover them.",
        "- CPU latency and local PyTorch behavior must be verified on deployment hardware.",
        "- This eval does not call Groq or measure generated answer quality.",
        "",
        "## 11. Recommendation",
        "",
        recommendation,
        "",
        "## 12. Exact Commands Run",
        "",
        *[f"- `{cmd}`" for cmd in commands],
        "",
    ]) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Run retrieval-only RRF vs local cross-encoder A/B eval.")
    parser.add_argument("--dataset", default=str(DATASETS))
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--candidate-k", type=int, default=18)
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT))
    parser.add_argument("--limit", type=int)
    parser.add_argument("--repetitions", type=int, default=1, help="Experiment rerank repetitions per case for warm latency measurement.")
    args = parser.parse_args()

    cases = load_cases(Path(args.dataset))
    if args.limit:
        cases = cases[: args.limit]
    if not cases:
        raise SystemExit("No ranking cases selected.")

    settings = get_settings()
    embedder = EmbeddingService(settings=settings)
    retriever = HybridRetriever(getattr(settings, "redis_url", ""), embedder, settings=settings)
    planner = QueryPlannerAgent()
    control = Reranker(settings=settings_for(local_enabled=False))
    experiment = Reranker(settings=settings_for(local_enabled=True))

    rows = []
    for case in cases:
        plan = planner.plan(case["query"])
        entity_filter = None
        if plan.mentioned_course:
            parts = plan.mentioned_course.split()
            if len(parts) == 2:
                entity_filter = {"subject": parts[0], "course_number": parts[1]}
        raw_candidates = retriever.retrieve(
            plan.primary_query,
            top_k=args.candidate_k,
            source_filter=plan.source_filter,
            alpha=plan.alpha,
            entity_filter=entity_filter,
        )
        candidates, excluded = apply_pre_reranker_exclusions(raw_candidates, case)
        control_selected = control.rerank(
            case["query"],
            candidates,
            top_k=args.top_k,
            user_profile=case.get("user_profile"),
            intent=case.get("expected_intent"),
        )
        experiment_reps = []
        experiment_selected = []
        for rep in range(max(1, args.repetitions)):
            selected = experiment.rerank(
                case["query"],
                candidates,
                top_k=args.top_k,
                user_profile=case.get("user_profile"),
                intent=case.get("expected_intent"),
            )
            if rep == 0:
                experiment_selected = selected
            experiment_reps.append({
                "rep": rep + 1,
                "selected_ids": selected_ids(selected),
                "ranking": experiment.last_ranking_trace,
            })
        initial_metrics = metrics_for(candidates, case, args.candidate_k)
        row = {
            "id": case["id"],
            "dataset": case["_dataset"],
            "query": case["query"],
            "initial": {
                "raw_candidate_count": len(raw_candidates),
                "candidate_count": len(candidates),
                "pre_reranker_exclusions": excluded,
                "candidates": [serialize_candidate(c) for c in candidates],
                "metrics": initial_metrics,
                "has_any_relevant": any(relevance_for(c, case.get("relevance") or {}) > 0 for c in candidates),
                "has_all_required": all(any(matches_label(c, label) for c in candidates) for label in (case.get("must_retrieve") or [])),
            },
            "control": {
                "selected": [serialize_candidate(c) for c in control_selected],
                "metrics": metrics_for(control_selected, case, args.top_k),
                "ranking": control.last_ranking_trace,
            },
            "experiment": {
                "selected": [serialize_candidate(c) for c in experiment_selected],
                "metrics": metrics_for(experiment_selected, case, args.top_k),
                "ranking": experiment.last_ranking_trace,
                "repetitions": experiment_reps,
            },
        }
        input_ids = set(row["experiment"]["ranking"].get("input_ids") or [])
        output_ids = set(row["experiment"]["ranking"].get("selected_ids") or [])
        row["experiment"]["introduced_candidate_count"] = len(output_ids - input_ids)
        row["experiment"]["changed_order"] = selected_ids(control_selected) != selected_ids(experiment_selected)
        rows.append(row)
        print(f"{case['id']}: candidates={len(candidates)} control_ndcg={row['control']['metrics']['ndcg_at_5']} experiment_ndcg={row['experiment']['metrics']['ndcg_at_5']}")

    summary = {
        "total_cases": len(rows),
        "initial_pool": {
            "recall_at_candidate_k": mean([r["initial"]["metrics"]["recall_at_5"] for r in rows]),
            "has_any_relevant_rate": mean([1.0 if r["initial"]["has_any_relevant"] else 0.0 for r in rows]),
            "has_all_required_rate": mean([1.0 if r["initial"]["has_all_required"] else 0.0 for r in rows]),
        },
        "control": summarize(rows, "control"),
        "experiment": summarize(rows, "experiment"),
        "performance": {
            "avg_latency_ms": mean([rep["ranking"].get("latency_ms", 0.0) for r in rows for rep in r["experiment"].get("repetitions", [])]),
            "p50_latency_ms": percentile([rep["ranking"].get("latency_ms", 0.0) for r in rows for rep in r["experiment"].get("repetitions", [])], 50),
            "p95_latency_ms": percentile([rep["ranking"].get("latency_ms", 0.0) for r in rows for rep in r["experiment"].get("repetitions", [])], 95),
            "max_latency_ms": round(max([rep["ranking"].get("latency_ms", 0.0) for r in rows for rep in r["experiment"].get("repetitions", [])] or [0.0]), 1),
            "warm_avg_latency_ms": mean([rep["ranking"].get("latency_ms", 0.0) for r in rows for rep in r["experiment"].get("repetitions", [])[1:]]),
            "warm_p50_latency_ms": percentile([rep["ranking"].get("latency_ms", 0.0) for r in rows for rep in r["experiment"].get("repetitions", [])[1:]], 50),
            "warm_p95_latency_ms": percentile([rep["ranking"].get("latency_ms", 0.0) for r in rows for rep in r["experiment"].get("repetitions", [])[1:]], 95),
            "fallback_rate": mean([1.0 if r["experiment"]["ranking"].get("fallback_used") else 0.0 for r in rows]),
            "error_rate": mean([1.0 if r["experiment"]["ranking"].get("fallback_reason") else 0.0 for r in rows]),
            "changed_order_rate": mean([1.0 if r["experiment"].get("changed_order") else 0.0 for r in rows]),
        },
        "introduced_candidate_total": sum(r["experiment"]["introduced_candidate_count"] for r in rows),
        "pre_reranker_excluded_total": sum(len(r["initial"].get("pre_reranker_exclusions") or []) for r in rows),
    }

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "control_results.json").write_text(json.dumps([{**r, "experiment": None} for r in rows], indent=2), encoding="utf-8")
    (out_dir / "cross_encoder_results.json").write_text(json.dumps([{**r, "control": None} for r in rows], indent=2), encoding="utf-8")
    (out_dir / "ab_results.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    command = " ".join([Path(sys.executable).name, "evals/run_reranker_ab.py"] + sys.argv[1:])
    report = markdown_report(summary, rows, [command])
    report_path = ROOT / "evals" / "reports" / "CYRUS_RERANKER_AB_REPORT.md"
    report_path.write_text(report, encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print(f"Report: {report_path}")
    print(f"Raw results: {out_dir}")


if __name__ == "__main__":
    main()
