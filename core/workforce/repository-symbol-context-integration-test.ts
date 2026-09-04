import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepositoryCodingContextAuthority } from "./repository-coding-context";

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kings-symbol-context-integration-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "node test.js" } }), "utf8");
    const filler = Array.from(
      { length: 120 },
      (_, index) => `export function unrelatedFeature${index}() { return "UNRELATED-FILLER-${index}"; }`,
    ).join("\n");
    await writeFile(
      join(root, "src", "search.ts"),
      [
        'import { normalizeInventoryQuery } from "./normalize";',
        "export function searchInventory(query: string, values: string[]) {",
        "  const normalized = normalizeInventoryQuery(query);",
        "  return values.filter((value) => value.toLowerCase().includes(normalized));",
        "}",
        filler,
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      join(root, "src", "normalize.ts"),
      "export function normalizeInventoryQuery(query: string) { return query.trim().toLowerCase(); }\n",
      "utf8",
    );

    const authority = new RepositoryCodingContextAuthority();
    const result = await authority.build({
      workspaceRoot: root,
      missionId: "symbol-integration",
      objective: "Fix inventory search query normalization",
      requirements: ["searchInventory must use normalizeInventoryQuery"],
      maxContextCharacters: 12_000,
      maxFiles: 5,
      maxSearchFiles: 20,
      maxSearchBytes: 2_000_000,
    });

    assert((result.symbolIndexedFiles ?? 0) >= 2, "TypeScript files were not AST indexed");
    assert((result.selectedSymbols ?? 0) >= 2, "task-relevant symbols were not selected");
    assert(result.context.includes("K.I.N.G.S. SYMBOL + DEPENDENCY CONTEXT"));
    assert(result.context.includes("searchInventory"));
    assert(result.context.includes("normalizeInventoryQuery"));
    assert(result.context.includes("DIRECT DEPENDENCY FILES:"));
    assert(result.context.includes("src/normalize.ts"));
    assert(
      !result.context.includes("UNRELATED-FILLER-119"),
      "whole TypeScript source leaked into model context instead of bounded symbol declarations",
    );
    assert(result.inspectedFiles.includes("src/search.ts"));
    assert(result.inspectedFiles.includes("src/normalize.ts"));

    console.log("REPOSITORY-SYMBOL-CONTEXT-001 AST map integrated into production repository context: SUCCESS");
    console.log("REPOSITORY-SYMBOL-CONTEXT-002 direct dependency symbols included: SUCCESS");
    console.log("REPOSITORY-SYMBOL-CONTEXT-003 unrelated whole-file filler omitted: SUCCESS");
    console.log("K.I.N.G.S. SYMBOL-AWARE REPOSITORY CONTEXT: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
