"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SiteHeaderV2 } from "./site-header-v2";
import { SiteFooter } from "./site-footer";
import { CartDrawer } from "./cart-drawer";
import { CheckoutDialog } from "./checkout-dialog";
import { WhatsAppFloat } from "./whatsapp-float";
import { useCustomerSession } from "@/lib/customer-client";

/** Shared storefront chrome: header + footer + cart/checkout overlays on every route. */
export function StoreChrome({ children }: { children: ReactNode }) {
  const [checkout, setCheckout] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponDisc, setCouponDisc] = useState(0);

  // ?next=checkout return flow — after logging in from the checkout gate, the account
  // page redirects back to this page with ?next=checkout; auto-reopen checkout once the
  // session is confirmed logged-in (guests just stay on the page, cart untouched).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("next") !== "checkout") return;
    params.delete("next");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    useCustomerSession.getState().load().then(() => {
      if (useCustomerSession.getState().customer) setCheckout(true);
    });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <SiteHeaderV2 />
      <main className="flex-1">{children}</main>
      <div className="mt-auto">
        <SiteFooter />
      </div>
      <WhatsAppFloat />
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
