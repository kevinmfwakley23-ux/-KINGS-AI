import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { TaskControl } from "../../core/workforce/task-control";
import { WorkforceRegistry } from "../../core/workforce/registry";
import { WorkUnitRegistry } from "../../core/workforce/work-unit-registry";
import { KingsCodingMachine } from "../../core/workforce/kings-coding-machine";
import type { ProjectOwnerExecutionContext } from "../../core/workforce/project-owner-machine-api";
import {
  ProjectOwnerMachineServerController,
  createDefaultProjectOwnerMissionFactory,
} from "./server-contract";
import { ProjectOwnerMachineApi } from "../../core/workforce/project-owner-machine-api";

const port = Number(process.env.KINGS_CODING_MACHINE_PORT ?? 8787);
const hostname = process.env.KINGS_CODING_MACHINE_HOST ?? "kings.local";
const workspaceRoot = process.env.KINGS_CODING_MACHINE_WORKSPACE ?? process.cwd();
const publicFile = join(process.cwd(), "ui/project-owner/index.html");
const runtimeBuild = "vision-task-compiler-v3";

async function body(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function main(): Promise<void> {
  const registry = new WorkforceRegistry();
  const workUnits = new WorkUnitRegistry();
  const taskControl = new TaskControl(registry);
  const machine = new KingsCodingMachine(undefined, undefined, taskControl, workUnits);
  const missionFactory = createDefaultProjectOwnerMissionFactory(
    registry,
    workUnits,
  );

  const executionContext: ProjectOwnerExecutionContext = {
    getTask(taskId) {
      return registry.getTask(taskId);
    },
    getWorkUnit(taskId) {
      return workUnits.require(taskId);
    },
  };

  const controller = new ProjectOwnerMachineServerController(
    machine,
    missionFactory,
    executionContext,
    {
      modelId: "qwen2.5-coder:1.5b",
      workspaceRoot,
      ollamaBaseUrl:
        process.env.KINGS_CODING_MACHINE_OLLAMA_URL ??
        "http://127.0.0.1:11434",
    },
  );

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
        if (req.url === "/health") {
          res.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              ok: true,
              name: "kings.local",
              model: "qwen2.5-coder:1.5b",
              workspace: workspaceRoot,
              runtimeBuild,
            }),
          );
          return;
        }

        const html = await readFile(publicFile, "utf8");
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
        });
        res.end(html);
        return;
      }

      if (
        req.method === "POST" &&
        req.url === "/api/project-owner/missions"
      ) {
        const request =
          (await body(req)) as Parameters<
            ProjectOwnerMachineApi["handle"]
          >[0];
        const result = await controller.handle(request);
        res.writeHead(result.ok ? 200 : 400, {
          "content-type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify(result));
        return;
      }

      res.writeHead(404, {
        "content-type": "text/plain; charset=utf-8",
      });
      res.end("Not Found");
    } catch (error) {
      res.writeHead(500, {
        "content-type": "application/json; charset=utf-8",
      });
      res.end(
        JSON.stringify({
          ok: false,
          message:
            error instanceof Error ? error.message : String(error),
        }),
      );
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`KINGS CODING MACHINE UI: http://${hostname}:${port}`);
    console.log(`Fallback: http://127.0.0.1:${port}`);
    console.log(`Workspace: ${workspaceRoot}`);
    console.log("Model: qwen2.5-coder:1.5b");
    console.log(`Runtime build: ${runtimeBuild}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
