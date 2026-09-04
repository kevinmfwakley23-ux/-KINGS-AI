import { strict as assert } from "node:assert";
import { RepositorySymbolDependencyMap } from "./repository-symbol-map";

const authority = new RepositorySymbolDependencyMap();

const snapshot = authority.build([
  {
    path: "src/search.ts",
    content: [
      'import { normalizeInventoryQuery, inventoryKey } from "./normalize";',
      'import { formatUnrelatedReport } from "./reports";',
      "",
      "export function searchInventory(query: string, values: string[]): string[] {",
      "  const normalized = normalizeInventoryQuery(query);",
      "  return values.filter((value) => inventoryKey(value).includes(normalized));",
      "}",
      "",
      "export function oldSearchExperiment(value: string): string {",
      "  return formatUnrelatedReport(value);",
      "}",
    ].join("\n"),
  },
  {
    path: "src/normalize.ts",
    content: [
      "export function normalizeInventoryQuery(query: string): string {",
      "  return query.trim().toLowerCase();",
      "}",
      "",
      "export const inventoryKey = (value: string): string => value.trim().toLowerCase();",
      "",
      "export function unrelatedNormalizer(value: string): string {",
      "  return `UNRELATED:${value}`;",
      "}",
    ].join("\n"),
  },
  {
    path: "src/reports.ts",
    content: [
      "export function formatUnrelatedReport(value: string): string {",
      "  return `REPORT:${value}`;",
      "}",
    ].join("\n"),
  },
  {
    path: "README.md",
    content: "This is intentionally unsupported by the AST map.",
  },
]);

assert.equal(snapshot.files.length, 3, "only TypeScript/JavaScript files should enter the AST symbol graph");
assert(snapshot.symbols.some((symbol) => symbol.name === "searchInventory"), "exported function was not indexed");
assert(snapshot.symbols.some((symbol) => symbol.name === "normalizeInventoryQuery"), "dependency function was not indexed");
assert(
  snapshot.imports.some(
    (edge) => edge.fromPath === "src/search.ts" && edge.resolvedPath === "src/normalize.ts",
  ),
  "relative TypeScript import did not resolve to a repository dependency edge",
);

const selected = authority.select(snapshot, {
  objective: "Fix inventory search query normalization",
  requirements: ["Inventory search must normalize query casing and whitespace"],
  maxSymbols: 4,
  maxContextCharacters: 8_000,
  dependencyDepth: 1,
});

assert(
  selected.selectedSymbols.some((symbol) => symbol.name === "searchInventory"),
  "task-relevant entry-point symbol was not selected",
);
assert(
  selected.selectedSymbols.some((symbol) => symbol.name === "normalizeInventoryQuery"),
  "direct imported dependency symbol was not pulled into bounded context",
);
assert(
  selected.dependencyFiles.includes("src/normalize.ts"),
  "resolved dependency file was not retained as graph evidence",
);
assert(selected.context.includes("K.I.N.G.S. SYMBOL + DEPENDENCY CONTEXT"));
assert(selected.context.includes("SYMBOL: src/search.ts"));
assert(selected.context.includes("normalizeInventoryQuery"));
assert(
  !selected.context.includes("function formatUnrelatedReport"),
  "unrelated dependency source should not displace task-relevant symbols",
);
assert(
  selected.context.length < snapshot.symbols.map((symbol) => symbol.text.length).reduce((a, b) => a + b, 0) + 2_000,
  "symbol context unexpectedly expanded beyond a bounded declaration-oriented representation",
);

console.log("REPOSITORY-SYMBOL-MAP-001 TypeScript/JavaScript AST symbol indexing: SUCCESS");
console.log("REPOSITORY-SYMBOL-MAP-002 relative import dependency resolution: SUCCESS");
console.log("REPOSITORY-SYMBOL-MAP-003 task-relevant bounded symbol context: SUCCESS");
console.log("K.I.N.G.S. REPOSITORY SYMBOL DEPENDENCY MAP: SUCCESS");
