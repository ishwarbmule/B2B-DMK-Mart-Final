import { Suspense } from "react";
import type { Metadata } from "next";
import { StoreChrome } from "@/components/dmk/store-chrome";
import { CatalogClient } from "@/components/dmk/catalog-client";

export const metadata: Metadata = {
  title: "Wholesale Catalog — 2,200+ SKUs from 39 Brands | DMK Mart B2B",
  description:
    "Browse the full DMK Mart wholesale catalog — plastic household, kitchenware, furniture, planters and appliances. Filter by brand, department and price. Pieces, packs & bulk cases.",
  keywords: ["wholesale catalog", "plastic household bulk", "b2b kitchenware", "dmk mart catalog"],
};

export default function CatalogPage() {
  return (
    <StoreChrome>
      <Suspense fallback={<div className="mx-auto max-w-[1400px] p-6 text-sm text-gray-400">Loading catalog…</div>}>
        <CatalogClient />
      </Suspense>
    </StoreChrome>
  );
}
