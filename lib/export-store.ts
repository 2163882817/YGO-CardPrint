import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ExportStatus = "queued" | "processing" | "completed" | "failed";

export interface ExportJob {
  id: string;
  status: ExportStatus;
  total: number;
  pageCount: number;
  fileName?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const directory = join(process.cwd(), "storage", "exports");
const JOB_TTL_MS = 30 * 60 * 1000;
const MAX_JOBS = 100;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function jobPath(id: string) {
  return join(directory, id + ".json");
}

function filePath(id: string) {
  return join(directory, id + ".docx");
}

async function removeJob(id: string) {
  await Promise.allSettled([unlink(jobPath(id)), unlink(filePath(id))]);
}

async function saveJob(job: ExportJob) {
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, job.id + "." + randomUUID() + ".tmp");
  try {
    await writeFile(temporary, JSON.stringify(job), "utf8");
    await rename(temporary, jobPath(job.id));
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

async function pruneExpiredJobs() {
  await mkdir(directory, { recursive: true });
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  const jobs = await Promise.all(names.map((name) => getExportJob(name.slice(0, -5))));
  if (jobs.filter(Boolean).length >= MAX_JOBS) {
    throw new Error("导出任务暂时较多，请稍后重试。");
  }
}

export async function createExportJob(total: number) {
  await pruneExpiredJobs();
  const timestamp = new Date().toISOString();
  const job: ExportJob = {
    id: randomUUID(),
    status: "queued",
    total,
    pageCount: Math.ceil(total / 9),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await saveJob(job);
  return job;
}

export async function getExportJob(id: string): Promise<ExportJob | undefined> {
  if (!ID_PATTERN.test(id)) return undefined;
  try {
    const job = JSON.parse(await readFile(jobPath(id), "utf8")) as ExportJob;
    if (job.id !== id) return undefined;
    if (Date.now() - Date.parse(job.createdAt) >= JOB_TTL_MS) {
      await removeJob(id);
      return undefined;
    }
    return job;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function updateExportJob(id: string, update: Partial<Pick<ExportJob, "status" | "error" | "fileName">>) {
  const current = await getExportJob(id);
  if (!current) return;
  await saveJob({ ...current, ...update, updatedAt: new Date().toISOString() });
}

export async function completeExportJob(id: string, file: Buffer, fileName: string) {
  const temporary = join(directory, id + "." + randomUUID() + ".tmp");
  try {
    await writeFile(temporary, file);
    await rename(temporary, filePath(id));
    await updateExportJob(id, { status: "completed", fileName });
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

export async function readExportFile(id: string) {
  if (!ID_PATTERN.test(id)) return undefined;
  try {
    return await readFile(filePath(id));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export function publicExportJob(job: ExportJob) {
  return {
    ...job,
    downloadUrl: job.status === "completed" ? "/api/exports/" + job.id + "/download" : undefined,
  };
}
