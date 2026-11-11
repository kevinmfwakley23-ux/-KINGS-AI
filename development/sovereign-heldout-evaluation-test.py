#!/usr/bin/env python3
"""Exercise production seven-domain held-out scoring with a tiny local policy.

Tests never train on held-out references, download weights, or claim any
specialist model competence.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "runtimes" / "powerhouse-training"))

import torch
from torch import nn

from sovereign_heldout_stage import (
    validate_heldout_references, measure_heldout_reference_loss,
    compare_heldout_reference_loss, assess_heldout_proxy_review_gate,
    require_heldout_proxy_review_gate,
)

DOMAINS = (
    "chat", "coding", "collectibles", "sports-cards",
    "book-editing", "publishing", "storytelling",
)


class TestTokenizer:
    eos_token_id = 1

    def encode(self, text, add_special_tokens=False):
        return [2 + ord(c) % 43 for c in text]


class LocalPolicy(nn.Module):
    def __init__(self):
        super().__init__()
        self.emb = nn.Embedding(48, 12)
        self.fixed = nn.Linear(12, 48, bias=False)
        self.adapter = nn.Linear(12, 48, bias=False)
        self.emb.requires_grad_(False)
        self.fixed.requires_grad_(False)

    def forward(self, input_ids, attention_mask=None):
        return SimpleNamespace(logits=self.fixed(self.emb(input_ids)) +
                               self.adapter(self.emb(input_ids)))


def references():
    rights = {
        "evaluationAllowed": True,
        "trainingAllowed": False,
        "licenseId": "synthetic-unit-test-only",
        "sourceReference": "test-generated",
        "permissionReference": "local-test-generator",
        "permissionEvidenceSha256": hashlib.sha256(b"evaluation-test-only").hexdigest(),
        "attestedBy": "local-test-runner",
    }
    return [{
        "id": f"unseen-{domain}",
        "domain": domain,
        "sourceGroupId": f"unseen-source-{domain}",
        "split": "held-out",
        "prompt": f"Unseen specialty task about {domain}.",
        "targetResponse": f"Carefully inspect evidence for {domain}.",
        "rights": dict(rights),
    } for domain in DOMAINS]


def run():
    torch.manual_seed(947)
    model = LocalPolicy()
    rows = references()
    with tempfile.TemporaryDirectory(prefix="kings-heldout-test-") as temp:
        manifest = Path(temp) / "heldout.json"

        def parse(candidate):
            manifest.write_text(json.dumps({"items": candidate}), encoding="utf8")
            return validate_heldout_references(manifest)

        validated = parse(rows)
        assert len(validated) == 7
        initial_weights = {name: p.detach().clone() for name, p in model.named_parameters()}
        before = measure_heldout_reference_loss(model, TestTokenizer(), validated, max_length=128)
        again = measure_heldout_reference_loss(model, TestTokenizer(), validated[::-1], max_length=128)
        assert before == again, "scoring must not depend on manifest order"
        assert set(before["negativeLogLikelihoodPerTokenByDomain"]) == set(DOMAINS)
        assert all(v == 1 for v in before["evaluatedExamplesByDomain"].values())
        assert all(n > 0 for n in before["evaluatedTokensByDomain"].values())
        assert before["sampling"] == "all-authorized-references-max-200-per-domain"
        # More than 20 eligible references must never be silently discarded.
        extra_chat = [{
            **rows[0],
            "id": f"additional-chat-{i:03d}",
            "sourceGroupId": f"additional-source-chat-{i:03d}",
            "prompt": f"Additional unseen chat question number {i}.",
            "targetResponse": f"Additional independent chat reference answer {i}.",
        } for i in range(20)]
        expanded = parse(rows + extra_chat)
        expanded_score = measure_heldout_reference_loss(
            model, TestTokenizer(), expanded, max_length=128
        )
        assert expanded_score["evaluatedExamplesByDomain"]["chat"] == 21
        assert expanded_score["evaluatedTokensByDomain"]["chat"] > before["evaluatedTokensByDomain"]["chat"]
        assert before["scope"] == "held-out-teacher-forced-reference-loss-not-expert-qualification"
        assert all(torch.equal(initial_weights[name], p.detach())
                   for name, p in model.named_parameters()), "evaluation must not change weights"
        assert all(p.grad is None for p in model.parameters()), "evaluation must not form gradients"

        # The test perturbs one adapter directly, never learns from held-out data.
        with torch.no_grad():
            model.adapter.weight.add_(0.017)
        after = measure_heldout_reference_loss(model, TestTokenizer(), validated, max_length=128)
        comparison = compare_heldout_reference_loss(before, after)
        assert comparison["independentExpertQualification"] is False
        assert comparison["hasAtLeast20ReferencesPerDomain"] is False
        assert set(comparison["negativeLogLikelihoodReductionByDomain"]) == set(DOMAINS)
        assert all(math.isfinite(v) for v in comparison["negativeLogLikelihoodReductionByDomain"].values())
        assert set(comparison["regressionFractionByDomain"]) == set(DOMAINS)
        assert all(math.isfinite(v) and v >= 0 for v in comparison["regressionFractionByDomain"].values())
        assert comparison["regressedDomains"] == sorted(
            d for d, gain in comparison["negativeLogLikelihoodReductionByDomain"].items() if gain < 0
        )
        assert comparison["anyDomainRegressedOverFivePercent"] == any(
            value > 0.05 for value in comparison["regressionFractionByDomain"].values()
        )
        # A synthetic seven-domain regression must be visible even if the
        # aggregate loss looks better; no specialty may disappear in averaging.
        regressed = {**before, "negativeLogLikelihoodPerTokenByDomain": {
            **before["negativeLogLikelihoodPerTokenByDomain"],
            "chat": before["negativeLogLikelihoodPerTokenByDomain"]["chat"] * 1.10,
        }}
        flagged = compare_heldout_reference_loss(before, regressed)
        assert "chat" in flagged["regressedDomains"]
        assert flagged["regressionFractionByDomain"]["chat"] > 0.09
        assert flagged["anyDomainRegressedOverFivePercent"] is True
        # Training optimizer results are not release proof: only a sealed,
        # fully populated proxy comparison can advance to independent review.
        assert assess_heldout_proxy_review_gate(None)["status"] == "blocked"
        incomplete = assess_heldout_proxy_review_gate(comparison)
        assert incomplete["status"] == "blocked"
        assert any("20 isolated" in reason for reason in incomplete["blockers"])
        try:
            require_heldout_proxy_review_gate(incomplete)
        except RuntimeError as exc:
            assert "Refusing model artifact export" in str(exc), str(exc)
        else:
            raise AssertionError("Insufficient references must prevent strict artifact export")

        qualified_before = {
            **before,
            "evaluatedExamplesByDomain": {domain: 20 for domain in DOMAINS},
        }
        qualified_after = {
            **qualified_before,
            "negativeLogLikelihoodPerTokenByDomain": {
                domain: qualified_before["negativeLogLikelihoodPerTokenByDomain"][domain] * 0.90
                for domain in DOMAINS
            },
            "referenceNegativeLogLikelihoodPerToken":
                qualified_before["referenceNegativeLogLikelihoodPerToken"] * 0.90,
        }
        eligible = assess_heldout_proxy_review_gate(
            compare_heldout_reference_loss(qualified_before, qualified_after)
        )
        assert eligible["reviewEligible"] is True and eligible["status"] == "review-eligible"
        assert eligible["productionQualified"] is False
        assert eligible["independentExpertQualification"] is False
        require_heldout_proxy_review_gate(eligible)

        regressed_after = {
            **qualified_after,
            "negativeLogLikelihoodPerTokenByDomain": {
                **qualified_after["negativeLogLikelihoodPerTokenByDomain"],
                "chat": qualified_before["negativeLogLikelihoodPerTokenByDomain"]["chat"] * 1.06,
            },
        }
        regressed_gate = assess_heldout_proxy_review_gate(
            compare_heldout_reference_loss(qualified_before, regressed_after)
        )
        assert regressed_gate["reviewEligible"] is False
        assert any("chat" in reason and "5%" in reason for reason in regressed_gate["blockers"])
        try:
            require_heldout_proxy_review_gate(regressed_gate)
        except RuntimeError as exc:
            assert "chat" in str(exc), str(exc)
        else:
            raise AssertionError("One degraded specialty must prevent strict artifact export")

        nonimproving_after = {
            **qualified_before,
            "referenceNegativeLogLikelihoodPerToken":
                qualified_before["referenceNegativeLogLikelihoodPerToken"] * 1.01,
        }
        no_gain_gate = assess_heldout_proxy_review_gate(
            compare_heldout_reference_loss(qualified_before, nonimproving_after)
        )
        assert not no_gain_gate["reviewEligible"]
        assert any("Overall" in reason for reason in no_gain_gate["blockers"])
        assert not assess_heldout_proxy_review_gate({"baseline": qualified_before})["reviewEligible"]

        changed_token_count = {
            **after,
            "evaluatedTokensByDomain": {
                **after["evaluatedTokensByDomain"],
                "chat": after["evaluatedTokensByDomain"]["chat"] + 1,
            },
        }
        try:
            compare_heldout_reference_loss(before, changed_token_count)
        except ValueError as exc:
            assert "target token counts" in str(exc), str(exc)
        else:
            raise AssertionError("Changed held-out token populations must fail comparison")

        def rejected(candidate, expected):
            try:
                parse(candidate)
            except ValueError as exc:
                assert expected in str(exc), str(exc)
            else:
                raise AssertionError("Unsafe evaluation manifest must fail: " + expected)

        rejected(rows[:-1], "all seven specialties")
        oversized_chat = [{
            **rows[0],
            "id": f"overflow-chat-{i:03d}",
            "sourceGroupId": f"overflow-source-chat-{i:03d}",
            "prompt": f"Excess unseen chat prompt {i}.",
        } for i in range(200)]
        rejected(rows + oversized_chat, "maximum 200 per specialty")
        try:
            measure_heldout_reference_loss(model, TestTokenizer(), rows + oversized_chat, max_length=128)
        except ValueError as exc:
            assert "maximum 200 per specialty" in str(exc), str(exc)
        else:
            raise AssertionError("Direct held-out scoring must reject oversized domains")
        rejected([{**rows[0], "domain": "unknown"}] + rows[1:], "known specialty")
        rejected([{**rows[0], "rights": {**rows[0]["rights"], "evaluationAllowed": False}}] + rows[1:],
                 "evaluation-only permission")
        rejected([{**rows[0], "rights": {**rows[0]["rights"], "trainingAllowed": True}}] + rows[1:],
                 "evaluation-only permission")
        rejected([{**rows[0], "rights": {**rows[0]["rights"], "permissionEvidenceSha256": "x"}}] + rows[1:],
                 "SHA-256")
        rejected([{**rows[0], "sourceGroupId": rows[1]["sourceGroupId"]}] + rows[1:],
                 "cannot reuse source groups")
        rejected([{**rows[0], "prompt": rows[1]["prompt"]}] + rows[1:],
                 "cannot reuse source groups")
        rejected(rows + [{
            "id": "benchmark-train-same-source", "split": "train",
            "sourceGroupId": rows[0]["sourceGroupId"],
            "prompt": "Different prompt from the same benchmark source.",
        }], "cannot reuse source groups")
        rejected(rows + [{
            "id": "benchmark-validation-same-prompt", "split": "validation",
            "sourceGroupId": "totally-different-validation-source",
            "prompt": rows[0]["prompt"],
        }], "cannot reuse source groups")
        assert parse([{
            "id": "legacy-benchmark", "split": "held-out",
            "sourceGroupId": "legacy-group", "prompt": "no reference answer",
        }]) == [], "unlabeled benchmarks must not imply held-out proof"

    print("K.I.N.G.S. offline held-out evaluation isolation, rights and scoring: PASS")


if __name__ == "__main__":
    run()
