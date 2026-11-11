#!/usr/bin/env python3
"""Dependency-free regression coverage for real K.I.N.G.S. supervised ordering.

This tests the scheduler against explicit uneven seven-domain records. It does
NOT simulate gradient updates or claim model quality.
"""
from __future__ import annotations

import ast
import importlib.util
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "runtimes" / "powerhouse-training" / "sovereign_lora_trainer.py"
# Direct importlib loading does not automatically add the sibling training
# modules directory to sys.path (unlike invoking the trainer as a script).
sys.path.insert(0, str(SCRIPT.parent))
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

class FakeTokenizer:
    eos_token_id = 3

    def encode(self, value, add_special_tokens=False):
        assert add_special_tokens is False
        return [ord(character) + 10 for character in value]


tokenizer = FakeTokenizer()
for answer in ("Short answer.", "A" * 13000 + " Long-form conclusion."):
    item = {"prompt": "Edit this book chapter while retaining story continuity.", "targetResponse": answer}
    segments = trainer.supervised_answer_segments(tokenizer, item, max_length=128)
    expected = tokenizer.encode(answer) + [tokenizer.eos_token_id]
    actual = []
    for segment in segments:
        ids, labels = segment["input_ids"], segment["labels"]
        assert len(ids) == len(labels) and len(ids) <= 128
        assert any(label == -100 for label in labels), "each target segment needs a prompt/context"
        assert any(label != -100 for label in labels), "every segment needs real target supervision"
        actual.extend(label for label in labels if label != -100)
        assert all(label == token or label == -100
                   for label, token in zip(labels, ids)), "labels must be correct"
    assert actual == expected, "training must cover every approved answer token, including EOS"
    if len(answer) > 128:
        assert len(segments) > 1, "long targets need multiple bounded supervised records"

try:
    trainer.supervised_answer_segments(
        tokenizer, {"prompt": "Bounded", "targetResponse": "X" * 17000}, max_length=128
    )
except ValueError as error:
    assert "256 bounded training segments" in str(error)
else:
    raise AssertionError("oversized long-form responses must fail rather than exhausting memory")

# The real training artifact must not count long-form target segments as
# independent licensed examples. Segment count is a separately auditable
# quantity even when one writing sample spans several model contexts.
script_source = SCRIPT.read_text(encoding="utf8")
assert '"exampleCount": len(examples)' in script_source
assert '"supervisedSegments": len(records)' in script_source
assert '"examples": len(examples)' in script_source
assert '"supervisedSegmentCount": len(records)' in script_source

print("K.I.N.G.S. seven-domain supervised curriculum, sampler and full-answer coverage: SUCCESS")
