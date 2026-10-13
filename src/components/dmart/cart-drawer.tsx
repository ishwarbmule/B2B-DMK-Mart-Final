"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Minus, Plus, Trash2, ShoppingBag, Truck, PartyPopper } from "lucide-react";
import { useCartStore, cartTotals, FREE_DELIVERY_THRESHOLD, formatINR } from "@/lib/store";
import type { DCategory, DProduct } from "@/lib/types";
import { Progress } from "@/components/ui/progress";
import { useHydrated } from "@/hooks/use-hydrated";

export function CartDrawer({
  categories,
  onBrowse,
  onCheckout,
}: {
  categories: DCategory[];
  onBrowse: (categoryId: string, products: DProduct[]) => void;
  onCheckout: () => void;
}) {
  const items = useCartStore((s) => s.items);
  const isOpen = useCartStore((s) => s.isOpen);
  const setOpen = useCartStore((s) => s.setOpen);
  const addItem = useCartStore((s) => s.addItem);
  const removeOne = useCartStore((s) => s.removeOne);
  const removeAll = useCartStore((s) => s.removeAll);
  const mounted = useHydrated();

  if (!mounted) return null;

  const t = cartTotals(items);
  const progress = Math.min(100, Math.round((t.itemTotal / FREE_DELIVERY_THRESHOLD) * 100));
  const remaining = FREE_DELIVERY_THRESHOLD - t.itemTotal;

  const quickBrowse = () => {
    const cat = categories[0];
    setOpen(false);
    if (cat) onBrowse(cat.id, []);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="bg-black text-white px-4 py-3 rounded-b-none">
          <SheetTitle className="text-white flex items-center gap-2 text-base">
            <ShoppingBag className="h-4 w-4" /> My Cart ({t.itemCount} {t.itemCount === 1 ? "item" : "items"})
          </SheetTitle>
          <SheetDescription className="text-white/70 text-xs sr-only">
            Review your cart and proceed to checkout
          </SheetDescription>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="text-6xl mb-4" aria-hidden>🛒</div>
            <h3 className="font-bold text-slate-700">Your cart is empty</h3>
            <p className="text-sm text-slate-400 mt-1 mb-5">
              Add fresh groceries and household essentials to get started.
            </p>
            <Button
              onClick={quickBrowse}
              className="bg-black hover:bg-[#2c2c2c] text-[#ffd400] font-bold"
            >
              Start Shopping
            </Button>
          </div>
        ) : (
          <>
            {/* Free delivery progress */}
            <div className="px-4 py-2.5 bg-yellow-50 border-b border-yellow-200">
              {remaining > 0 ? (
                <p className="text-xs text-black font-medium flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5" />
                  Add {formatINR(remaining)} more to get FREE delivery
                </p>
              ) : (
                <p className="text-xs text-green-700 font-semibold flex items-center gap-1.5">
                  <PartyPopper className="h-3.5 w-3.5" /> Yay! You&apos;ve unlocked FREE delivery
                </p>
              )}
              <Progress value={progress} className="h-1.5 mt-1.5 bg-yellow-200" />
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-4 py-3 divide-y divide-slate-100">
              {items.map((i) => (
                <div key={i.productId} className="py-3 flex gap-3">
                  <div
                    className="h-16 w-16 rounded-lg flex items-center justify-center text-3xl shrink-0"
                    style={{ background: `linear-gradient(135deg, ${i.bgFrom}, ${i.bgTo})` }}
                    aria-hidden
                  >
                    {i.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 line-clamp-1">{i.name}</p>
                    <p className="text-xs text-slate-400">{i.packSize}</p>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-sm font-bold text-slate-900">{formatINR(i.price * i.qty)}</span>
                      {i.mrp > i.price && (
                        <span className="text-[10px] text-slate-400 line-through">
                          {formatINR(i.mrp * i.qty)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end justify-between shrink-0">
                    <button
                      onClick={() => removeAll(i.productId)}
                      className="text-slate-300 hover:text-red-500 transition-colors p-0.5"
                      aria-label={`Remove ${i.name} from cart`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div className="inline-flex items-center border-2 border-black text-black rounded-lg overflow-hidden">
                      <button
                        onClick={() => removeOne(i.productId)}
                        className="px-2 py-1 hover:bg-yellow-50"
                        aria-label={`Decrease ${i.name} quantity`}
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="px-2 text-sm font-bold min-w-5 text-center">{i.qty}</span>
                      <button
                        onClick={() =>
                          addItem({
                            productId: i.productId,
                            name: i.name,
                            brand: i.brand,
                            packSize: i.packSize,
                            price: i.price,
                            mrp: i.mrp,
                            emoji: i.emoji,
                            bgFrom: i.bgFrom,
                            bgTo: i.bgTo,
                          })
                        }
                        className="px-2 py-1 hover:bg-yellow-50"
                        aria-label={`Increase ${i.name} quantity`}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Bill */}
            <div className="border-t border-slate-200 px-4 py-3 bg-slate-50 rounded-b-xl">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Bill Details</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Item total ({t.itemCount} items)</span>
                  <span>{formatINR(t.itemTotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Delivery fee</span>
                  <span className={t.deliveryFee === 0 ? "text-green-600 font-semibold" : ""}>
                    {t.deliveryFee === 0 ? "FREE" : formatINR(t.deliveryFee)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Handling charge</span>
                  <span>{formatINR(t.handlingFee)}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between font-bold text-slate-900">
                  <span>To pay</span>
                  <span>{formatINR(t.grandTotal)}</span>
                </div>
                {t.totalSavings > 0 && (
                  <p className="text-xs text-green-600 font-semibold pt-1">
                    🎉 Your total savings on this order: {formatINR(t.totalSavings)}
                  </p>
                )}
              </div>
              <Button
                onClick={() => {
                  setOpen(false);
                  onCheckout();
                }}
                className="w-full mt-3 bg-black hover:bg-[#2c2c2c] text-[#ffd400] font-bold h-11"
              >
                Proceed to Checkout
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
