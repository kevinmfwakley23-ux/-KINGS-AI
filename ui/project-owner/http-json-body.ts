import type { IncomingMessage } from "node:http";

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 1_048_576;
export const MAX_CONFIGURABLE_JSON_BODY_LIMIT_BYTES = 16_777_216;

export class JsonBodyReadError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 413,
  ) {
    super(message);
    this.name = "JsonBodyReadError";
  }
}

export function resolveJsonBodyLimitBytes(
  value: string | undefined,
): number {
  if (!value?.trim()) return DEFAULT_JSON_BODY_LIMIT_BYTES;

  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > MAX_CONFIGURABLE_JSON_BODY_LIMIT_BYTES
  ) {
    throw new Error(
      `K.I.N.G.S. Owner HTTP: KINGS_MAX_JSON_BODY_BYTES must be an integer from 1 to ${MAX_CONFIGURABLE_JSON_BODY_LIMIT_BYTES}.`,
    );
  }

  return parsed;
}

function declaredContentLength(request: IncomingMessage): number | undefined {
  const raw = request.headers["content-length"];
  if (raw === undefined) return undefined;

  const first = Array.isArray(raw) ? raw[0] : raw;
  if (!first) return undefined;

  const parsed = Number(first);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new JsonBodyReadError(
      "Request Content-Length is invalid.",
      400,
    );
  }

  return parsed;
}

export async function readJsonBody(
  request: IncomingMessage,
  maxBytes = DEFAULT_JSON_BODY_LIMIT_BYTES,
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("JSON body byte limit must be a positive safe integer.");
  }

  const declared = declaredContentLength(request);
  if (declared !== undefined && declared > maxBytes) {
    request.resume();
    throw new JsonBodyReadError(
      `Request body exceeds the ${maxBytes}-byte K.I.N.G.S. owner API limit.`,
      413,
    );
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let tooLarge = false;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > maxBytes) {
      tooLarge = true;
      continue;
    }

    if (!tooLarge) chunks.push(buffer);
  }

  if (tooLarge) {
    throw new JsonBodyReadError(
      `Request body exceeds the ${maxBytes}-byte K.I.N.G.S. owner API limit.`,
      413,
    );
  }

  if (chunks.length === 0) return undefined;

  try {
    return JSON.parse(Buffer.concat(chunks, totalBytes).toString("utf8"));
  } catch {
    throw new JsonBodyReadError(
      "Request body must contain valid JSON.",
      400,
    );
  }
}
