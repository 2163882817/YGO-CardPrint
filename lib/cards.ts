export type CardVariant = "sc" | "jp" | "en" | "ygopro";

export const CARD_VARIANTS: { id: CardVariant; label: string; sublabel: string }[] = [
  { id: "sc", label: "简体中文", sublabel: "官方简中" },
  { id: "jp", label: "日本语", sublabel: "日文卡图" },
  { id: "en", label: "English", sublabel: "英文卡图" },
  { id: "ygopro", label: "YGOPro", sublabel: "通用图版" },
];

export interface Card {
  id: string;
  cid: number;
  name: string;
  scName?: string;
  jpName?: string;
  enName?: string;
  types?: string;
  description?: string;
  weight?: number;
}

export interface PrintItem {
  card: Card;
  variant: CardVariant;
  quantity: number;
}

export interface SearchResponse {
  result: Card[];
  next: number;
}

export const cardImage = (id: string, variant: CardVariant, thumbnail = true) =>
  `https://cdn.233.momobako.com/ygoimg/${variant}/${encodeURIComponent(id)}.webp${thumbnail ? "!half" : ""}`;

export const itemKey = (item: Pick<PrintItem, "card" | "variant">) =>
  `${item.card.cid}:${item.variant}`;
