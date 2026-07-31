from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from judge_response import judge_case
from load_qa_workbook import DEFAULT_WORKBOOK, QATestCase, load_test_cases
from report_results import RESULTS_DIR, write_reports


DEFAULT_ENDPOINT = "http://127.0.0.1:8000/chat"


def _post_chat(endpoint: str, question: str, timeout: float) -> tuple[dict[str, Any] | None, str | None, float]:
    payload = json.dumps({"question": question}).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
        return json.loads(body), None, round(time.time() - start, 3)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return None, f"HTTP {exc.code}: {body}", round(time.time() - start, 3)
    except Exception as exc:
        return None, str(exc), round(time.time() - start, 3)


def _load_previous_failed(results_dir: Path) -> set[str]:
    path = results_dir / "latest_results.json"
    if not path.exists():
        return set()
    rows = json.loads(path.read_text(encoding="utf-8"))
    return {str(r.get("id")) for r in rows if r.get("status") in {"Fail", "Partial", "Blocked"}}


def _select_cases(cases: list[QATestCase], args: argparse.Namespace, results_dir: Path) -> list[QATestCase]:
    selected = cases
    if args.id:
        selected = [c for c in selected if c.id.lower() == args.id.lower()]
    if args.category:
        needle = args.category.lower()
        selected = [c for c in selected if needle in c.category.lower()]
    if args.critical:
        selected = [
            c for c in selected
            if c.risk_level.lower() == "critical" or c.category.lower() in {"security", "prompt injection"}
        ]
    if args.failed_only:
        failed = _load_previous_failed(results_dir)
        selected = [c for c in selected if c.id in failed]
    if args.limit:
        selected = selected[: args.limit]
    return selected


def run_cases(cases: list[QATestCase], endpoint: str, timeout: float, delay: float = 0.0) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for i, case in enumerate(cases, 1):
        if delay and i > 1:
            time.sleep(delay)
        response, error, elapsed = _post_chat(endpoint, case.question, timeout)
        judged = judge_case(case, response, error=error, response_time=elapsed)
        results.append(judged)
        print(f"{i:03d}/{len(cases):03d} {case.id} {judged['status']} score={judged['score']} route={judged.get('route') or '-'} {elapsed}s")
        if judged.get("failure_reason"):
            print(f"    {judged['failure_reason']}")
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Darvis RAG QA workbook evals.")
    parser.add_argument("--workbook", default=str(DEFAULT_WORKBOOK))
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--results-dir", default=str(RESULTS_DIR))
    parser.add_argument("--all", action="store_true", help="Run all workbook tests.")
    parser.add_argument("--category")
    parser.add_argument("--failed-only", action="store_true")
    parser.add_argument("--critical", action="store_true", help="Run critical/security/prompt-injection tests.")
    parser.add_argument("--id")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--timeout", type=float, default=60.0)
    parser.add_argument("--delay", type=float, default=0.0, help="Seconds to wait between requests; useful for rate-limited local endpoints.")
    args = parser.parse_args()

    if not any([args.all, args.category, args.failed_only, args.critical, args.id, args.limit]):
        parser.error("Select tests with --all, --category, --failed-only, --critical, --id, or --limit.")

    results_dir = Path(args.results_dir)
    cases = load_test_cases(args.workbook)
    selected = _select_cases(cases, args, results_dir)
    if not selected:
        raise SystemExit("No test cases selected.")

    results = run_cases(selected, args.endpoint, args.timeout, delay=args.delay)
    summary = write_reports(results, results_dir)
    print("\nSummary")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
