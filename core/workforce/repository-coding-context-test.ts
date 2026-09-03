import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepositoryCodingContextAuthority } from "./repository-coding-context";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function runTest(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kings-repository-context-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "node_modules", "ignored"), { recursive: true });
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ scripts: { build: "tsc", test: "node --test" } }, null, 2),
    );
    await writeFile(
      join(root, "src", "inventory-decoy.ts"),
      "export const inventoryLabel = 'inventory';\n",
    );
    await writeFile(
      join(root, "src", "core.ts"),
      "export function normalizeInventoryQuery(query: string) { return query.trim().toLowerCase(); }\n",
    );
    await writeFile(
      join(root, "src", "unrelated.ts"),
      "export const unrelated = true;\n",
    );
    await writeFile(
      join(root, "node_modules", "ignored", "secret.ts"),
      "export const shouldNeverAppear = true;\n",
    );
    await writeFile(
      join(root, ".env.production"),
      "DATABASE_PASSWORD=never-send-this\n",
    );
    await writeFile(
      join(root, "deploy-secrets.yaml"),
      "github_token: never-send-this-either\n",
    );
    await writeFile(
      join(root, "service-account-prod.json"),
      JSON.stringify({ private_key: "never-send-service-account" }),
    );

    const authority = new RepositoryCodingContextAuthority();
    const result = await authority.build({
      workspaceRoot: root,
      missionId: "inventory-fix",
      objective: "Fix inventory search behavior",
      requirements: ["Inventory search must normalize the query"],
      maxContextCharacters: 12_000,
      maxFiles: 2,
      maxSearchFiles: 10,
      maxSearchBytes: 1_000_000,
    });

    assert(result.repositoryFileCount === 4, "Excluded dependency or sensitive files entered the safe repository inventory.");
    assert(result.excludedSensitiveFiles === 3, "Sensitive repository files were not counted as excluded.");
    assert(result.contentRankedFiles === 4, "Safe source files were not content-ranked for task relevance.");
    assert(result.context.includes("package.json"), "Project manifest was not inspected.");
    assert(result.context.includes("src/core.ts"), "Content-relevant implementation source was not inspected.");
    assert(result.context.includes("normalizeInventoryQuery"), "Real implementation contents did not reach coding context.");
    assert(
      result.inspectedFiles.includes("src/core.ts"),
      "Content relevance did not promote a generically named implementation file into the bounded context.",
    );
    assert(
      !result.inspectedFiles.includes("src/inventory-decoy.ts"),
      "Filename-only relevance displaced the actual implementation source.",
    );
    assert(!result.context.includes("shouldNeverAppear"), "Excluded dependency source leaked into coding context.");
    assert(!result.context.includes(".env.production"), "Environment-secret filename leaked into model context.");
    assert(!result.context.includes("deploy-secrets.yaml"), "Secrets filename leaked into model context.");
    assert(!result.context.includes("service-account-prod.json"), "Service-account filename leaked into model context.");
    assert(!result.context.includes("never-send"), "Sensitive repository contents leaked into model context.");
    assert(
      result.context.includes("Sensitive files excluded from model context: 3"),
      "Model context did not truthfully report sensitive-file exclusion.",
    );

    console.log("REPOSITORY-CODING-CONTEXT-001 bounded inventory + real source inspection: SUCCESS");
    console.log("REPOSITORY-CODING-CONTEXT-002 secrets excluded from external model context: SUCCESS");
    console.log("REPOSITORY-CODING-CONTEXT-003 source-content relevance beats filename guesses: SUCCESS");
    console.log("K.I.N.G.S. REPOSITORY CODING CONTEXT: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

runTest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
