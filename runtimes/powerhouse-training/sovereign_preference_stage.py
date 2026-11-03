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


def backward_segmented_dpo_loss(chosen, rejected, reference_margin, beta, score_segment) -> float:
    """Backpropagate the exact DPO objective one bounded segment at a time.

    Recompute the scalar margin without a graph, then apply its chain-rule
    coefficients to individual token-score segment graphs. Gradients add up
    to the same result as a monolithic DPO loss, without retaining every
    long-answer activation graph in memory. The score callback must be
    deterministic (disable dropout) throughout each DPO step.
    """
    import torch
    import torch.nn.functional as functional

    if not chosen or not rejected:
        raise ValueError("DPO requires nonempty chosen and rejected segments")

    with torch.no_grad():
        good = sum((score_segment(*part) for part in chosen))
        bad = sum((score_segment(*part) for part in rejected))
        delta = (good - bad) - reference_margin.to(good.device)
        loss = -functional.logsigmoid(beta * delta).mean()
        coefficient = (beta * torch.sigmoid(-beta * delta)).detach()
    if not bool(torch.isfinite(loss)):
        raise RuntimeError("Non-finite preference loss")
    for part in chosen:
        (-coefficient * score_segment(*part)).mean().backward()
    for part in rejected:
        (coefficient * score_segment(*part)).mean().backward()
    return float(loss.detach().cpu())


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

    # Keep rights-checked source strings, not millions of materialized token
    # tensors. Tokenize one pair at a time during frozen-reference collection
    # and each gradient step. This is necessary for larger licensed corpora:
    # previous eager encoding could consume unbounded RAM even though the
    # input JSON file is capped at 32 MiB.
    records = [
        (pair["domain"], pair["prompt"], pair["chosenResponse"], pair["rejectedResponse"])
        for pair in pairs
    ]
    model.eval()
    frozen_reference = []
    with torch.no_grad():
        for _, prompt, chosen_text, rejected_text in records:
            chosen = encode(prompt, chosen_text)
            rejected = encode(prompt, rejected_text)
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
                _, prompt, chosen_text, rejected_text = records[index]
                chosen = encode(prompt, chosen_text)
                rejected = encode(prompt, rejected_text)
                ref_good, ref_bad = frozen_reference[index]
                optimizer.zero_grad(set_to_none=True)
                # Invoke the same backward primitive directly checked against
                # a full-graph autograd reference in CI. It applies the exact
                # DPO gradient while keeping only one segment graph alive.
                loss_value = backward_segmented_dpo_loss(
                    chosen, rejected, ref_good - ref_bad, beta, segment_log_probability
                )
                torch.nn.utils.clip_grad_norm_(list(trainable.values()), 1.0)
                optimizer.step()
                steps += 1
                losses.append(loss_value)
    if steps < len(records) or not all(math.isfinite(x) for x in losses):
        raise RuntimeError("Preference optimizer did not complete all gradient steps")
    if not any(not torch.equal(before[name], p.detach().cpu()) for name, p in trainable.items()):
        raise RuntimeError("Preference optimization made no trainable weight changes")

    # Re-evaluate the *training pairs* against their frozen pre-DPO scores,
    # measuring whether the optimizer actually improved chosen-vs-rejected
    # log-odds. This is diagnostic, NOT held-out or expert qualification.
    improvements = defaultdict(list)
    with torch.no_grad():
        for index, (domain, prompt, chosen_text, rejected_text) in enumerate(records):
            chosen = encode(prompt, chosen_text)
            rejected = encode(prompt, rejected_text)
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
        "preferenceTokenization": "on-demand-per-pair-no-eager-tensor-corpus",
    }


def train_retention_stage(
    model, tokenizer, supervised: list[dict], *, max_length: int,
    epochs: int, learning_rate: float, seed: int,
    sft_reference_weights: dict, anchor_strength: float = 0.01,
) -> dict:
    """Stage 3: supervised skill-rehearsal with post-SFT adapter anchoring.

    Reuses ONLY examples already checked for owner training rights and evaluation
    isolation in stage 1. No external teacher, scraping, new rights claim, or
    fabricated training data. The objective is response-only cross-entropy plus
    a mild L2 anchor to the adapter immediately after stage 1, before DPO.
    A real optimizer must change at least one trainable adapter parameter.
    In-sample loss is diagnostic only; hold-out qualification is still required.
    """
    import torch
    import torch.nn.functional as functional
    from sovereign_lora_trainer import interleave_training_examples, supervised_answer_segments

    if (not isinstance(epochs, int) or epochs < 1 or epochs > 5 or
            not math.isfinite(learning_rate) or not 0 < learning_rate <= 0.001 or
            not math.isfinite(anchor_strength) or not 0 <= anchor_strength <= 1):
        raise ValueError("Retention-stage hyperparameters exceed authorized bounds")
    if not supervised:
        raise ValueError("Retention stage requires owner-licensed supervised examples")

    trainable = {name: p for name, p in model.named_parameters() if p.requires_grad}
    if not trainable or set(trainable) != set(sft_reference_weights):
        raise ValueError("Retention stage requires exact post-SFT trainable adapter anchors")
    reference = {}
    before = {}
    for name, parameter in trainable.items():
        weights = sft_reference_weights[name]
        if weights.shape != parameter.shape or not bool(torch.isfinite(weights).all()):
            raise ValueError("Post-SFT reference weights are invalid")
        reference[name] = weights.detach().to(device=parameter.device, dtype=parameter.dtype).clone()
        before[name] = parameter.detach().cpu().clone()

    records = []
    for item in supervised:
        for segment in supervised_answer_segments(tokenizer, item, max_length):
            records.append({**segment, "domain": item["domain"]})
            if len(records) > 200000:
                raise ValueError("Retention rehearsal exceeded 200000 bounded training segments")
    records = interleave_training_examples(records, seed + 2)
    optimizer = torch.optim.AdamW(list(trainable.values()), lr=learning_rate, weight_decay=0.0)

    def response_loss(segment):
        ids = torch.tensor([segment["input_ids"]], dtype=torch.long,
                           device=next(model.parameters()).device)
        labels = torch.tensor([segment["labels"]], dtype=torch.long, device=ids.device)
        logits = model(input_ids=ids, attention_mask=torch.ones_like(ids)).logits[:, :-1, :].float()
        return functional.cross_entropy(
            logits.reshape(-1, logits.shape[-1]),
            labels[:, 1:].reshape(-1), ignore_index=-100,
        )

    # Inference-deterministic scoring for meaningful before/after diagnostics
    # and low-variance gradients. eval() still permits adapter optimization.
    model.eval()
    with torch.no_grad():
        initial = [float(response_loss(row).detach().cpu()) for row in records]
    if not all(math.isfinite(value) for value in initial):
        raise RuntimeError("Retention training started with non-finite supervised losses")

    steps = 0
    losses = []
    for _ in range(epochs):
        for row in records:
            optimizer.zero_grad(set_to_none=True)
            task_loss = response_loss(row)
            penalty = sum(
                (p.float() - reference[name].float()).square().mean()
                for name, p in trainable.items()
            ) / len(trainable)
            loss = task_loss + anchor_strength * penalty
            if not bool(torch.isfinite(loss)):
                raise RuntimeError("Non-finite retention training loss")
            loss.backward()
            torch.nn.utils.clip_grad_norm_(list(trainable.values()), 1.0)
            optimizer.step()
            steps += 1
            losses.append(float(loss.detach().cpu()))

    if steps != len(records) * epochs or not all(math.isfinite(value) for value in losses):
        raise RuntimeError("Retention optimizer did not execute all expected steps")
    if not any(not torch.equal(before[name], p.detach().cpu()) for name, p in trainable.items()):
        raise RuntimeError("Retention stage completed without changing trainable adapter weights")
    with torch.no_grad():
        final = [float(response_loss(row).detach().cpu()) for row in records]
    if not all(math.isfinite(value) for value in final):
        raise RuntimeError("Retention stage produced non-finite supervised losses")
    return {
        "algorithm": "anchored-response-only-retention-rehearsal",
        "trainingData": "previously-rights-cleared-supervised-only",
        "trainingDataIndependent": False,
        "source": "post-preference-stage-three",
        "epochs": epochs,
        "learningRate": learning_rate,
        "anchorStrength": anchor_strength,
        "exampleCount": len(supervised),
        "segmentCount": len(records),
        "optimizationSteps": steps,
        "initialTrainingLoss": sum(initial) / len(initial),
        "finalTrainingLoss": sum(final) / len(final),
        "meanOptimizationLoss": sum(losses) / len(losses),
        "trainableParametersChanged": True,
        "evidenceScope": "in-sample-only-not-independent-model-quality",
    }
