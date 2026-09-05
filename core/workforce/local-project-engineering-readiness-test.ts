import {
  mkdtemp,
  mkdir,
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
  LocalProjectEngineeringReadinessAuthority,
  selectExecutionLanguages,
} from "./local-project-engineering-readiness";

import type {
  ToolchainProbeProcessResult,
  ToolchainProbeProcessRunner,
} from "./local-toolchain-probe";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  await verifiesRealNodeProjectWithoutCallerSuppliedLanguage();
  await verifiesNativePnpmReadiness();
  await rejectsAmbiguousPackageManagers();
  verifiesIndependentLanguageDriverSelection();
  console.log("TREE-08 LOCAL PROJECT ENGINEERING READINESS: SUCCESS");
}

async function verifiesRealNodeProjectWithoutCallerSuppliedLanguage(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kings-readiness-node-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "index.ts"), "export const ready = true;\n");
    await writeFile(join(root, "src", "site.css"), "body { display: block; }\n");
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
    await writeFile(join(root, "package-lock.json"), "{}\n");
    await writeFile(join(root, "tsconfig.json"), "{}\n");

    const result = await new LocalProjectEngineeringReadinessAuthority().inspect({
      id: "detected-node-project",
      projectPath: root,
      requiredOperations: ["run"],
    });

    assert(
      result.environment.primaryLanguage === "typescript",
      "Readiness must derive the project language from real source files rather than caller input.",
    );
    assert(
      result.environment.buildSystems.includes("node") &&
        result.environment.buildSystems.includes("typescript"),
      "Readiness evidence must retain Node and TypeScript project manifests.",
    );
    assert(
      result.executionLanguages.length === 1 &&
        result.executionLanguages[0].language === "typescript",
      "Incidental CSS must not become an independent runtime toolchain requirement.",
    );
    assert(
      result.profile.debugReady,
      "A real Node runtime must make the detected TypeScript project runtime-ready.",
    );
    assert(
      result.execution.status === "ready" &&
        result.execution.steps.length === 1 &&
        result.execution.steps[0].language === "typescript" &&
        result.execution.steps[0].operation === "run",
      "Repository readiness must flow into a governed autonomous engineering execution plan.",
    );
    console.log("08.PROJECT caller-free language detection to execution plan: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifiesNativePnpmReadiness(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kings-readiness-pnpm-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "index.ts"), "export const packageManager = 'pnpm';\n");
    await writeFile(join(root, "package.json"), JSON.stringify({
      packageManager: "pnpm@10.17.1",
      scripts: {
        build: "tsc -p tsconfig.json",
        test: "node --test",
      },
    }));
    await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    await writeFile(join(root, "tsconfig.json"), "{}\n");

    const result = await new LocalProjectEngineeringReadinessAuthority(
      undefined,
      undefined,
      new FakePnpmRunner(),
    ).inspect({
      id: "pnpm-project",
      projectPath: root,
      requiredOperations: ["typecheck", "build", "test", "package"],
    });

    assert(
      result.environment.packageManagers.includes("pnpm") &&
        result.environment.declaredPackageManager === "pnpm@10.17.1",
      "pnpm lock and authoritative packageManager evidence must both be retained.",
    );
    assert(
      result.execution.status === "ready" &&
        result.blockedReasons.length === 0,
      "A verified pnpm project must become ready rather than remain blocked behind npm-only tooling.",
    );
    assert(
      result.verifications[0]?.toolchain.id.endsWith("-pnpm") === true,
      "Repository readiness must verify the resolved pnpm-specific toolchain.",
    );
    const commands = result.verifications[0]?.toolchain.commands ?? [];
    assert(
      commands.some((command) => command.operation === "typecheck" && command.command === "pnpm" && command.args.join(" ") === "exec tsc"),
      "TypeScript typecheck must use pnpm exec rather than npx.",
    );
    assert(
      commands.some((command) => command.operation === "build" && command.command === "pnpm" && command.args.join(" ") === "run build"),
      "Build must use the repository's pnpm script boundary.",
    );
    console.log("08.PROJECT native pnpm readiness and capability proof: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function rejectsAmbiguousPackageManagers(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kings-readiness-ambiguous-js-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "index.ts"), "export const ambiguous = true;\n");
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { build: "tsc" } }));
    await writeFile(join(root, "package-lock.json"), "{}\n");
    await writeFile(join(root, "yarn.lock"), "# yarn lockfile\n");
    await writeFile(join(root, "tsconfig.json"), "{}\n");

    const result = await new LocalProjectEngineeringReadinessAuthority().inspect({
      id: "ambiguous-js-project",
      projectPath: root,
      requiredOperations: ["build"],
    });

    assert(
      result.execution.status === "blocked",
      "Conflicting package-manager evidence without an authoritative declaration must fail closed.",
    );
    assert(
      result.blockedReasons.some((reason) => /Multiple JavaScript package managers were detected/i.test(reason)),
      "Package-manager ambiguity must be explicit in the engineering evidence.",
    );
    console.log("08.PROJECT ambiguous package-manager protection: SUCCESS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function verifiesIndependentLanguageDriverSelection(): void {
  const selected = selectExecutionLanguages({
    projectPath: "/fixture",
    scannedFileCount: 20,
    primaryLanguage: "typescript",
    packageManagers: ["npm", "pip"],
    buildSystems: ["node", "typescript", "python"],
    manifestFiles: [
      "package.json",
      "package-lock.json",
      "tsconfig.json",
      "services/worker/pyproject.toml",
    ],
    languages: [
      { language: "typescript", fileCount: 10, extensions: [".ts"] },
      { language: "css", fileCount: 6, extensions: [".css"] },
      { language: "python", fileCount: 4, extensions: [".py"] },
    ],
  });

  assert(
    selected.map((entry) => entry.language).join(",") === "typescript,python",
    "A secondary language with its own project manifest must remain an execution driver while support-only CSS does not.",
  );
  console.log("08.PROJECT independent polyglot driver selection: SUCCESS");
}

class FakePnpmRunner implements ToolchainProbeProcessRunner {
  run(
    executable: string,
    args: string[],
  ): ToolchainProbeProcessResult {
    if (executable !== "pnpm") {
      return {
        started: false,
        status: null,
        stdout: "",
        stderr: `unexpected executable ${executable}`,
      };
    }

    if (
      args[0] === "exec" &&
      args[1] === "tsc" &&
      args.at(-1) === "--version"
    ) {
      return {
        started: true,
        status: 0,
        stdout: "Version 5.9.3\n",
        stderr: "",
      };
    }

    if (args.length === 1 && args[0] === "--version") {
      return {
        started: true,
        status: 0,
        stdout: "10.17.1\n",
        stderr: "",
      };
    }

    return {
      started: true,
      status: 1,
      stdout: "",
      stderr: `unexpected pnpm probe ${args.join(" ")}`,
    };
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
