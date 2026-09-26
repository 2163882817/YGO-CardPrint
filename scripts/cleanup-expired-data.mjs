import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const now = new Date();
const projectCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
const wordCutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
const storageDirectory = join(process.cwd(), "storage", "exports");

try {
  const { projectResult, jobResult, cardResult } = await prisma.$transaction(async (tx) => {
    const jobResult = await tx.exportJob.deleteMany({
      where: { OR: [{ expiresAt: { lte: now } }, { updatedAt: { lte: wordCutoff } }] },
    });
    const projectResult = await tx.printProject.deleteMany({
      where: { OR: [{ expiresAt: { lte: now } }, { updatedAt: { lte: projectCutoff } }] },
    });
    const cardResult = await tx.card.deleteMany({ where: { printItems: { none: {} } } });
    return { jobResult, projectResult, cardResult };
  });
  let fileCount = 0;
  try {
    const entries = await readdir(storageDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const path = join(storageDirectory, entry.name);
      if ((await stat(path)).mtime <= wordCutoff) {
        await unlink(path);
        fileCount += 1;
      }
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  console.log(JSON.stringify({ deletedProjects: projectResult.count, deletedJobs: jobResult.count, deletedCards: cardResult.count, deletedFiles: fileCount }));
} finally {
  await prisma.$disconnect();
}
