/**
 * A4 GST Invoice print page — /admin/orders/[id]/invoice?token=...
 * Long product lists flow onto page 2+ automatically (thead repeats, totals on last page).
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/admin-auth";
import { PrintButton } from "@/components/admin/print-button";

export const dynamic = "force-dynamic";

function inr(n: number) {
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!verifyToken(token)) {
    return <p className="p-10 text-center text-sm text-red-500">Unauthorized — open from the admin Orders module.</p>;
  }
  const { id } = await params;
  const order = await db.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) notFound();

  const settings = await db.setting.findMany();
  const S: Record<string, string> = {};
  for (const s of settings) S[s.key] = s.value;

  const taxable = order.itemTotal - order.discount;
  // GST display follows the mode stored on THIS order (gstAmount = 0 ⇒ placed in Without-GST mode)
  const gstOn = order.gstAmount > 0;
  const cgst = gstOn ? Math.round((order.gstAmount / 2) * 100) / 100 : 0;
  const sgst = cgst;
  const credited = order.items.filter((it) => it.lineStatus === "NEXT_PLAN").reduce((s, it) => s + it.total, 0);

  return (
    <div className="mx-auto max-w-[820px] bg-white p-6 print:p-0">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; }
        }
        @media screen {
          body { background: #e5e7eb; padding: 20px 0; }
        }
      `}</style>

      <div className="no-print mb-4 flex items-center justify-between">
        <p className="text-xs font-bold text-gray-500">A4 {gstOn ? "Tax " : ""}Invoice · prints multiple pages automatically for long orders</p>
        <PrintButton label="Print Invoice (A4)" />
      </div>

      {/* header */}
      <div className="flex items-start justify-between border-b-2 border-black pb-3">
        <div className="flex items-center gap-3">
          { }
          <img src="/dmk-logo.png" alt="DMK Mart" width={56} height={56} />
          <div>
            <p className="text-xl font-black tracking-tight">{S.firm_name ?? "DMK Mart"}</p>
            <p className="text-[10px] text-gray-600">{S.firm_address}</p>
            <p className="text-[10px] text-gray-600">{S.firm_phone} · {S.firm_email}</p>
            {gstOn && <p className="text-[10px] text-gray-600">GSTIN: {S.firm_gstin} · State: {S.gst_state}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-black">{gstOn ? "TAX INVOICE" : "INVOICE"}</p>
          <p className="text-[11px]"><b>Invoice:</b> {order.invoiceNo}</p>
          <p className="text-[11px]"><b>Date:</b> {new Date(order.createdAt).toLocaleDateString("en-IN")}</p>
          <p className="inline-block border-2 border-black px-2 py-0.5 text-[10px] font-black tracking-widest">{order.status}</p>
        </div>
      </div>

      {/* parties */}
      <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
        <div className="border p-2.5">
          <p className="mb-1 text-[9px] font-black uppercase tracking-wider text-gray-500">Billed To</p>
          <p className="font-bold">{order.customerName}</p>
          <p className="text-gray-600">{order.addressLine}, {order.city} — {order.pincode}</p>
          <p className="text-gray-600">Phone: {order.phone} {order.email ? `· ${order.email}` : ""}</p>
          <p className="text-gray-600">Customer type: {order.customerType} · Tier: {order.priceTier}</p>
        </div>
        <div className="border p-2.5">
          <p className="mb-1 text-[9px] font-black uppercase tracking-wider text-gray-500">Delivery Verification</p>
          <p className="mt-1 text-2xl font-black tracking-[0.35em]">{order.otp || "----"}</p>
          <p className="text-[10px] text-gray-600">Delivery OTP — verify at handover. Not valid without OTP confirmation.</p>
          <p className="mt-1 text-[10px] text-gray-600">Payment: {order.paymentMethod} ({order.paymentStatus})</p>
        </div>
      </div>

      {/* items */}
      <table className="mt-3 w-full border-collapse text-[10.5px]">
        <thead>
          <tr className="bg-black text-white">
            <th className="border border-black px-1.5 py-1.5 text-left">Sr</th>
            <th className="border border-black px-1.5 py-1.5 text-left">SKU</th>
            <th className="border border-black px-1.5 py-1.5 text-left">Product</th>
            {gstOn && <th className="border border-black px-1.5 py-1.5 text-left">HSN</th>}
            <th className="border border-black px-1.5 py-1.5 text-left">Unit</th>
            <th className="border border-black px-1.5 py-1.5 text-right">Qty</th>
            <th className="border border-black px-1.5 py-1.5 text-right">Pcs</th>
            <th className="border border-black px-1.5 py-1.5 text-right">Rate</th>
            <th className="border border-black px-1.5 py-1.5 text-right">Amount</th>
            <th className="border border-black px-1.5 py-1.5 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((it, i) => (
            <tr key={it.id} className={i % 2 ? "bg-gray-50" : ""}>
              <td className="border border-gray-300 px-1.5 py-1 font-mono font-bold">{it.serialNo || i + 1}</td>
              <td className="border border-gray-300 px-1.5 py-1 font-mono">{it.sku}</td>
              <td className="border border-gray-300 px-1.5 py-1">{it.name}</td>
              {gstOn && <td className="border border-gray-300 px-1.5 py-1">{it.hsn || "—"}</td>}
              <td className="border border-gray-300 px-1.5 py-1">{it.unitType === "SINGLE" ? "Piece" : it.unitType === "PACK" ? `Pack of ${it.packQty}` : `Case of ${it.packQty}`}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-right">{it.qty}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-right">{it.pieces}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-right">{inr(it.unitPrice)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-right font-semibold">{inr(it.total)}</td>
              <td className="border border-gray-300 px-1.5 py-1 text-[9px] font-bold">{it.lineStatus === "NEXT_PLAN" ? "NEXT DELIVERY" : "IN STOCK"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* next-delivery plan (out-of-stock lines → credited) */}
      {order.items.some((it) => it.lineStatus === "NEXT_PLAN") && (
        <div className="mt-3 border-2 border-dashed border-black p-2.5 text-[10.5px]">
          <p className="font-black uppercase tracking-wide">⚠ Next Delivery Plan{order.nextDeliveryAt ? ` — ${order.nextDeliveryAt}` : ""}</p>
          <p className="mt-1 leading-relaxed">
            The following items are currently out of stock and will be delivered in the NEXT delivery:
            {order.items.filter((it) => it.lineStatus === "NEXT_PLAN").map((it) => ` ${it.name} ×${it.qty} (${inr(it.total)})`).join(";")}.
          </p>
          {credited > 0 && (
            <p className="mt-1 font-bold leading-relaxed">
              Till then, {inr(credited)} for these items has been CREDITED to {order.customerName}&apos;s DMK Mart credit balance (adjustable against future orders).
            </p>
          )}
          {credited === 0 && (
            <p className="mt-1 leading-relaxed">The amount for these items will be credited to the buyer&apos;s DMK Mart credit balance.</p>
          )}
        </div>
      )}

      {/* totals */}
      <div className="mt-3 flex justify-end">
        <table className="w-72 border-collapse text-[11px]">
          <tbody>
            <tr><td className="border px-2 py-1">Item Total</td><td className="border px-2 py-1 text-right">{inr(order.itemTotal)}</td></tr>
            {order.discount > 0 && (
              <tr><td className="border px-2 py-1">Discount {order.couponCode ? `(${order.couponCode})` : ""}</td><td className="border px-2 py-1 text-right">− {inr(order.discount)}</td></tr>
            )}
            {gstOn && (
              <>
                <tr><td className="border px-2 py-1">Taxable Value</td><td className="border px-2 py-1 text-right">{inr(taxable)}</td></tr>
                <tr><td className="border px-2 py-1">CGST @ 9%</td><td className="border px-2 py-1 text-right">{inr(cgst)}</td></tr>
                <tr><td className="border px-2 py-1">SGST @ 9%</td><td className="border px-2 py-1 text-right">{inr(sgst)}</td></tr>
              </>
            )}
            {order.deliveryFee > 0 && <tr><td className="border px-2 py-1">Delivery / Freight</td><td className="border px-2 py-1 text-right">{inr(order.deliveryFee)}</td></tr>}
            <tr className="bg-black text-white"><td className="border border-black px-2 py-1.5 font-black">GRAND TOTAL</td><td className="border border-black px-2 py-1.5 text-right font-black">{inr(order.grandTotal)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex items-end justify-between text-[10px] text-gray-600">
        <div>
          <p>Bank: {S.firm_bank} · A/c {S.firm_bank_account} · IFSC {S.firm_ifsc}</p>
          <p>UPI: {S.firm_upi}</p>
          <p className="mt-1">Goods once dispatched are not returnable unless damaged — report within 7 days with this invoice &amp; OTP.</p>
        </div>
        <div className="text-center">
          <p className="mt-10 border-t border-black pt-1">For {S.firm_name ?? "DMK Mart"}</p>
          <p className="mt-1">Authorised Signatory</p>
        </div>
      </div>
    </div>
  );
}
