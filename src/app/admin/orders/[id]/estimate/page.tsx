/**
 * 80mm thermal estimate print page — /admin/orders/[id]/estimate?token=...
 * Page width 80mm, height auto-extends with items (thermal roll).
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/admin-auth";
import { PrintButton } from "@/components/admin/print-button";

export const dynamic = "force-dynamic";

function inr(n: number) {
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

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

  return (
    <div className="mx-auto bg-white" style={{ width: "80mm" }}>
      <style>{`
        @page { size: 80mm auto; margin: 2mm; }
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
        <p className="text-[11px] font-bold text-gray-500">80mm thermal estimate · height auto-extends</p>
        <PrintButton label="Print Estimate" />
      </div>

      <div className="px-1 py-1 font-mono text-[10px] leading-snug text-black">
        <p className="text-center text-[13px] font-black tracking-wide">DMK MART</p>
        <p className="text-center text-[9px]">Plot 14, MIDC Industrial Area, Solapur Road, Pune 411019</p>
        <p className="text-center text-[9px]">Ph: +91 98220 12345 · GSTIN: 27ABCDE1234F1Z5</p>
        <p className="my-1 text-center">--------------------------------</p>
        <p className="text-center font-bold">ESTIMATE / CHALLAN</p>
        <div className="flex justify-between"><span>No: {order.invoiceNo}</span><span>{new Date(order.createdAt).toLocaleDateString("en-IN")}</span></div>
        <div className="flex justify-between"><span>Party: {order.customerName.slice(0, 22)}</span><span>{order.phone}</span></div>
        <div className="flex justify-between"><span>Type: {order.customerType}</span><span>Pay: {order.paymentMethod}</span></div>
        <p className="my-1 text-center">================================</p>
        <table className="w-full">
          <thead>
            <tr className="border-b border-black text-left text-[9px]">
              <th>Item</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amt</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => (
              <tr key={it.id} className="align-top">
                <td className="py-0.5 pr-1">
                  {it.name.slice(0, 30)}
                  <span className="block text-[8px] text-gray-600">{it.sku} · {it.unitType === "SINGLE" ? "PC" : it.unitType === "PACK" ? `PK${it.packQty}` : `CS${it.packQty}`}</span>
                </td>
                <td className="py-0.5 text-right">{it.qty}</td>
                <td className="py-0.5 text-right">{inr(it.unitPrice)}</td>
                <td className="py-0.5 text-right">{inr(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="my-1 text-center">--------------------------------</p>
        <div className="flex justify-between"><span>Items {order.items.length} · Pieces {order.items.reduce((s, i) => s + i.pieces, 0)}</span><span>{inr(order.itemTotal)}</span></div>
        {order.discount > 0 && <div className="flex justify-between"><span>Discount {order.couponCode ? `(${order.couponCode})` : ""}</span><span>-{inr(order.discount)}</span></div>}
        <div className="flex justify-between"><span>GST 18%</span><span>{inr(order.gstAmount)}</span></div>
        {order.deliveryFee > 0 && <div className="flex justify-between"><span>Freight</span><span>{inr(order.deliveryFee)}</span></div>}
        <div className="flex justify-between border-t border-black text-[12px] font-black"><span>TOTAL</span><span>{inr(order.grandTotal)}</span></div>
        <p className="mt-2 text-center text-[16px] font-black tracking-[0.4em]">OTP {order.otp || "----"}</p>
        <p className="text-center text-[8px]">Share OTP only at delivery handover</p>
        <p className="mt-2 text-center text-[9px]">This is an estimate, not a tax invoice.</p>
        <p className="text-center text-[9px]">Thank you! Shop with DMK Mart B2B</p>
        <p className="pb-2 text-center text-[8px]">Powered by DMK Mart Portal · {new Date().toLocaleString("en-IN")}</p>
      </div>
    </div>
  );
}
