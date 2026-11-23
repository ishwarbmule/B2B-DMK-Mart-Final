"use client";

/**
 * Warehouses module — Super Admin CRUD for godowns.
 * ERP godowns mirror themselves on Inventory Sync → Re-sync now (source "ERP");
 * anything created here stays "LOCAL". "View Products" opens a read-only
 * snapshot of that warehouse's WarehouseStock ⋈ Product rows — quantities
 * themselves are edited in the Warehouse Stock module.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Loader2, MapPin, Package, Pencil, Phone, Plus, RefreshCcw, Search, Star, Trash2,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader } from "./ui-bits";
import { formatINR } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type Wh = {
  id: string; name: string; code: string; source: string;
  address: string; city: string; phone: string;
  isDefault: boolean; active: boolean; sortOrder: number;
  createdAt: string; updatedAt: string;
  productCount: number; totalStock: number;
};

type ProductRow = {
  stockId: string; productId: string; sku: string; name: string; image: string;
  qty: number; unit: string; packQty: number; dealerPrice: number; mrp: number; stock: number;
};

type FormState = { name: string; code: string; city: string; address: string; phone: string; sortOrder: string; isDefault: boolean; active: boolean };
const EMPTY_FORM: FormState = { name: "", code: "", city: "", address: "", phone: "", sortOrder: "0", isDefault: false, active: true };

const slimScroll = "[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700";

export function WarehousesModule({ token }: { token: string }) {
  const call = useMemo(() => api(token), [token]);
  const [whs, setWhs] = useState<Wh[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Wh | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<{ id: string; name: string } | null>(null);
  const [detail, setDetail] = useState<ProductRow[] | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    call("/api/admin/warehouses")
      .then((d) => setWhs(d.warehouses ?? []))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load warehouses"));
  }, [call]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setFormOpen(true); };

  const openEdit = (w: Wh) => {
    setEditing(w);
    setForm({ name: w.name, code: w.code, city: w.city, address: w.address, phone: w.phone, sortOrder: String(w.sortOrder), isDefault: w.isDefault, active: w.active });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim(), code: form.code.trim(), sortOrder: Number(form.sortOrder) || 0 };
      if (editing) {
        await call(`/api/admin/warehouses/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast.success(`Saved "${form.name}"`);
      } else {
        await call("/api/admin/warehouses", { method: "POST", body: JSON.stringify(payload) });
        toast.success(`Warehouse "${form.name}" created`);
      }
      setFormOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // optimistic toggle — flip immediately, roll back + toast when the PATCH fails
  const toggleActive = async (w: Wh) => {
    const next = !w.active;
    setWhs((list) => (list ?? []).map((x) => (x.id === w.id ? { ...x, active: next } : x)));
    try {
      await call(`/api/admin/warehouses/${w.id}`, { method: "PATCH", body: JSON.stringify({ active: next }) });
      toast.success(`${w.name} ${next ? "activated" : "deactivated"}`);
    } catch (e) {
      setWhs((list) => (list ?? []).map((x) => (x.id === w.id ? { ...x, active: !next } : x)));
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    }
  };

  const remove = async (w: Wh) => {
    if (!confirm(`Delete warehouse "${w.name}"? This cannot be undone.`)) return;
    try {
      await call(`/api/admin/warehouses/${w.id}`, { method: "DELETE" });
      toast.success(`Deleted "${w.name}"`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const openProducts = (w: Wh) => {
    setViewing({ id: w.id, name: w.name });
    setDetail(null);
    setQ("");
    call(`/api/admin/warehouses?id=${w.id}`)
      .then((d) => setDetail(d.products ?? []))
      .catch((e) => { toast.error(e instanceof Error ? e.message : "Failed to load stock"); setViewing(null); });
  };

  const qNorm = q.trim().toLowerCase();
  const filtered = (detail ?? []).filter((p) => !qNorm || `${p.name} ${p.sku}`.toLowerCase().includes(qNorm));
  const detailUnits = (detail ?? []).reduce((s, p) => s + p.qty, 0);

  return (
    <div>
      <ModuleHeader title="Warehouses" sub="ERP godowns mirror automatically on Inventory Sync → Re-sync now. LOCAL godowns are managed here.">
        <button onClick={load} className="flex h-11 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-semibold hover:bg-gray-50">
          <RefreshCcw className={`h-3.5 w-3.5 ${whs === null ? "animate-spin" : ""}`} /> Refresh
        </button>
        <button onClick={openAdd} className="flex h-11 items-center gap-1.5 rounded-lg bg-yellow-400 px-3.5 text-xs font-semibold text-black hover:bg-yellow-300">
          <Plus className="h-4 w-4" /> Add Warehouse
        </button>
      </ModuleHeader>

      {whs === null ? (
        <div className="flex h-40 items-center justify-center rounded-xl border bg-white">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : whs.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-gray-400">
          No warehouses yet — press “Add Warehouse” for a LOCAL godown, or run Inventory Sync → Re-sync now to mirror ERP godowns.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {whs.map((w) => (
            <div key={w.id} className={`flex flex-col rounded-xl border bg-white p-4 ${w.active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    <WarehouseIcon className="h-4 w-4 shrink-0 text-yellow-500" />
                    <span className="truncate">{w.name}</span>
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {w.code && <span className="rounded bg-gray-900 px-1.5 py-0.5 font-mono text-[10px] font-bold text-yellow-400">{w.code}</span>}
                    {w.source === "ERP"
                      ? <Badge className="border-transparent bg-black px-1.5 text-[10px] text-yellow-400">ERP</Badge>
                      : <Badge variant="outline" className="border-gray-300 px-1.5 text-[10px] text-gray-500">LOCAL</Badge>}
                    {w.isDefault && <Badge className="border-transparent bg-yellow-400 px-1.5 text-[10px] text-black"><Star className="h-3 w-3" /> DEFAULT</Badge>}
                    {!w.active && <Badge variant="outline" className="border-red-200 px-1.5 text-[10px] text-red-600">INACTIVE</Badge>}
                  </div>
                </div>
                {w.source === "LOCAL" && w.productCount === 0 && (
                  <button
                    onClick={() => remove(w)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                    title="Delete — LOCAL godowns with no stock only"
                    aria-label={`Delete ${w.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="mt-2.5 space-y-1 text-[11px] text-gray-600">
                {w.city && <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3 shrink-0 text-gray-400" /> {w.city}</p>}
                {w.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 shrink-0 text-gray-400" /> {w.phone}</p>}
                {w.address && <p className="line-clamp-2 text-gray-500">{w.address}</p>}
              </div>

              <p className="mt-3 border-t pt-2.5 text-[11px] font-bold text-gray-700">
                {w.productCount} products · {w.totalStock} units in stock
              </p>

              <div className="mt-2 flex gap-2">
                <button onClick={() => openProducts(w)} className="flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-bold text-gray-700 hover:border-yellow-400 hover:text-black">
                  <Package className="h-3.5 w-3.5 shrink-0" /> View Products
                </button>
                <button onClick={() => openEdit(w)} className="flex h-11 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-bold text-gray-700 hover:border-yellow-400 hover:text-black">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              </div>

              <label className="mt-1.5 flex min-h-[44px] cursor-pointer items-center justify-between rounded-lg px-1 text-[11px] font-bold text-gray-500">
                <span>{w.active ? "Active" : "Inactive"}</span>
                <Switch
                  checked={w.active}
                  onCheckedChange={() => toggleActive(w)}
                  aria-label={`Toggle ${w.name}`}
                  className="data-[state=checked]:bg-yellow-400 data-[state=unchecked]:bg-gray-300"
                />
              </label>
            </div>
          ))}
        </div>
      )}

      {/* ───────────── ADD / EDIT — one shared dialog ───────────── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className={`max-h-[92vh] w-full max-w-lg overflow-y-auto border-gray-800 bg-gray-950 p-5 text-white sm:rounded-2xl ${slimScroll}`}>
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-white">{editing ? `Edit — ${editing.name}` : "Add Warehouse"}</DialogTitle>
            <DialogDescription className="text-[11px] text-gray-400">
              {editing
                ? editing.source === "ERP"
                  ? "ERP godown — mirrored from the inventory server; local edits stay until the next sync."
                  : "LOCAL godown — managed entirely here."
                : "Creates a LOCAL godown. ERP godowns arrive automatically on Inventory Sync."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="text-[10px] font-bold uppercase text-gray-400">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Hosur Road Godown" className="mt-1 h-11 border-gray-700 bg-gray-900 text-white placeholder:text-gray-600" />
            </div>
            <div>
              <Label className="text-[10px] font-bold uppercase text-gray-400">Code</Label>
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="WH-001" className="mt-1 h-11 border-gray-700 bg-gray-900 font-mono text-white placeholder:text-gray-600" />
            </div>
            <div>
              <Label className="text-[10px] font-bold uppercase text-gray-400">City</Label>
              <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Bengaluru" className="mt-1 h-11 border-gray-700 bg-gray-900 text-white placeholder:text-gray-600" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-[10px] font-bold uppercase text-gray-400">Address</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="12, Industrial Layout…" className="mt-1 h-11 border-gray-700 bg-gray-900 text-white placeholder:text-gray-600" />
            </div>
            <div>
              <Label className="text-[10px] font-bold uppercase text-gray-400">Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+91…" className="mt-1 h-11 border-gray-700 bg-gray-900 text-white placeholder:text-gray-600" />
            </div>
            <div>
              <Label className="text-[10px] font-bold uppercase text-gray-400">Sort order</Label>
              <Input type="number" min={0} value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} className="mt-1 h-11 border-gray-700 bg-gray-900 text-white" />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex min-h-[44px] cursor-pointer items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-3 text-xs font-bold text-gray-300">
              Default warehouse
              <Switch checked={form.isDefault} onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: v }))} className="data-[state=checked]:bg-yellow-400 data-[state=unchecked]:bg-gray-700" />
            </label>
            <label className="flex min-h-[44px] cursor-pointer items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-3 text-xs font-bold text-gray-300">
              Active
              <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} className="data-[state=checked]:bg-yellow-400 data-[state=unchecked]:bg-gray-700" />
            </label>
          </div>
          {form.isDefault && <p className="text-[10px] font-semibold text-yellow-400">Making this the default unsets the current default warehouse.</p>}

          <div className="flex gap-2">
            <Button onClick={save} disabled={saving || !form.name.trim()} className="h-11 flex-1 bg-yellow-400 text-xs font-semibold text-black hover:bg-yellow-300 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {editing ? "Save Changes" : "Create Warehouse"}
            </Button>
            <Button onClick={() => setFormOpen(false)} variant="outline" className="h-11 border-gray-700 bg-transparent text-xs font-bold text-gray-300 hover:bg-gray-900 hover:text-white">
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ───────────── VIEW PRODUCTS — per-warehouse stock snapshot ───────────── */}
      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) { setViewing(null); setDetail(null); setQ(""); } }}>
        <DialogContent className={`max-h-[92vh] w-full max-w-3xl overflow-y-auto border-gray-800 bg-gray-950 p-5 text-white sm:rounded-2xl ${slimScroll}`}>
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base font-semibold text-white">
              <Package className="h-4 w-4 text-yellow-400" /> {viewing?.name} — product stock
            </DialogTitle>
            <DialogDescription className="text-[11px] text-gray-400">
              {detail ? `${detail.length} products · ${detailUnits} units in stock · quantities are edited in Warehouse Stock` : "Loading stock rows…"}
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by SKU or product name…" className="h-11 border-gray-700 bg-gray-900 pl-9 text-white placeholder:text-gray-600" />
          </div>

          {detail === null ? (
            <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-500" /></div>
          ) : filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-800 p-8 text-center text-xs text-gray-500">
              {detail.length === 0 ? "No stock rows yet — sync from ERP or manage quantities in Warehouse Stock." : "No products match your filter."}
            </p>
          ) : (
            <div className={`max-h-96 overflow-y-auto rounded-lg border border-gray-800 ${slimScroll}`}>
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-gray-900 text-[10px]  text-gray-400">
                  <tr>
                    <th className="px-3 py-2.5 font-bold">Product</th>
                    <th className="px-3 py-2.5 font-bold">SKU</th>
                    <th className="px-3 py-2.5 text-right font-bold">Qty</th>
                    <th className="px-3 py-2.5 font-bold">Unit</th>
                    <th className="px-3 py-2.5 text-right font-bold">Dealer ₹</th>
                    <th className="px-3 py-2.5 text-right font-bold">MRP ₹</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.stockId} className="border-t border-gray-800 hover:bg-gray-900/60">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {p.image
                            ? <Image src={p.image} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-md object-cover" unoptimized />
                            : <div className="h-8 w-8 shrink-0 rounded-md bg-gray-800" />}
                          <span className="line-clamp-1 max-w-[280px] font-semibold text-gray-100">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-gray-400">{p.sku}</td>
                      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${p.qty > 0 ? "text-emerald-400" : "text-red-400"}`}>{p.qty}</td>
                      <td className="px-3 py-2 text-gray-400">{p.unit || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-200">{formatINR(p.dealerPrice)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-400">{formatINR(p.mrp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
