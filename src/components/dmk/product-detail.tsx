"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Flame, Minus, Package, Plus, ShoppingCart, Star, Store, TrendingUp, Truck, Zap } from "lucide-react";
import { toast } from "sonner";
import { useCartStore, formatINR, lineKey, unitPriceFor } from "@/lib/store";
import { useHydrated } from "@/hooks/use-hydrated";
import { discountPct, type DProduct } from "@/lib/types";
import { useCustomerSession } from "@/lib/customer-client";
import type { Fulfillment } from "@/lib/pricing";
import { toCartItem, ProductCard } from "./product-card";

export function ProductDetail({ p, related }: { p: DProduct; related: DProduct[] }) {
  const hydrated = useHydrated();
  const addItem = useCartStore((s) => s.addItem);
  const openCart = useCartStore((s) => s.openCart);
  const items = useCartStore((s) => s.items);
  const cartFulfillment = useCartStore((s) => s.fulfillment);
  const setCartFulfillment = useCartStore((s) => s.setFulfillment);
  // Task 15: session (slab pricing + nearest warehouse)
  useEffect(() => { useCustomerSession.getState().load(); }, []);
  const customer = useCustomerSession((s) => s.customer);
  const [qty, setQty] = useState(1);
  const [imgIdx, setImgIdx] = useState(0);
  // Fulfilment selection — the PICKUP / DELIVERY pricing cards are the selector:
  // tapping one reprices this page (buy box, cards, cart line) and the cart + checkout follow.
  const [mode, setMode] = useState<Fulfillment>("DELIVERY");
  useEffect(() => { if (hydrated) setMode(cartFulfillment); }, [cartFulfillment, hydrated]);
  const pickMode = (m: Fulfillment) => { setMode(m); setCartFulfillment(m); };

  const gallery: string[] = (() => {
    try {
      const g = JSON.parse((p as { gallery?: string }).gallery || "[]");
      return Array.isArray(g) && g.length ? g : [p.image];
    } catch {
      return [p.image];
    }
  })();

  const unitItem = toCartItem(p, "SINGLE");
  const up = unitPriceFor(unitItem, mode); // follows the selected pricing card
  const pickupRate = unitPriceFor(unitItem, "PICKUP");
  const deliveryRate = unitPriceFor(unitItem, "DELIVERY");
  const lineTotal = Math.round(up * qty * 100) / 100;
  const key = lineKey(p.id, "SINGLE");
  const inCart = hydrated ? items.find((i) => lineKey(i.id, i.unitType) === key)?.qty ?? 0 : 0;
  const disc = discountPct(p.mrp, p.dealerPrice);

  const specRows: [string, string][] = [
    ["Brand", p.brand?.name ?? "—"],
    ["Category", [p.top?.name, p.mid?.name, p.end?.name].filter(Boolean).join(" › ")],
    ["Unit", p.unit ?? "Pcs"],
    ["Barcode", p.barcode || "—"],
  ];

  const addNow = (redirectCart = false) => {
    addItem({ ...unitItem, qty }, qty);
    if (redirectCart) openCart();
    else toast.success(`Added ${qty} × piece — ${p.name}`);
  };

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-5 md:px-6">
      {/* breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
        <Link href="/" className="hover:text-yellow-600">Home</Link>
        <span>/</span>
        <Link href="/catalog" className="hover:text-yellow-600">Catalog</Link>
        {p.top && (<><span>/</span><Link href={`/catalog?top=${p.top.name}`} className="hover:text-yellow-600">{p.top.name}</Link></>)}
        <span>/</span>
        <span className="font-semibold text-gray-800">{p.name}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* gallery */}
        <div>
          <div className="relative aspect-square overflow-hidden rounded-2xl border bg-white">
            <Image src={gallery[imgIdx] || "/dmk-logo.png"} alt={p.name} fill priority sizes="(max-width:1024px) 100vw, 600px" className="object-cover" unoptimized />
            <div className="absolute left-3 top-3 flex flex-col gap-1">
              {disc > 0 && <span className="rounded-full bg-yellow-400 px-2.5 py-1 text-[11px] font-black text-black">{disc}% OFF</span>}
              {p.isDeal && <span className="flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-bold text-white"><Zap className="h-3 w-3" /> Deal of the Day</span>}
              {p.isHot && <span className="flex items-center gap-1 rounded-full bg-orange-500 px-2.5 py-1 text-[11px] font-bold text-white"><Flame className="h-3 w-3" /> Hot</span>}
              {p.isTop && <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white"><TrendingUp className="h-3 w-3" /> Top Selling</span>}
            </div>
          </div>
          {gallery.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {gallery.map((g, i) => (
                <button key={i} onClick={() => setImgIdx(i)} className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${i === imgIdx ? "border-yellow-400" : "border-gray-200"}`}>
                  <Image src={g} alt={`${p.name} view ${i + 1}`} fill sizes="64px" className="object-cover" unoptimized />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* buy panel */}
        <div>
          <Link href={p.brand?.slug ? `/brand/${p.brand.slug}` : "/brands"} className="text-xs font-bold uppercase tracking-wide text-yellow-600 hover:underline">
            {p.brand?.name}
          </Link>
          <h1 className="mt-1 text-2xl font-black leading-tight text-gray-900 md:text-3xl">{p.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            {!!p.rating && (
              <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 font-bold text-emerald-700">
                <Star className="h-3.5 w-3.5 fill-emerald-600 text-emerald-600" /> {p.rating.toFixed(1)} ({p.reviewCount ?? 0})
              </span>
            )}
            <span className="font-semibold text-emerald-600">Available to order</span>
          </div>

          {/* the two rates — TAP A CARD TO CHOOSE IT: the buy box below, the cart line and
              checkout all follow the selected card. Both cards share the same neutral style;
              only the selected one gets the yellow outline. Stacks vertically on phones,
              side-by-side from sm up; price rows are nowrap + tabular-nums so numbers never
              wrap mid-digit and both /pc markers sit on the same baseline. */}
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => pickMode("PICKUP")}
              aria-pressed={mode === "PICKUP"}
              className={`rounded-2xl border-2 p-3 text-left transition ${mode === "PICKUP" ? "border-yellow-400 bg-yellow-50/70" : "border-gray-200 bg-white hover:border-gray-300"}`}
            >
              <p className={`flex items-center gap-1 whitespace-nowrap text-[10px] font-black uppercase tracking-wide ${mode === "PICKUP" ? "text-yellow-700" : "text-gray-500"}`}><Store className="h-3.5 w-3.5 shrink-0" /> Pickup pricing</p>
              <p className="mt-0.5 flex items-baseline gap-1 whitespace-nowrap tabular-nums text-xl font-black text-gray-900">{formatINR(pickupRate)} <span className="text-[11px] font-semibold text-gray-500">/pc</span></p>
              <p className="mt-0.5 text-[10px] leading-snug text-gray-500">Pack rate — collect from your nearest warehouse</p>
            </button>
            <button
              type="button"
              onClick={() => pickMode("DELIVERY")}
              aria-pressed={mode === "DELIVERY"}
              className={`rounded-2xl border-2 p-3 text-left transition ${mode === "DELIVERY" ? "border-yellow-400 bg-yellow-50/70" : "border-gray-200 bg-white hover:border-gray-300"}`}
            >
              <p className={`flex items-center gap-1 whitespace-nowrap text-[10px] font-black uppercase tracking-wide ${mode === "DELIVERY" ? "text-yellow-700" : "text-gray-500"}`}><Truck className="h-3.5 w-3.5 shrink-0" /> Delivery pricing</p>
              <p className="mt-0.5 flex items-baseline gap-1 whitespace-nowrap tabular-nums text-xl font-black text-gray-900">{formatINR(deliveryRate)} <span className="text-[11px] font-semibold text-gray-500">/pc</span></p>
              <p className="mt-0.5 text-[10px] leading-snug text-gray-500">Single piece price — delivered to your address · flat ₹250</p>
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] font-semibold text-gray-400">Tap a card — the price below follows your choice (cart &amp; checkout too)</p>

          {/* price block */}
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4">
            <div>
              <p className="text-3xl font-black text-gray-900">{formatINR(up)}</p>
              <p className="text-[11px] text-gray-500">per piece · {mode === "PICKUP" ? "pickup rate" : "delivery rate"}</p>
              <p className="text-[10px] font-semibold text-emerald-700">
                {customer ? `Your ${customer.customerType.replace("_", "-").toLowerCase()} slab pricing` : "Wholesale (guest) pricing — login for your slab"}
              </p>
            </div>
            {p.mrp > up && (
              <div className="text-right">
                <p className="text-sm text-gray-400 line-through">{formatINR(p.mrp)}</p>
                <p className="text-[11px] font-bold text-emerald-600">Save {formatINR(p.mrp - up)}</p>
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center rounded-lg border">
                <button onClick={() => setQty((q2) => Math.max(1, q2 - 1))} aria-label="Decrease qty" className="flex h-9 w-9 items-center justify-center hover:bg-gray-50"><Minus className="h-4 w-4" /></button>
                <span className="w-10 text-center text-sm font-black">{qty}</span>
                <button onClick={() => setQty((q2) => q2 + 1)} aria-label="Increase qty" className="flex h-9 w-9 items-center justify-center hover:bg-gray-50"><Plus className="h-4 w-4" /></button>
              </div>
              <button onClick={() => addNow(false)} className="rounded-lg bg-black px-4 py-2.5 text-xs font-bold uppercase text-yellow-400 hover:bg-gray-800">
                <ShoppingCart className="mr-1 inline h-4 w-4" /> Add
              </button>
              <button onClick={() => addNow(true)} className="rounded-lg bg-yellow-400 px-4 py-2.5 text-xs font-black uppercase text-black hover:bg-yellow-300">
                Buy Now
              </button>
            </div>
            {inCart > 0 && <p className="w-full text-[11px] font-semibold text-emerald-600">{inCart} × pieces in cart · {formatINR(lineTotal)}</p>}
          </div>

          {/* trust */}
          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
            <span className="flex items-center gap-1.5 rounded-lg border bg-white p-2.5 text-gray-600"><Truck className="h-4 w-4 text-yellow-500" /> 48h dispatch</span>
            <span className="flex items-center gap-1.5 rounded-lg border bg-white p-2.5 text-gray-600"><BadgeCheck className="h-4 w-4 text-yellow-500" /> Itemised invoice</span>
            <span className="flex items-center gap-1.5 rounded-lg border bg-white p-2.5 text-gray-600"><Package className="h-4 w-4 text-yellow-500" /> OTP delivery</span>
          </div>

          {/* specifications — right column, directly below the buy box */}
          <div className="mt-3 overflow-hidden rounded-2xl border bg-white">
            <p className="border-b bg-gray-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-600">Specifications</p>
            <table className="w-full text-xs">
              <tbody>
                {specRows.map(([k, v], i) => (
                  <tr key={k} className={i % 2 ? "bg-gray-50/60" : ""}>
                    <td className="px-4 py-2 font-semibold text-gray-500">{k}</td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-900">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* related — SAME BRAND ONLY */}
      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-gray-900">More from {p.brand?.name}</h2>
            <p className="text-xs text-gray-500">Related products from the same brand only</p>
          </div>
          {p.brand?.slug && (
            <Link href={`/brand/${p.brand.slug}`} className="rounded-lg border px-3 py-2 text-xs font-bold text-gray-700 hover:border-yellow-400">
              Visit {p.brand.name} Store →
            </Link>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {related.map((r) => <ProductCard key={r.id} p={r} />)}
        </div>
        {related.length === 0 && (
          <div className="rounded-xl border border-dashed py-10 text-center text-sm text-gray-400">
            More products from this brand are being added.
          </div>
        )}
      </section>
    </div>
  );
}
