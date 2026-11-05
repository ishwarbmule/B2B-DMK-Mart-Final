"use client";

/**
 * Salesteam Portal (/salesteam) — login for field salespeople created by the admin.
 *  • New Order   — visit a shop, capture customer details (find-or-create by phone),
 *                  build the product list, verify, confirm → lands in the admin Orders
 *                  section with the salesperson's name, routed to the nearest warehouse.
 *  • My Orders   — the order book: every order this salesperson brought to the business.
 *  • My Customers— shops on the beat + create a brand-new customer (all details + location).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  BadgeCheck, BookOpen, ClipboardList, Loader2, LogOut, Plus, Search, Store, Trash2, UserPlus, Users,
} from "lucide-react";
import { toast } from "sonner";
import { formatINR } from "@/lib/store";

type Profile = { id: string; name: string; mobile: string; area: string; email?: string };

type ProductHit = { id: string; name: string; sku: string; image: string; brand?: { name?: string }; dealerPrice?: number; mrp?: number; unit?: string; packQty?: number };
type Line = { productId: string; name: string; sku: string; image: string; unitType: "SINGLE" | "PACK"; qty: number; unitPrice: number };

type OrderRow = {
  id: string; invoiceNo: string; customerName: string; phone: string; city: string;
  grandTotal: number; status: string; createdAt: string; warehouseName?: string;
  items: { id: string; name: string; qty: number; unitType: string; total: number }[];
};

type CustomerRow = {
  id: string; name: string; shopName: string; phone: string; city: string; pincode: string;
  address: string; customerType: string; status: string; mine?: boolean; createdAt: string;
};

const emptyCustomer = {
  customerName: "", phone: "", shopName: "", gstin: "", addressLine: "", city: "", pincode: "", customerType: "RETAILER",
};

export function SalesteamPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [signing, setSigning] = useState(false);
  const [tab, setTab] = useState<"new" | "orders" | "customers">("new");

  useEffect(() => {
    const t = localStorage.getItem("dmk-salesteam-token");
    const p = localStorage.getItem("dmk-salesteam-profile");
    if (t && p) { setToken(t); try { setProfile(JSON.parse(p) as Profile); } catch { /* relogin */ } }
  }, []);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigning(true);
    try {
      const res = await fetch("/api/salesteam/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Invalid credentials"); return; }
      localStorage.setItem("dmk-salesteam-token", data.token);
      localStorage.setItem("dmk-salesteam-profile", JSON.stringify(data.profile));
      setToken(data.token);
      setProfile(data.profile);
      toast.success(`Welcome ${data.profile.name} — have a productive day on the road!`);
    } catch {
      toast.error("Network error");
    } finally {
      setSigning(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem("dmk-salesteam-token");
    localStorage.removeItem("dmk-salesteam-profile");
    setToken(null);
    setProfile(null);
  };

  if (!token || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-4">
        <div className="w-full max-w-sm rounded-3xl border border-gray-800 bg-gray-950 p-8">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <Image src="/dmk-logo.png" alt="DMK Mart" width={56} height={56} className="h-14 w-14 rounded-full" unoptimized />
            <h1 className="text-lg font-black text-white">DMK Mart <span className="text-yellow-400">Sales Team</span></h1>
            <p className="text-[11px] text-gray-500">Field ordering portal · retailer visits &amp; bookings</p>
          </div>
          <form onSubmit={signIn} className="space-y-3">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username or mobile"
              className="h-11 w-full rounded-xl border border-gray-800 bg-gray-900 px-3.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-yellow-400"
              required
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="h-11 w-full rounded-xl border border-gray-800 bg-gray-900 px-3.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-yellow-400"
              required
            />
            <button
              type="submit"
              disabled={signing}
              className="h-11 w-full rounded-xl bg-yellow-400 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:opacity-60"
            >
              {signing ? "Signing in…" : "Sign In"}
            </button>
          </form>
          <p className="mt-4 text-center text-[10px] text-gray-600">Logins are created by the DMK Mart admin (Salesperson Management).</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-black px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Image src="/dmk-logo.png" alt="DMK" width={30} height={30} className="h-[30px] w-[30px] rounded-full" unoptimized />
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-white">{profile.name}</p>
            <p className="truncate text-[10px] text-yellow-400">{profile.area ? `Area: ${profile.area}` : "Sales Team"} · {profile.mobile}</p>
          </div>
        </div>
        <button onClick={signOut} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-black text-black hover:bg-yellow-300">
          <LogOut className="h-3.5 w-3.5" /> Logout
        </button>
      </div>

      <div className="mx-auto max-w-4xl p-4">
        <div className="mb-4 flex gap-1.5 overflow-x-auto">
          {([
            { id: "new", label: "New Order", icon: ClipboardList },
            { id: "orders", label: "My Orders", icon: BookOpen },
            { id: "customers", label: "My Customers", icon: Users },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition ${
                tab === id ? "bg-black text-yellow-400" : "border bg-white text-gray-600 hover:border-yellow-400"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {tab === "new" ? <NewOrder token={token} /> : tab === "orders" ? <MyOrders token={token} /> : <MyCustomers token={token} />}
      </div>
    </div>
  );
}

/* ══════════════ NEW ORDER ══════════════ */

function NewOrder({ token }: { token: string }) {
  const [cust, setCust] = useState({ ...emptyCustomer });
  const [lookup, setLookup] = useState("");
  const [found, setFound] = useState<CustomerRow | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<{ invoiceNo: string; total: number; warehouseName?: string } | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // debounced product search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setHits([]); return; }
    searchTimer.current = setTimeout(() => {
      setSearching(true);
      fetch(`/api/products?q=${encodeURIComponent(q.trim())}&limit=8`)
        .then((r) => r.json())
        .then((d) => setHits(d.products ?? []))
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [q]);

  // find existing shop by phone → autofill
  const lookupCustomer = async () => {
    const phone = lookup.replace(/\D/g, "");
    if (phone.length !== 10) return toast.error("Enter the 10-digit shop mobile");
    try {
      const res = await fetch("/api/orders?phone=" + phone);
      const d = await res.json();
      const last = (d.orders ?? [])[0];
      if (last) {
        const existing: CustomerRow = {
          id: last.customerId ?? "", name: last.customerName, shopName: "", phone: last.phone,
          city: last.city, pincode: last.pincode, address: last.addressLine,
          customerType: last.customerType ?? "RETAILER", status: "EXISTING", createdAt: last.createdAt,
        };
        setFound(existing);
        setCust({
          customerName: existing.name, phone: existing.phone, shopName: existing.shopName,
          gstin: "", addressLine: existing.address, city: existing.city, pincode: existing.pincode, customerType: existing.customerType,
        });
        toast.success(`Existing customer — ${existing.name}`);
      } else {
        setFound(null);
        toast.info("New shop — fill the details below");
      }
    } catch { /* offline */ }
  };

  const addProduct = (p: ProductHit) => {
    if (lines.some((l) => l.productId === p.id)) { toast.info("Already in the order list"); return; }
    setLines((ls) => [...ls, {
      productId: p.id, name: p.name, sku: p.sku, image: p.image || "/dmk-logo.png",
      unitType: "SINGLE", qty: 1, unitPrice: p.dealerPrice ?? 0,
    }]);
  };

  const itemTotal = useMemo(() => lines.reduce((s, l) => s + l.unitPrice * l.qty, 0), [lines]);

  const placeOrder = async () => {
    if (!cust.customerName.trim() || !/^[6-9]\d{9}$/.test(cust.phone)) return toast.error("Customer name and valid 10-digit mobile are required");
    if (!cust.addressLine.trim() || !cust.city.trim() || !/^\d{6}$/.test(cust.pincode)) return toast.error("Full location (address, city, 6-digit pincode) is required");
    if (lines.length === 0) return toast.error("Add at least one product");
    if (!confirm(`Verify order list:\n${lines.map((l) => `• ${l.name} × ${l.qty}`).join("\n")}\n\nPlace this order for ${cust.customerName}?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/salesteam/orders", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...cust,
          items: lines.map((l) => ({ id: l.productId, unitType: l.unitType, qty: Number(l.qty) })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Order failed");
      setPlaced({ invoiceNo: d.invoiceNo, total: d.bill?.grandTotal ?? 0, warehouseName: d.bill?.warehouseName });
      setLines([]);
      setCust({ ...emptyCustomer });
      setFound(null);
      toast.success(`Order ${d.invoiceNo} placed — visible in the admin Orders section`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Order failed");
    } finally {
      setBusy(false);
    }
  };

  const input = "h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400";

  if (placed) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center">
        <BadgeCheck className="mx-auto h-12 w-12 text-emerald-500" />
        <h2 className="mt-3 text-lg font-black text-gray-900">Order {placed.invoiceNo} confirmed</h2>
        <p className="mt-1 text-xs text-gray-500">
          ₹{placed.total.toLocaleString("en-IN")} · routed to {placed.warehouseName || "the nearest warehouse"} · the admin panel now shows this order with your name.
        </p>
        <button onClick={() => setPlaced(null)} className="mt-5 rounded-xl bg-black px-5 py-2.5 text-xs font-bold text-yellow-400 hover:bg-gray-800">
          Start next order
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* customer details */}
      <div className="rounded-2xl border bg-white p-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-gray-700"><Store className="h-4 w-4 text-yellow-600" /> Shop / Customer details</p>
        <div className="mb-3 flex gap-2">
          <input
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), lookupCustomer())}
            placeholder="Shop mobile — check if the customer already exists"
            className={input + " flex-1"}
            inputMode="numeric"
          />
          <button onClick={lookupCustomer} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-black px-3 text-xs font-bold text-yellow-400 hover:bg-gray-800">
            <Search className="h-3.5 w-3.5" /> Find
          </button>
        </div>
        {found && (
          <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
            Existing customer found — details filled below (orders will attach to their account).
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-gray-700">Contact name *</label>
            <input value={cust.customerName} onChange={(e) => setCust({ ...cust, customerName: e.target.value })} className={input} placeholder="Owner / contact person" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700">Mobile *</label>
            <input value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} className={input} inputMode="numeric" placeholder="10-digit mobile" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700">Shop name</label>
            <input value={cust.shopName} onChange={(e) => setCust({ ...cust, shopName: e.target.value })} className={input} placeholder="e.g. Shree Traders" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700">GSTIN</label>
            <input value={cust.gstin} onChange={(e) => setCust({ ...cust, gstin: e.target.value.toUpperCase() })} className={input} placeholder="optional" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-gray-700">Shop address *</label>
            <input value={cust.addressLine} onChange={(e) => setCust({ ...cust, addressLine: e.target.value })} className={input} placeholder="Street, area, landmark" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700">City *</label>
            <input value={cust.city} onChange={(e) => setCust({ ...cust, city: e.target.value })} className={input} placeholder="e.g. Pune" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700">Pincode *</label>
            <input value={cust.pincode} onChange={(e) => setCust({ ...cust, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })} className={input} inputMode="numeric" placeholder="6-digit pincode" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700">Customer type</label>
            <select value={cust.customerType} onChange={(e) => setCust({ ...cust, customerType: e.target.value })} className={input}>
              {["RETAILER", "WHOLESALE", "SEMI_WHOLESALE", "DISTRIBUTOR"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* products */}
      <div className="rounded-2xl border bg-white p-4">
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-gray-700">Products required by the shop</p>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products by name / SKU…" className="h-10 w-full rounded-lg border border-gray-200 pl-8 pr-3 text-sm outline-none focus:border-yellow-400" />
          {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />}
        </div>
        {hits.length > 0 && (
          <div className="mt-2 max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-gray-200 p-2">
            {hits.map((p) => (
              <button key={p.id} onClick={() => addProduct(p)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-yellow-50">
                <span className="min-w-0 truncate font-semibold text-gray-800">{p.name}</span>
                <span className="ml-2 shrink-0 font-bold text-yellow-600">₹{p.dealerPrice ?? "—"} <Plus className="inline h-3 w-3" /></span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 space-y-2">
          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-xs text-gray-400">No products added yet — search above.</p>
          ) : (
            lines.map((l) => (
              <div key={l.productId} className="flex items-center gap-2 rounded-xl border p-2">
                <Image src={l.image} alt={l.name} width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg object-cover" unoptimized />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-gray-900">{l.name}</p>
                  <p className="text-[10px] text-gray-500">{l.sku} · ₹{l.unitPrice}/pc</p>
                </div>
                <input
                  type="number"
                  min={1}
                  value={l.qty}
                  onChange={(e) => setLines((ls) => ls.map((x) => (x.productId === l.productId ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))}
                  className="h-8 w-16 rounded-lg border border-gray-200 text-center text-xs font-black outline-none focus:border-yellow-400"
                  aria-label={`Quantity for ${l.name}`}
                />
                <button onClick={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))} className="rounded-md bg-red-50 p-1.5 text-red-600 hover:bg-red-100" aria-label="Remove line">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* verify + confirm */}
      <div className="sticky bottom-3 rounded-2xl border bg-white p-4 shadow-lg">
        <div className="flex items-center justify-between text-sm">
          <span className="font-black text-gray-900">{lines.length} line{lines.length !== 1 ? "s" : ""}</span>
          <span className="font-black tabular-nums text-gray-900">≈ {formatINR(itemTotal)} <span className="text-[10px] font-semibold text-gray-400">(slab & delivery apply on invoice)</span></span>
        </div>
        <button
          onClick={placeOrder}
          disabled={busy}
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-black py-3 text-sm font-bold uppercase tracking-wide text-yellow-400 hover:bg-gray-800 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
          Verify Order List &amp; Confirm Order
        </button>
      </div>
    </div>
  );
}

/* ══════════════ MY ORDERS ══════════════ */

function MyOrders({ token }: { token: string }) {
  const [data, setData] = useState<{ orders: OrderRow[]; summary: { count: number; brought: number } } | null>(null);

  const load = useCallback(() => {
    fetch("/api/salesteam/orders", { headers: { authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setData({ orders: d.orders ?? [], summary: d.summary ?? { count: 0, brought: 0 } }))
      .catch(() => toast.error("Failed to load your orders"));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-wide text-gray-400">Orders brought</p>
          <p className="text-2xl font-black text-gray-900">{data?.summary.count ?? "—"}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-wide text-gray-400">Business brought</p>
          <p className="text-2xl font-black text-gray-900">{data ? formatINR(data.summary.brought) : "—"}</p>
        </div>
      </div>
      {!data ? (
        <div className="rounded-2xl border bg-white p-10 text-center text-gray-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
      ) : data.orders.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-xs text-gray-400">No orders yet — book your first shop order under “New Order”.</p>
      ) : (
        <div className="space-y-2">
          {data.orders.map((o) => (
            <div key={o.id} className="rounded-2xl border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-black text-gray-900">{o.invoiceNo}</p>
                  <p className="text-[11px] text-gray-500">{o.customerName} · {o.phone} · {o.city || "—"} · {new Date(o.createdAt).toLocaleDateString("en-IN")}</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-black text-gray-900">{formatINR(o.grandTotal)}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    o.status === "DELIVERED" ? "bg-emerald-50 text-emerald-700"
                    : o.status === "CANCELLED" ? "bg-red-50 text-red-600"
                    : o.status === "PENDING" ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"}`}>
                    {o.status}
                  </span>
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-gray-500">
                {o.items.map((i) => `${i.name} × ${i.qty}`).join(" · ")}
                {o.warehouseName ? <span className="ml-1 font-semibold text-blue-700">· 🏭 {o.warehouseName}</span> : null}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════ MY CUSTOMERS ══════════════ */

function MyCustomers({ token }: { token: string }) {
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", shopName: "", phone: "", email: "", gstin: "", address: "", city: "", pincode: "", customerType: "RETAILER" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/salesteam/customers", { headers: { authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers ?? []))
      .catch(() => toast.error("Failed to load customers"));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim() || !/^[6-9]\d{9}$/.test(form.phone)) return toast.error("Name and valid 10-digit mobile are required");
    if (!form.address.trim() || !form.city.trim() || !/^\d{6}$/.test(form.pincode)) return toast.error("Full shop location is required");
    setBusy(true);
    try {
      const res = await fetch("/api/salesteam/customers", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Create failed");
      toast.success(`${d.customer.name} added to your shop book`);
      setAdding(false);
      setForm({ name: "", shopName: "", phone: "", email: "", gstin: "", address: "", city: "", pincode: "", customerType: "RETAILER" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const input = "h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500">{customers?.length ?? "…"} shops on your beat</p>
        <button onClick={() => setAdding((a) => !a)} className="flex items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-xs font-bold text-yellow-400 hover:bg-gray-800">
          <UserPlus className="h-3.5 w-3.5" /> {adding ? "Close form" : "New Shop Visit"}
        </button>
      </div>

      {adding && (
        <div className="mb-4 rounded-2xl border bg-white p-4">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-gray-700">New customer — all shop details &amp; location</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-gray-700">Contact name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700">Shop name</label>
              <input value={form.shopName} onChange={(e) => setForm({ ...form, shopName: e.target.value })} className={input} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700">Mobile *</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} className={input} inputMode="numeric" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700">Email</label>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700">GSTIN</label>
              <input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} className={input} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700">Customer type</label>
              <select value={form.customerType} onChange={(e) => setForm({ ...form, customerType: e.target.value })} className={input}>
                {["RETAILER", "WHOLESALE", "SEMI_WHOLESALE", "DISTRIBUTOR"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-gray-700">Shop address *</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={input} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700">City *</label>
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={input} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700">Pincode *</label>
              <input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })} className={input} inputMode="numeric" />
            </div>
          </div>
          <button onClick={create} disabled={busy} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-black py-2.5 text-xs font-bold uppercase tracking-wide text-yellow-400 hover:bg-gray-800 disabled:opacity-60">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Create Customer Account
          </button>
        </div>
      )}

      {!customers ? (
        <div className="rounded-2xl border bg-white p-10 text-center text-gray-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
      ) : customers.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-xs text-gray-400">No shops yet — add your first customer from a visit.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {customers.map((c) => (
            <div key={c.id} className="rounded-2xl border bg-white p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-bold text-gray-900">{c.shopName || c.name}</p>
                {c.mine && <span className="shrink-0 rounded-full bg-yellow-100 px-2 py-0.5 text-[9px] font-black text-yellow-700">ADDED BY YOU</span>}
              </div>
              <p className="text-[11px] text-gray-500">{c.name} · {c.phone}</p>
              <p className="mt-0.5 line-clamp-2 text-[10px] text-gray-400">{[c.address, c.city, c.pincode].filter(Boolean).join(", ")}</p>
              <p className="mt-1 text-[10px] font-semibold text-gray-500">{c.customerType.replace(/_/g, " ")} · {c.status}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
