"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { BadgePercent, Boxes, CheckCircle2, IndianRupee, RefreshCcw, ShieldCheck, ShoppingCart, Star, RefreshCw, Truck, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader, StatCard, StatusBadge, Toggle } from "./ui-bits";
import { Code39Svg } from "./barcode";
import { formatINR } from "@/lib/store";

/* ══════════════ DASHBOARD ══════════════ */
type DashData = {
  kpis: Record<string, number>;
  trend: { date: string; revenue: number; orders: number }[];
  topProducts: { id: string; sku: string; name: string; image: string; brand: string; pieces: number; revenue: number; orders: number }[];
  lowStock: { id: string; sku: string; name: string; stock: number; image: string; brand: { name: string } }[];
  offers: { id: string; name: string; headline: string; active: boolean; heroSlot: boolean; type: string }[];
  coupons: { code: string; headline: string; usedCount: number; usageLimit: number; active: boolean }[];
  lastSync: { direction: string; status: string; message: string; createdAt: string } | null;
};

export function DashboardModule({ token }: { token: string }) {
  const call = api(token);
  const [data, setData] = useState<DashData | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let alive = true;
    call("/api/admin/dashboard")
      .then((d) => { if (alive) setData(d); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));
    return () => { alive = false; };
  }, [token]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/sync/pull", { method: "POST", headers: { authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast.success(`ERP pull: ${d.created} created, ${d.updated} updated of ${d.seen}`);
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (!data) return <p className="rounded-xl border bg-white p-10 text-center text-sm text-gray-400">Loading dashboard…</p>;
  const k = data.kpis;

  return (
    <div className="space-y-4">
      <ModuleHeader title="Dashboard" sub="Sales, profit, offers activity, coupon usage & ERP sync — everything at a glance">
        <button onClick={syncNow} disabled={syncing} className="flex h-9 items-center gap-1.5 rounded-lg bg-black px-3.5 text-xs font-bold text-yellow-400 hover:bg-gray-800 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Pulling…" : "Pull ERP Catalog"}
        </button>
      </ModuleHeader>

      {/* ERP sync strip */}
      <div className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 text-xs ${data.lastSync?.status === "OK" ? "border-emerald-200 bg-emerald-50" : "border-orange-200 bg-orange-50"}`}>
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span className="font-bold">ERP Sync (Neon):</span>
        <span className="text-gray-600">{data.lastSync ? `${data.lastSync.direction} · ${data.lastSync.status} · ${data.lastSync.message} · ${new Date(data.lastSync.createdAt).toLocaleString("en-IN")}` : "No sync yet"}</span>
        <Link href="/admin" className="ml-auto text-[11px] font-bold text-gray-500 underline">ERP pushes arrive at /api/inventory/webhook automatically every 30 min</Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={IndianRupee} label="Total Revenue" value={formatINR(k.revenue)} sub={`${k.orders} orders lifetime`} color="#111111" />
        <StatCard icon={ShoppingCart} label="Last 30 Days" value={formatINR(k.revenue30)} sub={`${k.orders30} orders · today: ${k.ordersToday}`} color="#7c3aed" />
        <StatCard icon={Boxes} label="Est. Gross Profit 30d" value={formatINR(Math.max(0, k.revenue30 - k.cogs30))} sub={`margin ${k.profitMargin}% · COGS ${formatINR(k.cogs30)}`} color="#059669" />
        <StatCard icon={BadgePercent} label="Offers & Coupons" value={`${k.offerOrders + k.couponOrders}`} sub={`${k.offerOrders} offer orders · ${k.couponOrders} coupon orders`} color="#dc2626" />
        <StatCard icon={Boxes} label="Catalog" value={k.products} sub={`${k.brands} active brands`} color="#b45309" />
        <StatCard icon={Users} label="B2B Customers" value={k.customers} sub={`${k.pendingCustomers} pending approval`} color="#1d4ed8" />
        <StatCard icon={IndianRupee} label="GST Collected" value={formatINR(k.gstCollected)} sub={`discounts given ${formatINR(k.discounts)}`} color="#334155" />
        <StatCard icon={Truck} label="Avg Order Value" value={formatINR(k.orders ? Math.round(k.revenue / k.orders) : 0)} sub="lifetime" color="#0f766e" />
      </div>

      {/* trend */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-2 text-xs font-bold text-gray-700">Revenue — last 30 days</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.trend}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#facc15" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#facc15" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
              <Tooltip formatter={(v) => formatINR(Number(v))} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11, borderRadius: 10 }} />
              <Area type="monotone" dataKey="revenue" stroke="#111" strokeWidth={2} fill="url(#rev)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-2 text-xs font-bold text-gray-700">Coupon usage (applications)</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.coupons.map((c) => ({ code: c.code, used: c.usedCount }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="code" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10 }} />
              <Bar dataKey="used" fill="#111827" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* top products + offers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold text-gray-700"><Star className="h-4 w-4 text-yellow-500" /> Top Selling Products</p>
          <div className="space-y-2">
            {data.topProducts.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2.5 rounded-lg border p-2">
                <span className="w-5 text-center text-xs font-black text-gray-300">{i + 1}</span>
                {p.image && <Image src={p.image} alt="" width={32} height={32} className="h-8 w-8 rounded object-cover" unoptimized />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{p.name}</p>
                  <p className="text-[10px] text-gray-400">{p.sku} · {p.brand} · {p.pieces} pcs in {p.orders} orders</p>
                </div>
                <p className="text-xs font-black">{formatINR(p.revenue)}</p>
              </div>
            ))}
            {!data.topProducts.length && <p className="py-6 text-center text-xs text-gray-400">No sales data yet.</p>}
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-bold text-gray-700"><BadgePercent className="h-4 w-4 text-red-500" /> Offers Activity</p>
            <div className="space-y-2">
              {data.offers.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-lg border p-2.5 text-xs">
                  <div>
                    <p className="font-bold">{o.name}</p>
                    <p className="text-[10px] text-gray-400">{o.type} · {o.headline}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {o.heroSlot && <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[9px] font-black text-yellow-800">HERO</span>}
                    <StatusBadge status={o.active ? "ACTIVE" : "INACTIVE"} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-bold text-gray-700"><Boxes className="h-4 w-4 text-orange-500" /> Low Stock Alerts</p>
            <div className="space-y-1.5">
              {data.lowStock.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <span className="max-w-[220px] truncate">{p.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.stock <= 5 ? "bg-red-50 text-red-600" : "bg-orange-50 text-orange-600"}`}>{p.stock} left</span>
                </div>
              ))}
              {!data.lowStock.length && <p className="py-4 text-center text-xs text-gray-400">All stocked up.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════ CUSTOMERS (B2B) ══════════════ */
export function CustomersModule({ token }: { token: string }) {
  const call = api(token);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const d = await call("/api/admin/crud/customers");
      setRows(d.rows ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
     
  }, [token]);

  const setCustomerStatus = async (id: string, newStatus: string) => {
    try {
      await call("/api/admin/crud/customers", { method: "PATCH", body: JSON.stringify({ id, status: newStatus }) });
      toast.success(`Customer ${newStatus.toLowerCase()}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const filtered = rows.filter((r) => {
    if (type && r.customerType !== type) return false;
    if (status && r.status !== status) return false;
    if (q) {
      const hay = `${r.name} ${r.shopName} ${r.phone} ${r.city}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div>
      <ModuleHeader title="Customer Management" sub="Retailers, wholesalers & distributors — approve accounts to unlock tier pricing">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / shop / phone…" className="h-9 w-56 rounded-lg border px-3 text-xs outline-none focus:border-yellow-400" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-lg border text-xs">
          <option value="">All Types</option>
          <option value="RETAILER">Retailers</option>
          <option value="WHOLESALE">Wholesalers</option>
          <option value="DISTRIBUTOR">Distributors</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border text-xs">
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </ModuleHeader>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2.5">Business</th>
              <th className="px-3 py-2.5">Type / Tier</th>
              <th className="px-3 py-2.5">Contact</th>
              <th className="px-3 py-2.5 text-right">Orders</th>
              <th className="px-3 py-2.5 text-right">Lifetime</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Loading customers…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No customers found.</td></tr>}
            {filtered.map((c) => (
              <tr key={String(c.id)} className="border-t hover:bg-gray-50/60">
                <td className="px-3 py-2.5">
                  <p className="font-bold">{String(c.shopName || c.name)}</p>
                  <p className="text-[10px] text-gray-400">{String(c.city || "—")} {c.gstin ? `· GSTIN ${String(c.gstin)}` : ""}</p>
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold">{String(c.customerType)}</span>
                  <span className="ml-1 rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-black text-yellow-800">{String(c.tier).toUpperCase()}</span>
                </td>
                <td className="px-3 py-2.5">
                  <p>{String(c.phone)}</p>
                  <p className="text-[10px] text-gray-400">{String(c.email || "—")}</p>
                </td>
                <td className="px-3 py-2.5 text-right">{String(c.orders)}</td>
                <td className="px-3 py-2.5 text-right font-bold">{formatINR(Number(c.totalSpent))}</td>
                <td className="px-3 py-2.5"><StatusBadge status={String(c.status)} /></td>
                <td className="px-3 py-2.5">
                  <div className="flex gap-1.5">
                    {c.status !== "APPROVED" && (
                      <button onClick={() => setCustomerStatus(String(c.id), "APPROVED")} className="flex items-center gap-1 rounded-md bg-emerald-500 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> Approve
                      </button>
                    )}
                    {c.status === "APPROVED" && (
                      <button onClick={() => setCustomerStatus(String(c.id), "SUSPENDED")} className="flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-[10px] font-bold text-red-600 hover:bg-red-50">
                        <XCircle className="h-3 w-3" /> Suspend
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════ PRICING (bulk editor) ══════════════ */
export function PricingModule({ token }: { token: string }) {
  const call = api(token);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [tops, setTops] = useState<{ id: string; name: string }[]>([]);
  const [target, setTarget] = useState<"brand" | "category">("brand");
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [topId, setTopId] = useState("");
  const [basis, setBasis] = useState<"current" | "purchaseCost">("purchaseCost");
  const [ops, setOps] = useState<{ field: string; mode: "percent" | "amount" | "set"; value: string }[]>([
    { field: "mrp", mode: "percent", value: "35" },
    { field: "dealerPrice", mode: "percent", value: "18" },
  ]);
  const [preview, setPreview] = useState<{ matched: number; totalChanges: number; changes: { sku: string; name: string; updates: Record<string, number> }[] } | null>(null);
  const [logs, setLogs] = useState<{ id: string; sku: string; field: string; oldVal: number; newVal: number; basis: string; createdAt: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call("/api/admin/crud/brands").then((d) => setBrands((d.rows ?? []).map((r: Record<string, unknown>) => ({ id: String(r.id), name: String(r.name) })))).catch(() => {});
    call("/api/admin/crud/tops").then((d) => setTops((d.rows ?? []).map((r: Record<string, unknown>) => ({ id: String(r.id), name: String(r.name) })))).catch(() => {});
    call("/api/admin/pricing/bulk").then((d) => setLogs(d.logs ?? [])).catch(() => {});
     
  }, [token]);

  const buildBody = (isPreview: boolean) => ({
    target,
    brandIds,
    topId: target === "category" ? topId : undefined,
    basis,
    preview: isPreview,
    ops: ops.map((o) => ({ field: o.field, mode: o.mode, value: Number(o.value) || 0 })),
  });

  const doPreview = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/pricing/bulk", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(buildBody(true)) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setPreview(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const doApply = async () => {
    if (!confirm(`Apply ${ops.length} pricing operation(s) to matched products? This logs every change.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/pricing/bulk", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(buildBody(false)) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast.success(`Pricing applied to ${d.applied} products`);
      setPreview(null);
      call("/api/admin/pricing/bulk").then((x) => setLogs(x.logs ?? [])).catch(() => {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <ModuleHeader title="Products Pricing" sub="Bulk-edit prices on purchase-cost basis — purchase cost never appears on the storefront" />
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-3 rounded-xl border bg-white p-4">
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase text-gray-500">Apply to</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(["brand", "category"] as const).map((t) => (
                <button key={t} onClick={() => setTarget(t)} className={`rounded-lg border-2 py-2 text-xs font-bold capitalize ${target === t ? "border-yellow-400 bg-yellow-50" : "border-gray-200"}`}>{t === "brand" ? "By Brand" : "By Category"}</button>
              ))}
            </div>
          </div>
          {target === "brand" ? (
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase text-gray-500">Brands ({brandIds.length} selected)</p>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                {brands.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={brandIds.includes(b.id)}
                      onChange={(e) => setBrandIds((ids) => (e.target.checked ? [...ids, b.id] : ids.filter((x) => x !== b.id)))}
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase text-gray-500">Top Category</p>
              <select value={topId} onChange={(e) => setTopId(e.target.value)} className="h-9 w-full rounded-lg border px-2 text-xs">
                <option value="">Pick department…</option>
                {tops.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase text-gray-500">Calculation basis</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => setBasis("purchaseCost")} className={`rounded-lg border-2 py-2 text-[11px] font-bold ${basis === "purchaseCost" ? "border-yellow-400 bg-yellow-50" : "border-gray-200"}`}>Purchase Cost</button>
              <button onClick={() => setBasis("current")} className={`rounded-lg border-2 py-2 text-[11px] font-bold ${basis === "current" ? "border-yellow-400 bg-yellow-50" : "border-gray-200"}`}>Current Field</button>
            </div>
            <p className="mt-1 text-[10px] text-gray-400">{basis === "purchaseCost" ? "e.g. MRP = cost +35% (margin pricing)" : "e.g. MRP = MRP +5% (adjust existing)"}</p>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase text-gray-500">Operations</p>
            <div className="space-y-2">
              {ops.map((op, i) => (
                <div key={i} className="flex gap-1.5">
                  <select value={op.field} onChange={(e) => setOps((o) => o.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))} className="h-8 flex-1 rounded-lg border px-1.5 text-[11px]">
                    {["mrp", "dealerPrice", "tier1", "tier2", "tier3", "tier4", "tier5", "dealPrice"].map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <select value={op.mode} onChange={(e) => setOps((o) => o.map((x, j) => (j === i ? { ...x, mode: e.target.value as typeof x.mode } : x)))} className="h-8 w-24 rounded-lg border px-1.5 text-[11px]">
                    <option value="percent">% (±)</option>
                    <option value="amount">₹ (±)</option>
                    <option value="set">set =</option>
                  </select>
                  <input value={op.value} onChange={(e) => setOps((o) => o.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="h-8 w-16 rounded-lg border px-2 text-[11px]" />
                  <button onClick={() => setOps((o) => o.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500"><XCircle className="h-4 w-4" /></button>
                </div>
              ))}
              <button onClick={() => setOps((o) => [...o, { field: "tier4", mode: "percent", value: "0" }])} className="w-full rounded-lg border border-dashed py-1.5 text-[11px] font-bold text-gray-500 hover:border-yellow-400">+ Add operation</button>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={doPreview} disabled={busy} className="flex-1 rounded-xl border py-2.5 text-xs font-bold hover:bg-gray-50 disabled:opacity-50">Preview</button>
            <button onClick={doApply} disabled={busy || !preview} className="flex-1 rounded-xl bg-black py-2.5 text-xs font-bold text-yellow-400 disabled:opacity-50">Apply</button>
          </div>
        </div>

        <div className="space-y-4">
          {preview && (
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs font-bold">Preview — {preview.matched} products matched, {preview.totalChanges} will change</p>
              <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border">
                <table className="w-full text-[11px]">
                  <thead className="bg-gray-50 text-left text-[9px] uppercase text-gray-500">
                    <tr><th className="px-2 py-1.5">SKU</th><th className="px-2 py-1.5">Product</th><th className="px-2 py-1.5">Changes</th></tr>
                  </thead>
                  <tbody>
                    {preview.changes.map((c) => (
                      <tr key={c.sku} className="border-t">
                        <td className="px-2 py-1.5 font-mono">{c.sku}</td>
                        <td className="max-w-[220px] truncate px-2 py-1.5">{c.name}</td>
                        <td className="px-2 py-1.5">
                          {Object.entries(c.updates).map(([f, v]) => (
                            <span key={f} className="mr-2 rounded bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700">{f} → {formatINR(v)}</span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="rounded-xl border bg-white p-4">
            <p className="mb-2 text-xs font-bold">Price Change Log (last 50)</p>
            <div className="max-h-72 overflow-y-auto rounded-lg border">
              <table className="w-full text-[11px]">
                <thead className="bg-gray-50 text-left text-[9px] uppercase text-gray-500">
                  <tr><th className="px-2 py-1.5">Time</th><th className="px-2 py-1.5">SKU</th><th className="px-2 py-1.5">Field</th><th className="px-2 py-1.5 text-right">Old</th><th className="px-2 py-1.5 text-right">New</th><th className="px-2 py-1.5">Basis</th></tr>
                </thead>
                <tbody>
                  {logs.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No changes yet.</td></tr>}
                  {logs.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="px-2 py-1.5 text-gray-400">{new Date(l.createdAt).toLocaleString("en-IN")}</td>
                      <td className="px-2 py-1.5 font-mono">{l.sku}</td>
                      <td className="px-2 py-1.5 font-bold">{l.field}</td>
                      <td className="px-2 py-1.5 text-right">{formatINR(l.oldVal)}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-emerald-600">{formatINR(l.newVal)}</td>
                      <td className="px-2 py-1.5 text-gray-400">{l.basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════ BRAND PRODUCTS (per-brand catalogue under Brand Management) ══════════════ */
type ProdRow = {
  id: string; sku: string; name: string; image: string; dealerPrice: number; mrp: number;
  stock: number; active: boolean; isTop: boolean; isFeatured: boolean; isHot: boolean; isDeal: boolean;
};

export function BrandProductsModule({ token }: { token: string }) {
  const call = api(token);
  const [brands, setBrands] = useState<{ id: string; name: string; productCount?: number }[]>([]);
  const [brandId, setBrandId] = useState("");
  const [rows, setRows] = useState<ProdRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    call("/api/admin/crud/brands")
      .then((d) => setBrands(d.rows ?? []))
      .catch(() => {});
     
  }, [token]);

  const loadBrand = async () => {
    if (!brandId) return;
    setLoading(true);
    try {
      const d = await call(`/api/admin/products?brand=${brandId}&limit=100`);
      setRows(d.rows ?? []);
    } catch {
      toast.error("Failed to load brand products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBrand();
     
  }, [brandId, token]);

  const toggleActive = async (r: ProdRow, v: boolean) => {
    await fetch("/api/admin/products", {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: r.id, active: v }),
    });
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, active: v } : x)));
    toast.success(`${r.sku} ${v ? "live" : "hidden"}`);
  };

  const filtered = rows.filter((r) => !q || `${r.name} ${r.sku}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <ModuleHeader title="Brand Products" sub="Pick a brand to manage its full product list — visibility, prices at a glance, homepage sections">
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-9 rounded-lg border px-2 text-xs font-semibold">
          <option value="">Select brand…</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}{typeof b.productCount === "number" ? ` (${b.productCount})` : ""}</option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter products…" className="h-9 w-48 rounded-lg border px-3 text-xs outline-none focus:border-yellow-400" />
      </ModuleHeader>

      {!brandId ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-gray-400">Select a brand above to view and manage its products.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2.5">Product</th>
                <th className="px-3 py-2.5 text-right">Price</th>
                <th className="px-3 py-2.5 text-right">MRP</th>
                <th className="px-3 py-2.5 text-right">Stock</th>
                <th className="px-3 py-2.5">Sections</th>
                <th className="px-3 py-2.5">Live</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>}
              {!loading && filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No products for this brand.</td></tr>}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50/60">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {r.image && <Image src={r.image} alt="" width={28} height={28} className="h-7 w-7 rounded object-cover" unoptimized />}
                      <div>
                        <p className="max-w-[260px] truncate font-semibold">{r.name}</p>
                        <p className="text-[10px] text-gray-400">{r.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-bold">{formatINR(r.dealerPrice)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{formatINR(r.mrp)}</td>
                  <td className={`px-3 py-2 text-right ${r.stock <= 10 ? "font-semibold text-red-500" : ""}`}>{r.stock}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 text-[9px] font-black">
                      {r.isTop && <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-white">TOP</span>}
                      {r.isFeatured && <span className="rounded bg-yellow-400 px-1.5 py-0.5 text-black">FEAT</span>}
                      {r.isHot && <span className="rounded bg-orange-500 px-1.5 py-0.5 text-white">HOT</span>}
                      {r.isDeal && <span className="rounded bg-red-500 px-1.5 py-0.5 text-white">DEAL</span>}
                      {!r.isTop && !r.isFeatured && !r.isHot && !r.isDeal && <span className="text-gray-300">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2"><Toggle checked={r.active} onChange={(v) => toggleActive(r, v)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
