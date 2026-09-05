import {
  createDefaultEngineeringToolchains,
} from "./engineering-toolchain";

import {
  createJavaScriptPackageManagerToolchain,
  packageManagerBinaryProbeArgs,
  packageManagerCommandCapability,
  resolveJavaScriptPackageManager,
} from "./javascript-package-manager-toolchain";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function main(): void {
  const base = createDefaultEngineeringToolchains().find(
    (toolchain) => toolchain.language === "typescript",
  );
  if (!base) throw new Error("TypeScript toolchain fixture missing.");

  const npm = createJavaScriptPackageManagerToolchain(base, "npm");
  const pnpm = createJavaScriptPackageManagerToolchain(base, "pnpm");
  const yarn = createJavaScriptPackageManagerToolchain(base, "yarn");
  const bun = createJavaScriptPackageManagerToolchain(base, "bun");

  assert(
    commandText(npm, "typecheck") === "npx tsc" &&
      commandText(npm, "build") === "npm run build" &&
      commandText(npm, "package") === "npm pack",
    "npm toolchain mapping is incorrect.",
  );
  assert(
    commandText(pnpm, "typecheck") === "pnpm exec tsc" &&
      commandText(pnpm, "build") === "pnpm run build" &&
      commandText(pnpm, "package") === "pnpm pack",
    "pnpm toolchain mapping is incorrect.",
  );
  assert(
    commandText(yarn, "typecheck") === "yarn run tsc" &&
      commandText(yarn, "test") === "yarn run test" &&
      commandText(yarn, "package") === "yarn pack",
    "Yarn toolchain mapping is incorrect.",
  );
  assert(
    commandText(bun, "typecheck") === "bun x --no-install tsc" &&
      commandText(bun, "test") === "bun run test" &&
      commandText(bun, "package") === "bun pm pack" &&
      commandText(bun, "run") === "bun",
    "Bun toolchain mapping is incorrect.",
  );

  const pnpmTypecheck = pnpm.commands.find(
    (command) => command.operation === "typecheck",
  );
  if (!pnpmTypecheck) throw new Error("pnpm typecheck fixture missing.");
  assert(
    packageManagerCommandCapability(pnpmTypecheck) === "pnpm-package:tsc",
    "pnpm local binary capability must be explicit.",
  );
  assert(
    packageManagerBinaryProbeArgs(pnpmTypecheck)?.join(" ") ===
      "exec tsc --version",
    "pnpm binary probe must be non-installing and local-project aware.",
  );

  const bunTypecheck = bun.commands.find(
    (command) => command.operation === "typecheck",
  );
  if (!bunTypecheck) throw new Error("Bun typecheck fixture missing.");
  assert(
    packageManagerBinaryProbeArgs(bunTypecheck)?.join(" ") ===
      "x --no-install tsc --version",
    "Bun binary probe must explicitly prohibit auto-installation.",
  );

  assert(
    resolveJavaScriptPackageManager({
      packageManagers: ["pnpm"],
      declaredPackageManager: "pnpm@10.17.1",
    }).manager === "pnpm",
    "Matching packageManager declaration and lockfile evidence must resolve pnpm.",
  );
  assert(
    /conflict/i.test(
      resolveJavaScriptPackageManager({
        packageManagers: ["npm"],
        declaredPackageManager: "yarn@4.9.2",
      }).blockedReason ?? "",
    ),
    "A packageManager/lockfile conflict must fail closed.",
  );
  assert(
    /Multiple JavaScript package managers/i.test(
      resolveJavaScriptPackageManager({
        packageManagers: ["npm", "pnpm"],
      }).blockedReason ?? "",
    ),
    "Multiple lockfile managers without a declaration must fail closed.",
  );

  console.log("TREE-08 JAVASCRIPT PACKAGE-MANAGER TOOLCHAINS: SUCCESS");
}

function commandText(
  toolchain: ReturnType<typeof createJavaScriptPackageManagerToolchain>,
  operation: string,
): string | undefined {
  const command = toolchain.commands.find(
    (candidate) => candidate.operation === operation,
  );
  return command
    ? [command.command, ...command.args].join(" ")
    : undefined;
}

main();
