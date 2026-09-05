export const KINGS_MCP_PROTOCOL_VERSION = "2026-07-28";

export type McpCacheScope = "private" | "public";

export interface McpToolDefinition {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: Record<string, unknown>;
}

export interface McpToolCatalog {
  tools: readonly McpToolDefinition[];
  ttlMs: number;
  cacheScope: McpCacheScope;
  fetchedAt: string;
}

export interface McpCallToolResult {
  resultType?: string;
  content?: unknown;
  structuredContent?: unknown;
  isError?: boolean;
  inputRequests?: unknown;
  requestState?: unknown;
  [key: string]: unknown;
}

export interface McpHttpRequest {
  endpoint: string;
  headers: Readonly<Record<string, string>>;
  body: unknown;
  timeoutMs: number;
  maxResponseBytes: number;
}

export interface McpHttpResponse {
  status: number;
  body: unknown;
  text: string;
}

export interface McpHttpTransport {
  request(request: McpHttpRequest): Promise<McpHttpResponse>;
}

export interface FetchMcpHttpTransportOptions {
  allowInsecureHttp?: boolean;
}

export interface McpStatelessClientOptions {
  endpoint: string;
  bearerToken?: string;
  clientName?: string;
  clientVersion?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maximumCacheTtlMs?: number;
  maxListPages?: number;
  transport?: McpHttpTransport;
  allowInsecureHttp?: boolean;
}

interface JsonRpcEnvelope {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc?: unknown;
  id?: unknown;
  result?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
    data?: unknown;
  };
}

interface ToolListPage {
  tools: McpToolDefinition[];
  nextCursor?: string;
  ttlMs: number;
  cacheScope: McpCacheScope;
}

interface CachedToolCatalog {
  catalog: McpToolCatalog;
  expiresAt: number;
}

function isLoopbackHost(hostname: string): boolean {
  const value = hostname.toLowerCase();
  return value === "localhost" ||
    value === "::1" ||
    value === "[::1]" ||
    value === "0.0.0.0" ||
    value === "127.0.0.1" ||
    value.startsWith("127.");
}

function validateEndpoint(
  endpoint: string,
  allowInsecureHttp: boolean,
): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("K.I.N.G.S. MCP: endpoint must be an absolute URL");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("K.I.N.G.S. MCP: endpoint must use HTTP or HTTPS");
  }
  if (
    url.protocol === "http:" &&
    !allowInsecureHttp &&
    !isLoopbackHost(url.hostname)
  ) {
    throw new Error(
      "K.I.N.G.S. MCP: remote MCP endpoints must use HTTPS; insecure HTTP is allowed only for loopback development unless explicitly enabled",
    );
  }

  url.hash = "";
  return url.toString();
}

function positiveInteger(
  value: number,
  label: string,
): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`K.I.N.G.S. MCP: ${label} must be a positive integer`);
  }
  return value;
}

function nonNegativeFinite(
  value: unknown,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function cacheScope(value: unknown): McpCacheScope {
  return value === "public" ? "public" : "private";
}

function validateToolName(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("K.I.N.G.S. MCP: tool name must be a string");
  }
  const name = value.trim();
  if (!name || name.length > 256 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error("K.I.N.G.S. MCP: tool name is empty, too long, or contains control characters");
  }
  return name;
}

function parseTool(value: unknown): McpToolDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("K.I.N.G.S. MCP: tools/list returned an invalid tool entry");
  }
  const source = value as Record<string, unknown>;
  const tool: McpToolDefinition = {
    name: validateToolName(source.name),
  };
  if (typeof source.title === "string") tool.title = source.title;
  if (typeof source.description === "string") tool.description = source.description;
  if ("inputSchema" in source) tool.inputSchema = source.inputSchema;
  if ("outputSchema" in source) tool.outputSchema = source.outputSchema;
  if (
    source.annotations &&
    typeof source.annotations === "object" &&
    !Array.isArray(source.annotations)
  ) {
    tool.annotations = source.annotations as Record<string, unknown>;
  }
  return tool;
}

function parseToolListPage(result: unknown): ToolListPage {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("K.I.N.G.S. MCP: tools/list returned an invalid result");
  }
  const source = result as Record<string, unknown>;
  if (!Array.isArray(source.tools)) {
    throw new Error("K.I.N.G.S. MCP: tools/list result is missing tools[]");
  }
  const nextCursor = source.nextCursor;
  if (nextCursor !== undefined && typeof nextCursor !== "string") {
    throw new Error("K.I.N.G.S. MCP: tools/list nextCursor must be a string");
  }
  return {
    tools: source.tools.map(parseTool),
    nextCursor,
    ttlMs: nonNegativeFinite(source.ttlMs, 0),
    cacheScope: cacheScope(source.cacheScope),
  };
}

async function readBoundedResponse(
  response: Response,
  maxResponseBytes: number,
): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > maxResponseBytes) {
    throw new Error(
      `K.I.N.G.S. MCP: response exceeds ${maxResponseBytes} byte limit`,
    );
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxResponseBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(
          `K.I.N.G.S. MCP: response exceeds ${maxResponseBytes} byte limit`,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

export class FetchMcpHttpTransport implements McpHttpTransport {
  constructor(
    private readonly options: FetchMcpHttpTransportOptions = {},
  ) {}

  async request(request: McpHttpRequest): Promise<McpHttpResponse> {
    validateEndpoint(
      request.endpoint,
      this.options.allowInsecureHttp === true,
    );
    const response = await fetch(request.endpoint, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    const text = await readBoundedResponse(
      response,
      request.maxResponseBytes,
    );
    let body: unknown;
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = undefined;
      }
    }
    return {
      status: response.status,
      body,
      text,
    };
  }
}

export class McpProtocolError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "McpProtocolError";
  }
}

export class McpStatelessClient {
  private readonly endpoint: string;
  private readonly bearerToken?: string;
  private readonly clientName: string;
  private readonly clientVersion: string;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly maximumCacheTtlMs: number;
  private readonly maxListPages: number;
  private readonly transport: McpHttpTransport;
  private nextRequestId = 1;
  private toolCatalogCache?: CachedToolCatalog;

  constructor(options: McpStatelessClientOptions) {
    this.endpoint = validateEndpoint(
      options.endpoint,
      options.allowInsecureHttp === true,
    );
    this.bearerToken = options.bearerToken?.trim() || undefined;
    this.clientName = options.clientName?.trim() || "K.I.N.G.S. AI";
    this.clientVersion = options.clientVersion?.trim() || "0.1.0";
    this.timeoutMs = positiveInteger(options.timeoutMs ?? 60_000, "timeoutMs");
    this.maxResponseBytes = positiveInteger(
      options.maxResponseBytes ?? 5_242_880,
      "maxResponseBytes",
    );
    this.maximumCacheTtlMs = positiveInteger(
      options.maximumCacheTtlMs ?? 300_000,
      "maximumCacheTtlMs",
    );
    this.maxListPages = positiveInteger(options.maxListPages ?? 20, "maxListPages");
    this.transport = options.transport ?? new FetchMcpHttpTransport({
      allowInsecureHttp: options.allowInsecureHttp,
    });
  }

  clearToolCatalogCache(): void {
    this.toolCatalogCache = undefined;
  }

  async listTools(options: {
    cacheMode?: "default" | "refresh" | "bypass";
  } = {}): Promise<McpToolCatalog> {
    const cacheMode = options.cacheMode ?? "default";
    const now = Date.now();
    if (
      cacheMode === "default" &&
      this.toolCatalogCache &&
      this.toolCatalogCache.expiresAt > now
    ) {
      return this.cloneCatalog(this.toolCatalogCache.catalog);
    }

    const tools: McpToolDefinition[] = [];
    const names = new Set<string>();
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    let ttlMs = Number.POSITIVE_INFINITY;
    let scope: McpCacheScope = "public";
    let pages = 0;

    do {
      pages += 1;
      if (pages > this.maxListPages) {
        throw new Error(
          `K.I.N.G.S. MCP: tools/list exceeded ${this.maxListPages} page limit`,
        );
      }
      const params: Record<string, unknown> = {};
      if (cursor) params.cursor = cursor;
      const page = parseToolListPage(
        await this.callRpc("tools/list", undefined, params),
      );
      ttlMs = Math.min(ttlMs, page.ttlMs);
      if (page.cacheScope === "private") scope = "private";

      for (const tool of page.tools) {
        if (names.has(tool.name)) {
          throw new Error(
            `K.I.N.G.S. MCP: duplicate tool name "${tool.name}" across tools/list pages`,
          );
        }
        names.add(tool.name);
        tools.push(tool);
      }

      cursor = page.nextCursor?.trim() || undefined;
      if (cursor) {
        if (seenCursors.has(cursor)) {
          throw new Error("K.I.N.G.S. MCP: tools/list pagination cursor cycle detected");
        }
        seenCursors.add(cursor);
      }
    } while (cursor);

    const boundedTtl = Number.isFinite(ttlMs)
      ? Math.min(ttlMs, this.maximumCacheTtlMs)
      : 0;
    const catalog: McpToolCatalog = {
      tools,
      ttlMs: boundedTtl,
      cacheScope: scope,
      fetchedAt: new Date(now).toISOString(),
    };

    if (cacheMode !== "bypass" && boundedTtl > 0) {
      this.toolCatalogCache = {
        catalog: this.cloneCatalog(catalog),
        expiresAt: now + boundedTtl,
      };
    }
    return this.cloneCatalog(catalog);
  }

  async callTool(
    name: string,
    argumentsValue: Record<string, unknown>,
  ): Promise<McpCallToolResult> {
    const toolName = validateToolName(name);
    const result = await this.callRpc(
      "tools/call",
      toolName,
      {
        name: toolName,
        arguments: argumentsValue,
      },
    );
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("K.I.N.G.S. MCP: tools/call returned an invalid result");
    }
    return { ...(result as McpCallToolResult) };
  }

  private async callRpc(
    method: string,
    name: string | undefined,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const id = this.nextRequestId++;
    const envelope: JsonRpcEnvelope = {
      jsonrpc: "2.0",
      id,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": KINGS_MCP_PROTOCOL_VERSION,
          "io.modelcontextprotocol/clientInfo": {
            name: this.clientName,
            version: this.clientVersion,
          },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    };
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
      "MCP-Protocol-Version": KINGS_MCP_PROTOCOL_VERSION,
      "Mcp-Method": method,
    };
    if (name) headers["Mcp-Name"] = name;
    if (this.bearerToken) headers.authorization = `Bearer ${this.bearerToken}`;

    const response = await this.transport.request({
      endpoint: this.endpoint,
      headers,
      body: envelope,
      timeoutMs: this.timeoutMs,
      maxResponseBytes: this.maxResponseBytes,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new McpProtocolError(
        `K.I.N.G.S. MCP: HTTP ${response.status}: ${response.text || "request failed"}`,
      );
    }
    if (!response.body || typeof response.body !== "object") {
      throw new McpProtocolError("K.I.N.G.S. MCP: server returned no JSON-RPC response");
    }
    const payload = response.body as JsonRpcResponse;
    if (payload.jsonrpc !== "2.0" || payload.id !== id) {
      throw new McpProtocolError(
        "K.I.N.G.S. MCP: JSON-RPC version or response id does not match the request",
      );
    }
    if (payload.error) {
      const code = typeof payload.error.code === "number"
        ? payload.error.code
        : undefined;
      const message = typeof payload.error.message === "string"
        ? payload.error.message
        : "MCP server returned a JSON-RPC error";
      throw new McpProtocolError(
        `K.I.N.G.S. MCP: ${message}`,
        code,
        payload.error.data,
      );
    }
    if (!("result" in payload)) {
      throw new McpProtocolError("K.I.N.G.S. MCP: JSON-RPC response is missing result");
    }
    return payload.result;
  }

  private cloneCatalog(catalog: McpToolCatalog): McpToolCatalog {
    return {
      ...catalog,
      tools: catalog.tools.map((tool) => ({ ...tool })),
    };
  }
}
