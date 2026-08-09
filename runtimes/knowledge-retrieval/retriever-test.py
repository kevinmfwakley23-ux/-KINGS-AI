from __future__ import annotations

from pathlib import Path

from retriever import KnowledgeRetriever


PROJECT_ROOT = (
    Path.home() / "kings-collectibles-1"
)

EXTRACTED_ROOT = (
    PROJECT_ROOT
    / "knowledge"
    / "indexes"
    / "extracted"
)


def require(
    condition: bool,
    message: str,
) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    retriever = KnowledgeRetriever(
        EXTRACTED_ROOT
    )

    # ------------------------------------------------------------
    # Basic retrieval
    # ------------------------------------------------------------

    results = retriever.search(
        "Collector's Kingdom",
        limit=5,
    )

    require(
        len(results) > 0,
        "Collector's Kingdom returned no results.",
    )

    print(
        "Collector's Kingdom retrieval: SUCCESS"
    )

    # ------------------------------------------------------------
    # Provenance
    # ------------------------------------------------------------

    result = results[0]

    required_fields = [
        "sourceId",
        "title",
        "type",
        "authority",
        "sha256",
        "path",
        "page",
        "text",
    ]

    for field in required_fields:
        require(
            field in result,
            f"Missing provenance field: {field}",
        )

    require(
        result["page"] >= 1,
        "Invalid page provenance.",
    )

    require(
        len(result["sha256"]) == 64,
        "Invalid SHA-256 provenance.",
    )

    print(
        "Provenance fields: SUCCESS"
    )

    # ------------------------------------------------------------
    # Vault retrieval
    # ------------------------------------------------------------

    vault_results = retriever.search(
        "Vault collector collection",
        limit=10,
    )

    require(
        len(vault_results) > 0,
        "Vault query returned no results.",
    )

    require(
        any(
            "vault"
            in item["text"].lower()
            for item in vault_results
        ),
        "Vault query returned no Vault evidence.",
    )

    print(
        "Vault retrieval: SUCCESS"
    )

    # ------------------------------------------------------------
    # Keeper retrieval
    # ------------------------------------------------------------

    keeper_results = retriever.search(
        "Keeper collector guidance",
        limit=10,
    )

    require(
        len(keeper_results) > 0,
        "Keeper query returned no results.",
    )

    require(
        any(
            "keeper"
            in item["text"].lower()
            for item in keeper_results
        ),
        "Keeper query returned no Keeper evidence.",
    )

    print(
        "Keeper retrieval: SUCCESS"
    )

    # ------------------------------------------------------------
    # Blueprint filtering
    # ------------------------------------------------------------

    blueprint_results = retriever.search(
        "Collector's Kingdom",
        limit=20,
        source_type="blueprint",
    )

    require(
        len(blueprint_results) > 0,
        "Blueprint filter returned no results.",
    )

    require(
        all(
            item["type"] == "blueprint"
            for item in blueprint_results
        ),
        "Blueprint filter returned another source type.",
    )

    require(
        all(
            item["authority"] == "product-blueprint"
            for item in blueprint_results
        ),
        "Blueprint filter returned incorrect authority.",
    )

    print(
        "Blueprint source filter: SUCCESS"
    )

    # ------------------------------------------------------------
    # Construction-document filtering
    # ------------------------------------------------------------

    construction_results = retriever.search(
        "Collector's Kingdom",
        limit=20,
        source_type="construction-document",
    )

    require(
        len(construction_results) > 0,
        "Construction-document filter returned no results.",
    )

    require(
        all(
            item["type"] == "construction-document"
            for item in construction_results
        ),
        "Construction-document filter returned another source type.",
    )

    require(
        all(
            item["authority"] == "construction-document"
            for item in construction_results
        ),
        "Construction-document filter returned incorrect authority.",
    )

    print(
        "Construction-document source filter: SUCCESS"
    )

    # ------------------------------------------------------------
    # Build-directive filtering
    # ------------------------------------------------------------

    directive_results = retriever.search(
        "Keeper Framework",
        limit=10,
        source_type="build-directive",
    )

    require(
        len(directive_results) > 0,
        "Build-directive filter returned no results.",
    )

    require(
        all(
            item["type"] == "build-directive"
            for item in directive_results
        ),
        "Build-directive filter returned another source type.",
    )

    require(
        all(
            item["authority"] == "ai-build-directive"
            for item in directive_results
        ),
        "Build-directive filter returned incorrect authority.",
    )

    print(
        "Build-directive source filter: SUCCESS"
    )

    # ------------------------------------------------------------
    # Non-matching source filter
    # ------------------------------------------------------------

    impossible_results = retriever.search(
        "Collector's Kingdom",
        limit=10,
        source_type="repository",
    )

    require(
        len(impossible_results) == 0,
        "Repository filter unexpectedly returned project documents.",
    )

    print(
        "Non-matching source filter: SUCCESS"
    )

    # ------------------------------------------------------------
    # Result limit
    # ------------------------------------------------------------

    limited_results = retriever.search(
        "Kingdom",
        limit=3,
    )

    require(
        len(limited_results) <= 3,
        "Result limit was not respected.",
    )

    print(
        "Result limit: SUCCESS"
    )

    # ------------------------------------------------------------
    # Empty query rejection
    # ------------------------------------------------------------

    try:
        retriever.search("")
    except ValueError:
        pass
    else:
        raise AssertionError(
            "Empty query was not rejected."
        )

    print(
        "Empty query rejection: SUCCESS"
    )

    # ------------------------------------------------------------
    # Meaningless query rejection
    # ------------------------------------------------------------

    try:
        retriever.search("---")
    except ValueError:
        pass
    else:
        raise AssertionError(
            "Meaningless query was not rejected."
        )

    print(
        "Meaningless query rejection: SUCCESS"
    )

    print(
        "Knowledge retrieval tests: SUCCESS"
    )


if __name__ == "__main__":
    main()
