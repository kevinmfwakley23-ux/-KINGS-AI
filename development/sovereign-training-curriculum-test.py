#!/usr/bin/env python3
"""Dependency-free regression coverage for real K.I.N.G.S. supervised ordering.

This tests the scheduler against explicit uneven seven-domain records. It does
NOT simulate gradient updates or claim model quality.
"""
from __future__ import annotations

import ast
import importlib.util
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "runtimes" / "powerhouse-training" / "sovereign_lora_trainer.py"
spec = importlib.util.spec_from_file_location("kings_sovereign_trainer_test", SCRIPT)
assert spec is not None and spec.loader is not None
trainer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trainer)

domains = sorted(trainer.DOMAINS)
records = [
    {"id": f"{domain}-{index}", "domain": domain}
    for domain in domains
    for index in range(20 + (100 if domain == "coding" else 0))
]
first = trainer.interleave_training_examples(records, seed=42)
again = trainer.interleave_training_examples(records, seed=42)
different_seed = trainer.interleave_training_examples(records, seed=71)

assert [row["id"] for row in first] == [row["id"] for row in again], "same seed must reproduce schedule"
assert [row["id"] for row in first] != [row["id"] for row in different_seed], "seed must shuffle within domains"
assert len(first) == len(records), "every rights-checked example must be included once"
assert len(set(row["id"] for row in first)) == len(records), "scheduler may not duplicate examples"
assert Counter(row["domain"] for row in first) == Counter(row["domain"] for row in records)
assert [row["domain"] for row in first[:len(domains)]] == domains, "early batches must cover all offices"
assert [row["domain"] for row in first[:len(domains)*20]] == domains*20, "all offices must be interleaved until one is exhausted"
assert all(row["domain"] == "coding" for row in first[len(domains)*20:]), "unequal tails must remain authorized data, not fabricated duplicates"

# Ensure the training loop actually uses the ordered dataset. The default
# HuggingFace Trainer RandomSampler would silently undo the entire schedule.
tree = ast.parse(SCRIPT.read_text(encoding="utf8"))
trainer_classes = [node for node in ast.walk(tree)
                   if isinstance(node, ast.ClassDef) and node.name == "DomainInterleavedTrainer"]
assert len(trainer_classes) == 1
samplers = [node for node in trainer_classes[0].body
            if isinstance(node, ast.FunctionDef) and node.name == "_get_train_sampler"]
assert len(samplers) == 1
assert any(isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
           and node.func.id == "SequentialSampler" for node in ast.walk(samplers[0]))
assert "result = DomainInterleavedTrainer(" in SCRIPT.read_text(encoding="utf8")

print("K.I.N.G.S. seven-domain supervised curriculum and real sampler: SUCCESS")
