from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from graders import grade_case, summarize_results


ROOT = Path(__file__).resolve().parent
DATASETS = ROOT / "datasets"
REPORTS = ROOT / "reports"
DEFAULT_ENDPOINT = "http://127.0.0.1:8000/chat"
DEFAULT_FIXTURES = ROOT / "fixtures" / "generation"

CHATBOT = ROOT.parent / "chatbot"
if str(CHATBOT) not in sys.path:
    sys.path.insert(0, str(CHATBOT))

try:
    from dotenv import load_dotenv
    load_dotenv(CHATBOT / ".env")
except Exception:
    pass


def load_cases(dataset: str | None = None) -> list[dict[str, Any]]:
    paths = [DATASETS / dataset] if dataset else sorted(DATASETS.glob("*.jsonl"))
    cases = []
    for path in paths:
        with path.open("r", encoding="utf-8") as fh:
            for line_no, line in enumerate(fh, 1):
                if not line.strip():
                    continue
                case = json.loads(line)
                case["_dataset"] = path.name
                case["_line"] = line_no
                cases.append(case)
    return cases


def post_chat(endpoint: str, case: dict[str, Any], timeout: float) -> tuple[dict[str, Any] | None, str | None, float]:
    payload = {
        "question": case["query"],
        "user_profile": case.get("user_profile"),
        "history": case.get("history") or [],
        "eval_mode": True,
        "eval_case_id": case["id"],
    }
    start = time.time()
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
        return json.loads(body), None, time.time() - start
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return None, f"HTTP {exc.code}: {body}", time.time() - start
    except Exception as exc:
        return None, str(exc), time.time() - start


def _response_provider_state(response: dict[str, Any] | None, error: str | None = None) -> dict[str, Any]:
    metadata = (response or {}).get("metadata") or {}
    generation = metadata.get("generation") or metadata.get("provider_state") or {}
    fallback_used = bool(metadata.get("fallback_used") or generation.get("fallback_used"))
    fallback_reason = metadata.get("fallback_reason") or generation.get("fallback_reason")
    error_text = str(error or "")
    return {
        "provider": generation.get("provider") or metadata.get("provider") or "unknown",
        "model": generation.get("model") or metadata.get("model") or "unknown",
        "attempt_count": generation.get("attempt_count"),
        "fallback_used": fallback_used,
        "fallback_reason": fallback_reason,
        "rate_limited": bool(generation.get("rate_limited")) or "429" in error_text or "rate limit" in error_text.lower(),
        "timeout": bool(generation.get("timeout")) or "timed out" in error_text.lower() or "timeout" in error_text.lower(),
        "latency_ms": generation.get("latency_ms"),
        "input_tokens": generation.get("input_tokens"),
        "output_tokens": generation.get("output_tokens"),
        "error": error,
    }


def validate_provider_run(rows: list[dict[str, Any]], require_provider_success: bool) -> dict[str, Any]:
    states = [row.get("provider_state") or _response_provider_state(row.get("response"), row.get("error")) for row in rows]
    invalid_reasons: list[str] = []
    providers = {s.get("provider") for s in states if s.get("provider") and s.get("provider") != "unknown"}
    models = {s.get("model") for s in states if s.get("model") and s.get("model") != "unknown"}
    if len(providers) > 1:
        invalid_reasons.append("provider_changed")
    if len(models) > 1:
        invalid_reasons.append("model_changed")
    if any(s.get("fallback_used") for s in states):
        invalid_reasons.append("fallback_used")
    if any(s.get("rate_limited") for s in states):
        invalid_reasons.append("rate_limited")
    if any(s.get("timeout") for s in states):
        invalid_reasons.append("timeout")
    if any(s.get("error") for s in states):
        invalid_reasons.append("request_or_provider_error")
    if require_provider_success and any(row.get("status") == "blocked" for row in rows):
        invalid_reasons.append("blocked_cases")
    return {
        "run_valid": not invalid_reasons,
        "invalid_reasons": sorted(set(invalid_reasons)),
        "provider_count": len(providers),
        "model_count": len(models),
        "fallback_rate": round(sum(1 for s in states if s.get("fallback_used")) / len(states), 4) if states else 0.0,
        "rate_limited_count": sum(1 for s in states if s.get("rate_limited")),
        "timeout_count": sum(1 for s in states if s.get("timeout")),
        "error_count": sum(1 for s in states if s.get("error")),
    }


def write_outputs(results: list[dict[str, Any]], out_dir: Path, run_metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    summary = summarize_results(results)
    if run_metadata:
        summary.update(run_metadata)
    (out_dir / "latest_results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    (out_dir / "latest_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    trace_dir = out_dir / "traces"
    trace_dir.mkdir(exist_ok=True)
    for row in results:
        trace = ((row.get("response") or {}).get("metadata") or {}).get("eval_trace")
        if trace:
            (trace_dir / f"{row['id']}.json").write_text(json.dumps(trace, indent=2, ensure_ascii=False), encoding="utf-8")
    return summary


def load_generation_fixtures(path: Path) -> list[dict[str, Any]]:
    files = sorted(path.glob("*.jsonl")) if path.is_dir() else [path]
    fixtures: list[dict[str, Any]] = []
    for file_path in files:
        with file_path.open("r", encoding="utf-8") as fh:
            for line_no, line in enumerate(fh, 1):
                if not line.strip():
                    continue
                fixture = json.loads(line)
                fixture["_fixture"] = str(file_path)
                fixture["_line"] = line_no
                fixtures.append(fixture)
    return fixtures


def run_retrieval_only(args) -> None:
    out_dir = Path(args.out_dir)
    cmd = [
        sys.executable,
        str(ROOT / "run_reranker_ab.py"),
        "--dataset",
        str(DATASETS),
        "--top-k",
        "5",
        "--candidate-k",
        "18",
        "--repetitions",
        "3",
        "--out-dir",
        str(out_dir),
    ]
    if args.limit:
        cmd.extend(["--limit", str(args.limit)])
    subprocess.run(cmd, check=True)


def _build_generation_adapter(args):
    from app.generation.model_types import ModelTier
    from app.generation.structured_generator import StructuredGenerationAdapter

    forced_tier = ModelTier(args.force_model) if getattr(args, "force_model", None) else None
    use_router = bool(getattr(args, "use_model_router", False))
    # Forced-tier evaluations do not escalate by default — only when the
    # caller explicitly opts in via --allow-escalation. Router runs keep
    # escalation on (subject to the router's own per-decision gate and
    # CYRUS_MODEL_MAX_ESCALATIONS) unless the CLI explicitly turns it off.
    if forced_tier is not None:
        escalation_enabled = bool(getattr(args, "allow_escalation", False))
    else:
        escalation_enabled = not getattr(args, "no_escalation", False)
    return StructuredGenerationAdapter(
        forced_tier=forced_tier,
        use_router=use_router,
        escalation_enabled=escalation_enabled,
        strict_eval=bool(args.require_provider_success),
    )


def _run_generation_fixtures(fixtures, adapter, args) -> list[dict[str, Any]]:
    from app.generation.providers import MissingModelConfigurationError
    from app.generation.structured_generator import render_structured_response

    results = []
    for i, fixture in enumerate(fixtures, 1):
        case = fixture.get("case") or {
            "id": fixture["case_id"],
            "query": fixture.get("query", ""),
            "expected_answer_type": fixture.get("expected_answer_type"),
            "must_retrieve": [],
            "acceptable_retrieve": [],
            "must_not_retrieve": [],
            "relevance": {},
            "required_table_columns": [],
            "forbidden_behavior": fixture.get("forbidden_claims") or [],
        }
        try:
            generated = adapter.generate(fixture)
        except MissingModelConfigurationError as exc:
            raise SystemExit(f"Model configuration error for case {case['id']}: {exc}")
        structured = generated.get("response") or {}
        answer, tables = render_structured_response(structured)
        provider_state = dict(generated.get("provider_metadata") or {})
        repair = generated.get("repair") or {}
        if repair.get("repair_attempted") and not repair.get("repair_succeeded"):
            provider_state["fallback_used"] = True
            provider_state["fallback_reason"] = "safe_deterministic_fallback"
        route = _route_for_answer_type(structured.get("answer_type") or case.get("expected_answer_type"))
        approved = fixture.get("approved_evidence") or {}
        evidence_ids = approved.get("evidence_ids") or []
        response = {
            "answer": answer,
            "route": route,
            "warnings": [],
            "tables": tables,
            "charts": [],
            "metadata": {
                "generation": provider_state,
                "structured_generation": structured,
                "structured_validation": generated.get("validation") or {},
                "structured_repair": repair,
                "routing": generated.get("routing"),
                "attempts": generated.get("attempts"),
                "escalation": generated.get("escalation"),
                "cost": generated.get("cost"),
                "eval_trace": {
                    "case_id": case.get("id"),
                    "query": case.get("query"),
                    "parsed_intent": {"route": route},
                    "resolved_entities": fixture.get("resolved_entities") or {},
                    "retrieval": {
                        "route": route,
                        "queries": [],
                        "raw_candidates": [],
                        "approved_candidates": approved.get("approved_candidates") or [],
                        "rejected_candidates": [],
                        "not_run_reason": "generation_only_fixed_fixture",
                    },
                    "approved_candidates": approved.get("approved_candidates") or [],
                    "evidence_ids": evidence_ids,
                    "retrieved_ids": evidence_ids,
                    "ranking": {
                        "method": "generation_only_fixed_fixture",
                        "ordered_ids": evidence_ids,
                        "selected_ids": evidence_ids,
                        "fallback_used": False,
                        "fallback_reason": None,
                    },
                    "sufficiency": fixture.get("sufficiency") or {},
                    "answer_type": structured.get("answer_type"),
                    "structured_payload": approved.get("structured_payload") or {},
                    "final_response": {"route": route, "answer": answer},
                },
            },
            "schedule_actions": [],
        }
        error = None
        if provider_state.get("rate_limited"):
            error = "provider_rate_limited"
        elif provider_state.get("timeout"):
            error = "provider_timeout"
        elif provider_state.get("fallback_used") and args.require_provider_success:
            error = provider_state.get("fallback_reason") or "provider_or_validation_fallback"
        row = grade_case(case, response, error, fixture.get("latency_s"))
        row["provider_state"] = provider_state
        row["structured_generation"] = {
            "response": structured,
            "validation": generated.get("validation") or {},
            "repair": repair,
        }
        row["routing"] = generated.get("routing")
        row["attempts"] = generated.get("attempts")
        row["escalation"] = generated.get("escalation")
        row["cost"] = generated.get("cost")
        row["fixture"] = {"path": fixture.get("_fixture"), "line": fixture.get("_line")}
        results.append(row)
        print(f"{i:03d}/{len(fixtures):03d} {case['id']} {row['status']} score={row['score']}")
    return results


def summarize_router_run(results: list[dict[str, Any]]) -> dict[str, Any]:
    initial: dict[str, int] = {}
    final: dict[str, int] = {}
    escalations = 0
    failures_by_initial: dict[str, list[int]] = {}
    successes_by_final: dict[str, list[int]] = {}
    for row in results:
        routing = row.get("routing") or {}
        escalation = row.get("escalation") or {}
        it = routing.get("selected_tier")
        ft = escalation.get("final_tier") or it
        if it:
            initial[it] = initial.get(it, 0) + 1
            bucket = failures_by_initial.setdefault(it, [0, 0])
            bucket[1] += 1
            if row.get("status") != "pass":
                bucket[0] += 1
        if ft:
            final[ft] = final.get(ft, 0) + 1
            bucket = successes_by_final.setdefault(ft, [0, 0])
            bucket[1] += 1
            if row.get("status") == "pass":
                bucket[0] += 1
        if escalation.get("attempted"):
            escalations += 1
    n = len(results) or 1
    valid_costs = [row["cost"]["total_estimated_cost_usd"] for row in results if row.get("cost") and row.get("status") == "pass"]
    return {
        "initial_tier_distribution": initial,
        "final_tier_distribution": final,
        "escalation_rate": round(escalations / n, 4),
        "validation_failure_rate_by_initial_tier": {
            t: round(f / c, 4) if c else 0.0 for t, (f, c) in failures_by_initial.items()
        },
        "success_rate_by_final_tier": {
            t: round(s / c, 4) if c else 0.0 for t, (s, c) in successes_by_final.items()
        },
        "total_cost_usd": round(sum(row["cost"]["total_estimated_cost_usd"] for row in results if row.get("cost")), 6),
        "average_cost_per_valid_answer_usd": round(sum(valid_costs) / len(valid_costs), 6) if valid_costs else None,
    }


def write_router_report(summary: dict[str, Any], out_dir: Path) -> Path:
    router = summary.get("router") or {}
    lines = [
        "# Cyrus OpenAI Routing Report", "",
        "Generated by `evals/run.py --generation-only --use-model-router`.", "",
        "## Router metrics", "",
        "```json", json.dumps(router, indent=2), "```", "",
        "## Overall summary", "",
        "```json", json.dumps(summary, indent=2), "```",
    ]
    path = out_dir / "CYRUS_OPENAI_ROUTING_REPORT.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def write_model_comparison_report(comparison: dict[str, Any], out_dir: Path) -> Path:
    lines = [
        "# Cyrus OpenAI Model Comparison", "",
        "Generated by `evals/run.py --generation-only --all-models`. "
        "Each tier ran independently over the same fixtures with escalation disabled — "
        "this measures each tier's standalone quality, not the routed system.",
        "",
        "## Per-tier summary", "",
    ]
    for tier, summary in comparison["tiers"].items():
        lines.append(f"### {tier}")
        lines.append("```json")
        lines.append(json.dumps(summary, indent=2))
        lines.append("```")
        lines.append("")
    path = out_dir / "CYRUS_OPENAI_MODEL_COMPARISON.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def run_all_models(fixtures: list[dict[str, Any]], args) -> None:
    from app.generation.model_types import ModelTier

    base_out = Path(args.out_dir)
    per_tier_summaries: dict[str, Any] = {}
    for tier in (ModelTier.LUNA, ModelTier.TERRA, ModelTier.SOL):
        tier_args = argparse.Namespace(**vars(args))
        tier_args.force_model = tier.value
        tier_args.allow_escalation = False  # all-model run must not enable escalation
        tier_args.use_model_router = False
        adapter = _build_generation_adapter(tier_args)
        tier_out = base_out / tier.value
        results = _run_generation_fixtures(fixtures, adapter, tier_args)
        provider_summary = validate_provider_run(results, args.require_provider_success)
        summary = write_outputs(
            results, tier_out, {"mode": "generation_only_all_models", "tier": tier.value, "provider": provider_summary},
        )
        write_baseline_report(results, summary, tier_out)
        per_tier_summaries[tier.value] = summary
        print(json.dumps({"tier": tier.value, "summary": summary}, indent=2))
        if args.require_provider_success and not provider_summary["run_valid"]:
            print(
                f"WARNING: {tier.value} run invalid: {', '.join(provider_summary['invalid_reasons'])} "
                "— do not mix into cross-tier comparisons; rerun after capacity is available."
            )

    comparison = {
        "tiers": per_tier_summaries,
        "note": "Independent per-tier runs, escalation disabled — measures tier quality in isolation.",
    }
    (base_out / "model_comparison_summary.json").write_text(json.dumps(comparison, indent=2), encoding="utf-8")
    write_model_comparison_report(comparison, base_out)
    print(json.dumps(comparison, indent=2))


def run_generation_only(args) -> None:
    fixtures = load_generation_fixtures(Path(args.fixtures))
    if args.id:
        fixtures = [f for f in fixtures if f.get("case_id") == args.id or (f.get("case") or {}).get("id") == args.id]
    if args.limit:
        fixtures = fixtures[: args.limit]
    if not fixtures:
        raise SystemExit("No generation fixtures selected.")

    if getattr(args, "all_models", False):
        run_all_models(fixtures, args)
        return

    adapter = _build_generation_adapter(args)
    results = _run_generation_fixtures(fixtures, adapter, args)

    provider_summary = validate_provider_run(results, args.require_provider_success)
    mode_metadata: dict[str, Any] = {"mode": "generation_only", "provider": provider_summary}
    if getattr(args, "use_model_router", False):
        mode_metadata["router"] = summarize_router_run(results)
    summary = write_outputs(results, Path(args.out_dir), mode_metadata)
    write_baseline_report(results, summary, Path(args.out_dir))
    if getattr(args, "use_model_router", False):
        write_router_report(summary, Path(args.out_dir))
    print(json.dumps(summary, indent=2))
    if args.require_provider_success and not provider_summary["run_valid"]:
        raise SystemExit("Generation-only run invalid: " + ", ".join(provider_summary["invalid_reasons"]))


def _route_for_answer_type(answer_type: str | None) -> str:
    return {
        "course_recommendation": "natural_filter",
        "course_comparison": "course_profile",
        "professor_recommendation": "course_profile",
        "professor_profile": "professor_profile",
        "current_schedule": "section_lookup",
        "schedule_recommendation": "schedule_builder",
        "major_requirements": "major_requirements",
        "clarification_required": "general_rag",
        "insufficient_data": "general_rag",
        "refusal": "refusal",
    }.get(answer_type or "", "general_rag")


def run_end_to_end(args) -> None:
    if not args.all and not args.dataset and not args.id and not args.limit:
        raise SystemExit("Select cases with --all, --dataset, --id, or --limit.")
    cases = load_cases(args.dataset)
    if args.id:
        cases = [c for c in cases if c["id"] == args.id]
    if args.limit:
        cases = cases[: args.limit]
    if not cases:
        raise SystemExit("No cases selected.")
    results = []
    for i, case in enumerate(cases, 1):
        if args.delay and i > 1:
            time.sleep(args.delay)
        response, error, latency = post_chat(args.endpoint, case, args.timeout)
        row = grade_case(case, response, error, latency)
        row["provider_state"] = _response_provider_state(response, error)
        results.append(row)
        print(f"{i:03d}/{len(cases):03d} {case['id']} {row['status']} score={row['score']} {latency:.2f}s")
        if row.get("blockers"):
            print("    " + "; ".join(row["blockers"]))
    provider_summary = validate_provider_run(results, args.require_provider_success)
    out_dir = Path(args.out_dir)
    summary = write_outputs(
        results,
        out_dir,
        {"mode": "end_to_end", "provider": provider_summary},
    )
    report_path = write_baseline_report(results, summary, out_dir)
    print(json.dumps(summary, indent=2))
    print(f"Baseline report: {report_path}")
    if args.require_provider_success and not provider_summary["run_valid"]:
        raise SystemExit("End-to-end run invalid: " + ", ".join(provider_summary["invalid_reasons"]))


def write_baseline_report(results: list[dict[str, Any]], summary: dict[str, Any], out_dir: Path) -> Path:
    groups = {
        "intent": [],
        "entity resolution": [],
        "retrieval": [],
        "ranking": [],
        "analytics": [],
        "sufficiency": [],
        "grounding": [],
        "schema": [],
        "formatting": [],
    }
    for row in results:
        if row.get("status") == "pass":
            continue
        metrics = row.get("metrics") or {}
        blockers = " ".join(row.get("blockers") or [])
        if metrics.get("intent_accuracy") == 0:
            groups["intent"].append(row["id"])
        if metrics.get("entity_resolution_accuracy") == 0 or "wrong_exact_course" in blockers:
            groups["entity resolution"].append(row["id"])
        if (metrics.get("retrieval_precision_at_5") is not None and metrics.get("retrieval_precision_at_5", 1) < 0.9) or "prohibited_candidate" in blockers:
            groups["retrieval"].append(row["id"])
        if metrics.get("retrieval_ndcg_at_5") is not None and metrics.get("retrieval_ndcg_at_5", 1) < 0.85:
            groups["ranking"].append(row["id"])
        if metrics.get("calculation_correctness") == 0:
            groups["analytics"].append(row["id"])
        if metrics.get("sufficiency_behavior") == 0:
            groups["sufficiency"].append(row["id"])
        if metrics.get("grounding") == 0 or "unsupported" in blockers or "invented" in blockers:
            groups["grounding"].append(row["id"])
        if metrics.get("response_schema_compliance") == 0:
            groups["schema"].append(row["id"])
        if metrics.get("format_compliance_rate") == 0:
            groups["formatting"].append(row["id"])
    clusters = sorted(groups.items(), key=lambda item: len(item[1]), reverse=True)[:5]
    lines = [
        "# Cyrus Baseline Report",
        "",
        "Generated by `evals/run.py`.",
        "",
        "## Summary",
        "",
        "```json",
        json.dumps(summary, indent=2),
        "```",
        "",
        "## Failure Groups",
        "",
    ]
    for name, ids in groups.items():
        lines.append(f"- {name}: {len(ids)} case(s)" + (f" — {', '.join(ids[:12])}" if ids else ""))
    lines.extend(["", "## Top Root-Cause Clusters", ""])
    for name, ids in clusters:
        lines.append(f"- {name}: {len(ids)} failing/partial case(s)")
    lines.extend(["", "## Blockers", ""])
    for row in results:
        if row.get("blockers"):
            lines.append(f"- {row['id']}: {', '.join(row['blockers'])}")
    path = out_dir / "CYRUS_BASELINE_REPORT.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Cyrus JSONL evaluation suite.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--retrieval-only", action="store_true", help="Run deterministic retrieval/ranking eval without generation.")
    mode.add_argument("--generation-only", action="store_true", help="Grade saved generation fixtures without rerunning retrieval.")
    mode.add_argument("--end-to-end", action="store_true", help="Run the full endpoint-backed integration eval.")
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--dataset", help="One JSONL file under evals/datasets, e.g. course_recommendations.jsonl")
    parser.add_argument("--id")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--timeout", type=float, default=75.0)
    parser.add_argument("--delay", type=float, default=0.0, help="Seconds to wait between requests.")
    parser.add_argument("--out-dir", default=str(REPORTS))
    parser.add_argument("--fixtures", default=str(DEFAULT_FIXTURES), help="Generation fixture file or directory for --generation-only.")
    parser.add_argument("--require-provider-success", action="store_true", help="Fail if provider calls, fallback, timeout, or model/provider stability are invalid.")
    parser.add_argument("--force-model", choices=["luna", "terra", "sol"], help="--generation-only: bypass routing and force a single tier.")
    parser.add_argument("--allow-escalation", action="store_true", help="With --force-model, allow escalation past the forced tier (off by default).")
    parser.add_argument("--no-escalation", action="store_true", help="With --use-model-router, disable escalation (on by default).")
    parser.add_argument("--all-models", action="store_true", help="--generation-only: run every fixture independently through Luna, Terra, and Sol.")
    parser.add_argument("--use-model-router", action="store_true", help="--generation-only: route each case through the deterministic model router.")
    args = parser.parse_args()
    if args.retrieval_only:
        run_retrieval_only(args)
        return
    if args.generation_only:
        run_generation_only(args)
        return
    run_end_to_end(args)


if __name__ == "__main__":
    main()
