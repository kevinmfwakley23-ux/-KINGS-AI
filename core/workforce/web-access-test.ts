import { createServer } from "node:http";

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

  // Owner-approved research must never leak caller credentials or spoof
  // routing headers, even if the target host itself is authorized.
  for (const name of [
    "Authorization", "authorization", "Cookie", "Proxy-Authorization",
    "Host", "Forwarded", "X-Forwarded-For",
  ]) {
    let outboundCalled = false;
    const guarded = new WebAccessAdapter(
      policy(),
      new TestResolver({ "example.com": ["93.184.216.34"] }),
      async () => { outboundCalled = true; return createResponse("unexpected"); },
    );
    let rejected = false;
    try {
      await guarded.execute(request({
        url: "https://example.com/",
        headers: { [name]: "private-owner-credential" },
      }));
    } catch (error: unknown) {
      rejected = error instanceof Error && error.message.includes("not permitted");
    }
    assert(rejected && !outboundCalled, `Sensitive header ${name} must fail before fetch`);
  }
  let invalidHeaderRejected = false;
  try {
    await valid.execute(request({
      url: "https://example.com/",
      headers: { "X-Research-Tag": 123 },
    }));
  } catch (error: unknown) {
    invalidHeaderRejected = error instanceof Error && error.message.includes("must be a string");
  }
  assert(invalidHeaderRejected, "Non-string research headers must fail closed");
  console.log("04.7 outbound credential and routing header rejection: SUCCESS");

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

  // DNS-rebinding protection: the actual default transport must connect to
  // the IP approved by the resolver, without a second DNS lookup. This hostname
  // is intentionally unresolvable; a non-pinned fetch would fail the test.
  const localServer = createServer((req, res) => {
    if (req.headers.host?.startsWith("research.example.invalid:")) {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("pinned DNS transport reached approved IP");
    } else {
      res.writeHead(400);
      res.end("unexpected Host header");
    }
  });
  await new Promise<void>((resolveListen) => localServer.listen(0, "127.0.0.1", resolveListen));
  try {
    const address = localServer.address();
    assert(address !== null && typeof address !== "string", "test listener needs a TCP port");
    if (!address || typeof address === "string") throw new Error("Missing test port");
    const pinnedAdapter = new WebAccessAdapter(
      policy({
        allowedHosts: ["research.example.invalid"],
        allowedSchemes: ["http"],
        blockPrivateNetworks: false, // local-only transport test, NOT owner production policy
      }),
      new TestResolver({ "research.example.invalid": ["127.0.0.1"] }),
    );
    const pinnedResult = await pinnedAdapter.execute(request({
      url: `http://research.example.invalid:${address.port}/`,
    })) as { status: number; content: string; finalUrl: string };
    assert(pinnedResult.status === 200, "pinned transport must reach approved IP");
    assert(pinnedResult.content === "pinned DNS transport reached approved IP", "Host and body must be preserved");
    assert(pinnedResult.finalUrl.startsWith("http://research.example.invalid:"), "provenance must preserve original host");
  } finally {
    await new Promise<void>((resolveClose, rejectClose) =>
      localServer.close((error) => error ? rejectClose(error) : resolveClose()));
  }

  // A hostname with any nonpublic answer must fail closed, including IPv4
  // translation, NAT64, link-local IPv6 and provider/internal address ranges.
  for (const address of [
    "::ffff:7f00:1", "::ffff:127.0.0.1", "fe90::1", "fc00::1",
    "64:ff9b::7f00:1", "2002:c0a8:101::", "2001:0000::1",
    "100.64.0.1", "198.18.0.1", "192.0.2.1", "203.0.113.1",
  ]) {
    let fetched = false;
    const blocked = new WebAccessAdapter(
      policy(),
      new TestResolver({ "example.com": [address] }),
      async () => { fetched = true; return createResponse("must not fetch"); },
    );
    let rejected = false;
    try {
      await blocked.execute(request({ url: "https://example.com/" }));
    } catch (error) {
      rejected = error instanceof Error && error.message.includes("blocked network");
    }
    assert(rejected, `nonpublic resolver answer must fail closed: ${address}`);
    assert(!fetched, `blocked resolver answer must not reach fetcher: ${address}`);
  }

  let receivedPinnedAddresses: string[] | undefined;
  const addressBound = new WebAccessAdapter(
    policy(),
    new TestResolver({ "example.com": ["93.184.216.34"] }),
    async (_url, options) => {
      receivedPinnedAddresses = options.validatedAddresses;
      return createResponse("approved");
    },
  );
  await addressBound.execute(request({ url: "https://example.com/" }));
  assert(receivedPinnedAddresses?.[0] === "93.184.216.34", "transport must receive validated resolver result");

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
