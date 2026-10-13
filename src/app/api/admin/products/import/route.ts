import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur = "", row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (cur !== "" || row.length) { row.push(cur); rows.push(row); row = []; cur = ""; }
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => (obj[h] = (r[i] ?? "").trim()));
    return obj;
  });
}

/** Bulk Rate Change / Product Update — Step 2: import CSV to update prices (and names) */
export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const body = await req.json();
    const csv: string = body.csv || "";
    if (!csv.trim()) return jsonError("Empty CSV");
    const rows = parseCsv(csv);
    if (!rows.length) return jsonError("No data rows found");

    let updated = 0, skipped = 0;
    const errors: string[] = [];
    for (const r of rows) {
      const pid = r["id"] || r["pid"] || r["product id"];
      if (!pid) { skipped++; continue; }
      const data: Record<string, unknown> = {};
      if (r["c_price"] !== undefined && r["c_price"] !== "") data.basePrice = Number(r["c_price"]);
      if (r["base_price"] !== undefined && r["base_price"] !== "") data.dealerPrice = Number(r["base_price"]);
      if (r["old_price"] !== undefined && r["old_price"] !== "") data.mrp = Number(r["old_price"]);
      if (r["stock"] !== undefined && r["stock"] !== "") data.stock = parseInt(r["stock"]) || 0;
      if (r["product_name"] !== undefined && r["product_name"] !== "") data.name = r["product_name"];
      if (!Object.keys(data).length) { skipped++; continue; }
      const bad = Object.entries(data).find(([, v]) => typeof v === "number" && Number.isNaN(v));
      if (bad) { errors.push(`Row ${pid}: invalid number for ${bad[0]}`); continue; }
      try {
        await db.product.update({ where: { id: pid }, data });
        updated++;
      } catch {
        skipped++;
      }
    }
    await db.activityLog.create({ data: { action: "IMPORT", entity: "product", detail: `Bulk rate CSV imported: ${updated} products updated, ${skipped} skipped` } });
    return NextResponse.json({ ok: true, updated, skipped, errors: errors.slice(0, 5) });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Import failed", 500);
  }
}
