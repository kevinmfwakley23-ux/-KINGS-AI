import {
  access,
  appendFile,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

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

function command(commandName, args = []) {
  const result = spawnSync(commandName, args, {
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

function isLoopbackBind(host) {
  const normalized = String(host ?? "").trim().toLowerCase();
  return normalized === "127.0.0.1" ||
    normalized === "localhost" ||
    normalized === "::1";
}

function checkOwnerNetworkSecurity() {
  const bindHost = process.env.KINGS_CODING_MACHINE_BIND?.trim() || "127.0.0.1";
  if (isLoopbackBind(bindHost)) {
    pass(`Owner HTTP runtime is loopback-only by default (${bindHost}).`);
    return;
  }

  const token = process.env.KINGS_OWNER_TOKEN?.trim();
  if (!token || token.length < 24) {
    fail(
      `Owner HTTP runtime is configured for non-loopback bind ${bindHost}, but KINGS_OWNER_TOKEN is missing or shorter than 24 characters. Refusing unauthenticated LAN code-execution exposure.`,
    );
    return;
  }

  pass(`Owner HTTP runtime LAN exposure is protected by an owner credential (${bindHost}).`);
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

async function checkUsageLedger() {
  const stateRoot = process.env.KINGS_STATE_ROOT ?? join(process.cwd(), ".kings");
  const usageFile = process.env.KINGS_GATEWAY_USAGE_FILE ?? join(stateRoot, "gateway-usage.jsonl");
  const probe = `${usageFile}.preflight-${process.pid}`;
  try {
    await mkdir(dirname(usageFile), { recursive: true });
    await appendFile(probe, `${JSON.stringify({ probe: true, at: new Date().toISOString() })}\n`, "utf8");
    await rm(probe, { force: true });
    pass(`Gateway usage ledger storage is writable: ${usageFile}`);
  } catch (error) {
    fail(`Gateway usage ledger storage is not writable: ${usageFile} (${error instanceof Error ? error.message : String(error)})`);
  }
}

async function checkOptionalOllamaFallback() {
  if (process.env.KINGS_ENABLE_OLLAMA_FALLBACK !== "1") {
    pass("Local Ollama fallback is disabled; production will use gateway AI only.");
    return false;
  }

  const baseUrl = process.env.KINGS_CODING_MACHINE_OLLAMA_URL ?? "http://127.0.0.1:11434";
  const modelId = process.env.KINGS_CODING_MACHINE_MODEL ?? "qwen2.5-coder:1.5b";
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      warn(`Optional Ollama fallback responded HTTP ${response.status}. This does not affect gateway-first production readiness.`);
      return false;
    }
    const data = await response.json();
    const models = (data.models ?? []).map((model) => model?.name).filter(Boolean);
    const available = models.some((name) => name === modelId || name.startsWith(`${modelId}:`));
    if (available) {
      pass(`Optional local fallback is routable: ${modelId}`);
      return true;
    }
    warn(`Optional Ollama fallback is reachable but configured model ${modelId} is not installed.`);
    return false;
  } catch (error) {
    warn(`Optional Ollama fallback is unavailable (${error instanceof Error ? error.message : String(error)}). Gateway-first production can still be ready.`);
    return false;
  }
}

function configuredGateways() {
  const gateways = [];
  if (process.env.KINGS_OMNIROUTE_URL?.trim()) {
    gateways.push({
      id: "omniroute",
      kind: "omniroute",
      firstClass: true,
      url: process.env.KINGS_OMNIROUTE_URL.trim(),
      key: process.env.KINGS_OMNIROUTE_KEY,
    });
  }
  if (process.env.KINGS_9ROUTER_URL?.trim()) {
    gateways.push({
      id: "9router",
      kind: "9router",
      firstClass: true,
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
          gateways.push({
            id: item.id,
            kind: item.gatewayKind ?? "openai-compatible",
            firstClass: item.gatewayKind === "omniroute" || item.gatewayKind === "9router",
            url: item.baseUrl,
            key: item.apiKey,
          });
        }
      }
    } catch (error) {
      fail(`KINGS_AI_GATEWAYS_JSON is invalid (${error instanceof Error ? error.message : String(error)}).`);
    }
  }
  return gateways;
}

function looksLikeNonCodingModel(modelId) {
  const value = String(modelId).toLowerCase();
  return [
    "embedding", "embed-", "/embed", "rerank", "whisper", "tts",
    "speech", "audio", "music", "video", "image", "flux",
    "stable-diffusion", "dall-e",
  ].some((token) => value.includes(token));
}

async function checkGateways() {
  const gateways = configuredGateways();
  if (gateways.length === 0) {
    fail("No AI gateway is configured. K.I.N.G.S. production requires a real OmniRoute or 9Router endpoint; Ollama alone is only an optional fallback.");
    return { usable: 0, firstClassUsable: 0, discoveredModels: 0 };
  }

  let usable = 0;
  let firstClassUsable = 0;
  let discoveredModels = 0;
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
        warn(`${gateway.id} is configured but live /v1/models discovery returned HTTP ${response.status}.`);
        continue;
      }
      const data = await response.json();
      const models = Array.isArray(data?.data)
        ? data.data.map((item) => item?.id).filter(Boolean)
        : [];
      const codingModels = models.filter((id) => !looksLikeNonCodingModel(id));
      if (codingModels.length < 1) {
        warn(`${gateway.id} is reachable but returned no text/coding model ids.`);
        continue;
      }

      usable += 1;
      if (gateway.firstClass) firstClassUsable += 1;
      discoveredModels += models.length;
      pass(`${gateway.id} live API is reachable: ${models.length} total model ids, ${codingModels.length} text/coding candidates.`);
    } catch (error) {
      warn(`${gateway.id} is configured but unreachable (${error instanceof Error ? error.message : String(error)}).`);
    }
  }

  return { usable, firstClassUsable, discoveredModels };
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
  console.log("K.I.N.G.S. GATEWAY-FIRST PRODUCTION PREFLIGHT\n");

  const major = Number(process.versions.node.split(".")[0]);
  if (Number.isInteger(major) && major >= 24) {
    pass(`Node.js ${process.version} satisfies the production runtime baseline.`);
  } else {
    fail(`Node.js 24+ is required; current runtime is ${process.version}.`);
  }

  const git = command("git", ["--version"]);
  if (git.ok) pass(git.stdout || "Git is available.");
  else fail(`Git is required for repository work (${git.error?.message || git.stderr || "not found"}).`);

  checkOwnerNetworkSecurity();

  const bwrap = await detectBubblewrap();
  if (bwrap) {
    const version = command(bwrap, ["--version"]);
    const identity = `${version.stdout}\n${version.stderr}`.trim();
    if (version.ok && /\bbubblewrap\b/i.test(identity)) {
      pass(`Bubblewrap host isolation is available: ${version.stdout || bwrap}`);
    } else if (version.ok) {
      fail(`KINGS_BWRAP_PATH resolved to ${bwrap}, but that executable did not identify itself as Bubblewrap.`);
    } else {
      fail(`Bubblewrap exists at ${bwrap} but cannot execute (${version.stderr || version.error?.message || "unknown error"}).`);
    }
  } else {
    fail("Bubblewrap is required for real GitHub repository build/test execution. On Debian/Crostini install the bubblewrap package, or set KINGS_BWRAP_PATH to a trusted executable.");
  }

  await Promise.all([checkWorkspace(), checkUsageLedger()]);
  checkGitHubAuth();
  const [gatewayStatus] = await Promise.all([
    checkGateways(),
    checkOptionalOllamaFallback(),
  ]);

  if (gatewayStatus.usable < 1) {
    fail("No usable AI gateway execution provider is available. K.I.N.G.S. will not claim production readiness from a local Ollama model alone.");
  } else if (gatewayStatus.firstClassUsable < 1) {
    fail("Only custom gateways are usable. Production K.I.N.G.S. requires at least one live first-class OmniRoute or 9Router gateway.");
  } else {
    pass(`Gateway AI fabric is ready: ${gatewayStatus.firstClassUsable} first-class gateway${gatewayStatus.firstClassUsable === 1 ? "" : "s"}, ${gatewayStatus.discoveredModels} live model ids discovered.`);
  }

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