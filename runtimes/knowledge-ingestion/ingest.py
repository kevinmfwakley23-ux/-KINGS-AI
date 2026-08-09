from __future__ import annotations

import hashlib
import json
from pathlib import Path

from pypdf import PdfReader


PROJECT_ROOT = (
    Path.home() / "kings-collectibles-1"
)

KNOWLEDGE_ROOT = (
    PROJECT_ROOT / "knowledge"
)

MANIFEST_PATH = (
    KNOWLEDGE_ROOT /
    "indexes" /
    "project-knowledge.json"
)

OUTPUT_ROOT = (
    KNOWLEDGE_ROOT /
    "indexes" /
    "extracted"
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for chunk in iter(
            lambda: handle.read(1024 * 1024),
            b"",
        ):
            digest.update(chunk)

    return digest.hexdigest()


def load_manifest() -> dict:
    with MANIFEST_PATH.open(
        "r",
        encoding="utf-8",
    ) as handle:
        return json.load(handle)


def verify_source(
    source: dict,
) -> Path:
    relative_path = Path(
        source["path"]
    )

    path = (
        KNOWLEDGE_ROOT /
        relative_path
    ).resolve()

    knowledge_root = (
        KNOWLEDGE_ROOT.resolve()
    )

    if (
        path != knowledge_root
        and knowledge_root not in path.parents
    ):
        raise RuntimeError(
            f"Source escapes knowledge root: {path}"
        )

    if not path.is_file():
        raise RuntimeError(
            f"Source file not found: {path}"
        )

    actual_hash = sha256_file(path)

    if actual_hash != source["sha256"]:
        raise RuntimeError(
            "Source hash mismatch for "
            f"{source['id']}: "
            f"expected {source['sha256']}, "
            f"got {actual_hash}"
        )

    return path


def extract_source(
    source: dict,
) -> dict:
    path = verify_source(source)

    reader = PdfReader(str(path))

    pages = []

    for page_number, page in enumerate(
        reader.pages,
        start=1,
    ):
        text = page.extract_text() or ""

        pages.append(
            {
                "page": page_number,
                "text": text,
                "characterCount": len(text),
            }
        )

    return {
        "sourceId": source["id"],
        "type": source["type"],
        "title": source["title"],
        "authority": source["authority"],
        "status": source["status"],
        "path": source["path"],
        "sha256": source["sha256"],
        "pageCount": len(reader.pages),
        "pages": pages,
    }


def write_extraction(
    source: dict,
    result: dict,
) -> Path:
    OUTPUT_ROOT.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_path = (
        OUTPUT_ROOT /
        f"{source['id']}.json"
    )

    with output_path.open(
        "w",
        encoding="utf-8",
    ) as handle:
        json.dump(
            result,
            handle,
            indent=2,
            ensure_ascii=False,
        )
        handle.write("\n")

    return output_path


def main() -> None:
    manifest = load_manifest()

    sources = manifest.get(
        "sources",
        [],
    )

    if not sources:
        raise RuntimeError(
            "Knowledge manifest contains no sources."
        )

    print(
        f"Found {len(sources)} authoritative sources."
    )

    for source in sources:
        print(
            f"Verifying: {source['id']}"
        )

        result = extract_source(source)

        output_path = write_extraction(
            source,
            result,
        )

        print(
            f"  pages: {result['pageCount']}"
        )
        print(
            f"  extracted: {output_path}"
        )

    print(
        "Knowledge document ingestion: SUCCESS"
    )


if __name__ == "__main__":
    main()
