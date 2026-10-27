"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  LogOut,
  Eye,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  IndianRupee,
  Boxes,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { DmkLogo } from "./logo";
import type { DCategory, DProduct } from "@/lib/types";
import { formatINR } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Stats {
  totalProducts: number;
  activeProducts: number;
  inactiveProducts: number;
  totalOrders: number;
  revenue: number;
  unitsSold: number;
  lowStock: number;
}

interface AdminOrder {
  id: string;
  items: string;
  itemCount: number;
  grandTotal: number;
  customerName: string;
  phone: string;
  addressLine: string;
  city: string;
  pincode: string;
  slot: string;
  paymentMethod: string;
  status: string;
  createdAt: string;
}

interface AdminProductTableProps {
  token: string;
  categories: DCategory[];
}

function ProductsTab({ token, categories }: AdminProductTableProps) {
  const [products, setProducts] = useState<DProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<DProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<DProduct | null>(null);
  const [error, setError] = useState("");

  const emptyForm = {
    sku: "",
    name: "",
    brand: "",
    company: "",
    categoryId: categories[0]?.id ?? "",
    price: 0,
    mrp: 0,
    tier1: 0,
    tier2: 0,
    tier3: 0,
    tier4: 0,
    costPrice: 0,
    packQty: 1,
    unit: "Pcs",
    hsn: "",
    gst: 0,
    stock: 0,
    lowStockThreshold: 10,
    active: true,
  };
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/products?page=${page}&status=${status}&categoryId=${categoryId}&q=${encodeURIComponent(q)}`,
        { headers: { "x-admin-token": token } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProducts(data.products);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [token, page, status, categoryId, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const openEdit = (p: DProduct | null) => {
    setError("");
    setEditing(p);
    if (p) {
      setForm({
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        company: p.company,
        categoryId: p.categoryId,
        price: p.price,
        mrp: p.mrp,
        tier1: p.tier1,
        tier2: p.tier2,
        tier3: p.tier3,
        tier4: p.tier4,
        costPrice: p.costPrice,
        packQty: p.packQty,
        unit: p.unit,
        hsn: p.hsn,
        gst: p.gst,
        stock: p.stock,
        lowStockThreshold: p.lowStockThreshold,
        active: p.active,
      });
    } else {
      setForm(emptyForm);
    }
    setEditOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = { ...form };
      const res = await fetch(
        editing ? `/api/admin/products/${editing.id}` : "/api/admin/products",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json", "x-admin-token": token },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        const details = data.details ? Object.values(data.details).flat().join(", ") : "";
        throw new Error(details || data.error || "Save failed");
      }
      setEditOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/products/${deleting.id}`, {
        method: "DELETE",
        headers: { "x-admin-token": token },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Delete failed");
      }
      setDeleting(null);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
      setDeleting(null);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: DProduct) => {
    await fetch(`/api/admin/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": token },
      body: JSON.stringify({ active: !p.active }),
    });
    load();
  };

  const set = (k: keyof typeof form) => (ev: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = ev.target.value;
    setForm((f) => ({
      ...f,
      [k]: typeof form[k] === "number" ? Number(v) : v,
    }));
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search SKU, name, brand..."
            className="pl-9 h-9 text-sm"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
          className="h-9 text-sm rounded-lg border border-slate-300 bg-white px-2"
          aria-label="Filter by status"
        >
          <option value="ALL">All status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setPage(1);
          }}
          className="h-9 text-sm rounded-lg border border-slate-300 bg-white px-2 max-w-[200px]"
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
          ))}
        </select>
        <Button
          onClick={() => openEdit(null)}
          className="bg-[#ffd400] hover:bg-[#f0c800] text-black font-bold h-9"
        >
          <Plus className="h-4 w-4 mr-1" /> Add Product
        </Button>
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold">SKU</th>
                <th className="text-left px-3 py-2.5 font-semibold">Product</th>
                <th className="text-left px-3 py-2.5 font-semibold hidden md:table-cell">Category</th>
                <th className="text-right px-3 py-2.5 font-semibold">Price</th>
                <th className="text-right px-3 py-2.5 font-semibold hidden sm:table-cell">MRP</th>
                <th className="text-right px-3 py-2.5 font-semibold hidden lg:table-cell">Stock</th>
                <th className="text-center px-3 py-2.5 font-semibold">Status</th>
                <th className="text-center px-3 py-2.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-3 py-2">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-400">
                    No products found.
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500 max-w-[110px] truncate">{p.sku}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-800 max-w-[220px] truncate">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.brand || p.company} · {p.packSize}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 hidden md:table-cell">{p.category.name}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-800">{formatINR(p.price)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-400 hidden sm:table-cell">{formatINR(p.mrp)}</td>
                    <td className="px-3 py-2.5 text-right hidden lg:table-cell">
                      <span className={cn("font-semibold", p.stock === 0 ? "text-red-500" : p.stock <= p.lowStockThreshold ? "text-orange-500" : "text-slate-600")}>
                        {p.stock}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => toggleActive(p)}
                        className={cn(
                          "text-[10px] font-bold uppercase px-2 py-1 rounded-full transition-colors",
                          p.active ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-slate-200 text-slate-500 hover:bg-slate-300"
                        )}
                      >
                        {p.active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-black"
                          aria-label={`Edit ${p.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleting(p)}
                          className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600"
                          aria-label={`Delete ${p.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="flex items-center justify-between px-3 py-2.5 border-t border-slate-100 text-xs text-slate-500">
          <span>
            {total} products · page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-md border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-md border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Edit / Add dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogTitle className="text-base font-bold">
            {editing ? `Edit Product — ${editing.sku}` : "Add New Product"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Edit product details and tier pricing
          </DialogDescription>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs text-slate-500">SKU</Label>
              <Input value={form.sku} onChange={set("sku")} disabled={!!editing} className="mt-1 h-9 font-mono text-sm" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs text-slate-500">Category</Label>
              <select
                value={form.categoryId}
                onChange={set("categoryId")}
                className="mt-1 h-9 w-full text-sm rounded-lg border border-slate-300 bg-white px-2"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-slate-500">Product name</Label>
              <Input value={form.name} onChange={set("name")} className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Brand</Label>
              <Input value={form.brand} onChange={set("brand")} className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Company</Label>
              <Input value={form.company} onChange={set("company")} className="mt-1 h-9" />
            </div>

            <div className="col-span-2 mt-1">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Pricing (₹ per piece)</p>
            </div>
            <div><Label className="text-xs text-slate-500">Cost price</Label><Input type="number" min={0} value={form.costPrice} onChange={set("costPrice")} className="mt-1 h-9" /></div>
            <div><Label className="text-xs text-slate-500">Tier 1 · Distributor</Label><Input type="number" min={0} value={form.tier1} onChange={set("tier1")} className="mt-1 h-9" /></div>
            <div><Label className="text-xs text-slate-500">Tier 2 · Wholesale</Label><Input type="number" min={0} value={form.tier2} onChange={set("tier2")} className="mt-1 h-9" /></div>
            <div><Label className="text-xs text-slate-500">Tier 3 · Semi-Wholesale</Label><Input type="number" min={0} value={form.tier3} onChange={set("tier3")} className="mt-1 h-9" /></div>
            <div><Label className="text-xs text-slate-500">Tier 4 · Retailer (storefront)</Label><Input type="number" min={0} value={form.tier4} onChange={set("tier4")} className="mt-1 h-9" /></div>
            <div><Label className="text-xs text-slate-500">Tier 5 · MRP</Label><Input type="number" min={0} value={form.mrp} onChange={set("mrp")} className="mt-1 h-9" /></div>

            <div className="col-span-2 mt-1">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Inventory</p>
            </div>
            <div><Label className="text-xs text-slate-500">Storefront price (₹)</Label><Input type="number" min={0} value={form.price} onChange={set("price")} className="mt-1 h-9" /></div>
            <div><Label className="text-xs text-slate-500">Sellable stock</Label><Input type="number" min={0} value={form.stock} onChange={set("stock")} className="mt-1 h-9" /></div>
            <div><Label className="text-xs text-slate-500">Pack qty</Label><Input type="number" min={1} value={form.packQty} onChange={set("packQty")} className="mt-1 h-9" /></div>
            <div>
              <Label className="text-xs text-slate-500">Unit</Label>
              <select value={form.unit} onChange={set("unit")} className="mt-1 h-9 w-full text-sm rounded-lg border border-slate-300 bg-white px-2">
                <option>Pcs</option>
                <option>Box</option>
                <option>Set</option>
              </select>
            </div>
            <div><Label className="text-xs text-slate-500">HSN</Label><Input value={form.hsn} onChange={set("hsn")} className="mt-1 h-9" /></div>
            <div className="col-span-2 flex items-center gap-2 mt-1">
              <input
                type="checkbox"
                id="admin-active"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="h-4 w-4 accent-black"
              />
              <Label htmlFor="admin-active" className="text-sm text-slate-700">Visible on storefront (Active)</Label>
            </div>
          </div>
          {error && <p className="text-xs text-red-500 font-medium mt-2">{error}</p>}
          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditOpen(false)} className="flex-1 h-10">
              Cancel
            </Button>
            <Button onClick={save} disabled={saving} className="flex-[2] bg-black hover:bg-[#2c2c2c] text-[#ffd400] font-bold h-10">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editing ? "Save Changes" : "Create Product"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle className="text-base font-bold">Delete product?</DialogTitle>
          <DialogDescription className="text-sm text-slate-500 mt-1">
            &ldquo;{deleting?.name}&rdquo; ({deleting?.sku}) will be permanently removed.
          </DialogDescription>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleting(null)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={confirmDelete} disabled={saving} variant="destructive" className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrdersTab({ token }: { token: string }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/orders", { headers: { "x-admin-token": token } });
        const data = await res.json();
        setOrders(res.ok ? data.orders : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <ShoppingCart className="h-10 w-10 mx-auto mb-3" />
        <p className="font-semibold text-slate-600">No orders yet</p>
        <p className="text-sm mt-1">Orders placed on the storefront will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {orders.map((o) => {
        let items: { name: string; qty: number; price: number }[] = [];
        try {
          items = JSON.parse(o.items);
        } catch { /* ignore */ }
        const isOpen = expanded === o.id;
        return (
          <div key={o.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : o.id)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="font-bold text-slate-800 text-sm">#{o.id.slice(0, 10).toUpperCase()}</p>
                <p className="text-xs text-slate-400 truncate">
                  {o.customerName} · {o.phone} · {o.city}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-slate-900">{formatINR(o.grandTotal)}</p>
                <p className="text-xs text-slate-400">{o.itemCount} items · {o.paymentMethod}</p>
              </div>
            </button>
            {isOpen && (
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
                <div className="space-y-1.5">
                  {items.map((it, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-slate-600">{it.name} × {it.qty}</span>
                      <span className="font-medium">{formatINR(it.price * it.qty)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-200 grid grid-cols-2 gap-1 text-xs text-slate-500">
                  <p>📦 Slot: {o.slot}</p>
                  <p>📍 {o.addressLine}, {o.city} - {o.pincode}</p>
                  <p>🕒 {new Date(o.createdAt).toLocaleString("en-IN")}</p>
                  <p>✅ {o.status}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AdminDashboard({
  token,
  categories,
  onClose,
  onLogout,
}: {
  token: string;
  categories: DCategory[];
  onClose: () => void;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "products" | "orders">("overview");
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (tab !== "overview" || stats) return;
    (async () => {
      const res = await fetch("/api/admin/stats", { headers: { "x-admin-token": token } });
      if (res.ok) setStats(await res.json());
    })();
  }, [tab, token, stats]);

  const statCards = stats
    ? [
        { icon: Boxes, label: "Total Products", value: stats.totalProducts.toString(), sub: `${stats.activeProducts} active · ${stats.inactiveProducts} inactive` },
        { icon: ShoppingCart, label: "Orders", value: stats.totalOrders.toString(), sub: `${stats.unitsSold} units sold` },
        { icon: IndianRupee, label: "Revenue", value: formatINR(stats.revenue), sub: "from confirmed orders" },
        { icon: AlertTriangle, label: "Low / No Stock", value: stats.lowStock.toString(), sub: "active products ≤ 10 units" },
      ]
    : [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 overflow-y-auto">
      {/* Admin header */}
      <div className="sticky top-0 z-10 bg-black text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DmkLogo compact onDark />
            <span className="hidden sm:inline bg-[#ffd400] text-black text-[10px] font-extrabold uppercase px-2 py-1 rounded">
              Admin Panel
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onClose} size="sm" className="bg-white/10 border border-white/30 text-white hover:bg-white/20 h-8">
              <Eye className="h-3.5 w-3.5 mr-1" /> View Store
            </Button>
            <Button onClick={onLogout} size="sm" className="bg-white/10 border border-white/30 text-white hover:bg-white/20 h-8">
              <LogOut className="h-3.5 w-3.5 mr-1" /> Logout
            </Button>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-4 flex gap-1">
          {[
            { id: "overview", label: "Overview", icon: LayoutDashboard },
            { id: "products", label: "Products", icon: Package },
            { id: "orders", label: "Orders", icon: ShoppingCart },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px",
                tab === t.id
                  ? "border-[#ffd400] text-[#ffd400]"
                  : "border-transparent text-white/60 hover:text-white"
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-5">
        {tab === "overview" && (
          <div>
            {!stats ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {statCards.map((c) => (
                    <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-slate-400">
                        <c.icon className="h-4 w-4" />
                        <span className="text-xs font-semibold uppercase tracking-wide">{c.label}</span>
                      </div>
                      <p className="text-2xl font-extrabold text-slate-900 mt-2">{c.value}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 bg-white border border-slate-200 rounded-xl p-5">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                    <TrendingUp className="h-4 w-4 text-[#f0b800]" /> DMK Mart B2B Snapshot
                  </h3>
                  <div className="grid sm:grid-cols-3 gap-4 mt-3 text-sm text-slate-600">
                    <div>
                      <p className="text-xs text-slate-400 uppercase font-semibold">Catalog</p>
                      <p className="mt-1">{stats.totalProducts} SKUs loaded from the DMK products master file, across {categories.length} categories.</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 uppercase font-semibold">Storefront</p>
                      <p className="mt-1">{stats.activeProducts} active SKUs are live; customers always buy at Tier 4 (Retailer) price.</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 uppercase font-semibold">B2B Tiers</p>
                      <p className="mt-1">Distributor → Wholesale → Semi-Wholesale → Retailer → MRP pricing editable per product.</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "products" && <ProductsTab token={token} categories={categories} />}
        {tab === "orders" && <OrdersTab token={token} />}

        {/* hidden close icon anchor for a11y */}
        <button onClick={onClose} className="sr-only" aria-label="Close admin panel">
          <X className="h-4 w-4" />
        </button>
      </main>
    </div>
  );
}
