"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, KeyRound, Package, PackageCheck, ReceiptText, Truck } from "lucide-react";
import { StoreChrome } from "@/components/dmk/store-chrome";
import { useHydrated } from "@/hooks/use-hydrated";
import { formatINR } from "@/lib/store";
import { clearCustomerToken, getCustomerToken } from "@/lib/customer-session";

type OrderItem = { id: string; name: string; image: string; qty: number; unitType: string; packQty: number; total: number };

type MyOrder = {
  id: string; invoiceNo: string; status: string; shippingStatus: string; createdAt: string;
  confirmedAt: string | null; nextDeliveryAt: string;
  fulfillment: string; pickupWarehouseName: string;
  addressLine: string; city: string; pincode: string;
  totalUnits: number; grandTotal: number; otp: string; note: string;
  items: OrderItem[];
};

type Tab = "ALL" | "PENDING" | "CONFIRMED" | "DELIVERED";

function statusOf(o: MyOrder): { label: string; cls: string } {
  if (o.status === "DELIVERED" || o.shippingStatus === "DELIVERED") return { label: "Delivered", cls: "bg-emerald-50 text-emerald-700" };
  if (o.status === "CONFIRMED") return { label: "Confirmed — preparing", cls: "bg-blue-50 text-blue-700" };
  if (o.status === "CANCELLED") return { label: "Cancelled", cls: "bg-red-50 text-red-600" };
  return { label: "Pending confirmation", cls: "bg-orange-50 text-orange-700" };
}

const TABS: [Tab, string][] = [
  ["ALL", "All"],
  ["PENDING", "Pending"],
  ["CONFIRMED", "Confirmed"],
  ["DELIVERED", "Delivered"],
];

function OrdersInner() {
  const hydrated = useHydrated();
  const router = useRouter();
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [tab, setTab] = useState<Tab>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getCustomerToken();
    if (!token) {
      setOrders([]);
      return;
    }
    try {
      const res = await fetch("/api/orders?mine=1&limit=50", { headers: { "x-customer-token": token }, cache: "no-store" });
      if (res.status === 401) {
        clearCustomerToken();
        setOrders([]);
        return;
      }
      const d = await res.json();
      setOrders(d.orders ?? []);
    } catch {
      setOrders([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // not signed in → send to the account page (login/signup)
    if (hydrated && orders !== null && orders.length === 0 && !getCustomerToken()) {
      router.replace("/account?next=/account/orders");
    }
  }, [hydrated, orders, router]);

  const filtered = (orders ?? []).filter((o) => {
    if (tab === "ALL") return true;
    if (tab === "PENDING") return o.status === "PENDING";
    if (tab === "CONFIRMED") return o.status === "CONFIRMED";
    return o.status === "DELIVERED" || o.shippingStatus === "DELIVERED";
  });

  return (
    <StoreChrome>
      <div className="min-h-[70vh] bg-[#f7f8f8] py-8 md:py-10">
        <div className="mx-auto w-full max-w-[860px] px-3">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/account" className="flex h-9 w-9 items-center justify-center rounded-full border bg-white text-gray-600 hover:bg-gray-50" aria-label="Back to My Account">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <h1 className="text-xl font-black text-gray-900">My Orders</h1>
                <p className="text-xs text-gray-500">Every order, its live status and the itemised invoice</p>
              </div>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-black"><PackageCheck className="h-5 w-5 text-yellow-400" /></span>
          </div>

          {/* status filter tabs */}
          <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {TABS.map(([k, label]) => {
              const count = (orders ?? []).filter((o) =>
                k === "ALL" ? true : k === "PENDING" ? o.status === "PENDING" : k === "CONFIRMED" ? o.status === "CONFIRMED" : o.status === "DELIVERED" || o.shippingStatus === "DELIVERED",
              ).length;
              return (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition ${
                    tab === k ? "border-black bg-black text-yellow-400" : "border-gray-200 bg-white text-gray-600 hover:border-yellow-400"
                  }`}
                >
                  {label} <span className={`rounded-full px-1.5 text-[9px] font-black ${tab === k ? "bg-yellow-400 text-black" : "bg-gray-100 text-gray-500"}`}>{orders === null ? "…" : count}</span>
                </button>
              );
            })}
          </div>

          {!hydrated || orders === null ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-white p-12 text-center">
              <Package className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-2 text-sm font-bold text-gray-700">
                {tab === "ALL" ? "No orders yet" : `No ${TABS.find(([k]) => k === tab)?.[1].toLowerCase()} orders`}
              </p>
              <p className="mt-1 text-xs text-gray-400">Your placed orders appear here with their live status.</p>
              <Link href="/catalog" className="mt-4 inline-block rounded-xl bg-black px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-yellow-400">Start ordering →</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((o) => {
                const st = statusOf(o);
                const confirmed = Boolean(o.confirmedAt);
                const open = openId === o.id;
                return (
                  <div key={o.id} className="overflow-hidden rounded-2xl border bg-white">
                    <button onClick={() => setOpenId(open ? null : o.id)} className="flex w-full items-center gap-3 p-4 text-left">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${o.fulfillment === "PICKUP" ? "bg-emerald-50" : "bg-blue-50"}`}>
                        {o.fulfillment === "PICKUP" ? <Building2 className="h-5 w-5 text-emerald-600" /> : <Truck className="h-5 w-5 text-blue-600" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-gray-900">{o.invoiceNo}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                        </span>
                        <span className="mt-0.5 block text-[11px] text-gray-500">
                          {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {o.totalUnits} pcs · {o.fulfillment === "PICKUP" ? `Pickup — ${o.pickupWarehouseName || "warehouse"}` : "Delivery"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {confirmed ? (
                          <span className="block text-sm font-black text-gray-900">{formatINR(o.grandTotal)}</span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-orange-600"><ReceiptText className="h-3 w-3" /> Invoice after confirmation</span>
                        )}
                        <span className="mt-0.5 block text-[10px] font-semibold text-gray-400">{open ? "Hide items" : `${o.items.length} item${o.items.length !== 1 ? "s" : ""} ▾`}</span>
                      </span>
                    </button>

                    {open && (
                      <div className="border-t bg-gray-50/60 p-4">
                        {/* timeline */}
                        <div className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                          {["Placed", "Confirmed", "Dispatched", "Delivered"].map((s, i) => {
                            const reached =
                              i === 0 || (i === 1 && confirmed) || (i === 2 && ["DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(o.shippingStatus)) || (i === 3 && (o.status === "DELIVERED" || o.shippingStatus === "DELIVERED"));
                            return (
                              <span key={s} className="flex items-center gap-1.5">
                                {i > 0 && <span className="h-px w-4 bg-gray-300" />}
                                <span className={`rounded-full px-2 py-0.5 ${reached ? "bg-black text-yellow-400" : "bg-gray-200 text-gray-400"}`}>{s}</span>
                              </span>
                            );
                          })}
                        </div>
                        <div className="space-y-2">
                          {o.items.map((it) => (
                            <div key={it.id} className="flex items-center gap-2.5 rounded-xl border bg-white p-2">
                              <Image src={it.image || "/dmk-logo.png"} alt={it.name} width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg object-cover" unoptimized />
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-1 text-xs font-semibold text-gray-900">{it.name}</p>
                                <p className="text-[10px] text-gray-500">
                                  {it.qty} {it.unitType === "SINGLE" ? "pc" : "pack"}{it.packQty > 1 ? ` × ${it.packQty} pcs` : ""}
                                </p>
                              </div>
                              {confirmed ? (
                                <p className="text-xs font-black text-gray-900">{formatINR(it.total)}</p>
                              ) : (
                                <p className="text-[10px] font-semibold text-gray-400">—</p>
                              )}
                            </div>
                          ))}
                        </div>
                        {confirmed ? (
                          <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800">
                            <span>Itemised invoice generated — total {formatINR(o.grandTotal)}</span>
                          </div>
                        ) : (
                          <div className="mt-3 flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] font-semibold text-orange-800">
                            <ReceiptText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>Your itemised invoice is being prepared — pricing appears here the moment the DMK Mart team confirms this order.</span>
                          </div>
                        )}
                        {o.nextDeliveryAt && (
                          <p className="mt-2 text-[11px] font-semibold text-blue-700">Next delivery for pending lines: {o.nextDeliveryAt}</p>
                        )}
                        {o.otp && (
                          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-gray-700">
                            <KeyRound className="h-3.5 w-3.5 text-yellow-600" /> Delivery OTP: <span className="tracking-[0.2em]">{o.otp}</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </StoreChrome>
  );
}

export default function MyOrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersInner />
    </Suspense>
  );
}
