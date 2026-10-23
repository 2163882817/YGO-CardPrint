"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

import type { PrintItem } from "@/lib/cards";
import { readLocalPrintItems, writeLocalPrintItems } from "@/lib/local-print-storage";

type ProjectStatus = "loading" | "saved" | "unavailable";

function persistItems(items: PrintItem[]): ProjectStatus {
  try {
    writeLocalPrintItems(localStorage, items);
    return "saved";
  } catch {
    return "unavailable";
  }
}

export function usePrintProject() {
  const [items, updateItems] = useState<PrintItem[]>([]);
  const currentItems = useRef<PrintItem[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [status, setStatus] = useState<ProjectStatus>("loading");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const local = readLocalPrintItems(localStorage);
        currentItems.current = local;
        updateItems(local);
        setStatus(persistItems(local));
      } catch {
        // Storage restrictions or damaged data must not block this session.
        setStatus("unavailable");
      }
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Save in the user action itself, so an immediate refresh does not lose edits.
  const setItems = useCallback((action: SetStateAction<PrintItem[]>) => {
    const next = typeof action === "function" ? action(currentItems.current) : action;
    currentItems.current = next;
    updateItems(next);
    setStatus(persistItems(next));
  }, []);

  const save = useCallback(() => setStatus(persistItems(currentItems.current)), []);

  return { items, setItems, storageReady, status, retry: save };
}
