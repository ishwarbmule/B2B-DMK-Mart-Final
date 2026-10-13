"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { Loader2, Printer, MapPin, Route, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader, StatusBadge } from "./ui-bits";
import { formatINR } from "@/lib/store";
import type { OrderRow } from "@/lib/types";

const COLORS = ["#ffd200", "#111111", "#2563eb", "#16a34a", "#dc2626", "#7c3aed", "#0d9488", "#ea580c", "#d946ef", "#64748b"];

interface Stats {
  revenueSeries: { date: string; total: number }[];
  topCompanies: { name: string; items: number; revenue: number }[];
  departments: { name: string; products: number }[];
  revenue: number; completedOrders: number; ordersTotal: number; delivered: number;
  pendingOrders: number; cancelled: number;
}

/** Sales Monitoring — trend, company split, department share */
export function MonitoringModule({ token }: { token: string }) {
  const call = useMemo(() => api(token), [token]);
  const [s, setS] = useState<Stats | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  useEffect(() => {
    call("/api/admin/stats").then(setS).catch((e) => toast.error(e.message));
    call("/api/admin/orders?limit=100").then((d) => setOrders(d.rows)).catch(() => {});
  }, [call]);

  if (!s) return <div className="animate-pulse space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 rounded-xl bg-gray-100" />)}</div>;

  const salespersonMap = new Map<string, { orders: number; revenue: number }>();
  for (const o of orders) {
    if (!o.salesPerson) continue;
    const cur = salespersonMap.get(o.salesPerson) || { orders: 0, revenue: 0 };
    cur.orders += 1; cur.revenue += o.grandTotal;
    salespersonMap.set(o.salesPerson, cur);
  }
  const salespersons = Array.from(salespersonMap.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue);

  const sourceMap = [
    { name: "Web orders", value: orders.filter((o) => o.source === "WEB").length },
    { name: "POS sales", value: orders.filter((o) => o.source === "POS").length },
  ];

  return (
    <div className="space-y-5">
      <ModuleHeader title="Sales Monitoring" sub="Live revenue trend, company & channel mix">
        <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-semibold"><Printer className="h-3.5 w-3.5" /> Print Report</button>
      </ModuleHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Net Revenue", formatINR(s.revenue)],
          ["Total Orders", String(s.ordersTotal)],
          ["Fulfilled", String(s.completedOrders)],
          ["Delivered", String(s.delivered)],
          ["Pending", String(s.pendingOrders)],
          ["Cancelled", String(s.cancelled)],
          ["Avg Order Value", formatINR(s.ordersTotal ? Math.round(s.revenue / s.ordersTotal) : 0)],
          ["Company Share Leaders", s.topCompanies[0]?.name ?? "—"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-white p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
            <p className="mt-0.5 truncate text-sm font-black">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h3 className="mb-3 text-sm font-black">Revenue Trend (14 days)</h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={s.revenueSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
            <RTooltip formatter={(v) => formatINR(Number(v))} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
            <Line type="monotone" dataKey="total" stroke="#111" strokeWidth={2} dot={{ r: 3, fill: "#ffd200" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <h3 className="mb-3 text-sm font-black">Revenue by Company</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={s.topCompanies.slice(0, 8)} dataKey="revenue" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {s.topCompanies.slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <RTooltip formatter={(v) => formatINR(Number(v))} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h3 className="mb-3 text-sm font-black">Order Channel Mix</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={sourceMap} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>
                {sourceMap.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 space-y-1.5">
            {salespersons.map((sp) => (
              <div key={sp.name} className="flex items-center gap-2 text-xs">
                <UserCheck className="h-3.5 w-3.5 text-yellow-600" />
                <span className="flex-1 truncate font-semibold">{sp.name}</span>
                <span className="text-gray-400">{sp.orders} orders</span>
                <b>{formatINR(sp.revenue)}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Company Orders report (filter by company + date) */
export function CompanyOrdersModule({ token }: { token: string }) {
  const call = useMemo(() => api(token), [token]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    call(`/api/admin/orders?limit=100&from=${from}&to=${to}`)
      .then((d) => setOrders(d.rows))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [call, from, to]);
  const setRange = (patch: { from?: string; to?: string }) => {
    setLoading(true);
    if (patch.from !== undefined) setFrom(patch.from);
    if (patch.to !== undefined) setTo(patch.to);
  };

  const byCompany = new Map<string, { orders: number; items: number; revenue: number }>();
  for (const o of orders) {
    if (o.status === "CANCELLED") continue;
    for (const it of o.items) {
      const cur = byCompany.get(it.company) || { orders: 0, items: 0, revenue: 0 };
      cur.orders += 1; cur.items += it.units; cur.revenue += it.lineTotal;
      byCompany.set(it.company, cur);
    }
  }
  const rows = Array.from(byCompany.entries()).map(([name, v]) => ({ name, ...v, revenue: Math.round(v.revenue) })).sort((a, b) => b.revenue - a.revenue);

  const printReport = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Company Orders Report</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#111;color:#ffd200}</style></head><body><h2>DMK Mart — Company Orders Report</h2><p>${from || "start"} → ${to || "today"}</p><table><tr><th>Company</th><th>Total Orders</th><th>Items Sold</th><th>Total Revenue</th></tr>${rows.map((r) => `<tr><td>${r.name}</td><td>${r.orders}</td><td>${r.items}</td><td>₹${r.revenue.toLocaleString("en-IN")}</td></tr>`).join("")}</table></body></html>`);
    w.document.close(); w.print();
  };

  return (
    <div>
      <ModuleHeader title="Company Orders Report" sub="Revenue attribution across manufacturing brands">
        <input type="date" value={from} onChange={(e) => setRange({ from: e.target.value })} className="h-9 rounded-lg border border-gray-200 px-2 text-xs" aria-label="From date" />
        <input type="date" value={to} onChange={(e) => setRange({ to: e.target.value })} className="h-9 rounded-lg border border-gray-200 px-2 text-xs" aria-label="To date" />
        <button onClick={printReport} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white"><Printer className="h-3.5 w-3.5" /> Print Report</button>
      </ModuleHeader>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-xs">
          <thead><tr className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
            <th className="px-3 py-2.5 font-bold">#</th><th className="px-3 py-2.5 font-bold">Company Name</th><th className="px-3 py-2.5 font-bold">Total Orders</th><th className="px-3 py-2.5 font-bold">Items Sold</th><th className="px-3 py-2.5 font-bold">Total Revenue</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-300" /></td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.name} className="border-b last:border-0">
                <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                <td className="px-3 py-2 font-semibold">{r.name}</td>
                <td className="px-3 py-2">{r.orders}</td>
                <td className="px-3 py-2">{r.items}</td>
                <td className="px-3 py-2 font-black">{formatINR(r.revenue)}</td>
              </tr>
            ))}
            {!loading && !rows.length && <tr><td colSpan={5} className="py-10 text-center text-gray-400">No order data in range</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Refer Order Management — orders by salesperson */
export function ReferOrdersModule({ token }: { token: string }) {
  const call = useMemo(() => api(token), [token]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [person, setPerson] = useState("");

  useEffect(() => { call("/api/admin/orders?limit=100").then((d) => setOrders(d.rows)).catch(() => {}); }, [call]);

  const persons = Array.from(new Set(orders.map((o) => o.salesPerson).filter(Boolean)));
  const filtered = person ? orders.filter((o) => o.salesPerson === person) : orders;

  return (
    <div>
      <ModuleHeader title="Refer Order Management" sub="Orders tagged to field salespersons">
        <select value={person} onChange={(e) => setPerson(e.target.value)} className="h-9 rounded-lg border border-gray-200 px-2 text-xs" aria-label="Filter salesperson">
          <option value="">All Salespersons</option>
          {persons.map((p) => <option key={p}>{p}</option>)}
        </select>
      </ModuleHeader>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-xs">
          <thead><tr className="border-b bg-gray-50 text-[10px] uppercase text-gray-500">
            <th className="px-3 py-2.5 font-bold">Invoice</th><th className="px-3 py-2.5 font-bold">Customer</th><th className="px-3 py-2.5 font-bold">Salesperson</th><th className="px-3 py-2.5 font-bold">Amount</th><th className="px-3 py-2.5 font-bold">Status</th>
          </tr></thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono">{o.invoiceNo}</td>
                <td className="px-3 py-2 font-semibold">{o.customerName}</td>
                <td className="px-3 py-2">{o.salesPerson || <span className="text-gray-300">— unassigned —</span>}</td>
                <td className="px-3 py-2 font-black">{formatINR(o.grandTotal)}</td>
                <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={5} className="py-10 text-center text-gray-400">No orders found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Trip Planner — pending orders grouped by city/area for dispatch planning */
export function TripPlannerModule({ token }: { token: string }) {
  const call = useMemo(() => api(token), [token]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    call("/api/admin/orders?limit=100&status=PENDING").then((d) => setOrders(d.rows)).finally(() => setLoading(false));
  }, [call]);

  const byCity = new Map<string, OrderRow[]>();
  for (const o of orders) {
    const key = `${o.city} · ${o.zone} Zone`;
    byCity.set(key, [...(byCity.get(key) || []), o]);
  }

  return (
    <div>
      <ModuleHeader title="Trip Planner" sub="Grouped pending dispatches by city & zone — plan vehicle routes">
        <span className="flex items-center gap-1.5 rounded-lg bg-yellow-100 px-3 py-2 text-xs font-bold text-yellow-800">
          <Route className="h-3.5 w-3.5" /> {orders.length} pending orders
        </span>
      </ModuleHeader>
      {loading ? (
        <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-300" /></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from(byCity.entries()).map(([city, list]) => (
            <div key={city} className="rounded-xl border bg-white p-4">
              <p className="flex items-center gap-1.5 text-sm font-black"><MapPin className="h-4 w-4 text-yellow-600" /> {city}</p>
              <p className="text-[11px] text-gray-400">{list.length} orders · {formatINR(list.reduce((s, o) => s + o.grandTotal, 0))}</p>
              <div className="mt-2 space-y-1.5">
                {list.map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px]">
                    <span className="font-mono font-bold">{o.invoiceNo}</span>
                    <span className="truncate px-1 text-gray-500">{o.customerName}</span>
                    <StatusBadge status={o.shippingStatus} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!byCity.size && <p className="col-span-full rounded-xl border border-dashed py-10 text-center text-sm text-gray-400">No pending orders — all dispatched!</p>}
        </div>
      )}
    </div>
  );
}
