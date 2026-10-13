"use client";

import Image from "next/image";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Minus, Plus, Trash2, Package, Truck, ArrowRight, TicketPercent, CheckCircle2 } from "lucide-react";
import { useCartStore, cartTotals, formatINR, FREE_DELIVERY_ABOVE, lineKey, unitPriceFor, piecesPerUnit, type UnitType } from "@/lib/store";
import { useHydrated } from "@/hooks/use-hydrated";
import { toast } from "sonner";

const UNIT_BADGE: Record<UnitType, { label: string; cls: string }> = {
  SINGLE: { label: "Piece", cls: "bg-gray-100 text-gray-700" },
  PACK: { label: "Pack", cls: "bg-yellow-100 text-yellow-800" },
  BULK: { label: "Bulk Case", cls: "bg-emerald-100 text-emerald-800" },
};

export function CartDrawer({ onCheckout }: { onCheckout: (couponCode: string, couponDisc: number) => void }) {
  const hydrated = useHydrated();
  const items = useCartStore((s) => s.items);
  const isOpen = useCartStore((s) => s.isOpen);
  const closeCart = useCartStore((s) => s.closeCart);
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);
  const [coupon, setCoupon] = useState("");
  const [couponDisc, setCouponDisc] = useState(0);
  const [appliedCode, setAppliedCode] = useState("");
  const [checking, setChecking] = useState(false);

  if (!hydrated) return null;
  const t = cartTotals(items);
  const progress = Math.min(100, Math.round((t.itemTotal / FREE_DELIVERY_ABOVE) * 100));
  const totalPieces = items.reduce((n, i) => n + piecesPerUnit(i) * i.qty, 0);

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
            <div className="flex items-center justify-between text-[10px] text-gray-300">
              <span className="flex items-center gap-1">
                <Truck className="h-3 w-3" />
                {t.deliveryFee === 0 ? "Free delivery unlocked!" : `Add ${formatINR(FREE_DELIVERY_ABOVE - t.itemTotal)} for free delivery`}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-800">
              <div className="h-full rounded-full bg-yellow-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <Package className="h-10 w-10 text-gray-300" />
            <p className="text-sm font-semibold text-gray-700">Your cart is empty</p>
            <p className="text-xs text-gray-400">Add pieces, packs or bulk cases to start your order.</p>
            <button onClick={closeCart} className="mt-2 rounded-lg bg-black px-4 py-2 text-xs font-bold text-yellow-400">
              Continue Shopping
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="space-y-2.5">
                {items.map((i) => {
                  const key = lineKey(i.id, i.unitType);
                  const up = unitPriceFor(i);
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
                          {piecesPerUnit(i)} pcs × {i.qty} {i.unitType === "SINGLE" ? "pc" : i.unitType === "PACK" ? "pack" : "case"} · {formatINR(up)}/{i.unitType === "SINGLE" ? "pc" : i.unitType === "PACK" ? "pack" : "case"}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <div className="flex items-center rounded-lg bg-yellow-400">
                            <button onClick={() => setQty(key, i.qty - 1)} aria-label="Decrease" className="flex h-6 w-6 items-center justify-center hover:bg-black/10"><Minus className="h-3 w-3" /></button>
                            <span className="w-9 text-center text-[11px] font-black">{i.qty}</span>
                            <button onClick={() => setQty(key, i.qty + 1)} aria-label="Increase" className="flex h-6 w-6 items-center justify-center hover:bg-black/10"><Plus className="h-3 w-3" /></button>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-gray-900">{formatINR(Math.round(up * i.qty * 100) / 100)}</p>
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
              <div className="flex justify-between text-gray-600"><span>Item total ({totalPieces} pcs)</span><span className="font-semibold">{formatINR(t.itemTotal)}</span></div>
              {t.slabPct > 0 && (
                <div className="flex justify-between text-emerald-600"><span>Slab discount ({t.slabTitle})</span><span className="font-semibold">− {formatINR(t.slabDisc)}</span></div>
              )}
              {couponDisc > 0 && (
                <div className="flex justify-between text-emerald-600"><span>Coupon ({appliedCode})</span><span className="font-semibold">− {formatINR(couponDisc)}</span></div>
              )}
              <div className="flex justify-between text-gray-600"><span>GST @ 18%</span><span className="font-semibold">{formatINR(t.gstAmount)}</span></div>
              <div className="flex justify-between text-gray-600"><span>Delivery</span><span className="font-semibold">{t.deliveryFee === 0 ? "FREE" : formatINR(t.deliveryFee)}</span></div>
              <div className="flex justify-between border-t pt-2 text-sm">
                <span className="font-bold">Total</span>
                <span className="font-black">{formatINR(Math.max(0, t.grandTotal - couponDisc))}</span>
              </div>
              {t.totalSavings > 0 && (
                <p className="rounded-lg bg-emerald-50 px-2 py-1.5 text-center text-[11px] font-semibold text-emerald-700">
                  You save {formatINR(t.totalSavings)} vs MRP on this order
                </p>
              )}
              <button
                onClick={() => { closeCart(); onCheckout(couponDisc > 0 ? appliedCode : "", couponDisc); }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-black py-3 text-sm font-bold uppercase tracking-wide text-yellow-400 hover:bg-gray-800"
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
