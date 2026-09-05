import { once } from "node:events";

import { ProviderAdapterRegistry } from "./provider-adapters";
import { WebAccessAdapter, type WebAccessFetcher, type WebAccessHostResolver, type WebAccessResponse } from "./web-access";
import { createAppRouterRuntime, type RouterRuntimeConfig } from "../../runtimes/app-router/server";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

class TestResolver implements WebAccessHostResolver {
  async resolve(hostname: string): Promise<string[]> {
    return hostname === "example.com" ? ["93.184.216.34"] : [];
  }
}

function sourceResponse(url: string): WebAccessResponse {
  const bytes = new TextEncoder().encode("public source evidence retained without invented findings");
  let consumed = false;
  return {
    status: 200,
    statusText: "OK",
    url,
    headers: {
      get(name: string): string | null {
        const key = name.toLowerCase();
        if (key === "content-length") return String(bytes.byteLength);
        if (key === "content-type") return "text/plain; charset=utf-8";
        return null;
      },
    },
    body: {
      getReader() {
        return {
          async read() {
            if (consumed) return { done: true };
            consumed = true;
            return { done: false, value: bytes };
          },
          async cancel() {},
          releaseLock() {},
        };
      },
    },
  };
}

const fetcher: WebAccessFetcher = async (url) => sourceResponse(url);

async function runTest(): Promise<void> {
  const providers = new ProviderAdapterRegistry();
  providers.register({
    descriptor: { id: "stub", name: "Stub", kind: "internal-local", available: false },
    listModels: () => [],
    getModel: () => undefined,
    async execute() {
      throw new Error("stub provider must not execute in app-brain runtime test");
    },
  });

  const config: RouterRuntimeConfig = {
    host: "127.0.0.1",
    port: 0,
    accessToken: "brain-test-token",
    providerOrder: ["stub"],
    researchMaxSources: 2,
    researchMaxResponseBytes: 4096,
    researchTimeoutMs: 5000,
    researchAllowedHosts: ["example.com"],
  };
  const webAccess = new WebAccessAdapter(
    {
      allowedHosts: ["example.com"],
      allowedMethods: ["GET"],
      allowedSchemes: ["https"],
      maxResponseBytes: 4096,
      timeoutMs: 5000,
      maxRedirects: 0,
      blockPrivateNetworks: true,
    },
    new TestResolver(),
    fetcher,
  );
  const server = createAppRouterRuntime(config, providers, webAccess);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("router test address unavailable");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const unauthorized = await fetch(`${baseUrl}/v1/brain/memory/select`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(unauthorized.status === 401, "Brain routes must require the configured bearer token.");

    const memoryResponse = await fetch(`${baseUrl}/v1/brain/memory/select`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer brain-test-token",
      },
      body: JSON.stringify({
        appId: "authors.forge",
        requestId: "memory-http-1",
        taskId: "continuity-question-1",
        missionId: "forge-project-1",
        query: "retrieve authoritative continuity context",
        memories: [
          {
            id: "memory-1",
            type: "semantic",
            summary: "author-approved continuity context",
            sourceReferences: ["project-brain:canon", "author-approved:scene-12"],
            missionId: "forge-project-1",
            authoritative: true,
            createdAt: "2026-09-04T00:00:00.000Z",
            updatedAt: "2026-09-04T00:00:00.000Z"
          }
        ],
        limit: 1,
      }),
    });
    assert(memoryResponse.status === 200, "Authenticated memory-selection route did not succeed.");
    const memory = await memoryResponse.json() as {
      requestId: string;
      selected: Array<{ memory: { id: string }; reasons: string[] }>;
    };
    assert(memory.requestId === "memory-http-1", "Memory request id was not preserved by HTTP runtime.");
    assert(memory.selected[0]?.memory.id === "memory-1", "Memory HTTP route did not return the selected memory.");
    assert(memory.selected[0]?.reasons.includes("mission match") === true, "Memory HTTP result lost K.I.N.G.S. ranking evidence.");

    const researchResponse = await fetch(`${baseUrl}/v1/brain/research/retrieve`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer brain-test-token",
      },
      body: JSON.stringify({
        appId: "authors.forge",
        requestId: "research-http-1",
        taskId: "research-task-1",
        question: "What does this public source establish?",
        urls: ["https://example.com/source"],
        maxSources: 1,
      }),
    });
    assert(researchResponse.status === 200, "Authenticated research-retrieval route did not succeed.");
    const research = await researchResponse.json() as {
      requestId: string;
      sources: Array<{ finalUrl: string; content: string }>;
      findings: unknown[];
    };
    assert(research.requestId === "research-http-1", "Research request id was not preserved by HTTP runtime.");
    assert(research.sources.length === 1, "Research HTTP route did not preserve the source record.");
    assert(research.sources[0]?.content.includes("public source evidence") === true, "Research HTTP route lost source content.");
    assert(research.findings.length === 0, "Retrieval HTTP route must not invent synthesized findings.");

    console.log("K.I.N.G.S. app brain authenticated HTTP runtime: SUCCESS");
  } finally {
    server.close();
    await once(server, "close");
  }
}

runTest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
