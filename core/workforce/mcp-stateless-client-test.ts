import { strict as assert } from "node:assert";

import {
  KINGS_MCP_PROTOCOL_VERSION,
  McpProtocolError,
  McpStatelessClient,
  type McpHttpRequest,
  type McpHttpResponse,
  type McpHttpTransport,
} from "./mcp-stateless-client";
import {
  GovernedMcpToolProvider,
  kingsMcpToolId,
} from "./mcp-tool-provider";
import { WorkforceRegistry } from "./registry";
import { ToolGateway } from "./tool-gateway";
import { WorkUnitRegistry } from "./work-unit-registry";

class ScriptedTransport implements McpHttpTransport {
  readonly requests: McpHttpRequest[] = [];
  private readonly handlers: Array<(request: McpHttpRequest) => McpHttpResponse> = [];

  push(handler: (request: McpHttpRequest) => McpHttpResponse): void {
    this.handlers.push(handler);
  }

  async request(request: McpHttpRequest): Promise<McpHttpResponse> {
    this.requests.push(request);
    const handler = this.handlers.shift();
    if (!handler) throw new Error("unexpected MCP request");
    return handler(request);
  }
}

function rpcResult(
  request: McpHttpRequest,
  result: unknown,
): McpHttpResponse {
  const envelope = request.body as { id: number };
  const body = {
    jsonrpc: "2.0",
    id: envelope.id,
    result,
  };
  return {
    status: 200,
    body,
    text: JSON.stringify(body),
  };
}

function rpcError(
  request: McpHttpRequest,
  code: number,
  message: string,
): McpHttpResponse {
  const envelope = request.body as { id: number };
  const body = {
    jsonrpc: "2.0",
    id: envelope.id,
    error: { code, message },
  };
  return {
    status: 200,
    body,
    text: JSON.stringify(body),
  };
}

async function testStatelessProtocol(): Promise<void> {
  assert.throws(
    () => new McpStatelessClient({ endpoint: "http://example.com/mcp" }),
    /remote MCP endpoints must use HTTPS/,
  );
  assert.doesNotThrow(
    () => new McpStatelessClient({ endpoint: "http://127.0.0.1:9000/mcp" }),
  );

  const transport = new ScriptedTransport();
  transport.push((request) => rpcResult(request, {
    tools: [{
      name: "search",
      description: "Search authoritative sources",
      inputSchema: { type: "object" },
    }],
    nextCursor: "page-2",
    ttlMs: 60_000,
    cacheScope: "public",
  }));
  transport.push((request) => rpcResult(request, {
    tools: [{
      name: "inspect_repo",
      description: "Inspect a repository",
      inputSchema: { type: "object" },
    }],
    ttlMs: 30_000,
    cacheScope: "private",
  }));

  const client = new McpStatelessClient({
    endpoint: "https://tools.example/mcp",
    bearerToken: "secret-token",
    transport,
    maximumCacheTtlMs: 120_000,
  });

  const first = await client.listTools();
  assert.deepEqual(
    first.tools.map((tool) => tool.name),
    ["search", "inspect_repo"],
  );
  assert.equal(first.ttlMs, 30_000);
  assert.equal(first.cacheScope, "private");
  assert.equal(transport.requests.length, 2);

  const listRequest = transport.requests[0];
  assert.equal(
    listRequest.headers["MCP-Protocol-Version"],
    KINGS_MCP_PROTOCOL_VERSION,
  );
  assert.equal(listRequest.headers["Mcp-Method"], "tools/list");
  assert.equal(listRequest.headers["Mcp-Name"], undefined);
  assert.equal(listRequest.headers.authorization, "Bearer secret-token");
  const listBody = listRequest.body as {
    method: string;
    params: { _meta: Record<string, unknown> };
  };
  assert.equal(listBody.method, "tools/list");
  assert.ok(listBody.params._meta["io.modelcontextprotocol/clientInfo"]);

  const cached = await client.listTools();
  assert.equal(transport.requests.length, 2, "fresh MCP catalog should use TTL cache");
  assert.deepEqual(cached.tools.map((tool) => tool.name), ["search", "inspect_repo"]);

  transport.push((request) => rpcResult(request, {
    tools: [{ name: "search", inputSchema: { type: "object" } }],
    ttlMs: 0,
    cacheScope: "private",
  }));
  const refreshed = await client.listTools({ cacheMode: "refresh" });
  assert.deepEqual(refreshed.tools.map((tool) => tool.name), ["search"]);
  assert.equal(transport.requests.length, 3);

  transport.push((request) => rpcResult(request, {
    resultType: "input_required",
    inputRequests: {
      confirm: {
        type: "elicitation",
        message: "Apply changes?",
        schema: { type: "boolean" },
      },
    },
    requestState: "opaque-state",
  }));
  const inputRequired = await client.callTool("search", { q: "KINGS" });
  assert.equal(inputRequired.resultType, "input_required");
  assert.equal(
    transport.requests.length,
    4,
    "KINGS must not auto-answer MCP elicitation/MRTR requests",
  );
  const callRequest = transport.requests[3];
  assert.equal(callRequest.headers["Mcp-Method"], "tools/call");
  assert.equal(callRequest.headers["Mcp-Name"], "search");

  transport.push((request) => rpcError(request, -32602, "bad arguments"));
  await assert.rejects(
    () => client.callTool("search", { q: 1 }),
    (error: unknown) =>
      error instanceof McpProtocolError &&
      error.code === -32602 &&
      /bad arguments/.test(error.message),
  );

  console.log("K.I.N.G.S. MCP → 2026-07-28 STATELESS HEADERS: SUCCESS");
  console.log("K.I.N.G.S. MCP → PAGINATED TTL/CACHE-SCOPE CATALOG: SUCCESS");
  console.log("K.I.N.G.S. MCP → MRTR INPUT_REQUIRED STAYS GOVERNED: SUCCESS");
  console.log("K.I.N.G.S. MCP → JSON-RPC ERROR PRESERVATION: SUCCESS");
}

async function testGovernedToolBridge(): Promise<void> {
  const transport = new ScriptedTransport();
  transport.push((request) => rpcResult(request, {
    tools: [{
      name: "repo_search",
      title: "Repository Search",
      description: "Search repository source",
      inputSchema: { type: "object" },
    }],
    ttlMs: 15_000,
    cacheScope: "private",
  }));

  const client = new McpStatelessClient({
    endpoint: "https://code-tools.example/mcp",
    transport,
  });
  const registry = new WorkforceRegistry();
  const workUnits = new WorkUnitRegistry();
  const gateway = new ToolGateway(registry, workUnits);
  const provider = new GovernedMcpToolProvider(
    "code-tools",
    client,
    registry,
    gateway,
  );

  const refresh = await provider.refreshTools();
  const toolId = kingsMcpToolId("code-tools", "repo_search");
  assert.equal(refresh.registered, 1);
  assert.deepEqual(refresh.toolIds, [toolId]);
  assert.equal(registry.getTool(toolId)?.enabled, true);
  assert.deepEqual(gateway.listAdapters(), [toolId]);

  registry.registerAgent({
    id: "agent-mcp",
    name: "MCP Engineer",
    role: "coding-engineer",
    description: "Governed MCP test agent",
    capabilities: ["coding"],
    toolIds: [toolId],
    status: "available",
  });
  registry.registerTask({
    id: "task-mcp",
    missionId: "mission-mcp",
    name: "Use governed MCP tool",
    description: "Search repository through MCP",
    requiredCapabilities: ["coding"],
    requiredToolIds: [toolId],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: ["search result"],
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
  });
  workUnits.register("task-mcp", {
    id: "work-unit-mcp",
    role: "coding-engineer",
    objective: "Use the MCP repository search tool",
    capabilityIds: ["coding"],
    allowedToolIds: [toolId],
    allowedPaths: ["."],
    budget: {
      maxTimeMs: 60_000,
      maxTokens: 2_000,
      maxIterations: 2,
    },
    dependencyIds: [],
    acceptanceCriteria: ["real MCP result returned"],
    requiredEvidenceTypes: ["verification"],
    approved: true,
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
  });

  transport.push((request) => rpcResult(request, {
    content: [{ type: "text", text: "found src/router.ts" }],
    structuredContent: { matches: ["src/router.ts"] },
    isError: false,
  }));
  const execution = await gateway.execute({
    requestId: "mcp-execution-1",
    taskId: "task-mcp",
    agentId: "agent-mcp",
    toolId,
    arguments: { query: "router" },
  });
  assert.equal(execution.success, true);
  assert.deepEqual(
    (execution.output as { structuredContent?: unknown }).structuredContent,
    { matches: ["src/router.ts"] },
  );

  transport.push((request) => rpcResult(request, {
    tools: [],
    ttlMs: 0,
    cacheScope: "private",
  }));
  const staleRefresh = await provider.refreshTools();
  assert.equal(staleRefresh.disabled, 1);
  assert.equal(registry.getTool(toolId)?.enabled, false);

  const denied = gateway.authorize({
    requestId: "mcp-execution-2",
    taskId: "task-mcp",
    agentId: "agent-mcp",
    toolId,
    arguments: {},
  });
  assert.equal(denied.allowed, false);
  assert.ok(denied.reasons.some((reason) => reason.includes("is disabled")));

  console.log("K.I.N.G.S. MCP → TOOL DISCOVERY ENTERS EXISTING GOVERNANCE: SUCCESS");
  console.log("K.I.N.G.S. MCP → AUTHORIZED REMOTE TOOL EXECUTION: SUCCESS");
  console.log("K.I.N.G.S. MCP → REMOVED REMOTE TOOL FAILS CLOSED: SUCCESS");
}

async function main(): Promise<void> {
  await testStatelessProtocol();
  await testGovernedToolBridge();
  console.log("TREE-KCM-MCP-STATELESS-GOVERNED-TOOLS: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-MCP-STATELESS-GOVERNED-TOOLS: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
