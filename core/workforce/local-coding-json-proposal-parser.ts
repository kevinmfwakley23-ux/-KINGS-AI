import type {
  ModelExecutionResult,
} from "./model-interface";

import type {
  LocalCodingChangeProposal,
  LocalCodingFileChange,
  LocalCodingProposalParser,
} from "./local-coding-change-proposal";

const DEFAULT_MAX_CHANGES = 24;
const DEFAULT_MAX_FILE_BYTES = 512 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface LocalCodingJsonProposalParserPolicy {
  maxChanges?: number;
  maxFileBytes?: number;
  maxResponseBytes?: number;
}

/**
 * Parses model text into the typed proposal consumed by the existing governed
 * coding authorities. This parser deliberately accepts only one JSON object
 * (optionally wrapped in a single markdown JSON fence) and rejects path
 * traversal, absolute paths, duplicate targets, destructive operations, empty
 * replacement content, and oversized payloads before workspace authorization.
 *
 * This is a syntax/shape boundary, not an authorization boundary. The parsed
 * proposal still must pass GovernedLocalCodingProposal and
 * EngineeringWorkspaceProposalAuthority before any repository mutation.
 */
export class LocalCodingJsonProposalParser
  implements LocalCodingProposalParser {
  private readonly maxChanges: number;
  private readonly maxFileBytes: number;
  private readonly maxResponseBytes: number;

  constructor(
    policy: LocalCodingJsonProposalParserPolicy = {},
  ) {
    this.maxChanges = positiveInteger(
      policy.maxChanges ?? DEFAULT_MAX_CHANGES,
      "maxChanges",
    );
    this.maxFileBytes = positiveInteger(
      policy.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
      "maxFileBytes",
    );
    this.maxResponseBytes = positiveInteger(
      policy.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      "maxResponseBytes",
    );
  }

  parse(
    result: ModelExecutionResult,
  ): LocalCodingChangeProposal {
    if (!result.success || !result.response) {
      throw new Error(
        "K.I.N.G.S. Local Coding JSON Proposal Parser: model execution did not return a successful response.",
      );
    }

    const raw = result.response.content;
    if (typeof raw !== "string" || raw.trim() === "") {
      throw new Error(
        "K.I.N.G.S. Local Coding JSON Proposal Parser: model response content is empty.",
      );
    }

    const responseBytes = Buffer.byteLength(raw, "utf8");
    if (responseBytes > this.maxResponseBytes) {
      throw new Error(
        `K.I.N.G.S. Local Coding JSON Proposal Parser: model response exceeds ${this.maxResponseBytes} bytes.`,
      );
    }

    const jsonText = unwrapJson(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      throw new Error(
        `K.I.N.G.S. Local Coding JSON Proposal Parser: response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const object = record(parsed, "proposal");
    assertOnlyKeys(
      object,
      ["id", "taskId", "missionId", "summary", "changes"],
      "proposal",
    );

    const id = identifier(object.id, "proposal id");
    const taskId = identifier(object.taskId, "task id");
    const missionId = identifier(object.missionId, "mission id");
    const summary = requiredText(object.summary, "proposal summary", 4_000);

    if (!Array.isArray(object.changes)) {
      throw new Error(
        "K.I.N.G.S. Local Coding JSON Proposal Parser: proposal changes must be an array.",
      );
    }
    if (object.changes.length < 1) {
      throw new Error(
        "K.I.N.G.S. Local Coding JSON Proposal Parser: proposal must contain at least one file change.",
      );
    }
    if (object.changes.length > this.maxChanges) {
      throw new Error(
        `K.I.N.G.S. Local Coding JSON Proposal Parser: proposal contains more than ${this.maxChanges} file changes.`,
      );
    }

    const seenPaths = new Set<string>();
    const changes: LocalCodingFileChange[] = object.changes.map(
      (value, index) => this.parseChange(value, index, seenPaths),
    );

    return {
      id,
      taskId,
      missionId,
      summary,
      changes,
    };
  }

  private parseChange(
    value: unknown,
    index: number,
    seenPaths: Set<string>,
  ): LocalCodingFileChange {
    const object = record(value, `changes[${index}]`);
    assertOnlyKeys(
      object,
      ["path", "operation", "content"],
      `changes[${index}]`,
    );

    const path = repositoryRelativePath(
      requiredText(object.path, `changes[${index}].path`, 4_096),
    );
    if (seenPaths.has(path)) {
      throw new Error(
        `K.I.N.G.S. Local Coding JSON Proposal Parser: duplicate file target "${path}".`,
      );
    }
    seenPaths.add(path);

    const operation = object.operation;
    if (operation !== "create" && operation !== "replace") {
      throw new Error(
        `K.I.N.G.S. Local Coding JSON Proposal Parser: changes[${index}].operation must be create or replace.`,
      );
    }

    if (typeof object.content !== "string" || object.content.trim() === "") {
      throw new Error(
        `K.I.N.G.S. Local Coding JSON Proposal Parser: changes[${index}].content must be non-empty text.`,
      );
    }
    const bytes = Buffer.byteLength(object.content, "utf8");
    if (bytes > this.maxFileBytes) {
      throw new Error(
        `K.I.N.G.S. Local Coding JSON Proposal Parser: "${path}" exceeds the ${this.maxFileBytes}-byte proposal limit.`,
      );
    }

    return {
      path,
      operation,
      content: object.content,
    };
  }
}

function unwrapJson(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;

  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (!match) {
    throw new Error(
      "K.I.N.G.S. Local Coding JSON Proposal Parser: markdown response must contain exactly one closed JSON fence.",
    );
  }

  const inner = match[1].trim();
  if (!inner) {
    throw new Error(
      "K.I.N.G.S. Local Coding JSON Proposal Parser: JSON fence is empty.",
    );
  }
  return inner;
}

function record(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `K.I.N.G.S. Local Coding JSON Proposal Parser: ${label} must be a JSON object.`,
    );
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unexpected.length) {
    throw new Error(
      `K.I.N.G.S. Local Coding JSON Proposal Parser: ${label} contains unsupported field(s): ${unexpected.join(", ")}.`,
    );
  }
}

function identifier(
  value: unknown,
  label: string,
): string {
  return requiredText(value, label, 256);
}

function requiredText(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (typeof value !== "string") {
    throw new Error(
      `K.I.N.G.S. Local Coding JSON Proposal Parser: ${label} must be text.`,
    );
  }
  const result = value.trim();
  if (!result) {
    throw new Error(
      `K.I.N.G.S. Local Coding JSON Proposal Parser: ${label} is required.`,
    );
  }
  if (result.length > maxLength) {
    throw new Error(
      `K.I.N.G.S. Local Coding JSON Proposal Parser: ${label} exceeds ${maxLength} characters.`,
    );
  }
  return result;
}

function repositoryRelativePath(value: string): string {
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith("/") || value.startsWith("\\")) {
    throw new Error(
      `K.I.N.G.S. Local Coding JSON Proposal Parser: path "${value}" must be repository-relative.`,
    );
  }

  const normalized = value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/{2,}/g, "/");

  const segments = normalized.split("/");
  if (
    !normalized ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(
      `K.I.N.G.S. Local Coding JSON Proposal Parser: path "${value}" contains unsafe traversal or empty segments.`,
    );
  }
  if (normalized.includes("\u0000")) {
    throw new Error(
      "K.I.N.G.S. Local Coding JSON Proposal Parser: file paths must not contain null characters.",
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
      `K.I.N.G.S. Local Coding JSON Proposal Parser: ${label} must be a positive integer.`,
    );
  }
  return value;
}
