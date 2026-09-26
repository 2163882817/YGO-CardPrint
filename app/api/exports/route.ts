import { generateExportDocument } from "@/lib/export-docx";
import { createExportJob, publicExportJob } from "@/lib/export-store";
import { CARD_VARIANTS, type Card, type CardVariant, type PrintItem } from "@/lib/cards";

const MAX_ITEMS = 120;
const MAX_BODY_LENGTH = 64 * 1024;

export const runtime = "nodejs";

function isCard(value: unknown): value is Card {
  if (typeof value !== "object" || value === null) return false;
  const card = value as Partial<Card>;
  return typeof card.id === "string" && /^\d{1,12}$/.test(card.id) &&
    Number.isInteger(card.cid) && (card.cid ?? 0) > 0 &&
    typeof card.name === "string" && card.name.trim().length > 0 && card.name.length <= 100;
}

function parseItems(value: unknown): PrintItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ITEMS) return null;
  const items: PrintItem[] = [];
  let total = 0;
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return null;
    const item = entry as Partial<PrintItem>;
    if (!isCard(item.card) || !CARD_VARIANTS.some((variant) => variant.id === item.variant) || !Number.isInteger(item.quantity) || (item.quantity ?? 0) < 1 || (item.quantity ?? 0) > 3) return null;
    total += item.quantity ?? 0;
    if (total > MAX_ITEMS) return null;
    items.push({
      card: { id: item.card.id, cid: item.card.cid, name: item.card.name.trim() },
      variant: item.variant as CardVariant,
      quantity: item.quantity as number,
    });
  }
  return items;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    if (Number(request.headers.get("content-length")) > MAX_BODY_LENGTH) {
      return Response.json({ error: "打印清单请求过大。" }, { status: 413 });
    }
    const text = await request.text();
    if (text.length > MAX_BODY_LENGTH) {
      return Response.json({ error: "打印清单请求过大。" }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "请求体必须是有效 JSON。" }, { status: 400 });
  }
  const items = parseItems(typeof body === "object" && body !== null ? (body as { items?: unknown }).items : undefined);
  if (!items) return Response.json({ error: "请提供 1～120 张有效的打印清单。" }, { status: 400 });

  try {
    const total = items.reduce((sum, item) => sum + item.quantity, 0);
    const job = await createExportJob(total);
    void generateExportDocument(job.id, items);
    return Response.json(publicExportJob(job), { status: 202 });
  } catch {
    return Response.json({ error: "导出服务暂时不可用，请稍后重试。" }, { status: 503 });
  }
}


