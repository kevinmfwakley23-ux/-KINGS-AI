import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { TaskControl } from "../../core/workforce/task-control";
import { WorkforceRegistry } from "../../core/workforce/registry";
import { KingsCodingMachine } from "../../core/workforce/kings-coding-machine";
import type { ProjectOwnerMissionFactory } from "../../core/workforce/project-owner-machine-api";
import { ProjectOwnerMachineServerController } from "./server-contract";
import type { ProjectOwnerDesignInput } from "../../core/workforce/project-owner-ui-contract";
import type { Mission, MissionStatus } from "../../core/workforce/types";
import type { MissionPlan } from "../../core/workforce/mission-continuity";

const port = Number(process.env.KINGS_CODING_MACHINE_PORT ?? 8787);
const hostname = process.env.KINGS_CODING_MACHINE_HOST ?? "kings.local";
const workspaceRoot = process.env.KINGS_CODING_MACHINE_WORKSPACE ?? process.cwd();
const publicFile = join(process.cwd(), "ui/project-owner/index.html");

function buildMission(input: ProjectOwnerDesignInput): { mission: Mission; plan: MissionPlan } {
  const now = new Date().toISOString();
  const missionId = input.id;
  const status: MissionStatus = "planned";
  return {
    mission: {
      id: missionId,
      name: input.projectName,
      description: input.objective,
      status,
      objectives: [input.objective],
      sourceReferences: ["project-owner-ui"],
      createdAt: now,
      updatedAt: now,
    },
    plan: {
      id: `plan-${missionId}`,
      missionId,
      version: 1,
      objective: input.objective,
      milestones: [
        {
          id: `milestone-${missionId}`,
          missionId,
          name: "Build",
          objective: input.objective,
          taskIds: [],
          dependencyIds: [],
          status,
        },
      ],
      decisionIds: [],
      acceptanceCriteria: input.acceptanceCriteria,
      locked: false,
      approvedByHuman: false,
      createdAt: now,
      updatedAt: now,
    },
  };
}

async function body(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function main(): Promise<void> {
  const taskControl = new TaskControl(new WorkforceRegistry());
  const machine = new KingsCodingMachine(undefined, undefined, taskControl);
  const missionFactory: ProjectOwnerMissionFactory = { create: buildMission };
  const controller = new ProjectOwnerMachineServerController(
    machine,
    missionFactory,
    {
      modelId: "qwen2.5-coder:1.5b",
      workspaceRoot,
      ollamaBaseUrl: process.env.KINGS_CODING_MACHINE_OLLAMA_URL ?? "http://127.0.0.1:11434",
    },
  );

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && (req.url === "/" || req.url === `/health`)) {
        if (req.url === "/health") {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: true, name: "kings.local", model: "qwen2.5-coder:1.5b" }));
          return;
        }

        const html = await readFile(publicFile, "utf8");
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (req.method === "POST" && req.url === "/api/project-owner/missions") {
        const request = (await body(req)) as Parameters<typeof controller.handle>[0];
        const result = await controller.handle(request);
        res.writeHead(result.ok ? 200 : 400, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(result));
        return;
      }

      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not Found");
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }));
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`KINGS CODING MACHINE UI: http://${hostname}:${port}`);
    console.log(`Fallback: http://127.0.0.1:${port}`);
    console.log(`Workspace: ${workspaceRoot}`);
    console.log("Model: qwen2.5-coder:1.5b");
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
