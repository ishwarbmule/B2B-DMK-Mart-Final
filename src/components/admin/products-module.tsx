"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Download, Flame, Plus, Power, RefreshCcw, Search, ShoppingCart, Star, Trash2, TrendingUp, Upload, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader, Toggle } from "./ui-bits";
import { formatINR } from "@/lib/store";

type Row = Record<string, unknown> & {
  id: string; sku: string; name: string; image: string; slug: string;
  dealerPrice: number; mrp: number; purchaseCost: number; stock: number; packQty: number;
  isTop: boolean; isFeatured: boolean; isHot: boolean; isDeal: boolean; active: boolean;
  brand: { name: string }; syncSource: string;
  top: { name: string }; mid: { name: string }; end: { name: string };
};

type Brand = { id: string; name: string };
type Top = { id: string; name: string };

const FLAGS = [
  { key: "active", label: "Active", icon: Power, cls: "bg-blue-600" },
  { key: "isTop", label: "Top Selling", icon: TrendingUp, cls: "bg-emerald-600" },
  { key: "isFeatured", label: "Featured", icon: Star, cls: "bg-yellow-400 text-black" },
  { key: "isHot", label: "Hot Products", icon: Flame, cls: "bg-orange-500" },
  { key: "isDeal", label: "Deal of the Day", icon: Zap, cls: "bg-red-500" },
] as const;

const EMPTY_FORM = {
  name: "", sku: "", brandId: "", brandName: "", topId: "", midId: "", endId: "",
  dealerPrice: "", mrp: "", purchaseCost: "", tier1: "", tier2: "", tier3: "", tier4: "", tier5: "",
  packQty: "1", piecesPerBox: "", stock: "", barcode: "", hsn: "", gst: "18", image: "", description: "",
  isHot: false, isTop: false, isFeatured: false, isDeal: false, active: true,
};

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
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [brands, setBrands] = useState<Brand[]>([]);
  const [tops, setTops] = useState<Top[]>([]);
  const [mids, setMids] = useState<{ id: string; name: string }[]>([]);
  const [ends, setEnds] = useState<{ id: string; name: string }[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "15" });
      if (q) params.set("q", q);
      if (brand) params.set("brand", brand);
      if (flag) params.set("flag", flag);
      if (status) params.set("status", status);
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
     
  }, [token, page, q, brand, flag, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    call("/api/admin/crud/brands").then((d) => setBrands((d.rows ?? []).map((r: Record<string, unknown>) => ({ id: String(r.id), name: String(r.name) })))).catch(() => {});
    call("/api/admin/crud/tops").then((d) => setTops((d.rows ?? []).map((r: Record<string, unknown>) => ({ id: String(r.id), name: String(r.name) })))).catch(() => {});
     
  }, [token]);

  const selIds = Object.keys(sel).filter((k) => sel[k]);

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

  const saveProduct = async () => {
    setSaving(true);
    try {
      const payload = { ...form, brandName: brands.find((b) => b.id === form.brandId)?.name ?? "" };
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
      const res = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: editRow.id,
          name: editRow.name, sku: editRow.sku, dealerPrice: editRow.dealerPrice, mrp: editRow.mrp,
          purchaseCost: editRow.purchaseCost, stock: editRow.stock, packQty: editRow.packQty,
          barcode: editRow.barcode, hsn: editRow.hsn, gst: editRow.gst, image: editRow.image,
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
    const header = "SKU,Name,Brand,DealerPrice,MRP,PurchaseCost,Stock,PackQty,Flags,Active";
    const lines = rows.map((r) => [r.sku, `"${r.name.replace(/"/g, '""')}"`, r.brand?.name, r.dealerPrice, r.mrp, r.purchaseCost, r.stock, r.packQty, [r.isTop && "TOP", r.isFeatured && "FEAT", r.isHot && "HOT", r.isDeal && "DEAL"].filter(Boolean).join("|"), r.active].join(","));
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dmk-products-page${page}.csv`;
    a.click();
  };

  return (
    <div>
      <ModuleHeader title="Product Management" sub={`${total} products · bulk-manage homepage sections: Top Selling, Featured, Hot Products & Deals of the Day`}>
        <button onClick={() => setAddOpen(true)} className="flex h-9 items-center gap-1.5 rounded-lg bg-black px-3.5 text-xs font-bold text-yellow-400 hover:bg-gray-800">
          <Plus className="h-4 w-4" /> Add Product
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
        <select value={flag} onChange={(e) => { setFlag(e.target.value); setPage(1); }} className="h-9 rounded-lg border text-xs">
          <option value="">All Sections</option>
          <option value="top">Top Selling</option>
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
            {loading && <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400">Loading products…</td></tr>}
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
                  <button onClick={() => setEditRow(r)} className="rounded-md border px-2 py-1 text-[11px] font-bold hover:bg-gray-100">Edit</button>
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

      {/* add dialog */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAddOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-black">Add Single Product</p>
              <button onClick={() => setAddOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Product name *" className="col-span-2 h-9 rounded-lg border px-3 text-xs" />
              <select value={form.brandId} onChange={(e) => setForm((f) => ({ ...f, brandId: e.target.value }))} className="h-9 rounded-lg border px-2 text-xs">
                <option value="">Brand *</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} placeholder="SKU (auto if empty)" className="h-9 rounded-lg border px-3 text-xs" />
              <select value={form.topId} onChange={(e) => { setForm((f) => ({ ...f, topId: e.target.value, midId: "", endId: "" })); loadSubCats(e.target.value); }} className="h-9 rounded-lg border px-2 text-xs">
                <option value="">Top category *</option>
                {tops.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select value={form.midId} onChange={(e) => { setForm((f) => ({ ...f, midId: e.target.value, endId: "" })); loadSubCats(form.topId, e.target.value); }} className="h-9 rounded-lg border px-2 text-xs">
                <option value="">Mid category *</option>
                {mids.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select value={form.endId} onChange={(e) => setForm((f) => ({ ...f, endId: e.target.value }))} className="h-9 rounded-lg border px-2 text-xs">
                <option value="">End category *</option>
                {ends.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
              </select>
              <input value={form.purchaseCost} onChange={(e) => setForm((f) => ({ ...f, purchaseCost: e.target.value }))} placeholder="Purchase cost (admin only)" className="h-9 rounded-lg border px-3 text-xs" />
              <input value={form.dealerPrice} onChange={(e) => setForm((f) => ({ ...f, dealerPrice: e.target.value }))} placeholder="Selling price (tier4) *" className="h-9 rounded-lg border px-3 text-xs" />
              <input value={form.mrp} onChange={(e) => setForm((f) => ({ ...f, mrp: e.target.value }))} placeholder="MRP *" className="h-9 rounded-lg border px-3 text-xs" />
              <input value={form.packQty} onChange={(e) => setForm((f) => ({ ...f, packQty: e.target.value }))} placeholder="Pack qty (pcs)" className="h-9 rounded-lg border px-3 text-xs" />
              <input value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} placeholder="Stock" className="h-9 rounded-lg border px-3 text-xs" />
              <input value={form.hsn} onChange={(e) => setForm((f) => ({ ...f, hsn: e.target.value }))} placeholder="HSN" className="h-9 rounded-lg border px-3 text-xs" />
              <input value={form.gst} onChange={(e) => setForm((f) => ({ ...f, gst: e.target.value }))} placeholder="GST %" className="h-9 rounded-lg border px-3 text-xs" />
              <input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} placeholder="Barcode (auto SKU)" className="h-9 rounded-lg border px-3 text-xs" />
              <input value={form.image} onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))} placeholder="Image URL (Cloudinary)" className="col-span-2 h-9 rounded-lg border px-3 text-xs" />
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description" className="col-span-2 h-16 rounded-lg border px-3 py-2 text-xs" />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setAddOpen(false)} className="rounded-lg border px-4 py-2 text-xs font-bold">Cancel</button>
              <button onClick={saveProduct} disabled={saving} className="rounded-lg bg-black px-4 py-2 text-xs font-bold text-yellow-400 disabled:opacity-50">{saving ? "Saving…" : "Create Product"}</button>
            </div>
          </div>
        </div>
      )}

      {/* edit dialog */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditRow(null)}>
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-black">Edit — {String(editRow.sku)}</p>
              <button onClick={() => setEditRow(null)}><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([
                ["name", "Name", "text"], ["sku", "SKU", "text"],
                ["purchaseCost", "Purchase Cost (hidden)", "number"], ["dealerPrice", "Selling Price", "number"],
                ["mrp", "MRP", "number"], ["stock", "Stock", "number"],
                ["packQty", "Pack Qty", "number"], ["gst", "GST %", "number"],
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
