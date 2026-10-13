"use client";

import { useCallback, useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from "recharts";
import { Download, FileSpreadsheet, Printer, RefreshCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader, StatCard } from "./ui-bits";
import { formatINR } from "@/lib/store";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/* ══════════════ FINANCIAL ══════════════ */
type FinData = {
  range: { from: string; to: string };
  summary: Record<string, number>;
  daily: { date: string; revenue: number; orders: number; profit: number }[];
  byPayment: { mode: string; amount: number; count: number }[];
  bySource: { source: string; amount: number; count: number }[];
};

export function FinancialModule({ token }: { token: string }) {
  const call = api(token);
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [data, setData] = useState<FinData | null>(null);

  const load = async () => {
    try {
      const d = await call(`/api/admin/financial?from=${from}&to=${to}`);
      setData(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  useEffect(() => {
    let alive = true;
    call(`/api/admin/financial?from=${from}&to=${to}`)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));
    return () => { alive = false; };
  }, [token, from, to]);

  if (!data) return <p className="rounded-xl border bg-white p-10 text-center text-sm text-gray-400">Loading financials…</p>;
  const s = data.summary;

  return (
    <div>
      <ModuleHeader title="Financial Section" sub={`${data.range.from} → ${data.range.to} · sales, COGS, profit, GST & payment mix`}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border px-2 text-xs" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border px-2 text-xs" />
        <button onClick={load} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-gray-50"><RefreshCcw className="h-3.5 w-3.5" /></button>
      </ModuleHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={null as never} label="Gross Sales" value={formatINR(s.gross)} sub={`${s.orders} orders`} color="#111111" />
        <StatCard icon={null as never} label="Net Revenue" value={formatINR(s.net)} sub={`after ${formatINR(s.discounts)} discounts + GST`} color="#1d4ed8" />
        <StatCard icon={null as never} label="Gross Profit" value={formatINR(s.grossProfit)} sub={`margin ${s.profitMargin}% (COGS ${formatINR(s.cogs)})`} color="#059669" />
        <StatCard icon={null as never} label="GST Collected" value={formatINR(s.gst)} sub="18% blended" color="#b45309" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-2 text-xs font-bold">Daily revenue & profit</p>
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={data.daily}>
              <defs>
                <linearGradient id="frev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#facc15" stopOpacity={0.7} /><stop offset="100%" stopColor="#facc15" stopOpacity={0.05} /></linearGradient>
                <linearGradient id="fprof" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.6} /><stop offset="100%" stopColor="#10b981" stopOpacity={0.05} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
              <Tooltip formatter={(v) => formatINR(Number(v))} contentStyle={{ fontSize: 11, borderRadius: 10 }} />
              <Area type="monotone" dataKey="revenue" stroke="#111" fill="url(#frev)" strokeWidth={2} />
              <Area type="monotone" dataKey="profit" stroke="#059669" fill="url(#fprof)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-2 text-xs font-bold">Payment mix</p>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={data.byPayment}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mode" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
              <Tooltip formatter={(v) => formatINR(Number(v))} contentStyle={{ fontSize: 11, borderRadius: 10 }} />
              <Bar dataKey="amount" fill="#111827" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-2 text-xs font-bold">Channel split (Web vs POS)</p>
          <table className="w-full text-xs">
            <tbody>
              {data.bySource.map((r) => (
                <tr key={r.source} className="border-t">
                  <td className="px-2 py-2 font-bold">{r.source === "WEB" ? "Website" : "POS Counter"}</td>
                  <td className="px-2 py-2 text-right">{r.count} orders</td>
                  <td className="px-2 py-2 text-right font-black">{formatINR(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-2 text-xs font-bold">Daily ledger</p>
          <div className="max-h-56 overflow-y-auto rounded-lg border">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-gray-50 text-left text-[9px] uppercase text-gray-500">
                <tr><th className="px-2 py-1.5">Date</th><th className="px-2 py-1.5 text-right">Orders</th><th className="px-2 py-1.5 text-right">Revenue</th><th className="px-2 py-1.5 text-right">Profit</th></tr>
              </thead>
              <tbody>
                {data.daily.map((d) => (
                  <tr key={d.date} className="border-t">
                    <td className="px-2 py-1.5">{d.date}</td>
                    <td className="px-2 py-1.5 text-right">{d.orders}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{formatINR(d.revenue)}</td>
                    <td className="px-2 py-1.5 text-right text-emerald-600">{formatINR(d.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════ REPORTS & EXPORTS ══════════════ */
const REPORT_TYPES = [
  ["sales", "Sales Report"],
  ["products", "Product Performance"],
  ["inventory", "Inventory & Stock Value"],
  ["customers", "Customer Report"],
  ["offers", "Offers & Coupons Report"],
  ["gst", "GST Register"],
] as const;

const RANGES = [
  ["today", "Today"], ["week", "This Week"], ["month", "This Month"],
  ["quarter", "This Quarter"], ["half", "6 Months"], ["year", "This Year"], ["custom", "Custom"],
] as const;

export function ReportsModule({ token }: { token: string }) {
  const call = api(token);
  const [type, setType] = useState<string>("sales");
  const [range, setRange] = useState<string>("month");
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [data, setData] = useState<{ columns: string[]; rows: unknown[][] } | null>(null);
  const [loading, setLoading] = useState(false);

  const rangeDates = (r: string): [string, string] => {
    const now = new Date();
    const y = now.getFullYear();
    switch (r) {
      case "today": return [today(), today()];
      case "week": return [daysAgo(6), today()];
      case "month": return [new Date(y, now.getMonth(), 1).toISOString().slice(0, 10), today()];
      case "quarter": {
        const qm = Math.floor(now.getMonth() / 3) * 3;
        return [new Date(y, qm, 1).toISOString().slice(0, 10), today()];
      }
      case "half": return [daysAgo(182), today()];
      case "year": return [new Date(y, 0, 1).toISOString().slice(0, 10), today()];
      default: return [from, to];
    }
  };

  const load = useCallback(async () => {
    const [f, t] = rangeDates(range);
    setFrom(f); setTo(t);
    setLoading(true);
    try {
      const d = await call(`/api/admin/reports?type=${type}&from=${f}&to=${t}`);
      setData({ columns: d.columns ?? [], rows: d.rows ?? [] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Report failed");
    } finally {
      setLoading(false);
    }
     
  }, [token, type, range]);

  useEffect(() => { load(); }, [load]);

  const downloadXlsx = () => {
    const [f, t] = rangeDates(range);
    window.location.href = `/api/admin/export?type=${type}&from=${f}&to=${t}&auth=${token}`;
  };

  const downloadCsv = () => {
    if (!data) return;
    const csv = [data.columns.join(","), ...data.rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dmk-${type}-${from}_${to}.csv`;
    a.click();
  };

  return (
    <div>
      <ModuleHeader title="Reports & Exports" sub="Daily, weekly, monthly, quarterly, half-yearly, yearly or custom — export to Excel or print PDF">
        <button onClick={downloadXlsx} className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-bold text-white hover:bg-emerald-700">
          <FileSpreadsheet className="h-4 w-4" /> Export Excel
        </button>
        <button onClick={downloadCsv} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-gray-50"><Download className="h-3.5 w-3.5" /> CSV</button>
        <button onClick={() => window.print()} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-gray-50"><Printer className="h-3.5 w-3.5" /> PDF (Print)</button>
      </ModuleHeader>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-lg border px-2 text-xs font-semibold">
          {REPORT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="flex flex-wrap gap-1">
          {RANGES.map(([v, l]) => (
            <button key={v} onClick={() => setRange(v)} className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${range === v ? "bg-black text-yellow-400" : "border bg-white text-gray-600 hover:border-yellow-400"}`}>{l}</button>
          ))}
        </div>
        {range === "custom" && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border px-2 text-xs" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border px-2 text-xs" />
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white print:border-0">
        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400">Generating report…</p>
        ) : !data || data.rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400">No data for this range.</p>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 text-left text-[9px] uppercase tracking-wide text-gray-500">
              <tr>{data.columns.map((c) => <th key={c} className="whitespace-nowrap px-2.5 py-2">{c}</th>)}</tr>
            </thead>
            <tbody>
              {data.rows.slice(0, 500).map((r, i) => (
                <tr key={i} className="border-t hover:bg-gray-50/60">
                  {r.map((c, j) => <td key={j} className="whitespace-nowrap px-2.5 py-1.5">{typeof c === "number" ? c.toLocaleString("en-IN") : String(c ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && data.rows.length > 500 && <p className="px-3 py-2 text-center text-[10px] text-gray-400">Showing first 500 rows — export to Excel for the full dataset.</p>}
      </div>
    </div>
  );
}

/* ══════════════ WEBSITE MANAGEMENT ══════════════ */
export function WebsiteModule({ token }: { token: string }) {
  const call = api(token);
  const [pages, setPages] = useState<Record<string, unknown>[]>([]);
  const [seo, setSeo] = useState<Record<string, unknown>[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [blocksText, setBlocksText] = useState("");
  const [saving, setSaving] = useState(false);
  const [robots, setRobots] = useState("");
  const [siteTitle, setSiteTitle] = useState("");
  const [metaDesc, setMetaDesc] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [socialImg, setSocialImg] = useState("");

  const load = useCallback(() => {
    call("/api/admin/crud/pages").then((d) => setPages(d.rows ?? [])).catch(() => {});
    call("/api/admin/crud/seoMeta").then((d) => setSeo(d.rows ?? [])).catch(() => {});
    call("/api/admin/settings").then((d) => {
      setSettings(d.settings ?? {});
      setRobots((d.settings ?? {}).robots_txt ?? "");
      setSiteTitle((d.settings ?? {}).site_title ?? "");
      setMetaDesc((d.settings ?? {}).meta_description ?? "");
      setLogoUrl((d.settings ?? {}).logo_url ?? "");
      setSocialImg((d.settings ?? {}).social_image ?? "");
    }).catch(() => {});
     
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const saveSetting = async (key: string, value: string) => {
    setSaving(true);
    try {
      await call("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ key, value }) });
      toast.success(`Saved ${key}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const saveBlocks = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      JSON.parse(blocksText); // validate
      await call("/api/admin/crud/pages", { method: "PATCH", body: JSON.stringify({ id: editing.id, blocks: blocksText }) });
      toast.success("Page blocks saved — live on the site");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? (e instanceof SyntaxError ? "Invalid JSON in blocks" : e.message) : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <ModuleHeader title="Website Management" sub="Page-wise visual editor, SEO manager, sitemap & robots.txt — everything auto-updates" />
      <div className="grid gap-4 lg:grid-cols-2">
        {/* pages */}
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-2 text-xs font-bold">Pages ({pages.length}) — canvas blocks per page</p>
          <div className="space-y-2">
            {pages.map((p) => (
              <div key={String(p.id)} className="flex items-center justify-between rounded-lg border p-2.5">
                <div>
                  <p className="text-xs font-bold">{String(p.title)}</p>
                  <p className="text-[10px] text-gray-400"><code>/page/{String(p.slug)}</code> · {String(p.type)} · {p.inFooter ? "in footer" : "not in footer"}</p>
                </div>
                <div className="flex gap-1.5">
                  <a href={`/page/${String(p.slug)}`} target="_blank" rel="noopener noreferrer" className="rounded-md border px-2 py-1 text-[10px] font-bold hover:bg-gray-50">View</a>
                  <button
                    onClick={() => { setEditing(p); setBlocksText(String(p.blocks || "[]")); }}
                    className="rounded-md bg-black px-2 py-1 text-[10px] font-bold text-yellow-400"
                  >
                    Edit Canvas
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-gray-400">Block types: hero (headline, sub, bg, textColor) · richtext (text) · brand-strip · deals · tabs · coupons. Homepage blocks render on / via page editor sections.</p>
        </div>

        {/* SEO + robots */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <p className="mb-2 text-xs font-bold">SEO Meta per route ({seo.length})</p>
            <div className="space-y-1.5">
              {seo.map((s) => (
                <div key={String(s.path)} className="flex items-center justify-between rounded-lg border p-2 text-xs">
                  <div className="min-w-0">
                    <code className="text-[10px] font-bold">{String(s.path)}</code>
                    <p className="truncate text-[10px] text-gray-400">{String(s.title)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${s.noindex ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>{s.noindex ? "noindex" : "index"}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-gray-400">Products & brands generate SEO meta automatically (seoTitle, seoDesc, keywords per product + JSON-LD). Manage route-level meta via CRUD → SEO Manager.</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="mb-2 text-xs font-bold">robots.txt (live at /robots.txt)</p>
            <textarea value={robots} onChange={(e) => setRobots(e.target.value)} className="h-28 w-full rounded-lg border p-2 font-mono text-[10px]" />
            <button onClick={() => saveSetting("robots_txt", robots)} disabled={saving} className="mt-2 flex items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-xs font-bold text-yellow-400 disabled:opacity-50">
              <Save className="h-3.5 w-3.5" /> Save robots.txt
            </button>
            <p className="mt-1 text-[10px] text-gray-400">{"Sitemap auto-generated at /sitemap.xml — products, brands & pages included"}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="mb-2 text-xs font-bold">Site Identity</p>
            <div className="space-y-2">
              <input value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} placeholder="Site title" className="h-9 w-full rounded-lg border px-3 text-xs" />
              <textarea value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} placeholder="Meta description" className="h-16 w-full rounded-lg border p-2 text-xs" />
              <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="Logo URL" className="h-9 w-full rounded-lg border px-3 text-xs" />
              <input value={socialImg} onChange={(e) => setSocialImg(e.target.value)} placeholder="Social share image (OG)" className="h-9 w-full rounded-lg border px-3 text-xs" />
              <div className="flex gap-2">
                <button onClick={() => saveSetting("site_title", siteTitle)} disabled={saving} className="flex-1 rounded-lg bg-black px-3 py-2 text-xs font-bold text-yellow-400">Save Title</button>
                <button onClick={() => saveSetting("meta_description", metaDesc)} disabled={saving} className="flex-1 rounded-lg bg-black px-3 py-2 text-xs font-bold text-yellow-400">Save Desc</button>
                <button onClick={() => saveSetting("logo_url", logoUrl)} disabled={saving} className="flex-1 rounded-lg bg-black px-3 py-2 text-xs font-bold text-yellow-400">Save Logo</button>
                <button onClick={() => saveSetting("social_image", socialImg)} disabled={saving} className="flex-1 rounded-lg bg-black px-3 py-2 text-xs font-bold text-yellow-400">Save OG</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* block editor dialog */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditing(null)}>
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-black">Edit Canvas — {String(editing.title)}</p>
            <p className="mb-3 text-[11px] text-gray-500">Page blocks (JSON). Each block: {"{ id, type, visible, headline, sub, text, bg, textColor }"}</p>
            <textarea value={blocksText} onChange={(e) => setBlocksText(e.target.value)} className="h-80 w-full rounded-xl border p-3 font-mono text-[11px]" spellCheck={false} />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border px-4 py-2 text-xs font-bold">Cancel</button>
              <button onClick={saveBlocks} disabled={saving} className="rounded-lg bg-black px-4 py-2 text-xs font-bold text-yellow-400 disabled:opacity-50">{saving ? "Saving…" : "Save & Publish"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════ BRAND STOREFRONTS ══════════════ */
const LAYOUTS = [
  { id: 1, name: "Classic Banner Grid", desc: "Brand banner, category chips, deals rail + top grid" },
  { id: 2, name: "Split Hero Editorial", desc: "Tall hero, editorial photo cards, bestseller rail" },
  { id: 3, name: "Dark Premium", desc: "Black & gold luxury treatment" },
  { id: 4, name: "Minimal White", desc: "Centered logo, clean grid" },
  { id: 5, name: "Promo / Offers", desc: "Deal tiles + promo cards + sections" },
  { id: 6, name: "Catalog Dense", desc: "Compact 8-col full catalog" },
  { id: 7, name: "Showcase Carousel", desc: "Horizontal rails per section" },
  { id: 8, name: "Story-Driven", desc: "Brand narrative + stats band" },
  { id: 9, name: "Category-Led", desc: "Category photo tiles first" },
  { id: 10, name: "Bold Yellow (DMK)", desc: "High-energy yellow/black brand statement" },
];

export function StorefrontsModule({ token }: { token: string }) {
  const call = api(token);
  const [brands, setBrands] = useState<Record<string, unknown>[]>([]);
  const [activeSlug, setActiveSlug] = useState<string>("");
  const [layout, setLayout] = useState(1);
  const [cfg, setCfg] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    call("/api/admin/crud/brands").then((d) => {
      setBrands(d.rows ?? []);
      if (!activeSlug && d.rows?.length) {
        setActiveSlug(String(d.rows[0].slug));
        setLayout(Number(d.rows[0].storefrontLayout) || 1);
        try { setCfg(JSON.parse(String(d.rows[0].storefrontConfig || "{}"))); } catch { setCfg({}); }
      }
    }).catch(() => {});
     
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const pick = (b: Record<string, unknown>) => {
    setActiveSlug(String(b.slug));
    setLayout(Number(b.storefrontLayout) || 1);
    try { setCfg(JSON.parse(String(b.storefrontConfig || "{}"))); } catch { setCfg({}); }
  };

  const save = async () => {
    const brand = brands.find((b) => String(b.slug) === activeSlug);
    if (!brand) return;
    setSaving(true);
    try {
      await call("/api/admin/crud/brands", { method: "PATCH", body: JSON.stringify({ id: brand.id, storefrontLayout: layout, storefrontConfig: JSON.stringify(cfg) }) });
      toast.success(`Storefront saved for ${String(brand.name)}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const filtered = brands.filter((b) => String(b.name).toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <ModuleHeader title="Brands Storefronts" sub="Pick 1 of 10 layouts per brand & edit the canvas config — the main site header stays locked" />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="rounded-xl border bg-white p-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find brand…" className="mb-2 h-9 w-full rounded-lg border px-3 text-xs" />
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">
            {filtered.map((b) => (
              <button
                key={String(b.id)}
                onClick={() => pick(b)}
                className={`w-full rounded-lg border p-2.5 text-left text-xs transition ${String(b.slug) === activeSlug ? "border-yellow-400 bg-yellow-50" : "hover:border-gray-300"}`}
              >
                <p className="font-bold">{String(b.name)}</p>
                <p className="text-[10px] text-gray-400">{String((b._count as { products: number })?.products ?? 0)} SKUs · Layout {String(b.storefrontLayout)}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <p className="mb-2 text-xs font-bold">Layout template (10 defaults)</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLayout(l.id)}
                  className={`rounded-xl border-2 p-3 text-left transition ${layout === l.id ? "border-yellow-400 bg-yellow-50" : "border-gray-100 hover:border-gray-300"}`}
                >
                  <p className="text-[11px] font-black">{l.id}. {l.name}</p>
                  <p className="mt-0.5 text-[9px] leading-tight text-gray-400">{l.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <p className="mb-2 text-xs font-bold">Canvas config — {activeSlug || "pick a brand"}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["heroHeadline", "Hero headline"],
                ["heroSub", "Hero sub-text"],
                ["bg", "Background (hex)"],
                ["accent", "Accent (hex)"],
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">{label}</span>
                  <input
                    value={String(cfg[key] ?? "")}
                    onChange={(e) => setCfg((c) => ({ ...c, [key]: e.target.value }))}
                    className="h-9 w-full rounded-lg border px-3 text-xs"
                  />
                </label>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              {(["showCategories", "showTopProducts", "showHotDeals", "showAllProducts"] as const).map((k) => (
                <label key={k} className="flex items-center gap-1.5 text-xs font-semibold">
                  <input type="checkbox" checked={cfg[k] !== false} onChange={(e) => setCfg((c) => ({ ...c, [k]: e.target.checked }))} />
                  {k.replace("show", "").replace(/([A-Z])/g, " $1")}
                </label>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={save} disabled={saving || !activeSlug} className="rounded-xl bg-black px-5 py-2.5 text-xs font-bold text-yellow-400 disabled:opacity-50">{saving ? "Saving…" : "Save & Publish Storefront"}</button>
              {activeSlug && (
                <a href={`/brand/${activeSlug}`} target="_blank" rel="noopener noreferrer" className="rounded-xl border px-5 py-2.5 text-xs font-bold hover:bg-gray-50">Preview Live →</a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
