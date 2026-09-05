import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AppAiRouteRequest, AppAiRouteResult } from "./app-ai-router";
import { OwnerMissionRuntime } from "./owner-mission-runtime";
import { OwnerMissionExecutionRuntime } from "./owner-mission-execution-runtime";
import { OwnerProductBuildWorker, type OwnerProductBuildRouter } from "./owner-product-build-worker";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

class DeterministicRouter implements OwnerProductBuildRouter {
  readonly calls: AppAiRouteRequest[] = [];

  constructor(private readonly breakBackend = false) {}

  async route(request: AppAiRouteRequest): Promise<AppAiRouteResult> {
    this.calls.push(request);
    const system = request.messages.find((message) => message.role === "system")?.content ?? "";
    const coding = system.includes("governed repository coding worker");
    let content = "Architecture/research evidence produced through the K.I.N.G.S. router boundary.";

    if (coding) {
      const taskId = system.match(/taskId MUST equal ([^\n]+)/)?.[1]?.trim();
      const missionId = system.match(/missionId MUST equal ([^\n]+)/)?.[1]?.trim();
      if (!taskId || !missionId) throw new Error("Deterministic router could not recover task identity from coding prompt.");
      const suffix = taskId.split("-").at(-1);
      const file = suffix === "backend"
        ? "src/backend.js"
        : suffix === "frontend"
          ? "src/frontend.js"
          : "src/integration.js";
      const source = this.breakBackend && suffix === "backend"
        ? "module.exports = ;\n"
        : suffix === "backend"
          ? "export function backendReady(){ return true; }\n"
          : suffix === "frontend"
            ? "export function frontendReady(){ return true; }\n"
            : "export function integrated(){ return 'ready'; }\n";
      content = JSON.stringify({
        id: `proposal-${suffix}`,
        taskId,
        missionId,
        summary: `Implemented ${suffix} slice through governed owner execution.`,
        changes: [{ path: file, operation: "create", content: source }],
      });
    }

    return {
      success: true,
      requestId: `router-request-${this.calls.length}`,
      appId: request.appId,
      providerId: "omniroute",
      modelId: "ci-deterministic-coder",
      content,
      toolCallProposals: [],
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCost: 0,
        elapsedMs: 1,
      },
      attempts: [
        { providerId: "omniroute", modelId: "ci-deterministic-coder", success: true },
      ],
    };
  }
}

async function createFixture(root: string): Promise<void> {
  await mkdir(join(root, "scripts"), { recursive: true });
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({
      name: "kings-owner-execution-fixture",
      version: "1.0.0",
      private: true,
      scripts: {
        build: "node scripts/build.cjs",
        test: "node scripts/test.cjs",
      },
    }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "package-lock.json"),
    `${JSON.stringify({ name: "kings-owner-execution-fixture", version: "1.0.0", lockfileVersion: 3, packages: {} }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "src", "app.js"),
    "export const fixture = true;\n",
    "utf8",
  );
  await writeFile(
    join(root, "scripts", "build.cjs"),
    [
      "const fs=require('node:fs');",
      "const path=require('node:path');",
      "const root=path.join(__dirname,'..','src');",
      "for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.js'))){",
      "  const source=fs.readFileSync(path.join(root,name),'utf8').replace(/^export\\s+/gm,'');",
      "  try{ new Function(source); }catch(error){ console.error(name+': '+error.message); process.exit(7); }",
      "}",
      "console.log('fixture build passed');",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(root, "scripts", "test.cjs"),
    [
      "const fs=require('node:fs');",
      "const path=require('node:path');",
      "const root=path.join(__dirname,'..','src');",
      "for(const name of ['backend.js','frontend.js','integration.js']){",
      "  if(!fs.existsSync(path.join(root,name))){ console.error('missing '+name); process.exit(9); }",
      "}",
      "console.log('fixture tests passed');",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function successfulMission(root: string): Promise<void> {
  const storePath = join(root, ".state", "missions.json");
  const runtime = new OwnerMissionRuntime(storePath);
  await runtime.initialize();
  const mission = await runtime.createMission({
    productName: "Real Owner Execution Fixture",
    ownerVision: "Build the backend, frontend and integration slices, then run real repository build and tests before release.",
  });
  const router = new DeterministicRouter();
  const worker = new OwnerProductBuildWorker(runtime, router, root);
  const executor = new OwnerMissionExecutionRuntime(runtime, worker);
  const result = await executor.run(mission.mission.id, 16);

  assert(result.stoppedBecause === "completed", "Full owner mission must reach completed state.");
  assert(result.snapshot.mission.status === "completed", "Mission status must become completed only after every task passes.");
  assert(result.snapshot.tasks.length === 8, "Canonical eight-stage product graph must execute rather than being replaced.");
  assert(result.snapshot.tasks.every((task) => task.status === "completed"), "Every product-build task must be completed.");
  assert(result.snapshot.results.length === 8, "Every completed task must retain an attributable durable workforce result.");
  assert(router.calls.some((call) => call.requiredCapabilities?.includes("structured-output")), "Coding must attempt the primary structured provider route.");

  for (const file of ["backend.js", "frontend.js", "integration.js"]) {
    const content = await readFile(join(root, "src", file), "utf8");
    assert(content.trim().length > 0, `Real governed coding write must create ${file}.`);
  }
  assert(
    result.snapshot.results.some((entry) => entry.verificationReferences.some((reference) => reference.startsWith("repository-test:0:passed"))),
    "Mission completion must retain real repository test evidence.",
  );

  const restarted = new OwnerMissionRuntime(storePath);
  await restarted.initialize();
  const restored = restarted.snapshot(mission.mission.id);
  assert(restored.mission.status === "completed", "Completed mission state must survive process restart.");
  assert(restored.tasks.every((task) => task.status === "completed"), "Completed task transitions must survive process restart.");
  assert(restored.results.length === 8, "Workforce result evidence must survive process restart.");

  console.log("08.OWNER-EXECUTION provider -> governed writes -> real build/test: SUCCESS");
  console.log("08.OWNER-EXECUTION durable task/result transitions: SUCCESS");
  console.log("08.OWNER-EXECUTION restart completion evidence: SUCCESS");
}

async function rollbackMission(root: string): Promise<void> {
  const storePath = join(root, ".state-failure", "missions.json");
  const runtime = new OwnerMissionRuntime(storePath);
  await runtime.initialize();
  const mission = await runtime.createMission({
    productName: "Rollback Fixture",
    ownerVision: "Attempt a backend change and preserve the repository if validation rejects it.",
  });
  const router = new DeterministicRouter(true);
  const worker = new OwnerProductBuildWorker(runtime, router, root);
  const executor = new OwnerMissionExecutionRuntime(runtime, worker);
  const result = await executor.run(mission.mission.id, 8);

  assert(result.stoppedBecause === "failed", "A repository validation failure must fail the active owner task.");
  assert(result.snapshot.mission.status === "failed", "Failed owner task must durably fail the mission until explicit retry.");
  assert(result.snapshot.execution.failedTaskIds.length === 1, "Exactly the rejected task must be marked failed.");
  let backendExists = true;
  try {
    await readFile(join(root, "src", "backend.js"), "utf8");
  } catch (error) {
    backendExists = !(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
  }
  assert(!backendExists, "New file from a validation-failing coding proposal must be rolled back.");
  assert(
    result.snapshot.results.at(-1)?.verificationReferences.includes("governed-write-rollback") === true,
    "Rollback evidence must be retained with the failed task result.",
  );

  console.log("08.OWNER-EXECUTION failed validation rollback: SUCCESS");
}

async function main(): Promise<void> {
  const successRoot = await mkdtemp(join(tmpdir(), "kings-owner-execution-success-"));
  const failureRoot = await mkdtemp(join(tmpdir(), "kings-owner-execution-failure-"));
  try {
    await createFixture(successRoot);
    await successfulMission(successRoot);
    await createFixture(failureRoot);
    await rollbackMission(failureRoot);
    console.log("TREE-08 REAL OWNER MISSION EXECUTION: SUCCESS");
  } finally {
    await rm(successRoot, { recursive: true, force: true });
    await rm(failureRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
