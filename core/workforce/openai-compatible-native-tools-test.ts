import { strict as assert } from "node:assert";
import type { ModelExecutionRequest } from "./model-interface";
import {
  OpenAiCompatibleGatewayAdapter,
  type OpenAiCompatibleGatewayHttpResponse,
  type OpenAiCompatibleGatewayTransport,
} from "./openai-compatible-gateway";

class ScriptedTransport implements OpenAiCompatibleGatewayTransport {
  readonly calls: Array<{
    method: "GET" | "POST";
    path: string;
    body?: unknown;
  }> = [];
  private readonly responses: Array<(
    body: unknown,
  ) => OpenAiCompatibleGatewayHttpResponse> = [];

  push(response: (body: unknown) => OpenAiCompatibleGatewayHttpResponse): void {
    this.responses.push(response);
  }

  async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<OpenAiCompatibleGatewayHttpResponse> {
    this.calls.push({ method, path, body });
    const response = this.responses.shift();
    if (!response) throw new Error("unexpected gateway call");
    return response(body);
  }
}

function request(): ModelExecutionRequest {
  return {
    id: "native-tools-request",
    taskId: "native-tools-task",
    missionId: "native-tools-mission",
    messages: [{ role: "user", content: "Inspect the repository." }],
    requiredCapabilities: ["coding", "tool-use"],
    inputModalities: ["text"],
    outputModality: "text",
    allowToolProposals: true,
    parallelToolCalls: false,
    toolDefinitions: [{
      toolId: "mcp:code-tools:repo_search",
      description: "Search the authorized repository.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    }],
  };
}

function adapter(transport: ScriptedTransport): OpenAiCompatibleGatewayAdapter {
  return new OpenAiCompatibleGatewayAdapter({
    id: "omniroute",
    name: "OmniRoute",
    gatewayKind: "omniroute",
    baseUrl: "https://gateway.example/v1",
    discoverModels: false,
    models: [{
      modelId: "tool-coder",
      capabilities: ["coding", "tool-use"],
      supportsToolCalling: true,
      metadataProvenance: {
        supportsToolCalling: "configured",
      },
    }],
  }, transport);
}

async function main(): Promise<void> {
  const transport = new ScriptedTransport();
  let providerToolName = "";

  transport.push((body) => {
    const payload = body as {
      tools: Array<{
        type: string;
        function: {
          name: string;
          description: string;
          parameters: Record<string, unknown>;
        };
      }>;
      tool_choice: string;
      parallel_tool_calls: boolean;
    };
    assert.equal(payload.tools.length, 1);
    providerToolName = payload.tools[0].function.name;
    assert.match(providerToolName, /^kings_/);
    assert.equal(providerToolName.includes(":"), false);
    assert.ok(providerToolName.length <= 64);
    assert.equal(payload.tool_choice, "auto");
    assert.equal(payload.parallel_tool_calls, false);
    assert.equal(payload.tools[0].function.parameters.type, "object");
    return {
      status: 200,
      text: "",
      body: {
        id: "provider-tool-request-1",
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: "call-repo-search",
              type: "function",
              function: {
                name: providerToolName,
                arguments: JSON.stringify({ query: "router" }),
              },
            }],
          },
        }],
        usage: {
          prompt_tokens: 25,
          completion_tokens: 5,
          total_tokens: 30,
        },
      },
    };
  });

  const gateway = adapter(transport);
  const first = await gateway.execute("tool-coder", request());
  assert.equal(first.success, true);
  assert.equal(first.response?.content, "");
  assert.equal(first.response?.toolCallProposals.length, 1);
  const proposal = first.response!.toolCallProposals[0];
  assert.equal(proposal.toolId, "mcp:code-tools:repo_search");
  assert.deepEqual(proposal.arguments, { query: "router" });
  assert.equal(proposal.argumentParseError, undefined);

  transport.push((body) => {
    const payload = body as {
      messages: Array<Record<string, unknown>>;
    };
    const assistant = payload.messages.at(-2)!;
    const tool = payload.messages.at(-1)!;
    assert.equal(assistant.role, "assistant");
    const calls = assistant.tool_calls as Array<{
      id: string;
      function: { name: string; arguments: string };
    }>;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, "call-repo-search");
    assert.equal(calls[0].function.name, providerToolName);
    assert.deepEqual(JSON.parse(calls[0].function.arguments), { query: "router" });
    assert.equal(tool.role, "tool");
    assert.equal(tool.tool_call_id, "call-repo-search");
    assert.match(String(tool.content), /src\/router\.ts/);
    return {
      status: 200,
      text: "",
      body: {
        choices: [{ message: { content: "Repository inspection complete." } }],
        usage: {
          prompt_tokens: 40,
          completion_tokens: 8,
          total_tokens: 48,
        },
      },
    };
  });

  const secondRequest = request();
  secondRequest.id = "native-tools-request-round-2";
  secondRequest.messages = [
    ...secondRequest.messages,
    {
      role: "assistant",
      content: "",
      toolCalls: [proposal],
    },
    {
      role: "tool",
      content: JSON.stringify({ matches: ["src/router.ts"] }),
      toolCallId: proposal.id,
    },
  ];
  const second = await gateway.execute("tool-coder", secondRequest);
  assert.equal(second.success, true);
  assert.equal(second.response?.content, "Repository inspection complete.");
  assert.equal(second.response?.toolCallProposals.length, 0);

  const malformedTransport = new ScriptedTransport();
  malformedTransport.push((body) => {
    const payload = body as { tools: Array<{ function: { name: string } }> };
    return {
      status: 200,
      text: "",
      body: {
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: "malformed-call",
              function: {
                name: payload.tools[0].function.name,
                arguments: "{not-json",
              },
            }],
          },
        }],
      },
    };
  });
  const malformed = await adapter(malformedTransport).execute(
    "tool-coder",
    request(),
  );
  assert.equal(malformed.success, true);
  assert.match(
    malformed.response?.toolCallProposals[0].argumentParseError ?? "",
    /invalid JSON/,
  );
  assert.deepEqual(malformed.response?.toolCallProposals[0].arguments, {});

  const invalidMessageTransport = new ScriptedTransport();
  const invalidMessage = request();
  invalidMessage.messages = [{ role: "tool", content: "missing id" }];
  const invalid = await adapter(invalidMessageTransport).execute(
    "tool-coder",
    invalidMessage,
  );
  assert.equal(invalid.success, false);
  assert.equal(invalid.failure?.code, "GATEWAY_INVALID_REQUEST");
  assert.equal(invalidMessageTransport.calls.length, 0);

  console.log("K.I.N.G.S. NATIVE TOOLS → JSON-SCHEMA ADVERTISEMENT: SUCCESS");
  console.log("K.I.N.G.S. NATIVE TOOLS → INTERNAL/PROVIDER TOOL-ID ALIASING: SUCCESS");
  console.log("K.I.N.G.S. NATIVE TOOLS → TOOL-CALL-ONLY RESPONSE: SUCCESS");
  console.log("K.I.N.G.S. NATIVE TOOLS → TOOL RESULT ROUND-TRIP: SUCCESS");
  console.log("K.I.N.G.S. NATIVE TOOLS → MALFORMED ARGUMENTS FAIL EXECUTION-SAFE: SUCCESS");
  console.log("TREE-KCM-OPENAI-COMPATIBLE-NATIVE-TOOLS: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-OPENAI-COMPATIBLE-NATIVE-TOOLS: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
