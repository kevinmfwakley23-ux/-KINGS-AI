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
      join(root, "src", "inventory-service.ts"),
      "export function searchInventory(query: string) { return query.trim().toLowerCase(); }\n",
    );
    await writeFile(
      join(root, "src", "unrelated.ts"),
      "export const unrelated = true;\n",
    );
    await writeFile(
      join(root, "node_modules", "ignored", "secret.ts"),
      "export const shouldNeverAppear = true;\n",
    );

    const authority = new RepositoryCodingContextAuthority();
    const result = await authority.build({
      workspaceRoot: root,
      missionId: "inventory-fix",
      objective: "Fix inventory search behavior",
      requirements: ["Inventory search must normalize the query"],
      maxContextCharacters: 12_000,
      maxFiles: 4,
    });

    assert(result.repositoryFileCount === 3, "Excluded dependency files entered the repository inventory.");
    assert(result.context.includes("package.json"), "Project manifest was not inspected.");
    assert(result.context.includes("src/inventory-service.ts"), "Task-relevant source was not inspected.");
    assert(result.context.includes("searchInventory"), "Real source contents did not reach coding context.");
    assert(!result.context.includes("shouldNeverAppear"), "Excluded dependency source leaked into coding context.");
    assert(
      result.inspectedFiles.indexOf("src/inventory-service.ts") >= 0,
      "Task-relevant source was not recorded as inspected.",
    );

    console.log("REPOSITORY-CODING-CONTEXT-001 bounded inventory + real source inspection: SUCCESS");
    console.log("K.I.N.G.S. REPOSITORY CODING CONTEXT: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

runTest().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
