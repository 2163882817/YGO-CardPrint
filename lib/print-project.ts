import { createHash, randomBytes } from "node:crypto";

import { Prisma, type PrintProject } from "@prisma/client";

import { cardImage, type PrintItem } from "@/lib/cards";
import { getPrisma } from "@/lib/prisma";

export const PROJECT_COOKIE = "ygo_print_project";
export const PROJECT_IDLE_DAYS = 7;
export const PROJECT_LIFETIME_SECONDS = PROJECT_IDLE_DAYS * 24 * 60 * 60;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type StoredProject = Prisma.PrintProjectGetPayload<{
  include: { items: { include: { card: true } } };
}>;

export class ProjectConflictError extends Error {}

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function validProjectToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

export function projectCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: PROJECT_LIFETIME_SECONDS,
  };
}

function expiresAt() {
  return new Date(Date.now() + PROJECT_LIFETIME_SECONDS * 1000);
}

export function publicProject(project: StoredProject) {
  return {
    id: project.id,
    revision: project.revision,
    expiresAt: project.expiresAt.toISOString(),
    items: project.items
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        card: {
          id: item.card.password,
          cid: item.card.cid,
          name: item.card.name,
          scName: item.card.scName ?? undefined,
          jpName: item.card.jpName ?? undefined,
          enName: item.card.enName ?? undefined,
          types: item.card.types ?? undefined,
          description: item.card.description ?? undefined,
          weight: item.card.weight ?? undefined,
        },
        variant: item.variant,
        quantity: item.quantity,
      })),
  };
}

export async function getProjectByToken(token: unknown) {
  if (!validProjectToken(token)) return null;
  const client = getPrisma();
  const activeSince = new Date(Date.now() - PROJECT_LIFETIME_SECONDS * 1000);
  const project = await client.printProject.findFirst({
    where: { tokenHash: tokenHash(token), expiresAt: { gt: new Date() }, updatedAt: { gt: activeSince } },
    include: { items: { include: { card: true }, orderBy: { position: "asc" } } },
  });
  if (!project) return null;

  // 读取、恢复、导出都算一次活动，重新计算七天闲置期限。
  const refreshedCount = await client.printProject.updateMany({
    where: { id: project.id, expiresAt: { gt: new Date() }, updatedAt: { gt: activeSince } },
    data: { expiresAt: expiresAt() },
  });
  if (refreshedCount.count !== 1) return null;
  const refreshed = await client.printProject.findUniqueOrThrow({
    where: { id: project.id },
    include: { items: { include: { card: true }, orderBy: { position: "asc" } } },
  });
  return refreshed;
}

async function saveCards(tx: Prisma.TransactionClient, items: PrintItem[]) {
  for (const item of items) {
    const card = item.card;
    await tx.card.upsert({
      where: { cid: card.cid },
      create: {
        cid: card.cid,
        password: card.id,
        name: card.name,
        scName: card.scName,
        jpName: card.jpName,
        enName: card.enName,
        types: card.types,
        description: card.description,
        weight: card.weight,
      },
      update: {
        password: card.id,
        name: card.name,
        scName: card.scName,
        jpName: card.jpName,
        enName: card.enName,
        types: card.types,
        description: card.description,
        weight: card.weight,
      },
    });
    await tx.cardImage.upsert({
      where: { cardCid_variant: { cardCid: card.cid, variant: item.variant } },
      create: { cardCid: card.cid, variant: item.variant, sourceUrl: cardImage(card.id, item.variant, false) },
      update: { sourceUrl: cardImage(card.id, item.variant, false) },
    });
  }
}

export async function createProject(items: PrintItem[]) {
  const token = randomBytes(32).toString("base64url");
  const project = await getPrisma().$transaction(async (tx) => {
    await saveCards(tx, items);
    return tx.printProject.create({
      data: {
        tokenHash: tokenHash(token),
        expiresAt: expiresAt(),
        items: {
          create: items.map((item, position) => ({
            cardCid: item.card.cid,
            variant: item.variant,
            quantity: item.quantity,
            position,
          })),
        },
      },
      include: { items: { include: { card: true } } },
    });
  }, { timeout: 20_000 });
  return { token, project };
}

export async function saveProject(project: PrintProject, revision: number, items: PrintItem[]) {
  if (revision !== project.revision) throw new ProjectConflictError("打印清单已在其他页面更新。");
  const client = getPrisma();
  await client.$transaction(async (tx) => {
    const updated = await tx.printProject.updateMany({
      where: { id: project.id, revision, expiresAt: { gt: new Date() } },
      data: { revision: { increment: 1 }, expiresAt: expiresAt() },
    });
    if (updated.count !== 1) throw new ProjectConflictError("打印清单已在其他页面更新。");
    await saveCards(tx, items);
    await tx.printItem.deleteMany({ where: { projectId: project.id } });
    if (items.length) {
      await tx.printItem.createMany({
        data: items.map((item, position) => ({
          projectId: project.id,
          cardCid: item.card.cid,
          variant: item.variant,
          quantity: item.quantity,
          position,
        })),
      });
    }
  }, { timeout: 20_000 });
  const saved = await client.printProject.findUniqueOrThrow({
    where: { id: project.id },
    include: { items: { include: { card: true }, orderBy: { position: "asc" } } },
  });
  return publicProject(saved);
}
