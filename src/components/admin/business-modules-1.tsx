"use client";

import { Fragment, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { BadgePercent, Boxes, CheckCircle2, IndianRupee, MapPin, MessageCircle, RefreshCcw, ShieldCheck, ShoppingCart, Star, RefreshCw, Truck, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader, StatCard, StatusBadge, Toggle } from "./ui-bits";
import { Code39Svg } from "./barcode";
import { formatINR } from "@/lib/store";
import { nearbyLocationsForWarehouse } from "@/lib/maharashtra";

/* ══════════════ DASHBOARD ══════════════ */
type DashData = {
  window: { requested: number; used: number; smartExtended: boolean; label: string };
  kpis: Record<string, number>;
  statusCounts: Record<string, number>;
  paymentMix: { mode: string; amount: number }[];
  recentOrders: { id: string; invoiceNo: string; customerName: string; grandTotal: number; status: string; createdAt: string; source: string; paymentMethod: string }[];
  trend: { date: string; revenue: number; orders: number }[];
  topProducts: { id: string; sku: string; name: string; image: string; brand: string; pieces: number; revenue: number; orders: number }[];
  lowStock: { id: string; sku: string; name: string; stock: number; image: string; brand: { name: string } }[];
  offers: { id: string; name: string; headline: string; active: boolean; heroSlot: boolean; type: string }[];
  coupons: { code: string; headline: string; usedCount: number; usageLimit: number; active: boolean }[];
  lastSync: { direction: string; status: string; message: string; createdAt: string } | null;
};

const PIPELINE: [string, string, string][] = [
  ["PENDING", "Pending", "#e11d48"],
  ["CONFIRMED", "Confirmed", "#f59e0b"],
  ["PACKED", "Packed", "#2563eb"],
  ["DISPATCHED", "Dispatched", "#0891b2"],
  ["DELIVERED", "Delivered", "#16a34a"],
  ["CANCELLED", "Cancelled", "#9ca3af"],
];

function DeltaBadge({ value }: { value: number }) {
  if (!value) return null;
  const up = value > 0;
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${up ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
      {up ? "▲" : "▼"} {Math.abs(value)}%
    </span>
  );
}

export function DashboardModule({ token }: { token: string }) {
  const call = api(token);
  const [data, setData] = useState<DashData | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [win, setWin] = useState(90);

  useEffect(() => {
    let alive = true;
    call(`/api/admin/dashboard?window=${win}`)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));
    return () => { alive = false; };
  }, [token, win, call]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/erp-direct/sync", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ action: "resync" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      const p = d.products;
      toast.success(
        p
          ? `ERP pull: ${p.created} created, ${p.updated} updated of ${p.seen}${p.done ? " — full pull complete" : " (continues in ERP Data module / cron)"}`
          : "ERP sync ran — configure mappings in ERP Data (MySQL) for product pulls"
      );
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (!data) return <p className="rounded-xl border bg-white p-10 text-center text-sm text-gray-400">Loading dashboard…</p>;
  const k = data.kpis;
  const totalPipeline = Object.values(data.statusCounts).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="space-y-4">
      <ModuleHeader title="Dashboard" sub={`${data.window.label} · sales, pipeline, payments & ERP sync — everything at a glance`}>
        <div className="flex overflow-hidden rounded-lg border">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setWin(d)} className={`px-3 py-1.5 text-[10px] font-semibold uppercase ${win === d ? "bg-black text-yellow-400" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
              {d}d
            </button>
          ))}
        </div>
        <button onClick={syncNow} disabled={syncing} className="flex h-9 items-center gap-1.5 rounded-lg bg-black px-3.5 text-xs font-bold text-yellow-400 hover:bg-gray-800 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Pulling…" : "Pull ERP Catalog"}
        </button>
      </ModuleHeader>

      {/* ERP sync strip */}
      <div className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 text-xs ${data.lastSync?.status === "OK" ? "border-emerald-200 bg-emerald-50" : "border-orange-200 bg-orange-50"}`}>
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span className="font-bold">ERP Data (MySQL):</span>
        <span className="text-gray-600">{data.lastSync ? `${data.lastSync.direction} · ${data.lastSync.status} · ${data.lastSync.message} · ${new Date(data.lastSync.createdAt).toLocaleString("en-IN")}` : "No sync yet"}</span>
        <Link href="/admin" className="ml-auto text-[11px] font-bold text-gray-500 underline">Tick shared tables &amp; columns in ERP Data (MySQL) · read-only pull, daily cron</Link>
      </div>

      {/* KPIs — window aware with deltas */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={IndianRupee} label={`Revenue — ${data.window.label}`} value={formatINR(k.winRevenue)} sub={`${k.winOrders} orders · today ${k.ordersToday}`} color="#111111" extra={<DeltaBadge value={k.revenueDelta} />} />
        <StatCard icon={ShoppingCart} label="Orders — window" value={k.winOrders} sub={`avg ${formatINR(k.winOrders ? Math.round(k.winRevenue / k.winOrders) : 0)} per order`} color="#7c3aed" extra={<DeltaBadge value={k.ordersDelta} />} />
        <StatCard icon={Boxes} label="Est. Gross Profit" value={formatINR(Math.max(0, k.winRevenue - k.winCogs))} sub={`margin ${k.profitMargin}% · COGS ${formatINR(k.winCogs)}`} color="#059669" />
        <StatCard icon={BadgePercent} label="GST Collected — window" value={formatINR(k.winGst)} sub={`discounts given ${formatINR(k.winDiscounts)}`} color="#b45309" />
      </div>

      {/* trend + payment mix */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-2 text-xs font-bold text-gray-700">Revenue — {data.window.label}</p>
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
          <p className="mb-2 text-xs font-bold text-gray-700">Payment mix — {data.window.label}</p>
          {data.paymentMix.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.paymentMix}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mode" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip formatter={(v) => formatINR(Number(v))} contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                <Bar dataKey="amount" fill="#111827" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-16 text-center text-xs text-gray-400">No payments in this window.</p>
          )}
        </div>
      </div>

      {/* pipeline + recent orders */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold text-gray-700"><Truck className="h-4 w-4 text-blue-500" /> Order Pipeline (all time)</p>
          <div className="mb-3 flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
            {PIPELINE.map(([id, , color]) => (
              <div key={id} style={{ width: `${((data.statusCounts[id] ?? 0) / totalPipeline) * 100}%`, background: color }} title={`${id}: ${data.statusCounts[id] ?? 0}`} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1.5 md:grid-cols-6">
            {PIPELINE.map(([id, label, color]) => (
              <div key={id} className="rounded-lg border p-2 text-center">
                <p className="text-sm font-semibold" style={{ color }}>{data.statusCounts[id] ?? 0}</p>
                <p className="text-[9px] font-semibold uppercase text-gray-400">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-gray-400">{k.pendingCustomers} buyer approvals waiting → People / Buyer Approvals</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold text-gray-700"><ShoppingCart className="h-4 w-4 text-purple-500" /> Recent Orders</p>
          <div className="space-y-1.5">
            {data.recentOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-lg border p-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-bold">{o.customerName}</p>
                  <p className="text-[10px] text-gray-400">{o.invoiceNo || "—"} · {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {o.source === "WEB" ? "Website" : o.source === "SALESTEAM" ? "Sales team" : o.source}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${o.status === "DELIVERED" ? "bg-emerald-50 text-emerald-600" : o.status === "CANCELLED" ? "bg-gray-100 text-gray-500" : o.status === "PENDING" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>{o.status}</span>
                  <span className="font-semibold">{formatINR(o.grandTotal)}</span>
                </div>
              </div>
            ))}
            {!data.recentOrders.length && <p className="py-6 text-center text-xs text-gray-400">No orders yet.</p>}
          </div>
        </div>
      </div>

      {/* top products + offers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold text-gray-700"><Star className="h-4 w-4 text-yellow-500" /> Top Selling Products</p>
          <div className="space-y-2">
            {data.topProducts.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2.5 rounded-lg border p-2">
                <span className="w-5 text-center text-xs font-semibold text-gray-300">{i + 1}</span>
                {p.image && <Image src={p.image} alt="" width={32} height={32} className="h-8 w-8 rounded object-cover" unoptimized />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{p.name}</p>
                  <p className="text-[10px] text-gray-400">{p.sku} · {p.brand} · {p.pieces} pcs in {p.orders} orders</p>
                </div>
                <p className="text-xs font-semibold">{formatINR(p.revenue)}</p>
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
                    {o.heroSlot && <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[9px] font-semibold text-yellow-800">HERO</span>}
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

      {/* lifetime band */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard icon={IndianRupee} label="Lifetime Revenue" value={formatINR(k.revenue)} sub={`${k.orders} orders on record`} color="#111111" />
        <StatCard icon={IndianRupee} label="Lifetime GST" value={formatINR(k.gstCollected)} sub="all orders" color="#b45309" />
        <StatCard icon={IndianRupee} label="Lifetime Discounts" value={formatINR(k.discounts)} sub="given so far" color="#dc2626" />
        <StatCard icon={Users} label="B2B Customers" value={k.customers} sub={`${k.pendingCustomers} pending approval`} color="#1d4ed8" />
        <StatCard icon={Boxes} label="Catalog" value={k.products} sub={`${k.brands} active companies`} color="#7c3aed" />
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
  const [waPanel, setWaPanel] = useState<string | null>(null);
  const [waMsg, setWaMsg] = useState("");
  const [waUrl, setWaUrl] = useState("");
  const [waCode, setWaCode] = useState("");
  const [waNote, setWaNote] = useState("");
  const [waBusy, setWaBusy] = useState(false);

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

  const openWa = (c: Record<string, unknown>) => {
    if (waPanel === String(c.id)) { setWaPanel(null); return; }
    setWaPanel(String(c.id));
    setWaCode("");
    setWaNote("");
    setWaUrl("");
    setWaMsg(`Namaste ${String(c.shopName || c.name)}! Greetings from DMK Mart B2B Wholesale.`);
  };

  const sendCustomerOtp = async (c: Record<string, unknown>, purpose: "LOGIN" | "RESET") => {
    setWaBusy(true);
    setWaNote("");
    setWaCode("");
    try {
      const d = await call("/api/admin/whatsapp", { method: "POST", body: JSON.stringify({ action: "CUSTOMER_OTP", customerId: c.id, purpose }) });
      setWaCode(String(d.code ?? ""));
      setWaUrl(String(d.waUrl ?? ""));
      if (d.mode === "GATEWAY") {
        setWaNote(`Delivered via gateway ✓ (code ${d.code})`);
        toast.success(`${purpose === "RESET" ? "Reset" : "Login"} code sent via WhatsApp gateway`);
      } else {
        setWaNote(`Code ${d.code} generated — click “Open WhatsApp” to send it free (valid 10 min)`);
        toast.info("OTP generated — ready for WhatsApp");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "OTP failed");
    } finally {
      setWaBusy(false);
    }
  };

  const sendCustomerCustom = async (c: Record<string, unknown>) => {
    if (!waMsg.trim()) return toast.error("Type a message first");
    setWaBusy(true);
    setWaNote("");
    try {
      const d = await call("/api/admin/whatsapp", { method: "POST", body: JSON.stringify({ action: "CUSTOM", phone: String(c.phone), message: waMsg }) });
      setWaUrl(String(d.waUrl ?? ""));
      if (d.mode === "GATEWAY") {
        setWaNote("Delivered via gateway ✓");
        toast.success("WhatsApp sent via gateway");
      } else {
        setWaNote("No gateway configured — click “Open WhatsApp” to send free (you press send)");
        toast.info("Message ready for WhatsApp");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setWaBusy(false);
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
          <thead className="bg-gray-50 text-left text-[12px] font-medium text-gray-500">
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
              <Fragment key={String(c.id)}>
              <tr className="border-t hover:bg-gray-50/60">
                <td className="px-3 py-2.5">
                  <p className="font-bold">{String(c.shopName || c.name)}</p>
                  <p className="text-[10px] text-gray-400">{String(c.city || "—")}</p>
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold">{String(c.customerType)}</span>
                  <span className="ml-1 rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-yellow-800">{String(c.tier).toUpperCase()}</span>
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
                    <button
                      onClick={() => openWa(c)}
                      title="Send WhatsApp (OTP / message)"
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold ${waPanel === String(c.id) ? "bg-emerald-600 text-white" : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
                    >
                      <MessageCircle className="h-3 w-3" /> WhatsApp
                    </button>
                  </div>
                </td>
              </tr>
              {waPanel === String(c.id) && (
                <tr className="bg-emerald-50/50">
                  <td colSpan={7} className="px-4 pb-4 pt-1">
                    <div className="rounded-xl border border-emerald-200 bg-white p-3">
                      <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-900">
                        <MessageCircle className="h-4 w-4 text-emerald-600" /> Send WhatsApp to {String(c.shopName || c.name)}
                        <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-bold text-gray-500">{String(c.phone)}</span>
                      </p>
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <button onClick={() => sendCustomerOtp(c, "RESET")} disabled={waBusy} className="rounded-lg bg-black px-3 py-1.5 text-[10px] font-bold text-yellow-400 hover:bg-gray-900 disabled:opacity-50">
                          Forgot-password OTP
                        </button>
                        <button onClick={() => sendCustomerOtp(c, "LOGIN")} disabled={waBusy} className="rounded-lg border px-3 py-1.5 text-[10px] font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                          Login OTP
                        </button>
                        {waCode && <span className="rounded-md bg-yellow-100 px-2 py-1 font-mono text-[11px] font-semibold tracking-widest text-black">CODE {waCode}</span>}
                        {waNote && <span className="text-[10px] font-semibold text-emerald-700">{waNote}</span>}
                      </div>
                      <textarea
                        value={waMsg}
                        onChange={(e) => setWaMsg(e.target.value)}
                        rows={3}
                        placeholder="Custom message…"
                        className="w-full rounded-lg border p-2.5 text-xs leading-relaxed outline-none focus:border-emerald-400"
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <a
                          href={waCode && waUrl ? waUrl : `https://wa.me/91${String(c.phone).replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(waMsg)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#1fb958]"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> Open WhatsApp (free)
                        </a>
                        <button onClick={() => sendCustomerCustom(c)} disabled={waBusy} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                          {waBusy ? "Sending…" : "Send via gateway"}
                        </button>
                      </div>
                      <p className="mt-1.5 text-[10px] text-gray-400">
                        Forgot-password / Login OTP generates a 6-digit code (valid 10 min) and either pushes it through the WhatsApp gateway (if configured in Settings) or hands you the message to send free via WhatsApp. After entering the code on the login screen the customer sets a new password.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════ PRICING (bulk editor) ══════════════ */
export function PricingModule({ token }: { token: string }) {
  const [pricingTab, setPricingTab] = useState<"slab" | "location">("slab");
  return (
    <div>
      <div className="mb-4 flex gap-1.5">
        {(["slab", "location"] as const).map((k) => {
          const meta = { slab: ["Slab / Bulk Pricing", BadgePercent], location: ["Location Pricing", MapPin] } as const;
          const [label, Icon] = meta[k];
          return (
            <button
              key={k}
              onClick={() => setPricingTab(k)}
              className={`flex h-9 items-center gap-1.5 rounded-lg px-4 text-[13px] transition-colors ${pricingTab === k ? "bg-black font-medium text-yellow-400" : "border border-gray-200 bg-white font-normal text-gray-600 hover:bg-gray-50"}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          );
        })}
      </div>
      {pricingTab === "location" ? <LocationPricing token={token} /> : <SlabPricing token={token} />}
    </div>
  );
}

function SlabPricing({ token }: { token: string }) {
  const call = api(token);
  const [companies, setCompanies] = useState<string[]>([]);
  const [tops, setTops] = useState<{ id: string; name: string }[]>([]);
  const [target, setTarget] = useState<"company" | "category">("company");
  const [companySel, setCompanySel] = useState<string[]>([]);
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
    call("/api/admin/products/companies").then((d) => setCompanies((d.companies ?? []).map((c: { name: string }) => c.name))).catch(() => {});
    call("/api/admin/crud/tops").then((d) => setTops((d.rows ?? []).map((r: Record<string, unknown>) => ({ id: String(r.id), name: String(r.name) })))).catch(() => {});
    call("/api/admin/pricing/bulk").then((d) => setLogs(d.logs ?? [])).catch(() => {});

  }, [token]);

  const buildBody = (isPreview: boolean) => ({
    target,
    companies: companySel,
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
              {(["company", "category"] as const).map((t) => (
                <button key={t} onClick={() => setTarget(t)} className={`rounded-lg border-2 py-2 text-xs font-bold capitalize ${target === t ? "border-yellow-400 bg-yellow-50" : "border-gray-200"}`}>{t === "company" ? "By Company" : "By Category"}</button>
              ))}
            </div>
          </div>
          {target === "company" ? (
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase text-gray-500">Companies ({companySel.length} selected)</p>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                {companies.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={companySel.includes(c)}
                      onChange={(e) => setCompanySel((ids) => (e.target.checked ? [...ids, c] : ids.filter((x) => x !== c)))}
                    />
                    {c}
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
            <button onClick={doApply} disabled={busy || !preview} className="flex-1 rounded-lg bg-black py-2.5 text-xs font-bold text-yellow-400 disabled:opacity-50">Apply</button>
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

/* ══════════════ LOCATION PRICING (city/town-wise overrides per warehouse) ══════════════
 * Two main godowns: Kolhar (Ahmednagar belt) and Pune. Pick a warehouse → its nearby
 * cities/towns appear for multi-select → set dealerPrice/MRP for that scope. Only
 * buyers whose Customer.city matches see the override; everyone else keeps base
 * prices. Stored on Product.locationPrices JSON in Neon — the ERP is never written. */
function LocationPricing({ token }: { token: string }) {
  const call = api(token);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [whId, setWhId] = useState("");
  const [cities, setCities] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<"warehouse" | "company">("warehouse");
  const [companies, setCompanies] = useState<{ name: string; count: number }[]>([]);
  const [companySel, setCompanySel] = useState<string[]>([]);
  const [op, setOp] = useState<{ field: "dealerPrice" | "mrp"; mode: "percent" | "amount" | "set"; value: string }[]>([
    { field: "dealerPrice", mode: "percent", value: "0" },
  ]);
  const [preview, setPreview] = useState<{ products: number; cities: string[]; sample: { sku: string; name: string; dealerPrice?: number; mrp?: number }[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call("/api/admin/crud/warehouses").then((d) => {
      const rows = (d.rows ?? []) as { id: string; name: string }[];
      setWarehouses(rows);
      if (rows.length) setWhId((cur) => cur || rows[0].id);
    }).catch(() => {});
    call("/api/admin/products/companies").then((d) => setCompanies(d.companies ?? [])).catch(() => {});
  }, [call]);

  const wh = warehouses.find((w) => w.id === whId);
  const belt = wh ? nearbyLocationsForWarehouse(wh.name) : { group: "Pick a warehouse", locations: [] as string[] };
  const allSelected = belt.locations.length > 0 && belt.locations.every((l) => cities.has(l));

  const toggleCity = (c: string) => setCities((s) => {
    const n = new Set(s);
    if (n.has(c)) n.delete(c); else n.add(c);
    return n;
  });

  const buildBody = (isPreview: boolean, clear = false) => ({
    cities: [...cities],
    warehouseId: whId || undefined,
    target: scope === "company" ? "company" : "all",
    companies: scope === "company" ? companySel : undefined,
    clear,
    preview: isPreview,
    ops: clear ? undefined : op.map((o) => ({ field: o.field, mode: o.mode, value: Number(o.value) || 0 })).filter((o) => o.value !== 0 || o.mode === "set"),
  });

  const doPost = async (isPreview: boolean, clear = false) => {
    if (!cities.size) return toast.error("Pick at least one city or town");
    if (scope === "company" && !companySel.length) return toast.error("Pick at least one company");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/pricing/location", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(buildBody(isPreview, clear)),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      if (isPreview) setPreview(d);
      else {
        toast.success(clear ? `Overrides cleared for ${d.changed} products` : `Location prices applied — ${d.changed} products × ${d.cities.length} cities`);
        setPreview(null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Location pricing failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-[15px] font-semibold text-gray-900">City-wise price changes</h2>
        <p className="mt-1 text-[13px] text-gray-500">
          Pick a warehouse, tick the cities and towns it serves, set the new rate. Only buyers whose registered city matches see the new price — every other location keeps the current price.
        </p>

        {/* step 1 — warehouse */}
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-gray-500">Step 1 — Warehouse</p>
            <select value={whId} onChange={(e) => { setWhId(e.target.value); setCities(new Set()); }} className="h-9 w-full rounded-lg border border-gray-200 px-2 text-[13px]">
              <option value="">Pick a warehouse…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            {wh && <p className="mt-1.5 text-[12px] text-gray-400">{belt.group} — {belt.locations.length} cities and towns</p>}
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-gray-500">Step 2 — Product scope</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => setScope("warehouse")} className={`h-9 rounded-lg border text-[12px] font-medium transition-colors ${scope === "warehouse" ? "border-black bg-black text-yellow-400" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>Whole warehouse</button>
              <button onClick={() => setScope("company")} className={`h-9 rounded-lg border text-[12px] font-medium transition-colors ${scope === "company" ? "border-black bg-black text-yellow-400" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>By company</button>
            </div>
            {scope === "company" && (
              <div className="mt-2 max-h-28 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
                {companies.map((c) => (
                  <label key={c.name} className="flex items-center gap-2 text-[12px] text-gray-700">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-black" checked={companySel.includes(c.name)} onChange={(e) => setCompanySel((ids) => (e.target.checked ? [...ids, c.name] : ids.filter((x) => x !== c.name)))} />
                    {c.name} <span className="text-gray-400">({c.count})</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* step 3 — cities */}
        {wh && belt.locations.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[12px] font-medium text-gray-500">Step 3 — Cities and towns ({cities.size} selected)</p>
              <button onClick={() => setCities(allSelected ? new Set() : new Set(belt.locations))} className="text-[12px] font-medium text-gray-500 underline-offset-2 transition-colors hover:text-gray-800 hover:underline">
                {allSelected ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="grid max-h-44 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-gray-200 p-2 sm:grid-cols-3 lg:grid-cols-5">
              {belt.locations.map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-[12px] text-gray-700 transition-colors hover:bg-gray-50">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-black" checked={cities.has(c)} onChange={() => toggleCity(c)} />
                  <span className="truncate" title={c}>{c}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* step 4 — rates */}
        <div className="mt-4">
          <p className="mb-1.5 text-[12px] font-medium text-gray-500">Step 4 — New rate</p>
          <div className="space-y-2">
            {op.map((o, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5">
                <select value={o.field} onChange={(e) => setOp((arr) => arr.map((x, j) => (j === i ? { ...x, field: e.target.value as "dealerPrice" | "mrp" } : x)))} className="h-9 rounded-lg border border-gray-200 px-2 text-[12px]">
                  <option value="dealerPrice">Selling price (rate)</option>
                  <option value="mrp">MRP</option>
                </select>
                <select value={o.mode} onChange={(e) => setOp((arr) => arr.map((x, j) => (j === i ? { ...x, mode: e.target.value as "percent" | "amount" | "set" } : x)))} className="h-9 w-28 rounded-lg border border-gray-200 px-2 text-[12px]">
                  <option value="percent">% change</option>
                  <option value="amount">₹ change</option>
                  <option value="set">set exact</option>
                </select>
                <input value={o.value} onChange={(e) => setOp((arr) => arr.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} inputMode="decimal" className="h-9 w-24 rounded-lg border border-gray-200 px-2 text-[12px]" />
                {op.length > 1 && <button onClick={() => setOp((arr) => arr.filter((_, j) => j !== i))} aria-label="Remove"><XCircle className="h-4 w-4 text-gray-400 transition-colors hover:text-red-500" /></button>}
              </div>
            ))}
            {op.length < 2 && (
              <button onClick={() => setOp((arr) => [...arr, { field: "mrp", mode: "percent", value: "0" }])} className="rounded-lg border border-dashed border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-500 transition-colors hover:border-gray-400">+ also change MRP</button>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button onClick={() => doPost(true)} disabled={busy} className="flex h-9 items-center rounded-lg border border-gray-200 bg-white px-4 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50">Preview</button>
          <button onClick={() => { if (confirm(`Apply new rates for ${cities.size} cities/towns? Only those buyers see the change.`)) doPost(false); }} disabled={busy || !preview} className="flex h-9 items-center rounded-lg bg-black px-4 text-[13px] font-semibold text-yellow-400 transition-colors hover:bg-gray-900 disabled:opacity-50">Apply</button>
          <button onClick={() => { if (confirm(`Remove ALL overrides for the selected cities? Products go back to their base price.`)) doPost(false, true); }} disabled={busy} className="flex h-9 items-center rounded-lg border border-red-100 px-4 text-[13px] font-medium text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50">Clear overrides</button>
          <span className="text-[12px] text-gray-400">Nothing here ever touches the ERP — website database only</span>
        </div>

        {preview && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-[13px] font-medium text-gray-700">Preview — {preview.products} products × {preview.cities.length} cities</p>
            <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-left text-[12px] tabular-nums">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-[12px] font-medium text-gray-500">
                    <th className="px-3 py-2">SKU</th><th className="px-3 py-2">Product</th><th className="px-3 py-2 text-right">New rate</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((s) => (
                    <tr key={s.sku} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-500">{s.sku}</td>
                      <td className="max-w-[260px] truncate px-3 py-2">{s.name}</td>
                      <td className="px-3 py-2 text-right">{s.dealerPrice != null ? formatINR(s.dealerPrice) : ""}{s.mrp != null ? ` · MRP ${formatINR(s.mrp)}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════ BRAND PRODUCTS (per-brand catalogue under Brand Management) ══════════════ */
type ProdRow = {
  id: string; sku: string; name: string; image: string; dealerPrice: number; mrp: number;
  stock: number; active: boolean; isTop: boolean; isFeatured: boolean; isHot: boolean; isDeal: boolean;
};

export function CompanyProductsModule({ token }: { token: string }) {
  const call = api(token);
  const [companies, setCompanies] = useState<{ name: string; count: number }[]>([]);
  const [company, setCompany] = useState("");
  const [rows, setRows] = useState<ProdRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    call("/api/admin/products/companies")
      .then((d) => setCompanies(d.companies ?? []))
      .catch(() => {});

  }, [token]);

  const loadCompany = async () => {
    if (!company) return;
    setLoading(true);
    try {
      const d = await call(`/api/admin/products?company=${encodeURIComponent(company)}&limit=100`);
      setRows(d.rows ?? []);
    } catch {
      toast.error("Failed to load company products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCompany();

  }, [company, token]);

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
      <ModuleHeader title="Company Products" sub="Pick a company to manage its full product list — visibility, prices at a glance, homepage sections">
        <select value={company} onChange={(e) => setCompany(e.target.value)} className="h-9 max-w-[240px] rounded-lg border px-2 text-xs font-semibold">
          <option value="">Select company…</option>
          {companies.map((c) => (
            <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter products…" className="h-9 w-48 rounded-lg border px-3 text-xs outline-none focus:border-yellow-400" />
      </ModuleHeader>

      {!company ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-gray-400">Select a company above to view and manage its products.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-left text-[12px] font-medium text-gray-500">
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
                    <div className="flex gap-1 text-[9px] font-semibold">
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
