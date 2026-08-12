import {
  WEB_ACCESS_TOOL_ID,
  WebAccessAdapter,
} from "./web-access";

import type {
  WebAccessHostResolver,
  WebAccessResponse,
  WebAccessFetcher,
} from "./web-access";

import type {
  ToolExecutionRequest,
} from "./tool-gateway";

function assert(
  condition:
    boolean,
  message:
    string,
): void {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`,
    );
  }
}

class TestResolver
  implements WebAccessHostResolver {
  constructor(
    private readonly addresses:
      Record<
        string,
        string[]
      >,
  ) {}

  async resolve(
    hostname:
      string,
  ): Promise<string[]> {
    return (
      this.addresses[
        hostname
      ] ?? []
    );
  }
}

function createResponse(
  content:
    string,
  status:
    number = 200,
  contentType:
    string = "text/plain",
  url:
    string = "https://example.com/",
): WebAccessResponse {
  const bytes =
    new TextEncoder().encode(
      content,
    );

  let consumed =
    false;

  return {
    status,
    statusText:
      status ===
      200
        ? "OK"
        : "Response",
    url,
    headers: {
      get(
        name:
          string,
      ):
        string | null {
        if (
          name.toLowerCase() ===
          "content-length"
        ) {
          return String(
            bytes.byteLength,
          );
        }

        if (
          name.toLowerCase() ===
          "content-type"
        ) {
          return contentType;
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
                done:
                  true,
              };
            }

            consumed =
              true;

            return {
              done:
                false,
              value:
                bytes,
            };
          },

          async cancel() {},

          releaseLock() {},
        };
      },
    },
  };
}

function createFetcher(
  responseFactory:
    () => WebAccessResponse,
): WebAccessFetcher {
  return async () =>
    responseFactory();
}

function request(
  argumentsObject:
    Record<
      string,
      unknown
    >,
): ToolExecutionRequest {
  return {
    requestId:
      "web-request-test",
    taskId:
      "task-web-test",
    agentId:
      "agent-web-test",
    toolId:
      WEB_ACCESS_TOOL_ID,
    arguments:
      argumentsObject,
  };
}

function policy(
  overrides:
    Partial<
      ConstructorParameters<
        typeof WebAccessAdapter
      >[0]
    > = {},
) {
  return {
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
      1024,
    timeoutMs:
      5000,
    maxRedirects:
      0,
    blockPrivateNetworks:
      true,
    ...overrides,
  };
}

function adapter(
  overrides:
    Partial<
      ConstructorParameters<
        typeof WebAccessAdapter
      >[0]
    > = {},
  response?:
    WebAccessResponse,
) {
  return new WebAccessAdapter(
    policy(
      overrides,
    ),
    new TestResolver({
      "example.com": [
        "93.184.216.34",
      ],
    }),
    createFetcher(
      () =>
        response ??
        createResponse(
          "K.I.N.G.S. web access test",
        ),
    ),
  );
}

async function runTest(): Promise<void> {
  const valid =
    adapter();

  assert(
    valid.toolId ===
      WEB_ACCESS_TOOL_ID,
    "Web access tool identity is incorrect.",
  );

  console.log(
    "04.7 web access tool identity: SUCCESS",
  );

  const successful =
    await valid.execute(
      request({
        url:
          "https://example.com/",
      }),
    ) as {
      content:
        string;
      status:
        number;
      contentType:
        string;
    };

  assert(
    successful.status ===
      200,
    "Authorized web response status was not preserved.",
  );

  assert(
    successful.content ===
      "K.I.N.G.S. web access test",
    "Authorized web response content was not preserved.",
  );

  assert(
    successful.contentType ===
      "text/plain",
    "Web response content type was not preserved.",
  );

  console.log(
    "04.7 authorized web retrieval: SUCCESS",
  );

  let schemeRejected =
    false;

  try {
    await valid.execute(
      request({
        url:
          "file:///etc/passwd",
      }),
    );
  } catch (
    error: unknown
  ) {
    schemeRejected =
      error instanceof Error &&
      error.message.includes(
        "scheme",
      );
  }

  assert(
    schemeRejected,
    "Non-web URL scheme was not rejected.",
  );

  console.log(
    "04.7 unsafe URL scheme rejection: SUCCESS",
  );

  let hostRejected =
    false;

  try {
    await valid.execute(
      request({
        url:
          "https://evil.example.net/",
      }),
    );
  } catch (
    error: unknown
  ) {
    hostRejected =
      error instanceof Error &&
      error.message.includes(
        "not authorized",
      );
  }

  assert(
    hostRejected,
    "Unauthorized host was not rejected.",
  );

  console.log(
    "04.7 host authorization boundary: SUCCESS",
  );

  let credentialRejected =
    false;

  try {
    await valid.execute(
      request({
        url:
          "https://user:password@example.com/",
      }),
    );
  } catch (
    error: unknown
  ) {
    credentialRejected =
      error instanceof Error &&
      error.message.includes(
        "credentials",
      );
  }

  assert(
    credentialRejected,
    "Embedded URL credentials were not rejected.",
  );

  console.log(
    "04.7 embedded credential rejection: SUCCESS",
  );

  const privateNetwork =
    new WebAccessAdapter(
      policy(),
      new TestResolver({
        "example.com": [
          "127.0.0.1",
        ],
      }),
      createFetcher(
        () =>
          createResponse(
            "must never execute",
          ),
      ),
    );

  let privateRejected =
    false;

  try {
    await privateNetwork.execute(
      request({
        url:
          "https://example.com/",
      }),
    );
  } catch (
    error: unknown
  ) {
    privateRejected =
      error instanceof Error &&
      error.message.includes(
        "blocked network",
      );
  }

  assert(
    privateRejected,
    "Private network resolution was not rejected.",
  );

  console.log(
    "04.7 private-network SSRF boundary: SUCCESS",
  );

  let methodRejected =
    false;

  try {
    await valid.execute(
      request({
        url:
          "https://example.com/",
        method:
          "POST",
      }),
    );
  } catch (
    error: unknown
  ) {
    methodRejected =
      error instanceof Error &&
      error.message.includes(
        "method",
      );
  }

  assert(
    methodRejected,
    "Unauthorized HTTP method was not rejected.",
  );

  console.log(
    "04.7 HTTP method boundary: SUCCESS",
  );

  const redirecting =
    adapter(
      {},
      createResponse(
        "",
        302,
      ),
    );

  let redirectRejected =
    false;

  try {
    await redirecting.execute(
      request({
        url:
          "https://example.com/",
      }),
    );
  } catch (
    error: unknown
  ) {
    redirectRejected =
      error instanceof Error &&
      error.message.includes(
        "redirect",
      );
  }

  assert(
    redirectRejected,
    "Redirect response was not rejected.",
  );

  console.log(
    "04.7 redirect boundary: SUCCESS",
  );

  let redirectConfigurationRejected =
    false;

  try {
    new WebAccessAdapter(
      policy({
        maxRedirects:
          1,
      }),
      new TestResolver({
        "example.com": [
          "93.184.216.34",
        ],
      }),
      createFetcher(
        () =>
          createResponse(
            "unused",
          ),
      ),
    );
  } catch {
    redirectConfigurationRejected =
      true;
  }

  assert(
    redirectConfigurationRejected,
    "Automatic redirects were not prohibited.",
  );

  console.log(
    "04.7 redirect configuration boundary: SUCCESS",
  );

  let unresolvedRejected =
    false;

  const unresolved =
    new WebAccessAdapter(
      policy(),
      new TestResolver({}),
      createFetcher(
        () =>
          createResponse(
            "must never execute",
          ),
      ),
    );

  try {
    await unresolved.execute(
      request({
        url:
          "https://example.com/",
      }),
    );
  } catch (
    error: unknown
  ) {
    unresolvedRejected =
      error instanceof Error &&
      error.message.includes(
        "did not resolve",
      );
  }

  assert(
    unresolvedRejected,
    "Unresolved external host was not rejected.",
  );

  console.log(
    "04.7 unresolved host rejection: SUCCESS",
  );

  const oversized =
    adapter({
      maxResponseBytes:
        4,
    });

  let oversizedRejected =
    false;

  try {
    await oversized.execute(
      request({
        url:
          "https://example.com/",
      }),
    );
  } catch (
    error: unknown
  ) {
    oversizedRejected =
      error instanceof Error &&
      error.message.includes(
        "size limit",
      );
  }

  assert(
    oversizedRejected,
    "Oversized response was not rejected.",
  );

  console.log(
    "04.7 response size boundary: SUCCESS",
  );

  const deterministic =
    adapter();

  const first =
    await deterministic.execute(
      request({
        url:
          "https://example.com/",
      }),
    );

  const second =
    await deterministic.execute(
      request({
        url:
          "https://example.com/",
      }),
    );

  const firstResult =
    first as {
      url: string;
      finalUrl: string;
      status: number;
      statusText: string;
      contentType: string;
      content: string;
      contentLengthBytes: number;
    };

  const secondResult =
    second as {
      url: string;
      finalUrl: string;
      status: number;
      statusText: string;
      contentType: string;
      content: string;
      contentLengthBytes: number;
    };

  const firstComparable = {
    url:
      firstResult.url,
    finalUrl:
      firstResult.finalUrl,
    status:
      firstResult.status,
    statusText:
      firstResult.statusText,
    contentType:
      firstResult.contentType,
    content:
      firstResult.content,
    contentLengthBytes:
      firstResult.contentLengthBytes,
  };

  const secondComparable = {
    url:
      secondResult.url,
    finalUrl:
      secondResult.finalUrl,
    status:
      secondResult.status,
    statusText:
      secondResult.statusText,
    contentType:
      secondResult.contentType,
    content:
      secondResult.content,
    contentLengthBytes:
      secondResult.contentLengthBytes,
  };

  const deterministicFields = [
    "url",
    "finalUrl",
    "status",
    "statusText",
    "contentType",
    "content",
    "contentLengthBytes",
  ] as const;

  for (
    const field of deterministicFields
  ) {
    assert(
      firstComparable[field] ===
        secondComparable[field],
      `Equivalent web requests differed in deterministic field "${field}".`,
    );
  }

  console.log(
    "04.7 deterministic web result structure: SUCCESS",
  );

  console.log(
    "TREE-04.7 WEB / EXTERNAL KNOWLEDGE ACCESS: SUCCESS",
  );
}

runTest().catch(
  (
    error,
  ) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
