import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

function assert(condition: unknown, message = "assertion failed"): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

type PreflightResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

function runPreflight(
  root: string,
  preflightPath: string,
  environment: Readonly<Record<string, string>>,
): Promise<PreflightResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [preflightPath], {
      cwd: root,
      env: { ...process.env, ...environment },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function startModelServer(models: readonly string[]): Promise<{
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
}> {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/tags") {
      response.statusCode = 200;
      response.end(JSON.stringify({
        models: models.map((name) => ({ name })),
      }));
      return;
    }
    if (request.url === "/v1/models") {
      response.statusCode = 200;
      response.end(JSON.stringify({
        data: models.map((id) => ({ id })),
      }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
  const address = server.address();
  assert(address && typeof address === "object", "test gateway did not expose a TCP address");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function main(): Promise<void> {
  const root = process.cwd();
  const preflightPath = join(root, "scripts", "kings-production-preflight.mjs");
  const packagePath = join(root, "package.json");

  const syntax = spawnSync(process.execPath, ["--check", preflightPath], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  assert(
    syntax.status === 0,
    `production preflight failed JavaScript syntax validation: ${syntax.stderr || syntax.stdout}`,
  );

  const source = await readFile(preflightPath, "utf8");
  assert(source.includes("detectBubblewrap"), "preflight does not verify host process isolation");
  assert(source.includes("checkWorkspace"), "preflight does not verify project workspace writeability");
  assert(source.includes("checkUsageLedger"), "preflight does not verify durable gateway accounting storage");
  assert(source.includes("checkOptionalOllamaFallback"), "preflight does not model Ollama as optional fallback");
  assert(source.includes("checkGateways"), "preflight does not check configured AI gateways");
  assert(source.includes("firstClassUsable"), "preflight does not require first-class OmniRoute/9Router readiness");
  assert(source.includes("Ollama alone"), "preflight does not explicitly reject local-only production readiness");
  assert(source.includes("did not identify itself as Bubblewrap"));
  assert(source.includes("PRODUCTION PREFLIGHT: NOT READY"));
  assert(source.includes("process.exitCode = 1"));

  const manifest = JSON.parse(await readFile(packagePath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  assert(
    manifest.scripts?.["preflight:production"] === "node scripts/kings-production-preflight.mjs",
    "package manifest does not expose production preflight",
  );
  assert(
    manifest.scripts?.["start:production"] ===
      "npm run preflight:production && npm run start:owner-ui",
    "production start does not require passing preflight",
  );

  const tempRoot = await mkdtemp(join(tmpdir(), "kings-production-preflight-test-"));
  const fakeBubblewrap = join(tempRoot, "bwrap");
  await writeFile(
    fakeBubblewrap,
    "#!/usr/bin/env sh\nprintf 'bubblewrap 0.11.0\\n'\n",
    "utf8",
  );
  await chmod(fakeBubblewrap, 0o755);

  const baselineEnvironment: Record<string, string> = {
    KINGS_STATE_ROOT: join(tempRoot, "state"),
    KINGS_CODING_MACHINE_WORKSPACE: join(tempRoot, "state", "projects"),
    KINGS_GATEWAY_USAGE_FILE: join(tempRoot, "state", "usage.jsonl"),
    KINGS_BWRAP_PATH: fakeBubblewrap,
    KINGS_ENABLE_OLLAMA_FALLBACK: "",
    KINGS_CODING_MACHINE_MODEL: "qwen2.5-coder:1.5b",
    KINGS_CODING_MACHINE_OLLAMA_URL: "http://127.0.0.1:9",
    KINGS_OMNIROUTE_URL: "",
    KINGS_OMNIROUTE_KEY: "",
    KINGS_9ROUTER_URL: "",
    KINGS_9ROUTER_KEY: "",
    KINGS_AI_GATEWAYS_JSON: "",
  };

  try {
    const noGateway = await runPreflight(root, preflightPath, baselineEnvironment);
    assert(noGateway.status !== 0, "preflight reported READY with no gateway");
    assert(
      `${noGateway.stdout}\n${noGateway.stderr}`.includes("No AI gateway is configured"),
      "missing-gateway failure was not explicit",
    );

    const ollama = await startModelServer(["qwen2.5-coder:1.5b"]);
    try {
      const localOnly = await runPreflight(root, preflightPath, {
        ...baselineEnvironment,
        KINGS_ENABLE_OLLAMA_FALLBACK: "1",
        KINGS_CODING_MACHINE_OLLAMA_URL: ollama.baseUrl,
      });
      assert(
        localOnly.status !== 0,
        "working Ollama incorrectly made gateway-first production READY",
      );
      assert(
        `${localOnly.stdout}\n${localOnly.stderr}`.includes("Ollama alone"),
        "local-only failure did not explain that a production gateway is mandatory",
      );
      assert(
        localOnly.stdout.includes("Optional local fallback is routable"),
        "preflight did not truthfully recognize the working fallback while remaining not ready",
      );
    } finally {
      await ollama.close();
    }

    const nineRouter = await startModelServer([
      "kr/claude-sonnet",
      "qw/qwen3-coder-plus",
      "if/kimi-k2-thinking",
    ]);
    try {
      const gatewayReady = await runPreflight(root, preflightPath, {
        ...baselineEnvironment,
        KINGS_9ROUTER_URL: nineRouter.baseUrl,
      });
      assert(
        gatewayReady.status === 0,
        `preflight rejected a usable 9Router-compatible gateway: ${gatewayReady.stderr || gatewayReady.stdout}`,
      );
      assert(
        gatewayReady.stdout.includes("9router live API is reachable: 3 total model ids") &&
          gatewayReady.stdout.includes("Gateway AI fabric is ready: 1 first-class gateway, 3 live model ids discovered"),
        "preflight did not positively prove the live first-class gateway catalog",
      );
    } finally {
      await nineRouter.close();
    }

    const customGateway = await startModelServer(["custom/coder"]);
    try {
      const customOnly = await runPreflight(root, preflightPath, {
        ...baselineEnvironment,
        KINGS_AI_GATEWAYS_JSON: JSON.stringify([{
          id: "custom",
          baseUrl: customGateway.baseUrl,
          gatewayKind: "openai-compatible",
        }]),
      });
      assert(customOnly.status !== 0, "custom-only gateway incorrectly satisfied first-class production contract");
      assert(
        `${customOnly.stdout}\n${customOnly.stderr}`.includes("requires at least one live first-class OmniRoute or 9Router"),
        "custom-only failure did not explain first-class gateway requirement",
      );
    } finally {
      await customGateway.close();
    }

    const emptyGateway = await startModelServer([]);
    try {
      const noRoutableModels = await runPreflight(root, preflightPath, {
        ...baselineEnvironment,
        KINGS_OMNIROUTE_URL: emptyGateway.baseUrl,
      });
      assert(noRoutableModels.status !== 0);
      assert(
        `${noRoutableModels.stdout}\n${noRoutableModels.stderr}`.includes("returned no text/coding model ids"),
        "empty gateway failure did not explain missing coding models",
      );
    } finally {
      await emptyGateway.close();
    }

    const validGateway = await startModelServer(["auto/coding"]);
    try {
      const wrongIsolationExecutable = await runPreflight(root, preflightPath, {
        ...baselineEnvironment,
        KINGS_BWRAP_PATH: process.execPath,
        KINGS_OMNIROUTE_URL: validGateway.baseUrl,
      });
      assert(wrongIsolationExecutable.status !== 0);
      assert(
        `${wrongIsolationExecutable.stdout}\n${wrongIsolationExecutable.stderr}`.includes("did not identify itself as Bubblewrap"),
        "invalid isolation executable failure did not explain Bubblewrap identity problem",
      );
    } finally {
      await validGateway.close();
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  console.log("K.I.N.G.S. PREFLIGHT → SYNTAX: SUCCESS");
  console.log("K.I.N.G.S. PREFLIGHT → NO-GATEWAY FAIL-CLOSED: SUCCESS");
  console.log("K.I.N.G.S. PREFLIGHT → OLLAMA-ONLY NOT PRODUCTION READY: SUCCESS");
  console.log("K.I.N.G.S. PREFLIGHT → 9ROUTER LIVE CATALOG READY: SUCCESS");
  console.log("K.I.N.G.S. PREFLIGHT → CUSTOM-ONLY FAIL-CLOSED: SUCCESS");
  console.log("K.I.N.G.S. PREFLIGHT → EMPTY GATEWAY FAIL-CLOSED: SUCCESS");
  console.log("K.I.N.G.S. PREFLIGHT → USAGE LEDGER WRITEABILITY: SUCCESS");
  console.log("K.I.N.G.S. PREFLIGHT → BUBBLEWRAP IDENTITY FAIL-CLOSED: SUCCESS");
  console.log("TREE-KCM-PRODUCTION-PREFLIGHT: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-PRODUCTION-PREFLIGHT: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
