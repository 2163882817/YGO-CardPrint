import { buildExportDocument } from "@/lib/export-docx";
import { CardImageError } from "@/lib/card-image-service";
import { parsePrintItems } from "@/lib/print-items";
import { PROJECT_COOKIE, getProjectByToken } from "@/lib/print-project";
import { NextRequest } from "next/server";

const MAX_ITEMS = 120;
// Form encoding expands non-ASCII card names; keep the direct fallback usable for the full 120-card limit.
const MAX_BODY_LENGTH = 256 * 1024;
const DOWNLOAD_COOKIE = "ygo_export_download";
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const runtime = "nodejs";
export const maxDuration = 300;

function errorResponse(error: string, status: number, code: string, requestId?: string | null) {
  return Response.json({ error, code }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Export-Error-Code": code,
      "X-Content-Type-Options": "nosniff",
      ...(requestId ? { "Set-Cookie": `${DOWNLOAD_COOKIE}=${requestId}:error:${code}; Path=/; Max-Age=120; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}` } : {}),
    },
  });
}

export async function POST(request: NextRequest) {
  let itemsValue: unknown;
  const queryRequestId = request.nextUrl.searchParams.get("requestId");
  let requestId: string | null = queryRequestId && REQUEST_ID_PATTERN.test(queryRequestId) ? queryRequestId : null;
  try {
    if (Number(request.headers.get("content-length")) > MAX_BODY_LENGTH) {
      return errorResponse("打印清单请求过大。", 413, "REQUEST_TOO_LARGE", requestId);
    }
    const text = await request.text();
    if (text.length > MAX_BODY_LENGTH) return errorResponse("打印清单请求过大。", 413, "REQUEST_TOO_LARGE", requestId);
    const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType === "application/json") {
      const body = JSON.parse(text) as { items?: unknown };
      itemsValue = body && typeof body === "object" ? body.items : undefined;
    } else if (contentType === "application/x-www-form-urlencoded") {
      const form = new URLSearchParams(text);
      const formRequestId = form.get("requestId");
      if (!formRequestId || !REQUEST_ID_PATTERN.test(formRequestId) || (requestId && formRequestId !== requestId)) {
        return errorResponse("下载请求无效，请重新导出。", 400, "INVALID_REQUEST", requestId);
      }
      requestId = formRequestId;
      itemsValue = JSON.parse(form.get("items") ?? "null");
    } else {
      return errorResponse("不支持的请求格式。", 415, "UNSUPPORTED_MEDIA_TYPE", requestId);
    }
  } catch {
    return errorResponse("打印清单格式无效，请重新导出。", 400, "INVALID_REQUEST", requestId);
  }
  const items = parsePrintItems(itemsValue);
  if (!items || items.length > MAX_ITEMS) return errorResponse("请提供 1～120 张有效的打印清单。", 400, "INVALID_ITEMS", requestId);

  try {
    const project = await getProjectByToken(request.cookies.get(PROJECT_COOKIE)?.value);
    if (!project) return errorResponse("打印项目已失效，请刷新页面后重试。", 401, "PROJECT_EXPIRED", requestId);
    const saved = project.items.sort((a, b) => a.position - b.position);
    if (saved.length !== items.length || saved.some((item, index) =>
      item.cardCid !== items[index].card.cid || item.card.password !== items[index].card.id ||
      item.variant !== items[index].variant || item.quantity !== items[index].quantity)) {
      return errorResponse("云端清单尚未同步，请稍后重试。", 409, "PROJECT_CONFLICT", requestId);
    }
    const { file, fileName, warnings } = await buildExportDocument(items);
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= file.byteLength) return controller.close();
        const end = Math.min(offset + 64 * 1024, file.byteLength);
        controller.enqueue(new Uint8Array(file.subarray(offset, end)));
        offset = end;
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Length": String(file.byteLength),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Low-Resolution-Count": String(warnings.length),
        ...(requestId ? { "Set-Cookie": `${DOWNLOAD_COOKIE}=${requestId}; Path=/; Max-Age=120; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}` } : {}),
      },
    });
  } catch (error) {
    console.error("Direct export failed:", error);
    return errorResponse(error instanceof CardImageError ? error.message : "Word 文件生成失败，请稍后重试。",
      503, error instanceof CardImageError ? "IMAGE_UNAVAILABLE" : "EXPORT_GENERATION_FAILED", requestId);
  }
}
