"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, Package, Flame, TrendingUp, Star, Zap, Minus, Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { useCartStore, formatINR, type CartItem, type UnitType, unitPriceFor, piecesPerUnit, lineKey } from "@/lib/store";
import { discountPct, type DProduct } from "@/lib/types";
import { useHydrated } from "@/hooks/use-hydrated";

export function toCartItem(p: DProduct, unitType: UnitType = "SINGLE"): CartItem {
  return {
    id: p.id, sku: p.sku, name: p.name, brand: p.brand?.name ?? "", image: p.image,
    slug: p.slug ?? "", packQty: p.packQty ?? 1, piecesPerBox: p.piecesPerBox ?? 0,
    price: p.dealPrice && p.dealPrice > 0 && p.isDeal ? p.dealPrice : p.dealerPrice,
    mrp: p.mrp, gst: p.gst, unitType, qty: 1,
  };
}

const UNIT_LABEL: Record<UnitType, string> = { SINGLE: "Pc", PACK: "Pack", BULK: "Case" };

export function ProductCard({ p }: { p: DProduct }) {
  const hydrated = useHydrated();
  const addItem = useCartStore((s) => s.addItem);
  const items = useCartStore((s) => s.items);
  const setQty = useCartStore((s) => s.setQty);
  const [wish, setWish] = useState(false);
  const unitType: UnitType = "SINGLE";
  const key = lineKey(p.id, unitType);
  const inCart = hydrated ? items.find((i) => lineKey(i.id, i.unitType) === key)?.qty ?? 0 : 0;
  const disc = discountPct(p.mrp, p.dealerPrice);
  const href = p.slug ? `/product/${p.slug}` : "#";

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-xl border bg-white transition hover:shadow-lg hover:shadow-black/5">
      <div className="absolute left-0 top-2 z-10 flex flex-col gap-1">
        {disc > 0 && (
          <span className="rounded-r-full bg-yellow-400 px-2 py-0.5 text-[11px] font-bold text-black">{disc}% OFF</span>
        )}
        {p.isDeal && (
          <span className="flex items-center gap-0.5 rounded-r-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
            <Zap className="h-3 w-3" /> Deal
          </span>
        )}
        {p.isHot && (
          <span className="flex items-center gap-0.5 rounded-r-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
            <Flame className="h-3 w-3" /> Hot
          </span>
        )}
        {p.isTop && (
          <span className="flex items-center gap-0.5 rounded-r-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
            <TrendingUp className="h-3 w-3" /> Top
          </span>
        )}
      </div>
      <button
        onClick={() => setWish((w) => !w)}
        aria-label="Add to wishlist"
        className="absolute right-2 top-2 z-10 rounded-full bg-white/90 p-1.5 shadow-sm transition hover:scale-110"
      >
        <Heart className={`h-4 w-4 ${wish ? "fill-red-500 text-red-500" : "text-gray-400"}`} />
      </button>

      <Link href={href} className="relative block aspect-square w-full overflow-hidden bg-gray-50">
        <Image
          src={p.image || "/dmk-logo.png"}
          alt={p.name}
          fill
          sizes="(max-width: 640px) 50vw, 240px"
          className="object-cover transition duration-300 group-hover:scale-105"
          unoptimized
        />
      </Link>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <Link href={p.brand?.slug ? `/brand/${p.brand.slug}` : "/brands"} className="w-fit">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-yellow-600 hover:underline">
            {p.brand?.name}
          </p>
        </Link>
        <Link href={href} className="line-clamp-2 min-h-[36px] text-sm font-medium leading-tight text-gray-900 hover:text-yellow-700">
          {p.name}
        </Link>
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          <Package className="h-3 w-3" />
          <span>Pack of {p.packQty}</span>
          {!!p.rating && (
            <span className="flex items-center gap-0.5 text-emerald-700">
              <Star className="h-3 w-3 fill-emerald-600 text-emerald-600" /> {p.rating?.toFixed(1)}
            </span>
          )}
        </div>
        <div className="mt-auto pt-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-bold text-gray-900">{formatINR(p.dealerPrice)}</span>
            <span className="text-[11px] text-gray-400">/pc</span>
            {p.mrp > p.dealerPrice && <span className="text-[11px] text-gray-400 line-through">{formatINR(p.mrp)}</span>}
          </div>
          <p className="text-[11px] text-gray-500">
            Pack {formatINR(Math.round(p.dealerPrice * (p.packQty || 1) * 0.94 * 100) / 100)} · Case{" "}
            {formatINR(Math.round(p.dealerPrice * Math.max(p.piecesPerBox || 0, (p.packQty || 1) * 4, 1) * 0.88 * 100) / 100)}
          </p>
          {hydrated && inCart > 0 ? (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-yellow-400 px-1 py-1">
              <button
                onClick={() => setQty(key, inCart - 1)}
                aria-label="Decrease"
                className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-black/10"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs font-bold">{inCart} pc</span>
              <button
                onClick={() => setQty(key, inCart + 1)}
                aria-label="Increase"
                className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-black/10"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                addItem(toCartItem(p, unitType), 1);
                toast.success(`Added ${p.name} (1 pc)`);
              }}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-black py-2 text-xs font-bold uppercase tracking-wide text-yellow-400 transition hover:bg-gray-800"
            >
              <ShoppingCart className="h-3.5 w-3.5" /> Add Piece
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** compact row card used in horizontal rails */
export function ProductCardMini({ p }: { p: DProduct }) {
  const addItem = useCartStore((s) => s.addItem);
  const disc = discountPct(p.mrp, p.dealerPrice);
  return (
    <div className="flex w-[240px] shrink-0 flex-col overflow-hidden rounded-xl border bg-white transition hover:shadow-md">
      <Link href={p.slug ? `/product/${p.slug}` : "#"} className="relative block aspect-[4/3] overflow-hidden bg-gray-50">
        <Image src={p.image || "/dmk-logo.png"} alt={p.name} fill sizes="240px" className="object-cover" unoptimized />
        {disc > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
            {disc}% OFF
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-yellow-600">{p.brand?.name}</p>
        <Link href={p.slug ? `/product/${p.slug}` : "#"} className="line-clamp-2 text-xs font-medium leading-tight hover:text-yellow-700">
          {p.name}
        </Link>
        <div className="mt-auto flex items-center justify-between pt-1.5">
          <div>
            <span className="text-sm font-bold">{formatINR(p.dealerPrice)}</span>
            {p.mrp > p.dealerPrice && <span className="ml-1 text-[10px] text-gray-400 line-through">{formatINR(p.mrp)}</span>}
          </div>
          <button
            onClick={() => {
              addItem(toCartItem(p, "SINGLE"), 1);
              toast.success(`Added ${p.name}`);
            }}
            aria-label={`Add ${p.name}`}
            className="rounded-md bg-black px-2 py-1 text-[10px] font-bold uppercase text-yellow-400"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

export { UNIT_LABEL, unitPriceFor, piecesPerUnit };
