import { strict as assert } from "node:assert";
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkforceRegistry } from "./registry";
import { WorkUnitRegistry } from "./work-unit-registry";
import { ToolGateway } from "./tool-gateway";
import {
  REPOSITORY_INSPECTION_TOOL_DEFINITION,
  REPOSITORY_INSPECTION_TOOL_ID,
  RepositoryInspectionToolAdapter,
} from "./repository-inspection-tool";

const MISSION_ID = "mission-repository-inspection-tool";
const TASK_ID = "task-repository-inspection-tool";
const AGENT_ID = "agent-repository-inspection-tool";

function registerRuntime(
  root: string,
): ToolGateway {
  const registry = new WorkforceRegistry();
  const workUnits = new WorkUnitRegistry();
  const now = new Date(0).toISOString();

  registry.registerMission({
    id: MISSION_ID,
    name: "Repository Inspection Tool Test",
    description: "Verify read-only repository inspection governance.",
    status: "active",
    objectives: ["Inspect repository data without leaking credentials."],
    sourceReferences: [],
    createdAt: now,
    updatedAt: now,
  });
  registry.registerTool(REPOSITORY_INSPECTION_TOOL_DEFINITION);
  registry.registerAgent({
    id: AGENT_ID,
    name: "Repository Inspection Agent",
    role: "coding-engineer",
    description: "Read-only repository inspection test agent.",
    capabilities: ["coding", "source-inspection"],
    toolIds: [REPOSITORY_INSPECTION_TOOL_ID],
    status: "available",
  });
  registry.registerTask({
    id: TASK_ID,
    missionId: MISSION_ID,
    name: "Inspect repository",
    description: "Inspect only the approved repository workspace.",
    assignedAgentId: AGENT_ID,
    requiredCapabilities: ["source-inspection"],
    requiredToolIds: [REPOSITORY_INSPECTION_TOOL_ID],
    status: "ready",
    dependencyIds: [],
    inputReferences: [],
    expectedOutputs: ["Bounded repository evidence"],
    createdAt: now,
    updatedAt: now,
  });
  workUnits.register(TASK_ID, {
    id: "work-unit-repository-inspection-tool",
    role: "coding-engineer",
    objective: "Read only approved repository source.",
    capabilityIds: ["source-inspection"],
    allowedToolIds: [REPOSITORY_INSPECTION_TOOL_ID],
    allowedPaths: ["."],
    budget: {
      maxTimeMs: 30_000,
      maxTokens: 2_000,
      maxIterations: 3,
    },
    dependencyIds: [],
    acceptanceCriteria: ["Repository inspection remains read-only and bounded."],
    requiredEvidenceTypes: ["tool-execution-result"],
    approved: true,
    createdAt: now,
    updatedAt: now,
  });

  const gateway = new ToolGateway(registry, workUnits);
  gateway.registerAdapter(
    new RepositoryInspectionToolAdapter(
      registry,
      () => root,
      {
        maxFiles: 100,
        maxFileBytes: 8_192,
        maxSearchFiles: 20,
        maxSearchMatches: 10,
        maxReadLines: 50,
      },
    ),
  );
  return gateway;
}

function execute(
  gateway: ToolGateway,
  suffix: string,
  argumentsValue: Record<string, unknown>,
) {
  return gateway.execute({
    requestId: `repository-inspection-${suffix}`,
    taskId: TASK_ID,
    agentId: AGENT_ID,
    toolId: REPOSITORY_INSPECTION_TOOL_ID,
    arguments: argumentsValue,
  });
}

async function main(): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), "kings-repo-tool-"));
  const root = join(parent, "repo");
  const outside = join(parent, "outside-secret.txt");

  try {
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "packages", "app"), { recursive: true });
    await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
    await writeFile(
      join(root, "src", "router.ts"),
      [
        "export const alpha = 1;",
        "export const routingSignal = 'adaptive';",
        "export const omega = 3;",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, "packages", "app", ".env.staging"),
      "KINGS_TEST_SECRET=SHOULD_NEVER_REACH_MODEL\n",
      "utf8",
    );
    await writeFile(
      join(root, ".npmrc"),
      "//registry.npmjs.org/:_authToken=SHOULD_NEVER_REACH_MODEL\n",
      "utf8",
    );
    await writeFile(
      join(root, "node_modules", "pkg", "index.js"),
      "const dependencyNoise = true;\n",
      "utf8",
    );
    await writeFile(outside, "OUTSIDE_SECRET\n", "utf8");
    await symlink(outside, join(root, "src", "outside-link.txt"));

    const gateway = registerRuntime(root);

    const listed = await execute(gateway, "list", { operation: "list" });
    assert.equal(listed.success, true);
    assert.equal(listed.outputTrust, "untrusted-external");
    const listText = JSON.stringify(listed.output);
    assert.match(listText, /src\/router\.ts/);
    assert.doesNotMatch(listText, /\.env/);
    assert.doesNotMatch(listText, /\.npmrc/);
    assert.doesNotMatch(listText, /node_modules/);
    assert.doesNotMatch(listText, /outside-link/);

    const read = await execute(gateway, "read", {
      operation: "read",
      path: "src/router.ts",
      startLine: 2,
      maxLines: 1,
    });
    assert.equal(read.success, true);
    const readOutput = read.output as {
      content: string;
      startLine: number;
      endLine: number;
    };
    assert.equal(readOutput.startLine, 2);
    assert.equal(readOutput.endLine, 2);
    assert.match(readOutput.content, /2: export const routingSignal/);

    const searched = await execute(gateway, "search", {
      operation: "search",
      query: "routingsignal",
      maxMatches: 5,
    });
    assert.equal(searched.success, true);
    const searchText = JSON.stringify(searched.output);
    assert.match(searchText, /src\/router\.ts/);
    assert.match(searchText, /routingSignal/);
    assert.doesNotMatch(searchText, /SHOULD_NEVER_REACH_MODEL/);

    const nestedEnv = await execute(gateway, "nested-env", {
      operation: "read",
      path: "packages/app/.env.staging",
    });
    assert.equal(nestedEnv.success, false);
    assert.match(nestedEnv.errorMessage ?? "", /sensitive credential path/i);

    const rootNpmrc = await execute(gateway, "npmrc", {
      operation: "read",
      path: ".npmrc",
    });
    assert.equal(rootNpmrc.success, false);
    assert.match(rootNpmrc.errorMessage ?? "", /sensitive credential path/i);

    const escape = await execute(gateway, "escape", {
      operation: "read",
      path: "../outside-secret.txt",
    });
    assert.equal(escape.success, false);
    assert.match(escape.errorMessage ?? "", /escapes the approved project root/i);

    const link = await execute(gateway, "symlink", {
      operation: "read",
      path: "src/outside-link.txt",
    });
    assert.equal(link.success, false);
    assert.match(link.errorMessage ?? "", /symbolic link/i);

    console.log("K.I.N.G.S. REPOSITORY TOOL → READ-ONLY LIST/READ/SEARCH: SUCCESS");
    console.log("K.I.N.G.S. REPOSITORY TOOL → NESTED CREDENTIAL BLOCKING: SUCCESS");
    console.log("K.I.N.G.S. REPOSITORY TOOL → PATH/SYMLINK CONTAINMENT: SUCCESS");
    console.log("K.I.N.G.S. REPOSITORY TOOL → UNTRUSTED MODEL TAINT: SUCCESS");
    console.log("TREE-KCM-REPOSITORY-INSPECTION-TOOL: SUCCESS");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("TREE-KCM-REPOSITORY-INSPECTION-TOOL: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
