import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  runOwnerEngineeringControl,
} from "./owner-engineering-control";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kings-owner-engineering-control-"));
  try {
    await writeFile(
      join(root, "build.cjs"),
      "require('node:fs').writeFileSync('owner-build-proof.txt','built\\n'); console.log('OWNER_BUILD_OK');\n",
      "utf8",
    );
    await writeFile(
      join(root, "test.cjs"),
      "const fs=require('node:fs'); if(!fs.existsSync('owner-build-proof.txt')) process.exit(9); fs.writeFileSync('owner-test-proof.txt','tested\\n'); console.log('OWNER_TEST_OK');\n",
      "utf8",
    );
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "kings-owner-control-fixture",
        version: "1.0.0",
        private: true,
        packageManager: "npm@10.0.0",
        scripts: {
          build: "node build.cjs",
          test: "node test.cjs",
        },
      }),
      "utf8",
    );
    await writeFile(
      join(root, "package-lock.json"),
      JSON.stringify({
        name: "kings-owner-control-fixture",
        version: "1.0.0",
        lockfileVersion: 3,
        requires: true,
        packages: {
          "": {
            name: "kings-owner-control-fixture",
            version: "1.0.0",
          },
        },
      }),
      "utf8",
    );

    const readiness = await runOwnerEngineeringControl({
      action: "readiness",
      workspacePath: root,
      projectId: "owner-control-fixture",
    });
    assert(readiness.action === "readiness", "Readiness control must preserve the fixed action identity.");
    assert(readiness.ok, "Real fixture repository must become engineering-ready.");
    assert(readiness.readiness.status === "ready", "Readiness must not execute the build/test plan.");
    assert(readiness.readiness.requiredOperations.includes("build"), "Fixed readiness must require build.");
    assert(readiness.readiness.requiredOperations.includes("test"), "Fixed readiness must require test.");
    assert(readiness.readiness.plannedSteps.length === 2, "Fixture must derive exactly build and test validation steps.");
    console.log("OWNER-CONTROL real repository readiness: SUCCESS");

    const verify = await runOwnerEngineeringControl({
      action: "verify",
      workspacePath: root,
      projectId: "owner-control-fixture",
      timeoutMs: 30_000,
    });
    assert(verify.action === "verify", "Verify control must preserve the fixed action identity.");
    assert(verify.ok && verify.verify?.verified === true, "Governed owner verify must complete only after real green validation.");
    assert(verify.verify?.evidence.length === 2, "Verify result must include bounded evidence for build and test.");
    assert(verify.verify?.evidence.every((entry) => entry.succeeded), "Every fixed validation step must succeed.");
    assert((await readFile(join(root, "owner-build-proof.txt"), "utf8")).trim() === "built", "Build command must execute in the configured workspace.");
    assert((await readFile(join(root, "owner-test-proof.txt"), "utf8")).trim() === "tested", "Test command must execute after build.");
    console.log("OWNER-CONTROL fixed repository verify: SUCCESS");

    let rejected = false;
    try {
      await runOwnerEngineeringControl({
        action: "shell" as never,
        workspacePath: root,
      });
    } catch (error) {
      rejected = /unsupported fixed action/i.test(error instanceof Error ? error.message : String(error));
    }
    assert(rejected, "Owner engineering control must reject arbitrary action names.");
    console.log("OWNER-CONTROL arbitrary action rejected: SUCCESS");

    console.log("TREE-09 OWNER ENGINEERING FIXED CONTROL: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
