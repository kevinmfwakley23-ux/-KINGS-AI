import {
  ApprovedExternalResearchAuthorizer,
  ExternalResearchAdapter,
} from "./external-research";

import {
  WebAccessAdapter,
} from "../web-access";

import type {
  WebAccessHostResolver,
  WebAccessResponse,
  WebAccessFetcher,
} from "../web-access";

import type {
  ToolExecutionRequest,
} from "../tool-gateway";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

class Resolver
  implements WebAccessHostResolver {
  async resolve(
    hostname: string,
  ): Promise<string[]> {
    return hostname ===
      "example.com"
      ? ["93.184.216.34"]
      : [];
  }
}

function response(
  content: string,
): WebAccessResponse {
  const bytes =
    new TextEncoder().encode(
      content,
    );

  let consumed =
    false;

  return {
    status: 200,
    statusText: "OK",
    url:
      "https://example.com/",
    headers: {
      get(
        name: string,
      ): string | null {
        const n =
          name.toLowerCase();

        if (
          n ===
          "content-length"
        ) {
          return String(
            bytes.byteLength,
          );
        }

        if (
          n ===
          "content-type"
        ) {
          return "text/plain";
        }

        return null;
      },
    },
    body: {
      getReader() {
        return {
          async read() {
            if (consumed) {
              return {
                done: true,
              };
            }

            consumed = true;

            return {
              done: false,
              value: bytes,
            };
          },
          async cancel() {},
          releaseLock() {},
        };
      },
    },
  };
}

const web =
  new WebAccessAdapter(
    {
      allowedHosts: [
        "example.com",
      ],
      allowedMethods: [
        "GET",
      ],
      allowedSchemes: [
        "https",
      ],
      maxResponseBytes:
        4096,
      timeoutMs:
        5000,
      maxRedirects:
        0,
      blockPrivateNetworks:
        true,
    },
    new Resolver(),
    (async () =>
      response(
        "integrity source",
      )) as WebAccessFetcher,
  );

const adapter =
  new ExternalResearchAdapter(
    web,
    new ApprovedExternalResearchAuthorizer(
      new Set([
        "task-integrity",
      ]),
    ),
  );

function request(
  args:
    Record<string, unknown>,
): ToolExecutionRequest {
  return {
    requestId:
      "integrity",
    taskId:
      "task-integrity",
    agentId:
      "integrity-agent",
    toolId:
      "external-research",
    arguments:
      args,
  };
}

async function run(): Promise<void> {
  const first =
    await adapter.execute(
      request({
        researchId:
          "integrity-001",
        question:
          "same research",
        urls: [
          "https://example.com/",
        ],
        maxSources: 1,
      }),
    );

  const second =
    await adapter.execute(
      request({
        researchId:
          "integrity-001",
        question:
          "same research",
        urls: [
          "https://example.com/",
        ],
        maxSources: 1,
      }),
    );

  assert(
    first.sources[0].sourceId ===
      second.sources[0].sourceId,
    "Equivalent research did not preserve deterministic source identity.",
  );

  assert(
    first.sources[0].requestedUrl ===
      second.sources[0].requestedUrl,
    "Equivalent research did not preserve requested source provenance.",
  );

  assert(
    first.sources[0].finalUrl ===
      second.sources[0].finalUrl,
    "Equivalent research did not preserve final source provenance.",
  );

  assert(
    first.sources[0].status ===
      second.sources[0].status,
    "Equivalent research did not preserve source status.",
  );

  assert(
    first.findings.length ===
      0,
    "External retrieval incorrectly promoted raw content into findings.",
  );

  console.log(
    "05.7 raw-source / finding separation: SUCCESS",
  );

  console.log(
    "05.7 external research integrity: SUCCESS",
  );
}

run().catch(
  (error) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
