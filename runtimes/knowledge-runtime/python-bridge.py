from __future__ import annotations

import json
import sys
from pathlib import Path


RETRIEVAL_ROOT = (
    Path(__file__).resolve().parent.parent
    / "knowledge-retrieval"
)

sys.path.insert(
    0,
    str(RETRIEVAL_ROOT),
)

from retriever import KnowledgeRetriever


def handle_request(
    request: dict,
    retriever: KnowledgeRetriever,
) -> dict:
    query = request.get("query")

    if not isinstance(query, str):
        raise ValueError(
            "query must be a string"
        )

    limit = request.get("limit", 10)

    if not isinstance(limit, int):
        raise ValueError(
            "limit must be an integer"
        )

    source_ids = request.get("sourceIds")

    if source_ids is not None:
        if not isinstance(source_ids, list):
            raise ValueError(
                "sourceIds must be a list"
            )

    results = retriever.search(
        query=query,
        limit=limit,
        source_ids=source_ids,
    )

    return {
        "query": query,
        "results": results,
    }


def main() -> None:
    retriever = KnowledgeRetriever()

    for line in sys.stdin:
        line = line.strip()

        if not line:
            continue

        try:
            request = json.loads(line)

            response = handle_request(
                request,
                retriever,
            )

            print(
                json.dumps(
                    response,
                    ensure_ascii=False,
                ),
                flush=True,
            )

        except Exception as error:
            print(
                json.dumps(
                    {
                        "error": str(error),
                    }
                ),
                flush=True,
            )


if __name__ == "__main__":
    main()
