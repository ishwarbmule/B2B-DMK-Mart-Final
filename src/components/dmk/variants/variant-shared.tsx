"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Palette, Search } from "lucide-react";
import { toast } from "sonner";
import { useCartStore, formatINR } from "@/lib/store";
import { discountPct, type DProduct } from "@/lib/types";
import { useHydrated } from "@/hooks/use-hydrated";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/* ------------------------------ cart hook ------------------------------ */

export function useVariantCart() {
  const hydrated = useHydrated();
  const addItem = useCartStore((s) => s.addItem);
  const items = useCartStore((s) => s.items);
  const count = hydrated ? items.reduce((s, i) => s + i.cases, 0) : 0;
  const add = useCallback(
    (p: DProduct) => {
      addItem(
        {
          id: p.id, sku: p.sku, name: p.name, company: p.company?.name ?? "",
          image: p.image, packSize: p.packSize, price: p.basePrice,
          mrp: p.mrp, gst: p.gst,
        },
        1
      );
      toast.success(`Added 1 case (${p.packSize} units) of ${p.name}`);
    },
    [addItem]
  );
  return { count, add, hydrated };
}

/* ----------------------------- countdown ------------------------------ */

export function useCountdown() {
  const [left, setLeft] = useState("--:--:--");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const diff = Math.max(0, end.getTime() - now.getTime());
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const sec = Math.floor((diff % 60_000) / 1000);
      setLeft(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
      );
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return left;
}

/* --------------------------- design switcher --------------------------- */

const DESIGNS = [
  { href: "/", label: "Original", desc: "DMK Commerce X — dark editorial" },
  { href: "/home-2", label: "Home-2", desc: "Everyday Essentials — bright retail" },
  { href: "/home/dmart", label: "DMart style", desc: "Value bazaar — clean & price-led" },
  { href: "/home/etsy", label: "Etsy style", desc: "Warm editorial marketplace" },
  { href: "/home/croma", label: "Croma style", desc: "Sleek tech retail — dark deals" },
  { href: "/home/vijaysales", label: "Vijay Sales style", desc: "Deal blitz — offers everywhere" },
];

export function DesignSwitcher({ current }: { current: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="w-64 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <p className="bg-black px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-yellow-400">
            Homepage Designs
          </p>
          {DESIGNS.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              onClick={() => setOpen(false)}
              className={`flex items-center justify-between gap-2 px-4 py-2.5 text-sm transition hover:bg-yellow-50 ${
                current === d.href ? "bg-yellow-100/80 font-bold" : ""
              }`}
            >
              <span className="leading-tight">
                {d.label}
                <span className="block text-[10px] font-normal text-gray-400">{d.desc}</span>
              </span>
              {current === d.href && <span className="h-2 w-2 shrink-0 rounded-full bg-yellow-400" />}
            </Link>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full bg-black px-4 py-2.5 text-xs font-bold text-yellow-400 shadow-xl transition hover:scale-105"
      >
        <Palette className="h-4 w-4" />
        {open ? "Close" : "Designs"}
      </button>
    </div>
  );
}

/* ---------------------------- search dialog ---------------------------- */

function MiniResult({ p, onAdd }: { p: DProduct; onAdd: (p: DProduct) => void }) {
  const disc = discountPct(p.mrp, p.basePrice);
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-white">
      <div className="relative aspect-square bg-gray-50">
        <img src={p.image} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
        {disc > 0 && (
          <span className="absolute left-1.5 top-1.5 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {disc}% OFF
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <p className="line-clamp-2 min-h-[28px] text-[11px] font-medium leading-tight">{p.name}</p>
        <div className="mt-auto flex items-baseline gap-1.5">
          <span className="text-sm font-bold">{formatINR(p.basePrice)}</span>
          {p.mrp > p.basePrice && <span className="text-[10px] text-gray-400 line-through">{formatINR(p.mrp)}</span>}
        </div>
        <button
          onClick={() => onAdd(p)}
          className="mt-1 rounded-md bg-black py-1.5 text-[11px] font-bold text-yellow-400 transition hover:bg-gray-800"
        >
          Add Case
        </button>
      </div>
    </div>
  );
}

export function VariantSearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<DProduct[] | null>(null);
  const [loading, setLoading] = useState(false);
  const { add } = useVariantCart();

  useEffect(() => {
    if (!open) {
      setQ("");
      setRows(null);
      setLoading(false);
    }
  }, [open]);

  const run = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/products?q=${encodeURIComponent(q.trim())}&limit=24`);
      const d = await res.json();
      setRows(d.products ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Search products</DialogTitle>
        </DialogHeader>
        <form onSubmit={run} className="flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Try bottle, bucket, planter…"
            autoFocus
          />
          <Button type="submit" disabled={loading} className="bg-black text-yellow-400 hover:bg-gray-800">
            <Search className="mr-1 h-4 w-4" /> {loading ? "…" : "Search"}
          </Button>
        </form>
        {rows === null && !loading && (
          <p className="py-10 text-center text-sm text-gray-400">
            Search 2,400+ wholesale SKUs — results appear here.
          </p>
        )}
        {rows !== null && rows.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-400">No products found for &ldquo;{q}&rdquo;.</p>
        )}
        {rows !== null && rows.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {rows.map((p) => (
              <MiniResult key={p.id} p={p} onAdd={add} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ footer note ---------------------------- */

export function DesignLinks({ dark }: { dark?: boolean }) {
  return (
    <p className={`text-[11px] ${dark ? "text-gray-500" : "text-gray-400"}`}>
      Try another look:{" "}
      {DESIGNS.map((d, i) => (
        <span key={d.href}>
          <Link href={d.href} className="underline decoration-dotted underline-offset-2 hover:opacity-70">
            {d.label}
          </Link>
          {i < DESIGNS.length - 1 ? " · " : ""}
        </span>
      ))}
    </p>
  );
}
