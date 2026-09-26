import { NextRequest, NextResponse } from "next/server";

import { searchCardApi } from "@/lib/card-api";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const startParam = request.nextUrl.searchParams.get("start") ?? "0";
  const start = Number(startParam);
  if (!query || query.length > 100 || !Number.isSafeInteger(start) || start < 0) {
    return NextResponse.json({ error: "请输入有效的搜索词。" }, { status: 400 });
  }
  try {
    return NextResponse.json(await searchCardApi(query, start));
  } catch (error) {
    console.error("Card search failed:", error);
    return NextResponse.json(
      { error: "卡片资料暂时不可用，请稍后重试。" },
      { status: error instanceof Error && error.name === "TimeoutError" ? 504 : 502 },
    );
  }
}
