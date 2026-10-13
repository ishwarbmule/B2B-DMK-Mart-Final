"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronRight, Printer, RefreshCcw, Search, MessageCircle, Barcode, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader, StatusBadge } from "./ui-bits";
import { Code39Svg } from "./barcode";
import { formatINR } from "@/lib/store";
import type { OrderRow } from "@/lib/types";

const STATUSES = ["PENDING", "CONFIRMED", "PACKED", "DISPATCHED", "DELIVERED", "CANCELLED"];

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
  const [showBarcodes, setShowBarcodes] = useState(false);

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

  const waLink = (o: OrderRow) =>
    `https://wa.me/91${o.phone}?text=${encodeURIComponent(
      `DMK Mart Order ${o.invoiceNo}\nDelivery OTP: ${o.otp}\nAmount: ₹${Number(o.grandTotal).toLocaleString("en-IN")}\nItems: ${o.items?.length ?? 0}\n\nShare this OTP with our delivery staff at handover.\n— DMK Mart B2B Wholesale`
    )}`;

  return (
    <div>
      <ModuleHeader title="Order Management" sub={`${total} orders · ${formatINR(revenue)} revenue · OTP-verified delivery`}>
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
                    <button onClick={() => setOpen(open === o.id ? null : o.id)} className="flex items-center gap-1.5 font-bold text-gray-900 hover:text-yellow-600">
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
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <a
                        href={`/admin/orders/${o.id}/invoice?token=${token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Print A4 invoice"
                        className="rounded-md border p-1.5 hover:bg-gray-100"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </a>
                      <a
                        href={`/admin/orders/${o.id}/estimate?token=${token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Print 80mm estimate"
                        className="rounded-md border p-1.5 hover:bg-gray-100"
                      >
                        <span className="px-0.5 text-[9px] font-black">80</span>
                      </a>
                      <a href={waLink(o)} target="_blank" rel="noopener noreferrer" title="Send OTP on WhatsApp" className="rounded-md border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-600 hover:bg-emerald-100">
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                      <button onClick={() => patch(o.id, { regenerateOtp: true }, `OTP regenerated: ${o.invoiceNo}`)} title="Regenerate OTP" className="rounded-md border p-1.5 hover:bg-gray-100">
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setShowBarcodes(showBarcodes === o.id ? false : o.id)} title="Order barcodes" className={`rounded-md border p-1.5 ${showBarcodes === o.id ? "bg-yellow-100" : "hover:bg-gray-100"}`}>
                        <Barcode className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
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
                      <div className="mt-2 overflow-hidden rounded-lg border bg-white">
                        <table className="w-full text-[11px]">
                          <thead className="bg-gray-100 text-left text-[9px] uppercase text-gray-500">
                            <tr>
                              <th className="px-2 py-1.5">Product</th>
                              <th className="px-2 py-1.5">Unit</th>
                              <th className="px-2 py-1.5 text-right">Qty</th>
                              <th className="px-2 py-1.5 text-right">Pieces</th>
                              <th className="px-2 py-1.5 text-right">Rate</th>
                              <th className="px-2 py-1.5 text-right">Total</th>
                              <th className="px-2 py-1.5">Item Barcode</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(o.items ?? []).map((it) => (
                              <tr key={it.id} className="border-t">
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
                                <td className="px-2 py-1.5"><Code39Svg value={it.barcode || it.sku} height={26} moduleWidth={1.1} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {showBarcodes === o.id && (
                        <div className="mt-3 rounded-lg border-2 border-dashed border-yellow-400 bg-white p-3">
                          <p className="mb-2 text-[11px] font-bold text-gray-600">Order & item barcodes — print sheet (Code39)</p>
                          <div className="flex flex-wrap items-start gap-4 print:gap-2">
                            <div className="text-center">
                              <Code39Svg value={o.invoiceNo.replace(/[^0-9A-Z]/g, "")} height={40} />
                              <p className="text-[9px] text-gray-500">ORDER</p>
                            </div>
                            {(o.items ?? []).map((it) => (
                              <div key={`bc-${it.id}`} className="text-center">
                                <Code39Svg value={it.barcode || it.sku} height={40} />
                                <p className="max-w-[120px] truncate text-[9px] text-gray-500">{it.sku} · {it.qty}×{it.unitType === "SINGLE" ? "PC" : it.unitType === "PACK" ? "PK" : "CS"}</p>
                              </div>
                            ))}
                          </div>
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
    </div>
  );
}
