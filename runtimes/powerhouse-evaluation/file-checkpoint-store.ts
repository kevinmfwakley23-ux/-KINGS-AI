import { randomUUID } from "node:crypto";
import { lstat, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  PowerhouseBenchmarkCheckpointStore,
  PowerhouseBenchmarkExecutionCheckpoint,
} from "../../core/workforce/powerhouse-benchmark-executor";

const MAX_CHECKPOINT_BYTES = 64 * 1024 * 1024;

export class FilePowerhouseBenchmarkCheckpointStore
implements PowerhouseBenchmarkCheckpointStore {
  readonly path: string;

  constructor(path: string) {
    this.path = resolve(path);
  }

  async load(): Promise<PowerhouseBenchmarkExecutionCheckpoint | undefined> {
    let metadata;
    try {
      metadata = await lstat(this.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("Powerhouse checkpoint must be a regular non-symbolic-link file");
    }
    if (metadata.size > MAX_CHECKPOINT_BYTES) {
      throw new Error(`Powerhouse checkpoint exceeds ${MAX_CHECKPOINT_BYTES} bytes`);
    }
    const content = await readFile(this.path, "utf8");
    try {
      return JSON.parse(content) as PowerhouseBenchmarkExecutionCheckpoint;
    } catch (error) {
      throw new Error(
        `Powerhouse checkpoint is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async save(checkpoint: PowerhouseBenchmarkExecutionCheckpoint): Promise<void> {
    const temporaryPath = `${this.path}.tmp-${process.pid}-${randomUUID()}`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(checkpoint, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      await rename(temporaryPath, this.path);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  async acquireLock(): Promise<() => Promise<void>> {
    const lockPath = `${this.path}.lock`;
    let handle;
    try {
      handle = await open(lockPath, "wx", 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }));
    } catch (error) {
      await handle?.close().catch(() => undefined);
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error(
          `Powerhouse checkpoint is locked by another process (${lockPath}). Remove only a confirmed stale lock.`,
        );
      }
      throw error;
    }
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      await handle.close();
      await unlink(lockPath);
    };
  }
}
