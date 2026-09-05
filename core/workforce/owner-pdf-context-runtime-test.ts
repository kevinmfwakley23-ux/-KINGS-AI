import {
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  tmpdir,
} from "node:os";
import {
  join,
  resolve,
} from "node:path";

import {
  OwnerPdfContextRuntime,
} from "./owner-pdf-context-runtime";

function assert(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function main(): Promise<void> {
  const root = await mkdtemp(
    join(tmpdir(), "kings-owner-pdf-context-"),
  );
  const storePath = join(root, "owner-context.json");
  const extractorPath = resolve(
    process.cwd(),
    "runtimes/knowledge-ingestion/extract_owner_pdf.py",
  );

  try {
    const runtime = new OwnerPdfContextRuntime({
      storePath,
      extractorPath,
    });
    await runtime.initialize();

    const sourcePdf = createTextPdf("KINGS PDF CONTEXT TEST");
    const imported = await runtime.ingestPdf(
      "KINGS Product Requirements.pdf",
      sourcePdf,
    );

    assert(
      imported.pageCount === 1,
      "Real PDF extractor must preserve page count.",
    );
    assert(
      imported.characterCount > 0,
      "Real PDF extractor must produce non-empty project context.",
    );
    assert(
      /^[a-f0-9]{64}$/u.test(imported.sha256),
      "Imported PDF must receive SHA-256 provenance.",
    );
    assert(
      imported.sourcePreserved === true,
      "Owner PDF metadata must report that the original source is preserved.",
    );

    const duplicate = await runtime.ingestPdf(
      "Same Bytes Different Name.pdf",
      sourcePdf,
    );
    assert(
      duplicate.id === imported.id,
      "Identical PDF bytes must de-duplicate to the same governed source identity.",
    );

    const listed = runtime.list();
    assert(
      listed.length === 1 && listed[0].id === imported.id,
      "Persisted PDF context must be visible by metadata without exposing editable extracted text.",
    );
    assert(
      !("text" in listed[0]),
      "Context listing must not expose extracted text back to the browser boundary.",
    );

    const resolved = runtime.resolve([imported.id]);
    assert(
      resolved.length === 1 &&
      resolved[0].text.includes("KINGS PDF CONTEXT TEST"),
      "Server-issued context id must resolve to the real extracted PDF text for mission planning.",
    );

    console.log(
      "05.OWNER-PDF real PDF -> local extraction -> governed context: SUCCESS",
    );

    const restarted = new OwnerPdfContextRuntime({
      storePath,
      extractorPath,
    });
    await restarted.initialize();
    const restored = restarted.resolve([imported.id]);
    assert(
      restored[0].sha256 === imported.sha256 &&
      restored[0].text.includes("KINGS PDF CONTEXT TEST"),
      "Extracted PDF context, original source, and provenance must survive a runtime restart.",
    );

    console.log(
      "05.OWNER-PDF restart + source-hash verification: SUCCESS",
    );

    let invalidRejected = false;
    try {
      await runtime.ingestPdf(
        "not-a-pdf.pdf",
        Buffer.from("this is not a pdf", "utf8"),
      );
    } catch {
      invalidRejected = true;
    }
    assert(
      invalidRejected,
      "Non-PDF bytes must fail closed before the extractor is invoked.",
    );

    let unknownRejected = false;
    try {
      runtime.resolve(["owner-pdf-does-not-exist"]);
    } catch {
      unknownRejected = true;
    }
    assert(
      unknownRejected,
      "Mission context resolution must reject unknown browser-supplied document ids.",
    );

    await writeFile(
      join(root, "owner-context-files", `${imported.id}.pdf`),
      Buffer.from("tampered source", "utf8"),
    );
    const corrupted = new OwnerPdfContextRuntime({
      storePath,
      extractorPath,
    });
    let tamperRejected = false;
    try {
      await corrupted.initialize();
    } catch (error) {
      tamperRejected = /hash mismatch/i.test(
        error instanceof Error ? error.message : String(error),
      );
    }
    assert(
      tamperRejected,
      "Restart must fail closed when preserved PDF bytes no longer match recorded SHA-256 provenance.",
    );

    console.log(
      "TREE-05 OWNER PDF CONTEXT RUNTIME: SUCCESS",
    );
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
    });
  }
}

function createTextPdf(text: string): Buffer {
  const safeText = text.replace(/([\\()])/gu, "\\$1");
  const stream = [
    "BT",
    "/F1 12 Tf",
    "72 720 Td",
    `(${safeText}) Tj`,
    "ET",
    "",
  ].join("\n");

  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}endstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let index = 0; index < bodies.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${bodies[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${bodies.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += [
    "trailer",
    `<< /Size ${bodies.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");

  return Buffer.from(pdf, "ascii");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
