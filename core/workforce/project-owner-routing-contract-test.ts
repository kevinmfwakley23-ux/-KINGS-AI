import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function main(): Promise<void> {
  const source = await readFile(
    join(process.cwd(), "core", "workforce", "project-owner-machine-api.ts"),
    "utf8",
  );

  assert.match(
    source,
    /preferExternal:\s*!explicitModel/,
    "core Project Owner API must prefer the external gateway fabric when the owner did not select a route",
  );
  assert.match(
    source,
    /allowUnverifiedUnderPostExecutionVerification:\s*!explicitModel/,
    "automatic owner routing must be allowed to use live unbenchmarked routes only behind real post-execution verification",
  );
  assert.match(
    source,
    /allowUnverifiedExplicitSelection:\s*explicitModel/,
    "explicit owner model selection must preserve the governed unverified-selection contract",
  );
  assert.doesNotMatch(
    source,
    /preferInternal:\s*!explicitModel/,
    "legacy local-first routing must not reappear in the core Project Owner API",
  );
  assert.doesNotMatch(
    source,
    /maximumEstimatedCost:\s*0/,
    "owner coding execution must not silently impose a fake $0 price ceiling when provider pricing is unknown",
  );

  console.log("K.I.N.G.S. PROJECT OWNER → CORE GATEWAY-FIRST ROUTING: SUCCESS");
  console.log("K.I.N.G.S. PROJECT OWNER → POST-EXECUTION VERIFICATION BOUNDARY: SUCCESS");
  console.log("K.I.N.G.S. PROJECT OWNER → NO FAKE $0 ROUTING CEILING: SUCCESS");
  console.log("TREE-KCM-PROJECT-OWNER-ROUTING-CONTRACT: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-PROJECT-OWNER-ROUTING-CONTRACT: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
