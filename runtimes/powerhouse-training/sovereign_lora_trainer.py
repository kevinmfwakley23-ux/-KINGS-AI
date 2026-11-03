#!/usr/bin/env python3
"""Offline, rights-checked LoRA fine-tuning for an owner-held base model.

The existing train:powerhouse launcher validates the signed job and controls
the subprocess, paths, hashes, timeout, and final model artifact. This program
performs REAL gradient updates. It never downloads a model, calls an AI agent,
or reports training success without producing non-empty adapter weights.

Install optional dependencies from requirements-sovereign-training.txt.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import random
from collections import defaultdict
import re
import tempfile
import zipfile

DOMAINS = frozenset({
    "chat", "coding", "collectibles", "sports-cards",
    "book-editing", "publishing", "storytelling",
})
HEX_SHA256 = re.compile(r"^[a-f0-9]{64}$")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load_json(path: Path) -> dict:
    if not path.is_file() or path.is_symlink() or path.stat().st_size > 32 * 1024 * 1024:
        raise ValueError("Training input must be a regular, bounded JSON file")
    result = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(result, dict):
        raise ValueError("Training input must be a JSON object")
    return result


def validate_training_inputs(training_path: Path, benchmark_path: Path) -> list[dict]:
    package = _load_json(training_path)
    benchmark = _load_json(benchmark_path)
    if package.get("schemaVersion") != "1":
        raise ValueError("Unsupported training package schema")
    if not isinstance(package.get("examples"), list):
        raise ValueError("Training examples must be a list")
    if len(package["examples"]) > 200000:
        raise ValueError("Training package exceeds the bounded 200000-example limit")
    if not isinstance(benchmark.get("items"), list):
        raise ValueError("Benchmark manifest must supply items")
    protected_groups = set()
    protected_prompts = set()
    benchmark_ids = set()
    for item in benchmark["items"]:
        if not isinstance(item, dict):
            raise ValueError("Invalid benchmark item")
        identifier = item.get("id")
        split = item.get("split")
        group = item.get("sourceGroupId")
        prompt = item.get("prompt")
        if not isinstance(identifier, str) or not identifier.strip() or identifier in benchmark_ids:
            raise ValueError("Benchmark items require unique nonempty ids")
        if split not in ("train", "validation", "held-out", "test"):
            raise ValueError("Benchmark split must be train, validation, held-out, or test")
        if not isinstance(group, str) or not group.strip():
            raise ValueError("Benchmark sourceGroupId must be nonempty")
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("Benchmark prompt must be nonempty")
        benchmark_ids.add(identifier)
        if split != "train":
            protected_groups.add(group)
            protected_prompts.add(" ".join(prompt.lower().split()))
    domain_counts = {domain: 0 for domain in DOMAINS}
    ids, prompts = set(), set()
    for example in package["examples"]:
        if not isinstance(example, dict):
            raise ValueError("Invalid training example")
        domain = example.get("domain")
        identifier = example.get("id")
        prompt = example.get("prompt")
        answer = example.get("targetResponse")
        rights = example.get("rights")
        if domain not in DOMAINS or not isinstance(identifier, str) or not identifier:
            raise ValueError("Training example has invalid domain or id")
        if identifier in ids or identifier in benchmark_ids or not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("Duplicate id or empty training prompt")
        if not isinstance(answer, str) or not answer.strip():
            raise ValueError("Training answer must be nonempty")
        prompt_norm = " ".join(prompt.lower().split())
        if prompt_norm in prompts or prompt_norm in protected_prompts:
            raise ValueError("Duplicate or held-out training prompt")
        source_group = example.get("sourceGroupId")
        if not isinstance(source_group, str) or not source_group.strip():
            raise ValueError("Training sourceGroupId must be nonempty")
        if source_group in protected_groups:
            raise ValueError("Training source group overlaps held-out or validation data")
        if not isinstance(rights, dict) or rights.get("trainingAllowed") is not True:
            raise ValueError("Training rights are not granted")
        if not isinstance(rights.get("permissionEvidenceSha256"), str) or not HEX_SHA256.fullmatch(
            rights["permissionEvidenceSha256"]
        ):
            raise ValueError("Training permission must carry a SHA-256 evidence reference")
        for key in ("licenseId", "sourceReference", "permissionReference", "attestedBy"):
            if not isinstance(rights.get(key), str) or not rights[key].strip():
                raise ValueError("Missing attested training permission field: " + key)
        ids.add(identifier)
        prompts.add(prompt_norm)
        domain_counts[domain] += 1
    missing = [name for name, count in sorted(domain_counts.items()) if count < 20]
    if missing:
        raise ValueError("At least 20 rights-cleared training examples required per domain: " + ", ".join(missing))
    return package["examples"]


def interleave_training_examples(examples: list[dict], seed: int) -> list[dict]:
    """Shuffle within each specialty, then interleave without duplication.

    This is an ordering strategy, not minority upsampling: no licensed example
    is repeated or secretly invented. The trainer must use a sequential
    sampler or the library's random sampler will undo the interleaving.
    """
    buckets = defaultdict(list)
    for item in examples:
        buckets[item["domain"]].append(item)
    rng = random.Random(seed)
    for bucket in buckets.values():
        rng.shuffle(bucket)
    ordered = []
    while any(buckets.values()):
        for domain in sorted(buckets):
            if buckets[domain]:
                ordered.append(buckets[domain].pop())
    return ordered


def supervised_answer_segments(tokenizer, item: dict, max_length: int) -> list[dict]:
    """Cover the full licensed target answer with response-only loss.

    Each segment contains a real (possibly shortened) user prompt, preceding
    answer context when available, and a non-overlapping target span. No token
    of the target response is silently omitted, and no context token is
    trained as a target. This improves long-form book/writing supervision
    without assuming the model can infer beyond its actual context window.
    """
    if max_length < 128:
        raise ValueError("Training context must contain at least 128 tokens")
    prompt = tokenizer.encode(
        "User: " + item["prompt"] + "\nAssistant: ", add_special_tokens=False
    )
    target = tokenizer.encode(item["targetResponse"], add_special_tokens=False)
    if not prompt or not target:
        raise ValueError("Tokenizer produced an empty user prompt or target response")
    target = target + [tokenizer.eos_token_id]
    chunk_length = max(1, max_length // 2)
    segment_count = (len(target) + chunk_length - 1) // chunk_length
    if segment_count > 256:
        raise ValueError("Response requires more than 256 bounded training segments")
    segments = []
    for start in range(0, len(target), chunk_length):
        labels_to_learn = target[start:start + chunk_length]
        context_budget = max_length - len(labels_to_learn)
        if start == 0:
            context = prompt[-context_budget:]
        else:
            prompt_budget = min(len(prompt), max(1, min(max_length // 8, context_budget // 2)))
            recent_prompt = prompt[-prompt_budget:]
            history_budget = context_budget - len(recent_prompt)
            recent_answer = target[max(0, start - history_budget):start]
            context = recent_prompt + recent_answer
        token_ids = context + labels_to_learn
        if not context or len(token_ids) > max_length:
            raise ValueError("Cannot fit a contextualized supervised answer segment")
        segments.append({
            "input_ids": token_ids,
            "labels": [-100] * len(context) + labels_to_learn,
        })
    return segments


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--training-package", type=Path, required=True)
    parser.add_argument("--benchmark-manifest", type=Path, required=True)
    parser.add_argument("--model-artifact", type=Path, required=True)
    parser.add_argument("--base-model", type=Path, required=True,
                        help="Absolute local directory of approved, licensed model weights")
    parser.add_argument("--preference-package", type=Path,
                        help="Optional second-stage, independent rights-cleared preference pairs")
    parser.add_argument("--preference-epochs", type=int, default=3)
    parser.add_argument("--preference-beta", type=float, default=0.1)
    parser.add_argument("--preference-learning-rate", type=float, default=0.00002)
    parser.add_argument("--retention-epochs", type=int, default=1,
                        help="Third-stage licensed SFT rehearsal after DPO; 0 explicitly disables")
    parser.add_argument("--retention-learning-rate", type=float, default=0.00001)
    parser.add_argument("--retention-anchor-strength", type=float, default=0.01)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--grad-accum", type=int, default=4)
    parser.add_argument("--max-length", type=int, default=2048)
    parser.add_argument("--lora-rank", type=int, default=16)
    parser.add_argument("--learning-rate", type=float, default=0.0001)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--validate-only", action="store_true",
                        help="Preflight source permissions and model directory without training")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.base_model.is_absolute() or not args.base_model.is_dir():
        raise ValueError("Base model must be an existing absolute local directory")
    if not (args.base_model / "config.json").is_file():
        raise ValueError("Local base model is missing config.json")
    if (args.epochs < 1 or args.epochs > 30 or args.batch_size < 1 or args.batch_size > 64 or
        args.grad_accum < 1 or args.grad_accum > 256 or
        args.max_length < 128 or args.max_length > 32768 or
        args.lora_rank not in (4, 8, 16, 32, 64, 128) or
        not (0 < args.learning_rate <= 0.01) or args.seed < 0 or
        args.preference_epochs < 1 or args.preference_epochs > 10 or
        args.retention_epochs < 0 or args.retention_epochs > 5 or
        not (0.01 <= args.preference_beta <= 1) or
        not (0 < args.preference_learning_rate <= 0.001) or
        not (0 < args.retention_learning_rate <= 0.001) or
        not (0 <= args.retention_anchor_strength <= 1)):
        raise ValueError("Invalid bounded training hyperparameters")
    examples = validate_training_inputs(args.training_package, args.benchmark_manifest)
    preferences = None
    if args.preference_package is not None:
        from sovereign_preference_stage import validate_preference_inputs
        preferences = validate_preference_inputs(
            args.preference_package, args.benchmark_manifest, examples
        )
    # Opt-in reference answers in the sealed held-out benchmark are rights-
    # checked before allocating model weights. Unlabeled legacy manifests
    # continue to work, but cannot claim any held-out quality evidence.
    from sovereign_heldout_stage import validate_heldout_references
    heldout_references = validate_heldout_references(args.benchmark_manifest)
    if args.model_artifact.exists():
        raise FileExistsError("Refusing to overwrite an existing trained model artifact")
    if args.validate_only:
        print(json.dumps({"ok": True, "validatedExamples": len(examples),
                          "validatedPreferencePairs": len(preferences) if preferences is not None else 0,
                          "heldOutReferenceCount": len(heldout_references),
                          "supervisedEpochs": args.epochs,
                          "preferenceEpochs": args.preference_epochs if preferences is not None else 0,
                          "retentionEpochs": args.retention_epochs if preferences is not None else 0,
                          "domainSampling": "seeded-round-robin-without-replacement",
                          "trainingStages": ["supervised-lora"] + (
                              ["preference-dpo"] + (
                                  ["anchored-retention-rehearsal"] if args.retention_epochs else []
                              ) if preferences is not None else []
                          ),
                          "baseModel": args.base_model.name, "trained": False}))
        return

    # Prevent Hugging Face libraries from fetching model weights, code or data.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_DATASETS_OFFLINE"] = "1"

    try:
        import torch
        from torch.utils.data import Dataset, SequentialSampler
        from transformers import (AutoModelForCausalLM, AutoTokenizer,
                                  Trainer, TrainingArguments)
        from peft import LoraConfig, TaskType, get_peft_model
    except ImportError as exc:
        raise RuntimeError(
            "Offline training requires torch, transformers, peft and accelerate "
            "from requirements-sovereign-training.txt"
        ) from exc

    torch.manual_seed(args.seed)
    random.seed(args.seed)
    tokenizer = AutoTokenizer.from_pretrained(
        str(args.base_model), local_files_only=True, trust_remote_code=False
    )
    if tokenizer.eos_token_id is None:
        raise ValueError("Base-model tokenizer requires an EOS token")
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token

    # The default HF Trainer uses RandomSampler, which would silently erase
    # the intended per-domain interleaving. Preserve this schedule below.
    balanced_examples = interleave_training_examples(examples, args.seed)
    records_with_domain = []
    for item in balanced_examples:
        for segment in supervised_answer_segments(tokenizer, item, args.max_length):
            records_with_domain.append({**segment, "domain": item["domain"]})
            if len(records_with_domain) > 200000:
                raise ValueError("Supervised token segmentation exceeds 200000 bounded records")
    # Long responses can yield several segments. Keep the optimizer's domain
    # interleaving effective at the segment level, not just the example level.
    ordered_segments = interleave_training_examples(records_with_domain, args.seed + 1)
    supervised_target_tokens = sum(
        sum(token != -100 for token in segment["labels"])
        for segment in ordered_segments
    )
    records = [
        {"input_ids": segment["input_ids"], "labels": segment["labels"]}
        for segment in ordered_segments
    ]

    class TrainingDataset(Dataset):
        def __len__(self):
            return len(records)

        def __getitem__(self, index):
            return records[index]

    class DomainInterleavedTrainer(Trainer):
        def _get_train_sampler(self):
            # Local single-owner training: do not reshuffle the already
            # reproducible, domain-interleaved record ordering.
            return SequentialSampler(self.train_dataset)

    def collate(batch):
        length = max(len(x["input_ids"]) for x in batch)
        ids = torch.full((len(batch), length), tokenizer.pad_token_id, dtype=torch.long)
        mask = torch.zeros((len(batch), length), dtype=torch.long)
        labels = torch.full((len(batch), length), -100, dtype=torch.long)
        for index, row in enumerate(batch):
            size = len(row["input_ids"])
            ids[index, :size] = torch.tensor(row["input_ids"])
            mask[index, :size] = 1
            labels[index, :size] = torch.tensor(row["labels"])
        return {"input_ids": ids, "attention_mask": mask, "labels": labels}

    model = AutoModelForCausalLM.from_pretrained(
        str(args.base_model), local_files_only=True, trust_remote_code=False,
        torch_dtype="auto",
    )
    model.config.use_cache = False
    model = get_peft_model(model, LoraConfig(
        r=args.lora_rank, lora_alpha=2 * args.lora_rank,
        lora_dropout=0.05, bias="none",
        target_modules="all-linear", task_type=TaskType.CAUSAL_LM,
    ))
    # Never put held-out references in the optimizer's train_dataset.
    # Evaluate the same fixed unseen subset before any gradient update.
    from sovereign_heldout_stage import measure_heldout_reference_loss, compare_heldout_reference_loss
    baseline_heldout = measure_heldout_reference_loss(
        model, tokenizer, heldout_references, max_length=args.max_length
    ) if heldout_references else None
    artifact = args.model_artifact.resolve()
    if artifact.exists():
        raise FileExistsError("Refusing to overwrite an existing trained model artifact")
    artifact.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=artifact.parent, prefix="kings-train-") as work:
        root = Path(work)
        training = TrainingArguments(
            output_dir=str(root / "checkpoints"),
            overwrite_output_dir=False,
            num_train_epochs=args.epochs,
            per_device_train_batch_size=args.batch_size,
            gradient_accumulation_steps=args.grad_accum,
            learning_rate=args.learning_rate,
            logging_strategy="no", save_strategy="no",
            report_to="none", seed=args.seed,
            remove_unused_columns=False,
            dataloader_num_workers=0,
        )
        before = {
            name: value.detach().cpu().clone()
            for name, value in model.named_parameters() if value.requires_grad
        }
        if not before:
            raise RuntimeError("No trainable LoRA parameters were configured")
        result = DomainInterleavedTrainer(
            model=model, args=training, train_dataset=TrainingDataset(),
            data_collator=collate,
        ).train()
        if result.global_step < 1 or not math.isfinite(result.training_loss):
            raise RuntimeError("Training did not complete a valid gradient optimization step")
        after = {
            name: value.detach().cpu().clone()
            for name, value in model.named_parameters() if value.requires_grad
        }
        if not any(not torch.equal(before[name], value) for name, value in after.items()):
            raise RuntimeError("Training completed without changing any trainable LoRA weights")
        preference_evidence = None
        retention_evidence = None
        if preferences is not None:
            from sovereign_preference_stage import train_preference_stage, train_retention_stage
            preference_evidence = train_preference_stage(
                model, tokenizer, preferences,
                max_length=args.max_length,
                epochs=args.preference_epochs,
                beta=args.preference_beta,
                learning_rate=args.preference_learning_rate,
                seed=args.seed,
            )
            if args.retention_epochs:
                from sovereign_preference_stage import measure_in_sample_preference_alignment
                # Stage-three skill rehearsal can inadvertently undo some DPO
                # preferences. Measure that risk before/after retention on a
                # bounded, disjoint-from-evaluation subset of training pairs.
                # This is never held-out proof of quality.
                before_alignment = measure_in_sample_preference_alignment(
                    model, tokenizer, preferences, max_length=args.max_length
                )
                retention_evidence = train_retention_stage(
                    model, tokenizer, examples, max_length=args.max_length,
                    epochs=args.retention_epochs,
                    learning_rate=args.retention_learning_rate,
                    anchor_strength=args.retention_anchor_strength,
                    seed=args.seed, sft_reference_weights=after,
                )
                after_alignment = measure_in_sample_preference_alignment(
                    model, tokenizer, preferences, max_length=args.max_length
                )
                old_scores = before_alignment["meanChosenMinusRejectedLogprobPerTokenByDomain"]
                new_scores = after_alignment["meanChosenMinusRejectedLogprobPerTokenByDomain"]
                if set(old_scores) != set(new_scores):
                    raise RuntimeError("Retention preference-drift evaluation lost a specialty")
                changes = {
                    domain: new_scores[domain] - old_scores[domain]
                    for domain in sorted(old_scores)
                }
                retention_evidence["preferenceDrift"] = {
                    "before": before_alignment,
                    "after": after_alignment,
                    "deltaByDomain": changes,
                    "regressedDomains": [
                        domain for domain, change in changes.items() if change < 0
                    ],
                    "scope": "in-sample-training-pairs-only-not-held-out-model-quality",
                }
        # This proxy is distinct from training-pair DPO and rehearsal loss.
        # A worse held-out result is recorded, never silently omitted.
        final_heldout = measure_heldout_reference_loss(
            model, tokenizer, heldout_references, max_length=args.max_length
        ) if heldout_references else None
        heldout_evidence = compare_heldout_reference_loss(
            baseline_heldout, final_heldout
        ) if final_heldout is not None else None
        adapter = root / "adapter"
        model.save_pretrained(str(adapter), safe_serialization=True)
        tokenizer.save_pretrained(str(adapter))
        weights = list(adapter.glob("*.safetensors"))
        if not weights or any(path.stat().st_size == 0 for path in weights):
            raise RuntimeError("Gradient training produced no nonempty LoRA safetensors weights")
        metadata = {
            "format": "kings-sovereign-lora-adapter-v1",
            "baseModel": args.base_model.name,
            "baseConfigSha256": sha256(args.base_model / "config.json"),
            "trainingPackageSha256": sha256(args.training_package),
            "benchmarkManifestSha256": sha256(args.benchmark_manifest),
            # Licensed examples and derived context segments are different counts.
            # Never inflate independent training-example evidence by counting
            # multiple segments of one long authorized book/chapter response.
            "exampleCount": len(examples),
            "domainSampling": "seeded-round-robin-without-replacement",
            "trainingPasses": args.epochs,
            "optimizerSampler": "sequential-interleaved",
            "supervisedExamplesByDomain": {
                domain: sum(item["domain"] == domain for item in examples)
                for domain in sorted(DOMAINS)
            },
            "epochs": args.epochs,
            "seed": args.seed,
            "trainingLoss": result.training_loss,
            "optimizationSteps": result.global_step,
            "supervisedSegmentCount": len(records),
            "supervisedTargetTokens": supervised_target_tokens,
            "targetResponseTruncations": 0,
            "trainableParametersChanged": True,
            "trainingStages": ["supervised-lora"] + (
                ["preference-dpo"] + (
                    ["anchored-retention-rehearsal"] if retention_evidence is not None else []
                ) if preference_evidence is not None else []
            ),
            "preferencePackageSha256": (
                sha256(args.preference_package) if preference_evidence is not None else None
            ),
            "preferenceStage": preference_evidence,
            "retentionStage": retention_evidence,
            "heldOutReferenceEvaluation": heldout_evidence,
            "heldOutReferenceCount": len(heldout_references),
            "independentSpecialistQualification": False,
            "notes": "Real fine-tuned adapter, not a claim of top-tier capability or a merged deployable model.",
        }
        (adapter / "kings-training-metadata.json").write_text(
            json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
        )
        temporary = root / "model-adapter.zip"
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for file in sorted(adapter.iterdir()):
                if file.is_file():
                    archive.write(file, arcname=file.name)
        if temporary.stat().st_size == 0:
            raise RuntimeError("Empty adapter archive")
        os.replace(temporary, artifact)
    print(json.dumps({"ok": True, "trained": True, "examples": len(examples),
                      "supervisedSegments": len(records),
                      "preferencePairs": len(preferences) if preferences is not None else 0,
                      "trainingStages": metadata["trainingStages"],
                      "artifactSha256": sha256(artifact), "format": metadata["format"]}))


if __name__ == "__main__":
    main()
