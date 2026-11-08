"""Offline, response-only held-out loss measurements for sovereign training.

This module never trains, downloads models, invokes a model judge, or promotes
teacher-forced loss to proof of coding/collectibles/writing competence. It only
evaluates explicitly rights-cleared held-out references, separated by source
group and prompt from all training samples by the trainer's existing preflight.
"""
from __future__ import annotations

from collections import defaultdict, Counter
import math
from pathlib import Path


MAX_HELDOUT_REFERENCES_PER_DOMAIN = 200


def validate_heldout_references(path: Path) -> list[dict]:
    """Accept optional held-out reference answers, or return [] for legacy manifests.

    All seven domains must participate when any held-out target is supplied.
    Owners must attest evaluation rights separately from training permission.
    No held-out content is ever fed into an optimizer.
    """
    from sovereign_lora_trainer import DOMAINS, HEX_SHA256, _load_json

    manifest = _load_json(path)
    items = manifest.get("items")
    if not isinstance(items, list):
        raise ValueError("Benchmark manifest must supply items")
    references = []
    all_benchmark_ids = set()
    protected_groups = set()
    seen_prompts = set()
    # Do not let a benchmark-marked train/validation/test item secretly reuse
    # the same source group or normalized prompt as an evaluation-only item.
    all_group_counts = Counter(
        row.get("sourceGroupId") for row in items
        if isinstance(row, dict) and isinstance(row.get("sourceGroupId"), str)
    )
    all_prompt_counts = Counter(
        " ".join(row["prompt"].lower().split()) for row in items
        if isinstance(row, dict) and isinstance(row.get("prompt"), str)
    )
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("Benchmark item must be an object")
        identifier = item.get("id")
        if not isinstance(identifier, str) or not identifier.strip() or identifier in all_benchmark_ids:
            raise ValueError("Benchmark item ids must be unique and nonempty")
        all_benchmark_ids.add(identifier)
        if item.get("split") == "held-out" and "targetResponse" in item:
            if item.get("domain") not in DOMAINS:
                raise ValueError("Held-out reference must declare a known specialty domain")
            response = item["targetResponse"]
            if not isinstance(response, str) or not response.strip():
                raise ValueError("Held-out targetResponse cannot be empty")
            prompt = item.get("prompt")
            group = item.get("sourceGroupId")
            if not isinstance(prompt, str) or not prompt.strip():
                raise ValueError("Held-out reference prompt is required")
            if not isinstance(group, str) or not group.strip():
                raise ValueError("Held-out reference sourceGroupId is required")
            normalized = " ".join(prompt.lower().split())
            if all_group_counts[group] != 1 or all_prompt_counts[normalized] != 1:
                raise ValueError("Held-out references cannot reuse source groups or prompts across benchmark splits")
            if normalized in seen_prompts:
                raise ValueError("Held-out reference prompts must be unique")
            seen_prompts.add(normalized)
            if group in protected_groups:
                raise ValueError("Held-out references require separate source groups")
            protected_groups.add(group)
            rights = item.get("rights")
            if (not isinstance(rights, dict) or rights.get("evaluationAllowed") is not True
                    or rights.get("trainingAllowed") is True):
                raise ValueError("Held-out reference needs evaluation-only permission")
            digest = rights.get("permissionEvidenceSha256")
            if not isinstance(digest, str) or not HEX_SHA256.fullmatch(digest):
                raise ValueError("Held-out evaluation rights need a SHA-256 evidence reference")
            for key in ("licenseId", "sourceReference", "permissionReference", "attestedBy"):
                if not isinstance(rights.get(key), str) or not rights[key].strip():
                    raise ValueError("Missing held-out evaluation rights attestation: " + key)
            references.append(item)
    if references and set(item["domain"] for item in references) != DOMAINS:
        raise ValueError("Held-out reference measurement requires all seven specialties")
    domain_counts = Counter(row["domain"] for row in references)
    if any(count > MAX_HELDOUT_REFERENCES_PER_DOMAIN for count in domain_counts.values()):
        raise ValueError("Held-out references exceed maximum 200 per specialty; split the evaluation into separately authorized benchmark runs")
    return references


def measure_heldout_reference_loss(model, tokenizer, references: list[dict], *, max_length: int) -> dict:
    """Score bounded unseen references using masked, token-weighted NLL.

    Scores are teacher-forced reference likelihood; they neither involve
    generated answers nor independently verify reasoning or factual expertise.
    """
    from sovereign_lora_trainer import DOMAINS, supervised_answer_segments
    import torch

    if not references or set(row["domain"] for row in references) != DOMAINS:
        raise ValueError("Held-out scoring requires seven represented specialties")
    if max_length < 128 or max_length > 32768:
        raise ValueError("Held-out model context length is outside trainer bounds")

    # Evaluate *every* authorized reference, never silently take only the
    # lowest IDs. The bounded cap prevents accidental unbounded GPU work.
    domain_counts = Counter(row["domain"] for row in references)
    if any(count > MAX_HELDOUT_REFERENCES_PER_DOMAIN for count in domain_counts.values()):
        raise ValueError("Held-out references exceed maximum 200 per specialty")
    selected = defaultdict(list)
    for row in sorted(references, key=lambda x: (x["domain"], x["id"])):
        selected[row["domain"]].append(row)

    by_domain = defaultdict(lambda: [0.0, 0, 0])
    device = next(model.parameters()).device
    was_training = model.training
    model.eval()
    try:
        with torch.no_grad():
            for domain in sorted(selected):
                for row in selected[domain]:
                    segments = supervised_answer_segments(tokenizer, row, max_length)
                    for segment in segments:
                        ids = torch.tensor([segment["input_ids"]], dtype=torch.long, device=device)
                        labels = torch.tensor([segment["labels"]], dtype=torch.long, device=device)
                        logits = model(input_ids=ids, attention_mask=torch.ones_like(ids)).logits[:, :-1, :].float()
                        active = labels[:, 1:] != -100
                        selected_logprobs = torch.log_softmax(logits, dim=-1).gather(
                            -1, ids[:, 1:].unsqueeze(-1)
                        ).squeeze(-1)
                        nll = -float(selected_logprobs.masked_select(active).sum().cpu())
                        count = int(active.sum().item())
                        if count < 1 or not math.isfinite(nll):
                            raise RuntimeError("Held-out token likelihood is missing or non-finite")
                        by_domain[domain][0] += nll
                        by_domain[domain][1] += count
                    by_domain[domain][2] += 1
    finally:
        model.train(was_training)

    if set(by_domain) != DOMAINS:
        raise RuntimeError("Held-out scorer did not cover every specialty")
    token_counts = {d: by_domain[d][1] for d in sorted(by_domain)}
    sample_counts = {d: by_domain[d][2] for d in sorted(by_domain)}
    losses = {d: by_domain[d][0] / by_domain[d][1] for d in sorted(by_domain)}
    total_tokens = sum(token_counts.values())
    overall = sum(by_domain[d][0] for d in by_domain) / total_tokens
    if not math.isfinite(overall) or not all(math.isfinite(v) for v in losses.values()):
        raise RuntimeError("Non-finite held-out evidence")
    return {
        "referenceNegativeLogLikelihoodPerToken": overall,
        "negativeLogLikelihoodPerTokenByDomain": losses,
        "evaluatedExamplesByDomain": sample_counts,
        "evaluatedTokensByDomain": token_counts,
        "sampling": "all-authorized-references-max-200-per-domain",
        "scope": "held-out-teacher-forced-reference-loss-not-expert-qualification",
    }


def compare_heldout_reference_loss(before: dict, after: dict) -> dict:
    """Summarize actual held-out proxy movement without inventing quality claims."""
    from sovereign_lora_trainer import DOMAINS

    a = before["negativeLogLikelihoodPerTokenByDomain"]
    b = after["negativeLogLikelihoodPerTokenByDomain"]
    if set(a) != DOMAINS or set(b) != DOMAINS:
        raise ValueError("Seven domains required for held-out comparison")
    if (before["evaluatedExamplesByDomain"] != after["evaluatedExamplesByDomain"] or
            before["evaluatedTokensByDomain"] != after["evaluatedTokensByDomain"]):
        raise ValueError("Held-out evaluation samples or target token counts changed between checkpoints")
    gains = {d: a[d] - b[d] for d in sorted(DOMAINS)}
    if not all(math.isfinite(v) for v in gains.values()):
        raise ValueError("Held-out delta must be finite")
    if any(not math.isfinite(a[d]) or a[d] <= 0 or not math.isfinite(b[d]) or b[d] < 0
           for d in DOMAINS):
        raise ValueError("Held-out reference losses must be finite and nonnegative with positive baselines")
    regression_fraction = {
        d: max(0.0, (b[d] - a[d]) / a[d]) for d in sorted(DOMAINS)
    }
    return {
        "baseline": before,
        "final": after,
        "negativeLogLikelihoodReductionByDomain": gains,
        "regressionFractionByDomain": regression_fraction,
        "regressedDomains": [d for d in sorted(gains) if gains[d] < 0],
        "anyDomainRegressedOverFivePercent": any(v > 0.05 for v in regression_fraction.values()),
        "improvedDomains": [d for d in sorted(gains) if gains[d] > 0],
        "allSevenDomainsImproved": all(v > 0 for v in gains.values()),
        "hasAtLeast20ReferencesPerDomain": all(
            count >= 20 for count in after["evaluatedExamplesByDomain"].values()
        ),
        "independentExpertQualification": False,
        "scope": "held-out-reference-loss-proxy-only-separate-specialist-evaluations-required",
    }
