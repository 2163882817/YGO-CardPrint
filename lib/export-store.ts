import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Prisma, ExportStatus } from "@prisma/client";

import type { PrintItem } from "@/lib/cards";
import { getPrisma } from "@/lib/prisma";

const directory = join(process.cwd(), "storage", "exports");
const JOB_TTL_MS = 30 * 60 * 1000;
const MAX_JOBS = 100;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function filePath(id: string) {
  return join(directory, id + ".docx");
}

async function pruneExpiredJobs() {
  const client = getPrisma();
  const expired = await client.exportJob.findMany({
    where: { expiresAt: { lte: new Date() } },
    select: { id: true },
    take: 100,
  });
  if (expired.length) {
    await client.exportJob.deleteMany({ where: { id: { in: expired.map((job) => job.id) } } });
    await Promise.allSettled(expired.map((job) => unlink(filePath(job.id))));
  }
  if (await client.exportJob.count({ where: { expiresAt: { gt: new Date() } } }) >= MAX_JOBS) {
    throw new Error("导出任务暂时较多，请稍后重试。");
  }
}

export async function createExportJob(projectId: string, items: PrintItem[]) {
  await pruneExpiredJobs();
  const total = items.reduce((sum, item) => sum + item.quantity, 0);
  return getPrisma().exportJob.create({
    data: {
      id: randomUUID(),
      projectId,
      total,
      pageCount: Math.ceil(total / 9),
      expiresAt: new Date(Date.now() + JOB_TTL_MS),
      itemsSnapshot: items.map(({ card, variant, quantity }) => ({
        card: { id: card.id, cid: card.cid, name: card.name },
        variant,
        quantity,
      })) as Prisma.InputJsonValue,
    },
  });
}

export async function getExportJob(id: string, projectId: string) {
  if (!ID_PATTERN.test(id)) return null;
  const client = getPrisma();
  const job = await client.exportJob.findFirst({
    where: { id, projectId, expiresAt: { gt: new Date() } },
  });
  if (job?.status === ExportStatus.PROCESSING &&
    Date.now() - job.updatedAt.getTime() > 15 * 60 * 1000) {
    return client.exportJob.update({
      where: { id },
      data: { status: ExportStatus.FAILED, error: "导出任务中断，请重新提交。" },
    });
  }
  return job;
}

export async function updateExportJob(
  id: string,
  update: { status: "processing" | "failed"; error?: string },
) {
  await getPrisma().exportJob.update({
    where: { id },
    data: {
      status: update.status === "processing" ? ExportStatus.PROCESSING : ExportStatus.FAILED,
      error: update.error,
    },
  });
}

export async function completeExportJob(id: string, file: Buffer, fileName: string) {
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, id + "." + randomUUID() + ".tmp");
  try {
    await writeFile(temporary, file);
    await rename(temporary, filePath(id));
    await getPrisma().exportJob.update({
      where: { id },
      data: { status: ExportStatus.COMPLETED, fileName, fileKey: id + ".docx" },
    });
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

export function publicExportJob(job: Awaited<ReturnType<typeof createExportJob>>) {
  return {
    id: job.id,
    status: job.status.toLowerCase(),
    total: job.total,
    pageCount: job.pageCount,
    fileName: job.fileName,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    downloadUrl: job.status === ExportStatus.COMPLETED ? "/api/exports/" + job.id + "/download" : undefined,
  };
}
