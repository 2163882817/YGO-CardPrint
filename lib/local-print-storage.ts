import type { PrintItem } from "@/lib/cards";
import { parsePrintItems } from "@/lib/print-items";

// Preserve the existing browser cache, including copies made by the cloud version.
export const LOCAL_PRINT_STORAGE_KEY = "cardprint:project:v1";

export function readLocalPrintItems(storage: Pick<Storage, "getItem">): PrintItem[] {
  const raw = storage.getItem(LOCAL_PRINT_STORAGE_KEY);
  if (!raw) return [];
  const saved = JSON.parse(raw) as { items?: unknown } | null;
  const items = parsePrintItems(saved?.items, true);
  if (!items) throw new Error("本机清单格式无效。");
  // Local lists no longer expire automatically after 30 days.
  return items;
}

export function writeLocalPrintItems(storage: Pick<Storage, "setItem">, items: PrintItem[]) {
  storage.setItem(LOCAL_PRINT_STORAGE_KEY, JSON.stringify({ items, updatedAt: Date.now() }));
}
