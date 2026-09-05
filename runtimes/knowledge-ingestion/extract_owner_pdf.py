from __future__ import annotations

import json
import sys
from pathlib import Path

from pypdf import PdfReader


def fail(message: str) -> None:
    sys.stderr.write(json.dumps({"ok": False, "error": message}, ensure_ascii=False) + "\n")
    raise SystemExit(2)


def main() -> None:
    if len(sys.argv) != 2:
        fail("Usage: extract_owner_pdf.py <pdf-path>")

    path = Path(sys.argv[1]).resolve()
    if not path.is_file():
        fail(f"PDF file not found: {path}")

    try:
        reader = PdfReader(str(path), strict=False)
    except Exception as error:  # pypdf exposes several parser-specific errors.
        fail(f"Could not parse PDF: {error}")

    if reader.is_encrypted:
        try:
            unlocked = reader.decrypt("")
        except Exception as error:
            fail(f"Encrypted PDF could not be opened: {error}")
        if not unlocked:
            fail("Encrypted PDF requires a password and cannot be imported by the owner console.")

    pages: list[dict[str, object]] = []
    combined: list[str] = []

    for number, page in enumerate(reader.pages, start=1):
        try:
            text = (page.extract_text() or "").replace("\x00", "").strip()
        except Exception as error:
            fail(f"Could not extract text from PDF page {number}: {error}")

        pages.append(
            {
                "page": number,
                "characterCount": len(text),
            }
        )
        if text:
            combined.append(f"[Page {number}]\n{text}")

    extracted = "\n\n".join(combined).strip()
    if not extracted:
        fail(
            "PDF contains no extractable text. Scanned/image-only PDFs need OCR before they can be used as K.I.N.G.S. project context."
        )

    sys.stdout.write(
        json.dumps(
            {
                "ok": True,
                "pageCount": len(reader.pages),
                "characterCount": len(extracted),
                "pages": pages,
                "text": extracted,
            },
            ensure_ascii=False,
        )
        + "\n"
    )


if __name__ == "__main__":
    main()
