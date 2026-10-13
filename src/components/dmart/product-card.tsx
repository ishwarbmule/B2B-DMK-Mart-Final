"use client";

import { useState } from "react";
import { Heart, Plus, Minus, Star } from "lucide-react";
import { useCartStore } from "@/lib/store";
import { discountPct, type DProduct } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

export function ProductCard({
  product,
  onOpen,
  compact = false,
}: {
  product: DProduct;
  onOpen?: (p: DProduct) => void;
  compact?: boolean;
}) {
  const addItem = useCartStore((s) => s.addItem);
  const removeOne = useCartStore((s) => s.removeOne);
  const items = useCartStore((s) => s.items);
  const mounted = useHydrated();
  const [wished, setWished] = useState(false);
  const { toast } = useToast();

  const qty = mounted ? items.find((i) => i.productId === product.id)?.qty ?? 0 : 0;
  const pct = discountPct(product);
  const outOfStock = product.stock <= 0;
  const lowStock = !outOfStock && product.stock <= product.lowStockThreshold;

  const handleAdd = () => {
    addItem({
      productId: product.id,
      name: product.name,
      brand: product.brand,
      packSize: product.packSize,
      price: product.price,
      mrp: product.mrp,
      emoji: product.emoji,
      bgFrom: product.bgFrom,
      bgTo: product.bgTo,
    });
    toast({
      title: "Added to cart 🛒",
      description: `${product.name} (${product.packSize})`,
    });
  };

  return (
    <div
      className={cn(
        "group relative bg-white rounded-xl border border-slate-200 hover:border-black/40 hover:shadow-lg transition-all duration-200 flex flex-col overflow-hidden",
        outOfStock && "opacity-60",
        compact ? "w-44 sm:w-48 shrink-0" : "w-full"
      )}
    >
      {/* Discount badge */}
      {pct > 0 && (
        <span className="absolute top-2 left-2 z-10 bg-black text-[#ffd400] text-[10px] font-bold px-1.5 py-0.5 rounded">
          {pct}% OFF
        </span>
      )}

      {/* Wishlist */}
      <button
        onClick={() => setWished((w) => !w)}
        className="absolute top-2 right-2 z-10 p-1 rounded-full bg-white/80 hover:bg-white shadow-sm transition-colors"
        aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
        aria-pressed={wished}
      >
        <Heart
          className={cn("h-4 w-4 transition-colors", wished ? "fill-red-500 text-red-500" : "text-slate-400")}
        />
      </button>

      {/* Image area */}
      <button
        onClick={() => onOpen?.(product)}
        className={cn(
          "relative w-full flex items-center justify-center cursor-pointer overflow-hidden",
          compact ? "h-32" : "h-36 sm:h-40"
        )}
        style={{ background: `linear-gradient(135deg, ${product.bgFrom} 0%, ${product.bgTo} 100%)` }}
        aria-label={`View ${product.name} details`}
      >
        <span
          className={cn(
            "select-none drop-shadow-md transition-transform duration-300 group-hover:scale-110",
            compact ? "text-5xl" : "text-6xl"
          )}
          role="img"
          aria-hidden
        >
          {product.emoji}
        </span>
        {product.isDeal && (
          <span className="absolute bottom-2 left-2 bg-[#ffd400] text-black text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded">
            Deal
          </span>
        )}
        {outOfStock && (
          <span className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-[10px] font-bold text-center py-1 uppercase tracking-wide">
            Out of stock
          </span>
        )}
      </button>

      {/* Info */}
      <div className="p-2.5 sm:p-3 flex flex-col flex-1">
        <p className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wide leading-none">
          {product.brand}
        </p>
        <button
          onClick={() => onOpen?.(product)}
          className="text-left text-xs sm:text-sm font-medium text-slate-800 mt-1 line-clamp-2 leading-snug hover:text-black transition-colors"
        >
          {product.name}
        </button>
        <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">{product.packSize}</p>

        <div className="flex items-center gap-1 mt-1.5">
          <span className="inline-flex items-center gap-0.5 bg-green-50 text-green-700 text-[10px] font-bold px-1 py-0.5 rounded">
            <Star className="h-2.5 w-2.5 fill-green-700" /> {product.rating.toFixed(1)}
          </span>
          {lowStock && (
            <span className="text-[10px] font-bold text-orange-600">Only {product.stock} left</span>
          )}
        </div>

        <div className="flex items-end justify-between mt-2 gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-sm sm:text-base font-bold text-slate-900">₹{product.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
              {product.mrp > product.price && (
                <span className="text-[10px] sm:text-xs text-slate-400 line-through">₹{product.mrp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
              )}
            </div>
            {pct > 0 && (
              <p className="text-[10px] text-green-600 font-semibold">
                Save ₹{(product.mrp - product.price).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </p>
            )}
          </div>

          {/* Add / Stepper */}
          {outOfStock ? (
            <span className="shrink-0 text-[10px] font-bold text-slate-400 uppercase px-2">N/A</span>
          ) : qty === 0 ? (
            <button
              onClick={handleAdd}
              className="shrink-0 inline-flex items-center gap-0.5 border-2 border-black text-black hover:bg-black hover:text-[#ffd400] font-bold text-xs sm:text-sm rounded-lg px-3 py-1.5 transition-colors active:scale-95"
              aria-label={`Add ${product.name} to cart`}
            >
              <Plus className="h-3.5 w-3.5" /> ADD
            </button>
          ) : (
            <div className="shrink-0 inline-flex items-center bg-black text-[#ffd400] font-bold rounded-lg overflow-hidden">
              <button
                onClick={() => removeOne(product.id)}
                className="px-2 py-1.5 hover:bg-[#2c2c2c] transition-colors"
                aria-label={`Decrease quantity of ${product.name}`}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="px-2 text-xs sm:text-sm min-w-6 text-center" aria-live="polite">
                {qty}
              </span>
              <button
                onClick={handleAdd}
                className="px-2 py-1.5 hover:bg-[#2c2c2c] transition-colors"
                aria-label={`Increase quantity of ${product.name}`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
