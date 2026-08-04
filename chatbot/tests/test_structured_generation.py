import json

import pytest
from pydantic import ValidationError

from app.generation.model_types import GenerationResult
from app.generation.schemas import CourseRecommendationResponse, parse_structured_response
from app.generation.structured_generator import StructuredGenerationAdapter
from app.generation.validator import validate_structured_output


class FakeGenerationClient:
    """Implements the GenerationClient protocol for tests."""

    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.history = []

    def reset_call_history(self):
        self.history = []

    def call_history(self):
        return list(self.history)

    def generate_json(self, *, prompt, model, max_tokens, reasoning_effort=None):
        self.history.append({
            "provider": "fake",
            "model": "fake-model",
            "attempt_count": 1,
            "fallback_used": False,
            "fallback_reason": None,
            "rate_limited": False,
            "timeout": False,
            "latency_ms": 1,
            "input_tokens": None,
            "output_tokens": None,
        })
        raw = self.outputs.pop(0) if self.outputs else None
        return GenerationResult(
            raw_text=raw,
            provider="fake",
            model="fake-model",
            input_tokens=None,
            output_tokens=None,
            latency_ms=1,
        )


def fixture(answer_type="course_recommendation"):
    return {
        "case_id": "case_1",
        "query": "What AI class should I take?",
        "user_profile": {"major": "Computer Science"},
        "expected_answer_type": answer_type,
        "resolved_entities": {},
        "approved_evidence": {
            "evidence_ids": ["COURSE:CS 4824"],
            "approved_candidates": [
                {
                    "stable_id": "COURSE:CS 4824",
                    "entity_type": "course",
                    "subject": "CS",
                    "course_number": "4824",
                    "source": "fixture",
                    "approval_status": "approved",
                }
            ],
            "structured_payload": {
                "course": "CS 4824",
                "title": "Machine Learning",
            },
        },
        "sufficiency": {"passed": True, "status": "sufficient", "reasons": []},
        "required_fields": [],
        "forbidden_claims": [],
    }


def test_valid_course_recommendation_schema():
    obj = CourseRecommendationResponse.model_validate({
        "answer_type": "course_recommendation",
        "summary": "Take CS 4824 for machine learning.",
        "recommendations": [{
            "course": "CS 4824",
            "title": "Machine Learning",
            "reason": "It is the approved ML course.",
            "description": "Machine learning.",
            "evidence_ids": ["COURSE:CS 4824"],
            "limitations": [],
        }],
        "limitations": [],
    })
    assert obj.answer_type == "course_recommendation"


def test_schema_rejects_extra_fields():
    with pytest.raises(ValidationError):
        CourseRecommendationResponse.model_validate({
            "answer_type": "course_recommendation",
            "summary": "x",
            "recommendations": [],
            "limitations": [],
            "extra": "not allowed",
        })


def test_wrong_answer_type_rejected():
    with pytest.raises(ValueError, match="answer_type_mismatch"):
        parse_structured_response({"answer_type": "professor_recommendation", "summary": "", "professors": [], "limitations": []}, "course_recommendation")


def test_missing_evidence_ids_rejected():
    with pytest.raises(ValidationError):
        CourseRecommendationResponse.model_validate({
            "answer_type": "course_recommendation",
            "summary": "x",
            "recommendations": [{
                "course": "CS 4824",
                "title": "Machine Learning",
                "reason": "x",
                "description": "x",
                "evidence_ids": [],
                "limitations": [],
            }],
            "limitations": [],
        })


@pytest.mark.parametrize("response,code", [
    ({"answer_type": "course_recommendation", "summary": "Take CS 9999", "recommendations": [], "limitations": []}, "unsupported_course"),
    ({"answer_type": "course_recommendation", "summary": "Offered Fall 2028", "recommendations": [], "limitations": []}, "unsupported_term"),
    ({"answer_type": "course_recommendation", "summary": "Avg GPA is 3.99", "recommendations": [], "limitations": []}, "unsupported_numeric_claim"),
    ({"answer_type": "course_recommendation", "summary": "No prerequisites", "recommendations": [], "limitations": []}, "unsupported_prerequisite"),
    ({"answer_type": "course_recommendation", "summary": "Light workload", "recommendations": [], "limitations": []}, "unsupported_workload"),
    ({"answer_type": "course_recommendation", "summary": "Pathways 2", "recommendations": [], "limitations": []}, "unsupported_pathway"),
    ({"answer_type": "course_recommendation", "summary": "Guaranteed A", "recommendations": [], "limitations": []}, "unsupported_guarantee"),
    ({"answer_type": "course_recommendation", "summary": "Currently teaches it", "recommendations": [], "limitations": []}, "unsupported_availability"),
])
def test_unsupported_claim_validator(response, code):
    errors = validate_structured_output(response, fixture())
    assert code in {e["code"] for e in errors}


def test_clarification_cannot_return_recommendation():
    f = fixture(answer_type="clarification_required")
    response = {
        "answer_type": "clarification_required",
        "question": "Which course?",
        "options": [],
        "reason": "ambiguous",
        "recommendations": [{"course": "CS 4824"}],
    }
    errors = validate_structured_output(response, f)
    assert "answer_type_mismatch" in {e["code"] for e in errors}


def test_successful_repair():
    bad = json.dumps({
        "answer_type": "course_recommendation",
        "summary": "Take CS 9999",
        "recommendations": [],
        "limitations": [],
    })
    good = json.dumps({
        "answer_type": "course_recommendation",
        "summary": "Take CS 4824.",
        "recommendations": [{
            "course": "CS 4824",
            "title": "Machine Learning",
            "reason": "It is in the approved evidence.",
            "description": "",
            "evidence_ids": ["COURSE:CS 4824"],
            "limitations": [],
        }],
        "limitations": [],
    })
    adapter = StructuredGenerationAdapter(FakeGenerationClient([bad, good]))
    result = adapter.generate(fixture())
    assert result["validation"]["valid"]
    assert result["repair"]["repair_attempted"]
    assert result["repair"]["repair_succeeded"]


def test_failed_repair_uses_safe_fallback_and_only_two_calls():
    bad = "{not json"
    adapter = StructuredGenerationAdapter(FakeGenerationClient([bad, bad, bad]))
    result = adapter.generate(fixture())
    assert result["validation"]["valid"]
    assert result["validation"]["safe_fallback"]
    assert result["repair"]["repair_attempted"]
    assert not result["repair"]["repair_succeeded"]
    assert len(result["provider_metadata"]["calls"]) == 2
