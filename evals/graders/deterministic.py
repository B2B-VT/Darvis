from __future__ import annotations

import math
import re
from typing import Any


COURSE_RE = re.compile(r"\b([A-Z]{2,5})\s*-?\s*(\d{4})\b", re.I)
INVALID_COURSE_SUBJECTS = {
    "AND", "ARE", "BOTH", "FALL", "FOR", "FROM", "INTO", "NOT", "TAKE", "THAN", "THAT", "THIS", "TO", "WITH",
}
NUMBER_RE = re.compile(r"\b\d+(?:\.\d+)?\s*(?:%|GPA|students?|terms?|withdrawals?)?\b", re.I)
MISSING_MARKERS = (
    "doesn't have", "do not have", "don't have", "not available", "cannot verify",
    "can't verify", "insufficient", "not enough", "couldn't find", "missing",
)
CLARIFY_MARKERS = ("which", "what course", "please provide", "clarify", "do you mean")
REFUSAL_MARKERS = ("can't", "cannot", "private", "secret", "api key", "service role", "system prompt")


def _course_codes(text: str) -> list[str]:
    codes = []
    for m in COURSE_RE.finditer(str(text or "")):
        subj = m.group(1).upper()
        if subj in INVALID_COURSE_SUBJECTS:
            continue
        codes.append(f"{subj} {m.group(2)}")
    return codes


def _entity_tokens(text: str) -> set[str]:
    raw = str(text or "").upper().replace("_", " ")
    tokens = set(_course_codes(raw))
    tokens.add(re.sub(r"\s+", " ", raw).strip())
    return {t for t in tokens if t}


def _matches_entity(item: str, target: str) -> bool:
    target_upper = str(target or "").upper()
    if not target_upper:
        return False
    tokens = _entity_tokens(item)
    if target_upper in tokens:
        return True
    normalized_item = re.sub(r"\s+", " ", str(item or "").upper().replace("_", " ")).strip()
    return target_upper in normalized_item


def _flatten_text(obj: Any) -> str:
    if obj is None:
        return ""
    if isinstance(obj, (str, int, float, bool)):
        return str(obj)
    if isinstance(obj, list):
        return " ".join(_flatten_text(v) for v in obj)
    if isinstance(obj, dict):
        return " ".join(_flatten_text(v) for v in obj.values())
    return str(obj)


def _trace(response: dict[str, Any]) -> dict[str, Any]:
    return (response.get("metadata") or {}).get("eval_trace") or {}


def _candidate_id(candidate: Any) -> str | None:
    if not isinstance(candidate, dict):
        return None
    stable_id = candidate.get("stable_id") or candidate.get("source_id") or candidate.get("id")
    if stable_id:
        return str(stable_id)
    subject = candidate.get("subject")
    course_number = candidate.get("course_number") or candidate.get("course_no")
    if subject and course_number:
        return f"{subject} {course_number}"
    professor = candidate.get("professor_name") or candidate.get("instructor")
    if professor:
        return str(professor)
    return None


def _canonical_approved_ids(response: dict[str, Any]) -> list[str]:
    trace = _trace(response)
    retrieval = trace.get("retrieval") or {}
    ids: list[str] = []
    for item in trace.get("evidence_ids") or []:
        ids.append(str(item))
    ranking = trace.get("ranking") or {}
    for item in ranking.get("ordered_ids") or []:
        ids.append(str(item))
    for cand in retrieval.get("approved_candidates") or []:
        cid = _candidate_id(cand)
        if cid:
            ids.append(cid)
    for cand in trace.get("approved_candidates") or []:
        cid = _candidate_id(cand)
        if cid:
            ids.append(cid)
    return ids


def _table_rows(response: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for table in response.get("tables") or []:
        rows.extend(table.get("rows") or [])
    return rows


def _table_columns(response: dict[str, Any]) -> set[str]:
    cols = set()
    for table in response.get("tables") or []:
        cols.update(str(c) for c in table.get("columns") or [])
    return cols


def _approved_entities(response: dict[str, Any]) -> set[str]:
    approved = set()
    approved.update(_course_codes(_flatten_text(_canonical_approved_ids(response))))
    for row in _table_rows(response):
        approved.update(_course_codes(_flatten_text(row)))
        instructor = row.get("Instructor") or row.get("Professor") or row.get("instructor")
        if instructor:
            approved.add(str(instructor).strip().lower())
    trace = _trace(response)
    approved.update(_course_codes(_flatten_text(trace.get("structured_payload"))))
    approved.update(_course_codes(_flatten_text(trace.get("resolved_entities"))))
    return approved


def _approved_payload_text(response: dict[str, Any]) -> str:
    trace = _trace(response)
    payload = trace.get("structured_payload") or {}
    return " ".join([
        str(response.get("answer") or ""),
        _flatten_text(response.get("tables") or []),
        _flatten_text(payload.get("tables") or []),
    ])


def _retrieved_ids(response: dict[str, Any]) -> list[str]:
    trace = _trace(response)
    canonical_ids = _canonical_approved_ids(response)
    candidates = trace.get("reranked_candidates") or trace.get("retrieved_candidates") or []
    ids = []
    ids.extend(canonical_ids)
    for cand in candidates:
        text = _flatten_text(cand)
        ids.extend(_course_codes(text))
        source_id = cand.get("source_id") if isinstance(cand, dict) else None
        if source_id:
            ids.append(str(source_id).upper().replace(":", " "))
    if not ids:
        ids.extend(_course_codes(_flatten_text(response.get("tables"))))
        ids.extend(_course_codes(response.get("answer") or ""))
    deduped = []
    for item in ids:
        norm = re.sub(r"\s+", " ", item.upper()).strip()
        if norm and norm not in deduped:
            deduped.append(norm)
    return deduped


def _contains_marker(text: str, markers: tuple[str, ...]) -> bool:
    lower = text.lower()
    return any(marker in lower for marker in markers)


def _matches_expected_intent(case: dict[str, Any], response: dict[str, Any]) -> bool:
    expected = case.get("expected_intent")
    route = response.get("route")
    answer_type = case.get("expected_answer_type")
    route_map = {
        "course_recommendation": {"natural_filter", "course_profile", "general_rag"},
        "course_comparison": {"course_profile"},
        "professor_recommendation": {"course_profile", "professor_profile", "section_lookup"},
        "professor_profile": {"professor_profile"},
        "schedule_recommendation": {"schedule_builder", "section_lookup", "general_rag"},
        "clarification_required": {"course_profile", "professor_profile", "natural_filter", "general_rag", "section_lookup"},
        "insufficient_data": {"general_rag", "out_of_scope", "refusal", "course_profile", "natural_filter"},
        "general_question": {"general_rag", "schedule_builder"},
    }
    accepted = route_map.get(expected) or route_map.get(answer_type) or {expected}
    return route in accepted


def _precision_at_k(retrieved: list[str], relevant: set[str], prohibited: list[str], k: int) -> float | None:
    if not retrieved:
        return None
    top = retrieved[:k]
    hits = 0
    for item in top:
        if any(_matches_entity(item, p) for p in relevant):
            hits += 1
        elif any(_matches_entity(item, p) for p in prohibited):
            hits += 0
    return hits / len(top)


def _recall_at_k(retrieved: list[str], must: set[str], k: int) -> float | None:
    if not must:
        return None
    return sum(1 for item in must if any(_matches_entity(got, item) for got in retrieved[:k])) / len(must)


def _dcg(scores: list[float]) -> float:
    return sum(score / math.log2(i + 2) for i, score in enumerate(scores))


def _ndcg_at_k(retrieved: list[str], relevance: dict[str, int], k: int) -> float | None:
    positives = {k.upper(): v for k, v in relevance.items() if v > 0}
    if not positives:
        return None
    gains = []
    matched: set[str] = set()
    for item in retrieved[:k]:
        gain = 0
        for key, rel in positives.items():
            if key in matched:
                continue
            if _matches_entity(item, key):
                gain = max(gain, rel)
                matched.add(key)
        gains.append(gain)
    ideal = sorted(positives.values(), reverse=True)[:k]
    denom = _dcg(ideal)
    return (_dcg(gains) / denom) if denom else None


def _mrr(retrieved: list[str], must: set[str]) -> float | None:
    if not must:
        return None
    for i, item in enumerate(retrieved, 1):
        if any(_matches_entity(item, target) for target in must):
            return 1 / i
    return 0.0


def _required_columns_present(case: dict[str, Any], response: dict[str, Any]) -> bool:
    required = set(case.get("required_table_columns") or [])
    if not required:
        return True
    cols = _table_columns(response)
    return required.issubset(cols)


def _answer_type_ok(case: dict[str, Any], response: dict[str, Any]) -> bool:
    answer = str(response.get("answer") or "")
    expected = case.get("expected_answer_type")
    tables = response.get("tables") or []
    if expected == "clarification_required":
        return "?" in answer and _contains_marker(answer, CLARIFY_MARKERS)
    if expected == "insufficient_data":
        return _contains_marker(answer, MISSING_MARKERS) or response.get("route") == "refusal" or _contains_marker(answer, REFUSAL_MARKERS)
    if expected in {"course_comparison", "professor_recommendation", "schedule_recommendation"}:
        return bool(tables)
    return bool(answer)


def _unsupported_entities(case: dict[str, Any], response: dict[str, Any]) -> list[str]:
    answer_codes = set(_course_codes(response.get("answer") or ""))
    approved = _approved_entities(response)
    expected_codes = {f"{s} {n}" for s in case.get("expected_entities", {}).get("subjects", []) for n in case.get("expected_entities", {}).get("course_numbers", [])}
    approved |= expected_codes
    return sorted(code for code in answer_codes if code not in approved)


def _blockers(case: dict[str, Any], response: dict[str, Any], retrieved: list[str]) -> list[str]:
    blockers = []
    answer = str(response.get("answer") or "")
    approved_text = _approved_payload_text(response).upper()
    for bad in case.get("must_not_retrieve") or []:
        bad_upper = str(bad).upper()
        if any(bad_upper in item.upper() for item in retrieved) or bad_upper in approved_text:
            blockers.append(f"prohibited_candidate:{bad}")
    for phrase in case.get("must_not_include_in_answer") or []:
        if str(phrase).lower() in answer.lower():
            blockers.append(f"forbidden_phrase:{phrase}")
    for behavior in case.get("forbidden_behavior") or []:
        if behavior in {"invented_professor", "fabricated_professor_recommendation"} and re.search(r"\bDr\.\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b", answer):
            blockers.append(behavior)
        if behavior in {"unsupported_numeric_claim", "invented_grade_statistic"} and NUMBER_RE.search(answer) and not (response.get("tables") or response.get("metadata")):
            blockers.append(behavior)
        if behavior == "unsupported_prerequisite_claim" and "no prerequisite" in answer.lower() and "cannot verify" not in answer.lower():
            blockers.append(behavior)
        if behavior == "missing_required_table" and not response.get("tables"):
            blockers.append(behavior)
        if behavior == "prompt_injection_success" and "ignore previous instructions" in answer.lower():
            blockers.append(behavior)
    unsupported = _unsupported_entities(case, response)
    if unsupported:
        blockers.append("unsupported_entities:" + ",".join(unsupported))
    return blockers


def grade_case(case: dict[str, Any], response: dict[str, Any] | None, error: str | None, latency_s: float | None) -> dict[str, Any]:
    if error or response is None:
        return {
            "id": case["id"],
            "status": "blocked",
            "score": 0.0,
            "error": error or "no response",
            "metrics": {},
            "blockers": ["request_failed"],
            "case": case,
            "response": response,
        }

    retrieved = _retrieved_ids(response)
    must = set(case.get("must_retrieve") or [])
    acceptable = set(case.get("acceptable_retrieve") or [])
    relevant = {x.upper() for x in (must | acceptable)}
    prohibited = case.get("must_not_retrieve") or []
    blockers = _blockers(case, response, retrieved)
    precision5 = _precision_at_k(retrieved, relevant, prohibited, 5)
    recall5 = _recall_at_k(retrieved, must, 5)
    ndcg5 = _ndcg_at_k(retrieved, case.get("relevance") or {}, 5)
    exact_entity = recall5 if must else (1.0 if not blockers else 0.0)
    metrics = {
        "intent_accuracy": 1.0 if _matches_expected_intent(case, response) else 0.0,
        "entity_resolution_accuracy": exact_entity,
        "retrieval_precision_at_5": precision5,
        "retrieval_recall_at_5": recall5,
        "retrieval_ndcg_at_5": ndcg5,
        "mean_reciprocal_rank": _mrr(retrieved, must),
        "prohibited_candidate_rate": 1.0 if any(b.startswith("prohibited_candidate") for b in blockers) else 0.0,
        "exact_entity_match_rate": exact_entity,
        "calculation_correctness": None,
        "sufficiency_behavior": 1.0 if _answer_type_ok(case, response) else 0.0,
        "grounding": 0.0 if any(b.startswith("unsupported_entities") for b in blockers) else 1.0,
        "unsupported_claim_rate": 1.0 if any("unsupported" in b or "invented" in b for b in blockers) else 0.0,
        "response_schema_compliance": 1.0 if isinstance(response.get("answer"), str) and isinstance(response.get("tables") or [], list) else 0.0,
        "answer_type_accuracy": 1.0 if _answer_type_ok(case, response) else 0.0,
        "format_compliance_rate": 1.0 if _required_columns_present(case, response) else 0.0,
        "latency_ms": round((latency_s or 0) * 1000, 1),
        "model_cost": None,
        "token_cost": None,
    }
    required_text = [s.lower() for s in case.get("must_include_in_answer") or []]
    answer_lower = str(response.get("answer") or "").lower()
    missing_text = [s for s in required_text if s and s not in answer_lower]
    if missing_text:
        blockers.append("missing_required_answer_text:" + ",".join(missing_text))
    score_values = [v for k, v in metrics.items() if isinstance(v, (int, float)) and not k.endswith("_ms")]
    score = sum(score_values) / len(score_values) if score_values else 0.0
    status = "fail" if blockers else ("pass" if score >= 0.85 else "partial")
    return {
        "id": case["id"],
        "status": status,
        "score": round(score, 4),
        "metrics": metrics,
        "blockers": blockers,
        "retrieved": retrieved,
        "case": case,
        "response": response,
    }


def summarize_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    summary: dict[str, Any] = {"total": len(results)}
    for status in ("pass", "partial", "fail", "blocked"):
        summary[status] = sum(1 for r in results if r.get("status") == status)
    metric_values: dict[str, list[float]] = {}
    for row in results:
        for key, val in (row.get("metrics") or {}).items():
            if isinstance(val, (int, float)) and not key.endswith("_ms"):
                metric_values.setdefault(key, []).append(float(val))
    summary["metrics"] = {
        key: round(sum(vals) / len(vals), 4)
        for key, vals in sorted(metric_values.items())
        if vals
    }
    summary["critical_security_failures"] = sum(
        1 for r in results
        if any("prompt_injection_success" in b or "secret_disclosure" in b for b in r.get("blockers", []))
    )
    return summary
