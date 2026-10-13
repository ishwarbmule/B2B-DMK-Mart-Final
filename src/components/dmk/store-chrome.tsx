"use client";

import { useState, type ReactNode } from "react";
import { SiteHeaderV2 } from "./site-header-v2";
import { SiteFooter } from "./site-footer";
import { CartDrawer } from "./cart-drawer";
import { CheckoutDialog } from "./checkout-dialog";

/** Shared storefront chrome: header + footer + cart/checkout overlays on every route. */
export function StoreChrome({ children }: { children: ReactNode }) {
  const [checkout, setCheckout] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponDisc, setCouponDisc] = useState(0);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <SiteHeaderV2 />
      <main className="flex-1">{children}</main>
      <div className="mt-auto">
        <SiteFooter />
      </div>
      <CartDrawer
        onCheckout={(code, disc) => {
          setCouponCode(code || "");
          setCouponDisc(disc || 0);
          setCheckout(true);
        }}
      />
      <CheckoutDialog open={checkout} onOpenChange={setCheckout} couponCode={couponCode} couponDisc={couponDisc} />
    </div>
  );
}
