import { NextResponse } from "next/server";

import { exactCardMatch, searchCardApi, sortNameMatches } from "@/lib/card-api";
import type { Card } from "@/lib/cards";

export const runtime = "nodejs";
const MAX_INPUTS = 100;
const MAX_INPUT_LENGTH = 100;

type ResolveInput = { value: string; kind: "password" | "name" };

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string")
    .map((item) => item.trim()).filter(Boolean);
}

function parseInputs(body: Record<string, unknown>) {
  const inputs: ResolveInput[] = [];
  for (const value of stringList(body.passwords)) inputs.push({ value, kind: "password" });
  for (const value of stringList(body.names)) inputs.push({ value, kind: "name" });
  for (const value of stringList(body.inputs)) {
    inputs.push({ value, kind: /^\d{1,12}$/.test(value) ? "password" : "name" });
  }
  return inputs;
}

async function resolveOne(input: ResolveInput) {
  try {
    const payload = await searchCardApi(input.value);
    const matches: Card[] = input.kind === "password"
      ? exactCardMatch(payload.result, input.value)
      : sortNameMatches(payload.result, input.value);
    const hasMore = input.kind === "name" && payload.next > 0;
    return {
      input: input.value,
      kind: input.kind,
      matches,
      resolved: matches.length === 1 && !hasMore ? matches[0] : null,
      requiresConfirmation: matches.length > 1 || hasMore,
      hasMore,
      error: null,
    };
  } catch (error) {
    console.error(`Card resolve failed for ${input.value}:`, error);
    return {
      input: input.value,
      kind: input.kind,
      matches: [] as Card[],
      resolved: null,
      requiresConfirmation: false,
      hasMore: false,
      error: "查询失败，请稍后重试此项。",
    };
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    if (Number(request.headers.get("content-length")) > 64 * 1024) {
      return NextResponse.json({ error: "批量解析请求过大。" }, { status: 413 });
    }
    const text = await request.text();
    if (text.length > 64 * 1024) return NextResponse.json({ error: "批量解析请求过大。" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "请求体必须是有效 JSON。" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "批量解析参数无效。" }, { status: 400 });
  }
  const inputs = parseInputs(body as Record<string, unknown>);
  if (!inputs.length || inputs.length > MAX_INPUTS || inputs.some((item) => item.value.length > MAX_INPUT_LENGTH)) {
    return NextResponse.json({ error: `请提供 1～${MAX_INPUTS} 个有效卡名或卡片密码。` }, { status: 400 });
  }
  try {
    const results = [];
    for (let offset = 0; offset < inputs.length; offset += 5) {
      results.push(...await Promise.all(inputs.slice(offset, offset + 5).map(resolveOne)));
    }
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Card batch resolve failed:", error);
    return NextResponse.json({ error: "批量匹配暂时不可用，请稍后重试。" }, { status: 502 });
  }
}
