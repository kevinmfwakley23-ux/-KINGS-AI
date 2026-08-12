import {
  WorkforceRegistry,
} from "../registry";

import {
  WorkUnitRegistry,
} from "../work-unit-registry";

import {
  ToolGateway,
  type ToolExecutionRequest,
} from "../tool-gateway";

import {
  WebAccessAdapter,
  type WebAccessFetcher,
  type WebAccessHostResolver,
  type WebAccessResponse,
  WEB_ACCESS_TOOL_ID,
} from "../web-access";

import {
  registerExternalResearchTool,
} from "./external-research-registration";

import type {
  ExternalResearchAuthorizer,
} from "./external-research";

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
    return hostname ===
      "example.com"
      ? ["93.184.216.34"]
      : [];
  }
}

function createResponse(): WebAccessResponse {
  const bytes =
    new TextEncoder().encode(
      "gateway external research source",
    );

  let consumed =
    false;

  return {
    status:
      200,
    statusText:
      "OK",
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
          "content-type"
        ) {
          return "text/plain";
        }

        if (
          normalized ===
          "content-length"
        ) {
          return String(
            bytes.byteLength,
          );
        }

        return null;
      },
    },
    body: {
      getReader() {
        return {
          async read() {
            if (
              consumed
            ) {
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
    (async (
      _url: string,
      _options: {
        method: string;
        headers?: Record<string, string>;
        redirect: "manual";
        signal: AbortSignal;
      },
    ) =>
      createResponse()) as WebAccessFetcher,
  );

const authorizer:
  ExternalResearchAuthorizer = {
  authorize(
    request,
  ): void {
    if (
      request.taskId !==
      "task-research-gateway"
    ) {
      throw new Error(
        `Unexpected research task "${request.taskId}"`,
      );
    }
  },
};

async function run(): Promise<void> {
  const registry =
    new WorkforceRegistry();

  const workUnits =
    new WorkUnitRegistry();

  const gateway =
    new ToolGateway(
      registry,
      workUnits,
    );

  registerExternalResearchTool(
    registry,
    gateway,
    webAccess,
    authorizer,
  );

  registry.registerAgent({
    id:
      "agent-research-gateway",
    name:
      "K.I.N.G.S. External Research Worker",
    role:
      "Controlled external research execution",
    description:
      "Worker authorized to perform controlled external research.",
    capabilities: [
      "research",
    ],
    toolIds: [
      WEB_ACCESS_TOOL_ID,
      "tool-external-research",
    ],
    status:
      "available",
  });

  registry.registerMission({
    id:
      "mission-research-gateway",
    name:
      "External Research Gateway Mission",
    description:
      "Verify controlled external research gateway execution.",
    status:
      "active",
    objectives: [
      "Execute one authorized external research request.",
    ],
    sourceReferences: [],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  });

  registry.registerTask({
    id:
      "task-research-gateway",
    missionId:
      "mission-research-gateway",
    name:
      "Gateway Research Task",
    description:
      "Execute one authorized external research request.",
    assignedAgentId:
      "agent-research-gateway",
    requiredCapabilities: [
      "research",
    ],
    requiredToolIds: [
      "tool-external-research",
    ],
    status:
      "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: [
      "Controlled external research result",
    ],
    createdAt:
      new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
  });

  workUnits.register(
    "task-research-gateway",
    {
      id:
        "work-unit-research-gateway",
      role:
        "Controlled external research worker",
      objective:
        "Execute one authorized external research request.",
      capabilityIds: [
        "research",
      ],
      allowedToolIds: [
        "tool-external-research",
      ],
      allowedPaths: [],
      budget: {
        maxTimeMs:
          5000,
        maxTokens:
          1000,
        maxIterations:
          1,
      },
      dependencyIds: [],
      acceptanceCriteria: [
        "Authorized source is retrieved and provenance is preserved.",
      ],
      requiredEvidenceTypes: [
        "external-research-source",
      ],
      approved:
        true,
      createdAt:
        new Date().toISOString(),
      updatedAt:
        new Date().toISOString(),
    },
  );

  const request:
    ToolExecutionRequest = {
    requestId:
      "gateway-research-request",
    taskId:
      "task-research-gateway",
    agentId:
      "agent-research-gateway",
    toolId:
      "tool-external-research",
    arguments: {
      researchId:
        "gateway-research-001",
      question:
        "What does the authorized source contain?",
      urls: [
        "https://example.com/",
      ],
      maxSources:
        1,
    },
  };

  const decision =
    gateway.authorize(
      request,
    );

  assert(
    decision.allowed,
    `Authorized external research request was rejected: ${decision.reasons.join("; ")}`,
  );

  assert(
    decision.reasons.length ===
      0,
    "Authorized request unexpectedly produced authorization reasons.",
  );

  const result =
    await gateway.execute(
      request,
    );

  assert(
    result.success,
    `Gateway external research execution failed: ${result.errorMessage ?? "unknown error"}`,
  );

  const output =
    result.output as {
      researchId: string;
      taskId: string;
      sources: Array<{
        sourceId: string;
        status: number;
      }>;
      findings: unknown[];
    };

  assert(
    output.researchId ===
      "gateway-research-001",
    "Gateway did not preserve research identity.",
  );

  assert(
    output.taskId ===
      "task-research-gateway",
    "Gateway did not preserve task identity.",
  );

  assert(
    output.sources.length ===
      1,
    "Gateway did not return the authorized source.",
  );

  assert(
    output.sources[0].status ===
      200,
    "Gateway did not preserve source response status.",
  );

  assert(
    output.findings.length ===
      0,
    "Gateway incorrectly promoted raw retrieval into findings.",
  );

  console.log(
    "05.9 ToolGateway external research execution: SUCCESS",
  );

  const unauthorizedTask:
    ToolExecutionRequest = {
    ...request,
    taskId:
      "task-unauthorized",
  };

  const rejected =
    await gateway.execute(
      unauthorizedTask,
    );

  assert(
    !rejected.success,
    "Unauthorized research request was executed.",
  );

  assert(
    rejected.errorCode ===
      "TOOL_AUTHORIZATION_REJECTED",
    "Unauthorized research request returned the wrong error code.",
  );

  console.log(
    "05.9 ToolGateway authorization enforcement: SUCCESS",
  );

  console.log(
    "TREE-05.9 EXTERNAL RESEARCH TOOL-GATEWAY INTEGRATION: SUCCESS",
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
