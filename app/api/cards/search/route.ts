import { NextRequest, NextResponse } from "next/server";
import type { Card, SearchResponse } from "@/lib/cards";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeCard(value: unknown): Card | null {
  if (!isRecord(value) || !Number.isInteger(value.cid) ||
      (typeof value.id !== "string" && typeof value.id !== "number")) return null;

  const id = String(value.id);
  if (!/^\d{1,12}$/.test(id)) return null;
  const text = isRecord(value.text) ? value.text : {};
  const name = optionalText(value.cn_name) ?? optionalText(text.name) ??
    optionalText(value.sc_name) ?? optionalText(value.jp_name) ??
    optionalText(value.en_name) ?? `卡片 ${id}`;

  return {
    id,
    cid: value.cid as number,
    name,
    scName: optionalText(value.sc_name) ?? optionalText(text.sc_name),
    jpName: optionalText(value.jp_name) ?? optionalText(text.jp_name),
    enName: optionalText(value.en_name) ?? optionalText(text.en_name),
    types: optionalText(text.types),
    description: optionalText(text.desc),
    weight: typeof value.weight === "number" ? value.weight : undefined,
  };
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const startParam = request.nextUrl.searchParams.get("start") ?? "0";
  const start = Number(startParam);

  if (!query || query.length > 100 || !Number.isSafeInteger(start) || start < 0) {
    return NextResponse.json({ error: "请输入有效的搜索词。" }, { status: 400 });
  }

  const url = new URL("https://ygocdb.com/api/v0/");
  url.searchParams.set("search", query);
  if (start > 0) url.searchParams.set("start", String(start));

  try {
    const upstream = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 60 },
    });
    if (!upstream.ok) throw new Error(`Upstream returned ${upstream.status}`);
    const payload: unknown = await upstream.json();
    if (!isRecord(payload) || !Array.isArray(payload.result) ||
        typeof payload.next !== "number" || !Number.isSafeInteger(payload.next)) {
      throw new Error("Unexpected search response");
    }
    const response: SearchResponse = {
      result: payload.result.map(normalizeCard).filter((card): card is Card => card !== null),
      next: payload.next > 0 ? payload.next : 0,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Card search failed:", error);
    return NextResponse.json(
      { error: "卡片资料暂时不可用，请稍后重试。" },
      { status: error instanceof Error && error.name === "TimeoutError" ? 504 : 502 },
    );
  }
}
