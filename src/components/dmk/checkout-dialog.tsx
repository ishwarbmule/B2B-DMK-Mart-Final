"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CheckCircle2, Package, BadgeCheck, MessageCircle, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useCartStore, cartTotals, formatINR, unitPriceFor, piecesPerUnit, useSiteStore } from "@/lib/store";
import { useHydrated } from "@/hooks/use-hydrated";
import { getCustomerToken } from "@/lib/customer-session";

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

export function CheckoutDialog({ open, onOpenChange, couponCode = "", couponDisc = 0 }: Props) {
  const hydrated = useHydrated();
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);
  const gst = useSiteStore((s) => s.gstEnabled);
  useEffect(() => { useSiteStore.getState().load(); }, []);
  const [step, setStep] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [result, setResult] = useState<{ invoiceNo: string; grandTotal: number; otp: string; phone: string } | null>(null);
  const [form, setForm] = useState({
    customerName: "", phone: "", email: "", addressLine: "", city: "", pincode: "",
    slot: SLOTS[0], paymentMethod: "UPI", note: "",
  });
  const [waOptIn, setWaOptIn] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const t = cartTotals(items, gst);

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.customerName.trim().length < 2) e.customerName = "Enter full name";
    if (!/^[6-9]\d{9}$/.test(form.phone)) e.phone = "Enter valid 10-digit mobile";
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = "Invalid email";
    if (form.addressLine.trim().length < 6) e.addressLine = "Enter complete address";
    if (form.city.trim().length < 2) e.city = "Enter city";
    if (!/^\d{6}$/.test(form.pincode)) e.pincode = "6-digit pincode";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const place = async () => {
    setPlacing(true);
    try {
      const token = getCustomerToken();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { "x-customer-token": token } : {}) },
        body: JSON.stringify({
          ...form,
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
      setStep(2);
    } finally {
      setPlacing(false);
    }
  };

  const waLink = result
    ? `https://wa.me/91${result.phone}?text=${encodeURIComponent(
        `DMK Mart Order ${result.invoiceNo}\nDelivery OTP: ${result.otp}\nAmount: ₹${result.grandTotal.toLocaleString("en-IN")}\n\nShare this OTP with the delivery staff at handover. — DMK Mart B2B`
      )}`
    : "#";

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

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setStep(0); setResult(null); } }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-lg">
        <div className="bg-black px-5 py-3">
          <p className="text-sm font-bold text-yellow-400">
            {step === 2 ? "Order Confirmed" : "Checkout"} · {formatINR(Math.max(0, t.grandTotal - couponDisc))}
          </p>
          <p className="text-[10px] text-gray-400">{items.length} lines · {gst ? "GST invoice" : "Invoice"} · Delivery OTP printed on invoice</p>
        </div>

        {step === 0 && (
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
              onClick={() => validate() && setStep(1)}
              className="w-full rounded-xl bg-black py-3 text-sm font-bold uppercase tracking-wide text-yellow-400 hover:bg-gray-800"
            >
              Continue to Payment
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3 p-5">
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
              <button onClick={() => setStep(0)} className="rounded-xl border px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Back
              </button>
              <button
                onClick={place}
                disabled={placing || items.length === 0}
                className="flex-1 rounded-xl bg-black py-3 text-sm font-bold uppercase tracking-wide text-yellow-400 hover:bg-gray-800 disabled:opacity-50"
              >
                {placing ? "Placing order…" : `Place Order · ${formatINR(Math.max(0, t.grandTotal - couponDisc))}`}
              </button>
            </div>
          </div>
        )}

        {step === 2 && result && (
          <div className="space-y-4 p-6 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
            <div>
              <p className="text-lg font-black text-gray-900">Order {result.invoiceNo}</p>
              <p className="text-sm text-gray-600">{formatINR(result.grandTotal)} · {gst ? "GST invoice generated" : "Invoice generated"}</p>
            </div>
            <div className="mx-auto w-fit rounded-2xl border-2 border-dashed border-yellow-400 bg-yellow-50 px-6 py-4">
              <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                <KeyRound className="h-3.5 w-3.5" /> Delivery OTP
              </p>
              <p className="mt-1 text-3xl font-black tracking-[0.3em] text-black">{result.otp}</p>
              <p className="mt-1 text-[10px] text-gray-500">Printed on invoice & estimate · Share only at handover</p>
            </div>
            <div className="flex gap-2">
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700"
              >
                <MessageCircle className="h-4 w-4" /> Send OTP on WhatsApp
              </a>
              <button
                onClick={() => { onOpenChange(false); setStep(0); setResult(null); }}
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
