from __future__ import annotations

import hashlib
import json
import tempfile
from pathlib import Path

from retriever import KnowledgeRetriever


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def write_source(root: Path, source_id: str, source_type: str, authority: str, text: str) -> None:
    payload = {
        "sourceId": source_id,
        "title": f"{source_id} title",
        "type": source_type,
        "authority": authority,
        "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "path": f"/fixtures/{source_id}.md",
        "pages": [{"page": 1, "text": text}],
    }
    (root / f"{source_id}.json").write_text(json.dumps(payload), encoding="utf-8")


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="kings-knowledge-test-") as directory:
        extracted_root = Path(directory)
        write_source(
            extracted_root,
            "blueprint-fixture",
            "blueprint",
            "product-blueprint",
            "Collector's Kingdom includes the Vault collector collection and Keeper collector guidance.",
        )
        write_source(
            extracted_root,
            "construction-fixture",
            "construction-document",
            "construction-document",
            "Collector's Kingdom construction document defines the collector domain and Vault.",
        )
        write_source(
            extracted_root,
            "directive-fixture",
            "build-directive",
            "ai-build-directive",
            "Keeper Framework build directive for Collector's Kingdom.",
        )

        retriever = KnowledgeRetriever(extracted_root)

        results = retriever.search("Collector's Kingdom", limit=5)
        require(len(results) > 0, "Collector's Kingdom returned no results.")
        result = results[0]
        for field in ["sourceId", "title", "type", "authority", "sha256", "path", "page", "text"]:
            require(field in result, f"Missing provenance field: {field}")
        require(result["page"] >= 1, "Invalid page provenance.")
        require(len(result["sha256"]) == 64, "Invalid SHA-256 provenance.")

        vault_results = retriever.search("Vault collector collection", limit=10)
        require(any("vault" in item["text"].lower() for item in vault_results), "Vault query returned no Vault evidence.")

        keeper_results = retriever.search("Keeper collector guidance", limit=10)
        require(any("keeper" in item["text"].lower() for item in keeper_results), "Keeper query returned no Keeper evidence.")

        blueprint_results = retriever.search("Collector's Kingdom", limit=20, source_type="blueprint")
        require(len(blueprint_results) > 0, "Blueprint filter returned no results.")
        require(all(item["type"] == "blueprint" and item["authority"] == "product-blueprint" for item in blueprint_results), "Blueprint filter provenance is invalid.")

        construction_results = retriever.search("Collector's Kingdom", limit=20, source_type="construction-document")
        require(len(construction_results) > 0, "Construction-document filter returned no results.")
        require(all(item["authority"] == "construction-document" for item in construction_results), "Construction authority is invalid.")

        directive_results = retriever.search("Keeper Framework", limit=10, source_type="build-directive")
        require(len(directive_results) > 0, "Build-directive filter returned no results.")
        require(all(item["authority"] == "ai-build-directive" for item in directive_results), "Build-directive authority is invalid.")

        require(retriever.search("Collector's Kingdom", source_type="repository") == [], "Repository filter unexpectedly returned project documents.")
        require(len(retriever.search("Kingdom", limit=3)) <= 3, "Result limit was not respected.")

        for invalid_query in ("", "---"):
            try:
                retriever.search(invalid_query)
            except ValueError:
                pass
            else:
                raise AssertionError(f"Invalid query was not rejected: {invalid_query!r}")

    print("Knowledge retrieval tests: SUCCESS")


if __name__ == "__main__":
    main()
