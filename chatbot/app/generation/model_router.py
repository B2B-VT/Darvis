from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.generation.model_types import ModelTier, RoutingDecision

# Answer types that are always high-risk regardless of other signals.
_SOL_FORCED_ANSWER_TYPES = {"major_requirements"}

# Answer types where "comparing multiple entities" is the literal task —
# only these count candidate evidence toward compared_entity_count. A
# course_recommendation with several candidate courses in evidence isn't a
# "comparison" just because there are options to choose among; scoping this
# narrowly keeps recommendation-type questions eligible for Luna by default.
_COMPARISON_ANSWER_TYPES = {"course_comparison"}


@dataclass(frozen=True)
class RoutingSignals:
    answer_type: str
    sufficiency_status: str = "sufficient"
    has_unresolved_ambiguity: bool = False
    evidence_complete: bool = True
    evidence_conflict: bool = False
    constraint_count: int = 0
    compared_entity_count: int = 0
    requires_current_vs_historical: bool = False
    graduation_planning: bool = False
    multi_semester_planning: bool = False
    high_academic_consequence: bool = False
    repair_required: bool = False
    prior_validation_failed: bool = False
    prior_tier: ModelTier | None = None
    extra: dict[str, Any] = field(default_factory=dict)


def _model_for_tier(tier: ModelTier, settings: Any) -> str:
    return {
        ModelTier.LUNA: settings.openai_luna_model,
        ModelTier.TERRA: settings.openai_terra_model,
        ModelTier.SOL: settings.openai_sol_model,
    }[tier]


def route(signals: RoutingSignals, settings: Any) -> RoutingDecision:
    """
    Deterministic Luna/Terra/Sol selection. Same signals always produce the
    same decision — no randomness, no LLM calls, not based on query length
    alone.

    Cost-efficiency policy: Luna is the DEFAULT floor for every answer type
    — nothing is excluded from Luna by category. Sol is checked first (any
    single high-risk signal routes there immediately, regardless of
    anything else — those signals represent genuinely high-stakes academic
    decisions that stay conservative on purpose). If no Sol signal fires,
    a smaller set of "needs more than Luna" signals routes to Terra.
    Everything else — the common case — goes to Luna. The escalation
    safety net (see structured_generator.py) still catches a wrong Luna
    guess: a failed Luna attempt bumps to Terra, then Sol, automatically.
    """
    signal_snapshot = {
        "answer_type": signals.answer_type,
        "sufficiency_status": signals.sufficiency_status,
        "has_unresolved_ambiguity": signals.has_unresolved_ambiguity,
        "evidence_complete": signals.evidence_complete,
        "evidence_conflict": signals.evidence_conflict,
        "constraint_count": signals.constraint_count,
        "compared_entity_count": signals.compared_entity_count,
        "requires_current_vs_historical": signals.requires_current_vs_historical,
        "high_academic_consequence": signals.high_academic_consequence,
        "repair_required": signals.repair_required,
        "prior_validation_failed": signals.prior_validation_failed,
    }

    sol_reasons: list[str] = []
    if signals.answer_type in _SOL_FORCED_ANSWER_TYPES:
        sol_reasons.append("major_requirements")
    if signals.graduation_planning:
        sol_reasons.append("graduation_planning")
    if signals.multi_semester_planning:
        sol_reasons.append("multi_semester_planning")
    if signals.answer_type == "schedule_recommendation" and signals.constraint_count >= 2:
        sol_reasons.append("schedule_recommendation_multiple_constraints")
    if signals.constraint_count >= 4:
        sol_reasons.append("four_or_more_constraints")
    if signals.evidence_conflict:
        sol_reasons.append("evidence_conflict")
    if signals.requires_current_vs_historical:
        sol_reasons.append("current_vs_historical_conflict")
    if signals.answer_type == "course_comparison" and not signals.evidence_complete:
        sol_reasons.append("incomplete_comparison_evidence")
    if signals.high_academic_consequence:
        sol_reasons.append("high_academic_consequence")
    if signals.prior_validation_failed:
        sol_reasons.append("previous_validation_failure")
    if signals.repair_required and signals.prior_tier == ModelTier.TERRA:
        sol_reasons.append("repair_required_after_terra")
    if signals.has_unresolved_ambiguity and not signals.evidence_complete:
        sol_reasons.append("ambiguous_evidence_requiring_synthesis")

    if sol_reasons:
        return RoutingDecision(
            selected_tier=ModelTier.SOL,
            selected_model=_model_for_tier(ModelTier.SOL, settings),
            routing_reason=",".join(sol_reasons),
            signals=signal_snapshot,
            escalation_allowed=False,  # Sol may not escalate further
        )

    # "A little more than Luna can handle" — none of these are severe enough
    # for Sol (already ruled out above), but each represents real added
    # complexity Luna isn't asked to absorb: multiple constraints to satisfy
    # at once, an actual multi-entity comparison, unresolved ambiguity, or
    # evidence that isn't fully complete.
    terra_reasons: list[str] = []
    if signals.constraint_count >= 2:
        terra_reasons.append("moderate_constraint_count")
    if signals.compared_entity_count >= 2:
        terra_reasons.append("multi_entity_comparison")
    if signals.has_unresolved_ambiguity:
        terra_reasons.append("unresolved_ambiguity")
    if not signals.evidence_complete:
        terra_reasons.append("incomplete_evidence")
    if signals.repair_required:
        terra_reasons.append("repair_required")

    if terra_reasons:
        return RoutingDecision(
            selected_tier=ModelTier.TERRA,
            selected_model=_model_for_tier(ModelTier.TERRA, settings),
            routing_reason=",".join(terra_reasons),
            signals=signal_snapshot,
            escalation_allowed=True,
        )

    return RoutingDecision(
        selected_tier=ModelTier.LUNA,
        selected_model=_model_for_tier(ModelTier.LUNA, settings),
        routing_reason="luna_default_floor",
        signals=signal_snapshot,
        escalation_allowed=True,
    )


def signals_from_adapter_input(adapter_input: dict[str, Any]) -> RoutingSignals:
    """
    Derives RoutingSignals from a StructuredGenerationAdapter input dict
    (query, user_profile, answer_type, approved_evidence, evidence_ids,
    sufficiency, required_fields, forbidden_claims). Pure/deterministic —
    reads only fields already present on the immutable adapter input.
    """
    sufficiency = adapter_input.get("sufficiency") or {}
    approved = adapter_input.get("approved_evidence") or {}
    candidates = approved.get("approved_candidates") or []
    answer_type = adapter_input.get("answer_type") or "insufficient_data"

    missing_fields = sufficiency.get("missing_fields") or adapter_input.get("required_fields") or []
    evidence_complete = sufficiency.get("status") in (None, "sufficient") and not missing_fields
    evidence_conflict = bool(sufficiency.get("conflict") or sufficiency.get("evidence_conflict"))
    has_unresolved_ambiguity = bool(sufficiency.get("ambiguous") or sufficiency.get("ambiguity"))

    return RoutingSignals(
        answer_type=answer_type,
        sufficiency_status=sufficiency.get("status") or ("sufficient" if sufficiency.get("passed") else "unknown"),
        has_unresolved_ambiguity=has_unresolved_ambiguity,
        evidence_complete=evidence_complete,
        evidence_conflict=evidence_conflict,
        constraint_count=int(adapter_input.get("constraint_count") or 0),
        compared_entity_count=len(candidates) if answer_type in _COMPARISON_ANSWER_TYPES else 0,
        requires_current_vs_historical=bool(adapter_input.get("requires_current_vs_historical")),
        graduation_planning=bool(adapter_input.get("graduation_planning")),
        multi_semester_planning=bool(adapter_input.get("multi_semester_planning")),
        high_academic_consequence=bool(adapter_input.get("high_academic_consequence")),
        repair_required=False,
        prior_validation_failed=False,
    )
