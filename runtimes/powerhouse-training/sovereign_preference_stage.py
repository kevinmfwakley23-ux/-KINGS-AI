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
