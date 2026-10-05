import { buildExportDocument } from "@/lib/export-docx";
import { parsePrintItems } from "@/lib/print-items";
import { PROJECT_COOKIE, getProjectByToken } from "@/lib/print-project";
import { NextRequest } from "next/server";

const MAX_ITEMS = 120;
const MAX_BODY_LENGTH = 64 * 1024;

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    if (Number(request.headers.get("content-length")) > MAX_BODY_LENGTH) {
      return Response.json({ error: "打印清单请求过大。" }, { status: 413 });
    }
    const text = await request.text();
    if (text.length > MAX_BODY_LENGTH) return Response.json({ error: "打印清单请求过大。" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "请求体必须是有效 JSON。" }, { status: 400 });
  }
  const items = parsePrintItems(typeof body === "object" && body !== null ? (body as { items?: unknown }).items : undefined);
  if (!items || items.length > MAX_ITEMS) return Response.json({ error: "请提供 1～120 张有效的打印清单。" }, { status: 400 });

  try {
    const project = await getProjectByToken(request.cookies.get(PROJECT_COOKIE)?.value);
    if (!project) return Response.json({ error: "打印项目已失效，请刷新页面后重试。" }, { status: 401 });
    const saved = project.items.sort((a, b) => a.position - b.position);
    if (saved.length !== items.length || saved.some((item, index) =>
      item.cardCid !== items[index].card.cid || item.card.password !== items[index].card.id ||
      item.variant !== items[index].variant || item.quantity !== items[index].quantity)) {
      return Response.json({ error: "云端清单尚未同步，请稍后重试。" }, { status: 409 });
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
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
        "X-Low-Resolution-Count": String(warnings.length),
      },
    });
  } catch (error) {
    console.error("Direct export failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Word 文件生成失败，请稍后重试。" }, { status: 503 });
  }
}
