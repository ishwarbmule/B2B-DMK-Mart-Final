"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import {
  MapPinHouse,
  Clock,
  ChevronLeft,
  CheckCircle2,
  Loader2,
  BadgeCheck,
} from "lucide-react";
import { useCartStore, cartTotals, formatINR } from "@/lib/store";
import type { PlacedOrder } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const SLOTS = [
  { id: "today-2pm", label: "Today", detail: "2:00 PM - 5:00 PM", tag: "Express" },
  { id: "today-6pm", label: "Today", detail: "6:00 PM - 9:00 PM", tag: "Popular" },
  { id: "tom-8am", label: "Tomorrow", detail: "8:00 AM - 11:00 AM", tag: "" },
  { id: "tom-11am", label: "Tomorrow", detail: "11:00 AM - 2:00 PM", tag: "" },
  { id: "tom-5pm", label: "Tomorrow", detail: "5:00 PM - 8:00 PM", tag: "" },
];

// No payment methods anywhere — orders are confirmed without online payment selection.
// "UPI" is sent silently for API/database compatibility only, never shown to customers.

interface Address {
  customerName: string;
  phone: string;
  addressLine: string;
  city: string;
  pincode: string;
}

export function CheckoutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);
  const setOpenCart = useCartStore((s) => s.setOpen);
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [address, setAddress] = useState<Address>({
    customerName: "",
    phone: "",
    addressLine: "",
    city: "",
    pincode: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Address, string>>>({});
  const [slot, setSlot] = useState("today-2pm");
  const [placing, setPlacing] = useState(false);
  const [order, setOrder] = useState<PlacedOrder | null>(null);

  useEffect(() => {
    if (open) {
      setStep(0);
      setOrder(null);
      setPlacing(false);
    }
  }, [open]);

  const t = cartTotals(items);

  const validateAddress = () => {
    const e: Partial<Record<keyof Address, string>> = {};
    if (address.customerName.trim().length < 2) e.customerName = "Enter your full name";
    if (!/^[6-9]\d{9}$/.test(address.phone.trim())) e.phone = "Enter a valid 10-digit mobile number";
    if (address.addressLine.trim().length < 8) e.addressLine = "Enter house/flat, street & landmark";
    if (address.city.trim().length < 2) e.city = "Enter your city";
    if (!/^\d{6}$/.test(address.pincode.trim())) e.pincode = "Enter a valid 6-digit pincode";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const set = (k: keyof Address) => (ev: ChangeEvent<HTMLInputElement>) =>
    setAddress((a) => ({ ...a, [k]: ev.target.value }));

  const placeOrder = async () => {
    setPlacing(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...address,
          slot: slotLabel,
          paymentMethod: "UPI",
          items: items.map((i) => ({
            productId: i.productId,
            name: i.name,
            packSize: i.packSize,
            price: i.price,
            mrp: i.mrp,
            qty: i.qty,
            emoji: i.emoji,
            bgFrom: i.bgFrom,
            bgTo: i.bgTo,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to place order");
      }
      const data = await res.json();
      setOrder(data.order);
      setStep(2);
      clearCart();
      toast({ title: "Order placed successfully! 🎉", description: `Order ID: ${data.order.id.slice(0, 10).toUpperCase()}` });
    } catch (err) {
      toast({
        title: "Could not place order",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPlacing(false);
    }
  };

  const slotLabel = (() => {
    const s = SLOTS.find((s) => s.id === slot);
    return s ? `${s.label}, ${s.detail}` : slot;
  })();

  const steps = ["Address", "Slot", "Done"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="bg-black px-5 py-3.5">
          <DialogTitle className="text-white text-base font-bold">Checkout</DialogTitle>
          <DialogDescription className="text-white/70 text-xs">
            Secure checkout · {t.itemCount} items · {formatINR(t.grandTotal)}
          </DialogDescription>
          {/* Stepper */}
          <div className="flex items-center gap-1.5 mt-3">
            {steps.map((label, i) => (
              <div key={label} className="flex items-center gap-1.5 flex-1 last:flex-none">
                <div
                  className={cn(
                    "flex items-center gap-1 text-[10px] font-semibold",
                    i <= step ? "text-[#ffd400]" : "text-white/40"
                  )}
                >
                  <span
                    className={cn(
                      "h-4 w-4 rounded-full text-[9px] flex items-center justify-center font-bold",
                      i < step
                        ? "bg-[#ffd400] text-black"
                        : i === step
                          ? "border-2 border-[#ffd400] text-[#ffd400]"
                          : "border-2 border-white/40 text-white/40"
                    )}
                  >
                    {i < step ? "✓" : i + 1}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={cn("h-0.5 flex-1 rounded", i < step ? "bg-[#ffd400]" : "bg-white/20")} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* ---- Step 0: Address ---- */}
          {step === 0 && (
            <div className="space-y-3">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <MapPinHouse className="h-4 w-4 text-[#f0b800]" /> Delivery Address
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <Label htmlFor="co-name" className="text-xs text-slate-500">Full name</Label>
                  <Input id="co-name" value={address.customerName} onChange={set("customerName")} placeholder="Ishwar Kumar" className="mt-1 h-9" />
                  {errors.customerName && <p className="text-xs text-red-500 mt-0.5">{errors.customerName}</p>}
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label htmlFor="co-phone" className="text-xs text-slate-500">Mobile number</Label>
                  <Input id="co-phone" value={address.phone} onChange={set("phone")} placeholder="98765 43210" maxLength={10} inputMode="numeric" className="mt-1 h-9" />
                  {errors.phone && <p className="text-xs text-red-500 mt-0.5">{errors.phone}</p>}
                </div>
              </div>
              <div>
                <Label htmlFor="co-addr" className="text-xs text-slate-500">Flat / House no., Building, Street, Landmark</Label>
                <Input id="co-addr" value={address.addressLine} onChange={set("addressLine")} placeholder="B-1204, Sunrise Apartments, MG Road" className="mt-1 h-9" />
                {errors.addressLine && <p className="text-xs text-red-500 mt-0.5">{errors.addressLine}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="co-city" className="text-xs text-slate-500">City</Label>
                  <Input id="co-city" value={address.city} onChange={set("city")} placeholder="Mumbai" className="mt-1 h-9" />
                  {errors.city && <p className="text-xs text-red-500 mt-0.5">{errors.city}</p>}
                </div>
                <div>
                  <Label htmlFor="co-pin" className="text-xs text-slate-500">Pincode</Label>
                  <Input id="co-pin" value={address.pincode} onChange={set("pincode")} placeholder="400001" maxLength={6} inputMode="numeric" className="mt-1 h-9" />
                  {errors.pincode && <p className="text-xs text-red-500 mt-0.5">{errors.pincode}</p>}
                </div>
              </div>
              <Button
                onClick={() => validateAddress() && setStep(1)}
                className="w-full bg-black hover:bg-[#2c2c2c] text-[#ffd400] font-bold h-11 mt-2"
              >
                Continue to Delivery Slot
              </Button>
            </div>
          )}

          {/* ---- Step 1: Slot ---- */}
          {step === 1 && (
            <div>
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-[#f0b800]" /> Choose Delivery Slot
              </h3>
              <RadioGroup value={slot} onValueChange={setSlot} className="space-y-2">
                {SLOTS.map((s) => (
                  <label
                    key={s.id}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border-2 p-3 cursor-pointer transition-colors",
                      slot === s.id ? "border-black bg-yellow-50" : "border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <RadioGroupItem value={s.id} id={s.id} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">
                        {s.label}, {s.detail}
                      </p>
                    </div>
                    {s.tag && (
                      <span className="bg-[#ffd400] text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {s.tag}
                      </span>
                    )}
                  </label>
                ))}
              </RadioGroup>
              <Separator className="my-3" />
              <div className="bg-slate-50 rounded-xl p-3 text-sm space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Item total</span>
                  <span>{formatINR(t.itemTotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Delivery + handling</span>
                  <span>{formatINR(t.deliveryFee + t.handlingFee)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 pt-1">
                  <span>Amount to pay</span>
                  <span>{formatINR(t.grandTotal)}</span>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => setStep(0)} className="flex-1 h-11">
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <Button
                  onClick={placeOrder}
                  disabled={placing}
                  className="flex-[2] bg-black hover:bg-[#2c2c2c] text-[#ffd400] font-bold h-11"
                >
                  {placing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Placing order...
                    </>
                  ) : (
                    `Place Order · ${formatINR(t.grandTotal)}`
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ---- Step 2: Success ---- */}
          {step === 2 && order && (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-3">
                <CheckCircle2 className="h-9 w-9 text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Order Confirmed! 🎉</h3>
              <p className="text-sm text-slate-500 mt-1">
                Thank you, {order.customerName ? order.customerName.split(" ")[0] : "friend"}! Your groceries are on their way.
              </p>
              <div className="bg-slate-50 rounded-xl p-4 mt-4 text-left text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Order ID</span>
                  <span className="font-bold text-slate-800">{order.id.slice(0, 10).toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Items</span>
                  <span className="font-medium text-slate-800">{order.itemCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Delivery slot</span>
                  <span className="font-medium text-slate-800">{order.slot}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount to pay</span>
                  <span className="font-bold text-[#b8860b]">{formatINR(order.grandTotal)}</span>
                </div>
                {order.totalSavings > 0 && (
                  <div className="flex justify-between text-green-600 font-semibold">
                    <span>You saved</span>
                    <span>{formatINR(order.totalSavings)}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-3 flex items-center justify-center gap-1">
                <BadgeCheck className="h-3.5 w-3.5 text-green-500" /> You will receive an SMS confirmation shortly.
              </p>
              <Button
                onClick={() => {
                  onOpenChange(false);
                  setOpenCart(false);
                }}
                className="w-full mt-4 bg-black hover:bg-[#2c2c2c] text-[#ffd400] font-bold h-11"
              >
                Continue Shopping
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
