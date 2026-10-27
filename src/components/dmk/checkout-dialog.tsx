"use client";

/**
 * Checkout dialog with the fulfillment popup:
 *   gate → login/create-account required to place an order (guest cart stays free)
 *   mode → "How would you like your order?" PICKUP (pack rate at the warehouse) vs
 *          DELIVERY (single-piece pricing) + nearest-warehouse picker for pickup
 *   address → delivery address form (delivery only)
 *   pay  → PICKUP: order details + confirm order ONLY (no payment options, no dispatch preference)
 *          DELIVERY: payment + dispatch preference + final totals
 *   No GST anywhere — DMK Mart does not charge or provide GST.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BadgeCheck, CheckCircle2, KeyRound, MapPin, MessageCircle, Store, Truck } from "lucide-react";
import { toast } from "sonner";
import { useCartStore, cartTotals, formatINR, unitPriceFor, FREE_DELIVERY_ABOVE } from "@/lib/store";
import { useHydrated } from "@/hooks/use-hydrated";
import { getCustomerToken } from "@/lib/customer-session";
import { useCustomerSession, type SessionWarehouse } from "@/lib/customer-client";
import type { Fulfillment } from "@/lib/pricing";

const SLOTS = ["Standard dispatch (48h)", "Express 2-day", "Weekly scheduled"];
const PAYMENTS = [
  ["UPI", "UPI / QR", "GPay, PhonePe, Paytm"],
  ["CARD", "Card", "Credit / Debit / RuPay"],
  ["COD", "Cash on Delivery", "Pay when your order arrives"],
  ["CREDIT", "B2B Credit", "7-day credit for approved stores"],
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  couponCode?: string;
  couponDisc?: number;
}

type Step = "gate" | "mode" | "address" | "pay" | "done";

export function CheckoutDialog({ open, onOpenChange, couponCode = "", couponDisc = 0 }: Props) {
  const hydrated = useHydrated();
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);
  const customer = useCustomerSession((s) => s.customer);
  const warehouses = useCustomerSession((s) => s.warehouses); // nearest-first for this buyer
  const sessionLoaded = useCustomerSession((s) => s.loaded);

  useEffect(() => { if (open) useCustomerSession.getState().load(); }, [open]);

  const [step, setStep] = useState<Step>("mode");
  const [fulfillment, setFulfillment] = useState<Fulfillment>("DELIVERY");
  const [pickupWh, setPickupWh] = useState("");
  const [placing, setPlacing] = useState(false);
  const [result, setResult] = useState<{ invoiceNo: string; grandTotal: number; otp: string; phone: string } | null>(null);
  const [form, setForm] = useState({
    customerName: "", phone: "", email: "", addressLine: "", city: "", pincode: "",
    slot: SLOTS[0], paymentMethod: "UPI", note: "",
  });
  const [waOptIn, setWaOptIn] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // reset the flow each time the dialog opens
  useEffect(() => {
    if (!open) return;
    setStep(sessionLoaded && !customer ? "gate" : "mode");
    setResult(null);
    const c = useCustomerSession.getState().customer;
    if (c) {
      setForm((f) => ({
        ...f,
        customerName: f.customerName || c.shopName || c.name,
        phone: f.phone || c.phone,
        email: f.email || c.email,
        addressLine: f.addressLine || c.city ? f.addressLine : "",
        city: f.city || c.city,
        pincode: f.pincode || c.pincode,
      }));
    }
  }, [open, sessionLoaded, customer]);

  // totals under the chosen fulfillment mode (pickup = pack rates · delivery = single-piece prices)
  const t = useMemo(() => cartTotals(items, fulfillment), [items, fulfillment]);
  const chosenWh = warehouses.find((w) => w.id === pickupWh) ?? warehouses[0] ?? null;

  const validateAddress = () => {
    const e: Record<string, string> = {};
    if (form.customerName.trim().length < 2) e.customerName = "Enter full name";
    if (!/^[6-9]\d{9}$/.test(form.phone)) e.phone = "Enter valid 10-digit mobile";
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = "Invalid email";
    if (fulfillment === "DELIVERY") {
      if (form.addressLine.trim().length < 6) e.addressLine = "Enter complete address";
      if (form.city.trim().length < 2) e.city = "Enter city";
      if (!/^\d{6}$/.test(form.pincode)) e.pincode = "6-digit pincode";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const place = async () => {
    if (fulfillment === "PICKUP" && !pickupWh) {
      toast.error("Choose the warehouse you will pick up from");
      return;
    }
    setPlacing(true);
    try {
      const token = getCustomerToken();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { "x-customer-token": token } : {}) },
        body: JSON.stringify({
          ...form,
          fulfillment,
          pickupWarehouseId: fulfillment === "PICKUP" ? pickupWh : "",
          waOptIn,
          couponCode,
          items: items.map((i) => ({ id: i.id, unitType: i.unitType, qty: i.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to place order");
        return;
      }
      setResult({ invoiceNo: data.invoiceNo, grandTotal: data.bill?.grandTotal ?? 0, otp: data.otp, phone: form.phone });
      clearCart();
      setStep("done");
    } finally {
      setPlacing(false);
    }
  };

  const field = (key: keyof typeof form, label: string, placeholder: string, type = "text") => (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-gray-600">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className={`h-10 w-full rounded-lg border px-3 text-sm outline-none focus:border-yellow-400 ${errors[key] ? "border-red-400" : "border-gray-200"}`}
      />
      {errors[key] && <p className="mt-0.5 text-[10px] text-red-500">{errors[key]}</p>}
    </div>
  );

  const grand = Math.max(0, t.grandTotal - couponDisc);

  /* Order details block — line items + totals (shared by the pickup confirm step) */
  const orderDetails = (
    <div className="rounded-2xl border bg-white">
      <p className="border-b bg-gray-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-600">
        Order Details · {t.totalLines} line{t.totalLines !== 1 ? "s" : ""} · {t.totalPieces} pcs
      </p>
      <div className="max-h-56 space-y-2 overflow-y-auto p-3">
        {items.map((i) => {
          const up = unitPriceFor(i, fulfillment);
          return (
            <div key={`${i.id}::${i.unitType}`} className="flex items-center gap-2.5">
              <Image src={i.image || "/dmk-logo.png"} alt={i.name} width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg object-cover" unoptimized />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-xs font-semibold text-gray-900">{i.name}</p>
                <p className="text-[10px] text-gray-500">{i.qty} × {formatINR(up)}</p>
              </div>
              <p className="text-xs font-black text-gray-900">{formatINR(Math.round(up * i.qty * 100) / 100)}</p>
            </div>
          );
        })}
      </div>
      <div className="space-y-1.5 border-t bg-gray-50 p-3 text-xs">
        <div className="flex justify-between text-gray-600"><span>Item total ({t.totalPieces} pcs)</span><span className="font-semibold">{formatINR(t.itemTotal)}</span></div>
        {t.slabPct > 0 && (
          <div className="flex justify-between text-emerald-600"><span>Slab discount ({t.slabTitle})</span><span className="font-semibold">− {formatINR(t.slabDisc)}</span></div>
        )}
        {couponDisc > 0 && (
          <div className="flex justify-between text-emerald-600"><span>Coupon ({couponCode})</span><span className="font-semibold">− {formatINR(couponDisc)}</span></div>
        )}
        <div className="flex justify-between text-gray-600"><span>Delivery</span><span className="font-semibold">{t.deliveryFee === 0 ? "FREE" : formatINR(t.deliveryFee)}</span></div>
        <div className="flex justify-between border-t pt-1.5 text-sm">
          <span className="font-bold">Total</span><span className="font-black">{formatINR(grand)}</span>
        </div>
        {t.deliveryFee > 0 && t.itemTotal < FREE_DELIVERY_ABOVE && (
          <p className="text-[10px] text-gray-400">Free delivery above {formatINR(FREE_DELIVERY_ABOVE)}</p>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setStep("mode"); setResult(null); } }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-lg">
        <div className="bg-black px-5 py-3">
          <p className="text-sm font-bold text-yellow-400">
            {step === "gate" ? "Login required"
              : step === "mode" ? "How would you like your order?"
              : step === "address" ? "Delivery details"
              : step === "pay" ? (fulfillment === "PICKUP" ? "Confirm your order" : "Payment")
              : "Order Confirmed"} · {step === "done" && result ? formatINR(result.grandTotal) : formatINR(grand)}
          </p>
          <p className="text-[10px] text-gray-400">
            {items.length} lines · {fulfillment === "PICKUP" ? "Warehouse pickup — pack rates · no delivery fee" : "Delivery — single piece prices"}
          </p>
        </div>

        {/* ── LOGIN GATE: guests may fill a cart, but orders need an account ── */}
        {step === "gate" && (
          <div className="space-y-4 p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-yellow-100">
              <KeyRound className="h-7 w-7 text-yellow-600" />
            </div>
            <div>
              <p className="text-base font-black text-gray-900">Your cart is saved</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                To place this order, login to your DMK Mart B2B account or create one — your pricing
                slab (retailer / semi-wholesaler / wholesaler / distributor) is applied automatically
                the moment you log in.
              </p>
            </div>
            <div className="space-y-2">
              <Link
                href="/account"
                className="block w-full rounded-xl bg-black py-3 text-sm font-bold uppercase tracking-wide text-yellow-400 hover:bg-gray-800"
              >
                Login / Create Account
              </Link>
              <button
                onClick={() => onOpenChange(false)}
                className="w-full rounded-xl border px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Keep browsing
              </button>
            </div>
            <p className="text-[10px] text-gray-400">Cart contents are kept on this device — they will be waiting when you return.</p>
          </div>
        )}

        {/* ── FULFILLMENT POPUP ── */}
        {step === "mode" && (
          <div className="space-y-3 p-5">
            <button
              onClick={() => { setFulfillment("PICKUP"); setPickupWh(warehouses[0]?.id ?? ""); }}
              className={`flex w-full items-start justify-between rounded-2xl border-2 p-4 text-left transition ${
                fulfillment === "PICKUP" ? "border-yellow-400 bg-yellow-50" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="flex gap-3">
                <Store className="mt-0.5 h-5 w-5 text-yellow-600" />
                <span>
                  <span className="block text-sm font-black text-gray-900">Pick up from warehouse</span>
                  <span className="block text-[11px] text-gray-500">Pack rates · no delivery fee · collect from your nearest warehouse</span>
                </span>
              </span>
              {fulfillment === "PICKUP" && <BadgeCheck className="h-5 w-5 text-yellow-500" />}
            </button>
            <button
              onClick={() => setFulfillment("DELIVERY")}
              className={`flex w-full items-start justify-between rounded-2xl border-2 p-4 text-left transition ${
                fulfillment === "DELIVERY" ? "border-yellow-400 bg-yellow-50" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="flex gap-3">
                <Truck className="mt-0.5 h-5 w-5 text-gray-600" />
                <span>
                  <span className="block text-sm font-black text-gray-900">Get it delivered</span>
                  <span className="block text-[11px] text-gray-500">Single piece prices · to your shop address · free above ₹5,000</span>
                </span>
              </span>
              {fulfillment === "DELIVERY" && <BadgeCheck className="h-5 w-5 text-yellow-500" />}
            </button>

            {fulfillment === "PICKUP" && (
              <div className="rounded-2xl border bg-white p-3">
                <p className="mb-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  <MapPin className="h-3.5 w-3.5" /> Choose pickup warehouse
                </p>
                {warehouses.length === 0 ? (
                  <p className="text-xs text-gray-400">Loading warehouses…</p>
                ) : (
                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                    {warehouses.map((w: SessionWarehouse, i: number) => (
                      <button
                        key={w.id}
                        onClick={() => setPickupWh(w.id)}
                        className={`flex w-full items-start justify-between rounded-xl border p-2.5 text-left transition ${
                          pickupWh === w.id ? "border-yellow-400 bg-yellow-50" : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <span>
                          <span className="block text-xs font-bold text-gray-900">
                            {w.name}
                            {i === 0 && <span className="ml-1.5 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-black uppercase text-emerald-700">Nearest</span>}
                          </span>
                          <span className="block text-[10px] text-gray-500">{[w.address, w.city].filter(Boolean).join(", ")}</span>
                          {w.phone && <span className="block text-[10px] text-gray-400">{w.phone}</span>}
                        </span>
                        {pickupWh === w.id && <BadgeCheck className="h-4 w-4 shrink-0 text-yellow-500" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setStep(fulfillment === "PICKUP" ? "pay" : "address")}
              className="w-full rounded-xl bg-black py-3 text-sm font-bold uppercase tracking-wide text-yellow-400 hover:bg-gray-800"
            >
              Continue — {fulfillment === "PICKUP" ? "pack pickup rates" : "single piece delivery prices"}
            </button>
          </div>
        )}

        {/* ── DELIVERY ADDRESS ── */}
        {step === "address" && (
          <div className="space-y-3 p-5">
            {field("customerName", "Business / Contact name *", "e.g. Rajesh Traders")}
            {field("phone", "Mobile number *", "10-digit mobile", "tel")}
            {waOptIn && <p className="-mt-1 text-[10px] font-semibold text-emerald-600">✓ WhatsApp updates enabled for this number — you can opt out below.</p>}
            {field("email", "Email", "optional@example.com", "email")}
            {field("addressLine", "Delivery address *", "Shop no, street, landmark")}
            <div className="grid grid-cols-2 gap-3">
              {field("city", "City *", "City")}
              {field("pincode", "Pincode *", "6-digit pincode")}
            </div>
            {field("note", "Order note", "Any instructions (optional)")}
            <label className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
              <input type="checkbox" checked={waOptIn} onChange={(e) => setWaOptIn(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
              <span className="text-[11px] leading-relaxed text-gray-700">
                <b className="text-emerald-700">Get order updates on WhatsApp</b> — confirmation, dispatch &amp; delivery OTP on this mobile number. Free for you, faster than SMS.
              </span>
            </label>
            <button
              onClick={() => validateAddress() && setStep("pay")}
              className="w-full rounded-xl bg-black py-3 text-sm font-bold uppercase tracking-wide text-yellow-400 hover:bg-gray-800"
            >
              Continue
            </button>
          </div>
        )}

        {/* ── PICKUP: order details + confirm order ONLY (no payment options, no dispatch preference) ── */}
        {step === "pay" && fulfillment === "PICKUP" && (
          <div className="space-y-3 p-5">
            <div className="rounded-xl border bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-600">
              <b className="text-gray-900">Pickup from:</b>{" "}
              {chosenWh ? `${chosenWh.name}${chosenWh.city ? ` — ${chosenWh.city}` : ""}` : "loading…"}
              <br />Pack rates applied · <b>no delivery fee</b>. The DMK Mart team verifies stock at your warehouse right after you place the order.
            </div>
            {hydrated && orderDetails}
            <p className="-mt-1 text-center text-[10px] leading-relaxed text-gray-500">
              By placing this order you agree to our{" "}
              <a href="/page/terms-and-conditions" className="font-semibold text-gray-700 underline decoration-yellow-400 underline-offset-2 hover:text-black">Terms &amp; Conditions</a>,{" "}
              <a href="/page/refund-returns-policy" className="font-semibold text-gray-700 underline decoration-yellow-400 underline-offset-2 hover:text-black">Refund &amp; Returns</a>,{" "}
              <a href="/page/shipping-delivery-policy" className="font-semibold text-gray-700 underline decoration-yellow-400 underline-offset-2 hover:text-black">Shipping</a> and{" "}
              <a href="/page/privacy-policy" className="font-semibold text-gray-700 underline decoration-yellow-400 underline-offset-2 hover:text-black">Privacy Policy</a>.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setStep("mode")} className="rounded-xl border px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Back
              </button>
              <button
                onClick={place}
                disabled={placing || items.length === 0}
                className="flex-1 rounded-xl bg-black py-3 text-sm font-bold uppercase tracking-wide text-yellow-400 hover:bg-gray-800 disabled:opacity-50"
              >
                {placing ? "Placing order…" : `Confirm Order · ${formatINR(grand)}`}
              </button>
            </div>
          </div>
        )}

        {/* ── DELIVERY: payment + dispatch preference ── */}
        {step === "pay" && fulfillment === "DELIVERY" && (
          <div className="space-y-3 p-5">
            <div className="rounded-xl border bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-600">
              <b className="text-gray-900">Deliver to:</b> {[form.addressLine, form.city, form.pincode].filter(Boolean).join(", ")}
              <br />Single piece prices applied · free delivery above ₹5,000.
            </div>
            {hydrated && orderDetails}
            <div className="space-y-2">
              {PAYMENTS.map(([val, label, hint]) => (
                <button
                  key={val}
                  onClick={() => setForm((f) => ({ ...f, paymentMethod: val }))}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                    form.paymentMethod === val ? "border-yellow-400 bg-yellow-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span>
                    <span className="block text-sm font-bold text-gray-900">{label}</span>
                    <span className="block text-[11px] text-gray-500">{hint}</span>
                  </span>
                  {form.paymentMethod === val && <BadgeCheck className="h-5 w-5 text-yellow-500" />}
                </button>
              ))}
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-gray-600">Dispatch preference</label>
              <select
                value={form.slot}
                onChange={(e) => setForm((f) => ({ ...f, slot: e.target.value }))}
                className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              >
                {SLOTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <p className="-mt-1 text-center text-[10px] leading-relaxed text-gray-500">
              By placing this order you agree to our{" "}
              <a href="/page/terms-and-conditions" className="font-semibold text-gray-700 underline decoration-yellow-400 underline-offset-2 hover:text-black">Terms &amp; Conditions</a>,{" "}
              <a href="/page/refund-returns-policy" className="font-semibold text-gray-700 underline decoration-yellow-400 underline-offset-2 hover:text-black">Refund &amp; Returns</a>,{" "}
              <a href="/page/shipping-delivery-policy" className="font-semibold text-gray-700 underline decoration-yellow-400 underline-offset-2 hover:text-black">Shipping</a> and{" "}
              <a href="/page/privacy-policy" className="font-semibold text-gray-700 underline decoration-yellow-400 underline-offset-2 hover:text-black">Privacy Policy</a>.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setStep("address")} className="rounded-xl border px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Back
              </button>
              <button
                onClick={place}
                disabled={placing || items.length === 0}
                className="flex-1 rounded-xl bg-black py-3 text-sm font-bold uppercase tracking-wide text-yellow-400 hover:bg-gray-800 disabled:opacity-50"
              >
                {placing ? "Placing order…" : `Place Order · ${formatINR(grand)}`}
              </button>
            </div>
          </div>
        )}

        {/* ── DONE ── */}
        {step === "done" && result && (
          <div className="space-y-4 p-6 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
            <div>
              <p className="text-lg font-black text-gray-900">Order {result.invoiceNo}</p>
              <p className="text-sm text-gray-600">
                {formatINR(result.grandTotal)} · {fulfillment === "PICKUP" ? "Warehouse pickup" : "Delivery"}
              </p>
            </div>
            <div className="mx-auto w-fit rounded-2xl border-2 border-dashed border-yellow-400 bg-yellow-50 px-6 py-4">
              <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                <KeyRound className="h-3.5 w-3.5" /> Delivery OTP
              </p>
              <p className="mt-1 text-3xl font-black tracking-[0.3em] text-black">{result.otp}</p>
              <p className="mt-1 text-[10px] text-gray-500">Printed on invoice &amp; estimate · Share only at handover</p>
            </div>
            <div className="flex gap-2">
              <a
                href={`https://wa.me/91${result.phone}?text=${encodeURIComponent(
                  `DMK Mart Order ${result.invoiceNo}\n${fulfillment === "PICKUP" ? "Pickup" : "Delivery"} · Amount: ₹${result.grandTotal.toLocaleString("en-IN")}\nOTP: ${result.otp}\n\n— DMK Mart B2B`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700"
              >
                <MessageCircle className="h-4 w-4" /> Send OTP on WhatsApp
              </a>
              <button
                onClick={() => { onOpenChange(false); setStep("mode"); setResult(null); }}
                className="rounded-xl border px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
