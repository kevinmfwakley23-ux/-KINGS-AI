"""Reproducible offline fingerprint of owner-held pretrained model files.

A config.json hash does not bind the actual base-model weights. This module
hashes file *contents*, not timestamps, without contacting an external service.
It does not validate license rights or prove a model's intelligence.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import stat

MAX_MODEL_FILES = 8192
READ_CHUNK_BYTES = 1024 * 1024


def _is_weight_file(name: str) -> bool:
    return name.endswith(".safetensors") or (
        name.endswith(".bin") and (
            name == "pytorch_model.bin"
            or name.startswith("pytorch_model-")
            or name == "model.bin"
            or name.startswith("model-")
        )
    )


def fingerprint_base_model(path: Path) -> dict:
    """Fail closed on missing, empty, nonregular or symlinked model assets.

    The digest binds sorted relative file names, sizes and SHA-256 byte hashes.
    The owner must point training at a stable private snapshot, not a mutable
    shared model cache; files are checked again before model export.
    """
    if not path.is_absolute() or path.is_symlink() or not path.is_dir():
        raise ValueError("Base model must be an absolute, non-symlink directory")
    if not (path / "config.json").is_file():
        raise ValueError("Base model requires config.json")
    records = []
    weight_count = 0
    total_bytes = 0
    for directory, subdirs, filenames in os.walk(path, followlinks=False):
        subdirs.sort()
        filenames.sort()
        for dirname in subdirs:
            child = Path(directory) / dirname
            if child.is_symlink():
                raise ValueError("Base model contains a symlinked directory")
        for filename in filenames:
            item = Path(directory) / filename
            info = item.lstat()
            if not stat.S_ISREG(info.st_mode):
                raise ValueError("Base model contains a symlink or nonregular file")
            if info.st_size <= 0:
                raise ValueError("Base model contains an empty file")
            if len(records) >= MAX_MODEL_FILES:
                raise ValueError("Base model exceeds bounded file count")
            digest = hashlib.sha256()
            read_bytes = 0
            with item.open("rb") as handle:
                while chunk := handle.read(READ_CHUNK_BYTES):
                    digest.update(chunk)
                    read_bytes += len(chunk)
            if read_bytes != info.st_size:
                raise RuntimeError("Base model file changed while hashing")
            relative = item.relative_to(path).as_posix()
            records.append((relative, read_bytes, digest.hexdigest()))
            total_bytes += read_bytes
            if _is_weight_file(filename):
                weight_count += 1
    if weight_count == 0:
        raise ValueError("Base model has no nonempty safetensors or PyTorch weight file")
    if not any(row[0] == "config.json" for row in records):
        raise ValueError("Base model config.json is not a regular file")
    combined = hashlib.sha256()
    for record in sorted(records):
        row = json.dumps(record, separators=(",", ":"), ensure_ascii=True).encode("utf8")
        combined.update(len(row).to_bytes(4, "big"))
        combined.update(row)
    return {
        "sha256": combined.hexdigest(),
        "fileCount": len(records),
        "weightFileCount": weight_count,
        "totalBytes": total_bytes,
        "scope": "all-regular-local-base-model-files-content-addressed",
    }
