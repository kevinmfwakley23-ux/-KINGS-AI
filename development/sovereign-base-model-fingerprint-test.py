#!/usr/bin/env python3
"""Local offline unit regression for base-model byte provenance."""
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "runtimes" / "powerhouse-training"))
from sovereign_base_model_fingerprint import fingerprint_base_model


def refused(root, expected):
    try:
        fingerprint_base_model(root)
    except (ValueError, RuntimeError) as error:
        assert expected in str(error), str(error)
    else:
        raise AssertionError("Unsafe base-model snapshot was accepted: " + expected)


def run():
    with TemporaryDirectory(prefix="kings-base-fingerprint-") as folder:
        root = Path(folder).resolve() / "model"
        root.mkdir()
        config = root / "config.json"
        weights = root / "model.safetensors"
        config.write_text(json.dumps({"model_type": "gpt2"}), encoding="utf8")
        weights.write_bytes(b"synthetic-weights-only")
        first = fingerprint_base_model(root)
        again = fingerprint_base_model(root)
        assert first == again
        assert first["weightFileCount"] == 1
        assert first["fileCount"] == 2
        assert first["totalBytes"] > 0
        assert len(first["sha256"]) == 64
        assert "all-regular" in first["scope"]

        weights.write_bytes(b"synthetic-weights-else")
        second = fingerprint_base_model(root)
        assert first["sha256"] != second["sha256"], "Weight mutations must change identity"

        config.write_text(json.dumps({"model_type": "llama"}), encoding="utf8")
        third = fingerprint_base_model(root)
        assert third["sha256"] != second["sha256"], "Config mutations must change identity"

        weights.unlink()
        refused(root, "no nonempty")
        weights.write_bytes(b"")
        refused(root, "empty file")
        weights.unlink()
        weights.symlink_to(config)
        refused(root, "symlink")
        weights.unlink()
        weights.write_bytes(b"synthetic-weights-only")

        outside = Path(folder) / "other"
        outside.mkdir()
        (outside / "extra").write_bytes(b"no-secret-access")
        (root / "linked").symlink_to(outside, target_is_directory=True)
        refused(root, "symlinked directory")
        (root / "linked").unlink()

        asset = root / "tokenizer.json"
        asset.write_text('{"ok": true}', encoding="utf8")
        fourth = fingerprint_base_model(root)
        assert fourth["fileCount"] == 3
        assert fourth["sha256"] != first["sha256"], "Tokenizer mutations must be bound"
        refused(root.resolve() / "missing", "absolute, non-symlink")
    print("K.I.N.G.S. sovereign base-model content fingerprint: PASS")


if __name__ == "__main__":
    run()
