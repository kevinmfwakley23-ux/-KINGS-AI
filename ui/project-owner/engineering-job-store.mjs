import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const JOB_ID = /^engineering-[a-f0-9-]{36}$/;

function dataRoot(env = process.env) {
  return resolve(String(env.KINGS_CODING_MACHINE_DATA_DIR ?? join(process.cwd(), ".kings-owner")).trim());
}

function jobPath(id, env = process.env) {
  if (!JOB_ID.test(String(id ?? ""))) throw new Error("Invalid owner engineering job id.");
  return join(dataRoot(env), "engineering-jobs", `${id}.json`);
}

export async function saveEngineeringJob(job, env = process.env) {
  const path = jobPath(job.id, env);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify(job, null, 2)}\n`;
  await writeFile(temp, payload, { encoding: "utf8", mode: 0o600 });
  await rename(temp, path);
  return clone(job);
}

export async function readEngineeringJob(id, env = process.env) {
  const path = jobPath(id, env);
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.id !== id) {
      throw new Error("Owner engineering job record is corrupt.");
    }
    return clone(parsed);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export function publicEngineeringJob(job) {
  return clone({
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    projectId: job.request.projectId,
    projectPath: job.request.projectPath,
    operations: [...job.request.operations],
    timeoutMs: job.request.timeoutMs ?? null,
    ...(job.result ? { result: job.result } : {}),
    ...(job.error ? { error: job.error } : {}),
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
