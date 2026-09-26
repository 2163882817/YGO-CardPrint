import type { Card, SearchResponse } from "@/lib/cards";

const API_ENDPOINT = "https://ygocdb.com/api/v0/";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeCard(value: unknown): Card | null {
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

export async function searchCardApi(query: string, start = 0): Promise<SearchResponse> {
  const url = new URL(API_ENDPOINT);
  url.searchParams.set("search", query);
  if (start > 0) url.searchParams.set("start", String(start));
  const upstream = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 60 },
  });
  if (!upstream.ok) throw new Error(`Upstream returned ${upstream.status}`);
  const payload: unknown = await upstream.json();
  if (!isRecord(payload) || !Array.isArray(payload.result) ||
      typeof payload.next !== "number" || !Number.isSafeInteger(payload.next)) {
    throw new Error("Unexpected card API response");
  }
  return {
    result: payload.result.map(normalizeCard).filter((card): card is Card => card !== null),
    next: payload.next > 0 ? payload.next : 0,
  };
}

export function exactCardMatch(cards: Card[], id: string) {
  return cards.filter((card) => card.id === id);
}

export function sortNameMatches(cards: Card[], name: string) {
  const clean = name.trim().toLocaleLowerCase();
  return [...cards].sort((a, b) => {
    const aExact = [a.name, a.scName, a.jpName, a.enName].some((value) => value?.toLocaleLowerCase() === clean);
    const bExact = [b.name, b.scName, b.jpName, b.enName].some((value) => value?.toLocaleLowerCase() === clean);
    return Number(bExact) - Number(aExact);
  });
}
