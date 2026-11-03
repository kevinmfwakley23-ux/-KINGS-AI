"""K.I.N.G.S. owner-operated preference stage: dataset validation and offline DPO."""
from __future__ import annotations

from collections import defaultdict
import math
from pathlib import Path
import random


def validate_preference_inputs(path: Path, benchmark_path: Path, supervised: list[dict]) -> list[dict]:
    from sovereign_lora_trainer import DOMAINS, HEX_SHA256, _load_json
    package = _load_json(path)
    benchmarks = _load_json(benchmark_path)
    if package.get("schemaVersion") != "1" or not isinstance(package.get("pairs"), list):
        raise ValueError("Preference stage needs schemaVersion 1 and pairs")
    if len(package["pairs"]) > 200000:
        raise ValueError("Preference stage has too many pairs")
    if not isinstance(benchmarks.get("items"), list):
        raise ValueError("Benchmark manifest requires items")
    protected = supervised + benchmarks["items"]
    ids = {x["id"] for x in protected}
    groups = {x["sourceGroupId"] for x in protected}
    prompts = {" ".join(x["prompt"].lower().split()) for x in protected}
    counts = {domain: 0 for domain in DOMAINS}
    for pair in package["pairs"]:
        if not isinstance(pair, dict) or set(pair) != {
            "id", "domain", "sourceGroupId", "prompt",
            "chosenResponse", "rejectedResponse", "rights",
        }:
            raise ValueError("Preference pair has unsupported or missing fields")
        domain = pair["domain"]
        if domain not in DOMAINS:
            raise ValueError("Preference domain is unsupported")
        identifier, group, prompt = pair["id"], pair["sourceGroupId"], pair["prompt"]
        if not isinstance(identifier, str) or not identifier.strip() or identifier in ids:
            raise ValueError("Preference id is empty or duplicates protected data")
        if not isinstance(group, str) or not group.strip() or group in groups:
            raise ValueError("Preference source group overlaps supervised or benchmark data")
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("Preference prompt is empty")
        normalized = " ".join(prompt.lower().split())
        if normalized in prompts:
            raise ValueError("Preference prompt overlaps supervised or benchmark data")
        chosen, rejected = pair["chosenResponse"], pair["rejectedResponse"]
        if (not isinstance(chosen, str) or not chosen.strip() or
                not isinstance(rejected, str) or not rejected.strip() or
                chosen.strip() == rejected.strip()):
            raise ValueError("Preference responses must be nonempty and distinct")
        rights = pair["rights"]
        if not isinstance(rights, dict) or rights.get("trainingAllowed") is not True:
            raise ValueError("Preference stage training rights are denied")
        digest = rights.get("permissionEvidenceSha256")
        if not isinstance(digest, str) or not HEX_SHA256.fullmatch(digest):
            raise ValueError("Preference permission evidence SHA-256 is required")
        for key in ("licenseId", "sourceReference", "permissionReference", "attestedBy"):
            if not isinstance(rights.get(key), str) or not rights[key].strip():
                raise ValueError("Missing preference rights attestation: " + key)
        ids.add(identifier)
        prompts.add(normalized)
        counts[domain] += 1
    missing = [domain for domain, count in sorted(counts.items()) if count < 20]
    if missing:
        raise ValueError("At least 20 preference pairs required per domain: " + ", ".join(missing))
    return package["pairs"]


def train_preference_stage(
    model, tokenizer, pairs: list[dict], *,
    max_length: int, epochs: int, beta: float,
    learning_rate: float, seed: int,
) -> dict:
    """Train a DPO adapter using the frozen post-SFT model as reference.

    Reference log probabilities are computed before the optimizer modifies
    any weights. This needs one local base model plus its trainable adapter,
    not a remote teacher or second full model in VRAM.
    """
    import torch
    import torch.nn.functional as functional
    from sovereign_lora_trainer import supervised_answer_segments

    if epochs < 1 or epochs > 10 or not (0.01 <= beta <= 1.0) or not (0 < learning_rate <= 0.001):
        raise ValueError("Preference hyperparameters are outside bounded limits")

    def encode(prompt: str, response: str):
        # Never silently truncate chosen/rejected answers. The full response
        # is supervised in bounded contextual segments, as in stage one.
        records = supervised_answer_segments(
            tokenizer, {"prompt": prompt, "targetResponse": response}, max_length
        )
        if len(records) > 16:
            raise ValueError("DPO response exceeds the 16-segment memory budget")
        return [
            (torch.tensor([segment["input_ids"]], dtype=torch.long),
             torch.tensor([segment["labels"]], dtype=torch.long))
            for segment in records
        ]

    def segment_log_probability(ids, labels):
        device = next(model.parameters()).device
        ids, labels = ids.to(device), labels.to(device)
        logits = model(input_ids=ids, attention_mask=torch.ones_like(ids)).logits[:, :-1, :].float()
        selected = torch.log_softmax(logits, -1).gather(-1, ids[:, 1:].unsqueeze(-1)).squeeze(-1)
        return (selected * (labels[:, 1:] != -100)).sum(-1)

    def log_probability(segments):
        total = None
        for ids, labels in segments:
            value = segment_log_probability(ids, labels)
            total = value if total is None else total + value
        return total

    records = [(pair["domain"], encode(pair["prompt"], pair["chosenResponse"]),
                encode(pair["prompt"], pair["rejectedResponse"])) for pair in pairs]
    model.eval()
    frozen_reference = []
    with torch.no_grad():
        for _, chosen, rejected in records:
            frozen_reference.append((
                log_probability(chosen).detach().cpu(),
                log_probability(rejected).detach().cpu(),
            ))
    trainable = {name: p for name, p in model.named_parameters() if p.requires_grad}
    if not trainable:
        raise RuntimeError("No trainable preference adapter parameters")
    before = {name: p.detach().cpu().clone() for name, p in trainable.items()}
    optimizer = torch.optim.AdamW(list(trainable.values()), lr=learning_rate, weight_decay=0.0)
    buckets = defaultdict(list)
    for index, record in enumerate(records):
        buckets[record[0]].append(index)
    rng = random.Random(seed + 1)
    losses = []
    steps = 0
    # Keep dropout disabled so that the no-grad preference margin and the
    # independently backpropagated segment scores describe the same policy.
    # Trainable adapter parameters still receive true DPO gradients in eval().
    model.eval()
    for _ in range(epochs):
        pending = {name: rng.sample(indices, len(indices)) for name, indices in buckets.items()}
        while any(pending.values()):
            for domain in sorted(pending):
                if not pending[domain]:
                    continue
                index = pending[domain].pop()
                _, chosen, rejected = records[index]
                ref_good, ref_bad = frozen_reference[index]
                optimizer.zero_grad(set_to_none=True)
                # Compute the current DPO margin without retaining a graph for
                # every segment. Differentiate that same scalar exactly using
                # dL/d(good)=-beta*sigmoid(-beta*delta), dL/d(bad)=-dL/d(good).
                # The next loops release each segment graph immediately; peak
                # activation memory stays bounded for long-form writing pairs.
                with torch.no_grad():
                    good = log_probability(chosen)
                    bad = log_probability(rejected)
                    delta = (good - bad) - (ref_good - ref_bad).to(good.device)
                    loss = -functional.logsigmoid(beta * delta).mean()
                    weight = (beta * torch.sigmoid(-beta * delta)).detach()
                if not bool(torch.isfinite(loss)):
                    raise RuntimeError("Non-finite preference loss")
                for segment in chosen:
                    (-weight * segment_log_probability(*segment)).mean().backward()
                for segment in rejected:
                    (weight * segment_log_probability(*segment)).mean().backward()
                torch.nn.utils.clip_grad_norm_(list(trainable.values()), 1.0)
                optimizer.step()
                steps += 1
                losses.append(float(loss.detach().cpu()))
    if steps < len(records) or not all(math.isfinite(x) for x in losses):
        raise RuntimeError("Preference optimizer did not complete all gradient steps")
    if not any(not torch.equal(before[name], p.detach().cpu()) for name, p in trainable.items()):
        raise RuntimeError("Preference optimization made no trainable weight changes")

    # Re-evaluate the *training pairs* against their frozen pre-DPO scores,
    # measuring whether the optimizer actually improved chosen-vs-rejected
    # log-odds. This is diagnostic, NOT held-out or expert qualification.
    improvements = defaultdict(list)
    with torch.no_grad():
        for index, (domain, chosen, rejected) in enumerate(records):
            updated_margin = log_probability(chosen) - log_probability(rejected)
            baseline_margin = frozen_reference[index][0] - frozen_reference[index][1]
            movement = float((updated_margin.cpu() - baseline_margin).item())
            if not math.isfinite(movement):
                raise RuntimeError("Preference optimization produced non-finite post-training margin")
            improvements[domain].append(movement)
    all_movements = [value for values in improvements.values() for value in values]
    if len(all_movements) != len(records):
        raise RuntimeError("Preference outcome measurement skipped training pairs")
    return {
        "algorithm": "direct-preference-optimization",
        "reference": "frozen-post-supervised-policy-logprobs",
        "pairCount": len(records),
        "epochs": epochs,
        "optimizationSteps": steps,
        "beta": beta,
        "learningRate": learning_rate,
        "meanLoss": sum(losses) / len(losses),
        "trainableParametersChanged": True,
        "trainingPairMeanMarginImprovement": sum(all_movements) / len(all_movements),
        "trainingPairImprovedFraction": sum(value > 0 for value in all_movements) / len(all_movements),
        "trainingPairMeanMarginImprovementByDomain": {
            domain: sum(values) / len(values)
            for domain, values in sorted(improvements.items())
        },
        "outcomeEvidenceScope": "in-sample-training-pairs-only-not-held-out-quality",
        "targetResponseTruncations": 0,
        "gradientMemory": "single-bounded-segment",
    }
