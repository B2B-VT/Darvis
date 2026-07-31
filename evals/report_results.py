from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


RESULTS_DIR = Path("evals/results")


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(results)
    status_counts = Counter(r.get("status", "Unknown") for r in results)
    by_category: dict[str, Counter] = defaultdict(Counter)
    for row in results:
        by_category[row.get("category", "Unknown")][row.get("status", "Unknown")] += 1

    critical = [r for r in results if str(r.get("risk_level", "")).lower() == "critical"]
    security = [r for r in results if str(r.get("category", "")).lower() in {"security", "prompt injection"}]

    return {
        "total": total,
        "pass": status_counts["Pass"],
        "partial": status_counts["Partial"],
        "fail": status_counts["Fail"],
        "blocked": status_counts["Blocked"],
        "not_tested": status_counts["Not Tested"],
        "critical_failures": sum(1 for r in critical if r.get("status") not in {"Pass"}),
        "security_pass_rate": _pass_rate(security),
        "retrieval_pass_rate": _pass_rate([r for r in results if any(k in str(r.get("category", "")).lower() for k in ("course", "professor", "schedule", "time"))]),
        "grade_analytics_pass_rate": _pass_rate([r for r in results if "grade" in str(r.get("category", "")).lower()]),
        "multi_hop_pass_rate": _pass_rate([r for r in results if "multi-hop" in str(r.get("category", "")).lower()]),
        "nlp_pass_rate": _pass_rate([r for r in results if "nlp" in str(r.get("category", "")).lower() or "typos" in str(r.get("category", "")).lower()]),
        "fallback_pass_rate": _pass_rate([r for r in results if "fallback" in str(r.get("category", "")).lower()]),
        "by_category": {cat: dict(counts) for cat, counts in by_category.items()},
    }


def _pass_rate(rows: list[dict[str, Any]]) -> float | None:
    if not rows:
        return None
    return round(100 * sum(1 for r in rows if r.get("status") == "Pass") / len(rows), 1)


def write_reports(results: list[dict[str, Any]], results_dir: Path = RESULTS_DIR) -> dict[str, Any]:
    results_dir.mkdir(parents=True, exist_ok=True)
    summary = summarize(results)

    (results_dir / "latest_results.json").write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
    fieldnames = [
        "id", "category", "question", "status", "score", "risk_level", "route",
        "retrieval_correct", "grounded", "safe", "hallucination",
        "asked_clarifying_question", "response_time_sec", "failure_reason",
        "actual_response",
    ]
    with (results_dir / "latest_results.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(results)

    failures = [r for r in results if r.get("status") in {"Fail", "Partial", "Blocked"}]
    lines = [
        "# Darvis RAG QA Failure Summary",
        "",
        f"Total tests run: {summary['total']}",
        f"Pass: {summary['pass']}",
        f"Partial: {summary['partial']}",
        f"Fail: {summary['fail']}",
        f"Blocked: {summary['blocked']}",
        f"Critical failures: {summary['critical_failures']}",
        f"Security pass rate: {_fmt_rate(summary['security_pass_rate'])}",
        f"Retrieval pass rate: {_fmt_rate(summary['retrieval_pass_rate'])}",
        f"Grade analytics pass rate: {_fmt_rate(summary['grade_analytics_pass_rate'])}",
        f"Multi-hop pass rate: {_fmt_rate(summary['multi_hop_pass_rate'])}",
        f"NLP / typos / slang pass rate: {_fmt_rate(summary['nlp_pass_rate'])}",
        f"Fallback pass rate: {_fmt_rate(summary['fallback_pass_rate'])}",
        "",
        "## By Category",
    ]
    for cat, counts in sorted(summary["by_category"].items()):
        lines.append(f"- {cat}: {dict(counts)}")
    lines.extend(["", "## Failures / Partials / Blocked"])
    if not failures:
        lines.append("No failures recorded.")
    for row in failures:
        lines.append(f"- {row.get('id')} [{row.get('category')}] {row.get('status')}: {row.get('failure_reason') or 'No failure reason.'}")
    lines.extend([
        "",
        "## Regression Summary",
        "",
        "The current eval harness verifies workbook-driven behavior, writes raw responses, and flags safety/grounding failures. Re-run after backend changes with `python evals/run_rag_qa.py --all`.",
    ])
    (results_dir / "failure_summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (results_dir / "regression_summary.md").write_text(
        "\n".join(lines[:13]) + "\n\nSee `failure_summary.md` for case-level failures.\n",
        encoding="utf-8",
    )
    return summary


def _fmt_rate(value: float | None) -> str:
    return "N/A" if value is None else f"{value}%"


def main() -> None:
    parser = argparse.ArgumentParser(description="Report Darvis QA eval results.")
    parser.add_argument("--results", default=str(RESULTS_DIR / "latest_results.json"))
    args = parser.parse_args()
    path = Path(args.results)
    if not path.exists():
        raise SystemExit(f"No results file found: {path}")
    results = json.loads(path.read_text(encoding="utf-8"))
    summary = write_reports(results, path.parent)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
