import {
  AppBrainGateway,
  AppBrainGatewayError,
} from "./app-brain-gateway";
import {
  WebAccessAdapter,
  type WebAccessFetcher,
  type WebAccessHostResolver,
  type WebAccessResponse,
} from "./web-access";
import type { MemoryReference } from "./types";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

class TestResolver implements WebAccessHostResolver {
  constructor(private readonly addresses: Record<string, string[]>) {}

  async resolve(hostname: string): Promise<string[]> {
    return this.addresses[hostname] ?? [];
  }
}

function response(content: string, url = "https://example.com/source"): WebAccessResponse {
  const bytes = new TextEncoder().encode(content);
  let consumed = false;
  return {
    status: 200,
    statusText: "OK",
    url,
    headers: {
      get(name: string): string | null {
        const key = name.toLowerCase();
        if (key === "content-length") return String(bytes.byteLength);
        if (key === "content-type") return "text/html; charset=utf-8";
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

function fetcher(content: string): WebAccessFetcher {
  return async (url) => response(content, url);
}

function webAccess(address = "93.184.216.34"): WebAccessAdapter {
  return new WebAccessAdapter(
    {
      allowedHosts: ["example.com"],
      allowedMethods: ["GET"],
      allowedSchemes: ["https"],
      maxResponseBytes: 16_384,
      timeoutMs: 5000,
      maxRedirects: 0,
      blockPrivateNetworks: true,
    },
    new TestResolver({ "example.com": [address] }),
    fetcher("Sold listing: graded Charizard example with source evidence."),
  );
}

function memory(
  id: string,
  summary: string,
  overrides: Partial<MemoryReference> = {},
): MemoryReference {
  return {
    id,
    type: "semantic",
    summary,
    sourceReferences: [`source:${id}`],
    authoritative: false,
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    ...overrides,
  };
}

async function runTest(): Promise<void> {
  const gateway = new AppBrainGateway(webAccess(), 2);
  const selected = gateway.selectMemory({
    appId: "kings.collectors",
    requestId: "memory-request-1",
    taskId: "keeper-question-1",
    missionId: "collector-vault-owner-1",
    query: "Research the Charizard valuation evidence in my Vault.",
    inputReferences: ["vault:treasure:charizard"],
    expectedOutputs: ["source-backed valuation context"],
    memories: [
      memory(
        "memory-authoritative",
        "Charizard valuation evidence and source history for this collector.",
        {
          missionId: "collector-vault-owner-1",
          authoritative: true,
          sourceReferences: ["vault:treasure:charizard", "evidence:receipt-1"],
        },
      ),
      memory(
        "memory-portable",
        "General collectible valuation workflow using sold comparable evidence.",
        { type: "procedural" },
      ),
      memory(
        "memory-other-mission",
        "Charizard notes from an unrelated project.",
        { missionId: "other-project" },
      ),
    ],
    limit: 2,
  });

  assert(selected.requestId === "memory-request-1", "Memory request identity was not preserved.");
  assert(selected.inspectedCount === 3, "Memory candidate count was not preserved.");
  assert(selected.selected.length === 2, "Memory selection limit was not enforced.");
  assert(
    selected.selected[0]?.memory.id === "memory-authoritative",
    "Mission-matched authoritative memory should rank first.",
  );
  assert(
    selected.selected[0]?.reasons.includes("mission match") === true,
    "Memory ranking reasons should explain the mission match.",
  );
  console.log("App brain provenance-aware memory selection: SUCCESS");

  let missingProvenanceRejected = false;
  try {
    gateway.selectMemory({
      appId: "kings.collectors",
      taskId: "keeper-question-2",
      missionId: "collector-vault-owner-1",
      query: "Use this memory.",
      memories: [
        {
          ...memory("memory-no-source", "Unproven memory"),
          sourceReferences: [],
        },
      ],
    });
  } catch (error) {
    missingProvenanceRejected =
      error instanceof AppBrainGatewayError && error.code === "INVALID_MEMORY_PROVENANCE";
  }
  assert(missingProvenanceRejected, "Memory without provenance was not rejected.");
  console.log("App brain memory provenance gate: SUCCESS");

  const research = await gateway.retrieveResearch({
    appId: "kings.collectors",
    requestId: "research-request-1",
    taskId: "collector-research-task-1",
    question: "What does this source establish about the collectible?",
    urls: ["https://example.com/source"],
  });
  assert(research.appId === "kings.collectors", "Research app identity was not preserved.");
  assert(research.sources.length === 1, "Governed research did not return the authorized source.");
  assert(
    research.sources[0]?.content.includes("Charizard") === true,
    "Governed research did not preserve bounded source content.",
  );
  assert(research.findings.length === 0, "Retrieval must not invent synthesized findings.");
  console.log("App brain governed HTTPS retrieval: SUCCESS");

  let sourceLimitRejected = false;
  try {
    await gateway.retrieveResearch({
      appId: "kings.collectors",
      taskId: "collector-research-task-2",
      question: "Too many sources",
      urls: [
        "https://example.com/a",
        "https://example.com/b",
        "https://example.com/c",
      ],
    });
  } catch (error) {
    sourceLimitRejected =
      error instanceof AppBrainGatewayError && error.code === "TOO_MANY_RESEARCH_SOURCES";
  }
  assert(sourceLimitRejected, "Research source cap was not enforced.");
  console.log("App brain research source cap: SUCCESS");

  const privateGateway = new AppBrainGateway(webAccess("127.0.0.1"), 2);
  let privateNetworkRejected = false;
  try {
    await privateGateway.retrieveResearch({
      appId: "kings.collectors",
      taskId: "collector-research-task-3",
      question: "Blocked network test",
      urls: ["https://example.com/private"],
    });
  } catch (error) {
    privateNetworkRejected =
      error instanceof AppBrainGatewayError &&
      error.code === "RESEARCH_POLICY_REJECTED" &&
      error.statusCode === 403;
  }
  assert(privateNetworkRejected, "Private-network research access was not rejected.");
  console.log("App brain SSRF policy inheritance: SUCCESS");
}

runTest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
