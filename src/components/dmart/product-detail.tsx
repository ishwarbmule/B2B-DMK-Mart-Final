"use client";

import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Star, ShieldCheck, Truck, RotateCcw, Layers } from "lucide-react";
import { useCartStore } from "@/lib/store";
import { discountPct, type DProduct } from "@/lib/types";
import { Minus, Plus } from "lucide-react";
import { useHydrated } from "@/hooks/use-hydrated";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const TIER_LABELS: { key: keyof DProduct; label: string; note: string }[] = [
  { key: "tier1", label: "Tier 1 · Distributor", note: "Min. bulk order" },
  { key: "tier2", label: "Tier 2 · Wholesale", note: "Wholesale dealers" },
  { key: "tier3", label: "Tier 3 · Semi-Wholesale", note: "Sub-dealers" },
  { key: "tier4", label: "Tier 4 · Retailer", note: "Storefront price" },
  { key: "mrp", label: "Tier 5 · MRP", note: "Max retail price" },
];

function fmt(n: number) {
  return n > 0
    ? "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
    : "—";
}

export function ProductDetail({
  product,
  open,
  onOpenChange,
}: {
  product: DProduct | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const addItem = useCartStore((s) => s.addItem);
  const removeOne = useCartStore((s) => s.removeOne);
  const items = useCartStore((s) => s.items);
  const mounted = useHydrated();
  const { toast } = useToast();
  if (!product) return null;

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
    toast({ title: "Added to cart 🛒", description: `${product.name} (${product.packSize})` });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden max-h-[92vh] overflow-y-auto">
        <div
          className="h-44 flex items-center justify-center relative"
          style={{ background: `linear-gradient(135deg, ${product.bgFrom} 0%, ${product.bgTo} 100%)` }}
        >
          <span className="text-8xl select-none drop-shadow-lg" role="img" aria-hidden>
            {product.emoji}
          </span>
          {pct > 0 && (
            <span className="absolute top-3 left-3 bg-black text-[#ffd400] text-xs font-bold px-2 py-1 rounded">
              {pct}% OFF
            </span>
          )}
          {outOfStock && (
            <span className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-xs font-bold text-center py-1.5 uppercase tracking-wide">
              Out of stock
            </span>
          )}
        </div>
        <div className="p-5 pt-4">
          <DialogTitle className="text-base text-slate-400 font-semibold">
            {product.brand} {product.company && product.company !== product.brand ? `· ${product.company}` : ""}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {product.name} details, price {product.price} rupees, discount {pct} percent
          </DialogDescription>
          <h3 className="text-lg font-bold text-slate-900 mt-0.5">{product.name}</h3>
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
            <span>{product.packSize}</span>
            <span>·</span>
            <span>SKU: <span className="font-mono">{product.sku}</span></span>
            <span>·</span>
            <span>In {product.category.name}</span>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-bold px-1.5 py-0.5 rounded">
              <Star className="h-3 w-3 fill-green-700" /> {product.rating.toFixed(1)}
            </span>
            {lowStock && (
              <span className="text-xs font-bold text-orange-600">Only {product.stock} left in stock</span>
            )}
          </div>

          <div className="flex items-end justify-between mt-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-slate-900">₹{product.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                {product.mrp > product.price && (
                  <>
                    <span className="text-sm text-slate-400 line-through">₹{product.mrp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                    <span className="text-xs font-bold text-green-600">Save ₹{(product.mrp - product.price).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                  </>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Inclusive of all taxes
              </p>
            </div>

            {outOfStock ? (
              <span className="text-xs font-bold text-slate-400 uppercase">Unavailable</span>
            ) : qty === 0 ? (
              <button
                onClick={handleAdd}
                className="inline-flex items-center gap-1 bg-black hover:bg-[#2c2c2c] text-[#ffd400] font-bold text-sm rounded-lg px-5 py-2.5 transition-colors active:scale-95"
              >
                <Plus className="h-4 w-4" /> Add to Cart
              </button>
            ) : (
              <div className="inline-flex items-center bg-black text-[#ffd400] font-bold rounded-lg overflow-hidden">
                <button
                  onClick={() => removeOne(product.id)}
                  className="px-3 py-2.5 hover:bg-[#2c2c2c]"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="px-3 min-w-8 text-center">{qty}</span>
                <button
                  onClick={handleAdd}
                  className="px-3 py-2.5 hover:bg-[#2c2c2c]"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* B2B tier pricing */}
          {(product.tier1 > 0 || product.tier2 > 0 || product.tier3 > 0) && (
            <div className="mt-5 border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-black text-[#ffd400] px-3 py-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
                <Layers className="h-3.5 w-3.5" /> B2B Tier Pricing (per piece)
              </div>
              <div className="divide-y divide-slate-100">
                {TIER_LABELS.map((t) => {
                  const val = product[t.key] as number;
                  const isStore = t.key === "tier4";
                  if (val <= 0 && !isStore) return null;
                  return (
                    <div
                      key={t.label}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 text-sm",
                        isStore && "bg-yellow-50"
                      )}
                    >
                      <div>
                        <p className="font-semibold text-slate-700">{t.label}</p>
                        <p className="text-[10px] text-slate-400">{t.note}</p>
                      </div>
                      <span className={cn("font-bold", isStore ? "text-black" : "text-slate-600")}>
                        {fmt(isStore ? product.price : val)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mt-5 border-t border-slate-100 pt-4">
            {[
              { icon: Truck, label: "Express delivery" },
              { icon: ShieldCheck, label: "Quality assured" },
              { icon: RotateCcw, label: "Easy returns" },
            ].map((f) => (
              <div key={f.label} className="flex flex-col items-center gap-1 text-center">
                <f.icon className="h-5 w-5 text-black" />
                <span className="text-[10px] font-medium text-slate-500">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
