"use client";

/**
 * BrochureModule — "Download Brochure" (Admin Panel → Command Center).
 *
 * Dynamic, realtime company-wise / category-wise catalog generation:
 *  - multi-select companies + cascading category filter (custom mixed catalogs)
 *  - Ready-to-Dispatch only / include out-of-stock / show prices / price tier
 *  - PDF built live from the database → instant download
 *  - version ID + timestamp on every file (no more stale price lists)
 *  - WhatsApp share + Email via the Cloudinary-hosted PDF link
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Check, Copy, FileDown, Loader2, Mail, MessageCircle, Printer, Search, Warehouse, X } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader } from "./ui-bits";

interface Meta {
  companies: { name: string; count: number }[];
  tops: { id: string; name: string; mids: { id: string; name: string; ends: { id: string; name: string }[] }[] }[];
  warehouses: { id: string; name: string; city: string; isDefault: boolean; skus: number }[];
  contact: { firmName: string; firmPhone: string; site: string };
}
interface WhProduct {
  id: string; sku: string; name: string; company: string; category: string;
  qty: number; active: boolean; dealerPrice: number; mrp: number; image: string;
}
type WhSort = "company" | "name" | "qty" | "price" | "category";
interface BrochureMeta {
  id: string; filename: string; count: number; companies: string[]; warehouse?: string;
  sections: { name: string; count: number }[];
  generatedAtIST: string; validTillIST: string; shareUrl?: string;
}

const Switch = ({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) => (
  <button
    onClick={() => onChange(!on)}
    className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${on ? "border-black bg-yellow-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
    aria-pressed={on}
  >
    <span className={`mt-0.5 flex h-4.5 w-8 shrink-0 items-center rounded-full p-0.5 transition ${on ? "bg-black" : "bg-gray-300"}`} style={{ height: 18, width: 32 }}>
      <span className={`h-3.5 w-3.5 rounded-full bg-white transition-transform ${on ? "translate-x-3.5" : ""}`} style={{ height: 14, width: 14 }} />
    </span>
    <span>
      <span className="block text-xs font-semibold text-gray-900">{label}</span>
      <span className="block text-[10px] leading-tight text-gray-500">{hint}</span>
    </span>
  </button>
);

export function BrochureModule({ token }: { token: string }) {
  const call = useMemo(() => api(token), [token]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [warehouseId, setWarehouseId] = useState(""); // MANDATORY — every print is one godown
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [companySearch, setCompanySearch] = useState("");
  const [topId, setTopId] = useState("");
  const [midId, setMidId] = useState("");
  const [endId, setEndId] = useState("");
  const [readyOnly, setReadyOnly] = useState(false);
  const [includeOOS, setIncludeOOS] = useState(true);
  const [showPrices, setShowPrices] = useState(true);
  const [tier, setTier] = useState("dealer");
  const [maxProducts, setMaxProducts] = useState<number | "all">(120);
  const [generating, setGenerating] = useState(false);
  const [last, setLast] = useState<BrochureMeta | null>(null);

  // warehouse product picker — EVERY product the chosen godown carries (hidden
  // ones included) so the owner decides exactly what goes into the print
  const [whProducts, setWhProducts] = useState<WhProduct[]>([]);
  const [whLoading, setWhLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [whSearch, setWhSearch] = useState("");
  const [whSort, setWhSort] = useState<WhSort>("company");

  useEffect(() => {
    call("/api/admin/brochure/generate").then(setMeta).catch((e) => toast.error(e.message));
  }, [call]);

  const onWarehouse = (id: string) => {
    setWarehouseId(id);
    setPicked(new Set());
    setWhSearch("");
    if (!id) { setWhProducts([]); return; }
    setWhLoading(true);
    call(`/api/admin/brochure/generate?warehouseId=${encodeURIComponent(id)}`)
      .then((d: { products?: WhProduct[] }) => setWhProducts(d.products ?? []))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setWhLoading(false));
  };

  const mids = useMemo(() => meta?.tops.find((t) => t.id === topId)?.mids ?? [], [meta, topId]);
  const ends = useMemo(() => mids.find((m) => m.id === midId)?.ends ?? [], [mids, midId]);

  const companiesFiltered = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    return (meta?.companies ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [meta, companySearch]);

  const toggleCompany = (name: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name); else n.add(name);
      return n;
    });
  };

  const togglePicked = (id: string) => {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const whFiltered = useMemo(() => {
    const q = whSearch.trim().toLowerCase();
    const rows = whProducts.filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.company.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
    );
    const by: Record<WhSort, (a: WhProduct, b: WhProduct) => number> = {
      company: (a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      qty: (a, b) => b.qty - a.qty || a.company.localeCompare(b.company) || a.name.localeCompare(b.name),
      price: (a, b) => b.dealerPrice - a.dealerPrice || a.company.localeCompare(b.company),
      category: (a, b) => a.category.localeCompare(b.category) || a.company.localeCompare(b.company) || a.name.localeCompare(b.name),
    };
    return [...rows].sort(by[whSort]);
  }, [whProducts, whSearch, whSort]);

  const generate = useCallback(async () => {
    if (!meta) return;
    if (!warehouseId) { toast.error("Pick the warehouse first — every brochure prints one godown's stock"); return; }
    if (picked.size > 600) { toast.error(`A single brochure prints up to 600 products — ${picked.size} are picked. Clear some or print company-wise.`); return; }
    setGenerating(true);
    try {
      // picked products (ordered by the visible sort) override every other filter;
      // an empty pick keeps the classic company/category filter flow working
      const pickedOrdered = picked.size ? whFiltered.filter((p) => picked.has(p.id)).map((p) => p.id) : undefined;
      const res = await fetch("/api/admin/brochure/generate", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          warehouseId,
          ...(pickedOrdered ? { productIds: pickedOrdered } : {}),
          companies: Array.from(selected),
          topId: topId || undefined,
          midId: midId || undefined,
          endId: endId || undefined,
          readyOnly,
          includeOutOfStock: includeOOS && !readyOnly,
          showPrices,
          tier,
          maxProducts,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Generation failed (${res.status})`);
      }
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        // LARGE PDF — the server hosted it on Cloudinary (serverless responses
        // cannot stream big binaries). Open the hosted link for download.
        const d = await res.json() as { shareUrl: string; meta: BrochureMeta };
        if (d.meta) setLast(d.meta);
        window.open(d.shareUrl, "_blank");
        toast.success(`Catalog ${d.meta?.id ?? ""} ready — ${d.meta?.count ?? "?"} products · hosted download opened`);
        return;
      }
      const blob = await res.blob();
      const metaHeader = res.headers.get("x-brochure-meta");
      const info: BrochureMeta | null = metaHeader ? JSON.parse(atob(metaHeader.replace(/-/g, "+").replace(/_/g, "/"))) : null;
      if (info) setLast(info);

      // immediate download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = info?.filename || "DMK-Catalog.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      toast.success(`Catalog ${info?.id ?? ""} ready — ${info?.count ?? "?"} products · PDF downloaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [meta, warehouseId, picked, whFiltered, selected, topId, midId, endId, readyOnly, includeOOS, showPrices, tier, maxProducts, token]);

  const waShare = () => {
    if (!last?.shareUrl) return;
    const text = `📄 *${meta?.contact.firmName || "DMK Mart"} Product Catalog* ${last.id}\n${last.count} products · live stock & prices\nValid till ${last.validTillIST}\nDownload: ${last.shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };
  const mailShare = () => {
    if (!last?.shareUrl) return;
    const subject = encodeURIComponent(`${meta?.contact.firmName || "DMK Mart"} Product Catalog ${last.id}`);
    const body = encodeURIComponent(`Dear customer,\n\nPlease find our latest product catalog (${last.count} products, live stock & pricing).\nVersion: ${last.id}\nPrices valid till: ${last.validTillIST}\n\nDownload PDF: ${last.shareUrl}\n\nOrder online: ${meta?.contact.site}\n\n— ${meta?.contact.firmName || "DMK Mart"} Sales Team`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div>
      <ModuleHeader title="Download Brochure" sub="Generate a realtime, company-wise product catalog PDF — fresh stock & prices every time">
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">⚡ LIVE DATA</span>
      </ModuleHeader>

      <div className="grid gap-3 lg:grid-cols-[340px_1fr]">
        {/* filters */}
        <div className="space-y-3">
          {/* warehouse — MANDATORY step 1: the brochure prints this godown's stock */}
          <div className="rounded-xl border-2 border-black bg-yellow-50/60 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-gray-900"><Warehouse className="h-3.5 w-3.5 text-yellow-600" /> 1 · Warehouse (required)</p>
            <select
              value={warehouseId}
              onChange={(e) => onWarehouse(e.target.value)}
              className="h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-xs"
              aria-label="Warehouse"
            >
              <option value="">— Pick the warehouse —</option>
              {meta?.warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}{w.city ? ` — ${w.city}` : ""}{w.skus ? ` (${w.skus} SKUs)` : ""}</option>
              ))}
            </select>
            <p className="mt-1.5 text-[10px] leading-tight text-gray-500">The brochure prints only the products stocked in this godown, with this godown's own quantities on every line.</p>
          </div>

          {/* products picker — every product THIS warehouse carries, hidden ones included */}
          <div className="rounded-xl border bg-white p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-900">2 · Pick products (optional)</p>
              {picked.size > 0 && (
                <button onClick={() => setPicked(new Set())} className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-red-500"><X className="h-3 w-3" /> Clear ({picked.size})</button>
              )}
            </div>
            <p className="mb-2 text-[10px] leading-tight text-gray-500">
              {whLoading
                ? "Loading this warehouse's products…"
                : warehouseId
                  ? <>All <b>{whProducts.length}</b> products of this warehouse — hidden ones too. Search, sort, tick what to print. Empty selection = the filters below decide.</>
                  : "Pick a warehouse first — its full product list (hidden items included) appears here."}
            </p>
            {warehouseId && !whLoading && (
              <>
                <div className="mb-1.5 flex gap-1.5">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input
                      value={whSearch}
                      onChange={(e) => setWhSearch(e.target.value)}
                      placeholder="Search name, SKU, brand, category…"
                      className="h-8 w-full rounded-lg border border-gray-200 pl-8 pr-2 text-xs outline-none focus:border-yellow-500"
                    />
                  </div>
                  <select
                    value={whSort}
                    onChange={(e) => setWhSort(e.target.value as WhSort)}
                    className="h-8 w-[104px] rounded-lg border border-gray-200 px-1.5 text-[11px] outline-none focus:border-yellow-500"
                    aria-label="Sort warehouse products"
                  >
                    <option value="company">Brand A→Z</option>
                    <option value="name">Name A→Z</option>
                    <option value="qty">Stock high→low</option>
                    <option value="price">Price high→low</option>
                    <option value="category">Category</option>
                  </select>
                </div>
                <div className="max-h-64 space-y-0.5 overflow-y-auto">
                  {whFiltered.map((p) => {
                    const on = picked.has(p.id);
                    return (
                      <label key={p.id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 text-xs hover:bg-gray-50 ${on ? "bg-yellow-50" : ""}`}>
                        <input type="checkbox" checked={on} onChange={() => togglePicked(p.id)} className="h-3.5 w-3.5 accent-black" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-gray-800">{p.name}</span>
                          <span className="block truncate text-[9.5px] text-gray-400">{p.sku} · {p.company}{p.category ? ` · ${p.category}` : ""}</span>
                        </span>
                        {!p.active && <span className="shrink-0 rounded bg-gray-200 px-1 py-0.5 text-[9px] font-bold text-gray-500">Hidden</span>}
                        <span className={`shrink-0 text-[10px] font-bold tabular-nums ${p.qty > 0 ? "text-emerald-600" : "text-red-400"}`}>{p.qty}</span>
                        <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-gray-500">₹{p.dealerPrice.toLocaleString("en-IN")}</span>
                      </label>
                    );
                  })}
                  {!whFiltered.length && <p className="px-1 py-3 text-center text-[11px] text-gray-400">Nothing matches this search.</p>}
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <button
                    onClick={() => setPicked((s) => { const n = new Set(s); for (const p of whFiltered) n.add(p.id); return n; })}
                    className="text-[10px] font-bold text-gray-500 hover:text-black"
                  >
                    Select all shown ({whFiltered.length})
                  </button>
                  <span className="text-[10px] text-gray-400">Picked {picked.size} · max 600 per print</span>
                </div>
              </>
            )}
          </div>

          {/* companies */}
          <div className="rounded-xl border bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-900">3 · Companies</p>
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())} className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-red-500"><X className="h-3 w-3" /> Clear ({selected.size})</button>
              )}
            </div>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                placeholder="Search company…"
                className="h-8 w-full rounded-lg border border-gray-200 pl-8 pr-2 text-xs outline-none focus:border-yellow-500"
              />
            </div>
            <div className="max-h-44 space-y-0.5 overflow-y-auto">
              {companiesFiltered.map((c) => (
                <label key={c.name} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 text-xs hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selected.has(c.name)}
                    onChange={() => toggleCompany(c.name)}
                    className="h-3.5 w-3.5 accent-black"
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold text-gray-800">{c.name}</span>
                  <span className="text-[10px] text-gray-400">{c.count}</span>
                </label>
              ))}
              {!companiesFiltered.length && <p className="px-1 py-3 text-center text-[11px] text-gray-400">No companies.</p>}
            </div>
            <p className="mt-1.5 text-[10px] text-gray-400">Select none = all companies. Select several for a mixed catalog.</p>
          </div>

          {/* categories */}
          <div className="rounded-xl border bg-white p-3">
            <p className="mb-2 text-xs font-semibold text-gray-900">4 · Category (optional)</p>
            <div className="space-y-2">
              <select value={topId} onChange={(e) => { setTopId(e.target.value); setMidId(""); setEndId(""); }} className="h-9 w-full rounded-lg border border-gray-200 px-2 text-xs" aria-label="Top category">
                <option value="">All top categories</option>
                {meta?.tops.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select value={midId} onChange={(e) => { setMidId(e.target.value); setEndId(""); }} disabled={!topId} className="h-9 w-full rounded-lg border border-gray-200 px-2 text-xs disabled:opacity-50" aria-label="Mid category">
                <option value="">All mid categories</option>
                {mids.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select value={endId} onChange={(e) => setEndId(e.target.value)} disabled={!midId} className="h-9 w-full rounded-lg border border-gray-200 px-2 text-xs disabled:opacity-50" aria-label="End category">
                <option value="">All end categories</option>
                {ends.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          </div>

          {/* toggles */}
          <div className="space-y-2">
            <Switch on={readyOnly} onChange={setReadyOnly} label="Ready to Dispatch only" hint="Only items currently in stock — ship today" />
            <Switch on={includeOOS} onChange={setIncludeOOS} label="Include out-of-stock" hint="Show OOS items with an OUT OF STOCK badge" />
            <Switch on={showPrices} onChange={setShowPrices} label="Show prices" hint="Off → prints “Login to view price” (safe drafts)" />
          </div>

          {/* price tier + limit */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border bg-white p-3">
              <p className="mb-1.5 text-[12px] font-medium text-gray-500">Price tier</p>
              <select value={tier} onChange={(e) => setTier(e.target.value)} className="h-8 w-full rounded-lg border border-gray-200 px-2 text-xs" aria-label="Price tier">
                <option value="dealer">Dealer (default)</option>
                <option value="tier1">Tier 1</option>
                <option value="tier2">Tier 2</option>
                <option value="tier3">Tier 3</option>
                <option value="tier4">Tier 4</option>
                <option value="tier5">Tier 5</option>
              </select>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <p className="mb-1.5 text-[12px] font-medium text-gray-500">Max products</p>
              <select
                value={String(maxProducts)}
                onChange={(e) => setMaxProducts(e.target.value === "all" ? "all" : Number(e.target.value))}
                className="h-8 w-full rounded-lg border border-gray-200 px-2 text-xs"
                aria-label="Maximum products"
              >
                <option value="60">60 products</option>
                <option value="120">120 products</option>
                <option value="200">200 products</option>
                <option value="250">250 products</option>
                <option value="all">All products (up to 600)</option>
              </select>
            </div>
          </div>

          <button
            onClick={generate}
            disabled={generating || !meta || !warehouseId}
            title={warehouseId ? "Generate the brochure PDF" : "Pick the warehouse first"}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-black text-sm font-semibold text-yellow-400 transition-colors hover:bg-gray-900 disabled:opacity-60"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
            {generating ? "Generating PDF…" : warehouseId ? "Generate & Download PDF" : "Pick a warehouse to enable"}
          </button>
          <p className="text-center text-[10px] text-gray-400">Prints 9 products per page in a 3×3 grid · large catalogs take 20–60 seconds — the file downloads automatically.</p>
        </div>

        {/* preview / result */}
        <div className="space-y-3">
          {last ? (
            <>
              <div className="rounded-xl border-2 border-black bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900"><Check className="h-4 w-4 text-emerald-600" /> Catalog {last.id} generated</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      {last.count} products{last.warehouse ? ` · ${last.warehouse}` : ""} · {last.companies.length} compan{last.companies.length === 1 ? "y" : "ies"} · {last.sections.length} sections · generated {last.generatedAtIST}
                    </p>
                    <p className="text-[11px] text-gray-500">Prices valid till <b>{last.validTillIST}</b> · {last.filename}</p>
                  </div>
                  <span className="rounded-lg bg-yellow-100 px-2.5 py-1 text-[10px] font-semibold text-gray-900">v{last.id}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={waShare} disabled={!last.shareUrl} title={last.shareUrl ? "Send via WhatsApp" : "Share link unavailable (Cloudinary not configured)"} className="flex items-center gap-1.5 rounded-lg bg-[#16a34a] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-40">
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp Share
                  </button>
                  <button onClick={mailShare} disabled={!last.shareUrl} className="flex items-center gap-1.5 rounded-lg bg-black px-3.5 py-2 text-xs font-semibold text-yellow-400 disabled:opacity-40">
                    <Mail className="h-3.5 w-3.5" /> Email
                  </button>
                  <button
                    onClick={() => { if (last.shareUrl) { navigator.clipboard.writeText(last.shareUrl); toast.success("Share link copied"); } }}
                    disabled={!last.shareUrl}
                    className="flex items-center gap-1.5 rounded-lg border bg-white px-3.5 py-2 text-xs font-bold text-gray-700 disabled:opacity-40"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy Link
                  </button>
                  <button onClick={generate} disabled={generating} className="flex items-center gap-1.5 rounded-lg border bg-white px-3.5 py-2 text-xs font-bold text-gray-700 disabled:opacity-40">
                    <FileDown className="h-3.5 w-3.5" /> Regenerate
                  </button>
                  {last.shareUrl && (
                    <a href={last.shareUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border bg-white px-3.5 py-2 text-xs font-bold text-gray-700">
                      <Printer className="h-3.5 w-3.5" /> Open hosted PDF
                    </a>
                  )}
                </div>
              </div>
              <div className="rounded-xl border bg-white p-3">
                <p className="mb-2 text-[10px] font-medium text-gray-400">Sections in this catalog</p>
                <div className="flex flex-wrap gap-1.5">
                  {last.sections.map((s) => (
                    <span key={s.name} className="rounded-full bg-gray-100 px-2.5 py-1 text-[10.5px] font-bold text-gray-700">{s.name} · {s.count}</span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed bg-white p-8 text-center">
              <BookOpen className="mb-3 h-10 w-10 text-gray-200" />
              <p className="text-sm font-semibold text-gray-700">Your generated catalog appears here</p>
              <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-gray-400">
                Pick companies / a category, choose stock & price options, then hit <b>Generate</b>. The PDF pulls live stock, live pricing, latest product details and images straight from the inventory — every file carries a unique version ID so clients never see stale rates.
              </p>
            </div>
          )}

          <div className="rounded-xl border bg-white p-3 text-[10.5px] leading-relaxed text-gray-500">
            <b className="text-gray-800">How sharing works:</b> every generated PDF is also uploaded to your Cloudinary (folder <code className="rounded bg-gray-100 px-1">dmk-mart/brochures</code>) when credentials are configured — the hosted link is what WhatsApp / Email share. Without Cloudinary, the PDF still downloads normally; share it manually.
          </div>
        </div>
      </div>
    </div>
  );
}
