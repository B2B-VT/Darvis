from __future__ import annotations

import re
from typing import Any


COURSE_RE = re.compile(r"\b([A-Z]{2,5})\s*-?\s*(\d{4})\b", re.I)
TERM_RE = re.compile(r"\b(?:Fall|Spring|Summer|Winter)\s+20\d{2}\b|\b20\d{4}\b", re.I)
GPA_RE = re.compile(r"\b[0-4]\.\d{1,2}\b")
COUNT_RE = re.compile(r"\b\d{2,5}\s+(?:students?|enrolled|sections?|reviews?)\b", re.I)

WORKLOAD_WORDS = re.compile(r"\b(workload|homework|easy workload|least work|most work|light work|heavy work)\b", re.I)
# Bare "requires?" was dropped — verified live it false-positives on ordinary
# "major requirements" advising language (e.g. a major_requirements fixture
# whose own grading criteria REQUIRES the word "requirement" in the answer),
# not just genuine hallucinated course-prerequisite claims. A fabricated
# course-to-course prerequisite chain is still caught independently by the
# unsupported_course check (the invented course code itself isn't in
# approved evidence), so this doesn't weaken real hallucination protection.
PREREQ_WORDS = re.compile(r"\b(no prerequisites?|prerequisites?|must take before)\b", re.I)
PATHWAY_WORDS = re.compile(r"\b(pathways?|concept area|pathway\s+\d)\b", re.I)
GUARANTEE_WORDS = re.compile(r"\b(guarantee|guaranteed|will get an? A|sure A|automatic A)\b", re.I)
AVAILABILITY_WORDS = re.compile(r"\b(open seats?|available seats?|currently teaches|teaches this fall|offered this fall)\b", re.I)
RANKING_WORDS = re.compile(r"\b(best|easiest|highest|lowest|strongest|hardest|top)\b", re.I)


def flatten_text(obj: Any) -> str:
    if obj is None:
        return ""
    if isinstance(obj, (str, int, float, bool)):
        return str(obj)
    if isinstance(obj, list):
        return " ".join(flatten_text(v) for v in obj)
    if isinstance(obj, dict):
        return " ".join(flatten_text(v) for v in obj.values())
    return str(obj)


def course_codes(text: str) -> set[str]:
    return {f"{m.group(1).upper()} {m.group(2)}" for m in COURSE_RE.finditer(str(text or ""))}


def professor_names_from_evidence(approved_evidence: dict[str, Any]) -> set[str]:
    names: set[str] = set()
    for cand in approved_evidence.get("approved_candidates") or []:
        for key in ("professor_name", "instructor", "name"):
            val = cand.get(key) if isinstance(cand, dict) else None
            if val:
                names.add(str(val).strip().lower())
    payload = approved_evidence.get("structured_payload") or {}
    for key in ("Instructor", "Professor", "name", "professor_name"):
        for match in re.finditer(rf"{key}\s*[:=]\s*([A-Z][A-Za-z' .-]+)", flatten_text(payload)):
            names.add(match.group(1).strip().lower())
    return {name for name in names if name}


def approved_claim_surface(approved_evidence: dict[str, Any]) -> str:
    return flatten_text(approved_evidence)


def approved_evidence_ids(approved_evidence: dict[str, Any]) -> set[str]:
    ids = set(str(v) for v in approved_evidence.get("evidence_ids") or [] if v)
    for cand in approved_evidence.get("approved_candidates") or []:
        if isinstance(cand, dict) and cand.get("stable_id"):
            ids.add(str(cand["stable_id"]))
    return ids


def _json_refs(obj: Any, key: str) -> list[Any]:
    refs = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == key:
                refs.append(v)
            refs.extend(_json_refs(v, key))
    elif isinstance(obj, list):
        for item in obj:
            refs.extend(_json_refs(item, key))
    return refs


def validate_structured_output(
    response: dict[str, Any],
    fixture: dict[str, Any],
) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    expected_answer_type = fixture.get("answer_type") or fixture.get("expected_answer_type")
    if response.get("answer_type") != expected_answer_type:
        errors.append({
            "code": "answer_type_mismatch",
            "message": f"Expected {expected_answer_type}, got {response.get('answer_type')}",
        })

    approved = fixture.get("approved_evidence") or {}
    surface = approved_claim_surface(approved)
    output_text = flatten_text(response)
    approved_courses = course_codes(surface)
    output_courses = course_codes(output_text)
    for code in sorted(output_courses - approved_courses):
        errors.append({"code": "unsupported_course", "message": code})

    allowed_ids = approved_evidence_ids(approved)
    for ref_list in _json_refs(response, "evidence_ids"):
        refs = [str(v) for v in (ref_list or [])]
        if not refs:
            errors.append({"code": "missing_evidence_id", "message": "empty evidence_ids"})
        for ref in refs:
            if ref not in allowed_ids:
                errors.append({"code": "missing_evidence_id", "message": f"unknown evidence id {ref}"})

    approved_lower = surface.lower()
    approved_professors = professor_names_from_evidence(approved)
    for name in _json_refs(response, "name"):
        name_l = str(name or "").strip().lower()
        if name_l and approved_professors and name_l not in approved_professors:
            errors.append({"code": "unsupported_professor", "message": str(name)})

    for term in TERM_RE.findall(output_text):
        if str(term).lower() not in approved_lower:
            errors.append({"code": "unsupported_term", "message": str(term)})

    for gpa in GPA_RE.findall(output_text):
        if gpa not in surface:
            errors.append({"code": "unsupported_numeric_claim", "message": gpa})

    for count in COUNT_RE.findall(output_text):
        if str(count).lower() not in approved_lower:
            errors.append({"code": "unsupported_numeric_claim", "message": str(count)})

    checks = [
        (PREREQ_WORDS, "unsupported_prerequisite"),
        (WORKLOAD_WORDS, "unsupported_workload"),
        (AVAILABILITY_WORDS, "unsupported_availability"),
        (PATHWAY_WORDS, "unsupported_pathway"),
        (GUARANTEE_WORDS, "unsupported_guarantee"),
    ]
    for pattern, code in checks:
        for match in pattern.findall(output_text):
            if str(match).lower() not in approved_lower:
                errors.append({"code": code, "message": str(match)})

    if RANKING_WORDS.search(output_text) and not any(
        word in approved_lower for word in ("avg gpa", "a range", "f rate", "rating", "student", "section", "rank")
    ):
        errors.append({"code": "unsupported_ranking_claim", "message": "ranking claim lacks approved ranking evidence"})

    if expected_answer_type in {"clarification_required", "insufficient_data", "refusal"}:
        normal_fields = {"recommendations", "professors", "courses", "sections", "requirements"}
        for field in normal_fields:
            if response.get(field):
                errors.append({
                    "code": "answer_type_mismatch",
                    "message": f"{expected_answer_type} cannot include {field}",
                })

    return errors
