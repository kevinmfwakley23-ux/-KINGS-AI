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

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function main(): Promise<void> {
  await verifiesRealNodeProjectWithoutCallerSuppliedLanguage();
  await rejectsPackageManagerSubstitution();
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

async function rejectsPackageManagerSubstitution(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "kings-readiness-pnpm-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "index.ts"), "export const packageManager = 'pnpm';\n");
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { build: "tsc" } }));
    await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    await writeFile(join(root, "tsconfig.json"), "{}\n");

    const result = await new LocalProjectEngineeringReadinessAuthority().inspect({
      id: "pnpm-project",
      projectPath: root,
      requiredOperations: ["build"],
    });

    assert(
      result.environment.packageManagers.includes("pnpm"),
      "pnpm lock evidence must be detected.",
    );
    assert(
      result.execution.status === "blocked",
      "K.I.N.G.S. must fail closed rather than silently execute an npm toolchain for a pnpm project.",
    );
    assert(
      result.blockedReasons.some((reason) => /does not match the registered npm\/npx toolchain/i.test(reason)),
      "Package-manager mismatch must be explicit in readiness evidence.",
    );
    console.log("08.PROJECT package-manager substitution protection: SUCCESS");
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
