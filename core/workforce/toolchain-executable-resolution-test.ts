import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveToolchainExecutable } from "./toolchain-executable-resolution";

const execFileAsync = promisify(execFile);

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function main(): Promise<void> {
  const resolved = await resolveToolchainExecutable({
    executable: "node",
  });

  assert(resolved.verified, "node should resolve");
  assert(
    resolved.resolved.endsWith("/bin/node"),
    "node should resolve to an executable path",
  );

  const version = await execFileAsync(resolved.resolved, ["--version"]);
  assert(
    /^v\d+\.\d+\.\d+/.test(version.stdout.trim()),
    "resolved node executable should report a semantic version",
  );

  console.log("K.I.N.G.S. TOOLCHAIN EXECUTABLE RESOLUTION: SUCCESS");
  console.log(`RESOLVED NODE: ${resolved.resolved}`);
  console.log(`NODE VERSION: ${version.stdout.trim()}`);
}

main().catch((error) => {
  console.error("K.I.N.G.S. TOOLCHAIN EXECUTABLE RESOLUTION: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
