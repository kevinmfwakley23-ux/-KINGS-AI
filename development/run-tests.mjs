import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const buildRoot = new URL("../build/core/workforce/", import.meta.url);
const rootPath = fileURLToPath(root);
const buildPath = fileURLToPath(buildRoot);
const runLive = process.argv.includes("--live");

const liveOnly = new Set([
  "execution/crewai-selection-test.js",
  "execution/real-knowledge-execution-test.js",
  "execution/research-backed-acquisition-execution-test.js",
  "ollama-real-model-test.js",
  "real-local-code-change-loop-test.js",
  "real-local-coding-proof-test.js",
  "v1-acceptance-009-local-only-mission-test.js",
]);

async function discover(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await discover(path));
    else if (entry.name.endsWith("-test.js")) files.push(path);
  }
  return files;
}

function execute(path) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path], {
      cwd: rootPath,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
    child.on("error", (error) => resolve({ code: 1, output: String(error) }));
  });
}

const tests = (await discover(buildPath)).sort();
const selected = tests.filter((path) => {
  const name = relative(buildPath, path).replaceAll("\\", "/");
  return runLive ? liveOnly.has(name) : !liveOnly.has(name);
});

let failed = 0;
for (const path of selected) {
  const name = relative(buildPath, path).replaceAll("\\", "/");
  const result = await execute(path);
  if (result.code === 0) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}\n${result.output.trim()}`);
  }
}

console.log(`\n${selected.length - failed}/${selected.length} tests passed.`);
if (!runLive && liveOnly.size) {
  console.log(`${liveOnly.size} external-integration tests are excluded by default; run npm run test:live when prerequisites are available.`);
}
if (failed) process.exitCode = 1;
