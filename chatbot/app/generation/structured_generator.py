from __future__ import annotations

import json
import re
from typing import Any

from pydantic import ValidationError

from app.config import get_settings
from app.generation.model_router import RoutingSignals, route, signals_from_adapter_input
from app.generation.model_types import GenerationResult, ModelTier, RoutingDecision, next_tier
from app.generation.providers import (
    GemmaClientAdapter,
    GenerationClient,
    MissingModelConfigurationError,
    OpenAIModelClient,
    resolve_model_config,
)
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

# answer_type -> field name that carries the direct, human-facing answer.
# Used by the Phase 10 quality gate to reject filler-only responses.
_DIRECT_ANSWER_FIELD = {
    "course_recommendation": "summary",
    "course_comparison": "summary",
    "professor_recommendation": "summary",
    "professor_profile": "summary",
    "current_schedule": "summary",
    "schedule_recommendation": "summary",
    "major_requirements": "summary",
    "clarification_required": "question",
    "insufficient_data": "message",
    "refusal": "message",
}


class StructuredGenerationAdapter:
    def __init__(
        self,
        client: GenerationClient | None = None,
        *,
        forced_tier: ModelTier | None = None,
        use_router: bool = False,
        escalation_enabled: bool = True,
        strict_eval: bool = False,
    ):
        # Provider-agnostic: any GenerationClient works. An explicitly passed
        # client is honored for BOTH the legacy and tiered paths (this is
        # what makes forced-tier/router evaluation testable with a fake
        # client, with no live API key required). When none is passed, each
        # path lazily builds its own appropriate default the first time it's
        # actually used.
        self._explicit_client: GenerationClient | None = client
        self._settings = get_settings()
        self._forced_tier = forced_tier
        self._use_router = use_router
        self._escalation_enabled = escalation_enabled
        self._strict_eval = strict_eval
        self._max_escalations = self._settings.cyrus_model_max_escalations
        self._openai_client: OpenAIModelClient | None = None
        self._legacy_client: GenerationClient | None = None

    # ── Public API ────────────────────────────────────────────────────────────

    def generate(self, fixture: dict[str, Any]) -> dict[str, Any]:
        adapter_input = self._normalize_fixture(fixture)
        tiered = self._forced_tier is not None or self._use_router
        client = self._get_tiered_client() if tiered else self._get_legacy_client()
        if hasattr(client, "reset_call_history"):
            client.reset_call_history()

        if not tiered:
            return self._generate_legacy(adapter_input, client)
        return self._generate_tiered(adapter_input, client)

    def _get_legacy_client(self) -> GenerationClient:
        if self._explicit_client is not None:
            return self._explicit_client
        if self._legacy_client is None:
            self._legacy_client = GemmaClientAdapter(GemmaAnswerClient(max_retries=0))
        return self._legacy_client

    def _get_tiered_client(self) -> GenerationClient:
        if self._explicit_client is not None:
            return self._explicit_client
        if self._openai_client is None:
            if not self._settings.openai_api_key:
                raise MissingModelConfigurationError(
                    "OPENAI_API_KEY is not configured; cannot run tiered/model-router generation."
                )
            self._openai_client = OpenAIModelClient(self._settings.openai_api_key, strict=self._strict_eval)
        return self._openai_client

    # ── Legacy single-client path (unchanged behavior) ──────────────────────────

    def _generate_legacy(self, adapter_input: dict[str, Any], client: GenerationClient) -> dict[str, Any]:
        model = self._settings.groq_model
        first = self._generate_and_validate(client, model, None, adapter_input)
        if first["valid"]:
            return self._package_legacy(client, first, repair_attempted=False, repair_succeeded=False, prior_errors=[])

        repair = self._generate_and_validate(
            client, model, None, adapter_input, validation_errors=first["validation_errors"],
        )
        if repair["valid"]:
            return self._package_legacy(
                client, repair, repair_attempted=True, repair_succeeded=True, prior_errors=first["validation_errors"],
            )

        fallback_response = self._safe_fallback(adapter_input)
        fallback_response["provider_metadata"] = self._legacy_provider_metadata(client)
        fallback_response["validation"] = {"valid": True, "errors": [], "safe_fallback": True}
        fallback_response["repair"] = {
            "repair_attempted": True,
            "repair_succeeded": False,
            "validation_errors": first["validation_errors"] + repair["validation_errors"],
        }
        return fallback_response

    def _package_legacy(
        self,
        client: GenerationClient,
        call: dict[str, Any],
        *,
        repair_attempted: bool,
        repair_succeeded: bool,
        prior_errors: list[dict[str, str]],
    ) -> dict[str, Any]:
        return {
            "response": call["response"],
            "provider_metadata": self._legacy_provider_metadata(client),
            "validation": {"valid": True, "errors": []},
            "repair": {
                "repair_attempted": repair_attempted,
                "repair_succeeded": repair_succeeded,
                "validation_errors": prior_errors,
            },
            "raw_model_output": call["raw_model_output"],
        }

    def _legacy_provider_metadata(self, client: GenerationClient) -> dict[str, Any]:
        calls = client.call_history() if hasattr(client, "call_history") else []
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

    # ── Tiered (Luna/Terra/Sol) path ─────────────────────────────────────────

    def _determine_routing(self, adapter_input: dict[str, Any]) -> RoutingDecision:
        if self._forced_tier is not None:
            model_id = {
                ModelTier.LUNA: self._settings.openai_luna_model,
                ModelTier.TERRA: self._settings.openai_terra_model,
                ModelTier.SOL: self._settings.openai_sol_model,
            }[self._forced_tier]
            return RoutingDecision(
                selected_tier=self._forced_tier,
                selected_model=model_id,
                routing_reason="forced_by_eval_cli",
                signals={},
                escalation_allowed=self._escalation_enabled,
            )
        signals = signals_from_adapter_input(adapter_input)
        return route(signals, self._settings)

    def _generate_tiered(self, adapter_input: dict[str, Any], client: GenerationClient) -> dict[str, Any]:
        routing_decision = self._determine_routing(adapter_input)

        tier = routing_decision.selected_tier
        escalation_enabled = self._escalation_enabled and routing_decision.escalation_allowed
        attempts: list[dict[str, Any]] = []
        escalation_count = 0
        escalation_reason: str | None = None
        final_attempt: dict[str, Any] | None = None
        prior_context: dict[str, Any] | None = None

        while True:
            model_config = resolve_model_config(tier, self._settings)
            calls = [self._generate_and_validate(
                client, model_config.model_id, model_config.reasoning_effort, adapter_input, prior_context=prior_context,
            )]
            if not calls[0]["valid"]:
                calls.append(self._generate_and_validate(
                    client, model_config.model_id, model_config.reasoning_effort, adapter_input,
                    validation_errors=calls[0]["validation_errors"], prior_context=prior_context,
                ))
            attempt = self._finalize_tier_attempt(
                tier, model_config, calls,
                repair_attempted=len(calls) > 1,
                repair_succeeded=len(calls) > 1 and calls[-1]["valid"],
            )
            attempts.append(attempt)

            if attempt["valid"]:
                final_attempt = attempt
                break

            nxt = next_tier(tier)
            # Escalation never runs only because a tier was slow, and never
            # reruns retrieval/planner/resolver/vector-store — this loop only
            # ever calls the generation client again with the SAME immutable
            # adapter_input plus additive prior-attempt context.
            if not escalation_enabled or nxt is None or escalation_count >= self._max_escalations:
                break
            escalation_reason = attempt["validation_errors"][0] if attempt["validation_errors"] else "validation_failed"
            prior_context = {
                "prior_tier": tier.value,
                "prior_model": model_config.model_id,
                "prior_errors": attempt["validation_errors"],
                "repair_instruction": (
                    "A weaker model's attempt failed validation. Fix these issues and "
                    "return valid JSON for the original answer_type only."
                ),
            }
            tier = nxt
            escalation_count += 1

        fallback_used = final_attempt is None
        response = self._safe_fallback(adapter_input)["response"] if fallback_used else final_attempt["_response"]

        cost = self._aggregate_cost(attempts)
        final_tier = final_attempt["tier"] if final_attempt else attempts[-1]["tier"]
        final_model = final_attempt["model"] if final_attempt else attempts[-1]["model"]
        repair_attempted_any = any(a["repair_attempted"] for a in attempts)
        repair_succeeded_any = any(a["repair_succeeded"] for a in attempts)

        return {
            "response": response,
            "provider_metadata": {
                "provider": "openai",
                "model": final_model,
                "attempt_count": sum(2 if a["repair_attempted"] else 1 for a in attempts),
                "fallback_used": fallback_used,
                "fallback_reason": escalation_reason if fallback_used else None,
                "rate_limited": any(a["rate_limited"] for a in attempts),
                "timeout": any(a["timeout"] for a in attempts),
                "latency_ms": round(sum(a["latency_ms"] for a in attempts), 1),
                "input_tokens": cost["total_input_tokens"] or None,
                "output_tokens": cost["total_output_tokens"] or None,
                "calls": client.call_history(),
            },
            "validation": {"valid": True, "errors": [], "safe_fallback": fallback_used},
            "repair": {
                "repair_attempted": repair_attempted_any,
                "repair_succeeded": repair_succeeded_any,
                "validation_errors": attempts[-1]["validation_errors"] if attempts else [],
            },
            "routing": {
                "selected_tier": routing_decision.selected_tier.value,
                "selected_model": routing_decision.selected_model,
                "routing_reason": routing_decision.routing_reason,
                "signals": routing_decision.signals,
                "escalation_allowed": routing_decision.escalation_allowed,
            },
            "attempts": [{k: v for k, v in a.items() if not k.startswith("_")} for a in attempts],
            "escalation": {
                "attempted": escalation_count > 0,
                "count": escalation_count,
                "from_tier": routing_decision.selected_tier.value,
                "to_tier": attempts[1]["tier"] if len(attempts) > 1 else None,
                "reason": escalation_reason,
                "final_tier": final_tier,
                "final_model": final_model,
            },
            "cost": cost,
        }

    def _finalize_tier_attempt(
        self, tier: ModelTier, model_config, calls: list[dict[str, Any]], *, repair_attempted: bool, repair_succeeded: bool,
    ) -> dict[str, Any]:
        last = calls[-1]
        input_tokens = sum(c["input_tokens"] or 0 for c in calls) or None
        output_tokens = sum(c["output_tokens"] or 0 for c in calls) or None
        latency_ms = sum(c["latency_ms"] or 0 for c in calls)
        cost = model_config.estimated_cost_usd(input_tokens, output_tokens)
        return {
            "tier": tier.value,
            "model": model_config.model_id,
            "valid": last["valid"],
            "validation_errors": [e["code"] for e in last["validation_errors"]],
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "estimated_cost_usd": round(cost, 6),
            "latency_ms": round(latency_ms, 1),
            "rate_limited": any(c["rate_limited"] for c in calls),
            "timeout": any(c["timeout"] for c in calls),
            "repair_attempted": repair_attempted,
            "repair_succeeded": repair_succeeded,
            "_response": last["response"],
            "_raw_model_output": last["raw_model_output"],
        }

    def _aggregate_cost(self, attempts: list[dict[str, Any]]) -> dict[str, Any]:
        by_tier: dict[str, dict[str, Any]] = {}
        for a in attempts:
            bucket = by_tier.setdefault(a["tier"], {"input_tokens": 0, "output_tokens": 0, "estimated_cost_usd": 0.0})
            bucket["input_tokens"] += a["input_tokens"] or 0
            bucket["output_tokens"] += a["output_tokens"] or 0
            bucket["estimated_cost_usd"] = round(bucket["estimated_cost_usd"] + a["estimated_cost_usd"], 6)
        return {
            "total_input_tokens": sum(a["input_tokens"] or 0 for a in attempts),
            "total_output_tokens": sum(a["output_tokens"] or 0 for a in attempts),
            "total_estimated_cost_usd": round(sum(a["estimated_cost_usd"] for a in attempts), 6),
            "by_tier": by_tier,
        }

    # ── Shared generate+validate primitive ──────────────────────────────────────

    def _generate_and_validate(
        self,
        client: GenerationClient,
        model: str,
        reasoning_effort: str | None,
        adapter_input: dict[str, Any],
        validation_errors: list[dict[str, str]] | None = None,
        prior_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        prompt = self._build_prompt(adapter_input, validation_errors=validation_errors, prior_context=prior_context)
        result: GenerationResult = client.generate_json(
            prompt=prompt, model=model, max_tokens=900, reasoning_effort=reasoning_effort,
        )
        parsed, parse_errors = self._parse_json(result.raw_text)
        validation = self._validate(parsed, adapter_input, parse_errors)
        return {
            "valid": validation["valid"],
            "validation_errors": validation["errors"],
            "response": parsed,
            "raw_model_output": result.raw_text,
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens,
            "latency_ms": result.latency_ms,
            "rate_limited": result.rate_limited,
            "timeout": result.timeout,
        }

    # ── Fixture normalization (immutable adapter input) ─────────────────────────

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
            # Routing-signal-only fields — additive, never mutated after this
            # point, read only by model_router.signals_from_adapter_input.
            "constraint_count": fixture.get("constraint_count") or 0,
            "requires_current_vs_historical": bool(fixture.get("requires_current_vs_historical")),
            "graduation_planning": bool(fixture.get("graduation_planning")),
            "multi_semester_planning": bool(fixture.get("multi_semester_planning")),
            "high_academic_consequence": bool(fixture.get("high_academic_consequence")),
        }

    # ── Prompting ────────────────────────────────────────────────────────────

    def _build_prompt(
        self,
        adapter_input: dict[str, Any],
        validation_errors: list[dict[str, str]] | None = None,
        prior_context: dict[str, Any] | None = None,
    ) -> str:
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
                "Give a direct, substantive answer — never a filler-only response.",
            ],
            "schema_hint": self._schema_hint(adapter_input["answer_type"]),
            "input": adapter_input,
        }
        if validation_errors:
            prompt["repair"] = {
                "validation_errors": validation_errors,
                "instruction": "Remove unsupported claims and return valid JSON for the original answer_type only.",
            }
        if prior_context:
            # Escalation context only — never modifies adapter_input, answer
            # type, approved evidence, or sufficiency; purely informational.
            prompt["escalation_context"] = prior_context
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

    # ── Validation (schema + unsupported-claim + Phase 10 quality gates) ────────

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
            # Quality gates layer on top of an otherwise schema/claim-valid
            # response — a valid schema with missing substantive content may
            # still fail here and become eligible for repair/escalation.
            if not errors:
                errors.extend(self._quality_gate_errors(response, adapter_input))
        return {"valid": not errors, "errors": errors}

    def _quality_gate_errors(self, response: dict[str, Any], adapter_input: dict[str, Any]) -> list[dict[str, str]]:
        errors: list[dict[str, str]] = []
        answer_type = adapter_input["answer_type"]

        for field_name in adapter_input.get("required_fields") or []:
            if not response.get(field_name):
                errors.append({"code": "missing_required_field", "message": field_name})

        direct_field = _DIRECT_ANSWER_FIELD.get(answer_type)
        if direct_field:
            text = str(response.get(direct_field) or "").strip()
            if len(text) < 8:
                errors.append({"code": "missing_direct_answer", "message": "response has no substantive direct answer"})

        if answer_type == "course_comparison":
            courses = response.get("courses") or []
            requested = (adapter_input.get("approved_evidence") or {}).get("approved_candidates") or []
            requested_course_count = sum(
                1 for c in requested if isinstance(c, dict) and c.get("entity_type") == "course"
            )
            if requested_course_count and len(courses) < requested_course_count:
                errors.append({
                    "code": "incomplete_comparison",
                    "message": f"expected {requested_course_count} compared course(s), got {len(courses)}",
                })

        if answer_type == "professor_profile":
            payload_text = flatten_text((adapter_input.get("approved_evidence") or {}).get("structured_payload") or {})
            if "student_count" in payload_text or re.search(r"\b\d{2,5}\s+students?\b", payload_text, re.I):
                if response.get("student_count") is None:
                    errors.append({
                        "code": "missing_sample_size_caveat",
                        "message": "professor_profile omits available student_count",
                    })

        return errors

    # ── Deterministic safe fallback ──────────────────────────────────────────

    def _safe_fallback(self, adapter_input: dict[str, Any]) -> dict[str, Any]:
        answer_type = adapter_input["answer_type"]
        evidence_ids = adapter_input.get("evidence_ids") or []
        missing_fields = list(
            adapter_input.get("sufficiency", {}).get("missing_fields") or adapter_input.get("required_fields") or []
        )
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
