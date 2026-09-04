import type { WorkforceRegistry } from "./registry";
import type {
  ToolAdapter,
  ToolExecutionRequest,
  ToolGateway,
} from "./tool-gateway";
import type { ToolDefinition } from "./types";
import {
  McpStatelessClient,
  type McpCallToolResult,
  type McpToolDefinition,
} from "./mcp-stateless-client";

export interface GovernedMcpToolProviderRefresh {
  discovered: number;
  registered: number;
  reenabled: number;
  disabled: number;
  toolIds: readonly string[];
}

function validateServerId(serverId: string): string {
  const value = serverId.trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(value)) {
    throw new Error(
      "K.I.N.G.S. MCP: server id must contain only letters, numbers, dot, underscore, or dash and be at most 64 characters",
    );
  }
  return value;
}

export function kingsMcpToolId(
  serverId: string,
  remoteToolName: string,
): string {
  return `mcp:${validateServerId(serverId)}:${remoteToolName}`;
}

export class McpToolAdapter implements ToolAdapter {
  constructor(
    readonly toolId: string,
    private readonly remoteToolName: string,
    private readonly client: McpStatelessClient,
  ) {}

  async execute(request: ToolExecutionRequest): Promise<McpCallToolResult> {
    const result = await this.client.callTool(
      this.remoteToolName,
      request.arguments,
    );
    if (result.isError === true) {
      const diagnostic = typeof result.structuredContent === "string"
        ? result.structuredContent
        : JSON.stringify(result.structuredContent ?? result.content ?? "remote MCP tool error");
      throw new Error(
        `K.I.N.G.S. MCP tool "${this.remoteToolName}" reported an execution error: ${diagnostic}`,
      );
    }
    // Multi Round-Trip Requests are deliberately not auto-answered here. An
    // input_required result remains visible to the governed orchestration layer
    // so human confirmation/elicitation can be handled explicitly.
    return result;
  }
}

export class GovernedMcpToolProvider {
  private readonly serverId: string;
  private readonly managedToolIds = new Set<string>();

  constructor(
    serverId: string,
    private readonly client: McpStatelessClient,
    private readonly registry: WorkforceRegistry,
    private readonly gateway: ToolGateway,
  ) {
    this.serverId = validateServerId(serverId);
  }

  async refreshTools(): Promise<GovernedMcpToolProviderRefresh> {
    const catalog = await this.client.listTools({ cacheMode: "refresh" });
    const active = new Set<string>();
    let registered = 0;
    let reenabled = 0;
    let disabled = 0;

    for (const remote of catalog.tools) {
      const toolId = kingsMcpToolId(this.serverId, remote.name);
      active.add(toolId);
      const existing = this.registry.getTool(toolId);

      if (existing && !this.managedToolIds.has(toolId)) {
        throw new Error(
          `K.I.N.G.S. MCP: refusing to take ownership of pre-existing tool id "${toolId}"`,
        );
      }

      if (!existing) {
        this.registry.registerTool(this.toToolDefinition(toolId, remote));
        registered += 1;
      } else {
        if (!existing.enabled) reenabled += 1;
        existing.name = remote.title?.trim() || remote.name;
        existing.description = this.descriptionFor(remote);
        existing.capabilities = ["mcp", "remote-tool"];
        existing.enabled = true;
      }

      if (!this.gateway.listAdapters().includes(toolId)) {
        this.gateway.registerAdapter(
          new McpToolAdapter(toolId, remote.name, this.client),
        );
      }
      this.managedToolIds.add(toolId);
    }

    for (const toolId of this.managedToolIds) {
      if (active.has(toolId)) continue;
      const tool = this.registry.getTool(toolId);
      if (tool?.enabled) {
        tool.enabled = false;
        disabled += 1;
      }
    }

    return {
      discovered: catalog.tools.length,
      registered,
      reenabled,
      disabled,
      toolIds: Array.from(active).sort(),
    };
  }

  listManagedToolIds(): readonly string[] {
    return Array.from(this.managedToolIds).sort();
  }

  private toToolDefinition(
    toolId: string,
    remote: McpToolDefinition,
  ): ToolDefinition {
    return {
      id: toolId,
      name: remote.title?.trim() || remote.name,
      description: this.descriptionFor(remote),
      capabilities: ["mcp", "remote-tool"],
      enabled: true,
    };
  }

  private descriptionFor(remote: McpToolDefinition): string {
    const description = remote.description?.trim();
    return description
      ? `MCP ${this.serverId}: ${description}`
      : `MCP ${this.serverId} remote tool ${remote.name}`;
  }
}
