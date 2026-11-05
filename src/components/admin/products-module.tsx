"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Download, Flame, ImagePlus, Images, Link2, Plus, Power, RefreshCcw, Search, ShoppingCart, Star, Trash2, TrendingUp, Upload, Wand2, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader, Toggle } from "./ui-bits";
import { formatINR } from "@/lib/store";

type Row = Record<string, unknown> & {
  id: string; sku: string; name: string; image: string; slug: string;
  dealerPrice: number; mrp: number; purchaseCost: number; stock: number; packQty: number; packPrice: number;
  tier1: number; tier2: number; tier3: number; tier4: number;
  isTop: boolean; isFeatured: boolean; isHot: boolean; isDeal: boolean; active: boolean;
  brand: { name: string }; syncSource: string;
  top: { id: string; name: string }; mid: { id: string; name: string }; end: { id: string; name: string };
  unit: string; gst: number; weightGrams: number; lowStockThreshold: number; damagedStock: number; gallery: string;
};

type Brand = { id: string; name: string };
type Top = { id: string; name: string };
type EndRow = { id: string; name: string; topId: string; topName: string; midId: string; midName: string };

const FLAGS = [
  { key: "active", label: "Active", icon: Power, cls: "bg-blue-600" },
  { key: "isTop", label: "Ready to Dispatch", icon: TrendingUp, cls: "bg-emerald-600" },
  { key: "isFeatured", label: "Featured", icon: Star, cls: "bg-yellow-400 text-black" },
  { key: "isHot", label: "Hot Products", icon: Flame, cls: "bg-orange-500" },
  { key: "isDeal", label: "Deal of the Day", icon: Zap, cls: "bg-red-500" },
] as const;

const UNITS = ["Pcs", "Box", "Set", "Pair", "Pack", "Dozen", "Metre", "Kg", "Litre"];

const EMPTY_FORM = {
  name: "", sku: "", brandId: "", brandName: "", topId: "", midId: "", endId: "",
  unit: "Pcs", packQty: "1", piecesPerBox: "",
  dealerPrice: "", mrp: "", purchaseCost: "", tier1: "", tier2: "", tier3: "", tier4: "", tier5: "", packPrice: "", dealPrice: "",
  stock: "", lowStockThreshold: "10", damagedStock: "", barcode: "", hsn: "", gst: "18", weightGrams: "",
  image: "", description: "", seoTitle: "", seoDesc: "", keywords: "",
  isHot: false, isTop: false, isFeatured: false, isDeal: false, active: true,
};

const inputCls = "h-9 w-full rounded-lg border px-3 text-xs outline-none focus:border-yellow-400";

/* small labelled form field */
function Field({ label, hint, children, span }: { label: string; hint?: string; children: React.ReactNode; span?: boolean }) {
  return (
    <label className={`block ${span ? "col-span-2" : ""}`}>
      <span className="mb-1 flex items-baseline gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</span>
        {hint && <span className="text-[9px] text-gray-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/* numbered section card inside the dialogs */
function Section({ n, title, sub, children }: { n: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-100 p-3">
      <p className="mb-2.5 flex items-center gap-2">
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded bg-black text-[10px] font-black text-yellow-400">{n}</span>
        <span className="text-[11px] font-black uppercase tracking-wide text-gray-700">{title}</span>
        {sub && <span className="text-[9px] font-semibold text-gray-400">{sub}</span>}
      </p>
      {children}
    </div>
  );
}

export function ProductsModule({ token }: { token: string }) {
  const call = api(token);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const [flag, setFlag] = useState("");
  const [status, setStatus] = useState("");
  const [catTop, setCatTop] = useState("");
  const [catEnd, setCatEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [brands, setBrands] = useState<Brand[]>([]);
  const [tops, setTops] = useState<Top[]>([]);
  const [allEnds, setAllEnds] = useState<EndRow[]>([]);
  const [mids, setMids] = useState<{ id: string; name: string }[]>([]);
  const [ends, setEnds] = useState<{ id: string; name: string }[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [gallery, setGallery] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [editGallery, setEditGallery] = useState<string[]>([]);
  const [editTopId, setEditTopId] = useState("");
  const [editMidId, setEditMidId] = useState("");
  const [editEndId, setEditEndId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "15" });
      if (q) params.set("q", q);
      if (brand) params.set("brand", brand);
      if (flag) params.set("flag", flag);
      if (status) params.set("status", status);
      if (catTop) params.set("top", catTop);
      if (catEnd) params.set("end", catEnd);
      const d = await call(`/api/admin/products?${params}`);
      setRows(d.rows ?? []);
      setTotal(d.total ?? 0);
      setPages(d.pages ?? 1);
      setSel({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }

  }, [token, page, q, brand, flag, status, catTop, catEnd]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    call("/api/admin/crud/brands").then((d) => setBrands((d.rows ?? []).map((r: Record<string, unknown>) => ({ id: String(r.id), name: String(r.name) })))).catch(() => {});
    call("/api/admin/crud/tops").then((d) => setTops((d.rows ?? []).map((r: Record<string, unknown>) => ({ id: String(r.id), name: String(r.name) })))).catch(() => {});
    // all end categories (with their department) — powers the category filter in the toolbar
    call("/api/admin/crud/ends").then((d) =>
      setAllEnds((d.rows ?? []).map((r: Record<string, unknown>) => {
        const mid = r.mid as { id?: string; name?: string; top?: { id?: string; name?: string } } | undefined;
        return {
          id: String(r.id), name: String(r.name),
          topId: String(mid?.top?.id ?? ""), topName: String(mid?.top?.name ?? ""),
          midId: String(mid?.id ?? ""), midName: String(mid?.name ?? ""),
        };
      })),
    ).catch(() => {});
  }, [token]);

  const selIds = Object.keys(sel).filter((k) => sel[k]);

  /* Cloudinary upload — product images land in dmk-mart/products */
  const uploadImage = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", "products");
    const res = await fetch("/api/admin/upload", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: fd });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Upload failed");
    return String(d.url);
  };

  const uploadMain = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setForm((f) => ({ ...f, image: url }));
      toast.success("Main image uploaded to Cloudinary");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const uploadGalleryFiles = async (files: FileList, mode: "add" | "edit") => {
    setUploading(true);
    try {
      const room = 10 - (mode === "add" ? gallery.length : editGallery.length);
      const list = Array.from(files).slice(0, Math.max(0, room));
      if (!list.length) { toast.error("Gallery holds up to 10 images"); return; }
      const urls: string[] = [];
      for (const f of list) urls.push(await uploadImage(f));
      if (mode === "add") setGallery((g) => [...g, ...urls]);
      else setEditGallery((g) => [...g, ...urls]);
      toast.success(`${urls.length} gallery image${urls.length > 1 ? "s" : ""} uploaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const bulkFlag = async (f: string, value: boolean) => {
    if (!selIds.length) return toast.error("Select products first (checkboxes)");
    try {
      const res = await fetch("/api/admin/products/flags", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: selIds, flag: f, value }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast.success(`${value ? "Added to" : "Removed from"} ${f.replace("is", "")} — ${d.count} products`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk failed");
    }
  };

  const bulkDelete = async () => {
    if (!selIds.length) return toast.error("Select products first");
    if (!confirm(`Delete ${selIds.length} products permanently?`)) return;
    for (const id of selIds) {
      await fetch(`/api/admin/products?id=${id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
    }
    toast.success(`${selIds.length} products deleted`);
    load();
  };

  const loadSubCats = async (topId: string, midId?: string) => {
    if (topId) {
      const d = await call("/api/admin/crud/mids");
      const list = (d.rows ?? []).filter((r: Record<string, unknown>) => (r.top as { id: string })?.id === topId);
      setMids(list.map((r: Record<string, unknown>) => ({ id: String(r.id), name: String(r.name) })));
    } else setMids([]);
    if (midId) {
      const d = await call("/api/admin/crud/ends");
      const list = (d.rows ?? []).filter((r: Record<string, unknown>) => (r.mid as { id: string })?.id === midId);
      setEnds(list.map((r: Record<string, unknown>) => ({ id: String(r.id), name: String(r.name) })));
    } else setEnds([]);
  };

  const openEdit = (r: Row) => {
    setEditRow(r);
    setEditTopId(r.top?.id ?? "");
    setEditMidId(r.mid?.id ?? "");
    setEditEndId(r.end?.id ?? "");
    let g: string[] = [];
    try {
      const parsed = JSON.parse(r.gallery || "[]");
      if (Array.isArray(parsed)) g = parsed.filter((u): u is string => typeof u === "string");
    } catch { /* ignore */ }
    setEditGallery(g);
    loadSubCats(r.top?.id ?? "", r.mid?.id ?? "");
  };

  const saveProduct = async () => {
    if (!form.name || !form.brandId || !form.topId || !form.midId || !form.endId) {
      return toast.error("Name, Brand and all three category levels are required");
    }
    if (!form.dealerPrice || !form.mrp) return toast.error("Selling price and MRP are required");
    setSaving(true);
    try {
      const payload = {
        ...form,
        brandName: brands.find((b) => b.id === form.brandId)?.name ?? "",
        gallery,
      };
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast.success(`Product "${d.row.name}" created`);
      setAddOpen(false);
      setForm({ ...EMPTY_FORM });
      setGallery([]);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      const catPatch: Record<string, string> = {};
      if (editTopId) catPatch.topId = editTopId;
      if (editMidId) catPatch.midId = editMidId;
      if (editEndId) catPatch.endId = editEndId;
      const res = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: editRow.id,
          name: editRow.name, sku: editRow.sku, dealerPrice: editRow.dealerPrice, mrp: editRow.mrp,
          purchaseCost: editRow.purchaseCost, stock: editRow.stock, packQty: editRow.packQty, packPrice: editRow.packPrice,
          tier1: editRow.tier1, tier2: editRow.tier2, tier3: editRow.tier3, tier4: editRow.tier4,
          barcode: editRow.barcode, hsn: editRow.hsn, image: editRow.image,
          unit: editRow.unit || "Pcs", gst: editRow.gst, weightGrams: editRow.weightGrams,
          lowStockThreshold: editRow.lowStockThreshold, damagedStock: editRow.damagedStock,
          gallery: JSON.stringify(editGallery),
          ...catPatch,
          isTop: editRow.isTop, isFeatured: editRow.isFeatured, isHot: editRow.isHot, isDeal: editRow.isDeal, active: editRow.active,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast.success("Product updated");
      setEditRow(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const header = "SKU,Name,Brand,Category,Cost,DealerPrice,MRP,Stock,PackQty,Flags,Active";
    const lines = rows.map((r) => [r.sku, `"${r.name.replace(/"/g, '""')}"`, r.brand?.name, `"${r.top?.name ?? ""} > ${r.mid?.name ?? ""} > ${r.end?.name ?? ""}"`, r.purchaseCost, r.dealerPrice, r.mrp, r.stock, r.packQty, [r.isTop && "TOP", r.isFeatured && "FEAT", r.isHot && "HOT", r.isDeal && "DEAL"].filter(Boolean).join("|"), r.active].join(","));
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dmk-products-page${page}.csv`;
    a.click();
  };

  const filterEnds = catTop ? allEnds.filter((e) => e.topId === catTop) : allEnds;

  return (
    <div>
      <ModuleHeader title="Product Management" sub={`${total} products · add products with Cloudinary images, organised as per categories · bulk-manage homepage sections`}>
        <button onClick={() => { setForm({ ...EMPTY_FORM }); setGallery([]); setMids([]); setEnds([]); setAddOpen(true); }} className="flex h-9 items-center gap-1.5 rounded-lg bg-black px-3.5 text-xs font-bold text-yellow-400 hover:bg-gray-800">
          <Plus className="h-4 w-4" /> Add Products
        </button>
        <button onClick={exportCsv} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-gray-50">
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
        <button onClick={load} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-gray-50">
          <RefreshCcw className="h-3.5 w-3.5" />
        </button>
      </ModuleHeader>

      {/* filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name / SKU / barcode…" className="h-9 w-60 rounded-lg border pl-8 text-xs outline-none focus:border-yellow-400" />
        </div>
        <select value={brand} onChange={(e) => { setBrand(e.target.value); setPage(1); }} className="h-9 rounded-lg border text-xs">
          <option value="">All Brands</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={catTop} onChange={(e) => { setCatTop(e.target.value); setCatEnd(""); setPage(1); }} className="h-9 rounded-lg border text-xs">
          <option value="">All Departments</option>
          {tops.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={catEnd} onChange={(e) => { setCatEnd(e.target.value); setPage(1); }} className="h-9 max-w-[220px] rounded-lg border text-xs">
          <option value="">All End Categories</option>
          {filterEnds.map((e) => <option key={e.id} value={e.id}>{e.topName ? `${e.topName} › ` : ""}{e.name}</option>)}
        </select>
        <select value={flag} onChange={(e) => { setFlag(e.target.value); setPage(1); }} className="h-9 rounded-lg border text-xs">
          <option value="">All Sections</option>
          <option value="top">Ready to Dispatch</option>
          <option value="featured">Featured</option>
          <option value="hot">Hot</option>
          <option value="deal">Deals</option>
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-9 rounded-lg border text-xs">
          <option value="">Any Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="lowstock">Low Stock</option>
        </select>
      </div>

      {/* bulk toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-yellow-300 bg-yellow-50 p-2.5">
        <span className="text-[11px] font-black uppercase tracking-wide text-gray-600">Bulk set {selIds.length > 0 ? `(${selIds.length} selected)` : "(select rows below)"} →</span>
        {FLAGS.map((f) => (
          <div key={f.key} className="flex items-center gap-1 rounded-lg border bg-white px-2 py-1">
            <f.icon className="h-3.5 w-3.5 text-yellow-600" />
            <span className="text-[11px] font-bold">{f.label}</span>
            <button onClick={() => bulkFlag(f.key, true)} className="rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-black text-white">ON</button>
            <button onClick={() => bulkFlag(f.key, false)} className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-black text-gray-600">OFF</button>
          </div>
        ))}
        <button onClick={bulkDelete} className="ml-auto flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50">
          <Trash2 className="h-3.5 w-3.5" /> Delete Selected
        </button>
      </div>

      {/* table */}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-2 py-2.5"><input type="checkbox" checked={rows.length > 0 && selIds.length === rows.length} onChange={(e) => setSel(Object.fromEntries(rows.map((r) => [r.id, e.target.checked])))} /></th>
              <th className="px-2 py-2.5">Product</th>
              <th className="px-2 py-2.5">Brand</th>
              <th className="px-2 py-2.5">Category</th>
              <th className="px-2 py-2.5 text-right">Cost</th>
              <th className="px-2 py-2.5 text-right">Price</th>
              <th className="px-2 py-2.5 text-right">MRP</th>
              <th className="px-2 py-2.5 text-right">Stock</th>
              <th className="px-2 py-2.5">Sections</th>
              <th className="px-2 py-2.5">Live</th>
              <th className="px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={11} className="px-4 py-10 text-center text-gray-400">Loading products…</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className={`border-t ${sel[r.id] ? "bg-yellow-50/50" : "hover:bg-gray-50/60"}`}>
                <td className="px-2 py-2"><input type="checkbox" checked={!!sel[r.id]} onChange={(e) => setSel((s) => ({ ...s, [r.id]: e.target.checked }))} /></td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    {r.image && <Image src={r.image} alt="" width={30} height={30} className="h-8 w-8 rounded object-cover" unoptimized />}
                    <div className="min-w-0">
                      <p className="max-w-[220px] truncate font-semibold">{r.name}</p>
                      <p className="text-[10px] text-gray-400">{r.sku} · {r.syncSource}{r.isDeal ? " · DEAL" : ""}</p>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2">{r.brand?.name}</td>
                <td className="px-2 py-2">
                  <span className="block max-w-[150px] truncate text-[11px] text-gray-600" title={`${r.top?.name ?? ""} › ${r.mid?.name ?? ""} › ${r.end?.name ?? ""}`}>
                    {r.end?.name ? <span className="font-semibold text-gray-800">{r.end.name}</span> : "—"}
                    <span className="block text-[9px] text-gray-400">{r.top?.name ?? ""}</span>
                  </span>
                </td>
                <td className="px-2 py-2 text-right text-gray-500">{formatINR(r.purchaseCost)}</td>
                <td className="px-2 py-2 text-right font-bold">{formatINR(r.dealerPrice)}</td>
                <td className="px-2 py-2 text-right text-gray-500">{formatINR(r.mrp)}</td>
                <td className={`px-2 py-2 text-right font-semibold ${r.stock <= 10 ? "text-red-500" : ""}`}>{r.stock}</td>
                <td className="px-2 py-2">
                  <div className="flex gap-1">
                    {FLAGS.map((f) => (
                      <button
                        key={f.key}
                        title={`${f.label}: ${r[f.key] ? "on" : "off"}`}
                        onClick={() =>
                          fetch("/api/admin/products/flags", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ ids: [r.id], flag: f.key, value: !r[f.key] }) })
                            .then(() => { toast.success(`${r.sku} ${f.label} ${r[f.key] ? "off" : "on"}`); load(); })
                        }
                        className={`flex h-6 w-6 items-center justify-center rounded-md text-[9px] font-black ${r[f.key] ? `${f.cls} text-white` : "bg-gray-100 text-gray-300"}`}
                      >
                        <f.icon className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <Toggle
                    checked={r.active}
                    onChange={(v) =>
                      fetch("/api/admin/products", { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ id: r.id, active: v }) })
                        .then(() => load())
                    }
                  />
                </td>
                <td className="px-2 py-2">
                  <button onClick={() => openEdit(r)} className="rounded-md border px-2 py-1 text-[11px] font-bold hover:bg-gray-100">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 text-xs">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border px-3 py-1.5 font-semibold disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <span className="font-semibold text-gray-600">Page {page} / {pages} · {total} products</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border px-3 py-1.5 font-semibold disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* ───────────── ADD PRODUCTS — full detail form, category-first, Cloudinary images ───────────── */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAddOpen(false)}>
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-base font-black">Add Products</p>
                <p className="text-[11px] text-gray-400">All required details · images stored on Cloudinary · organised as per categories</p>
              </div>
              <button onClick={() => setAddOpen(false)}><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-3">
              {/* 1 — categories */}
              <Section n={1} title="Categories" sub="product is filed under all three levels">
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Department (Top) *">
                    <select value={form.topId} onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, topId: v, midId: "", endId: "" })); loadSubCats(v); }} className={inputCls}>
                      <option value="">Select…</option>
                      {tops.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Sub-Department (Mid) *">
                    <select value={form.midId} onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, midId: v, endId: "" })); loadSubCats(form.topId, v); }} className={inputCls} disabled={!form.topId}>
                      <option value="">{form.topId ? "Select…" : "Pick department first"}</option>
                      {mids.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </Field>
                  <Field label="End Category *">
                    <select value={form.endId} onChange={(e) => setForm((f) => ({ ...f, endId: e.target.value }))} className={inputCls} disabled={!form.midId}>
                      <option value="">{form.midId ? "Select…" : "Pick sub-department first"}</option>
                      {ends.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Brand *">
                  <select value={form.brandId} onChange={(e) => setForm((f) => ({ ...f, brandId: e.target.value }))} className={inputCls}>
                    <option value="">Select brand…</option>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </Field>
              </Section>

              {/* 2 — images */}
              <Section n={2} title="Images" sub="stored on Cloudinary → dmk-mart/products">
                <div className="flex items-start gap-3">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-gray-50">
                    {form.image ? <Image src={form.image} alt="" width={80} height={80} className="h-full w-full object-cover" unoptimized /> : <ImagePlus className="h-6 w-6 text-gray-300" />}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-black px-3 text-xs font-bold text-yellow-400 ${uploading ? "opacity-50" : ""}`}>
                        <Upload className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Upload main image"}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMain(f); e.target.value = ""; }} />
                      </label>
                      <div className="relative flex h-9 flex-1 items-center">
                        <Link2 className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-gray-300" />
                        <input value={form.image} onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))} placeholder="…or paste an image URL" className={`${inputCls} pl-8`} />
                      </div>
                    </div>
                    <div>
                      <label className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-xs font-bold ${uploading ? "opacity-50" : ""}`}>
                        <Images className="h-3.5 w-3.5 text-yellow-600" /> Add gallery images (up to 10)
                        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) uploadGalleryFiles(e.target.files, "add"); e.target.value = ""; }} />
                      </label>
                      {gallery.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {gallery.map((u, i) => (
                            <span key={u + i} className="group relative">
                              <Image src={u} alt="" width={40} height={40} className="h-10 w-10 rounded border object-cover" unoptimized />
                              <button onClick={() => setGallery((g) => g.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-500 text-white">
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Section>

              {/* 3 — basic details */}
              <Section n={3} title="Basic Details">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Field label="Product name *" span>
                    <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Steel King Bucket Mop — Rod" className={inputCls} />
                  </Field>
                  <Field label="SKU" hint="auto if empty">
                    <input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} placeholder="SKU" className={inputCls} />
                  </Field>
                  <Field label="Unit">
                    <select value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} className={inputCls}>
                      {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </Field>
                  <Field label="Pack qty" hint="pcs / pack">
                    <input value={form.packQty} onChange={(e) => setForm((f) => ({ ...f, packQty: e.target.value }))} inputMode="numeric" className={inputCls} />
                  </Field>
                  <Field label="Pieces per box">
                    <input value={form.piecesPerBox} onChange={(e) => setForm((f) => ({ ...f, piecesPerBox: e.target.value }))} inputMode="numeric" className={inputCls} />
                  </Field>
                  <Field label="Barcode" hint="auto = SKU">
                    <input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} className={inputCls} />
                  </Field>
                </div>
              </Section>

              {/* 4 — pricing */}
              <Section n={4} title="Pricing" sub="tier prices never leave the customer's own slab">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Field label="Purchase cost" hint="admin only">
                    <input value={form.purchaseCost} onChange={(e) => setForm((f) => ({ ...f, purchaseCost: e.target.value }))} inputMode="decimal" className={inputCls} />
                  </Field>
                  <Field label="Selling price (tier4) *">
                    <input value={form.dealerPrice} onChange={(e) => setForm((f) => ({ ...f, dealerPrice: e.target.value }))} inputMode="decimal" className={inputCls} />
                  </Field>
                  <Field label="MRP *">
                    <input value={form.mrp} onChange={(e) => setForm((f) => ({ ...f, mrp: e.target.value }))} inputMode="decimal" className={inputCls} />
                  </Field>
                  <Field label="Pack price ₹/pack" hint="pickup pack rate">
                    <input value={form.packPrice} onChange={(e) => setForm((f) => ({ ...f, packPrice: e.target.value }))} inputMode="decimal" className={inputCls} />
                  </Field>
                  <Field label="Deal price" hint="deal of the day">
                    <input value={form.dealPrice} onChange={(e) => setForm((f) => ({ ...f, dealPrice: e.target.value }))} inputMode="decimal" className={inputCls} />
                  </Field>
                  <div className="flex items-end">
                    <button
                      onClick={() => setForm((f) => ({ ...f, tier4: f.dealerPrice, tier5: f.mrp }))}
                      className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-yellow-300 bg-yellow-50 px-3 text-xs font-bold text-gray-700 hover:bg-yellow-100"
                    >
                      <Wand2 className="h-3.5 w-3.5 text-yellow-600" /> Auto-fill tiers
                    </button>
                  </div>
                  <Field label="Tier 1 — Distributor ₹">
                    <input value={form.tier1} onChange={(e) => setForm((f) => ({ ...f, tier1: e.target.value }))} inputMode="decimal" className={inputCls} />
                  </Field>
                  <Field label="Tier 2 — Wholesale ₹">
                    <input value={form.tier2} onChange={(e) => setForm((f) => ({ ...f, tier2: e.target.value }))} inputMode="decimal" className={inputCls} />
                  </Field>
                  <Field label="Tier 3 — Semi-Wholesale ₹">
                    <input value={form.tier3} onChange={(e) => setForm((f) => ({ ...f, tier3: e.target.value }))} inputMode="decimal" className={inputCls} />
                  </Field>
                  <Field label="Tier 4 — Retailer ₹">
                    <input value={form.tier4} onChange={(e) => setForm((f) => ({ ...f, tier4: e.target.value }))} inputMode="decimal" className={inputCls} />
                  </Field>
                  <Field label="Tier 5 — MRP ₹">
                    <input value={form.tier5} onChange={(e) => setForm((f) => ({ ...f, tier5: e.target.value }))} inputMode="decimal" className={inputCls} />
                  </Field>
                </div>
              </Section>

              {/* 5 — inventory & compliance */}
              <Section n={5} title="Inventory & Compliance">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Field label="Stock (pcs)">
                    <input value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} inputMode="numeric" className={inputCls} />
                  </Field>
                  <Field label="Low-stock alert at">
                    <input value={form.lowStockThreshold} onChange={(e) => setForm((f) => ({ ...f, lowStockThreshold: e.target.value }))} inputMode="numeric" className={inputCls} />
                  </Field>
                  <Field label="Damaged stock">
                    <input value={form.damagedStock} onChange={(e) => setForm((f) => ({ ...f, damagedStock: e.target.value }))} inputMode="numeric" className={inputCls} />
                  </Field>
                  <Field label="HSN code">
                    <input value={form.hsn} onChange={(e) => setForm((f) => ({ ...f, hsn: e.target.value }))} className={inputCls} />
                  </Field>
                  <Field label="GST %">
                    <input value={form.gst} onChange={(e) => setForm((f) => ({ ...f, gst: e.target.value }))} inputMode="decimal" className={inputCls} />
                  </Field>
                  <Field label="Weight (g)">
                    <input value={form.weightGrams} onChange={(e) => setForm((f) => ({ ...f, weightGrams: e.target.value }))} inputMode="decimal" className={inputCls} />
                  </Field>
                </div>
              </Section>

              {/* 6 — listing flags, description & SEO */}
              <Section n={6} title="Listing & SEO">
                <div className="mb-2 flex flex-wrap gap-3">
                  {FLAGS.map((f) => (
                    <label key={f.key} className="flex items-center gap-1.5 text-xs font-semibold">
                      <Toggle checked={form[f.key]} onChange={(v) => setForm((fd) => ({ ...fd, [f.key]: v }))} /> {f.label}
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <Field label="Description" span>
                    <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Material, sizes, pack contents, use-cases…" className="h-16 w-full rounded-lg border px-3 py-2 text-xs" />
                  </Field>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <Field label="SEO title">
                      <input value={form.seoTitle} onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label="SEO description">
                      <input value={form.seoDesc} onChange={(e) => setForm((f) => ({ ...f, seoDesc: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label="Keywords" hint="comma separated">
                      <input value={form.keywords} onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))} className={inputCls} />
                    </Field>
                  </div>
                </div>
              </Section>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <p className="text-[10px] text-gray-400">* required · images upload straight to Cloudinary</p>
              <div className="flex gap-2">
                <button onClick={() => setAddOpen(false)} className="rounded-lg border px-4 py-2 text-xs font-bold">Cancel</button>
                <button onClick={saveProduct} disabled={saving || uploading} className="rounded-lg bg-black px-4 py-2 text-xs font-bold text-yellow-400 disabled:opacity-50">{saving ? "Saving…" : "Create Product"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* edit dialog */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditRow(null)}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-black">Edit — {String(editRow.sku)}</p>
              <button onClick={() => setEditRow(null)}><X className="h-5 w-5" /></button>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-2">
              <Field label="Department">
                <select value={editTopId} onChange={(e) => { setEditTopId(e.target.value); setEditMidId(""); setEditEndId(""); loadSubCats(e.target.value); }} className={inputCls}>
                  <option value="">—</option>
                  {tops.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Sub-Department">
                <select value={editMidId} onChange={(e) => { setEditMidId(e.target.value); setEditEndId(""); loadSubCats(editTopId, e.target.value); }} className={inputCls} disabled={!editTopId}>
                  <option value="">—</option>
                  {mids.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
              <Field label="End category">
                <select value={editEndId} onChange={(e) => setEditEndId(e.target.value)} className={inputCls} disabled={!editMidId}>
                  <option value="">—</option>
                  {ends.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([
                ["name", "Name", "text"], ["sku", "SKU", "text"],
                ["purchaseCost", "Purchase Cost (hidden)", "number"], ["dealerPrice", "Selling Price (tier4)", "number"],
                ["mrp", "MRP", "number"], ["packPrice", "Pack Price ₹/pack", "number"],
                ["tier1", "Tier 1 — Distributor ₹", "number"], ["tier2", "Tier 2 — Wholesale ₹", "number"],
                ["tier3", "Tier 3 — Semi-Wholesale ₹", "number"], ["tier4", "Tier 4 — Retailer ₹", "number"],
                ["stock", "Stock", "number"],
                ["packQty", "Pack Qty", "number"],
                ["barcode", "Barcode", "text"], ["hsn", "HSN", "text"], ["image", "Image URL", "text"],
              ] as const).map(([key, label, type]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">{label}</span>
                  <input
                    type={type}
                    value={String(editRow[key] ?? "")}
                    onChange={(e) => setEditRow({ ...editRow, [key]: type === "number" ? Number(e.target.value) : e.target.value })}
                    className="h-9 w-full rounded-lg border px-3 text-xs"
                  />
                </label>
              ))}
              <Field label="Unit">
                <select value={String(editRow.unit || "Pcs")} onChange={(e) => setEditRow({ ...editRow, unit: e.target.value })} className={inputCls}>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>
              {([
                ["gst", "GST %"], ["weightGrams", "Weight (g)"], ["lowStockThreshold", "Low-stock alert at"], ["damagedStock", "Damaged stock"],
              ] as const).map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    type="number"
                    value={String(editRow[key] ?? 0)}
                    onChange={(e) => setEditRow({ ...editRow, [key]: Number(e.target.value) })}
                    className="h-9 w-full rounded-lg border px-3 text-xs"
                  />
                </Field>
              ))}
            </div>
            {/* main image upload */}
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-gray-100 p-2.5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-gray-50">
                {editRow.image ? <Image src={editRow.image} alt="" width={56} height={56} className="h-full w-full object-cover" unoptimized /> : <ImagePlus className="h-5 w-5 text-gray-300" />}
              </div>
              <label className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-black px-3 text-xs font-bold text-yellow-400 ${uploading ? "opacity-50" : ""}`}>
                <Upload className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Replace main image"}
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setUploading(true);
                  try { setEditRow({ ...editRow, image: await uploadImage(f) }); toast.success("Main image updated"); }
                  catch (err) { toast.error(err instanceof Error ? err.message : "Upload failed"); }
                  finally { setUploading(false); }
                }} />
              </label>
            </div>
            {/* gallery editor */}
            <div className="mt-2 rounded-xl border border-gray-100 p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Gallery ({editGallery.length}/10)</p>
                <label className={`flex h-7 cursor-pointer items-center gap-1 rounded-lg border px-2 text-[11px] font-bold ${uploading ? "opacity-50" : ""}`}>
                  <Images className="h-3 w-3 text-yellow-600" /> Add images
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) uploadGalleryFiles(e.target.files, "edit"); e.target.value = ""; }} />
                </label>
              </div>
              {editGallery.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {editGallery.map((u, i) => (
                    <span key={u + i} className="relative">
                      <Image src={u} alt="" width={40} height={40} className="h-10 w-10 rounded border object-cover" unoptimized />
                      <button onClick={() => setEditGallery((g) => g.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-gray-400">No gallery images yet.</p>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-4">
              {FLAGS.map((f) => (
                <label key={f.key} className="flex items-center gap-1.5 text-xs font-semibold">
                  <Toggle checked={!!editRow[f.key]} onChange={(v) => setEditRow({ ...editRow, [f.key]: v })} /> {f.label}
                </label>
              ))}
              <label className="flex items-center gap-1.5 text-xs font-semibold">
                <Toggle checked={editRow.active} onChange={(v) => setEditRow({ ...editRow, active: v })} /> Active
              </label>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setEditRow(null)} className="rounded-lg border px-4 py-2 text-xs font-bold">Cancel</button>
              <button onClick={saveEdit} disabled={saving} className="rounded-lg bg-black px-4 py-2 text-xs font-bold text-yellow-400 disabled:opacity-50">{saving ? "Saving…" : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
