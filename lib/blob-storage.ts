import { BlobStoreSuspendedError, del, get, list, put } from "@vercel/blob";

export const SUSPENDED_BLOB_ERROR = "Vercel Blob 存储已暂停，已切换为直接下载模式。";

export function isSuspendedBlobStore(error: unknown) {
  return error instanceof BlobStoreSuspendedError ||
    (error instanceof Error && /store has been suspended/i.test(error.message));
}

export async function isBlobStoreSuspended() {
  if (!usesBlobStorage()) return false;
  try {
    await list({ prefix: "exports/", limit: 1 });
    return false;
  } catch (error) {
    if (isSuspendedBlobStore(error)) return true;
    throw error;
  }
}

export function usesBlobStorage() {
  // Vercel Blob can use either the classic read-write token or the
  // project-linked OIDC setup, which exposes BLOB_STORE_ID.
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.BLOB_STORE_ID && (process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN)));
}

export function assertExportStorageConfigured() {
  if (process.env.VERCEL && !usesBlobStorage()) {
    throw new Error("线上 Word 导出需要配置 Vercel Blob，并关联 BLOB_STORE_ID 或 BLOB_READ_WRITE_TOKEN。");
  }
}

export async function readPrivateBlob(pathname: string) {
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200) return null;
  return {
    data: Buffer.from(await new Response(result.stream).arrayBuffer()),
    uploadedAt: result.blob.uploadedAt,
  };
}

export async function writePrivateBlob(pathname: string, data: Buffer, contentType: string) {
  await put(pathname, data, {
    access: "private",
    allowOverwrite: true,
    contentType,
  });
}

export async function deletePrivateBlob(pathname: string) {
  await del(pathname);
}

export async function deleteExpiredPrivateBlobs(prefix: string, cutoff: Date) {
  let cursor: string | undefined;
  const expired: string[] = [];
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    expired.push(...page.blobs.filter((blob) => blob.uploadedAt <= cutoff).map((blob) => blob.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  for (let offset = 0; offset < expired.length; offset += 100) {
    await del(expired.slice(offset, offset + 100));
  }
  return expired.length;
}
