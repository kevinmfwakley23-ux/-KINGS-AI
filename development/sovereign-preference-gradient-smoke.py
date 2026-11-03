#!/usr/bin/env python3
"""Optional CPU/GPU gradient smoke test for the *real* preference update math.

Uses a tiny deterministic, randomly initialized unit-test module, not
production model weights. Does not download anything or claim model quality.
Requires local PyTorch: python3 development/sovereign-preference-gradient-smoke.py
"""
from __future__ import annotations

from pathlib import Path
import sys
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "runtimes" / "powerhouse-training"))
import torch
from torch import nn
from sovereign_preference_stage import train_preference_stage


class TestTokenizer:
    eos_token_id = 1

    def encode(self, text: str, add_special_tokens: bool = False) -> list[int]:
        return [2 + ord(character) % 43 for character in text]


class TestPolicy(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.embedding = nn.Embedding(48, 16)
        self.base_head = nn.Linear(16, 48, bias=False)
        self.adapter_head = nn.Linear(16, 48, bias=False)
        self.embedding.requires_grad_(False)
        self.base_head.requires_grad_(False)

    def forward(self, input_ids, attention_mask=None):
        hidden = self.embedding(input_ids)
        return SimpleNamespace(logits=self.base_head(hidden) + self.adapter_head(hidden))


def main() -> None:
    torch.manual_seed(13)
    model = TestPolicy()
    frozen_before = {name: value.detach().clone() for name, value in model.named_parameters()
                     if not value.requires_grad}
    result = train_preference_stage(
        model, TestTokenizer(), [
            {"domain": "chat", "prompt": "Explain tokens.",
             "chosenResponse": "Tokens encode text units. " * 9, "rejectedResponse": "No idea."},
            {"domain": "coding", "prompt": "How to test?",
             "chosenResponse": "Run assertions.", "rejectedResponse": "Trust a guess."},
        ],
        max_length=128, epochs=2, beta=0.1, learning_rate=0.0001, seed=13,
    )
    assert result["optimizationSteps"] == 4, result
    assert result["trainableParametersChanged"], result
    assert result["targetResponseTruncations"] == 0, result
    assert result["gradientMemory"] == "single-bounded-segment", result
    assert result["outcomeEvidenceScope"] == "in-sample-training-pairs-only-not-held-out-quality", result
    assert set(result["trainingPairMeanMarginImprovementByDomain"]) == {"chat", "coding"}, result
    assert 0 <= result["trainingPairImprovedFraction"] <= 1, result
    assert torch.isfinite(torch.tensor(result["trainingPairMeanMarginImprovement"])), result
    assert all(torch.isfinite(torch.tensor(score))
               for score in result["trainingPairMeanMarginImprovementByDomain"].values()), result
    assert all(torch.equal(frozen_before[name], p.detach()) for name, p in model.named_parameters()
               if not p.requires_grad), "Frozen base-model weights must not change in preference training"
    print("K.I.N.G.S. preference DPO: real gradient smoke PASS; synthetic quality claims: NONE")


if __name__ == "__main__":
    main()
