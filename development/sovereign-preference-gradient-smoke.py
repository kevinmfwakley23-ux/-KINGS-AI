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
from sovereign_preference_stage import (
    backward_segmented_dpo_loss, train_preference_stage, train_retention_stage,
    measure_in_sample_preference_alignment,
    verify_retention_domain_losses,
)


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


def verify_supervised_response_only_learning() -> None:
    """Prove response-only SFT can reduce loss using local frozen base weights.

    Synthetic small model, not a claim about a trained K.I.N.G.S. model.
    All segment token labels come from the real supervised data prep.
    """
    torch.manual_seed(23)
    model = TestPolicy()
    tokenizer = TestTokenizer()
    item = {
        "prompt": "Copyedit this sentence.",
        "targetResponse": "A carefully corrected sentence.",
    }
    segments = supervised_answer_segments(tokenizer, item, max_length=128)
    assert len(segments) == 1
    data = segments[0]
    ids = torch.tensor([data["input_ids"]], dtype=torch.long)
    labels = torch.tensor([data["labels"]], dtype=torch.long)
    assert sum(label == -100 for label in data["labels"]) > 0, "user text must be masked"
    assert sum(label != -100 for label in data["labels"]) == (
        len(tokenizer.encode(item["targetResponse"])) + 1
    ), "every target token and EOS must be supervised"

    frozen = {name: value.detach().clone() for name, value in model.named_parameters()
              if not value.requires_grad}
    old_adapter = model.adapter_head.weight.detach().clone()
    optimizer = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad], lr=0.015, weight_decay=0
    )

    def supervised_loss():
        logits = model(input_ids=ids, attention_mask=torch.ones_like(ids)).logits[:, :-1, :]
        targets = labels[:, 1:]
        return functional.cross_entropy(
            logits.reshape(-1, logits.shape[-1]), targets.reshape(-1), ignore_index=-100
        )

    baseline = float(supervised_loss().detach())
    for _ in range(12):
        optimizer.zero_grad(set_to_none=True)
        loss = supervised_loss()
        assert bool(torch.isfinite(loss))
        loss.backward()
        optimizer.step()
    improved = float(supervised_loss().detach())
    assert improved < baseline, (baseline, improved)
    assert not torch.equal(old_adapter, model.adapter_head.weight.detach())
    assert all(torch.equal(frozen[name], value.detach())
               for name, value in model.named_parameters()
               if not value.requires_grad), "SFT must not update frozen base weights"


def main() -> None:
    verify_supervised_response_only_learning()
    verify_dpo_backward_against_full_autograd()
    torch.manual_seed(13)
    model = TestPolicy()
    frozen_before = {name: value.detach().clone() for name, value in model.named_parameters()
                     if not value.requires_grad}
    sft_reference = {name: p.detach().cpu().clone()
                     for name, p in model.named_parameters() if p.requires_grad}
    pairs = [
        {"id": "pref-chat", "domain": "chat", "prompt": "Explain tokens.",
         "chosenResponse": "Tokens encode text units. " * 9, "rejectedResponse": "No idea."},
        {"id": "pref-code", "domain": "coding", "prompt": "How to test?",
         "chosenResponse": "Run assertions.", "rejectedResponse": "Trust a guess."},
    ]
    result = train_preference_stage(
        model, TestTokenizer(), pairs,
        max_length=128, epochs=2, beta=0.1, learning_rate=0.0001, seed=13,
    )
    assert result["optimizationSteps"] == 4, result
    assert result["trainableParametersChanged"], result
    assert result["targetResponseTruncations"] == 0, result
    assert result["gradientMemory"] == "single-bounded-segment", result
    assert result["preferenceTokenization"] == "on-demand-per-pair-no-eager-tensor-corpus", result
    assert result["outcomeEvidenceScope"] == "in-sample-training-pairs-only-not-held-out-quality", result
    assert set(result["trainingPairMeanMarginImprovementByDomain"]) == {"chat", "coding"}, result
    assert 0 <= result["trainingPairImprovedFraction"] <= 1, result
    assert torch.isfinite(torch.tensor(result["trainingPairMeanMarginImprovement"])), result
    assert all(torch.isfinite(torch.tensor(score))
               for score in result["trainingPairMeanMarginImprovementByDomain"].values()), result
    assert all(torch.equal(frozen_before[name], p.detach()) for name, p in model.named_parameters()
               if not p.requires_grad), "Frozen base-model weights must not change in preference training"

    # Third real optimizer: anchored rehearsal on rights-vetted SFT examples,
    # following DPO. Tiny synthetic prompts intentionally DO NOT create data
    # rights for production or prove model expertise.
    supervised = [
        {"domain": domain, "prompt": f"Explain {domain}.",
         "targetResponse": f"A grounded answer about {domain}."}
        for domain in ("chat", "coding", "collectibles", "sports-cards",
                       "book-editing", "publishing", "storytelling")
    ]
    prior_alignment = measure_in_sample_preference_alignment(
        model, TestTokenizer(), pairs, max_length=128, max_pairs_per_domain=1
    )
    # Measure the same exact, deterministic rights-vetted training-pair sample
    # before and after stage 3; never substitute it for held-out evaluation.
    assert set(prior_alignment["meanChosenMinusRejectedLogprobPerTokenByDomain"]) == {"chat", "coding"}
    assert prior_alignment["evaluatedPairsByDomain"] == {"chat": 1, "coding": 1}
    assert prior_alignment["scope"] == "in-sample-training-pairs-only-not-held-out-model-quality"
    prior_repeat = measure_in_sample_preference_alignment(
        model, TestTokenizer(), pairs, max_length=128, max_pairs_per_domain=1
    )
    assert prior_repeat == prior_alignment, "reference alignment must be deterministic"
    rehearsal = train_retention_stage(
        model, TestTokenizer(), supervised, max_length=128,
        epochs=1, learning_rate=0.0005, seed=13,
        sft_reference_weights=sft_reference, anchor_strength=0.01,
    )
    after_alignment = measure_in_sample_preference_alignment(
        model, TestTokenizer(), pairs, max_length=128, max_pairs_per_domain=1
    )
    assert set(after_alignment["meanChosenMinusRejectedLogprobPerTokenByDomain"]) == {"chat", "coding"}
    assert all(torch.isfinite(torch.tensor(score)) for score in
               after_alignment["meanChosenMinusRejectedLogprobPerTokenByDomain"].values())
    assert rehearsal["exampleCount"] == 7, rehearsal
    assert rehearsal["optimizationSteps"] == rehearsal["segmentCount"], rehearsal
    assert rehearsal["trainableParametersChanged"], rehearsal
    assert rehearsal["trainingDataIndependent"] is False, rehearsal
    assert rehearsal["evidenceScope"] == "in-sample-only-not-independent-model-quality", rehearsal
    guard = rehearsal["domainLossRegressionGuard"]
    assert guard["status"] == "passed", guard
    assert guard["scope"] == "in-sample-supervised-loss-only-not-held-out-or-preference-quality"
    assert guard["maximumDomainRegressionFraction"] == 0.05
    assert guard["lossWeighting"] == "response-target-token-count", guard
    assert guard["supervisedTargetTokens"] >= rehearsal["segmentCount"], guard
    assert abs(rehearsal["initialTrainingLoss"] - guard["initialGlobalTokenWeightedLoss"]) < 1e-8
    assert abs(rehearsal["finalTrainingLoss"] - guard["finalGlobalTokenWeightedLoss"]) < 1e-8
    assert set(guard["initialLossByDomain"]) == {row["domain"] for row in supervised}
    assert set(guard["finalLossByDomain"]) == {row["domain"] for row in supervised}
    assert torch.isfinite(torch.tensor(rehearsal["initialTrainingLoss"]))
    assert torch.isfinite(torch.tensor(rehearsal["finalTrainingLoss"]))
    assert all(torch.equal(frozen_before[name], p.detach()) for name, p in model.named_parameters()
               if not p.requires_grad), "Frozen base-model weights must remain unchanged after retention"
    # Independent negative-path assertions: a third-stage run that harms any
    # particular specialty may not quietly publish an allegedly improved model.
    guard_rows = [
        {"domain": "coding", "labels": [-100, 2]},
        {"domain": "storytelling", "labels": [-100, 3]},
    ]
    accepted = verify_retention_domain_losses(guard_rows, [2.0, 3.0], [2.05, 3.10])
    assert accepted["supervisedTargetTokensByDomain"] == {"coding": 1, "storytelling": 1}
    # Without token weighting the coding averages (1.9 + 2.2) / 2 = 2.05,
    # only 2.5% above baseline. The long 100-token segment actually regresses
    # almost 10%; this must fail closed rather than hiding chapter damage.
    variable_length_rows = [
        {"domain": "coding", "labels": [-100, 4]},
        {"domain": "coding", "labels": [-100] + [5] * 100},
        {"domain": "storytelling", "labels": [-100, 6]},
    ]
    try:
        verify_retention_domain_losses(
            variable_length_rows, [2.0, 2.0, 3.0], [1.9, 2.2, 3.0]
        )
    except RuntimeError as error:
        assert "coding" in str(error), error
    else:
        raise AssertionError("Long-form token-weighted retention regression must fail")
    safe_weighted = verify_retention_domain_losses(
        variable_length_rows, [2.0, 2.0, 3.0], [1.9, 2.03, 3.0]
    )
    assert safe_weighted["supervisedTargetTokensByDomain"]["coding"] == 101
    assert safe_weighted["initialLossByDomain"]["coding"] == 2.0
    for malformed in (
        [{"domain": "coding"}],
        [{"domain": "coding", "labels": [-100, -100]}],
        [{"domain": "coding", "labels": [-100, -7]}],
    ):
        try:
            verify_retention_domain_losses(malformed, [1.0], [1.0])
        except ValueError:
            pass
        else:
            raise AssertionError("Retention regression guard must reject missing or invalid token labels")
    assert accepted["status"] == "passed", accepted
    for worsening, expected in [
        ([2.2, 3.0], "coding"), ([2.0, 3.5], "storytelling"),
    ]:
        try:
            verify_retention_domain_losses(guard_rows, [2.0, 3.0], worsening)
        except RuntimeError as error:
            assert expected in str(error), error
        else:
            raise AssertionError("Retention regression guard must refuse damaged specialty loss")
    try:
        verify_retention_domain_losses(guard_rows, [2.0, float("nan")], [2.0, 3.0])
    except ValueError:
        pass
    else:
        raise AssertionError("Non-finite domain loss must fail closed")

    try:
        train_retention_stage(
            model, TestTokenizer(), supervised, max_length=128,
            epochs=1, learning_rate=0.0005, seed=13,
            sft_reference_weights={}, anchor_strength=0.01,
        )
    except ValueError as error:
        assert "anchors" in str(error), error
    else:
        raise AssertionError("Third-stage rehearsal must reject missing SFT reference weights")
    print("K.I.N.G.S. three-stage SFT + DPO + retention: true gradient updates, bounded losses and frozen-base smoke PASS; synthetic quality claims: NONE")


if __name__ == "__main__":
    main()
