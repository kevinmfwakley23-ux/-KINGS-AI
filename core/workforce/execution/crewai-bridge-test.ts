import { spawn } from "node:child_process";

import {
  createWorkforceResult,
} from "./result-protocol";

const CREWAI_PYTHON =
  `${process.env.HOME}/.local/share/uv/tools/crewai/bin/python`;

const BRIDGE_PATH =
  "runtimes/crewai-bridge/bridge.py";

interface BridgeResponse {
  status: string;
  summary: string;
  reasoning?: string;
  artifactIds?: string[];
  verificationReferences?: string[];
  agentId: string;
  taskId: string;
  executionStarted: boolean;
}

async function runBridge(
  request: unknown,
): Promise<BridgeResponse> {
  return new Promise(
    (resolve, reject) => {
      const child = spawn(
        CREWAI_PYTHON,
        [BRIDGE_PATH],
        {
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      let stdout = "";
      let stderr = "";

      child.stdout.on(
        "data",
        (chunk: Buffer) => {
          stdout += chunk.toString();
        },
      );

      child.stderr.on(
        "data",
        (chunk: Buffer) => {
          stderr += chunk.toString();
        },
      );

      child.on(
        "error",
        (error: Error) => {
          reject(error);
        },
      );

      child.on(
        "close",
        (code: number | null) => {
          if (code !== 0) {
            reject(
              new Error(
                `CrewAI bridge exited with code ${code}: ${stderr}`,
              ),
            );
            return;
          }

          try {
            resolve(
              JSON.parse(stdout) as BridgeResponse,
            );
          } catch (error) {
            reject(
              new Error(
                `Invalid bridge JSON: ${String(error)}\n${stdout}`,
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

async function main(): Promise<void> {
  const request = {
    agent: {
      id: "agent-end-to-end-test",
      role: "K.I.N.G.S. Bridge Test Agent",
      description:
        "Verify the complete K.I.N.G.S. to CrewAI result path.",
    },
    task: {
      id: "task-end-to-end-test",
      description:
        "Construct CrewAI objects and return a standardized result without model execution.",
      expectedOutputs: [
        "CrewAI objects constructed",
        "Standardized external result returned",
      ],
    },
  };

  const external =
    await runBridge(request);

  if (external.executionStarted !== false) {
    throw new Error(
      "Safety check failed: model execution was started.",
    );
  }

  const result = createWorkforceResult(
    {
      taskId: request.task.id,
      agentId: request.agent.id,
    },
    external,
  );

  console.log(
    "=== K.I.N.G.S. CREWAI BRIDGE ROUND TRIP ===",
  );

  console.log(
    JSON.stringify(result, null, 2),
  );

  if (result.status !== "success") {
    throw new Error(
      "Round-trip test failed: expected success result.",
    );
  }

  if (
    result.taskId !== request.task.id
  ) {
    throw new Error(
      "Round-trip test failed: task ID mismatch.",
    );
  }

  if (
    result.agentId !== request.agent.id
  ) {
    throw new Error(
      "Round-trip test failed: agent ID mismatch.",
    );
  }

  if (
    result.verificationReferences.length !== 3
  ) {
    throw new Error(
      "Round-trip test failed: verification references mismatch.",
    );
  }

  console.log(
    "CrewAI bridge round-trip test: SUCCESS",
  );
}

main().catch((error: unknown) => {
  console.error(
    "=== K.I.N.G.S. CREWAI BRIDGE TEST FAILED ===",
  );
  console.error(error);
});
