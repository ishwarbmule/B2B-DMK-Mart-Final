/**
 * A4 invoice print page — /admin/orders/[id]/invoice?token=...
 *
 * Redesigned to the owner's approved demo (Tally-style ESTIMATE stationery):
 *   centered ESTIMATE title + UPI "SCAN & PAY" QR, bordered firm/buyer block,
 *   invoice meta grid (invoice no · dated · mode of payment · delivery note ·
 *   dispatched through · destination · terms of delivery), bordered goods table
 *   (SL · description+SKU · quantity · rate · per · amount), TOTAL / GRAND TOTAL /
 *   Previous Balance / Total Balance rows, amount chargeable in words, bank
 *   details, dashed delivery-verification OTP box, declaration + signatures.
 *
 * Long product lists flow onto page 2+ automatically (thead repeats, totals on
 * last page). No GST — DMK Mart does not charge or provide GST.
 */
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/admin-auth";
import { PrintButton } from "@/components/admin/print-button";
import { FIRM, fmtDate, num2, amountInWords, upiQrSvg } from "@/lib/print-docs";

export const dynamic = "force-dynamic";

const SANS = 'Arial, "Helvetica Neue", Helvetica, sans-serif';
const MONO = '"Courier New", ui-monospace, monospace';

function MetaCell({ label, value, className = "" }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={`px-2 py-1.5 ${className}`}>
      <p className="text-[8px] font-bold uppercase tracking-wide text-neutral-600">{label}</p>
      <p className="mt-0.5 text-[10.5px] font-semibold">{value || "—"}</p>
    </div>
  );
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

  const credited = order.items.filter((it) => it.lineStatus === "NEXT_PLAN").reduce((s, it) => s + it.total, 0);
  const totalQty = order.items.reduce((s, it) => s + it.qty, 0);
  const payable = Math.max(order.grandTotal - credited, 0);
  const nextPlan = order.items.filter((it) => it.lineStatus === "NEXT_PLAN");
  const otpSpaced = (order.otp || "----").split("").join(" ");
  const qr = await upiQrSvg(payable, order.invoiceNo);

  return (
    <div className="mx-auto w-full bg-white text-black print:p-0" style={{ maxWidth: 830, fontFamily: SANS }}>
      <style>{`
        @page { size: A4; margin: 10mm; }
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

      <div className="no-print mb-4 flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow">
        <p className="text-xs font-bold text-gray-500">A4 invoice · demo stationery · long orders print on extra pages automatically</p>
        <PrintButton label="Print Invoice (A4)" />
      </div>

      {/* ── centered title + UPI QR (top-right) ── */}
      <div className="relative">
        <div className="text-center">
          <p className="text-[24px] font-bold leading-none tracking-[0.05em]">ESTIMATE</p>
          <p className="mt-1 text-[9.5px] text-neutral-600">(Original for Recipient)</p>
        </div>
        <div className="absolute right-0 top-0 flex w-[112px] flex-col items-center">
          <div className="h-[82px] w-[82px] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="mt-0.5 text-center text-[8.5px] font-bold leading-tight">SCAN &amp; PAY ₹{num2(payable)}</p>
          <p className="text-center text-[7.5px] leading-tight text-neutral-600">· UPI {FIRM.upi}</p>
        </div>
      </div>

      {/* ── firm / buyer block + invoice meta grid ── */}
      <div className="mt-3 grid grid-cols-2 border border-black">
        <div className="border-r border-black">
          <div className="p-2">
            <p className="text-[13px] font-bold leading-tight">{FIRM.name}</p>
            <p className="mt-0.5 text-[10px]">{FIRM.address}</p>
            <p className="text-[10px]">State Name : {FIRM.stateName}, Code : {FIRM.stateCode}</p>
            <p className="text-[10px]">Ph : {FIRM.phone}</p>
          </div>
          <div className="border-t border-black p-2">
            <p className="text-[9px] font-bold">BUYER (BILL TO)</p>
            <p className="mt-0.5 text-[11.5px] font-bold">{order.customerName}</p>
            <p className="text-[10px]">
              {[order.addressLine, order.city].filter(Boolean).join(", ")}
              {order.pincode ? ` — ${order.pincode}` : ""}
            </p>
            <p className="text-[10px]">State Name : {FIRM.stateName}, Code : {FIRM.stateCode}</p>
            <p className="text-[10px]">Ph : {order.phone}</p>
          </div>
        </div>
        <div className="grid grid-cols-2">
          <MetaCell label="Invoice No." value={order.invoiceNo} className="border-b border-black" />
          <MetaCell label="Dated" value={fmtDate(order.createdAt)} className="border-b border-l border-black" />
          <MetaCell label="Mode/Terms of Payment" value={order.paymentMethod} className="border-b border-black" />
          <MetaCell label="Delivery Note" value="" className="border-b border-l border-black" />
          <MetaCell label="Dispatched Through" value="" className="border-b border-black" />
          <MetaCell label="Destination" value={order.city} className="border-b border-l border-black" />
          <MetaCell label="Terms of Delivery" value="" className="col-span-2" />
        </div>
      </div>

      {/* ── goods table ── */}
      <table className="mt-2 w-full border-collapse text-[10.5px]">
        <thead>
          <tr className="text-[9px] font-bold text-neutral-700">
            <th className="w-10 border border-black px-1 py-1 text-center">SL NO.</th>
            <th className="border border-black px-1.5 py-1 text-left">DESCRIPTION OF GOODS</th>
            <th className="w-20 border border-black px-1.5 py-1 text-right">QUANTITY</th>
            <th className="w-16 border border-black px-1.5 py-1 text-right">RATE</th>
            <th className="w-12 border border-black px-1 py-1 text-center">PER</th>
            <th className="w-24 border border-black px-1.5 py-1 text-right">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((it, i) => (
            <tr key={it.id}>
              <td className="border border-black px-1 py-1 text-center align-top">{it.serialNo || i + 1}</td>
              <td className="border border-black px-1.5 py-1 align-top">
                {it.name}
                <span className="mt-0.5 block text-[8px] text-neutral-500" style={{ fontFamily: MONO }}>{it.sku}</span>
              </td>
              <td className="border border-black px-1.5 py-1 text-right align-top">{num2(it.qty)}</td>
              <td className="border border-black px-1.5 py-1 text-right align-top">{num2(it.unitPrice)}</td>
              <td className="border border-black px-1 py-1 text-center align-top">{it.unitType === "PACK" ? "Pack" : "Pcs"}</td>
              <td className="border border-black px-1.5 py-1 text-right align-top">{num2(it.total)}</td>
            </tr>
          ))}

          {/* ── totals block (demo rows) ── */}
          <tr>
            <td className="border border-black"></td>
            <td className="border border-black px-1.5 py-1 text-right text-[10px] font-bold">TOTAL</td>
            <td className="border border-black px-1.5 py-1 text-right">{num2(totalQty)}</td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black px-1.5 py-1 text-right">{num2(order.itemTotal)}</td>
          </tr>
          {order.discount > 0 && (
            <tr>
              <td className="border border-black"></td>
              <td className="border border-black px-1.5 py-1 text-right text-[9.5px]">
                Discount{order.couponCode ? ` (${order.couponCode})` : ""}
              </td>
              <td className="border border-black" colSpan={3}></td>
              <td className="border border-black px-1.5 py-1 text-right">− {num2(order.discount)}</td>
            </tr>
          )}
          {order.deliveryFee > 0 && (
            <tr>
              <td className="border border-black"></td>
              <td className="border border-black px-1.5 py-1 text-right text-[9.5px]">Delivery / Freight</td>
              <td className="border border-black" colSpan={3}></td>
              <td className="border border-black px-1.5 py-1 text-right">{num2(order.deliveryFee)}</td>
            </tr>
          )}
          <tr>
            <td className="border border-black"></td>
            <td className="border border-black px-1.5 py-1 text-right text-[10.5px] font-black" colSpan={4}>GRAND TOTAL</td>
            <td className="border border-black px-1.5 py-1 text-right align-top">
              <span className="block text-[8px] font-bold leading-none">₹</span>
              <span className="block text-[15px] font-black leading-tight">{num2(order.grandTotal)}</span>
            </td>
          </tr>
          <tr>
            <td className="border border-black" colSpan={2}></td>
            <td className="border border-black px-1.5 py-1 text-right text-[9.5px]" colSpan={3}>Previous Balance</td>
            <td className="border border-black px-1.5 py-1 text-right align-top">
              {credited > 0 && <span className="block text-[8px] leading-none">Cr</span>}
              <span className="block text-[11px] font-semibold leading-tight">{num2(credited)}</span>
            </td>
          </tr>
          <tr>
            <td className="border border-black" colSpan={2}></td>
            <td className="border border-black px-1.5 py-1 text-right text-[10.5px] font-bold" colSpan={3}>Total Balance</td>
            <td className="border border-black px-1.5 py-1 text-right align-top">
              {payable > 0 && <span className="block text-[8px] font-semibold leading-none">Dr</span>}
              <span className="block text-[12px] font-black leading-tight">{num2(payable)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── next-delivery plan note (out-of-stock lines → credited) ── */}
      {nextPlan.length > 0 && (
        <div className="mt-2 border border-dashed border-black px-2 py-1.5 text-[9.5px]">
          <p className="text-[8.5px] font-bold uppercase tracking-wide">
            Next Delivery Plan{order.nextDeliveryAt ? ` — ${order.nextDeliveryAt}` : ""}
          </p>
          <p className="mt-0.5 leading-snug">
            Out of stock now — to be delivered in the next delivery:{" "}
            {nextPlan.map((it) => `${it.name} ×${it.qty} (${num2(it.total)})`).join("; ")}.
          </p>
          {credited > 0 && (
            <p className="mt-0.5 font-bold leading-snug">
              {num2(credited)} for these lines is credited to {order.customerName}&apos;s DMK Mart credit balance —
              shown above as Previous Balance (Cr) and deducted from the Total Balance.
            </p>
          )}
        </div>
      )}

      {/* ── amount in words ── */}
      <div className="mt-2 border border-black px-2 py-1.5">
        <p className="text-[8.5px] font-bold uppercase tracking-wide">Amount Chargeable (In Words)</p>
        <div className="flex items-end justify-between gap-3">
          <p className="text-[11px] font-bold">INR {amountInWords(order.grandTotal)} Only</p>
          <p className="shrink-0 text-[10px] italic">E. &amp; O.E.</p>
        </div>
      </div>

      {/* ── bank details ── */}
      <div className="mt-2 border border-black px-2 py-1.5">
        <p className="text-[8.5px] font-bold uppercase tracking-wide">Bank Details (NEFT/RTGS)</p>
        <p className="mt-0.5 text-[10px]">
          {FIRM.bankHolder} · {FIRM.bankName} · A/c {FIRM.bankAccount} · IFSC {FIRM.ifsc} · UPI {FIRM.upi}
        </p>
      </div>

      {/* ── delivery verification OTP ── */}
      <div className="mt-2 flex items-center justify-between gap-3 border border-dashed border-black px-2 py-1.5">
        <div>
          <p className="text-[8.5px] font-bold uppercase tracking-wide">Delivery Verification OTP</p>
          <p className="mt-0.5 text-[9px] text-neutral-700">Please check your goods and share this code with the driver upon delivery.</p>
        </div>
        <p className="shrink-0 text-[16px] font-bold tracking-[0.25em]" style={{ fontFamily: MONO }}>[ {otpSpaced} ]</p>
      </div>

      {/* ── declaration + signatures ── */}
      <div className="mt-2 grid grid-cols-[1.45fr_1fr] border border-black">
        <div className="border-r border-black p-2">
          <p className="text-[8.5px] font-bold uppercase tracking-wide underline">Declaration</p>
          <p className="mt-0.5 text-[9px] leading-snug text-neutral-800">
            We declare that this invoice shows the actual price of the goods described and that all particulars are
            true and correct. Goods once sold are subject to the firm&apos;s return policy; returned goods are
            quarantined to damaged stock.
          </p>
          <p className="mt-2 text-[9px]">Subject to Maharashtra jurisdiction.</p>
        </div>
        <div className="flex items-end justify-end p-2">
          <p className="text-[10px] font-bold">For {FIRM.name}</p>
        </div>
      </div>
      <div className="flex items-start justify-between px-2 pt-1.5 text-[9px]">
        <p>Customer&apos;s Seal and Signature</p>
        <p>Authorised Signatory</p>
      </div>

      <p className="mt-4 text-center text-[10px] font-bold tracking-[0.12em]">THIS IS A COMPUTER GENERATED INVOICE</p>
      <div className="mt-1 flex items-center justify-between gap-3 pb-2 text-[7.5px] text-neutral-600">
        <p>This is a computer-generated invoice under GST Rules — Rule 46 · DMK ESTIMATE</p>
        <p className="shrink-0 text-right">{order.invoiceNo} · {fmtDate(order.createdAt)}</p>
      </div>
    </div>
  );
}
