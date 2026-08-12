import {
  ApprovedExternalResearchAuthorizer,
  ExternalResearchAdapter,
  ExternalResearchAuthorizationError,
} from "./external-research";

import {
  WEB_ACCESS_TOOL_ID,
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

class TestResolver
  implements WebAccessHostResolver {
  async resolve(
    hostname: string,
  ): Promise<string[]> {
    if (
      hostname ===
      "example.com"
    ) {
      return [
        "93.184.216.34",
      ];
    }

    return [];
  }
}

function createResponse(
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
        const normalized =
          name.toLowerCase();

        if (
          normalized ===
          "content-length"
        ) {
          return String(
            bytes.byteLength,
          );
        }

        if (
          normalized ===
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

const fetcher:
  WebAccessFetcher =
  async () =>
    createResponse(
      "external research source",
    );

const webAccess =
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
    new TestResolver(),
    fetcher,
  );

function request(
  argumentsObject:
    Record<string, unknown>,
): ToolExecutionRequest {
  return {
    requestId:
      "external-research-test",
    taskId:
      "task-research-test",
    agentId:
      "agent-research-test",
    toolId:
      "external-research",
    arguments:
      argumentsObject,
  };
}

async function runTest(): Promise<void> {
  const authorized =
    new ExternalResearchAdapter(
      webAccess,
      new ApprovedExternalResearchAuthorizer(
        new Set([
          "task-research-test",
        ]),
      ),
    );

  const result =
    await authorized.execute(
      request({
        researchId:
          "research-001",
        question:
          "What does the authorized source contain?",
        urls: [
          "https://example.com/",
        ],
        maxSources: 2,
      }),
    );

  assert(
    result.researchId ===
      "research-001",
    "Research identity was not preserved.",
  );

  assert(
    result.taskId ===
      "task-research-test",
    "Research task identity was not preserved.",
  );

  assert(
    result.sources.length ===
      1,
    "Authorized source was not preserved.",
  );

  assert(
    result.sources[0].sourceId ===
      "research-001:source:1",
    "Source provenance identity was not deterministic.",
  );

  assert(
    result.sources[0].requestedUrl ===
      "https://example.com/",
    "Requested source URL was not preserved.",
  );

  assert(
    result.sources[0].finalUrl ===
      "https://example.com/",
    "Final source URL was not preserved.",
  );

  assert(
    result.sources[0].status ===
      200,
    "Source response status was not preserved.",
  );

  console.log(
    "05.7 authorized external research: SUCCESS",
  );

  const duplicateResult =
    await authorized.execute(
      request({
        researchId:
          "research-002",
        question:
          "Duplicate source handling",
        urls: [
          "https://example.com/",
          "https://example.com/",
        ],
        maxSources: 2,
      }),
    );

  assert(
    duplicateResult.sources.length ===
      1,
    "Duplicate source URLs were not collapsed.",
  );

  console.log(
    "05.7 duplicate source normalization: SUCCESS",
  );

  let unauthorized =
    false;

  const rejected =
    new ExternalResearchAdapter(
      webAccess,
      new ApprovedExternalResearchAuthorizer(
        new Set(),
      ),
    );

  try {
    await rejected.execute(
      request({
        researchId:
          "research-003",
        question:
          "Unauthorized research",
        urls: [
          "https://example.com/",
        ],
        maxSources: 1,
      }),
    );
  } catch (
    error: unknown
  ) {
    unauthorized =
      error instanceof
        ExternalResearchAuthorizationError;
  }

  assert(
    unauthorized,
    "Unauthorized external research was not rejected.",
  );

  console.log(
    "05.7 research authorization boundary: SUCCESS",
  );

  let sourceLimit =
    false;

  try {
    await authorized.execute(
      request({
        researchId:
          "research-004",
        question:
          "Source limit",
        urls: [
          "https://example.com/",
        ],
        maxSources: 0,
      }),
    );
  } catch (
    error: unknown
  ) {
    sourceLimit =
      error instanceof
        ExternalResearchAuthorizationError;
  }

  assert(
    sourceLimit,
    "Invalid research source limit was not rejected.",
  );

  console.log(
    "05.7 research contract validation: SUCCESS",
  );

  console.log(
    "TREE-05.7 EXTERNAL RESEARCH: SUCCESS",
  );
}

runTest().catch(
  (error) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
