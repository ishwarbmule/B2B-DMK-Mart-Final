"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  ChevronDown, ChevronRight, Printer, RefreshCcw, Search, MessageCircle, Barcode, KeyRound,
  PackageCheck, Clock3, PencilLine, CheckCheck, IndianRupee, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader, StatusBadge } from "./ui-bits";
import { Code39Svg } from "./barcode";
import { formatINR } from "@/lib/store";
import type { OrderRow, OrderItemRow } from "@/lib/types";

const STATUSES = ["PENDING", "CONFIRMED", "PACKED", "DISPATCHED", "DELIVERED", "CANCELLED"];

type StockLine = {
  id: string; productId: string; sku: string; name: string; image: string;
  unitType: string; packQty: number; qty: number; pieces: number;
  unitPrice: number; total: number; serialNo: number; lineStatus: string;
  available: number; ok: boolean;
  perWarehouse: { warehouseId: string; name: string; qty: number }[];
};
type StockCheck = {
  order: { id: string; invoiceNo: string; status: string; confirmedAt?: string; nextDeliveryAt?: string };
  lines: StockLine[];
  warehouses: { id: string; name: string; isDefault: boolean }[];
  summary: { okCount: number; oosCount: number; oosAmount: number; hasCustomerId: boolean };
};

export function OrdersModule({ token }: { token: string }) {
  const call = api(token);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [waPanel, setWaPanel] = useState<string | null>(null);
  const [waStatus, setWaStatus] = useState("");
  const [waMsg, setWaMsg] = useState("");
  const [waBusy, setWaBusy] = useState(false);
  const [waNote, setWaNote] = useState("");
  const [creditShown, setCreditShown] = useState<string | null>(null);
  const [creditAmt, setCreditAmt] = useState(0);

  // stock-check + order-flow state
  const [stock, setStock] = useState<StockCheck | null>(null);
  const [stockFor, setStockFor] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editLines, setEditLines] = useState<Array<{ id: string; qty: number; unitPrice: number; name: string; remove?: boolean }>>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [nextDate, setNextDate] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "15" });
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      if (source) params.set("source", source);
      const d = await call(`/api/admin/orders?${params}`);
      setRows(d.rows ?? []);
      setTotal(d.total ?? 0);
      setRevenue(d.revenue ?? 0);
      setPages(d.pages ?? 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }

  }, [token, page, q, status, source]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: string, data: Record<string, unknown>, msg: string) => {
    try {
      await call("/api/admin/orders", { method: "PATCH", body: JSON.stringify({ id, ...data }) });
      toast.success(msg);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  /** expand → auto stock-check for PENDING orders; credit view for confirmed */
  const toggleOpen = async (o: OrderRow) => {
    if (open === o.id) { setOpen(null); setStock(null); setStockFor(null); return; }
    setOpen(o.id);
    setStock(null);
    setStockFor(null);
    if (o.status === "PENDING") {
      try {
        const d = await call(`/api/admin/orders-flow?orderId=${o.id}`) as StockCheck;
        setStock(d);
        setStockFor(o.id);
        setEditLines(d.lines.map((l) => ({ id: l.id, qty: l.qty, unitPrice: l.unitPrice, name: l.name })));
        if (!d.summary.hasCustomerId) toast.info("Guest order — out-of-stock credit needs a buyer account");
      } catch { /* detail still renders */ }
    } else if (o.customerId) {
      call(`/api/admin/crud/customers`).then((d: { rows: Array<{ id: string; creditBalance?: number }> }) => {
        const c = (d.rows || []).find((x) => x.id === o.customerId);
        if (c) { setCreditAmt(c.creditBalance ?? 0); setCreditShown(o.id); }
      }).catch(() => {});
    }
  };

  const startEdit = () => {
    if (!stock) return;
    setEditLines(stock.lines.map((l) => ({ id: l.id, qty: l.qty, unitPrice: l.unitPrice, name: l.name })));
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!stockFor) return;
    setBusy(true);
    try {
      await call("/api/admin/orders-flow", {
        method: "POST",
        body: JSON.stringify({
          action: "edit", orderId: stockFor,
          lines: editLines.filter((l) => !l.remove).map((l) => ({ id: l.id, qty: Number(l.qty), unitPrice: Number(l.unitPrice) })),
          removeItemIds: editLines.filter((l) => l.remove).map((l) => l.id),
        }),
      });
      toast.success("Order updated — totals recalculated");
      setEditOpen(false);
      await load();
      const d = await call(`/api/admin/orders-flow?orderId=${stockFor}`) as StockCheck;
      setStock(d);
      setEditLines(d.lines.map((l) => ({ id: l.id, qty: l.qty, unitPrice: l.unitPrice, name: l.name })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Edit failed");
    } finally { setBusy(false); }
  };

  const confirmOrder = async () => {
    if (!stockFor) return;
    setBusy(true);
    try {
      const d = await call("/api/admin/orders-flow", {
        method: "POST",
        body: JSON.stringify({ action: "confirm", orderId: stockFor, nextDeliveryDate: nextDate }),
      });
      const s = d.summary ?? {};
      toast.success(`Order confirmed — ${s.shipNow ?? "?"} lines ship now${s.nextPlan ? `, ${s.nextPlan} → next delivery${s.credited ? ` (₹${s.credited} credited)` : ""}` : ""}`);
      setConfirmOpen(false);
      setOpen(null);
      setStock(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Confirm failed");
    } finally { setBusy(false); }
  };

  const toggleWa = (o: OrderRow) => {
    if (waPanel === o.id) { setWaPanel(null); return; }
    setWaPanel(o.id);
    setWaStatus(o.status);
    setWaNote("");
    setWaMsg(`DMK Mart order ${o.invoiceNo} — status ${o.status}.`);
    call(`/api/admin/whatsapp?action=order-preview&orderId=${o.id}&status=${o.status}`)
      .then((d) => setWaMsg(d.message ?? ""))
      .catch(() => {});
  };

  const pickWaStatus = (o: OrderRow, s: string) => {
    setWaStatus(s);
    call(`/api/admin/whatsapp?action=order-preview&orderId=${o.id}&status=${s}`)
      .then((d) => setWaMsg(d.message ?? ""))
      .catch(() => {});
  };

  const sendWaGateway = async (o: OrderRow) => {
    setWaBusy(true);
    setWaNote("");
    try {
      const d = await call("/api/admin/whatsapp", { method: "POST", body: JSON.stringify({ action: "ORDER_STATUS", orderId: o.id, status: waStatus, message: waMsg }) });
      if (d.mode === "GATEWAY") {
        setWaNote("Delivered via gateway ✓");
        toast.success("WhatsApp sent via gateway");
      } else {
        setWaNote("No gateway configured — use 'Open WhatsApp' below (free, you press send)");
        toast.info("Gateway not configured — message ready for WhatsApp");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setWaBusy(false);
    }
  };

  return (
    <div>
      <ModuleHeader title="Order Management" sub={`${total} orders · ${formatINR(revenue)} revenue · stock checked at confirmation · OTP-verified delivery`}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search invoice / phone / OTP…"
            className="h-9 w-56 rounded-lg border pl-8 text-xs outline-none focus:border-yellow-400"
          />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-9 rounded-lg border text-xs">
          <option value="">All Status</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }} className="h-9 rounded-lg border text-xs">
          <option value="">Web + POS</option>
          <option value="WEB">Web</option>
          <option value="POS">POS</option>
        </select>
        <button onClick={load} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-gray-50">
          <RefreshCcw className="h-3.5 w-3.5" /> Refresh
        </button>
      </ModuleHeader>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2.5">Invoice</th>
              <th className="px-3 py-2.5">Customer</th>
              <th className="px-3 py-2.5">Items</th>
              <th className="px-3 py-2.5">OTP</th>
              <th className="px-3 py-2.5 text-right">Total</th>
              <th className="px-3 py-2.5">Payment</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">Loading orders…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No orders match the filters.</td></tr>
            )}
            {rows.map((o) => (
              <>
                <tr key={o.id} className="border-t hover:bg-gray-50/60">
                  <td className="px-3 py-2.5">
                    <button onClick={() => toggleOpen(o)} className="flex items-center gap-1.5 font-bold text-gray-900 hover:text-yellow-600">
                      {open === o.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {o.invoiceNo}
                    </button>
                    <p className="text-[10px] text-gray-400">{new Date(o.createdAt).toLocaleDateString("en-IN")} · {o.source}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold">{o.customerName}</p>
                    <p className="text-[10px] text-gray-400">{o.phone} · {o.city} · {o.customerType}</p>
                  </td>
                  <td className="px-3 py-2.5">{o.items?.length ?? 0} lines</td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-md bg-yellow-100 px-2 py-0.5 font-mono text-[11px] font-black tracking-widest text-black">{o.otp || "—"}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-black">{formatINR(o.grandTotal)}</td>
                  <td className="px-3 py-2.5">
                    <p>{o.paymentMethod}</p>
                    <StatusBadge status={o.paymentStatus} />
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      value={o.status}
                      onChange={(e) => patch(o.id, { status: e.target.value }, `${o.invoiceNo} → ${e.target.value}`)}
                      className="rounded-md border px-1.5 py-1 text-[11px] font-semibold"
                    >
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    {o.status === "PENDING" && <p className="mt-1 text-[9px] font-bold text-amber-600">stock check pending</p>}
                    {o.status === "CONFIRMED" && o.items?.some((i) => (i as OrderItemRow & { lineStatus?: string }).lineStatus === "NEXT_PLAN") && (
                      <p className="mt-1 text-[9px] font-bold text-blue-600">has next-delivery lines</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <a
                        href={`/admin/orders/${o.id}/invoice?token=${token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Print A4 invoice (serials + next-delivery note)"
                        className="rounded-md border p-1.5 hover:bg-gray-100"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </a>
                      <a
                        href={`/admin/orders/${o.id}/barcodes?token=${token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Print order barcode sheet (serial · MRP · price)"
                        className="rounded-md border p-1.5 hover:bg-gray-100"
                      >
                        <Barcode className="h-3.5 w-3.5" />
                      </a>
                      <button
                        onClick={() => toggleWa(o)}
                        title="Send WhatsApp as per status"
                        className={`rounded-md border p-1.5 ${waPanel === o.id ? "border-emerald-400 bg-emerald-100 text-emerald-700" : "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"}`}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => patch(o.id, { regenerateOtp: true }, `OTP regenerated: ${o.invoiceNo}`)} title="Regenerate OTP" className="rounded-md border p-1.5 hover:bg-gray-100">
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                {waPanel === o.id && (
                  <tr key={`${o.id}-wa`} className="bg-emerald-50/50">
                    <td colSpan={8} className="px-4 pb-4 pt-1">
                      <div className="rounded-xl border border-emerald-200 bg-white p-3">
                        <p className="mb-2 flex items-center gap-2 text-xs font-black text-gray-900">
                          <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp message — pick the status, edit if needed, send
                          <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-bold text-gray-500">to {o.phone}</span>
                        </p>
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {STATUSES.map((s) => (
                            <button
                              key={s}
                              onClick={() => pickWaStatus(o, s)}
                              className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${waStatus === s ? "bg-emerald-600 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={waMsg}
                          onChange={(e) => setWaMsg(e.target.value)}
                          rows={4}
                          className="w-full rounded-lg border p-2.5 text-xs leading-relaxed outline-none focus:border-emerald-400"
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <a
                            href={`https://wa.me/91${o.phone}?text=${encodeURIComponent(waMsg)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#1fb958]"
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> Open WhatsApp (free)
                          </a>
                          <button onClick={() => sendWaGateway(o)} disabled={waBusy} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                            {waBusy ? "Sending…" : "Send via gateway"}
                          </button>
                          {waNote && <span className="text-[10px] font-semibold text-gray-500">{waNote}</span>}
                        </div>
                        <p className="mt-1.5 text-[10px] text-gray-400">
                          Open WhatsApp always works — it opens WhatsApp with this message ready for {o.phone} (you press send). “Send via gateway” needs Admin → Settings → WhatsApp configured.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
                {open === o.id && (
                  <tr key={`${o.id}-detail`} className="bg-gray-50/70">
                    <td colSpan={8} className="px-4 pb-4 pt-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                        <span>Ship: {o.shippingStatus}</span><span>·</span>
                        <span>Pay: {o.paymentStatus}</span><span>·</span>
                        <span>Tier: {o.priceTier}</span><span>·</span>
                        <span>{o.addressLine}, {o.city} — {o.pincode}</span>
                        {o.couponCode && (<><span>·</span><span className="font-bold text-emerald-600">Coupon {o.couponCode}</span></>)}
                        <button onClick={() => patch(o.id, { shippingStatus: "IN_TRANSIT" }, "Marked in transit")} className="ml-auto rounded-md border px-2 py-1 font-semibold hover:bg-white">Mark In-Transit</button>
                        <button onClick={() => patch(o.id, { shippingStatus: "DELIVERED", status: "DELIVERED" }, "Marked delivered")} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 hover:bg-emerald-100">Mark Delivered</button>
                      </div>

                      {/* ── PENDING: stock check + Edit / Confirm ── */}
                      {o.status === "PENDING" && stockFor === o.id && stock && (
                        <div className="mt-2 rounded-xl border-2 border-amber-300 bg-amber-50/60 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="flex items-center gap-1.5 text-xs font-black text-gray-900">
                              <PackageCheck className="h-4 w-4 text-amber-600" /> Automatic stock check
                            </p>
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{stock.summary.okCount} in stock</span>
                            {stock.summary.oosCount > 0 && (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                {stock.summary.oosCount} out of stock · {formatINR(stock.summary.oosAmount)} will be credited
                              </span>
                            )}
                            <div className="ml-auto flex gap-1.5">
                              <button onClick={startEdit} className="flex items-center gap-1 rounded-lg border-2 border-gray-800 bg-white px-3 py-1.5 text-[11px] font-black hover:bg-gray-50">
                                <PencilLine className="h-3.5 w-3.5" /> Edit Order
                              </button>
                              <button onClick={() => { setNextDate(""); setConfirmOpen(true); }} className="flex items-center gap-1 rounded-lg bg-black px-3 py-1.5 text-[11px] font-black text-yellow-400 hover:bg-gray-800">
                                <CheckCheck className="h-3.5 w-3.5" /> Confirm Order
                              </button>
                            </div>
                          </div>
                          {stock.warehouses.length > 0 && (
                            <p className="mt-1.5 text-[10px] text-gray-500">
                              Warehouses: {stock.warehouses.map((w) => `${w.name}${w.isDefault ? " (default)" : ""}`).join(" · ")} — allocation pulls from the default first.
                            </p>
                          )}
                        </div>
                      )}

                      {/* ── confirmed buyer credit line ── */}
                      {creditShown === o.id && (
                        <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-800">
                          <Wallet className="h-3.5 w-3.5" /> Buyer credit balance: {formatINR(creditAmt)}
                        </p>
                      )}

                      <div className="mt-2 overflow-hidden rounded-lg border bg-white">
                        <table className="w-full text-[11px]">
                          <thead className="bg-gray-100 text-left text-[9px] uppercase text-gray-500">
                            <tr>
                              <th className="px-2 py-1.5">Sr</th>
                              <th className="px-2 py-1.5">Product</th>
                              <th className="px-2 py-1.5">Unit</th>
                              <th className="px-2 py-1.5 text-right">Qty</th>
                              <th className="px-2 py-1.5 text-right">Pieces</th>
                              <th className="px-2 py-1.5 text-right">Rate</th>
                              <th className="px-2 py-1.5 text-right">Total</th>
                              <th className="px-2 py-1.5">Stock</th>
                              <th className="px-2 py-1.5">Item Barcode</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(o.items ?? []).map((it, idx) => {
                              const ext = it as OrderItemRow & { serialNo?: number; lineStatus?: string; plannedNote?: string };
                              const sl = stock?.lines.find((l) => l.id === it.id);
                              const ok = sl ? sl.ok : null;
                              return (
                                <tr key={it.id} className={`border-t ${ext.lineStatus === "NEXT_PLAN" ? "bg-blue-50/60" : ""}`}>
                                  <td className="px-2 py-1.5 font-mono font-bold">{ext.serialNo || idx + 1}</td>
                                  <td className="flex items-center gap-2 px-2 py-1.5">
                                    {it.image && <Image src={it.image} alt="" width={26} height={26} className="h-6 w-6 rounded object-cover" unoptimized />}
                                    <span className="font-semibold">{it.name}</span>
                                    <span className="text-[9px] text-gray-400">{it.sku}</span>
                                  </td>
                                  <td className="px-2 py-1.5">{it.unitType === "SINGLE" ? "Piece" : it.unitType === "PACK" ? `Pack ×${it.packQty}` : `Case ×${it.packQty}`}</td>
                                  <td className="px-2 py-1.5 text-right">{it.qty}</td>
                                  <td className="px-2 py-1.5 text-right">{it.pieces}</td>
                                  <td className="px-2 py-1.5 text-right">{formatINR(it.unitPrice)}</td>
                                  <td className="px-2 py-1.5 text-right font-bold">{formatINR(it.total)}</td>
                                  <td className="px-2 py-1.5">
                                    {o.status === "PENDING" ? (
                                      ok === null ? <span className="text-gray-300">…</span> : ok ? (
                                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">IN STOCK · {sl?.available}</span>
                                      ) : (
                                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-black text-red-700">OOS · {sl?.available} left</span>
                                      )
                                    ) : ext.lineStatus === "NEXT_PLAN" ? (
                                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-black text-blue-700">NEXT PLAN</span>
                                    ) : (
                                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-black text-gray-600">SHIPS NOW</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5"><Code39Svg value={it.barcode || it.sku} height={26} moduleWidth={1.1} /></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* next-delivery plan note for confirmed orders */}
                      {o.status !== "PENDING" && o.items?.some((i) => (i as OrderItemRow & { lineStatus?: string }).lineStatus === "NEXT_PLAN") && (
                        <div className="mt-2 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/70 p-3 text-[11px] text-blue-900">
                          <p className="flex items-center gap-1.5 font-black"><Clock3 className="h-3.5 w-3.5" /> Next Delivery Plan{o.nextDeliveryAt ? ` — ${o.nextDeliveryAt}` : ""}</p>
                          <ul className="mt-1 list-inside list-disc">
                            {(o.items as Array<OrderItemRow & { lineStatus?: string; plannedNote?: string }>).filter((i) => i.lineStatus === "NEXT_PLAN").map((i) => (
                              <li key={i.id}><b>{i.name}</b> ×{i.qty} — {formatINR(i.total)} credited to buyer credit</li>
                            ))}
                          </ul>
                          <p className="mt-1 text-[10px] font-semibold">This note prints on the invoice automatically.</p>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 text-xs">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border px-3 py-1.5 font-semibold disabled:opacity-40">Prev</button>
          <span className="font-semibold text-gray-600">Page {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border px-3 py-1.5 font-semibold disabled:opacity-40">Next</button>
        </div>
      )}

      {/* ── Edit Order dialog ── */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="flex items-center gap-2 text-sm font-black text-gray-900"><PencilLine className="h-4 w-4 text-yellow-600" /> Edit Order — pricing, quantity, remove lines</p>
            <p className="mt-1 text-[11px] text-gray-500">Change qty and rate per line, or remove lines. Totals, slabs, GST and delivery fee recalculate automatically.</p>
            <div className="mt-3 space-y-2">
              {editLines.map((l, i) => (
                <div key={l.id} className={`flex items-center gap-2 rounded-lg border p-2 ${l.remove ? "border-red-200 bg-red-50 opacity-60" : ""}`}>
                  <span className="w-6 text-center font-mono text-[10px] font-bold text-gray-400">{i + 1}</span>
                  <span className="flex-1 truncate text-xs font-semibold">{l.name}</span>
                  <label className="text-[10px] font-bold text-gray-500">QTY</label>
                  <input
                    type="number" min={0.01} step="any" value={l.qty}
                    onChange={(e) => setEditLines((ls) => ls.map((x, xi) => xi === i ? { ...x, qty: Number(e.target.value) } : x))}
                    className="h-8 w-20 rounded border px-2 text-xs"
                  />
                  <label className="text-[10px] font-bold text-gray-500"><IndianRupee className="inline h-3 w-3" />RATE</label>
                  <input
                    type="number" min={0} step="any" value={l.unitPrice}
                    onChange={(e) => setEditLines((ls) => ls.map((x, xi) => xi === i ? { ...x, unitPrice: Number(e.target.value) } : x))}
                    className="h-8 w-24 rounded border px-2 text-xs"
                  />
                  <button
                    onClick={() => setEditLines((ls) => ls.map((x, xi) => xi === i ? { ...x, remove: !x.remove } : x))}
                    className={`rounded px-2 py-1 text-[10px] font-bold ${l.remove ? "bg-red-600 text-white" : "border text-gray-500 hover:bg-gray-50"}`}
                  >
                    {l.remove ? "Undo" : "Remove"}
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditOpen(false)} className="rounded-lg border px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveEdit} disabled={busy} className="rounded-lg bg-black px-4 py-2 text-xs font-black text-yellow-400 hover:bg-gray-800 disabled:opacity-50">
                {busy ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Order dialog ── */}
      {confirmOpen && stock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="flex items-center gap-2 text-sm font-black text-gray-900"><CheckCheck className="h-4 w-4 text-emerald-600" /> Confirm Order — final check</p>
            <div className="mt-3 space-y-1.5 rounded-xl border bg-gray-50 p-3 text-xs">
              <p className="flex justify-between"><span className="font-semibold text-emerald-700">Ship now (in stock)</span><span className="font-black">{stock.summary.okCount} lines</span></p>
              <p className="flex justify-between"><span className="font-semibold text-blue-700">Next delivery plan (out of stock)</span><span className="font-black">{stock.summary.oosCount} lines · {formatINR(stock.summary.oosAmount)}</span></p>
              {stock.summary.oosCount > 0 && (
                <>
                  <label className="mt-2 block text-[11px] font-bold text-gray-600">Next delivery date (prints on invoice & credited note)</label>
                  <input
                    type="date"
                    value={nextDate}
                    onChange={(e) => setNextDate(e.target.value ? new Date(e.target.value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "")}
                    className="h-9 w-full rounded-lg border px-3 text-xs"
                  />
                  <p className="text-[10px] text-gray-500">
                    {stock.summary.hasCustomerId
                      ? `Out-of-stock amounts (${formatINR(stock.summary.oosAmount)}) will be credited to ${rows.find((r) => r.id === stock.order.id)?.customerName ?? "the buyer"}'s credit balance.`
                      : "Guest order (no buyer account) — credit cannot be posted; the invoice will note the next-delivery plan instead."}
                  </p>
                </>
              )}
              <p className="mt-2 border-t pt-2 text-[10px] text-gray-500">On confirm: serial numbers are assigned to every line, in-stock lines decrement live stock (default warehouse first), and the invoice becomes ready to print with barcodes.</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmOpen(false)} className="rounded-lg border px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={confirmOrder} disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50">
                {busy ? "Confirming…" : "Confirm & Assign Serials"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
