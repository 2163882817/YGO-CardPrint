import { CARD_VARIANTS, type Card, type PrintItem } from "@/lib/cards";

function isCard(value: unknown): value is Card {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<Card>;
  return typeof card.id === "string" && /^\d{1,12}$/.test(card.id) &&
    Number.isSafeInteger(card.cid) && (card.cid ?? 0) > 0 &&
    typeof card.name === "string" && card.name.trim().length > 0 && card.name.length <= 100;
}

export function parsePrintItems(value: unknown, allowEmpty = false): PrintItem[] | null {
  if (!Array.isArray(value) || value.length > 120 || (!allowEmpty && value.length === 0)) return null;
  const items: PrintItem[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const item = entry as Partial<PrintItem>;
    if (!isCard(item.card) || !CARD_VARIANTS.some((variant) => variant.id === item.variant) ||
      !Number.isInteger(item.quantity) || (item.quantity ?? 0) < 1 || (item.quantity ?? 0) > 3) return null;
    const key = item.card.cid + ":" + item.variant;
    if (seen.has(key)) return null;
    seen.add(key);
    total += item.quantity!;
    if (total > 120) return null;
    items.push({
      card: {
        id: item.card.id,
        cid: item.card.cid,
        name: item.card.name.trim(),
        scName: typeof item.card.scName === "string" ? item.card.scName.slice(0, 100) : undefined,
        jpName: typeof item.card.jpName === "string" ? item.card.jpName.slice(0, 100) : undefined,
        enName: typeof item.card.enName === "string" ? item.card.enName.slice(0, 100) : undefined,
        types: typeof item.card.types === "string" ? item.card.types.slice(0, 1000) : undefined,
        description: typeof item.card.description === "string" ? item.card.description.slice(0, 10000) : undefined,
        weight: Number.isInteger(item.card.weight) ? item.card.weight : undefined,
      },
      variant: item.variant!,
      quantity: item.quantity!,
    });
  }
  return items;
}
