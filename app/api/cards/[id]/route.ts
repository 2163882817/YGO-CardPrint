import { NextResponse } from "next/server";

import { exactCardMatch, searchCardApi } from "@/lib/card-api";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: "卡片密码格式无效。" }, { status: 400 });
  try {
    const payload = await searchCardApi(id);
    const card = exactCardMatch(payload.result, id)[0];
    if (!card) return NextResponse.json({ error: "没有找到对应卡片。" }, { status: 404 });
    return NextResponse.json(card, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    console.error("Card detail lookup failed:", error);
    return NextResponse.json({ error: "卡片详情暂时不可用，请稍后重试。" }, { status: 502 });
  }
}
