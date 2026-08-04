from types import SimpleNamespace

from app.generation.model_router import RoutingSignals, route
from app.generation.model_types import ModelTier


def fake_settings():
    return SimpleNamespace(
        openai_luna_model="luna-test-model",
        openai_terra_model="terra-test-model",
        openai_sol_model="sol-test-model",
    )


# ── Luna is the default floor ────────────────────────────────────────────────

def test_luna_selected_for_simple_low_risk_profile():
    signals = RoutingSignals(answer_type="professor_profile", constraint_count=0)
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.LUNA
    assert decision.selected_model == "luna-test-model"
    assert decision.escalation_allowed is True


def test_luna_selected_for_clean_course_recommendation():
    # course_recommendation is NOT excluded from Luna by category — with
    # clean signals it's Luna's default, same as any other answer type.
    signals = RoutingSignals(answer_type="course_recommendation", constraint_count=0)
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.LUNA


def test_luna_selected_for_clean_professor_recommendation():
    signals = RoutingSignals(answer_type="professor_recommendation", constraint_count=1)
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.LUNA


def test_luna_selected_for_single_entity_course_comparison():
    # compared_entity_count below the multi-entity threshold — still Luna.
    signals = RoutingSignals(answer_type="course_comparison", constraint_count=0, compared_entity_count=1)
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.LUNA


def test_routing_not_based_on_query_length_alone():
    # RoutingSignals carries no query-length field at all — the router has
    # no way to key off it. Two otherwise-identical low-risk signal sets
    # route identically regardless of the (absent) query text.
    signals = RoutingSignals(answer_type="professor_profile", constraint_count=0)
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.LUNA


# ── Terra: "a little more than Luna" ──────────────────────────────────────────

def test_terra_selected_for_two_course_comparison():
    signals = RoutingSignals(
        answer_type="course_comparison", constraint_count=0, evidence_complete=True, compared_entity_count=2,
    )
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.TERRA


def test_terra_selected_for_moderate_constraint_count():
    signals = RoutingSignals(answer_type="professor_profile", constraint_count=2)
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.TERRA


def test_terra_selected_for_unresolved_ambiguity_alone():
    # Ambiguity alone (evidence otherwise complete) is a Terra signal, not
    # severe enough on its own for Sol — that needs ambiguity + incomplete
    # evidence together (see test_uncertainty_favors_stronger_model).
    signals = RoutingSignals(answer_type="professor_profile", has_unresolved_ambiguity=True, evidence_complete=True)
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.TERRA


def test_terra_selected_for_incomplete_evidence_alone():
    signals = RoutingSignals(answer_type="professor_recommendation", evidence_complete=False)
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.TERRA


def test_terra_selected_for_repair_required():
    signals = RoutingSignals(answer_type="professor_profile", repair_required=True)
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.TERRA


# ── Sol: genuinely high-stakes, unchanged conservative behavior ──────────────

def test_sol_selected_for_major_requirements():
    signals = RoutingSignals(answer_type="major_requirements")
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.SOL
    assert decision.selected_model == "sol-test-model"
    assert decision.escalation_allowed is False  # Sol may not escalate further


def test_sol_selected_for_high_consequence_planning():
    signals = RoutingSignals(answer_type="schedule_recommendation", high_academic_consequence=True)
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.SOL


def test_sol_selected_for_graduation_planning():
    signals = RoutingSignals(answer_type="course_recommendation", graduation_planning=True)
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.SOL


def test_sol_selected_for_evidence_conflict():
    signals = RoutingSignals(answer_type="course_comparison", evidence_conflict=True)
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.SOL


def test_sol_selected_for_current_vs_historical_conflict():
    signals = RoutingSignals(answer_type="course_recommendation", requires_current_vs_historical=True)
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.SOL


def test_sol_selected_for_four_or_more_constraints():
    signals = RoutingSignals(answer_type="course_recommendation", constraint_count=4)
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.SOL


def test_sol_selected_for_schedule_recommendation_with_multiple_constraints():
    signals = RoutingSignals(answer_type="schedule_recommendation", constraint_count=2)
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.SOL


def test_sol_selected_for_incomplete_comparison_evidence():
    signals = RoutingSignals(answer_type="course_comparison", evidence_complete=False)
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.SOL


def test_sol_selected_for_prior_validation_failure():
    signals = RoutingSignals(answer_type="course_recommendation", prior_validation_failed=True)
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.SOL


def test_sol_selected_for_repair_required_after_terra():
    signals = RoutingSignals(answer_type="course_recommendation", repair_required=True, prior_tier=ModelTier.TERRA)
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.SOL


def test_uncertainty_favors_stronger_model():
    # Ambiguous AND evidence incomplete together trips the "ambiguous
    # evidence requiring careful synthesis" Sol signal — on real doubt, the
    # router still prefers the stronger tier rather than guessing Luna/Terra.
    signals = RoutingSignals(
        answer_type="course_comparison",
        has_unresolved_ambiguity=True,
        evidence_complete=False,
    )
    decision = route(signals, fake_settings())
    assert decision.selected_tier == ModelTier.SOL


def test_repair_required_falls_to_terra_not_luna():
    signals = RoutingSignals(answer_type="professor_profile", repair_required=True)
    decision = route(signals, fake_settings())
    assert decision.selected_tier != ModelTier.LUNA


def test_two_constraints_falls_to_terra_not_luna():
    signals = RoutingSignals(answer_type="professor_profile", constraint_count=2)
    decision = route(signals, fake_settings())
    assert decision.selected_tier != ModelTier.LUNA


def test_routing_deterministic_for_same_input():
    signals = RoutingSignals(answer_type="professor_profile", constraint_count=0)
    d1 = route(signals, fake_settings())
    d2 = route(signals, fake_settings())
    d3 = route(signals, fake_settings())
    assert d1.selected_tier == d2.selected_tier == d3.selected_tier
    assert d1.routing_reason == d2.routing_reason == d3.routing_reason
