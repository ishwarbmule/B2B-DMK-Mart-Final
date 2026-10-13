"use client";

import { useEffect, useState } from "react";
import {
  IndianRupee, ShoppingCart, CalendarDays, Flame, TrendingUp, Package,
  Clock, CheckCircle2, Truck, Users, Radio, MapPin, LayoutGrid, FolderTree,
  ListTree, Boxes, AlertTriangle, Undo2, Building,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { StatCard, api } from "./ui-bits";
import { formatINR } from "@/lib/store";

interface Stats {
  revenue: number; purchaseValue: number; ordersToday: number; ordersTotal: number;
  pendingOrders: number; completedOrders: number; cancelled: number; delivered: number;
  products: number; companies: number; tops: number; mids: number; ends: number;
  customers: number; salespersons: number; stores: number;
  hotProducts: number; topSelling: number; featured: number; lowStock: number; pendingReturns: number;
  revenueSeries: { date: string; total: number }[];
  topCompanies: { name: string; items: number; revenue: number }[];
  departments: { name: string; products: number }[];
}

export function DashboardModule({ token }: { token: string }) {
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    api(token)("/api/admin/stats").then(setS).catch((e) => toast.error(e.message));
  }, [token]);

  if (!s) return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}</div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={IndianRupee} label="Total Revenue" value={formatINR(s.revenue)} sub={`${s.ordersTotal} orders lifetime`} color="#7c3aed" />
        <StatCard icon={CalendarDays} label="Orders Today" value={s.ordersToday} sub="since midnight" color="#06b6d4" />
        <StatCard icon={Flame} label="Hot Products" value={s.hotProducts} sub="deep discount flags" color="#f97316" />
        <StatCard icon={TrendingUp} label="Top Selling" value={s.topSelling} sub="flagged bestsellers" color="#dc2626" />
        <StatCard icon={Package} label="Products" value={s.products} sub={`${s.companies} companies`} color="#2563eb" />
        <StatCard icon={Clock} label="Pending Orders" value={s.pendingOrders} sub="awaiting action" color="#e11d48" />
        <StatCard icon={CheckCircle2} label="Completed Orders" value={s.completedOrders} sub={`${s.cancelled} cancelled`} color="#16a34a" />
        <StatCard icon={Truck} label="Delivered Shipments" value={s.delivered} sub="shipping pipeline" color="#0891b2" />
        <StatCard icon={Users} label="Active Customers" value={s.customers} sub="registered buyers" color="#ea580c" />
        <StatCard icon={Radio} label="Salespersons" value={s.salespersons} sub="field team" color="#d97706" />
        <StatCard icon={MapPin} label="Retail Stores" value={s.stores} sub="verified partners" color="#0d9488" />
        <StatCard icon={Building} label="Purchase Value" value={formatINR(s.purchaseValue)} sub="procurement this period" color="#4f46e5" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-black">Revenue — Last 14 Days</h3>
            <span className="text-[10px] font-semibold text-gray-400">cancelled orders excluded</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={s.revenueSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
              <RTooltip formatter={(v) => formatINR(Number(v))} labelStyle={{ fontSize: 11 }} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="total" fill="#ffd200" stroke="#111" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h3 className="mb-3 text-sm font-black">Top Companies by Revenue</h3>
          <div className="space-y-2">
            {s.topCompanies.slice(0, 6).map((c, i) => (
              <div key={c.name} className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-[10px] font-black">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{c.name}</p>
                  <p className="text-[10px] text-gray-400">{c.items} units sold</p>
                </div>
                <span className="text-xs font-black">{formatINR(c.revenue)}</span>
              </div>
            ))}
            {!s.topCompanies.length && <p className="text-xs text-gray-400">No sales data yet.</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={LayoutGrid} label="Top Categories" value={s.tops} sub="departments" color="#16a34a" />
        <StatCard icon={FolderTree} label="Mid Categories" value={s.mids} sub="sub-departments" color="#2563eb" />
        <StatCard icon={ListTree} label="End Categories" value={s.ends} sub="granular categories" color="#e11d48" />
        <StatCard icon={Boxes} label="Featured SKUs" value={s.featured} sub="curated picks" color="#d97706" />
        <StatCard icon={AlertTriangle} label="Low / No Stock" value={s.lowStock} sub="≤ 10 units" color="#dc2626" />
        <StatCard icon={Undo2} label="Pending Returns" value={s.pendingReturns} sub="requests open" color="#7c3aed" />
        <StatCard icon={Building} label="Companies" value={s.companies} sub="manufacturing brands" color="#0f766e" />
        <StatCard icon={Radio} label="Catalog Health" value={`${Math.round((s.products ? (s.products - s.lowStock) / s.products : 0) * 100)}%`} sub="in-stock SKUs" color="#16a34a" />
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h3 className="mb-3 text-sm font-black">Department Size Distribution</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={s.departments} layout="vertical">
            <XAxis type="number" tick={{ fontSize: 9 }} />
            <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 9 }} />
            <RTooltip formatter={(v) => `${v} SKUs`} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
            <Bar dataKey="products" fill="#111" radius={[0, 4, 4, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
