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
import os
from pathlib import Path
import random
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
    if not isinstance(benchmark.get("items"), list):
        raise ValueError("Benchmark manifest must supply items")
    protected_groups = set()
    protected_prompts = set()
    for item in benchmark["items"]:
        if not isinstance(item, dict):
            raise ValueError("Invalid benchmark item")
        if item.get("split") != "train":
            protected_groups.add(item.get("sourceGroupId"))
            protected_prompts.add(" ".join(str(item.get("prompt", "")).lower().split()))
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
        if identifier in ids or not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("Duplicate id or empty training prompt")
        if not isinstance(answer, str) or not answer.strip():
            raise ValueError("Training answer must be nonempty")
        prompt_norm = " ".join(prompt.lower().split())
        if prompt_norm in prompts or prompt_norm in protected_prompts:
            raise ValueError("Duplicate or held-out training prompt")
        if example.get("sourceGroupId") in protected_groups:
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--training-package", type=Path, required=True)
    parser.add_argument("--benchmark-manifest", type=Path, required=True)
    parser.add_argument("--model-artifact", type=Path, required=True)
    parser.add_argument("--base-model", type=Path, required=True,
                        help="Absolute local directory of approved, licensed model weights")
    parser.add_argument("--epochs", type=int, default=1)
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
        not (0 < args.learning_rate <= 0.01) or args.seed < 0):
        raise ValueError("Invalid bounded training hyperparameters")
    examples = validate_training_inputs(args.training_package, args.benchmark_manifest)
    if args.validate_only:
        print(json.dumps({"ok": True, "validatedExamples": len(examples),
                          "baseModel": args.base_model.name, "trained": False}))
        return

    # Prevent Hugging Face libraries from fetching model weights, code or data.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_DATASETS_OFFLINE"] = "1"

    try:
        import torch
        from torch.utils.data import Dataset
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

    records = []
    for item in examples:
        prompt = tokenizer.encode(
            "User: " + item["prompt"] + "\nAssistant: ", add_special_tokens=False
        )
        target = tokenizer.encode(item["targetResponse"], add_special_tokens=False)
        target = target[: max(1, args.max_length // 2 - 1)] + [tokenizer.eos_token_id]
        allowed_prompt = args.max_length - len(target)
        if allowed_prompt < 1:
            raise ValueError("Target answer leaves no room for the input prompt")
        prompt = prompt[-allowed_prompt:]
        ids = prompt + target
        labels = [-100] * len(prompt) + target
        records.append({"input_ids": ids, "labels": labels})

    class TrainingDataset(Dataset):
        def __len__(self):
            return len(records)

        def __getitem__(self, index):
            return records[index]

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
        result = Trainer(
            model=model, args=training, train_dataset=TrainingDataset(),
            data_collator=collate,
        ).train()
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
            "exampleCount": len(records),
            "epochs": args.epochs,
            "seed": args.seed,
            "trainingLoss": result.training_loss,
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
    print(json.dumps({"ok": True, "trained": True, "examples": len(records),
                      "artifactSha256": sha256(artifact), "format": metadata["format"]}))


if __name__ == "__main__":
    main()
