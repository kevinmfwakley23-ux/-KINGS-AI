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
from torch.nn import functional
from sovereign_lora_trainer import supervised_answer_segments
from sovereign_preference_stage import backward_segmented_dpo_loss, train_preference_stage


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


def verify_dpo_backward_against_full_autograd() -> None:
    """Compare the exact production micro-segment DPO derivative to autograd.

    Synthetic local model only. Critically, this exercises the same backward
    function used by real preference training, not copied test math.
    """
    torch.manual_seed(17)
    model = TestPolicy()
    model.eval()
    tokenizer = TestTokenizer()
    prompt = "Which collectibles description is more evidence-based?"
    chosen_text = "Identify uncertainty and explain verified condition. " * 7
    rejected_text = "State an unsupported price as certain. " * 6

    def segments(response):
        encoded = supervised_answer_segments(
            tokenizer, {"prompt": prompt, "targetResponse": response}, 128
        )
        return [
            (torch.tensor([row["input_ids"]], dtype=torch.long),
             torch.tensor([row["labels"]], dtype=torch.long))
            for row in encoded
        ]

    chosen = segments(chosen_text)
    rejected = segments(rejected_text)
    assert len(chosen) > 1 and len(rejected) > 1, "test must span multiple bounded contexts"

    def score(ids, labels):
        logits = model(input_ids=ids, attention_mask=torch.ones_like(ids)).logits[:, :-1].float()
        selected = torch.log_softmax(logits, dim=-1).gather(
            -1, ids[:, 1:].unsqueeze(-1)
        ).squeeze(-1)
        return (selected * (labels[:, 1:] != -100)).sum(-1)

    def total(parts):
        return sum(score(*part) for part in parts)

    # Deliberately use a nonzero reference margin so this tests the complete
    # shifted DPO objective, not only its symmetric, zero-margin special case.
    beta = 0.17
    reference_margin = torch.tensor([-0.75])
    loss = -functional.logsigmoid(
        beta * (total(chosen) - total(rejected) - reference_margin)
    ).mean()
    loss.backward()
    exact_gradient = model.adapter_head.weight.grad.detach().clone()
    assert torch.count_nonzero(exact_gradient) > 0

    model.zero_grad(set_to_none=True)
    bounded_loss = backward_segmented_dpo_loss(
        chosen, rejected, reference_margin, beta, score
    )
    assert abs(float(loss.detach()) - bounded_loss) < 1e-4
    torch.testing.assert_close(
        model.adapter_head.weight.grad, exact_gradient, atol=2e-4, rtol=2e-4,
        msg="production bounded DPO derivative must equal full-graph autograd",
    )
    assert model.base_head.weight.grad is None
    assert model.embedding.weight.grad is None

    try:
        backward_segmented_dpo_loss([], rejected, reference_margin, beta, score)
    except ValueError as exc:
        assert "nonempty" in str(exc)
    else:
        raise AssertionError("DPO must reject empty chosen answer segments")


def main() -> None:
    verify_dpo_backward_against_full_autograd()
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
    print("K.I.N.G.S. preference DPO: exact segmented-vs-full gradient, real optimizer and frozen-base smoke PASS; synthetic quality claims: NONE")


if __name__ == "__main__":
    main()
