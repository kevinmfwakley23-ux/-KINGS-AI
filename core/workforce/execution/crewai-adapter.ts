import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";

import type {
  AgentDefinition,
  WorkforceResult,
} from "../types";

import type {
  AgentExecutionAdapter,
  AgentExecutionContext,
} from "./adapter";

import {
  createWorkforceResult,
} from "./result-protocol";

interface CrewAIBridgeResponse {
  status: string;
  summary: string;
  reasoning?: string;
  artifactIds?: string[];
  verificationReferences?: string[];
  agentId: string;
  taskId: string;
  executionStarted: boolean;
}

const CREWAI_PYTHON = resolve(
  homedir(),
  ".local/share/uv/tools/crewai/bin/python",
);

const BRIDGE_PATH = resolve(
  process.cwd(),
  "runtimes/crewai-bridge/bridge.py",
);

export class CrewAIExecutionAdapter
  implements AgentExecutionAdapter
{
  readonly id = "crewai";
  readonly name = "CrewAI Execution Adapter";

  canExecute(
    agent: AgentDefinition,
  ): boolean {
    return agent.capabilities.includes(
      "crewai",
    );
  }

  async execute(
    context: AgentExecutionContext,
  ): Promise<WorkforceResult> {
    const request = {
      agent: {
        id: context.agent.id,
        role: context.agent.role,
        description:
          context.agent.description,
      },
      task: {
        id: context.task.id,
        description:
          context.task.description,
        expectedOutputs:
          context.task.expectedOutputs,
      },
    };

    const external =
      await this.runBridge(
        request,
      );

    if (
      external.executionStarted !== false
    ) {
      throw new Error(
        `K.I.N.G.S. CrewAI Adapter: bridge reported unexpected model execution for task "${context.task.id}"`,
      );
    }

    if (
      external.taskId !== context.task.id
    ) {
      throw new Error(
        `K.I.N.G.S. CrewAI Adapter: bridge returned task "${external.taskId}" for task "${context.task.id}"`,
      );
    }

    if (
      external.agentId !== context.agent.id
    ) {
      throw new Error(
        `K.I.N.G.S. CrewAI Adapter: bridge returned agent "${external.agentId}" for agent "${context.agent.id}"`,
      );
    }

    return createWorkforceResult(
      {
        taskId: context.task.id,
        agentId: context.agent.id,
      },
      external,
    );
  }

  private runBridge(
    request: unknown,
  ): Promise<CrewAIBridgeResponse> {
    return new Promise(
      (resolveBridge, reject) => {
        const child = spawn(
          CREWAI_PYTHON,
          [BRIDGE_PATH],
          {
            stdio: [
              "pipe",
              "pipe",
              "pipe",
            ],
          },
        );

        let stdout = "";
        let stderr = "";

        child.stdout.on(
          "data",
          (chunk: Buffer) => {
            stdout +=
              chunk.toString();
          },
        );

        child.stderr.on(
          "data",
          (chunk: Buffer) => {
            stderr +=
              chunk.toString();
          },
        );

        child.on(
          "error",
          (error: Error) => {
            reject(
              new Error(
                `K.I.N.G.S. CrewAI Adapter: unable to start bridge: ${error.message}`,
              ),
            );
          },
        );

        child.on(
          "close",
          (
            code: number | null,
          ) => {
            if (code !== 0) {
              reject(
                new Error(
                  `K.I.N.G.S. CrewAI Adapter: bridge exited with code ${code}: ${stderr}`,
                ),
              );
              return;
            }

            try {
              const response =
                JSON.parse(
                  stdout,
                ) as CrewAIBridgeResponse;

              resolveBridge(
                response,
              );
            } catch (
              error
            ) {
              reject(
                new Error(
                  `K.I.N.G.S. CrewAI Adapter: invalid bridge JSON: ${String(error)}\n${stdout}`,
                ),
              );
            }
          },
        );

        child.stdin.write(
          JSON.stringify(request),
        );

        child.stdin.end();
      },
    );
  }
}
