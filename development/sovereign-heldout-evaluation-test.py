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
    compare_heldout_reference_loss,
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

        def rejected(candidate, expected):
            try:
                parse(candidate)
            except ValueError as exc:
                assert expected in str(exc), str(exc)
            else:
                raise AssertionError("Unsafe evaluation manifest must fail: " + expected)

        rejected(rows[:-1], "all seven specialties")
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
