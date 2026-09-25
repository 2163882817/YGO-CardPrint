"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle, ArrowDown, ArrowRight, ArrowUp, Check, ChevronLeft, ChevronRight,
  FileDown, Layers3, LoaderCircle, Minus, Plus, Search, Trash2, X,
} from "lucide-react";
import {
  CARD_VARIANTS, cardImage, itemKey,
  type Card, type CardVariant, type PrintItem, type SearchResponse,
} from "@/lib/cards";

type ImageStatus = "loading" | "ready" | "missing";
const STORAGE_KEY = "cardprint:project:v1";
const STORAGE_LIFETIME = 30 * 24 * 60 * 60 * 1000;
const suggested = ["青眼白龙", "黑魔术师", "灰流丽", "真红眼黑龙"];

function isSavedItem(value: unknown): value is PrintItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<PrintItem>;
  return Boolean(item.card && typeof item.card === "object" &&
    /^\d{1,12}$/.test(String(item.card.id)) && Number.isInteger(item.card.cid) &&
    typeof item.card.name === "string" &&
    CARD_VARIANTS.some((variant) => variant.id === item.variant) &&
    Number.isInteger(item.quantity) && (item.quantity ?? 0) >= 1 && (item.quantity ?? 0) <= 3);
}

function CardArtwork({ card, variant, className = "", onStatus }: {
  card: Card;
  variant: CardVariant;
  className?: string;
  onStatus?: (status: ImageStatus) => void;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={`card-artwork ${className} ${failed ? "card-artwork--missing" : ""}`}>
      {!failed ? (
        <img
          key={`${card.id}:${variant}`}
          src={cardImage(card.id, variant)}
          alt={`${card.name}的${CARD_VARIANTS.find((item) => item.id === variant)?.label ?? ""}卡图`}
          loading="lazy"
          onLoad={() => onStatus?.("ready")}
          onError={() => { setFailed(true); onStatus?.("missing"); }}
        />
      ) : (
        <div className="image-fallback" role="img" aria-label="此图版暂无预览图">
          <span className="image-fallback__symbol">C<span>・</span>P</span>
          <span>暂无卡图</span>
        </div>
      )}
    </div>
  );
}

function VariantOption({ card, variant, selected, onSelect, onStatus }: {
  card: Card;
  variant: typeof CARD_VARIANTS[number];
  selected: boolean;
  onSelect: () => void;
  onStatus: (status: ImageStatus) => void;
}) {
  const [status, setStatus] = useState<ImageStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const updateStatus = (next: ImageStatus) => { setStatus(next); onStatus(next); };
  const retry = () => { updateStatus("loading"); setAttempt((current) => current + 1); };

  return (
    <button
      type="button"
      className={`variant-option ${selected ? "variant-option--selected" : ""}`}
      onClick={status === "missing" ? retry : onSelect}
      aria-pressed={selected}
      aria-label={status === "missing" ? `${variant.label}卡图加载失败，点击重试` : undefined}
    >
      <CardArtwork key={attempt} card={card} variant={variant.id} onStatus={updateStatus} />
      <span className="variant-option__copy"><strong>{variant.label}</strong><small>{status === "missing" ? "加载失败 · 点击重试" : variant.sublabel}</small></span>
      <span className="variant-option__check" aria-hidden="true">{selected && <Check size={13} strokeWidth={2.6} />}</span>
    </button>
  );
}

export default function CardPrintApp() {
  const [input, setInput] = useState("青眼白龙");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Card[]>([]);
  const [nextCursor, setNextCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [items, setItems] = useState<PrintItem[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<CardVariant>("ygopro");
  const [imageStatus, setImageStatus] = useState<Partial<Record<CardVariant, ImageStatus>>>({});
  const [previewPage, setPreviewPage] = useState(0);
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const searchCards = useCallback(async (term: string, cursor = 0) => {
    const clean = term.trim();
    if (!clean) { setError("请输入卡名、密码或 CID 后再搜索。"); return; }
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setLoading(true);
    setError("");
    if (cursor === 0) { setQuery(clean); setResults([]); setNextCursor(0); }
    try {
      const params = new URLSearchParams({ q: clean, start: String(cursor) });
      const response = await fetch(`/api/cards/search?${params}`, { signal: active.signal });
      const payload: SearchResponse | { error: string } = await response.json();
      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "查询失败，请稍后再试。");
      }
      setResults((current) => cursor === 0 ? payload.result : [...current, ...payload.result]);
      setNextCursor(payload.next);
      setSearched(true);
    } catch (reason) {
      if (active.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : "查询失败，请稍后再试。");
      setSearched(true);
    } finally {
      if (controller.current === active) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void searchCards("青眼白龙"), 0);
    return () => { window.clearTimeout(timer); controller.current?.abort(); };
  }, [searchCards]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved: unknown = JSON.parse(raw);
          if (typeof saved === "object" && saved !== null) {
            const record = saved as { updatedAt?: number; items?: unknown };
            if (typeof record.updatedAt === "number" && Date.now() - record.updatedAt < STORAGE_LIFETIME && Array.isArray(record.items)) {
              setItems(record.items.filter(isSavedItem).slice(0, 120));
            } else localStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch { localStorage.removeItem(STORAGE_KEY); }
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (storageReady) localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, updatedAt: Date.now() }));
  }, [items, storageReady]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!selectedCard) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    closeButtonRef.current?.focus();
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSelectedCard(null); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled])'));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleDialogKeys);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handleDialogKeys); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [selectedCard]);

  const total = items.reduce((count, item) => count + item.quantity, 0);
  const pages = Math.max(1, Math.ceil(total / 12));
  const currentPage = Math.min(previewPage, pages - 1);
  const allCards = items.flatMap((item) => Array.from({ length: item.quantity }, () => item));
  const pageCards = allCards.slice(currentPage * 12, currentPage * 12 + 12);

  const openCard = (card: Card) => {
    setSelectedCard(card);
    setSelectedVariant("ygopro");
    setImageStatus({});
  };

  const addItem = () => {
    if (!selectedCard || imageStatus[selectedVariant] !== "ready") return;
    if (total >= 120) { setNotice("单次打印清单最多添加 120 张卡片。"); return; }
    const card = selectedCard;
    const variant = selectedVariant;
    const key = `${card.cid}:${variant}`;
    const existing = items.find((item) => itemKey(item) === key);
    if (existing?.quantity === 3) { setNotice("同一张卡、同一图版最多加入 3 张。"); return; }
    setItems((current) => existing
      ? current.map((item) => itemKey(item) === key ? { ...item, quantity: item.quantity + 1 } : item)
      : [...current, { card, variant, quantity: 1 }]);
    setSelectedCard(null);
    setNotice(`已将「${card.name}」加入打印清单`);
  };

  const changeQuantity = (key: string, delta: number) => {
    if (delta > 0 && total >= 120) { setNotice("单次打印清单最多添加 120 张卡片。"); return; }
    setItems((current) => current.map((item) => itemKey(item) === key
      ? { ...item, quantity: Math.max(1, Math.min(3, item.quantity + delta)) } : item));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((current) => {
      const copy = [...current];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  };

  const runSuggested = (term: string) => { setInput(term); void searchCards(term); };

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header__inner page-width">
          <a className="brand" href="#top" aria-label="YGO，返回顶部">
            <span className="brand__mark" aria-hidden="true"><span /><span /></span>
            <span>YGO <small>CARDPRINT</small></span>
          </a>
          <nav className="desktop-nav" aria-label="主导航">
            <a href="#search">查找卡片</a><a href="#how-it-works">使用说明</a>
          </nav>
          <a className="header-tray" href="#print-tray"><Layers3 size={17} /> 打印清单 <span>{total}</span></a>
        </div>
      </header>

      <main id="top">
        <section className="hero page-width" aria-labelledby="hero-heading">
          <div className="hero__copy">
            <div className="eyebrow"><span className="eyebrow__line" /> 为每一张喜欢的卡，留一个位置</div>
            <h1 id="hero-heading">想打的卡，<br /><em>刚好排成一页。</em></h1>
            <p>搜索卡片，挑选喜欢的图版。我们帮你整理成适合线下打印的卡片清单。</p>
            <a className="hero__link" href="#search">开始查找 <ArrowRight size={17} /></a>
          </div>
          <div className="hero__illustration" aria-hidden="true">
            <div className="hero__paper">
              <div className="hero__paper-top"><span>PRINT SHEET / 001</span><span>A3 · 3 × 4</span></div>
              <div className="hero__mini-grid">{Array.from({ length: 12 }, (_, index) => <div key={index} className={`hero__mini-card hero__mini-card--${index % 4}`}><span /></div>)}</div>
              <div className="hero__paper-bottom"><span>59 × 86 mm</span><span>100% SCALE</span></div>
            </div>
            <span className="hero__seal">卡片计划<br /><strong>从这里开始</strong></span>
          </div>
        </section>

        <section className="workspace-band" id="search">
          <div className="workspace page-width">
            <div className="finder">
              <div className="section-label"><span>01 / FIND YOUR CARDS</span><span className="section-label__rule" /></div>
              <div className="section-heading"><div><h2>查找卡片</h2><p>输入卡名、效果关键词、卡片密码或 CID</p></div><span className="section-heading__hint">数据来自百鸽</span></div>

              <form className="search-bar" onSubmit={(event) => { event.preventDefault(); void searchCards(input); }} role="search">
                <Search className="search-bar__icon" size={21} aria-hidden="true" />
                <label className="sr-only" htmlFor="card-search">搜索游戏王卡片</label>
                <input id="card-search" value={input} onChange={(event) => setInput(event.target.value)} placeholder="试试「青眼白龙」或 89631139" autoComplete="off" />
                <button type="submit" disabled={loading}>{loading ? <LoaderCircle size={18} className="spin" /> : "搜索卡片"}<ArrowRight size={17} /></button>
              </form>
              <div className="suggestions"><span>试着搜索</span>{suggested.map((term) => <button key={term} type="button" onClick={() => runSuggested(term)}>{term}<ArrowRight size={12} /></button>)}</div>

              <div className="results-heading"><h3>{query ? `「${query}」的搜索结果` : "搜索结果"}</h3><span>{loading && !results.length ? "正在查找…" : results.length ? `已显示 ${results.length} 张卡片` : ""}</span></div>
              {error && <div className="message message--error" role="alert"><AlertCircle size={18} /><span>{error}</span><button type="button" onClick={() => void searchCards(query || input)}>重试</button></div>}
              {loading && !results.length && <div className="results-loading" role="status"><LoaderCircle size={24} className="spin" /><span>正在查找卡片…</span></div>}
              {!loading && !error && searched && results.length === 0 && <div className="empty-search"><Search size={27} /><h3>暂时没有找到这张卡</h3><p>试试其他译名、卡片密码或更短的关键词。</p></div>}
              {results.length > 0 && <div className="result-list" aria-live="polite">{results.map((card) => (
                <article className="result-card" key={`${card.cid}:${card.id}`}>
                  <button className="result-card__visual" type="button" onClick={() => openCard(card)} aria-label={`查看${card.name}的卡图`}><CardArtwork card={card} variant="ygopro" /></button>
                  <div className="result-card__details"><span className="result-card__meta">CARD NO. {card.id} <span>·</span> CID {card.cid}</span><h4>{card.name}</h4><p>{card.enName || card.jpName || "选择图版，加入打印清单"}</p><span className="result-card__type">{card.types?.split("\n")[0] || "游戏王卡片"}</span></div>
                  <button type="button" className="result-card__add" onClick={() => openCard(card)}><Plus size={17} /><span>选择卡图</span></button>
                </article>
              ))}</div>}
              {nextCursor > 0 && <button className="load-more" type="button" disabled={loading} onClick={() => void searchCards(query, nextCursor)}>{loading ? <LoaderCircle size={17} className="spin" /> : "加载更多卡片"}<ArrowDown size={16} /></button>}
            </div>

            <aside className="print-tray" id="print-tray" aria-labelledby="tray-heading">
              <div className="section-label"><span>02 / YOUR PRINT SHEET</span><span className="section-label__rule" /></div>
              <div className="tray-heading"><div><h2 id="tray-heading">打印清单</h2><p>所选卡片会保存在此设备</p></div><span className="tray-count">{total} <small>张</small></span></div>
              <div className="tray-body">
                {items.length === 0 ? (
                  <div className="tray-empty"><div className="tray-empty__stack"><span /><span /><span /></div><h3>留个位置给喜欢的卡</h3><p>从左侧查找卡片，挑选图版后加入这里。</p><a href="#search">去找卡片 <ArrowRight size={15} /></a></div>
                ) : (
                  <><div className="tray-list">{items.map((item, index) => {
                    const key = itemKey(item);
                    return <div className="tray-item" key={key}>
                      <CardArtwork card={item.card} variant={item.variant} />
                      <div className="tray-item__content"><span className="tray-item__index">{String(index + 1).padStart(2, "0")} / {CARD_VARIANTS.find((variant) => variant.id === item.variant)?.label}</span><strong>{item.card.name}</strong><span className="tray-item__number">{item.card.id}</span><div className="quantity-control" aria-label={`${item.card.name}数量`}><button type="button" disabled={item.quantity === 1} aria-label={`减少${item.card.name}数量`} onClick={() => changeQuantity(key, -1)}><Minus size={13} /></button><span>{item.quantity}</span><button type="button" disabled={item.quantity === 3 || total >= 120} aria-label={`增加${item.card.name}数量`} onClick={() => changeQuantity(key, 1)}><Plus size={13} /></button></div></div>
                      <div className="tray-item__actions"><button type="button" title="上移" aria-label={`上移${item.card.name}`} disabled={index === 0} onClick={() => moveItem(index, -1)}><ArrowUp size={15} /></button><button type="button" title="下移" aria-label={`下移${item.card.name}`} disabled={index === items.length - 1} onClick={() => moveItem(index, 1)}><ArrowDown size={15} /></button><button type="button" title="移除" aria-label={`移除${item.card.name}`} onClick={() => setItems((current) => current.filter((entry) => itemKey(entry) !== key))}><X size={15} /></button></div>
                    </div>;
                  })}</div><button className="clear-list" type="button" onClick={() => { if (window.confirm("确定清空打印清单吗？")) { setItems([]); setPreviewPage(0); } }}><Trash2 size={14} />清空清单</button></>
                )}
              </div>
              <div className="preview-panel"><div className="preview-panel__heading"><div><span>排版预览</span><small>A3 横向 · 3 行 × 4 列</small></div><span>{currentPage + 1} / {pages} 页</span></div><div className="preview-sheet" aria-label={`第${currentPage + 1}页的卡片排版预览`}>
                {Array.from({ length: 12 }, (_, index) => { const item = pageCards[index]; return <div key={index} className={`preview-slot ${item ? "preview-slot--filled" : ""}`}>{item ? <CardArtwork card={item.card} variant={item.variant} /> : <span>{String(index + 1).padStart(2, "0")}</span>}</div>; })}
              </div><div className="preview-panel__footer"><span>标准卡尺寸 59 × 86 mm</span><div><button type="button" aria-label="上一页" disabled={currentPage === 0} onClick={() => setPreviewPage((page) => page - 1)}><ChevronLeft size={16} /></button><button type="button" aria-label="下一页" disabled={currentPage >= pages - 1} onClick={() => setPreviewPage((page) => page + 1)}><ChevronRight size={16} /></button></div></div></div>
              <div className="export-area"><button className="export-button" type="button" disabled><FileDown size={18} /><span>导出 Word 文档</span><ArrowRight size={17} /></button><p>Word 生成接口将在后端阶段接入。清单和排版预览现已可用。</p></div>
            </aside>
          </div>
        </section>

        <section className="how-section page-width" id="how-it-works"><div className="section-label"><span>THE PROCESS / 03 STEPS</span><span className="section-label__rule" /></div><div className="how-section__body"><div><h2>从卡片到纸面，<br />只需三步。</h2><p>提前排好每一张，打印时更从容。</p></div><div className="how-steps"><div><span>01</span><strong>查找卡片</strong><p>通过卡名、密码或 CID 快速定位。</p></div><div><span>02</span><strong>挑选图版</strong><p>选好图片版本、数量和打印顺序。</p></div><div><span>03</span><strong>确认版式</strong><p>按 A3 纸 3 × 4 标准卡尺寸预览。</p></div></div></div></section>
      </main>
      <footer className="site-footer"><div className="page-width"><span className="footer-brand">YGO <small>CARDPRINT</small></span><span>萌新从这里开始，低成本开启你的决斗 · 卡片资料由百鸽提供</span><a href="https://ygocdb.com/api" target="_blank" rel="noreferrer">数据来源 ↗</a></div></footer>
      <a className="mobile-tray-bar" href="#print-tray"><span><Layers3 size={18} /> 打印清单 <b>{total}</b></span><span>查看排版 <ArrowRight size={16} /></span></a>

      {selectedCard && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedCard(null); }}><div ref={dialogRef} className="card-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <button ref={closeButtonRef} type="button" className="dialog-close" aria-label="关闭卡图选择" onClick={() => setSelectedCard(null)}><X size={20} /></button>
        <div className="dialog-preview"><div className="dialog-preview__top">CARD PREVIEW <span>·</span> {selectedCard.id}</div><CardArtwork key={`${selectedCard.id}:${selectedVariant}`} card={selectedCard} variant={selectedVariant} onStatus={(status) => setImageStatus((current) => ({ ...current, [selectedVariant]: status }))} /><p>预览图仅供选版，正式导出将使用原图。</p></div>
        <div className="dialog-content"><div className="dialog-eyebrow">选择卡图 / SELECT ARTWORK</div><h2 id="dialog-title">{selectedCard.name}</h2><p className="dialog-subtitle">{selectedCard.enName || selectedCard.jpName || `CID ${selectedCard.cid}`}</p><div className="dialog-card-meta"><span>密码 {selectedCard.id} · CID {selectedCard.cid}</span>{selectedCard.types && <span>{selectedCard.types.split("\n")[0]}</span>}</div><div className="dialog-rule" /><div className="dialog-label">选择你想打印的图版 <span>不同图版可分别加入</span></div><div className="variant-grid">{CARD_VARIANTS.map((variant) => <VariantOption key={`${selectedCard.id}:${variant.id}`} card={selectedCard} variant={variant} selected={selectedVariant === variant.id} onSelect={() => setSelectedVariant(variant.id)} onStatus={(status) => setImageStatus((current) => ({ ...current, [variant.id]: status }))} />)}</div><div className="dialog-bottom"><div className="dialog-tip"><AlertCircle size={16} /><span>{imageStatus[selectedVariant] === "missing" ? "当前图版暂无卡图，请选择其他版本。" : imageStatus[selectedVariant] === "ready" ? "图版可用。清单中的卡图将在后端导出时再次校验。" : "正在检查所选图版是否可用…"}</span></div><button type="button" className="dialog-add" disabled={imageStatus[selectedVariant] !== "ready" || total >= 120} onClick={addItem}><Plus size={18} />加入打印清单<ArrowRight size={17} /></button></div></div>
      </div></div>}
      {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
    </div>
  );
}
