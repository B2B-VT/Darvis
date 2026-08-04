from __future__ import annotations

import json
import re
from typing import Any

from pydantic import ValidationError

from app.config import get_settings
from app.generation.schemas import parse_structured_response
from app.generation.validator import flatten_text, validate_structured_output
from app.rag.gemma_client import GemmaAnswerClient


SUPPORTED_ANSWER_TYPES = {
    "course_recommendation",
    "course_comparison",
    "professor_recommendation",
    "professor_profile",
    "current_schedule",
    "schedule_recommendation",
    "major_requirements",
    "clarification_required",
    "insufficient_data",
    "refusal",
}


class StructuredGenerationAdapter:
    def __init__(self, llm: GemmaAnswerClient | None = None):
        self._llm = llm or GemmaAnswerClient(max_retries=0)
        self._settings = get_settings()

    def generate(self, fixture: dict[str, Any]) -> dict[str, Any]:
        adapter_input = self._normalize_fixture(fixture)
        if hasattr(self._llm, "reset_call_history"):
            self._llm.reset_call_history()

        first = self._attempt(adapter_input)
        if first["validation"]["valid"]:
            return first

        repair_result = self._attempt(
            adapter_input,
            validation_errors=first["validation"]["errors"],
        )
        if repair_result["validation"]["valid"]:
            repair_result["repair"] = {
                "repair_attempted": True,
                "repair_succeeded": True,
                "validation_errors": first["validation"]["errors"],
            }
            return repair_result

        fallback = self._safe_fallback(adapter_input)
        fallback["provider_metadata"] = self._provider_metadata()
        fallback["validation"] = {
            "valid": True,
            "errors": [],
            "safe_fallback": True,
        }
        fallback["repair"] = {
            "repair_attempted": True,
            "repair_succeeded": False,
            "validation_errors": first["validation"]["errors"] + repair_result["validation"]["errors"],
        }
        return fallback

    def _normalize_fixture(self, fixture: dict[str, Any]) -> dict[str, Any]:
        answer_type = fixture.get("answer_type") or fixture.get("expected_answer_type")
        if answer_type not in SUPPORTED_ANSWER_TYPES:
            answer_type = "insufficient_data"
        approved = fixture.get("approved_evidence") or {}
        evidence_ids = list(approved.get("evidence_ids") or fixture.get("evidence_ids") or [])
        if not evidence_ids:
            evidence_ids = [
                str(c.get("stable_id"))
                for c in approved.get("approved_candidates") or []
                if isinstance(c, dict) and c.get("stable_id")
            ]
        sufficiency = fixture.get("sufficiency") or {}
        return {
            "query": fixture.get("query") or "",
            "user_profile": fixture.get("user_profile") or {},
            "answer_type": answer_type,
            "resolved_entities": fixture.get("resolved_entities") or {},
            "approved_evidence": {
                **approved,
                "evidence_ids": evidence_ids,
            },
            "evidence_ids": evidence_ids,
            "sufficiency": sufficiency,
            "required_fields": fixture.get("required_fields") or [],
            "forbidden_claims": fixture.get("forbidden_claims") or [],
        }

    def _attempt(self, adapter_input: dict[str, Any], validation_errors: list[dict[str, str]] | None = None) -> dict[str, Any]:
        prompt = self._build_prompt(adapter_input, validation_errors=validation_errors)
        raw = self._llm.answer_raw(prompt, max_tokens=900)
        provider_metadata = self._provider_metadata()
        parsed, parse_errors = self._parse_json(raw)
        validation = self._validate(parsed, adapter_input, parse_errors)
        return {
            "response": parsed,
            "provider_metadata": provider_metadata,
            "validation": validation,
            "repair": {
                "repair_attempted": bool(validation_errors),
                "repair_succeeded": False,
                "validation_errors": validation_errors or [],
            },
            "raw_model_output": raw,
        }

    def _provider_metadata(self) -> dict[str, Any]:
        calls = self._llm.call_history() if hasattr(self._llm, "call_history") else []
        return {
            "provider": calls[0].get("provider") if calls else "groq",
            "model": calls[0].get("model") if calls else self._settings.groq_model,
            "attempt_count": sum(int(c.get("attempt_count") or 0) for c in calls),
            "fallback_used": any(bool(c.get("fallback_used")) for c in calls),
            "fallback_reason": next((c.get("fallback_reason") for c in calls if c.get("fallback_reason")), None),
            "rate_limited": any(bool(c.get("rate_limited")) for c in calls),
            "timeout": any(bool(c.get("timeout")) for c in calls),
            "latency_ms": round(sum(float(c.get("latency_ms") or 0) for c in calls), 1),
            "input_tokens": sum(int(c.get("input_tokens") or 0) for c in calls) if calls else None,
            "output_tokens": sum(int(c.get("output_tokens") or 0) for c in calls) if calls else None,
            "calls": calls,
        }

    def _build_prompt(self, adapter_input: dict[str, Any], validation_errors: list[dict[str, str]] | None = None) -> str:
        prompt = {
            "task": "Return only JSON matching the selected answer_type schema.",
            "rules": [
                "Use only approved_evidence.",
                "Do not add courses.",
                "Do not add professors.",
                "Do not add terms.",
                "Do not add prerequisites.",
                "Do not add statistics.",
                "Do not infer workload.",
                "Do not infer availability.",
                "Do not promise grades or outcomes.",
                "Preserve the selected answer_type.",
                "Include evidence_ids for factual recommendation items.",
                "State limitations when evidence is incomplete.",
                "Avoid filler introductions.",
            ],
            "schema_hint": self._schema_hint(adapter_input["answer_type"]),
            "input": adapter_input,
        }
        if validation_errors:
            prompt["repair"] = {
                "validation_errors": validation_errors,
                "instruction": "Remove unsupported claims and return valid JSON for the original answer_type only.",
            }
        return json.dumps(prompt, indent=2, ensure_ascii=False)

    def _schema_hint(self, answer_type: str) -> dict[str, Any]:
        examples = {
            "course_recommendation": {
                "answer_type": "course_recommendation",
                "summary": "",
                "recommendations": [
                    {
                        "course": "",
                        "title": "",
                        "reason": "",
                        "description": "",
                        "evidence_ids": [],
                        "limitations": [],
                    }
                ],
                "limitations": [],
            },
            "course_comparison": {
                "answer_type": "course_comparison",
                "summary": "",
                "courses": [{"course": "", "title": "", "description": "", "evidence_ids": []}],
                "comparison": [],
                "limitations": [],
            },
            "professor_recommendation": {
                "answer_type": "professor_recommendation",
                "summary": "",
                "professors": [
                    {
                        "name": "",
                        "reason": "",
                        "avg_gpa": None,
                        "student_count": None,
                        "section_count": None,
                        "evidence_ids": [],
                        "limitations": [],
                    }
                ],
                "limitations": [],
            },
            "professor_profile": {
                "answer_type": "professor_profile",
                "summary": "",
                "name": "",
                "evidence_ids": [],
                "courses": [],
                "avg_gpa": None,
                "student_count": None,
                "rating": None,
                "difficulty": None,
                "limitations": [],
            },
            "current_schedule": {
                "answer_type": "current_schedule",
                "summary": "",
                "sections": [],
                "limitations": [],
            },
            "schedule_recommendation": {
                "answer_type": "schedule_recommendation",
                "summary": "",
                "sections": [],
                "limitations": [],
            },
            "major_requirements": {
                "answer_type": "major_requirements",
                "summary": "",
                "requirements": [],
                "limitations": [],
            },
            "clarification_required": {
                "answer_type": "clarification_required",
                "question": "",
                "options": [],
                "reason": "",
            },
            "insufficient_data": {
                "answer_type": "insufficient_data",
                "message": "",
                "missing_fields": [],
                "available_evidence": [],
                "next_question": None,
            },
            "refusal": {
                "answer_type": "refusal",
                "message": "",
                "reason": "",
            },
        }
        return examples.get(answer_type, examples["insufficient_data"])

    def _parse_json(self, raw: str | None) -> tuple[dict[str, Any], list[dict[str, str]]]:
        if not raw:
            return {}, [{"code": "malformed_json", "message": "empty model output"}]
        text = raw.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?", "", text, flags=re.I).strip()
            text = re.sub(r"```$", "", text).strip()
        try:
            parsed = json.loads(text)
            if not isinstance(parsed, dict):
                return {}, [{"code": "malformed_json", "message": "top-level JSON must be an object"}]
            return parsed, []
        except json.JSONDecodeError as exc:
            return {}, [{"code": "malformed_json", "message": str(exc)}]

    def _validate(
        self,
        response: dict[str, Any],
        adapter_input: dict[str, Any],
        parse_errors: list[dict[str, str]],
    ) -> dict[str, Any]:
        errors = list(parse_errors)
        if not errors:
            try:
                parse_structured_response(response, adapter_input["answer_type"])
            except (ValidationError, ValueError) as exc:
                errors.append({"code": "schema_error", "message": str(exc)})
            errors.extend(validate_structured_output(response, adapter_input))
        return {"valid": not errors, "errors": errors}

    def _safe_fallback(self, adapter_input: dict[str, Any]) -> dict[str, Any]:
        answer_type = adapter_input["answer_type"]
        evidence_ids = adapter_input.get("evidence_ids") or []
        missing_fields = list(adapter_input.get("sufficiency", {}).get("missing_fields") or adapter_input.get("required_fields") or [])
        if answer_type == "clarification_required":
            response = {
                "answer_type": "clarification_required",
                "question": "Which specific course, professor, or requirement should Cyrus use?",
                "options": self._verified_options(adapter_input),
                "reason": "The approved evidence is not specific enough to answer confidently.",
            }
        elif answer_type == "refusal":
            response = {
                "answer_type": "refusal",
                "message": "I can't answer that from the approved Cyrus evidence.",
                "reason": "The request is outside the allowed evidence or policy.",
            }
        else:
            response = {
                "answer_type": "insufficient_data",
                "message": "Cyrus does not have enough approved evidence to answer this without guessing.",
                "missing_fields": missing_fields,
                "available_evidence": evidence_ids,
                "next_question": None,
            }
        return {"response": response}

    def _verified_options(self, adapter_input: dict[str, Any]) -> list[str]:
        out = []
        for cand in (adapter_input.get("approved_evidence") or {}).get("approved_candidates") or []:
            if not isinstance(cand, dict):
                continue
            if cand.get("professor_name"):
                out.append(str(cand["professor_name"]))
            elif cand.get("subject") and cand.get("course_number"):
                out.append(f"{cand['subject']} {cand['course_number']}")
            elif cand.get("stable_id"):
                out.append(str(cand["stable_id"]))
        return out[:6]


def render_structured_response(response: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    answer_type = response.get("answer_type")
    if answer_type == "course_recommendation":
        parts = [response.get("summary") or ""]
        for item in response.get("recommendations") or []:
            label = " ".join(v for v in [item.get("course"), item.get("title")] if v)
            reason = item.get("reason") or ""
            desc = item.get("description") or ""
            parts.append(f"{label}: {reason} {desc}".strip())
        tables = [{
            "title": "Course Recommendations",
            "columns": ["Course", "Course Title", "Reason"],
            "rows": [
                {"Course": i.get("course"), "Course Title": i.get("title"), "Reason": i.get("reason")}
                for i in response.get("recommendations") or []
            ],
        }]
        return "\n\n".join(p for p in parts if p), tables
    if answer_type == "course_comparison":
        tables = [{
            "title": "Course Comparison",
            "columns": sorted({k for row in response.get("comparison") or [] for k in row.keys()}),
            "rows": response.get("comparison") or [],
        }]
        return response.get("summary") or "", tables
    if answer_type == "professor_recommendation":
        tables = [{
            "title": "Professor Recommendations",
            "columns": ["Professor", "Avg GPA", "Total Students", "Sections", "Reason"],
            "rows": [
                {
                    "Professor": i.get("name"),
                    "Avg GPA": i.get("avg_gpa"),
                    "Total Students": i.get("student_count"),
                    "Sections": i.get("section_count"),
                    "Reason": i.get("reason"),
                }
                for i in response.get("professors") or []
            ],
        }]
        return response.get("summary") or "", tables
    if answer_type == "professor_profile":
        return response.get("summary") or "", []
    if answer_type in {"current_schedule", "schedule_recommendation"}:
        tables = [{
            "title": "Current Schedule",
            "columns": ["Course", "Instructor", "Term", "Days", "Start", "End", "Open Seats"],
            "rows": [
                {
                    "Course": i.get("course"),
                    "Instructor": i.get("instructor"),
                    "Term": i.get("term"),
                    "Days": i.get("days"),
                    "Start": i.get("start_time"),
                    "End": i.get("end_time"),
                    "Open Seats": i.get("open_seats"),
                }
                for i in response.get("sections") or []
            ],
        }]
        return response.get("summary") or "", tables
    if answer_type == "major_requirements":
        tables = [{
            "title": "Major Requirements",
            "columns": ["Course", "Course Title", "Requirement Group", "Reason"],
            "rows": [
                {
                    "Course": i.get("course"),
                    "Course Title": i.get("title"),
                    "Requirement Group": i.get("requirement_group"),
                    "Reason": i.get("reason"),
                }
                for i in response.get("requirements") or []
            ],
        }]
        return response.get("summary") or "", tables
    if answer_type == "clarification_required":
        return response.get("question") or "", []
    if answer_type == "insufficient_data":
        return response.get("message") or "", []
    if answer_type == "refusal":
        return response.get("message") or "", []
    return flatten_text(response), []
