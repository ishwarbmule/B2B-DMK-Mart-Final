"use client";

import { useState } from "react";
import { MapPin, Search, ShoppingCart, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DmkLogo } from "./logo";
import { useCartStore, cartTotals } from "@/lib/store";
import type { DCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/hooks/use-hydrated";

interface HeaderProps {
  categories: DCategory[];
  search: string;
  onSearch: (q: string) => void;
  onHome: () => void;
  onCategory: (categoryId: string) => void;
  activeCategoryId: string | null;
}

export function Header({
  categories,
  search,
  onSearch,
  onHome,
  onCategory,
  activeCategoryId,
}: HeaderProps) {
  const items = useCartStore((s) => s.items);
  const setOpen = useCartStore((s) => s.setOpen);
  const mounted = useHydrated();
  const [cityOpen, setCityOpen] = useState(false);
  const [city, setCity] = useState("Mumbai");

  const { itemCount, grandTotal } = cartTotals(items);
  const cities = ["Mumbai", "Pune", "Bengaluru", "Hyderabad", "Chennai", "Delhi NCR", "Kolkata", "Ahmedabad"];

  return (
    <header className="sticky top-0 z-40 shadow-md">
      {/* Top utility strip */}
      <div className="bg-black text-[#ffd400] text-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-7 flex items-center justify-between">
          <p className="truncate">Free delivery on orders above ₹500 · Wholesale tier pricing for B2B buyers</p>
          <p className="hidden sm:block shrink-0 ml-4 text-white/70">DMK Mart · Save More. Shop More.</p>
        </div>
      </div>

      {/* Main header */}
      <div className="bg-[#ffd400]">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-4">
          <button onClick={onHome} className="shrink-0 active:scale-95 transition-transform" aria-label="Go to DMK Mart home">
            <DmkLogo />
          </button>

          {/* Location selector */}
          <div className="relative hidden md:block shrink-0">
            <button
              onClick={() => setCityOpen((o) => !o)}
              className="flex items-center gap-1.5 text-black text-sm font-semibold bg-black/5 hover:bg-black/10 rounded-lg px-3 py-2 transition-colors"
              aria-haspopup="listbox"
              aria-expanded={cityOpen}
            >
              <MapPin className="h-4 w-4" />
              <span className="max-w-[110px] truncate">{city}</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", cityOpen && "rotate-180")} />
            </button>
            {cityOpen && (
              <div className="absolute top-full left-0 mt-1 w-44 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50" role="listbox">
                {cities.map((c) => (
                  <button
                    key={c}
                    role="option"
                    aria-selected={c === city}
                    onClick={() => {
                      setCity(c);
                      setCityOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm hover:bg-slate-100 transition-colors",
                      c === city && "text-black font-semibold bg-yellow-50"
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" aria-hidden />
            <Input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder='Search for "bucket", "mop", "planter"...'
              className="pl-9 pr-8 h-9 bg-white border-none rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus-visible:ring-black"
              aria-label="Search products"
            />
            {search && (
              <button
                onClick={() => onSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Cart button */}
          <Button
            onClick={() => setOpen(true)}
            className="relative bg-black hover:bg-[#1c1c1c] text-[#ffd400] font-bold h-9 px-3 sm:px-4 rounded-lg shadow-sm shrink-0"
            aria-label={`Open cart with ${itemCount} items`}
          >
            <ShoppingCart className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline text-sm">
              {mounted ? `₹${grandTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "Cart"}
            </span>
            {mounted && itemCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-[#ffd400] text-black text-[10px] font-extrabold rounded-full h-5 min-w-5 px-1 flex items-center justify-center border-2 border-black">
                {itemCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Category nav */}
      <nav className="bg-white border-b border-slate-200" aria-label="Product categories">
        <div className="max-w-7xl mx-auto px-2 sm:px-4">
          <div className="flex items-center gap-1 overflow-x-auto py-1.5 scrollbar-hide">
            <button
              onClick={onHome}
              className={cn(
                "shrink-0 text-xs sm:text-sm font-semibold rounded-full px-3 py-1.5 transition-colors whitespace-nowrap",
                !activeCategoryId
                  ? "bg-black text-[#ffd400]"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              Home
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => onCategory(c.id)}
                className={cn(
                  "shrink-0 text-xs sm:text-sm font-semibold rounded-full px-3 py-1.5 transition-colors whitespace-nowrap flex items-center gap-1.5",
                  activeCategoryId === c.id
                    ? "bg-black text-[#ffd400]"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <span aria-hidden>{c.emoji}</span>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </nav>
    </header>
  );
}
