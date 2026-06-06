"""Model-selector abstraction (Full Doc §III.7, TRD §8).

A single abstraction sits in front of every provider so AI Mode and the Strategy Assistant
select a model by capability/plan without provider-specific code at the call site:
  - Claude Sonnet  : AI Mode default
  - Claude Haiku   : batch news sentiment
  - Claude Opus    : Elite signal-change verdicts
  - GPT / Gemini / DeepSeek / Llama : alternates behind the same interface

Concrete provider clients are wired in the AI Mode ticket. This module defines the contract
and the routing table only.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class ModelTask(StrEnum):
    AI_MODE_DEFAULT = "ai_mode_default"
    BATCH_SENTIMENT = "batch_sentiment"
    ELITE_SIGNAL_CHANGE = "elite_signal_change"
    STRATEGY_ASSISTANT = "strategy_assistant"


@dataclass(frozen=True, slots=True)
class ModelChoice:
    provider: str
    model: str


# Default routing table. Overridable per-request by the entitlement service.
_DEFAULT_ROUTING: dict[ModelTask, ModelChoice] = {
    ModelTask.AI_MODE_DEFAULT: ModelChoice("anthropic", "claude-sonnet-4-6"),
    ModelTask.BATCH_SENTIMENT: ModelChoice("anthropic", "claude-haiku-4-5"),
    ModelTask.ELITE_SIGNAL_CHANGE: ModelChoice("anthropic", "claude-opus-4-6"),
    ModelTask.STRATEGY_ASSISTANT: ModelChoice("anthropic", "claude-sonnet-4-6"),
}


def select_model(task: ModelTask) -> ModelChoice:
    """Resolve the default model for a task. Raises on an unmapped task."""
    try:
        return _DEFAULT_ROUTING[task]
    except KeyError as exc:  # pragma: no cover - defensive
        raise ValueError(f"No model mapped for task {task!r}") from exc
