import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  spawnSync,
} from "node:child_process";
import {
  createHash,
  randomUUID,
} from "node:crypto";
import {
  tmpdir,
} from "node:os";
import {
  dirname,
  join,
  resolve,
} from "node:path";

import type {
  OwnerMissionContextDocument,
} from "./owner-mission-runtime";

const STORE_VERSION = 1;
const DEFAULT_MAX_PDF_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_EXTRACTED_CHARACTERS = 1_000_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_PROCESS_BUFFER = 4 * 1024 * 1024;

export interface OwnerPdfContextDocument
  extends OwnerMissionContextDocument {
  pageCount: number;
  characterCount: number;
  createdAt: string;
  sourceFile: string;
}

export interface OwnerPdfContextMetadata {
  id: string;
  name: string;
  mediaType: string;
  sha256: string;
  pageCount: number;
  characterCount: number;
  createdAt: string;
  sourcePreserved: true;
}

interface OwnerPdfContextStoreFile {
  version: number;
  documents: OwnerPdfContextDocument[];
}

export interface OwnerPdfContextRuntimeOptions {
  storePath: string;
  extractorPath?: string;
  pythonExecutable?: string;
  maxPdfBytes?: number;
  maxExtractedCharacters?: number;
  timeoutMs?: number;
}

/**
 * Server-side project-context authority for owner-supplied PDFs.
 *
 * The browser supplies bytes only. K.I.N.G.S. validates the PDF envelope,
 * computes provenance, invokes the bounded local extractor, preserves the
 * original source bytes, persists the extracted text, and later resolves
 * mission context by server-issued ids. The HTTP client never gets to replace
 * extracted text with its own content.
 */
export class OwnerPdfContextRuntime {
  private readonly documents = new Map<string, OwnerPdfContextDocument>();
  private initialized = false;
  private readonly storePath: string;
  private readonly sourceRoot: string;
  private readonly extractorPath: string;
  private readonly pythonExecutable: string;
  private readonly maxPdfBytes: number;
  private readonly maxExtractedCharacters: number;
  private readonly timeoutMs: number;

  constructor(options: OwnerPdfContextRuntimeOptions) {
    this.storePath = resolve(
      requiredText(options.storePath, "store path", 8_192),
    );
    this.sourceRoot = resolve(
      dirname(this.storePath),
      "owner-context-files",
    );
    this.extractorPath = resolve(
      options.extractorPath ??
        resolve(
          process.cwd(),
          "runtimes/knowledge-ingestion/extract_owner_pdf.py",
        ),
    );
    this.pythonExecutable = requiredText(
      options.pythonExecutable ??
        process.env.KINGS_PYTHON_EXECUTABLE ??
        (process.platform === "win32" ? "python" : "python3"),
      "python executable",
      1_024,
    );
    this.maxPdfBytes = positiveInteger(
      options.maxPdfBytes ?? DEFAULT_MAX_PDF_BYTES,
      "maxPdfBytes",
    );
    this.maxExtractedCharacters = positiveInteger(
      options.maxExtractedCharacters ?? DEFAULT_MAX_EXTRACTED_CHARACTERS,
      "maxExtractedCharacters",
    );
    this.timeoutMs = positiveInteger(
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      "timeoutMs",
    );
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    let parsed: OwnerPdfContextStoreFile | undefined;
    try {
      parsed = JSON.parse(
        await readFile(this.storePath, "utf8"),
      ) as OwnerPdfContextStoreFile;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return;
      }
      throw new Error(
        `K.I.N.G.S. Owner PDF Context: failed to load persistent state: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (
      !parsed ||
      parsed.version !== STORE_VERSION ||
      !Array.isArray(parsed.documents)
    ) {
      throw new Error(
        "K.I.N.G.S. Owner PDF Context: persistent state has an unsupported schema.",
      );
    }

    for (const document of parsed.documents) {
      await this.validatePersistedDocument(document);
      if (this.documents.has(document.id)) {
        throw new Error(
          `K.I.N.G.S. Owner PDF Context: duplicate persisted document "${document.id}".`,
        );
      }
      this.documents.set(document.id, clone(document));
    }
  }

  async ingestPdf(
    name: string,
    bytes: Buffer | Uint8Array,
  ): Promise<OwnerPdfContextMetadata> {
    this.requireInitialized();
    const normalizedName = requiredText(name, "PDF name", 512);
    const buffer = Buffer.from(bytes);

    if (buffer.length < 5) {
      throw new Error(
        "K.I.N.G.S. Owner PDF Context: PDF upload is empty or too small.",
      );
    }
    if (buffer.length > this.maxPdfBytes) {
      throw new Error(
        `K.I.N.G.S. Owner PDF Context: PDF exceeds ${this.maxPdfBytes} bytes.`,
      );
    }
    if (!buffer.subarray(0, Math.min(buffer.length, 1024)).includes(Buffer.from("%PDF-"))) {
      throw new Error(
        "K.I.N.G.S. Owner PDF Context: uploaded bytes do not contain a PDF header.",
      );
    }

    const sha256 = createHash("sha256")
      .update(buffer)
      .digest("hex");
    const duplicate = [...this.documents.values()].find(
      (document) => document.sha256 === sha256,
    );
    if (duplicate) {
      return metadata(duplicate);
    }

    const extraction = await this.extract(buffer);
    if (
      !Number.isInteger(extraction.pageCount) ||
      extraction.pageCount < 1
    ) {
      throw new Error(
        "K.I.N.G.S. Owner PDF Context: extractor returned an invalid page count.",
      );
    }
    const text = requiredText(
      extraction.text,
      "extracted PDF text",
      this.maxExtractedCharacters,
    );

    const id = `owner-pdf-${randomUUID()}`;
    const sourceFile = `${id}.pdf`;
    await this.persistSource(sourceFile, buffer);

    const document: OwnerPdfContextDocument = {
      id,
      name: normalizedName,
      mediaType: "application/pdf",
      sha256,
      text,
      pageCount: extraction.pageCount,
      characterCount: text.length,
      createdAt: new Date().toISOString(),
      sourceFile,
    };
    this.documents.set(document.id, document);

    try {
      await this.persist();
    } catch (error) {
      this.documents.delete(document.id);
      await rm(this.sourcePath(sourceFile), { force: true });
      throw error;
    }

    return metadata(document);
  }

  list(): OwnerPdfContextMetadata[] {
    this.requireInitialized();
    return [...this.documents.values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(metadata);
  }

  resolve(
    ids: readonly string[],
  ): OwnerMissionContextDocument[] {
    this.requireInitialized();
    if (!Array.isArray(ids)) {
      throw new Error(
        "K.I.N.G.S. Owner PDF Context: context document ids must be an array.",
      );
    }
    if (ids.length > 32) {
      throw new Error(
        "K.I.N.G.S. Owner PDF Context: at most 32 context documents may be attached to one mission.",
      );
    }

    const seen = new Set<string>();
    return ids.map((rawId) => {
      const id = requiredText(rawId, "context document id", 256);
      if (seen.has(id)) {
        throw new Error(
          `K.I.N.G.S. Owner PDF Context: duplicate context document id "${id}".`,
        );
      }
      seen.add(id);
      const document = this.documents.get(id);
      if (!document) {
        throw new Error(
          `K.I.N.G.S. Owner PDF Context: context document "${id}" was not found.`,
        );
      }
      return {
        id: document.id,
        name: document.name,
        mediaType: document.mediaType,
        sha256: document.sha256,
        text: document.text,
      };
    });
  }

  private async extract(
    bytes: Buffer,
  ): Promise<{ pageCount: number; text: string }> {
    const root = await mkdtemp(
      join(tmpdir(), "kings-owner-pdf-"),
    );
    const pdfPath = join(root, "owner-context.pdf");

    try {
      await writeFile(pdfPath, bytes, { mode: 0o600 });
      const result = spawnSync(
        this.pythonExecutable,
        [this.extractorPath, pdfPath],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: this.timeoutMs,
          maxBuffer: DEFAULT_MAX_PROCESS_BUFFER,
          windowsHide: true,
          shell: false,
        },
      );

      if (result.error) {
        throw new Error(
          `PDF extractor could not start: ${result.error.message}. Install the pinned Python requirements before importing PDFs.`,
        );
      }
      if (result.status !== 0) {
        const diagnostic = String(result.stderr || result.stdout || "").trim();
        throw new Error(
          `PDF extraction failed${diagnostic ? `: ${diagnostic}` : "."}`,
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(String(result.stdout || "").trim());
      } catch (error) {
        throw new Error(
          `PDF extractor returned invalid JSON: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(
          "PDF extractor returned an invalid response object.",
        );
      }
      const record = parsed as Record<string, unknown>;
      if (record.ok !== true) {
        throw new Error(
          "PDF extractor did not report success.",
        );
      }
      return {
        pageCount: Number(record.pageCount),
        text: String(record.text ?? ""),
      };
    } finally {
      await rm(root, {
        recursive: true,
        force: true,
      });
    }
  }

  private async persistSource(
    sourceFile: string,
    bytes: Buffer,
  ): Promise<void> {
    await mkdir(this.sourceRoot, {
      recursive: true,
    });
    const finalPath = this.sourcePath(sourceFile);
    const temporaryPath = `${finalPath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, bytes, {
      mode: 0o600,
    });
    await rename(temporaryPath, finalPath);
  }

  private async validatePersistedDocument(
    document: OwnerPdfContextDocument,
  ): Promise<void> {
    validateDocument(document);
    let source: Buffer;
    try {
      source = await readFile(this.sourcePath(document.sourceFile));
    } catch (error) {
      throw new Error(
        `K.I.N.G.S. Owner PDF Context: preserved source for "${document.id}" is missing or unreadable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    const actualHash = createHash("sha256")
      .update(source)
      .digest("hex");
    if (actualHash !== document.sha256) {
      throw new Error(
        `K.I.N.G.S. Owner PDF Context: preserved source hash mismatch for "${document.id}".`,
      );
    }
  }

  private sourcePath(sourceFile: string): string {
    if (!/^owner-pdf-[A-Za-z0-9-]+\.pdf$/u.test(sourceFile)) {
      throw new Error(
        "K.I.N.G.S. Owner PDF Context: source file identity is invalid.",
      );
    }
    return resolve(this.sourceRoot, sourceFile);
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.storePath), {
      recursive: true,
    });
    const temporaryPath = `${this.storePath}.${process.pid}.${randomUUID()}.tmp`;
    const payload: OwnerPdfContextStoreFile = {
      version: STORE_VERSION,
      documents: [...this.documents.values()]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(clone),
    };
    await writeFile(
      temporaryPath,
      `${JSON.stringify(payload, null, 2)}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
      },
    );
    await rename(temporaryPath, this.storePath);
  }

  private requireInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        "K.I.N.G.S. Owner PDF Context: initialize() must complete before use.",
      );
    }
  }
}

function metadata(
  document: OwnerPdfContextDocument,
): OwnerPdfContextMetadata {
  return {
    id: document.id,
    name: document.name,
    mediaType: document.mediaType,
    sha256: document.sha256,
    pageCount: document.pageCount,
    characterCount: document.characterCount,
    createdAt: document.createdAt,
    sourcePreserved: true,
  };
}

function validateDocument(
  document: OwnerPdfContextDocument,
): void {
  const id = requiredText(document.id, "document id", 256);
  requiredText(document.name, "document name", 512);
  if (document.mediaType !== "application/pdf") {
    throw new Error(
      `K.I.N.G.S. Owner PDF Context: persisted document "${id}" has an unsupported media type.`,
    );
  }
  if (!/^[a-f0-9]{64}$/u.test(document.sha256)) {
    throw new Error(
      `K.I.N.G.S. Owner PDF Context: persisted document "${id}" has invalid provenance.`,
    );
  }
  requiredText(document.text, "document text", DEFAULT_MAX_EXTRACTED_CHARACTERS);
  if (!Number.isInteger(document.pageCount) || document.pageCount < 1) {
    throw new Error(
      `K.I.N.G.S. Owner PDF Context: persisted document "${id}" has an invalid page count.`,
    );
  }
  if (document.characterCount !== document.text.length) {
    throw new Error(
      `K.I.N.G.S. Owner PDF Context: persisted document "${id}" character count does not match text.`,
    );
  }
  requiredText(document.createdAt, "document createdAt", 128);
  const sourceFile = requiredText(document.sourceFile, "document source file", 512);
  if (sourceFile !== `${id}.pdf`) {
    throw new Error(
      `K.I.N.G.S. Owner PDF Context: persisted document "${id}" source identity does not match its id.`,
    );
  }
}

function requiredText(
  value: unknown,
  label: string,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw new Error(
      `K.I.N.G.S. Owner PDF Context: ${label} must be text.`,
    );
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(
      `K.I.N.G.S. Owner PDF Context: ${label} is required.`,
    );
  }
  if (normalized.length > maximumLength) {
    throw new Error(
      `K.I.N.G.S. Owner PDF Context: ${label} exceeds ${maximumLength} characters.`,
    );
  }
  return normalized;
}

function positiveInteger(
  value: number,
  label: string,
): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `K.I.N.G.S. Owner PDF Context: ${label} must be a positive integer.`,
    );
  }
  return value;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
