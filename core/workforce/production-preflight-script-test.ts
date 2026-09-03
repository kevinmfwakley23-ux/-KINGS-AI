import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  createServer,
} from "node:http";
import {
  spawn,
  spawnSync,
} from "node:child_process";
import {
  tmpdir,
} from "node:os";
import {
  join,
} from "node:path";

function assert(condition: unknown, message: string): asserts condition {
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
      env: {
        ...process.env,
        ...environment,
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status) => {
      resolve({ status, stdout, stderr });
    });
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
  assert(address && typeof address === "object", "model test server did not expose a TCP address");

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
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
  assert(source.includes("checkOllama"), "preflight does not check local AI readiness");
  assert(source.includes("checkGateways"), "preflight does not check configured AI gateways");
  assert(source.includes("checkGitHubAuth"), "preflight does not check GitHub authentication readiness");
  assert(
    source.includes("No usable AI execution provider is available"),
    "preflight does not fail closed when no AI execution provider is usable",
  );
  assert(
    source.includes("did not identify itself as Bubblewrap"),
    "preflight does not reject a non-Bubblewrap KINGS_BWRAP_PATH executable",
  );
  assert(
    source.includes("PRODUCTION PREFLIGHT: NOT READY") &&
      source.includes("process.exitCode = 1"),
    "production preflight does not fail closed on mandatory prerequisite failures",
  );

  const manifest = JSON.parse(await readFile(packagePath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  assert(
    manifest.scripts?.["preflight:production"] === "node scripts/kings-production-preflight.mjs",
    "package manifest does not expose the production preflight command",
  );
  assert(
    manifest.scripts?.["start:production"] ===
      "npm run preflight:production && npm run start:owner-ui",
    "production start does not require a passing preflight",
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
    KINGS_BWRAP_PATH: fakeBubblewrap,
    KINGS_CODING_MACHINE_MODEL: "qwen2.5-coder:1.5b",
    KINGS_CODING_MACHINE_OLLAMA_URL: "http://127.0.0.1:9",
    KINGS_OMNIROUTE_URL: "",
    KINGS_OMNIROUTE_KEY: "",
    KINGS_9ROUTER_URL: "",
    KINGS_9ROUTER_KEY: "",
    KINGS_AI_GATEWAYS_JSON: "",
  };

  try {
    const noProvider = await runPreflight(root, preflightPath, baselineEnvironment);
    assert(noProvider.status !== 0, "preflight reported READY with zero usable AI providers");
    assert(
      `${noProvider.stdout}\n${noProvider.stderr}`.includes("No usable AI execution provider is available"),
      "zero-provider failure did not explain the missing AI execution path",
    );

    const ollama = await startModelServer(["qwen2.5-coder:1.5b"]);
    try {
      const localReady = await runPreflight(root, preflightPath, {
        ...baselineEnvironment,
        KINGS_CODING_MACHINE_OLLAMA_URL: ollama.baseUrl,
      });
      assert(
        localReady.status === 0,
        `preflight rejected a usable local model: ${localReady.stderr || localReady.stdout}`,
      );
      assert(
        localReady.stdout.includes("AI execution path is ready: local Ollama"),
        "preflight did not positively identify the usable local AI path",
      );
    } finally {
      await ollama.close();
    }

    const gateway = await startModelServer(["gateway/coding-model"]);
    try {
      const gatewayReady = await runPreflight(root, preflightPath, {
        ...baselineEnvironment,
        KINGS_9ROUTER_URL: gateway.baseUrl,
      });
      assert(
        gatewayReady.status === 0,
        `preflight rejected a usable 9Router-compatible gateway: ${gatewayReady.stderr || gatewayReady.stdout}`,
      );
      assert(
        gatewayReady.stdout.includes("9router is reachable and returned 1 model") &&
          gatewayReady.stdout.includes("AI execution path is ready: 1 gateway"),
        "preflight did not positively identify the usable gateway AI path",
      );
    } finally {
      await gateway.close();
    }

    const emptyGateway = await startModelServer([]);
    try {
      const noRoutableModels = await runPreflight(root, preflightPath, {
        ...baselineEnvironment,
        KINGS_OMNIROUTE_URL: emptyGateway.baseUrl,
      });
      assert(
        noRoutableModels.status !== 0,
        "preflight reported READY for a reachable gateway with zero routable models",
      );
      assert(
        `${noRoutableModels.stdout}\n${noRoutableModels.stderr}`.includes("returned no routable models"),
        "empty gateway failure did not explain that no models were routable",
      );
    } finally {
      await emptyGateway.close();
    }

    const validProvider = await startModelServer(["qwen2.5-coder:1.5b"]);
    try {
      const wrongIsolationExecutable = await runPreflight(root, preflightPath, {
        ...baselineEnvironment,
        KINGS_BWRAP_PATH: process.execPath,
        KINGS_CODING_MACHINE_OLLAMA_URL: validProvider.baseUrl,
      });
      assert(
        wrongIsolationExecutable.status !== 0,
        "preflight accepted a non-Bubblewrap executable as host isolation",
      );
      assert(
        `${wrongIsolationExecutable.stdout}\n${wrongIsolationExecutable.stderr}`.includes("did not identify itself as Bubblewrap"),
        "invalid isolation executable failure did not explain the Bubblewrap identity problem",
      );
    } finally {
      await validProvider.close();
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  console.log("K.I.N.G.S. PRODUCTION PREFLIGHT → SYNTAX: SUCCESS");
  console.log("K.I.N.G.S. PRODUCTION PREFLIGHT → ZERO-PROVIDER FAIL-CLOSED: SUCCESS");
  console.log("K.I.N.G.S. PRODUCTION PREFLIGHT → LOCAL MODEL READY: SUCCESS");
  console.log("K.I.N.G.S. PRODUCTION PREFLIGHT → GATEWAY MODEL READY: SUCCESS");
  console.log("K.I.N.G.S. PRODUCTION PREFLIGHT → EMPTY GATEWAY FAIL-CLOSED: SUCCESS");
  console.log("K.I.N.G.S. PRODUCTION PREFLIGHT → BUBBLEWRAP IDENTITY FAIL-CLOSED: SUCCESS");
  console.log("K.I.N.G.S. PRODUCTION START → FAIL-CLOSED PREFLIGHT: SUCCESS");
  console.log("TREE-KCM-PRODUCTION-PREFLIGHT: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-PRODUCTION-PREFLIGHT: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
