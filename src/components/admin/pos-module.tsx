"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ScanBarcode, Trash2, Printer, PauseCircle, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader } from "./ui-bits";
import { formatINR } from "@/lib/store";
import type { DProduct } from "@/lib/types";

interface PosLine { id: string; name: string; brand: string; image: string; packQty: number; price: number; unitType: "SINGLE" | "PACK" | "BULK"; qty: number }

export function PosModule({ token }: { token: string }) {
  const call = useMemo(() => api(token), [token]);
  const [lines, setLines] = useState<PosLine[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<DProduct[]>([]);
  const [discount, setDiscount] = useState("0");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [pay, setPay] = useState<"CASH" | "UPI" | "CARD">("CASH");
  const [docType, setDocType] = useState<"TAX INVOICE" | "ESTIMATE">("TAX INVOICE");
  const [busy, setBusy] = useState(false);
  const [held, setHeld] = useState<PosLine[][]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onSearch = (v: string) => {
    setQ(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      if (!v.trim()) { setResults([]); return; }
      try {
        const d = await call(`/api/admin/pos?q=${encodeURIComponent(v)}`);
        setResults(d.rows);
      } catch { /* ignore */ }
    }, 250);
  };

  const addLine = (p: DProduct) => {
    setLines((ls) => {
      const ex = ls.find((l) => l.id === p.id);
      if (ex) return ls.map((l) => (l.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { id: p.id, name: p.name, brand: p.brand?.name ?? "", image: p.image, packQty: p.packQty ?? 1, price: p.dealerPrice, unitType: "SINGLE" as const, qty: 1 }];
    });
    setQ(""); setResults([]); inputRef.current?.focus();
  };

  const lineTotal = (l: PosLine) => {
    const ppu = l.unitType === "SINGLE" ? 1 : l.unitType === "PACK" ? l.packQty : Math.max(l.packQty * 4, 1);
    const factor = l.unitType === "SINGLE" ? 1 : l.unitType === "PACK" ? 0.94 : 0.88;
    return Math.round(l.price * ppu * factor * l.qty * 100) / 100;
  };
  const itemTotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const disc = Math.min(itemTotal, Number(discount) || 0);
  const gst = Math.round((itemTotal - disc) * 0.18 * 100) / 100;
  const total = Math.round((itemTotal - disc + gst) * 100) / 100;

  const checkout = async () => {
    if (!lines.length) { toast.error("Scan or add products first"); return; }
    setBusy(true);
    try {
      const d = await call("/api/admin/pos", {
        method: "POST",
        body: JSON.stringify({
          items: lines.map((l) => ({ id: l.id, unitType: l.unitType, qty: l.qty })),
          discount: disc, paymentMethod: pay, customerName: customerName || "Walk-in Customer", phone,
        }),
      });
      toast.success(`${docType} ${d.invoiceNo} — ${formatINR(d.grandTotal)} via ${pay} · OTP ${d.otp}`);
      printReceipt(d.invoiceNo);
      setLines([]); setDiscount("0"); setCustomerName(""); setPhone("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
    } finally { setBusy(false); }
  };

  const printReceipt = (invoiceNo: string) => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>${docType} ${invoiceNo}</title><style>body{font-family:monospace;padding:16px;font-size:12px}table{width:100%;border-collapse:collapse}td{padding:2px 4px}.r{text-align:right}h2{margin:0 0 2px}</style></head><body>
    <h2>DMK MART</h2><p style="margin:0">${docType} · ${invoiceNo}<br/>${new Date().toLocaleString("en-IN")}<br/>Counter: POS-1 · Manjri Warehouse</p><hr/>
    ${customerName ? `<p>Customer: ${customerName} ${phone}</p>` : ""}
    <table>${lines.map((l) => `<tr><td>${l.name}<br/>&nbsp;&nbsp;${l.qty} ${l.unitType} × ₹${l.price}</td><td class="r">₹${lineTotal(l).toFixed(2)}</td></tr>`).join("")}</table><hr/>
    <table>
      <tr><td>Subtotal</td><td class="r">₹${itemTotal.toFixed(2)}</td></tr>
      <tr><td>Discount</td><td class="r">₹${disc.toFixed(2)}</td></tr>
      <tr><td>GST 18%</td><td class="r">₹${gst.toFixed(2)}</td></tr>
      <tr><td><b>TOTAL (${pay})</b></td><td class="r"><b>₹${total.toFixed(2)}</b></td></tr>
    </table><hr/><p style="text-align:center">Thank you — Save More. Shop More.</p></body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <div>
      <ModuleHeader title="POS Billing" sub="Counter sales with instant stock deduction — F2 focuses scan box">
        <div className="flex overflow-hidden rounded-lg border">
          {(["TAX INVOICE", "ESTIMATE"] as const).map((t) => (
            <button key={t} onClick={() => setDocType(t)} className={`px-3 py-2 text-xs font-bold ${docType === t ? "bg-black text-yellow-400" : "bg-white text-gray-500"}`}>{t}</button>
          ))}
        </div>
      </ModuleHeader>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="relative mb-3">
            <ScanBarcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-yellow-600" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => onSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "F2") { e.preventDefault(); inputRef.current?.focus(); }
                if (e.key === "Enter" && results.length > 0) addLine(results[0]);
              }}
              placeholder="Scan Barcode or Search by Item Code / Name [F2 to focus, Enter to add]"
              className="h-11 w-full rounded-xl border-2 border-blue-500 bg-white pl-9 pr-3 text-sm font-medium outline-none"
            />
            {results.length > 0 && (
              <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border bg-white shadow-xl">
                {results.map((r) => (
                  <button key={r.id} onClick={() => addLine(r)} className="flex w-full items-center gap-2 border-b p-2 text-left last:border-0 hover:bg-yellow-50">
                    <Image src={r.image} alt="" width={36} height={36} className="h-9 w-9 rounded-md object-cover" unoptimized />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{r.name}</p>
                      <p className="text-[10px] text-gray-400">{r.brand?.name ?? ""} · {r.sku} · Pack {r.packQty} · Stock {r.stock}</p>
                    </div>
                    <span className="text-xs font-black">{formatINR(r.dealerPrice)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border bg-white">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-blue-600 text-[10px] uppercase text-white">
                  <th className="px-3 py-2.5 font-bold">#</th>
                  <th className="px-3 py-2.5 font-bold">Product</th>
                  <th className="px-3 py-2.5 font-bold">Price</th>
                  <th className="px-3 py-2.5 font-bold">Qty (units)</th>
                  <th className="px-3 py-2.5 font-bold">Subtotal</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-14 text-center text-gray-300">Scan a barcode or search to start billing</td></tr>
                ) : lines.map((l, i) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="max-w-[240px] px-3 py-2">
                      <p className="truncate font-semibold">{l.name}</p>
                      <p className="text-[10px] text-gray-400">{l.brand} · {l.unitType === "SINGLE" ? "Piece" : l.unitType === "PACK" ? `Pack of ${l.packQty}` : `Case of ${l.packQty * 4}`}</p>
                    </td>
                    <td className="px-3 py-2">{formatINR(l.price)}</td>
                    <td className="px-3 py-2">
                      <div className="flex w-fit items-center rounded-lg border">
                        <button onClick={() => setLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))} className="h-7 w-7 font-bold hover:bg-gray-50">−</button>
                        <span className="w-8 text-center font-bold">{l.qty}</span>
                        <button onClick={() => setLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, qty: x.qty + 1 } : x)))} className="h-7 w-7 font-bold hover:bg-gray-50">+</button>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-black">{formatINR(lineTotal(l))}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} className="rounded-md bg-red-50 p-1.5 text-red-500" aria-label={`Remove ${l.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {held.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold text-orange-600"><PauseCircle className="inline h-3.5 w-3.5" /> Held carts: {held.length}</p>
              {held.map((h, i) => (
                <button key={i} onClick={() => { setLines(h); setHeld((hs) => hs.filter((_, j) => j !== i)); }} className="rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-1.5 text-[11px] font-bold text-orange-700">
                  Resume #{i + 1} ({h.length} items)
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border bg-white p-3">
            <p className="mb-2 text-[11px] font-bold uppercase text-gray-500">Customer Details (Optional)</p>
            <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Phone Number" className="mb-2 h-9 w-full rounded-lg border border-gray-200 px-3 text-xs" />
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Name" className="h-9 w-full rounded-lg border border-gray-200 px-3 text-xs" />
          </div>

          <div className="rounded-xl border bg-white p-3">
            <p className="mb-2 text-[11px] font-bold uppercase text-gray-500">Discount</p>
            <div className="flex">
              <input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" className="h-9 w-full rounded-l-lg border border-gray-200 px-3 text-xs font-bold" />
              <span className="flex items-center rounded-r-lg border border-l-0 bg-gray-50 px-3 text-[11px] font-semibold text-gray-500">Flat Amount</span>
            </div>
          </div>

          <div className="rounded-xl bg-black p-4 text-white">
            <p className="text-sm font-black">Order Summary</p>
            <div className="mt-2 space-y-1 text-xs text-gray-300">
              <div className="flex justify-between"><span>Subtotal:</span><span>{formatINR(itemTotal)}</span></div>
              <div className="flex justify-between"><span>Tax (GST 18%):</span><span>{formatINR(gst)}</span></div>
              <div className="flex justify-between"><span>Discount:</span><span>− {formatINR(disc)}</span></div>
            </div>
            <div className="mt-2 flex justify-between border-t border-gray-800 pt-2">
              <span className="text-lg font-black text-yellow-400">Total:</span>
              <span className="text-lg font-black text-emerald-400">{formatINR(total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(["CASH", "UPI", "CARD"] as const).map((p) => (
              <button key={p} onClick={() => setPay(p)} className={`rounded-xl py-3 text-xs font-black transition ${pay === p ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {p === "CASH" ? "💵 " : p === "UPI" ? "📱 " : "💳 "}{p}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { if (lines.length) { setHeld((h) => [...h, lines]); setLines([]); toast.success("Cart held"); } }}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-3 text-xs font-black text-white hover:bg-amber-600"
            >
              <PauseCircle className="h-4 w-4" /> Hold
            </button>
            <button onClick={() => setLines([])} className="flex items-center justify-center gap-1.5 rounded-xl bg-gray-100 py-3 text-xs font-black text-gray-600 hover:bg-gray-200">
              <Trash2 className="h-4 w-4" /> Clear Cart
            </button>
          </div>

          <button onClick={checkout} disabled={busy || !lines.length} className="flex w-full items-center justify-center gap-2 rounded-xl bg-black py-3.5 text-sm font-black uppercase tracking-wide text-yellow-400 hover:bg-gray-800 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Print {docType} · {formatINR(total)}
          </button>
        </div>
      </div>
    </div>
  );
}
