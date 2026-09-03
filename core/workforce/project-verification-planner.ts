import {
  access,
  readFile,
  readdir,
} from "node:fs/promises";
import {
  basename,
  join,
  relative,
} from "node:path";

import type {
  BuildTestStep,
} from "./build-test-executor";

export interface ProjectVerificationPlanRequest {
  workspaceRoot: string;
  requiredCriteria: readonly string[];
  changedPaths: readonly string[];
}

export interface ProjectVerificationPlan {
  projectKind:
    | "node"
    | "python"
    | "rust"
    | "go"
    | "java"
    | "static-web"
    | "javascript"
    | "unknown";
  steps: BuildTestStep[];
  discoveredFiles: string[];
  uncoveredCriteria: string[];
}

interface PackageManifest {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

type CriterionKind =
  | "files"
  | "build"
  | "smoke"
  | "behavior";

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".kings",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "target",
  ".next",
]);

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(
  root: string,
  current: string,
  output: string[],
  limit = 500,
): Promise<void> {
  if (output.length >= limit) return;

  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (output.length >= limit) return;
    if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const absolute = join(current, entry.name);
    if (entry.isDirectory()) {
      await walk(root, absolute, output, limit);
    } else if (entry.isFile()) {
      output.push(
        relative(root, absolute).replaceAll("\\", "/"),
      );
    }
  }
}

function classifyCriterion(criterion: string): CriterionKind {
  const value = criterion.toLowerCase();

  if (
    /(file|source|workspace|project).*(exist|create|written|present)|created in|source code/.test(value)
  ) {
    return "files";
  }

  if (
    /(build|compile|typecheck|type check|syntax|lint)/.test(value)
  ) {
    return "build";
  }

  if (
    /(launch|start|run|load|open|browser|chromebook|android|mobile|tablet|responsive|http|health)/.test(value)
  ) {
    return "smoke";
  }

  return "behavior";
}

function criteriaOfKind(
  required: readonly string[],
  ...kinds: CriterionKind[]
): string[] {
  return required.filter(
    (criterion) => kinds.includes(classifyCriterion(criterion)),
  );
}

function validTestScript(script: string | undefined): boolean {
  if (!script?.trim()) return false;
  return !/no test specified/i.test(script);
}

function staticSmokeScript(): string {
  return [
    "const fs=require('node:fs');",
    "const http=require('node:http');",
    "const path=require('node:path');",
    "const index=path.join(process.cwd(),'index.html');",
    "if(!fs.existsSync(index))throw new Error('index.html missing');",
    "const html=fs.readFileSync(index,'utf8');",
    "if(!/<html[\\s>]/i.test(html)||!/<body[\\s>]/i.test(html))throw new Error('index.html is not a complete HTML document');",
    "const server=http.createServer((req,res)=>{res.statusCode=200;res.setHeader('content-type','text/html; charset=utf-8');res.end(html)});",
    "server.listen(0,'127.0.0.1',async()=>{try{const a=server.address();if(!a||typeof a==='string')throw new Error('server address unavailable');const r=await fetch(`http://127.0.0.1:${a.port}/`);const body=await r.text();if(!r.ok||body!==html)throw new Error('static HTTP smoke check failed');console.log('KINGS_STATIC_WEB_SMOKE_OK');server.close(()=>process.exit(0))}catch(e){console.error(e);server.close(()=>process.exit(1))}});",
  ].join("");
}

function filePresenceScript(paths: readonly string[]): string {
  return [
    "const fs=require('node:fs');",
    `const files=${JSON.stringify(paths)};`,
    "if(!files.length)throw new Error('No generated project files were recorded');",
    "for(const file of files){if(!fs.existsSync(file))throw new Error(`Missing generated file: ${file}`);if(fs.statSync(file).size===0)throw new Error(`Generated file is empty: ${file}`)}",
    "console.log(`KINGS_PROJECT_FILES_OK ${files.length}`);",
  ].join("");
}

function javascriptCheckSteps(
  workspaceRoot: string,
  files: readonly string[],
  buildCriteria: readonly string[],
): BuildTestStep[] {
  const javascriptFiles = files
    .filter((file) => /\.(?:js|cjs|mjs)$/.test(file))
    .slice(0, 40);

  return javascriptFiles.map((file, index) => ({
    id: `verify-js-syntax-${index + 1}`,
    operation: "validate" as const,
    command: process.execPath,
    args: ["--check", file],
    workingDirectory: workspaceRoot,
    verifiesCriteria: index === javascriptFiles.length - 1
      ? [...buildCriteria]
      : [],
  }));
}

export async function planProjectVerification(
  request: ProjectVerificationPlanRequest,
): Promise<ProjectVerificationPlan> {
  const workspaceRoot = request.workspaceRoot;
  const files: string[] = [];
  await walk(workspaceRoot, workspaceRoot, files);
  files.sort();

  const changedPaths = Array.from(new Set(
    request.changedPaths
      .map((path) => path.replaceAll("\\", "/").replace(/^\.\//, ""))
      .filter(Boolean),
  ));

  const fileCriteria = criteriaOfKind(request.requiredCriteria, "files");
  const buildCriteria = criteriaOfKind(request.requiredCriteria, "build");
  const smokeCriteria = criteriaOfKind(request.requiredCriteria, "smoke");
  const behaviorCriteria = criteriaOfKind(request.requiredCriteria, "behavior");

  const steps: BuildTestStep[] = [];

  steps.push({
    id: "verify-generated-files",
    operation: "validate",
    command: process.execPath,
    args: ["-e", filePresenceScript(changedPaths.length > 0 ? changedPaths : files)],
    workingDirectory: workspaceRoot,
    verifiesCriteria: fileCriteria,
  });

  const packagePath = join(workspaceRoot, "package.json");
  const pyprojectPath = join(workspaceRoot, "pyproject.toml");
  const requirementsPath = join(workspaceRoot, "requirements.txt");
  const cargoPath = join(workspaceRoot, "Cargo.toml");
  const goModPath = join(workspaceRoot, "go.mod");
  const pomPath = join(workspaceRoot, "pom.xml");
  const gradlePath = join(workspaceRoot, "build.gradle");
  const gradleKtsPath = join(workspaceRoot, "build.gradle.kts");
  const indexPath = join(workspaceRoot, "index.html");

  let projectKind: ProjectVerificationPlan["projectKind"] = "unknown";
  let hasBuildEvidence = false;
  let hasSmokeEvidence = false;
  let hasBehaviorEvidence = false;

  if (await exists(packagePath)) {
    projectKind = "node";
    let manifest: PackageManifest;
    try {
      manifest = JSON.parse(await readFile(packagePath, "utf8")) as PackageManifest;
    } catch (error) {
      throw new Error(
        `K.I.N.G.S. Project Verification: package.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const dependencyCount =
      Object.keys(manifest.dependencies ?? {}).length +
      Object.keys(manifest.devDependencies ?? {}).length;
    const hasNodeModules = await exists(join(workspaceRoot, "node_modules"));

    if (dependencyCount > 0 && !hasNodeModules) {
      steps.push({
        id: "install-node-dependencies",
        operation: "build",
        command: "npm",
        args: ["install", "--no-audit", "--no-fund"],
        workingDirectory: workspaceRoot,
        verifiesCriteria: [],
        requiresNetwork: true,
      });
    }

    const buildScript = manifest.scripts?.build;
    if (buildScript?.trim()) {
      steps.push({
        id: "build-node-project",
        operation: "build",
        command: "npm",
        args: ["run", "build"],
        workingDirectory: workspaceRoot,
        verifiesCriteria: buildCriteria,
      });
      hasBuildEvidence = true;
    } else if (await exists(join(workspaceRoot, "tsconfig.json"))) {
      steps.push({
        id: "typecheck-node-project",
        operation: "build",
        command: "npx",
        args: ["tsc", "-p", "tsconfig.json", "--noEmit"],
        workingDirectory: workspaceRoot,
        verifiesCriteria: buildCriteria,
      });
      hasBuildEvidence = true;
    } else {
      const jsChecks = javascriptCheckSteps(
        workspaceRoot,
        files,
        buildCriteria,
      );
      steps.push(...jsChecks);
      hasBuildEvidence = jsChecks.length > 0;
    }

    if (validTestScript(manifest.scripts?.test)) {
      steps.push({
        id: "test-node-project",
        operation: "test",
        command: "npm",
        args: ["test"],
        workingDirectory: workspaceRoot,
        verifiesCriteria: [...behaviorCriteria],
      });
      hasBehaviorEvidence = true;
    } else if (
      files.some((file) => /(?:^|\/)(?:test|tests)\//.test(file) || /\.(?:test|spec)\.(?:js|cjs|mjs)$/.test(file))
    ) {
      steps.push({
        id: "test-node-builtin",
        operation: "test",
        command: process.execPath,
        args: ["--test"],
        workingDirectory: workspaceRoot,
        verifiesCriteria: [...behaviorCriteria],
      });
      hasBehaviorEvidence = true;
    }

    if (await exists(indexPath)) {
      steps.push({
        id: "smoke-static-web",
        operation: "test",
        command: process.execPath,
        args: ["-e", staticSmokeScript()],
        workingDirectory: workspaceRoot,
        verifiesCriteria: [...smokeCriteria],
        requiresNetwork: true,
      });
      hasSmokeEvidence = true;
    }
  } else if (await exists(cargoPath)) {
    projectKind = "rust";
    steps.push({
      id: "cargo-check",
      operation: "build",
      command: "cargo",
      args: ["check"],
      workingDirectory: workspaceRoot,
      verifiesCriteria: [...buildCriteria],
      requiresNetwork: true,
    });
    steps.push({
      id: "cargo-test",
      operation: "test",
      command: "cargo",
      args: ["test"],
      workingDirectory: workspaceRoot,
      verifiesCriteria: [...behaviorCriteria],
      requiresNetwork: true,
    });
    hasBuildEvidence = true;
    hasBehaviorEvidence = true;
  } else if (await exists(goModPath)) {
    projectKind = "go";
    steps.push({
      id: "go-test",
      operation: "test",
      command: "go",
      args: ["test", "./..."],
      workingDirectory: workspaceRoot,
      verifiesCriteria: [...buildCriteria, ...behaviorCriteria],
      requiresNetwork: true,
    });
    hasBuildEvidence = true;
    hasBehaviorEvidence = true;
  } else if (await exists(pyprojectPath) || await exists(requirementsPath) || files.some((file) => file.endsWith(".py"))) {
    projectKind = "python";
    if (await exists(requirementsPath)) {
      steps.push({
        id: "install-python-dependencies",
        operation: "build",
        command: "python3",
        args: ["-m", "pip", "install", "-r", "requirements.txt"],
        workingDirectory: workspaceRoot,
        verifiesCriteria: [],
        requiresNetwork: true,
      });
    }
    steps.push({
      id: "compile-python-project",
      operation: "build",
      command: "python3",
      args: ["-m", "compileall", "-q", "."],
      workingDirectory: workspaceRoot,
      verifiesCriteria: [...buildCriteria],
    });
    hasBuildEvidence = true;

    if (files.some((file) => /(?:^|\/)test_.*\.py$/.test(file) || /(?:^|\/)tests\//.test(file))) {
      steps.push({
        id: "test-python-project",
        operation: "test",
        command: "python3",
        args: ["-m", "pytest", "-q"],
        workingDirectory: workspaceRoot,
        verifiesCriteria: [...behaviorCriteria],
      });
      hasBehaviorEvidence = true;
    }
  } else if (await exists(pomPath)) {
    projectKind = "java";
    steps.push({
      id: "maven-test",
      operation: "test",
      command: "mvn",
      args: ["test", "--batch-mode"],
      workingDirectory: workspaceRoot,
      verifiesCriteria: [...buildCriteria, ...behaviorCriteria],
      requiresNetwork: true,
    });
    hasBuildEvidence = true;
    hasBehaviorEvidence = true;
  } else if (await exists(gradlePath) || await exists(gradleKtsPath)) {
    projectKind = "java";
    steps.push({
      id: "gradle-test",
      operation: "test",
      command: "gradle",
      args: ["test", "--no-daemon"],
      workingDirectory: workspaceRoot,
      verifiesCriteria: [...buildCriteria, ...behaviorCriteria],
      requiresNetwork: true,
    });
    hasBuildEvidence = true;
    hasBehaviorEvidence = true;
  } else if (await exists(indexPath)) {
    projectKind = "static-web";
    const jsChecks = javascriptCheckSteps(
      workspaceRoot,
      files,
      buildCriteria,
    );
    steps.push(...jsChecks);
    hasBuildEvidence = jsChecks.length > 0 || buildCriteria.length === 0;
    steps.push({
      id: "smoke-static-web",
      operation: "test",
      command: process.execPath,
      args: ["-e", staticSmokeScript()],
      workingDirectory: workspaceRoot,
      verifiesCriteria: [...smokeCriteria],
      requiresNetwork: true,
    });
    hasSmokeEvidence = true;
  } else if (files.some((file) => /\.(?:js|cjs|mjs)$/.test(file))) {
    projectKind = "javascript";
    const jsChecks = javascriptCheckSteps(
      workspaceRoot,
      files,
      buildCriteria,
    );
    steps.push(...jsChecks);
    hasBuildEvidence = jsChecks.length > 0;
  }

  const covered = new Set(
    steps.flatMap((step) => step.verifiesCriteria ?? []),
  );

  if (buildCriteria.length > 0 && !hasBuildEvidence) {
    for (const criterion of buildCriteria) covered.delete(criterion);
  }
  if (smokeCriteria.length > 0 && !hasSmokeEvidence) {
    for (const criterion of smokeCriteria) covered.delete(criterion);
  }
  if (behaviorCriteria.length > 0 && !hasBehaviorEvidence) {
    for (const criterion of behaviorCriteria) covered.delete(criterion);
  }

  const uncoveredCriteria = request.requiredCriteria.filter(
    (criterion) => !covered.has(criterion),
  );

  return {
    projectKind,
    steps,
    discoveredFiles: files,
    uncoveredCriteria,
  };
}
