import type { Metadata } from "next";
import { StoreChrome } from "@/components/dmk/store-chrome";
import { Home2View } from "@/components/dmk/home2-view";

export const metadata: Metadata = {
  title: "DMK Mart — Everyday Essentials for a Better Tomorrow | Wholesale B2B",
  description:
    "Shop everyday essentials at wholesale dealer rates — plastic household, kitchenware, furniture, planters and more from 39+ trusted brands. Wide product range, trusted quality, built for businesses.",
};

export default function Home2Page() {
  return (
    <StoreChrome>
      <Home2View />
    </StoreChrome>
  );
}
