import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

import { PROJECT_IDLE_DAYS } from "@/lib/print-project";
import { CARD_IMAGE_CACHE_DAYS } from "@/lib/card-image-service";
import { deleteExpiredPrivateBlobs, usesBlobStorage } from "@/lib/blob-storage";
import { getPrisma } from "@/lib/prisma";

export const WORD_FILE_RETENTION_DAYS = 3;
const storageDirectory = join(process.cwd(), "storage", "exports");
const cardImageCacheDirectory = join(process.cwd(), "storage", "card-images");

function beforeDays(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** 清理过期项目、导出任务、孤立卡片和过期文件。 */
export async function cleanupExpiredData(includeBlobFiles = true) {
  const client = getPrisma();
  const now = new Date();
  const wordCutoff = beforeDays(WORD_FILE_RETENTION_DAYS);
  const projectCutoff = beforeDays(PROJECT_IDLE_DAYS);
  const cacheCutoff = beforeDays(CARD_IMAGE_CACHE_DAYS);

  const { deletedJobs, deletedProjects, deletedCards } = await client.$transaction(async (tx) => {
    const jobs = await tx.exportJob.deleteMany({
      where: { OR: [{ expiresAt: { lte: now } }, { updatedAt: { lte: wordCutoff } }] },
    });
    const projects = await tx.printProject.deleteMany({
      where: { OR: [{ expiresAt: { lte: now } }, { updatedAt: { lte: projectCutoff } }] },
    });
    const cards = await tx.card.deleteMany({ where: { printItems: { none: {} } } });
    return { deletedJobs: jobs.count, deletedProjects: projects.count, deletedCards: cards.count };
  });

  let deletedFiles = 0;
  if (usesBlobStorage()) {
    if (includeBlobFiles) deletedFiles = await deleteExpiredPrivateBlobs("exports/", wordCutoff);
  } else {
    try {
      const entries = await readdir(storageDirectory, { withFileTypes: true });
      await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
        const path = join(storageDirectory, entry.name);
        const details = await stat(path);
        if (details.mtime <= wordCutoff) {
          await unlink(path);
          deletedFiles += 1;
        }
      }));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }

  let deletedCacheFiles = 0;
  if (usesBlobStorage()) {
    if (includeBlobFiles) deletedCacheFiles = await deleteExpiredPrivateBlobs("card-images/", cacheCutoff);
  } else {
    try {
      const entries = await readdir(cardImageCacheDirectory, { withFileTypes: true });
      await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
        const path = join(cardImageCacheDirectory, entry.name);
        if ((await stat(path)).mtime <= cacheCutoff) {
          await unlink(path);
          deletedCacheFiles += 1;
        }
      }));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }

  return { deletedProjects, deletedJobs, deletedCards, deletedFiles, deletedCacheFiles };
}

export async function cleanupExpiredDataBestEffort() {
  try {
    return await cleanupExpiredData(!usesBlobStorage());
  } catch (error) {
    console.error("Expired data cleanup failed:", error);
    return null;
  }
}
