from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


PROJECT_ROOT = (
    Path.home() / "kings-collectibles-1"
)

EXTRACTED_ROOT = (
    PROJECT_ROOT
    / "knowledge"
    / "indexes"
    / "extracted"
)


class KnowledgeRetriever:
    def __init__(
        self,
        extracted_root: Path = EXTRACTED_ROOT,
    ) -> None:
        self.extracted_root = extracted_root

    def _load_sources(self) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []

        for path in sorted(
            self.extracted_root.glob("*.json")
        ):
            with path.open(
                "r",
                encoding="utf-8",
            ) as handle:
                records.append(json.load(handle))

        return records

    @staticmethod
    def _terms(query: str) -> list[str]:
        return [
            term.lower()
            for term in re.findall(
                r"[A-Za-z0-9][A-Za-z0-9'-]*",
                query,
            )
            if len(term) >= 2
        ]

    @staticmethod
    def _score(
        query_terms: list[str],
        text: str,
    ) -> int:
        lowered = text.lower()

        score = 0

        for term in query_terms:
            occurrences = lowered.count(term)

            if occurrences:
                score += min(
                    occurrences,
                    10,
                )

        return score

    def search(
        self,
        query: str,
        limit: int = 10,
        source_type: str | None = None,
        source_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        if not query.strip():
            raise ValueError(
                "Knowledge retrieval query is required."
            )

        if limit < 1:
            raise ValueError(
                "Knowledge retrieval limit must be positive."
            )

        query_terms = self._terms(query)

        if not query_terms:
            raise ValueError(
                "Knowledge retrieval query contains no searchable terms."
            )

        allowed_source_ids = (
            set(source_ids)
            if source_ids is not None
            else None
        )

        matches: list[dict[str, Any]] = []

        for source in self._load_sources():
            if (
                source_type is not None
                and source["type"] != source_type
            ):
                continue

            if (
                allowed_source_ids is not None
                and source["sourceId"]
                not in allowed_source_ids
            ):
                continue

            for page in source["pages"]:
                text = page.get(
                    "text",
                    "",
                )

                score = self._score(
                    query_terms,
                    text,
                )

                if score <= 0:
                    continue

                matches.append(
                    {
                        "score": score,
                        "sourceId": source["sourceId"],
                        "title": source["title"],
                        "type": source["type"],
                        "authority": source["authority"],
                        "sha256": source["sha256"],
                        "path": source["path"],
                        "page": page["page"],
                        "text": text,
                    }
                )

        matches.sort(
            key=lambda item: (
                -item["score"],
                item["sourceId"],
                item["page"],
            )
        )

        return matches[:limit]


def main() -> None:
    retriever = KnowledgeRetriever()

    query = "Collector's Kingdom"

    results = retriever.search(
        query,
        limit=5,
    )

    print(
        f"Query: {query}"
    )
    print(
        f"Results: {len(results)}"
    )

    for result in results:
        print()
        print(
            f"[score={result['score']}] "
            f"{result['title']} "
            f"(page {result['page']})"
        )
        print(
            f"sourceId: {result['sourceId']}"
        )
        print(
            f"authority: {result['authority']}"
        )
        print(
            f"sha256: {result['sha256']}"
        )
        print(
            result["text"][:500].replace(
                "\n",
                " ",
            )
        )


if __name__ == "__main__":
    main()
