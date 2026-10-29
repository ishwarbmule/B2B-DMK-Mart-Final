/**
 * 80mm thermal estimate print page — /admin/orders/[id]/estimate?token=...
 *
 * Redesigned to the owner's thermal-roll demo slip: "|| Shri Ganesh ||" header,
 * firm block, spaced E S T I M A T E title, party/date/no block, fully bordered
 * PARTICULARS · NOS · RATE · AMOUNT grid, Total / Previous Balance / Total
 * Balance rows, total in words, UPI "SCAN & PAY" QR and thank-you footer.
 * Page width 80mm, height auto-extends with items (thermal roll).
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/admin-auth";
import { PrintButton } from "@/components/admin/print-button";
import { FIRM, fmtDate, num2, amountInWords, upiQrSvg } from "@/lib/print-docs";

export const dynamic = "force-dynamic";

const SANS = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

export default async function EstimatePage({
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
  const qr = await upiQrSvg(payable, order.invoiceNo);

  return (
    <div className="mx-auto bg-white text-black" style={{ width: "80mm", fontFamily: SANS }}>
      <style>{`
        @page { size: 80mm auto; margin: 3mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          tr, td { page-break-inside: avoid; }
        }
        @media screen {
          body { background: #e5e7eb; padding: 16px 0; }
        }
      `}</style>

      <div className="no-print mb-3 flex items-center justify-between rounded-lg bg-white px-2 py-2 shadow" style={{ width: "100mm" }}>
        <p className="text-[11px] font-bold text-gray-500">80mm thermal estimate · demo slip design · height auto-extends</p>
        <PrintButton label="Print Estimate" />
      </div>

      <div className="px-0.5 pb-1 text-[10px] leading-snug">
        {/* ── header ── */}
        <p className="text-center text-[8px] font-bold">|| Shri Ganesh ||</p>
        <p className="mt-0.5 text-center text-[12.5px] font-black leading-tight">{FIRM.name.toUpperCase()}</p>
        <p className="text-center text-[8.5px]">{FIRM.address} · Ph : {FIRM.phone}</p>
        <p className="my-1 text-center text-[11px] font-bold" style={{ letterSpacing: "0.55em", textIndent: "0.55em" }}>
          ESTIMATE
        </p>
        <div className="border-t border-dashed border-black" />

        {/* ── party / date / no. ── */}
        <div className="mt-1 flex items-start justify-between gap-1.5 text-[8.5px]">
          <p className="min-w-0">
            <span className="font-bold">Party-Name : </span>
            {order.customerName}, {order.city} · Ph {order.phone}
          </p>
          <p className="shrink-0 text-right">
            <span className="font-bold">Date : </span>{fmtDate(order.createdAt)}
            <span className="block"><span className="font-bold">No. </span>{order.invoiceNo}</span>
          </p>
        </div>

        {/* ── goods grid ── */}
        <table className="mt-1 w-full border-collapse text-[9px]">
          <thead>
            <tr>
              <th className="border border-black px-1 py-0.5 text-left font-bold">PARTICULARS</th>
              <th className="w-[22%] border border-black px-1 py-0.5 text-right font-bold">NOS</th>
              <th className="w-[17%] border border-black px-1 py-0.5 text-right font-bold">RATE</th>
              <th className="w-[25%] border border-black px-1 py-0.5 text-right font-bold">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => (
              <tr key={it.id}>
                <td className="border border-black px-1 py-0.5 align-top leading-tight">{it.name}</td>
                <td className="border border-black px-1 py-0.5 text-right align-top">{num2(it.qty)}</td>
                <td className="border border-black px-1 py-0.5 text-right align-top">{num2(it.unitPrice)}</td>
                <td className="border border-black px-1 py-0.5 text-right align-top">{num2(it.total)}</td>
              </tr>
            ))}

            {/* ── totals (demo rows) ── */}
            <tr>
              <td className="border border-black px-1 py-0.5 text-right font-bold">Total :</td>
              <td className="border border-black px-1 py-0.5 text-right font-bold">{num2(totalQty)}</td>
              <td className="border border-black"></td>
              <td className="border border-black px-1 py-0.5 text-right font-bold">{num2(order.itemTotal)}</td>
            </tr>
            {order.discount > 0 && (
              <tr>
                <td className="border border-black px-1 py-0.5 text-right" colSpan={3}>
                  Discount{order.couponCode ? ` (${order.couponCode})` : ""}
                </td>
                <td className="border border-black px-1 py-0.5 text-right">-{num2(order.discount)}</td>
              </tr>
            )}
            {order.deliveryFee > 0 && (
              <tr>
                <td className="border border-black px-1 py-0.5 text-right" colSpan={3}>Freight</td>
                <td className="border border-black px-1 py-0.5 text-right">{num2(order.deliveryFee)}</td>
              </tr>
            )}
            <tr>
              <td className="border border-black px-1 py-0.5 text-right" colSpan={3}>Previous Balance :</td>
              <td className="border border-black px-1 py-0.5 text-right">
                {credited > 0 ? `Cr ${num2(credited)}` : num2(0)}
              </td>
            </tr>
            <tr>
              <td className="border border-black px-1 py-0.5 text-right font-bold" colSpan={3}>Total Balance :</td>
              <td className="border border-black px-1 py-0.5 text-right align-top font-bold">
                {payable > 0 && <span className="mr-0.5 align-top text-[7px]">Dr</span>}
                {num2(payable)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── words / slip meta ── */}
        <p className="mt-1 text-[8.5px]">
          <span className="font-bold">Total In Words : </span>
          {amountInWords(order.grandTotal)} Rupees Only
        </p>
        <p className="mt-0.5 text-[7.5px]">Auto slip · Fast Billing {order.invoiceNo}</p>

        {/* ── UPI QR ── */}
        <div className="mt-1.5 flex flex-col items-center">
          <div className="h-[32mm] w-[32mm] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="mt-0.5 text-[9.5px] font-bold">SCAN &amp; PAY ₹{num2(payable)} · UPI</p>
          <p className="text-[7.5px]">{FIRM.upi}</p>
        </div>

        <p className="mt-1.5 pb-1 text-center text-[10px] font-black">Thank You! Visit Again.</p>
      </div>
    </div>
  );
}
