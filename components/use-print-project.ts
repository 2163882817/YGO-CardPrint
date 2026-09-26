"use client";

import { useEffect, useRef, useState } from "react";

import { CARD_VARIANTS, type PrintItem } from "@/lib/cards";

const STORAGE_KEY = "cardprint:project:v1";
const TOKEN_KEY = "cardprint:recovery:v1";
const STORAGE_LIFETIME = 30 * 24 * 60 * 60 * 1000;

type ProjectStatus = "loading" | "synced" | "saving" | "offline" | "conflict";
type ProjectResponse = {
  id: string;
  revision: number;
  items: PrintItem[];
  recoveryToken?: string;
  error?: string;
};

function isSavedItem(value: unknown): value is PrintItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PrintItem>;
  return Boolean(item.card && typeof item.card === "object" &&
    /^\d{1,12}$/.test(String(item.card.id)) && Number.isInteger(item.card.cid) &&
    typeof item.card.name === "string" &&
    CARD_VARIANTS.some((variant) => variant.id === item.variant) &&
    Number.isInteger(item.quantity) && (item.quantity ?? 0) >= 1 && (item.quantity ?? 0) <= 3);
}

function cachedItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const saved = JSON.parse(raw) as { updatedAt?: number; items?: unknown };
    if (typeof saved.updatedAt === "number" &&
      Date.now() - saved.updatedAt < STORAGE_LIFETIME && Array.isArray(saved.items)) {
      return saved.items.filter(isSavedItem).slice(0, 120);
    }
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return [];
}

function cachedToken() {
  try {
    const saved = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "null") as
      { id?: string; token?: string } | null;
    return typeof saved?.id === "string" && typeof saved.token === "string"
      ? { id: saved.id, token: saved.token }
      : null;
  } catch {
    return null;
  }
}

async function projectRequest(url: string, options?: RequestInit): Promise<ProjectResponse> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const payload = await response.json() as ProjectResponse;
  if (!response.ok) throw Object.assign(new Error(payload.error ?? "云端清单暂时不可用。"), { status: response.status });
  return payload;
}

export function usePrintProject() {
  const [items, setItems] = useState<PrintItem[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [status, setStatus] = useState<ProjectStatus>("loading");
  const [recoveryToken, setRecoveryToken] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const revision = useRef(0);
  const ready = useRef(false);
  const skipInitialSync = useRef(false);
  const changeNumber = useRef(0);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      const local = cachedItems();
      const stored = cachedToken();
      const linkToken = new URLSearchParams(window.location.hash.slice(1)).get("project");
      try {
        let project: ProjectResponse | null = null;
        let token = "";
        if (linkToken) {
          project = await projectRequest("/api/print-project/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: linkToken }),
          });
          token = linkToken;
          window.history.replaceState(null, "", window.location.pathname + window.location.search + "#print-tray");
        } else {
          try {
            project = await projectRequest("/api/print-project");
            if (stored?.id === project.id) token = stored.token;
          } catch (error) {
            if (!(error instanceof Error && "status" in error && error.status === 404)) throw error;
            if (stored) {
              try {
                project = await projectRequest("/api/print-project/restore", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ token: stored.token }),
                });
                token = stored.token;
              } catch {
                localStorage.removeItem(TOKEN_KEY);
              }
            }
            if (!project) {
              project = await projectRequest("/api/print-project", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items: local }),
              });
              token = project.recoveryToken ?? "";
            }
          }
        }
        if (!active || !project) return;
        if (token) localStorage.setItem(TOKEN_KEY, JSON.stringify({ id: project.id, token }));
        else localStorage.removeItem(TOKEN_KEY);
        revision.current = project.revision;
        ready.current = true;
        skipInitialSync.current = true;
        setItems(project.items.filter(isSavedItem));
        setRecoveryToken(token);
        setStatus("synced");
      } catch {
        if (!active) return;
        setItems(local);
        setStatus("offline");
      } finally {
        if (active) setStorageReady(true);
      }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, updatedAt: Date.now() }));
    if (!ready.current) return;
    if (skipInitialSync.current) {
      skipInitialSync.current = false;
      return;
    }
    const currentChange = ++changeNumber.current;
    setStatus("saving");
    const timer = window.setTimeout(() => {
      const snapshot = items;
      queue.current = queue.current.catch(() => {}).then(async () => {
        if (!ready.current) return;
        try {
          const project = await projectRequest("/api/print-project", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ revision: revision.current, items: snapshot }),
          });
          revision.current = project.revision;
          if (currentChange === changeNumber.current) setStatus("synced");
        } catch (error) {
          if (error instanceof Error && "status" in error && error.status === 409) {
            ready.current = false;
            setStatus("conflict");
          } else setStatus("offline");
        }
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [items, storageReady, retryCount]);

  const retry = () => {
    if (!ready.current || status === "conflict") window.location.reload();
    else setRetryCount((count) => count + 1);
  };

  return { items, setItems, storageReady, status, recoveryToken, retry };
}
