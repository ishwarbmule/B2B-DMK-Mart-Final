"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, LogOut, Package, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { StoreChrome } from "@/components/dmk/store-chrome";
import { useHydrated } from "@/hooks/use-hydrated";
import { formatINR } from "@/lib/store";

type Customer = {
  id: string; name: string; shopName: string; phone: string; email: string;
  customerType: string; tier: string; status: string; city: string; gstin: string;
  orders: number; totalSpent: number;
};

type RecentOrder = { id: string; invoiceNo: string; grandTotal: number; status: string; createdAt: string; otp?: string };

const TYPES = [
  { key: "RETAILER", label: "Retailer", hint: "Shop counter — tier 4 pricing", icon: User },
  { key: "WHOLESALE", label: "Wholesaler", hint: "Bulk resale — tier 2 pricing", icon: Building2 },
  { key: "DISTRIBUTOR", label: "Distributor", hint: "Territory distribution — tier 1 pricing", icon: Package },
];

export default function AccountPage() {
  const hydrated = useHydrated();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState({ phone: "", password: "" });
  const [reg, setReg] = useState({ name: "", shopName: "", phone: "", email: "", password: "", customerType: "RETAILER", gstin: "", city: "" });

  useEffect(() => {
    const token = localStorage.getItem("dmk-customer-token");
    if (!token) return;
    fetch("/api/auth/me", { headers: { "x-customer-token": token } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.customer) {
          setCustomer(d.customer);
          setOrders(d.recentOrders ?? []);
        } else localStorage.removeItem("dmk-customer-token");
      })
      .catch(() => {});
  }, []);

  const doLogin = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(login),
      });
      const d = await res.json();
      if (!res.ok) return toast.error(d.error ?? "Login failed");
      localStorage.setItem("dmk-customer-token", d.token);
      setCustomer(d.customer);
      toast.success(`Welcome back, ${d.customer.shopName || d.customer.name}!`);
      const me = await fetch("/api/auth/me", { headers: { "x-customer-token": d.token } }).then((r) => r.json());
      setOrders(me.recentOrders ?? []);
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(reg),
      });
      const d = await res.json();
      if (!res.ok) return toast.error(d.error ?? "Registration failed");
      toast.success(d.message);
      setMode("login");
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("dmk-customer-token");
    setCustomer(null);
    setOrders([]);
  };

  return (
    <StoreChrome>
      <div className="mx-auto max-w-3xl px-3 py-8 md:px-6">
        {!hydrated ? null : customer ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-2xl border bg-white p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-yellow-600">{customer.customerType}</p>
                <h1 className="text-xl font-black text-gray-900">{customer.shopName || customer.name}</h1>
                <p className="text-xs text-gray-500">{customer.phone} · {customer.city || "—"} {customer.gstin ? `· GSTIN ${customer.gstin}` : ""}</p>
              </div>
              <button onClick={logout} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50">
                <LogOut className="h-3.5 w-3.5" /> Logout
              </button>
            </div>

            {customer.status !== "APPROVED" && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-bold">Account pending approval</p>
                  <p className="text-xs">You can browse & order at retailer (tier 4) rates. Wholesale tier pricing unlocks once DMK Mart approves your business account.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border bg-white p-4 text-center">
                <p className="text-xl font-black text-gray-900">{customer.orders}</p>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Orders</p>
              </div>
              <div className="rounded-2xl border bg-white p-4 text-center">
                <p className="text-xl font-black text-gray-900">{formatINR(customer.totalSpent)}</p>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Lifetime value</p>
              </div>
              <div className="rounded-2xl border bg-white p-4 text-center">
                <p className="text-xl font-black uppercase text-yellow-600">{customer.tier}</p>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Price tier</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border bg-white">
              <p className="border-b bg-gray-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-600">Recent Orders</p>
              {orders.length === 0 ? (
                <p className="p-6 text-center text-xs text-gray-400">No orders yet — <Link href="/catalog" className="font-bold text-yellow-600">start ordering →</Link></p>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="border-b last:border-0">
                        <td className="px-4 py-2.5 font-bold text-gray-900">{o.invoiceNo}</td>
                        <td className="px-4 py-2.5 text-gray-500">{new Date(o.createdAt).toLocaleDateString("en-IN")}</td>
                        <td className="px-4 py-2.5 font-black">{formatINR(o.grandTotal)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${o.status === "DELIVERED" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{o.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-md">
            <div className="mb-5 text-center">
              <h1 className="text-2xl font-black text-gray-900">B2B Account</h1>
              <p className="text-xs text-gray-500">Retailer, wholesaler & distributor pricing on 2,272 SKUs</p>
            </div>

            <div className="mb-4 grid grid-cols-2 rounded-xl border p-1">
              <button onClick={() => setMode("login")} className={`rounded-lg py-2 text-xs font-bold ${mode === "login" ? "bg-black text-yellow-400" : "text-gray-500"}`}>Login</button>
              <button onClick={() => setMode("register")} className={`rounded-lg py-2 text-xs font-bold ${mode === "register" ? "bg-black text-yellow-400" : "text-gray-500"}`}>Register</button>
            </div>

            {mode === "login" ? (
              <div className="space-y-3 rounded-2xl border bg-white p-5">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-gray-600">Mobile number</label>
                  <input value={login.phone} onChange={(e) => setLogin((f) => ({ ...f, phone: e.target.value }))} placeholder="10-digit mobile" className="h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-yellow-400" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-gray-600">Password</label>
                  <input type="password" value={login.password} onChange={(e) => setLogin((f) => ({ ...f, password: e.target.value }))} placeholder="••••••" className="h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-yellow-400" />
                </div>
                <button onClick={doLogin} disabled={busy} className="w-full rounded-xl bg-black py-3 text-sm font-bold uppercase text-yellow-400 hover:bg-gray-800 disabled:opacity-50">
                  {busy ? "Signing in…" : "Login to B2B Account"}
                </button>
                <p className="text-center text-[10px] text-gray-400">Demo: 9822011102 / demo1234 (approved wholesaler)</p>
              </div>
            ) : (
              <div className="space-y-3 rounded-2xl border bg-white p-5">
                <div className="grid grid-cols-3 gap-2">
                  {TYPES.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setReg((f) => ({ ...f, customerType: t.key }))}
                      className={`rounded-xl border-2 p-2.5 text-center transition ${reg.customerType === t.key ? "border-yellow-400 bg-yellow-50" : "border-gray-200 hover:border-gray-300"}`}
                    >
                      <t.icon className="mx-auto h-5 w-5 text-gray-700" />
                      <p className="mt-1 text-[11px] font-black">{t.label}</p>
                      <p className="text-[9px] leading-tight text-gray-400">{t.hint}</p>
                    </button>
                  ))}
                </div>
                <input value={reg.shopName} onChange={(e) => setReg((f) => ({ ...f, shopName: e.target.value }))} placeholder="Business / shop name *" className="h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-yellow-400" />
                <input value={reg.name} onChange={(e) => setReg((f) => ({ ...f, name: e.target.value }))} placeholder="Contact person name *" className="h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-yellow-400" />
                <input value={reg.phone} onChange={(e) => setReg((f) => ({ ...f, phone: e.target.value }))} placeholder="Mobile number *" className="h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-yellow-400" />
                <input value={reg.password} type="password" onChange={(e) => setReg((f) => ({ ...f, password: e.target.value }))} placeholder="Password (min 6 chars) *" className="h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-yellow-400" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={reg.city} onChange={(e) => setReg((f) => ({ ...f, city: e.target.value }))} placeholder="City" className="h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-yellow-400" />
                  <input value={reg.gstin} onChange={(e) => setReg((f) => ({ ...f, gstin: e.target.value }))} placeholder="GSTIN (optional)" className="h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-yellow-400" />
                </div>
                <button onClick={doRegister} disabled={busy} className="w-full rounded-xl bg-black py-3 text-sm font-bold uppercase text-yellow-400 hover:bg-gray-800 disabled:opacity-50">
                  {busy ? "Creating…" : "Create B2B Account"}
                </button>
                <p className="text-center text-[10px] text-gray-400">Accounts are approved by the DMK Mart team to activate tier pricing.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </StoreChrome>
  );
}
