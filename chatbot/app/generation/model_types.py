from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ModelTier(str, Enum):
    LUNA = "luna"
    TERRA = "terra"
    SOL = "sol"


_TIER_ORDER = [ModelTier.LUNA, ModelTier.TERRA, ModelTier.SOL]


def next_tier(tier: ModelTier) -> ModelTier | None:
    """Escalation successor: Luna -> Terra -> Sol -> None."""
    idx = _TIER_ORDER.index(tier)
    if idx + 1 >= len(_TIER_ORDER):
        return None
    return _TIER_ORDER[idx + 1]


@dataclass(frozen=True)
class ModelConfig:
    tier: ModelTier
    model_id: str
    reasoning_effort: str | None
    input_price_per_million: float
    output_price_per_million: float

    def estimated_cost_usd(self, input_tokens: int | None, output_tokens: int | None) -> float:
        i = input_tokens or 0
        o = output_tokens or 0
        return (i / 1_000_000 * self.input_price_per_million) + (o / 1_000_000 * self.output_price_per_million)


@dataclass(frozen=True)
class RoutingDecision:
    selected_tier: ModelTier
    selected_model: str
    routing_reason: str
    signals: dict[str, Any] = field(default_factory=dict)
    escalation_allowed: bool = True


@dataclass
class GenerationResult:
    raw_text: str | None
    provider: str
    model: str
    input_tokens: int | None
    output_tokens: int | None
    latency_ms: float
    rate_limited: bool = False
    timeout: bool = False
    error: str | None = None
