import {
  access,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  constants,
} from "node:fs";
import {
  spawnSync,
} from "node:child_process";
import {
  join,
} from "node:path";

const failures = [];
const warnings = [];
const passes = [];

function pass(message) {
  passes.push(message);
  console.log(`PASS  ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.warn(`WARN  ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`FAIL  ${message}`);
}

function command(command, args = []) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    env: process.env,
    timeout: 10_000,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    error: result.error,
  };
}

async function pathExecutable(path) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function detectBubblewrap() {
  const configured = process.env.KINGS_BWRAP_PATH?.trim();
  const candidates = configured ? [configured] : ["/usr/bin/bwrap", "/bin/bwrap"];
  for (const candidate of candidates) {
    if (await pathExecutable(candidate)) return candidate;
  }
  return undefined;
}

async function checkWorkspace() {
  const stateRoot = process.env.KINGS_STATE_ROOT ?? join(process.cwd(), ".kings");
  const projectRoot = process.env.KINGS_CODING_MACHINE_WORKSPACE ?? join(stateRoot, "projects");
  const probe = join(projectRoot, `.kings-preflight-${process.pid}-${Date.now()}`);
  try {
    await mkdir(projectRoot, { recursive: true });
    await writeFile(probe, "KINGS_PREFLIGHT_OK\n", "utf8");
    await rm(probe, { force: true });
    pass(`Project workspace is writable: ${projectRoot}`);
  } catch (error) {
    fail(`Project workspace is not writable: ${projectRoot} (${error instanceof Error ? error.message : String(error)})`);
  }
}

async function checkOllama() {
  const baseUrl = process.env.KINGS_CODING_MACHINE_OLLAMA_URL ?? "http://127.0.0.1:11434";
  const modelId = process.env.KINGS_CODING_MACHINE_MODEL ?? "qwen2.5-coder:1.5b";
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      warn(`Ollama responded HTTP ${response.status}; gateway AI can still be used if configured.`);
      return;
    }
    const data = await response.json();
    const models = (data.models ?? [])
      .map((model) => model?.name)
      .filter(Boolean);
    const available = models.some((name) => name === modelId || name.startsWith(`${modelId}:`));
    if (available) {
      pass(`Local Ollama model is routable: ${modelId}`);
    } else {
      warn(`Ollama is reachable but configured model ${modelId} is not installed.`);
    }
  } catch (error) {
    warn(`Local Ollama is unavailable (${error instanceof Error ? error.message : String(error)}). A healthy configured gateway is required for AI coding.`);
  }
}

function configuredGateways() {
  const gateways = [];
  if (process.env.KINGS_OMNIROUTE_URL?.trim()) {
    gateways.push({
      id: "omniroute",
      url: process.env.KINGS_OMNIROUTE_URL.trim(),
      key: process.env.KINGS_OMNIROUTE_KEY,
    });
  }
  if (process.env.KINGS_9ROUTER_URL?.trim()) {
    gateways.push({
      id: "9router",
      url: process.env.KINGS_9ROUTER_URL.trim(),
      key: process.env.KINGS_9ROUTER_KEY,
    });
  }
  if (process.env.KINGS_AI_GATEWAYS_JSON?.trim()) {
    try {
      const parsed = JSON.parse(process.env.KINGS_AI_GATEWAYS_JSON);
      if (!Array.isArray(parsed)) throw new Error("must be an array");
      for (const item of parsed) {
        if (item?.id && item?.baseUrl) {
          gateways.push({ id: item.id, url: item.baseUrl, key: item.apiKey });
        }
      }
    } catch (error) {
      fail(`KINGS_AI_GATEWAYS_JSON is invalid (${error instanceof Error ? error.message : String(error)}).`);
    }
  }
  return gateways;
}

async function checkGateways() {
  const gateways = configuredGateways();
  if (gateways.length === 0) {
    warn("No OmniRoute, 9Router, or custom OpenAI-compatible gateway is configured. Local Ollama must be available for AI coding.");
    return;
  }

  for (const gateway of gateways) {
    try {
      const base = gateway.url.replace(/\/+$/, "").replace(/\/v1$/i, "");
      const headers = { accept: "application/json" };
      if (gateway.key?.trim()) headers.authorization = `Bearer ${gateway.key.trim()}`;
      const response = await fetch(`${base}/v1/models`, {
        headers,
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        warn(`${gateway.id} is configured but model discovery returned HTTP ${response.status}.`);
        continue;
      }
      const data = await response.json();
      const modelCount = Array.isArray(data?.data) ? data.data.length : 0;
      pass(`${gateway.id} is reachable and returned ${modelCount} model${modelCount === 1 ? "" : "s"}.`);
    } catch (error) {
      warn(`${gateway.id} is configured but unreachable (${error instanceof Error ? error.message : String(error)}).`);
    }
  }
}

function checkGitHubAuth() {
  if (process.env.KINGS_GITHUB_TOKEN?.trim()) {
    pass("Server-side GitHub token is configured for private repository clone/push.");
    return;
  }

  const credentialHelper = command("git", ["config", "--global", "--get", "credential.helper"]);
  if (credentialHelper.ok && credentialHelper.stdout) {
    pass(`Git credential helper is configured (${credentialHelper.stdout}).`);
    return;
  }

  warn("No KINGS_GITHUB_TOKEN or global Git credential helper was detected. Public repositories work; private HTTPS repositories may require server-side Git authentication or SSH configuration.");
}

async function main() {
  console.log("K.I.N.G.S. PRODUCTION PREFLIGHT\n");

  const major = Number(process.versions.node.split(".")[0]);
  if (Number.isInteger(major) && major >= 24) {
    pass(`Node.js ${process.version} satisfies the production runtime baseline.`);
  } else {
    fail(`Node.js 24+ is required; current runtime is ${process.version}.`);
  }

  const git = command("git", ["--version"]);
  if (git.ok) pass(git.stdout || "Git is available.");
  else fail(`Git is required for repository work (${git.error?.message || git.stderr || "not found"}).`);

  const bwrap = await detectBubblewrap();
  if (bwrap) {
    const version = command(bwrap, ["--version"]);
    if (version.ok) pass(`Bubblewrap host isolation is available: ${version.stdout || bwrap}`);
    else fail(`Bubblewrap exists at ${bwrap} but cannot execute (${version.stderr || version.error?.message || "unknown error"}).`);
  } else {
    fail("Bubblewrap is required for real GitHub repository build/test execution. On Debian/Crostini install the bubblewrap package, or set KINGS_BWRAP_PATH to a trusted executable.");
  }

  await checkWorkspace();
  checkGitHubAuth();
  await Promise.all([
    checkOllama(),
    checkGateways(),
  ]);

  console.log(`\nSUMMARY  ${passes.length} passed · ${warnings.length} warning${warnings.length === 1 ? "" : "s"} · ${failures.length} failure${failures.length === 1 ? "" : "s"}`);

  if (failures.length > 0) {
    console.error("K.I.N.G.S. PRODUCTION PREFLIGHT: NOT READY");
    process.exitCode = 1;
    return;
  }

  console.log("K.I.N.G.S. PRODUCTION PREFLIGHT: READY");
}

main().catch((error) => {
  console.error("K.I.N.G.S. PRODUCTION PREFLIGHT: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
