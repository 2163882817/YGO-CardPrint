import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

import { CARD_VARIANTS, cardImage, type CardVariant } from "@/lib/cards";
import { getPrisma } from "@/lib/prisma";

export const CARD_IMAGE_CDN_HOST = "cdn.233.momobako.com";
export const CARD_IMAGE_CACHE_DAYS = 30;
const CARD_IMAGE_CACHE_TTL_MS = CARD_IMAGE_CACHE_DAYS * 24 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 24_000_000;
const MIN_WIDTH = 400;
const MIN_HEIGHT = 580;
const RECOMMENDED_WIDTH = 697;
const RECOMMENDED_HEIGHT = 1016;
const MAX_ATTEMPTS = 3;
const cacheDirectory = join(process.cwd(), "storage", "card-images");
const allowedFormats = new Set(["jpeg", "png", "webp"]);

export class CardImageError extends Error {
  constructor(message: string, readonly kind: "missing" | "invalid") {
    super(message);
    this.name = "CardImageError";
  }
}

export type ValidatedCardImage = {
  data: Buffer;
  width: number;
  height: number;
  format: "jpeg" | "png" | "webp";
  checksum: string;
  warnings: string[];
  cacheHit: boolean;
};

function isValidCardId(id: string) {
  return /^\d{1,12}$/.test(id);
}

export function isAllowedCardImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === CARD_IMAGE_CDN_HOST &&
      url.search === "" && url.hash === "" &&
      /^\/ygoimg\/(sc|jp|en|ygopro)\/\d{1,12}\.webp$/.test(url.pathname);
  } catch {
    return false;
  }
}

function sourceUrl(id: string, variant: CardVariant) {
  if (!isValidCardId(id) || !CARD_VARIANTS.some((item) => item.id === variant)) {
    throw new CardImageError("卡图参数无效。", "invalid");
  }
  const url = cardImage(id, variant, false);
  if (!isAllowedCardImageUrl(url)) throw new CardImageError("卡图来源不在允许的百鸽 CDN 范围内。", "invalid");
  return url;
}

function cachePath(id: string, variant: CardVariant) {
  return join(cacheDirectory, `${id}-${variant}.bin`);
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function readResponseBytes(response: Response, label: string) {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (!contentType || !new Set(["image/jpeg", "image/png", "image/webp"]).has(contentType)) {
    throw new CardImageError(`${label}返回的格式不是 JPEG、PNG 或 WebP。`, "invalid");
  }
  if (!response.body || Number(response.headers.get("content-length")) > MAX_IMAGE_BYTES) {
    throw new CardImageError(`${label}大小超过限制或响应为空。`, "invalid");
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) throw new CardImageError(`${label}大小超过 12 MB 限制。`, "invalid");
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new CardImageError(`${label}返回空文件。`, "missing");
  return { data: Buffer.concat(chunks, total), contentType };
}

async function fetchFromCdn(url: string, label: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "manual",
        cache: "no-store",
        headers: { Accept: "image/webp,image/png,image/jpeg" },
      });
      if (response.status >= 300 && response.status < 400) {
        throw new CardImageError(`${label}发生了不允许的 CDN 重定向。`, "invalid");
      }
      if (!response.ok) throw new CardImageError(`${label}下载失败（HTTP ${response.status}）。`, "missing");
      return await readResponseBytes(response, label);
    } catch (error) {
      lastError = error;
      if (error instanceof CardImageError && error.kind === "invalid") throw error;
      if (attempt < MAX_ATTEMPTS) await wait(350 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  if (lastError instanceof CardImageError) throw lastError;
  const message = lastError instanceof Error ? lastError.message : "网络请求失败";
  throw new CardImageError(`${label}下载失败：${message}（已重试 ${MAX_ATTEMPTS} 次）。`, "missing");
}

async function inspectImage(data: Buffer, label: string, contentType?: string) {
  let metadata;
  try {
    metadata = await sharp(data).metadata();
    if (!metadata.width || !metadata.height || !metadata.format ||
      !allowedFormats.has(metadata.format) || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
      throw new Error("metadata invalid");
    }
    if (contentType && contentType !== `image/${metadata.format === "jpeg" ? "jpeg" : metadata.format}`) {
      throw new Error("content type mismatch");
    }
    await sharp(data).rotate().jpeg({ quality: 80 }).toBuffer();
  } catch {
    throw new CardImageError(`${label}无法正常解码或图片格式无效。`, "invalid");
  }
  if (metadata.width < MIN_WIDTH || metadata.height < MIN_HEIGHT) {
    throw new CardImageError(`${label}分辨率过低（${metadata.width} × ${metadata.height} px）。`, "invalid");
  }
  if (Math.abs(metadata.width / metadata.height - 59 / 86) > 0.05) {
    throw new CardImageError(`${label}图片比例不符合标准卡尺寸。`, "invalid");
  }
  const warnings = metadata.width < RECOMMENDED_WIDTH || metadata.height < RECOMMENDED_HEIGHT
    ? [`${label}分辨率为 ${metadata.width} × ${metadata.height} px，低于建议的 ${RECOMMENDED_WIDTH} × ${RECOMMENDED_HEIGHT} px，打印可能不够清晰。`]
    : [];
  return { width: metadata.width, height: metadata.height, format: metadata.format as "jpeg" | "png" | "webp", warnings };
}

async function updateImageRecord(cid: number, variant: CardVariant, data: {
  status: "READY" | "MISSING" | "INVALID";
  width?: number;
  height?: number;
  checksum?: string;
}) {
  await getPrisma().cardImage.updateMany({
    where: { cardCid: cid, variant },
    data: { ...data, checkedAt: new Date() },
  }).catch((error) => console.error("Card image metadata update failed:", error));
}

export async function validateAndCacheCardImage(id: string, cid: number, variant: CardVariant): Promise<ValidatedCardImage> {
  const url = sourceUrl(id, variant);
  const label = `卡片 ${id} 的 ${variant} 图版`;
  const path = cachePath(id, variant);
  let data: Buffer | undefined;
  let cacheHit = false;
  try {
    const details = await stat(path);
    if (Date.now() - details.mtimeMs <= CARD_IMAGE_CACHE_TTL_MS) {
      data = await readFile(path);
      cacheHit = true;
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }

  let inspected;
  try {
    if (data) inspected = await inspectImage(data, label);
  } catch {
    await unlink(path).catch(() => {});
    data = undefined;
    cacheHit = false;
  }
  if (!data) {
    try {
      const downloaded = await fetchFromCdn(url, label);
      data = downloaded.data;
      inspected = await inspectImage(data, label, downloaded.contentType);
      await mkdir(cacheDirectory, { recursive: true });
      const temporary = join(cacheDirectory, `${id}-${variant}.${randomUUID()}.tmp`);
      await writeFile(temporary, data);
      await rename(temporary, path);
    } catch (error) {
      await updateImageRecord(cid, variant, { status: error instanceof CardImageError && error.kind === "invalid" ? "INVALID" : "MISSING" });
      throw error;
    }
  }

  if (!inspected) {
    throw new CardImageError(`${label}校验失败。`, "invalid");
  }

  const checksum = createHash("sha256").update(data).digest("hex");
  await updateImageRecord(cid, variant, {
    status: "READY",
    width: inspected.width,
    height: inspected.height,
    checksum,
  });
  return { data, ...inspected, checksum, cacheHit, warnings: inspected.warnings };
}
