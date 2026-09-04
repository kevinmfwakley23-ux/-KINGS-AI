import {
  ExecutionSandbox,
  type SandboxProcess,
  type SandboxSpawner,
} from "./execution-sandbox";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

class FakeStream {
  private listeners = new Map<string, Array<(...args: any[]) => void>>();

  on(event: string, listener: (...args: any[]) => void): this {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return this;
  }

  emit(event: string, ...args: any[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
}

class FakeProcess implements SandboxProcess {
  stdout = new FakeStream() as unknown as NodeJS.ReadableStream;
  stderr = new FakeStream() as unknown as NodeJS.ReadableStream;
  private listeners = new Map<string, Array<(...args: any[]) => void>>();

  once(event: string, listener: (...args: any[]) => void): this {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return this;
  }

  kill(signal?: NodeJS.Signals): boolean {
    queueMicrotask(() => this.close(null, signal ?? "SIGTERM"));
    return true;
  }

  succeed(): void {
    queueMicrotask(() => this.close(0, null));
  }

  private close(exitCode: number | null, signal: NodeJS.Signals | null): void {
    const listeners = this.listeners.get("close") ?? [];
    this.listeners.set("close", []);
    for (const listener of listeners) listener(exitCode, signal);
  }
}

interface CapturedInvocation {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

async function main(): Promise<void> {
  const invocations: CapturedInvocation[] = [];
  const spawner: SandboxSpawner = (command, args, options) => {
    invocations.push({
      command,
      args: [...args],
      cwd: options.cwd,
      env: { ...options.env },
    });
    const process = new FakeProcess();
    process.succeed();
    return process;
  };

  const sandbox = new ExecutionSandbox({
    allowedCommands: ["node", "npm"],
    allowedWorkingDirectories: ["/workspace/project"],
    allowedReadPaths: ["/workspace/project"],
    allowedWritePaths: ["/workspace/project"],
    allowedEnvironmentKeys: ["PATH", "HOME", "TMPDIR", "TMP", "TEMP"],
    allowedSideEffects: ["read", "write", "execute", "network"],
    timeoutMs: 5_000,
    maxOutputBytes: 4_096,
    maxConcurrentProcesses: 1,
    allowShell: false,
    allowNetwork: true,
    processIsolation: {
      kind: "bubblewrap",
      executable: "/usr/bin/bwrap",
      additionalReadOnlyPaths: ["/home/test/.nvm/versions/node/v24.19.0"],
    },
  }, spawner);

  const offline = await sandbox.execute({
    command: "node",
    args: ["--version"],
    workingDirectory: "/workspace/project",
    sideEffects: ["read", "write", "execute"],
  });

  assert(offline.exitCode === 0, "isolated command did not report success");
  assert(offline.command === "node", "result evidence must preserve the requested command identity");
  assert(invocations.length === 1, "offline isolated execution did not spawn exactly once");
  const first = invocations[0];
  assert(first.command === "/usr/bin/bwrap", "isolated execution did not invoke bubblewrap");
  assert(first.args.includes("--unshare-all"), "bubblewrap did not unshare host namespaces");
  assert(!first.args.includes("--share-net"), "offline verification retained host network access");
  assert(
    first.args.some((arg, index) =>
      arg === "--bind" &&
      first.args[index + 1] === "/workspace/project" &&
      first.args[index + 2] === "/workspace/project"),
    "authorized project workspace was not the writable bind mount",
  );
  assert(
    first.args.some((arg, index) =>
      arg === "--ro-bind-try" &&
      first.args[index + 1] === "/home/test/.nvm/versions/node/v24.19.0"),
    "explicit toolchain path was not exposed read-only",
  );
  const separator = first.args.lastIndexOf("--");
  assert(separator >= 0, "bubblewrap command separator is missing");
  assert(first.args[separator + 1] === "node", "requested executable was not placed inside the isolation boundary");
  assert(first.env.HOME === "/tmp/kings-home", "host HOME leaked into isolated process environment");
  assert(first.env.TMPDIR === "/tmp", "isolated process did not receive a private temporary directory");

  await sandbox.execute({
    command: "npm",
    args: ["install"],
    workingDirectory: "/workspace/project",
    sideEffects: ["read", "write", "execute", "network"],
  });

  const networkInvocation = invocations[1];
  assert(networkInvocation !== undefined, "network isolated execution did not spawn exactly once");
  assert(
    networkInvocation.args.includes("--share-net"),
    "explicit network authorization was not translated into bubblewrap network sharing",
  );

  console.log("K.I.N.G.S. EXECUTION ISOLATION → PRIVATE FILESYSTEM/PROCESS NAMESPACE: SUCCESS");
  console.log("K.I.N.G.S. EXECUTION ISOLATION → NETWORK DEFAULT DENY: SUCCESS");
  console.log("K.I.N.G.S. EXECUTION ISOLATION → EXPLICIT NETWORK STEP: SUCCESS");
  console.log("TREE-KCM-BUBBLEWRAP-ISOLATION: SUCCESS");
}

main().catch((error) => {
  console.error("TREE-KCM-BUBBLEWRAP-ISOLATION: FAILURE");
  console.error(error);
  process.exitCode = 1;
});
