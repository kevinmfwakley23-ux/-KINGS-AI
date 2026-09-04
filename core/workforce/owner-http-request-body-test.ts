import { strict as assert } from "node:assert";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";

import {
  DEFAULT_JSON_BODY_LIMIT_BYTES,
  JsonBodyReadError,
  MAX_CONFIGURABLE_JSON_BODY_LIMIT_BYTES,
  readJsonBody,
  resolveJsonBodyLimitBytes,
} from "../../ui/project-owner/http-json-body";

function request(
  chunks: readonly (string | Buffer)[],
  headers: Record<string, string> = {},
): IncomingMessage {
  const stream = Readable.from(chunks) as unknown as IncomingMessage;
  Object.defineProperty(stream, "headers", {
    configurable: false,
    enumerable: true,
    value: headers,
  });
  return stream;
}

async function expectBodyError(
  promise: Promise<unknown>,
  statusCode: 400 | 413,
  message: RegExp,
): Promise<void> {
  try {
    await promise;
    assert.fail(`expected JsonBodyReadError ${statusCode}`);
  } catch (error) {
    assert.ok(error instanceof JsonBodyReadError);
    assert.equal(error.statusCode, statusCode);
    assert.match(error.message, message);
  }
}

async function main(): Promise<void> {
  assert.equal(
    resolveJsonBodyLimitBytes(undefined),
    DEFAULT_JSON_BODY_LIMIT_BYTES,
  );
  assert.equal(resolveJsonBodyLimitBytes("2048"), 2048);
  assert.throws(
    () => resolveJsonBodyLimitBytes("0"),
    /must be an integer/,
  );
  assert.throws(
    () => resolveJsonBodyLimitBytes(String(MAX_CONFIGURABLE_JSON_BODY_LIMIT_BYTES + 1)),
    /must be an integer/,
  );

  assert.deepEqual(
    await readJsonBody(request(["{\"ok\":true}"]), 64),
    { ok: true },
  );
  assert.equal(await readJsonBody(request([]), 64), undefined);

  await expectBodyError(
    readJsonBody(request(["not json"]), 64),
    400,
    /valid JSON/,
  );

  await expectBodyError(
    readJsonBody(
      request(["{}"], { "content-length": "999" }),
      64,
    ),
    413,
    /exceeds the 64-byte/,
  );

  await expectBodyError(
    readJsonBody(request(["12345678", "abcdefgh", "ABCDEFGH"]), 16),
    413,
    /exceeds the 16-byte/,
  );

  await expectBodyError(
    readJsonBody(
      request(["{}"], { "content-length": "invalid" }),
      64,
    ),
    400,
    /Content-Length is invalid/,
  );

  console.log("K.I.N.G.S. OWNER HTTP → VALID JSON: SUCCESS");
  console.log("K.I.N.G.S. OWNER HTTP → MALFORMED JSON 400: SUCCESS");
  console.log("K.I.N.G.S. OWNER HTTP → DECLARED OVERSIZE 413: SUCCESS");
  console.log("K.I.N.G.S. OWNER HTTP → CHUNKED OVERSIZE 413: SUCCESS");
  console.log("K.I.N.G.S. OWNER HTTP → CONFIGURED BODY LIMIT: SUCCESS");
  console.log("TREE-KCM-OWNER-HTTP-REQUEST-BODY: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-OWNER-HTTP-REQUEST-BODY: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
