"use client";

import { useState } from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Package, Minus, Plus, ShoppingCart, Building2, Barcode } from "lucide-react";
import { toast } from "sonner";
import { useCartStore, formatINR } from "@/lib/store";
import { discountPct, type DProduct } from "@/lib/types";

export function ProductDialog({ p, onClose }: { p: DProduct | null; onClose: () => void }) {
  const [cases, setCases] = useState(1);
  const addItem = useCartStore((s) => s.addItem);
  if (!p) return null;

  const disc = discountPct(p.mrp, p.basePrice);
  const casePrice = Math.round(p.basePrice * p.packSize * 100) / 100;
  const units = cases * p.packSize;
  const lineTotal = Math.round(units * p.basePrice * 100) / 100;
  const out = p.stock <= 0;

  // tier table: dealer rate vs base rate vs MRP per unit + case
  const tiers = [
    ["Dealer Rate (Tier 1)", p.dealerPrice, p.dealerPrice * p.packSize],
    ["Base Rate (Retailer)", p.basePrice, p.basePrice * p.packSize],
    ["MRP", p.mrp, p.mrp * p.packSize],
  ] as const;

  return (
    <Dialog open={!!p} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0">
        <div className="grid gap-0 md:grid-cols-2">
          <div className="relative aspect-square bg-gray-50">
            <Image src={p.image || "/products/002.svg"} alt={p.name} fill sizes="480px" className="object-cover" unoptimized />
            {disc > 0 && (
              <span className="absolute left-3 top-3 rounded-full bg-yellow-400 px-3 py-1 text-xs font-black text-black">
                {disc}% OFF MRP
              </span>
            )}
          </div>
          <div className="flex flex-col gap-3 p-5">
            <DialogTitle asChild>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-yellow-600">{p.company?.name}</p>
                <h3 className="text-lg font-black leading-tight text-gray-900">{p.name}</h3>
              </div>
            </DialogTitle>
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-600">{p.top?.name}</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">{p.mid?.name}</span>
              <span className="rounded-full bg-yellow-50 px-2 py-0.5 font-semibold text-yellow-700">{p.end?.name}</span>
            </div>

            <div className="rounded-xl border bg-yellow-50/60 p-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-gray-900">{formatINR(p.basePrice)}</span>
                <span className="text-xs text-gray-500">/ unit</span>
                {p.mrp > p.basePrice && <span className="text-sm text-gray-400 line-through">{formatINR(p.mrp)}</span>}
              </div>
              <p className="mt-0.5 text-xs font-bold text-gray-700">Case of {p.packSize}: {formatINR(casePrice)}</p>
              <p className="text-[11px] text-gray-500">Final price · itemised invoice provided</p>
            </div>

            <div className="overflow-hidden rounded-xl border text-[11px]">
              <div className="grid grid-cols-3 bg-gray-50 px-3 py-1.5 font-bold text-gray-500">
                <span className="col-span-1">Pricing tier</span>
                <span className="text-right">/ unit</span>
                <span className="text-right">/ case</span>
              </div>
              {tiers.map(([label, unit, caseP]) => (
                <div key={label} className="grid grid-cols-3 border-t border-gray-100 px-3 py-1.5">
                  <span className="font-medium text-gray-700">{label}</span>
                  <span className="text-right">{formatINR(Math.round(unit * 100) / 100)}</span>
                  <span className="text-right font-semibold">{formatINR(Math.round(caseP * 100) / 100)}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
              <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" /> {p.packSize} units/case</span>
              <span className="flex items-center gap-1"><Barcode className="h-3.5 w-3.5" /> {p.sku}</span>
              <span className={out ? "font-bold text-red-500" : p.stock <= 10 ? "font-bold text-orange-500" : "font-semibold text-emerald-600"}>
                {out ? "Out of stock" : `${p.stock} units in stock`}
              </span>
            </div>

            <div className="mt-auto space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center rounded-lg border">
                  <button onClick={() => setCases((c) => Math.max(1, c - 1))} aria-label="Decrease cases" className="flex h-10 w-10 items-center justify-center hover:bg-gray-50"><Minus className="h-4 w-4" /></button>
                  <span className="w-16 text-center text-sm font-bold">{cases} case{cases > 1 ? "s" : ""}</span>
                  <button onClick={() => setCases((c) => c + 1)} aria-label="Increase cases" className="flex h-10 w-10 items-center justify-center hover:bg-gray-50"><Plus className="h-4 w-4" /></button>
                </div>
                <div className="text-xs">
                  <p className="font-bold text-gray-900">{units} units</p>
                  <p className="font-bold text-yellow-700">{formatINR(lineTotal)}</p>
                </div>
              </div>
              <button
                disabled={out}
                onClick={() => {
                  addItem(
                    {
                      id: p.id, sku: p.sku, name: p.name, company: p.company?.name ?? "",
                      image: p.image, packSize: p.packSize, price: p.basePrice, mrp: p.mrp, gst: p.gst,
                    },
                    cases
                  );
                  toast.success(`Added ${cases} case(s) — ${units} units of ${p.name}`);
                  onClose();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-black py-3 text-sm font-bold uppercase tracking-wide text-yellow-400 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                <ShoppingCart className="h-4 w-4" /> Add {cases} Case{cases > 1 ? "s" : ""} to Cart
              </button>
              <p className="flex items-center gap-1 text-[10px] text-gray-400">
                <Building2 className="h-3 w-3" /> Supplied by {p.company?.name} · dispatched from Manjri warehouse
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
