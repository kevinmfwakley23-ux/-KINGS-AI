#!/usr/bin/env python3
"""Real offline three-stage training integration test on TINY random weights.

Creates GPT-2-compatible weights and a tokenizer from scratch, trains all
three production stages, validates actual LoRA safetensors and evidence, then
disposes of every synthetic data record. No remote model, no real owner data,
no teacher, no pretrained intelligence, no production quality claims.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

# Enforce no weight or dataset downloads, including the model-builder phase.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_DATASETS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

from tokenizers import Tokenizer, models, pre_tokenizers
from transformers import GPT2Config, GPT2LMHeadModel, PreTrainedTokenizerFast

DOMAINS = (
    "chat", "coding", "collectibles", "sports-cards",
    "book-editing", "publishing", "storytelling",
)


def create_corpus():
    rights = {
        "licenseId": "synthetic-ci-local-author-only",
        "sourceReference": "generated-in-test-no-external-dataset",
        "permissionReference": "code-generated-for-verification",
        "permissionEvidenceSha256": hashlib.sha256(
            b"synthetic-training-integration-only"
        ).hexdigest(),
        "attestedBy": "CI-test-script",
        "trainingAllowed": True,
        "evaluationAllowed": False,
    }
    examples, pairs = [], []
    for domain in DOMAINS:
        for index in range(20):
            examples.append({
                "id": f"sft-{domain}-{index}",
                "domain": domain,
                "sourceGroupId": f"synthetic-sft-{domain}-{index}",
                "prompt": f"Analyze {domain} example {index} using the given details.",
                "targetResponse": f"Here is a careful {domain} training reply for example {index}.",
                "rights": rights,
            })
            pairs.append({
                "id": f"dpo-{domain}-{index}",
                "domain": domain,
                "sourceGroupId": f"synthetic-dpo-{domain}-{index}",
                "prompt": f"Compare {domain} output for synthetic case {index}.",
                "chosenResponse": f"Verify details before answering {domain} question {index}.",
                "rejectedResponse": f"Invent details without evidence about {domain} case {index}.",
                "rights": rights,
            })
    return examples, pairs


def write_local_random_model(directory: Path, examples: list[dict], pairs: list[dict]):
    tokens = {"[UNK]", "[PAD]", "[EOS]", "[BOS]", "User:", "Assistant:"}
    for record in examples:
        tokens.update(record["prompt"].split())
        tokens.update(record["targetResponse"].split())
    for record in pairs:
        for key in ("prompt", "chosenResponse", "rejectedResponse"):
            tokens.update(record[key].split())
    vocab = {token: index for index, token in enumerate(sorted(tokens))}
    tokenizer = Tokenizer(models.WordLevel(vocab=vocab, unk_token="[UNK]"))
    tokenizer.pre_tokenizer = pre_tokenizers.WhitespaceSplit()
    wrapped = PreTrainedTokenizerFast(
        tokenizer_object=tokenizer,
        unk_token="[UNK]", pad_token="[PAD]",
        eos_token="[EOS]", bos_token="[BOS]",
    )
    wrapped.save_pretrained(str(directory))
    # Everything starts as random local weights. Small enough for CPU CI.
    from torch import manual_seed
    manual_seed(97)
    model = GPT2LMHeadModel(GPT2Config(
        vocab_size=len(vocab),
        n_positions=256, n_ctx=256, n_embd=32, n_layer=1, n_head=2,
        bos_token_id=vocab["[BOS]"],
        eos_token_id=vocab["[EOS]"],
        pad_token_id=vocab["[PAD]"],
    ))
    model.save_pretrained(str(directory), safe_serialization=True)


def main():
    examples, pairs = create_corpus()
    assert len(examples) == len(pairs) == 7 * 20
    with tempfile.TemporaryDirectory(prefix="kings-three-stage-e2e-") as temp:
        root = Path(temp)
        model_dir = root / "random-weights"
        model_dir.mkdir()
        write_local_random_model(model_dir, examples, pairs)
        training = root / "training.json"
        preferences = root / "preferences.json"
        evaluation = root / "private-evaluation-manifest.json"
        artifact = root / "trained-test-adapter.zip"
        training.write_text(json.dumps({"schemaVersion": "1", "examples": examples}), encoding="utf8")
        preferences.write_text(json.dumps({"schemaVersion": "1", "pairs": pairs}), encoding="utf8")
        evaluation.write_text(json.dumps({"items": [{
            "id": "unseen-ci-evaluation",
            "split": "held-out",
            "sourceGroupId": "private-ci-evaluation-source",
            "prompt": "Unique unseen evaluation prompt never used for training.",
        }]}), encoding="utf8")
        script = Path(__file__).resolve().parents[1] / (
            "runtimes/powerhouse-training/sovereign_lora_trainer.py"
        )
        command = [
            sys.executable, str(script),
            "--base-model", str(model_dir),
            "--training-package", str(training),
            "--preference-package", str(preferences),
            "--benchmark-manifest", str(evaluation),
            "--model-artifact", str(artifact),
            "--epochs", "1",
            "--preference-epochs", "1",
            "--retention-epochs", "1",
            "--batch-size", "16",
            "--grad-accum", "2",
            "--max-length", "128",
            "--lora-rank", "4",
            "--learning-rate", "0.0003",
            "--preference-learning-rate", "0.0001",
            "--retention-learning-rate", "0.00002",
        ]
        environment = {**os.environ, "TOKENIZERS_PARALLELISM": "false"}
        proc = subprocess.run(
            command, cwd=str(script.parent), env=environment,
            capture_output=True, text=True, timeout=1200, check=False,
        )
        if proc.returncode != 0:
            raise RuntimeError(
                f"Real three-stage CI trainer returned {proc.returncode}: "
                f"{proc.stderr[-12000:]} {proc.stdout[-4000:]}"
            )
        evidence = json.loads(proc.stdout.strip().splitlines()[-1])
        assert evidence["ok"] is True and evidence["trained"] is True
        expected_stages = [
            "supervised-lora", "preference-dpo", "anchored-retention-rehearsal",
        ]
        assert evidence["trainingStages"] == expected_stages, evidence
        assert evidence["artifactSha256"] == hashlib.sha256(artifact.read_bytes()).hexdigest()
        assert artifact.stat().st_size > 0
        with zipfile.ZipFile(artifact) as bundle:
            assert bundle.testzip() is None, "Output adapter ZIP failed integrity"
            names = bundle.namelist()
            assert "kings-training-metadata.json" in names
            weights = [name for name in names if name.endswith(".safetensors")]
            assert weights and all(bundle.getinfo(name).file_size > 0 for name in weights)
            metadata = json.loads(bundle.read("kings-training-metadata.json"))
        assert metadata["trainingStages"] == expected_stages, metadata
        assert metadata["exampleCount"] == 140, "source-example count must not be inflated by segmentation"
        assert metadata["supervisedSegmentCount"] >= 140
        assert metadata["optimizationSteps"] >= 1
        assert metadata["trainableParametersChanged"] is True
        assert metadata["preferenceStage"]["pairCount"] == 140
        assert metadata["preferenceStage"]["optimizationSteps"] >= 140
        assert metadata["retentionStage"]["exampleCount"] == 140
        assert metadata["retentionStage"]["optimizationSteps"] >= 140
        assert metadata["retentionStage"]["domainLossRegressionGuard"]["status"] == "passed"
        drift = metadata["retentionStage"]["preferenceDrift"]
        assert set(drift["deltaByDomain"]) == set(DOMAINS), drift
        assert drift["scope"] == "in-sample-training-pairs-only-not-held-out-model-quality"
        print(json.dumps({
            "ok": True,
            "realGradientStages": expected_stages,
            "syntheticLicensedExampleCount": len(examples),
            "syntheticPreferencePairCount": len(pairs),
            "adapterSha256": evidence["artifactSha256"],
            "adapterWeightsGenerated": True,
            "productionModelTrained": False,
            "independentExpertQualityVerified": False,
        }))


if __name__ == "__main__":
    main()
