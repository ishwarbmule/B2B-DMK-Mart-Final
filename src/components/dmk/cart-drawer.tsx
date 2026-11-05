"use client";

import Image from "next/image";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Minus, Plus, Trash2, Package, Truck, ArrowRight, TicketPercent, CheckCircle2, Store, ReceiptText, UserCheck } from "lucide-react";
import { useCartStore, cartTotals, formatINR, lineKey, unitPriceFor, piecesPerUnit, type UnitType } from "@/lib/store";
import type { Fulfillment } from "@/lib/pricing";
import { useHydrated } from "@/hooks/use-hydrated";
import { useEffect } from "react";
import { toast } from "sonner";
import { QtyInput } from "./product-card";
import { useCatalog } from "./site-header-v2";

const UNIT_BADGE: Record<UnitType, { label: string; cls: string }> = {
  SINGLE: { label: "Piece", cls: "bg-gray-100 text-gray-700" },
  PACK: { label: "Pack", cls: "bg-yellow-100 text-yellow-800" },
  BULK: { label: "Pack", cls: "bg-yellow-100 text-yellow-800" }, // legacy carts only — bulk cases are no longer offered
};

export function CartDrawer({ onCheckout }: { onCheckout: (couponCode: string, couponDisc: number) => void }) {
  const hydrated = useHydrated();
  const items = useCartStore((s) => s.items);
  const isOpen = useCartStore((s) => s.isOpen);
  const closeCart = useCartStore((s) => s.closeCart);
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);
  const fulfillment = useCartStore((s) => s.fulfillment);
  const setFulfillment = useCartStore((s) => s.setFulfillment);
  const salesman = useCartStore((s) => s.salesman);
  const setSalesman = useCartStore((s) => s.setSalesman);
  const catalog = useCatalog();
  const salespersons = catalog?.salespersons ?? [];
  const [coupon, setCoupon] = useState("");
  const [couponDisc, setCouponDisc] = useState(0);
  const [appliedCode, setAppliedCode] = useState("");
  const [checking, setChecking] = useState(false);

  if (!hydrated) return null;
  const t = cartTotals(items, fulfillment);
  const totalPieces = items.reduce((n, i) => n + piecesPerUnit(i) * i.qty, 0);

  /* fulfillment toggle — always visible, one mode is always set; rates/charges/totals follow it */
  const modeToggle = (
    <div className="grid grid-cols-2 gap-2">
      {([
        { mode: "PICKUP" as Fulfillment, icon: Store, title: "Pickup", sub: "Pack rates · no delivery fee" },
        { mode: "DELIVERY" as Fulfillment, icon: Truck, title: "Delivery", sub: "Piece rates · flat ₹250 delivery" },
      ]).map(({ mode, icon: Icon, title, sub }) => {
        const active = fulfillment === mode;
        return (
          <button
            key={mode}
            onClick={() => setFulfillment(mode)}
            aria-pressed={active}
            className={`flex items-center gap-2 rounded-xl border-2 p-2 text-left transition ${
              active ? "border-yellow-400 bg-yellow-50" : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${active ? "text-yellow-600" : "text-gray-400"}`} />
            <span className="min-w-0">
              <span className={`block text-[11px] font-black leading-tight ${active ? "text-gray-900" : "text-gray-600"}`}>{title}</span>
              <span className="block text-[9px] font-semibold leading-tight text-gray-500">{sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );

  const applyCoupon = async () => {
    if (!coupon.trim()) return;
    setChecking(true);
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: coupon.trim(), itemTotal: t.itemTotal, productIds: items.map((i) => i.id) }),
      });
      const data = await res.json();
      if (data.ok) {
        setCouponDisc(data.discount);
        setAppliedCode(data.code);
        toast.success(`${data.code} applied — you save ${formatINR(data.discount)}`);
      } else {
        setCouponDisc(0);
        setAppliedCode("");
        toast.error(data.error ?? "Coupon not applicable");
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && closeCart()}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
        <div className="border-b bg-black px-4 py-3">
          <SheetTitle className="text-sm font-bold text-yellow-400">
            Cart · {t.totalLines} line{t.totalLines !== 1 ? "s" : ""} · {totalPieces} pcs
          </SheetTitle>
          <div className="mt-2">
            {fulfillment === "PICKUP" ? (
              <p className="flex items-center gap-1 text-[10px] font-semibold text-yellow-400">
                <Store className="h-3 w-3" /> Warehouse pickup — pack rates · no delivery fee
              </p>
            ) : (
              <p className="flex items-center gap-1 text-[10px] text-gray-300">
                <Truck className="h-3 w-3" /> Delivery to your address — flat ₹250 charge on every order
              </p>
            )}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <Package className="h-10 w-10 text-gray-300" />
            <p className="text-sm font-semibold text-gray-700">Your cart is empty</p>
            <p className="text-xs text-gray-400">Add pieces or packs to start your order.</p>
            <button onClick={closeCart} className="mt-2 rounded-lg bg-black px-4 py-2 text-xs font-bold text-yellow-400">
              Continue Shopping
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-3">
              {modeToggle}
              <div className="mt-2.5 space-y-2.5">
                {items.map((i) => {
                  const key = lineKey(i.id, i.unitType);
                  const up = unitPriceFor(i, fulfillment); // PICKUP → pack rate · DELIVERY → piece rate
                  const badge = UNIT_BADGE[i.unitType];
                  return (
                    <div key={key} className="flex gap-2.5 rounded-xl border p-2.5">
                      <Image src={i.image || "/dmk-logo.png"} alt={i.name} width={64} height={64} className="h-16 w-16 shrink-0 rounded-lg object-cover" unoptimized />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="truncate text-[10px] font-bold uppercase text-yellow-600">{i.brand}</p>
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${badge.cls}`}>{badge.label}</span>
                        </div>
                        <p className="line-clamp-1 text-xs font-semibold text-gray-900">{i.name}</p>
                        <p className="text-[10px] text-gray-500">
                          {piecesPerUnit(i)} pcs × {i.qty} {i.unitType === "SINGLE" ? "pc" : "pack"} · {formatINR(up)}/{i.unitType === "SINGLE" ? "pc" : "pack"}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <div className="flex items-center rounded-lg bg-yellow-400">
                            <button onClick={() => setQty(key, i.qty - 1)} aria-label="Decrease" className="flex h-6 w-6 items-center justify-center hover:bg-black/10"><Minus className="h-3 w-3" /></button>
                            {/* bulk ordering — type the exact quantity (e.g. 72) instead of tapping + */}
                            <QtyInput value={i.qty} onCommit={(n) => setQty(key, n)} className="w-9 bg-transparent text-center text-[11px] font-black outline-none" />
                            <button onClick={() => setQty(key, i.qty + 1)} aria-label="Increase" className="flex h-6 w-6 items-center justify-center hover:bg-black/10"><Plus className="h-3 w-3" /></button>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-gray-900">{formatINR(Math.round(up * i.qty * 100) / 100)}</p>
                            <button onClick={() => remove(key)} className="flex items-center gap-0.5 text-[10px] text-red-500 hover:underline">
                              <Trash2 className="h-3 w-3" /> Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* coupon */}
              <div className="mt-3 rounded-xl border border-dashed border-yellow-400 bg-yellow-50/60 p-3">
                <p className="flex items-center gap-1 text-[11px] font-bold text-gray-800">
                  <TicketPercent className="h-3.5 w-3.5 text-yellow-600" /> Apply Coupon
                </p>
                <div className="mt-1.5 flex gap-2">
                  <input
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                    placeholder="e.g. DMK10"
                    className="h-8 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-xs uppercase outline-none focus:border-yellow-500"
                    aria-label="Coupon code"
                  />
                  <button onClick={applyCoupon} disabled={checking} className="rounded-lg bg-black px-3 text-[11px] font-bold text-yellow-400 disabled:opacity-50">
                    {checking ? "…" : appliedCode ? "Applied" : "Apply"}
                  </button>
                </div>
                {appliedCode && (
                  <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" /> {appliedCode} — {formatINR(couponDisc)} off
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2 border-t bg-gray-50 p-4 text-xs">
              {/* Invoice note — the itemised invoice is generated per pickup/delivery selection */}
              <div className="flex items-start gap-2 rounded-xl border border-yellow-200 bg-yellow-50 p-3">
                <ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
                <p className="text-[11px] font-semibold leading-relaxed text-gray-700">
                  You will get your itemised invoice as per your selection of <b>pickup</b> or <b>delivery</b> options.
                  Rates &amp; charges are applied automatically — no payment needed now.
                </p>
              </div>
              {/* OVERALL TOTAL — always visible in the cart */}
              <div className="rounded-xl border bg-white p-3">
                <div className="flex items-center justify-between text-gray-600">
                  <span>Item total · {totalPieces} pcs</span>
                  <span className="font-bold tabular-nums text-gray-900">{formatINR(t.itemTotal)}</span>
                </div>
                {t.slabDisc > 0 && (
                  <div className="mt-0.5 flex items-center justify-between text-emerald-700">
                    <span>Wholesale slab ({t.slabPct}%)</span>
                    <span className="font-bold tabular-nums">−{formatINR(t.slabDisc)}</span>
                  </div>
                )}
                <div className="mt-0.5 flex items-center justify-between text-gray-600">
                  <span>{fulfillment === "PICKUP" ? "Delivery (pickup — you collect)" : "Delivery"}</span>
                  <span className="font-bold tabular-nums text-gray-900">{fulfillment === "PICKUP" ? "₹0" : formatINR(t.deliveryFee)}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between border-t border-gray-200 pt-1.5">
                  <span className="text-sm font-black text-gray-900">Total</span>
                  <span className="text-base font-black tabular-nums text-gray-900">{formatINR(t.grandTotal)}</span>
                </div>
              </div>
              {/* SALESMAN — mandatory: every order flows through a field salesman */}
              {salespersons.length > 0 ? (
                <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-3">
                  <label htmlFor="cart-salesman" className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-gray-700">
                    <UserCheck className="h-3.5 w-3.5 text-yellow-600" /> Select Salesman <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="cart-salesman"
                    value={salesman}
                    onChange={(e) => setSalesman(e.target.value)}
                    className={`mt-1.5 h-9 w-full rounded-lg border bg-white px-2 text-xs font-semibold outline-none ${salesman ? "border-gray-200" : "border-red-300"}`}
                  >
                    <option value="">— Choose your salesman —</option>
                    {salespersons.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                  <p className="mt-1 text-[10px] font-semibold text-gray-500">Required to proceed — your order is placed through this salesman.</p>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-gray-200 p-2 text-center text-[10px] font-semibold text-gray-400">
                  Salesman selection opens once the sales team is configured.
                </p>
              )}
              {couponDisc > 0 && (
                <p className="flex items-center justify-center gap-1 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" /> {appliedCode} will apply {formatINR(couponDisc)} off on your invoice
                </p>
              )}
              <button
                onClick={() => {
                  if (salespersons.length > 0 && !salesman) {
                    toast.error("Please select a salesman to proceed to checkout");
                    return;
                  }
                  closeCart();
                  onCheckout(couponDisc > 0 ? appliedCode : "", couponDisc);
                }}
                className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold uppercase tracking-wide transition ${
                  salespersons.length > 0 && !salesman
                    ? "cursor-not-allowed bg-gray-400 text-white"
                    : "bg-black text-yellow-400 hover:bg-gray-800"
                }`}
              >
                Proceed to Checkout <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
