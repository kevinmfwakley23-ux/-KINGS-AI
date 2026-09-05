import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";

import {
  normalizeEngineeringOperations,
  normalizeProjectId,
  resolveAuthorizedEngineeringProjectPath,
} from "./engineering-service.mjs";
import {
  publicEngineeringJob,
  readEngineeringJob,
  saveEngineeringJob,
} from "./engineering-job-store.mjs";

const STDERR_LIMIT = 16 * 1024;

export async function startEngineeringJob(input, env = process.env) {
  if (input?.authorizeExecution !== true) {
    throw new Error("Explicit owner execution authorization is required.");
  }
  const request = {
    projectId: normalizeProjectId(input.projectId),
    projectPath: await resolveAuthorizedEngineeringProjectPath(input.projectPath, env),
    operations: normalizeEngineeringOperations(input.operations),
    authorizeExecution: true,
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: Number(input.timeoutMs) }),
  };

  const now = new Date().toISOString();
  const job = {
    id: `engineering-${randomUUID()}`,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    request,
  };
  await saveEngineeringJob(job, env);

  const worker = fork(new URL("./engineering-worker.mjs", import.meta.url), [], {
    env,
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let stderr = "";
  let settled = false;
  worker.stderr?.on("data", (chunk) => {
    if (stderr.length >= STDERR_LIMIT) return;
    stderr = `${stderr}${String(chunk)}`.slice(0, STDERR_LIMIT);
  });

  await saveEngineeringJob({ ...job, status: "running", updatedAt: new Date().toISOString() }, env);
  worker.send({ request });

  const finish = async (next) => {
    if (settled) return;
    settled = true;
    await saveEngineeringJob({
      ...job,
      ...next,
      updatedAt: new Date().toISOString(),
    }, env).catch((error) => console.error("K.I.N.G.S. owner engineering job persistence failed", error));
  };

  worker.on("message", (message) => {
    if (message?.ok === true) {
      finish({ status: message.result?.report?.status === "completed" ? "completed" : message.result?.report?.status === "blocked" ? "blocked" : "failed", result: message.result });
    } else {
      finish({ status: "failed", error: String(message?.error ?? "Engineering worker failed without an error message.") });
    }
  });
  worker.on("error", (error) => finish({ status: "failed", error: error.message }));
  worker.on("exit", (code, signal) => {
    if (settled) return;
    const detail = stderr.trim();
    finish({ status: "failed", error: `Engineering worker exited before returning evidence (code ${code ?? "unknown"}${signal ? `, signal ${signal}` : ""})${detail ? `: ${detail}` : "."}` });
  });

  return publicEngineeringJob({ ...job, status: "running", updatedAt: new Date().toISOString() });
}

export async function getEngineeringJob(id, env = process.env) {
  const job = await readEngineeringJob(id, env);
  return job ? publicEngineeringJob(job) : null;
}
