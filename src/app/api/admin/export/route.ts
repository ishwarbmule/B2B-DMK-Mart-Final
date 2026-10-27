/** GET /api/admin/export?type=&from=&to= — Excel (.xlsx) export of any report dataset. */
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function bookFromColumns(columns: string[], rows: unknown[][], sheetName: string) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([columns, ...rows.map((r) => r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c)))]);
  ws["!cols"] = columns.map((c) => ({ wch: Math.max(12, c.length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 30));
  return wb;
}

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") || "sales";
  const to = sp.get("to") ? new Date(sp.get("to") + "T23:59:59") : new Date();
  const from = sp.get("from") ? new Date(sp.get("from")) : new Date(to.getTime() - 29 * 86400000);

  let columns: string[] = [];
  let rows: unknown[][] = [];
  let name = type;

  if (type === "orders") {
    const orders = await db.order.findMany({ where: { createdAt: { gte: from, lte: to } }, orderBy: { createdAt: "desc" }, include: { items: true } });
    columns = ["Invoice", "Date", "Customer", "Type", "Phone", "City", "Items", "Pieces", "ItemTotal", "Discount", "Coupon", "GrandTotal", "Payment", "PayStatus", "Status", "OTP"];
    rows = orders.map((o) => [o.invoiceNo, new Date(o.createdAt).toLocaleDateString("en-IN"), o.customerName, o.customerType, o.phone, o.city, o.items.length, o.items.reduce((s, i) => s + i.pieces, 0), o.itemTotal, o.discount, o.couponCode, o.grandTotal, o.paymentMethod, o.paymentStatus, o.status, o.otp]);
    name = "orders";
  } else {
    // reuse report datasets
    const res = await fetch(`${req.nextUrl.origin}/api/admin/reports?type=${type}&from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`, {
      headers: { authorization: req.headers.get("authorization") ?? "" },
    });
    const data = await res.json();
    columns = data.columns ?? [];
    rows = data.rows ?? [];
    name = data.type ?? type;
  }

  const wb = bookFromColumns(columns, rows, name);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const filename = `dmk-${name}-${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
