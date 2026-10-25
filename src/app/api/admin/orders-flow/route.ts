/**
 * /api/admin/orders-flow — admin order pipeline:
 *   GET  ?orderId=...            → auto stock-check per line (pieces needed vs available) + per-warehouse view
 *   POST { action: "edit", ... } → admin edits order lines (qty / unit price / remove lines) + recompute totals
 *   POST { action: "confirm" }   → confirm order: in-stock lines ship now (serials 1..n, stock + warehouse
 *                                  allocation decrement), out-of-stock lines → NEXT_PLAN (next delivery date,
 *                                  line amount credited to the buyer's credit balance)
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function round2(n: number) { return Math.round(n * 100) / 100; }

async function loadOrder(orderId: string) {
  return db.order.findUnique({ where: { id: orderId }, include: { items: { orderBy: { id: "asc" } } } });
}

function recomputeTotals(order: NonNullable<Awaited<ReturnType<typeof loadOrder>>>, lines: { total: number; pieces: number; qty: number; unitType: string }[], gstEnabled: boolean) {
  const itemTotal = round2(lines.reduce((s, l) => s + l.total, 0));
  let slabPct = 0;
  if (itemTotal >= 100000) slabPct = 10; else if (itemTotal >= 50000) slabPct = 7;
  else if (itemTotal >= 25000) slabPct = 4; else if (itemTotal >= 5000) slabPct = 2;
  // recompute slab on the new total, keep the coupon share (difference vs original slab) as-is
  const originalSlabPct = (() => {
    const it = order.itemTotal;
    if (it >= 100000) return 10; if (it >= 50000) return 7; if (it >= 25000) return 4; if (it >= 5000) return 2; return 0;
  })();
  const couponShare = round2(Math.max(0, order.discount - round2(order.itemTotal * originalSlabPct / 100)));
  const discount = round2(Math.min(itemTotal, round2(itemTotal * slabPct / 100) + couponShare));
  const taxableBase = round2(itemTotal - discount);
  const gstAmount = gstEnabled ? round2(taxableBase * 0.18) : 0;
  const deliveryFee = itemTotal >= 5000 ? 0 : 250;
  const grandTotal = round2(taxableBase + gstAmount + deliveryFee);
  const totalPieces = lines.reduce((s, l) => s + l.pieces, 0);
  const totalCases = lines.reduce((s, l) => s + (l.unitType === "BULK" ? l.qty : 0), 0);
  return { itemTotal, discount, gstAmount, deliveryFee, grandTotal, totalUnits: Math.round(totalPieces), totalCases: Math.round(totalCases), slabPct };
}

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) return jsonError("Missing orderId");
  const order = await loadOrder(orderId);
  if (!order) return jsonError("Order not found", 404);

  const productIds = order.items.map((i) => i.productId);
  const [products, warehouses, wStocks] = await Promise.all([
    db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, stock: true, sku: true, name: true } }),
    db.warehouse.findMany({ where: { active: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }] }),
    db.warehouseStock.findMany({ where: { productId: { in: productIds } } }),
  ]);
  const pmap = new Map(products.map((p) => [p.id, p]));
  const wsMap = new Map<string, number>(); // `${productId}:${warehouseId}` -> qty
  for (const ws of wStocks) wsMap.set(`${ws.productId}:${ws.warehouseId}`, ws.qty);

  const lines = order.items.map((it) => {
    const p = pmap.get(it.productId);
    const available = p ? Math.max(0, Math.round(p.stock)) : 0;
    const ok = available >= it.pieces && it.pieces > 0;
    return {
      id: it.id, productId: it.productId, sku: it.sku, name: it.name, image: it.image,
      unitType: it.unitType, packQty: it.packQty, qty: it.qty, pieces: it.pieces,
      unitPrice: it.unitPrice, total: it.total, serialNo: it.serialNo, lineStatus: it.lineStatus,
      available, ok,
      perWarehouse: warehouses.map((w) => ({ warehouseId: w.id, name: w.name, qty: wsMap.get(`${it.productId}:${w.id}`) ?? 0 })),
    };
  });

  const oosLines = lines.filter((l) => !l.ok);
  return NextResponse.json({
    order: { id: order.id, invoiceNo: order.invoiceNo, status: order.status, confirmedAt: order.confirmedAt, nextDeliveryAt: order.nextDeliveryAt },
    lines,
    warehouses: warehouses.map((w) => ({ id: w.id, name: w.name, isDefault: w.isDefault })),
    summary: {
      okCount: lines.length - oosLines.length,
      oosCount: oosLines.length,
      oosAmount: round2(oosLines.reduce((s, l) => s + l.total, 0)),
      hasCustomerId: Boolean(order.customerId),
    },
  });
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    const body = await req.json();
    const action = String(body.action || "");
    if (!body.orderId) return jsonError("Missing orderId");

    if (action === "edit") {
      const order = await loadOrder(body.orderId);
      if (!order) return jsonError("Order not found", 404);
      const wasConfirmed = order.status === "CONFIRMED";
      if (order.status !== "PENDING" && !wasConfirmed) {
        return jsonError(`Orders can be edited while PENDING or CONFIRMED — this one is ${order.status}`);
      }

      const edits: Array<{ id: string; qty?: number; unitPrice?: number }> = Array.isArray(body.lines) ? body.lines : [];
      const removeIds: string[] = Array.isArray(body.removeItemIds) ? body.removeItemIds : [];

      // original line map (for stock & credit reconciliation on confirmed orders)
      const oldById = new Map(order.items.map((it) => [it.id, it]));

      let lines = order.items
        .filter((it) => !removeIds.includes(it.id))
        .map((it) => {
          const e = edits.find((x) => x.id === it.id);
          const qty = e?.qty !== undefined ? Math.max(0.01, Number(e.qty)) : it.qty;
          const unitPrice = e?.unitPrice !== undefined ? Math.max(0, Number(e.unitPrice)) : it.unitPrice;
          return { ...it, qty, unitPrice, pieces: round2(qty * it.packQty), total: round2(qty * unitPrice) };
        });
      if (!lines.length) return jsonError("Order must keep at least one line");

      // ── CONFIRMED orders: reconcile live stock + buyer credit automatically ──
      let creditedDelta = 0;
      let stockError = "";
      if (wasConfirmed) {
        const warehouses = await db.warehouse.findMany({ where: { active: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }], include: { stocks: true } });
        const productIds = new Set<string>([...lines.map((l) => l.productId), ...order.items.filter((it) => removeIds.includes(it.id)).map((it) => it.productId)]);
        const products = await db.product.findMany({ where: { id: { in: [...productIds] } }, select: { id: true, stock: true } });
        const pmap = new Map(products.map((p) => [p.id, p]));

        const decProduct: Array<{ productId: string; pieces: number }> = [];
        const incProduct: Array<{ productId: string; pieces: number }> = [];
        const decWarehouse: Array<{ wsId: string; qty: number }> = [];
        const incWarehouse: Array<{ wsId: string; qty: number }> = [];

        // restored / added pieces for shipped (OK) lines
        for (const l of lines) {
          const old = oldById.get(l.id);
          const shipped = old ? (old.lineStatus !== "NEXT_PLAN") : false;
          const delta = round2(l.pieces - (old?.pieces ?? 0));
          if (shipped && delta !== 0) {
            if (delta > 0) {
              const live = Math.max(0, Math.round(pmap.get(l.productId)?.stock ?? 0));
              if (live < delta) { stockError = `Not enough stock for ${l.name} — only ${live} left. Edit rejected, nothing saved.`; break; }
              decProduct.push({ productId: l.productId, pieces: delta });
              for (const w of warehouses) {
                const ws = w.stocks.find((s) => s.productId === l.productId);
                if (!ws || ws.qty <= 0) continue;
                const dec = Math.min(ws.qty, delta - decProduct.filter((d) => d.productId === l.productId).reduce((s, d) => s + d.pieces, 0));
                if (dec > 0) { decWarehouse.push({ wsId: ws.id, qty: Math.ceil(dec) }); }
              }
            } else {
              incProduct.push({ productId: l.productId, pieces: -delta });
              const defWs = warehouses.flatMap((w) => w.stocks).find((s) => s.productId === l.productId);
              if (defWs) incWarehouse.push({ wsId: defWs.id, qty: Math.ceil(-delta) });
            }
          }
          // next-plan lines move the buyer credit by the amount change
          if (!shipped && old) creditedDelta += l.total - old.total;
        }

        // removed lines: restore stock (OK) or claw back credit (NEXT_PLAN)
        if (!stockError) {
          for (const id of removeIds) {
            const old = oldById.get(id);
            if (!old) continue;
            if (old.lineStatus !== "NEXT_PLAN") {
              incProduct.push({ productId: old.productId, pieces: old.pieces });
              const defWs = warehouses.flatMap((w) => w.stocks).find((s) => s.productId === old.productId);
              if (defWs) incWarehouse.push({ wsId: defWs.id, qty: Math.ceil(old.pieces) });
            } else {
              creditedDelta -= old.total;
            }
          }

          for (const d of decProduct) await db.product.update({ where: { id: d.productId }, data: { stock: { decrement: d.pieces } } }).catch(() => {});
          for (const d of decWarehouse) await db.warehouseStock.update({ where: { id: d.wsId }, data: { qty: { decrement: d.qty } } }).catch(() => {});
          for (const i of incProduct) await db.product.update({ where: { id: i.productId }, data: { stock: { increment: i.pieces } } }).catch(() => {});
          for (const i of incWarehouse) await db.warehouseStock.update({ where: { id: i.wsId }, data: { qty: { increment: i.qty } } }).catch(() => {});
          if (order.customerId && Math.abs(creditedDelta) >= 0.01) {
            await db.customer.update({ where: { id: order.customerId }, data: { creditBalance: { increment: round2(creditedDelta) } } }).catch(() => {});
          }
        }
      }
      if (stockError) return jsonError(stockError, 400);

      // persist edited lines
      for (const l of lines) {
        await db.orderItem.update({
          where: { id: l.id },
          data: { qty: l.qty, unitPrice: l.unitPrice, pieces: l.pieces, total: l.total },
        });
      }
      if (removeIds.length) await db.orderItem.deleteMany({ where: { id: { in: removeIds }, orderId: order.id } });

      const gstSetting = await db.setting.findUnique({ where: { key: "gst_enabled" } });
      const gstEnabled = gstSetting?.value !== "off";
      const t = recomputeTotals(order, lines.map((l) => ({ total: l.total, pieces: l.pieces, qty: l.qty, unitType: l.unitType })), gstEnabled);
      const updated = await db.order.update({
        where: { id: order.id },
        data: {
          itemTotal: t.itemTotal, discount: t.discount, gstAmount: t.gstAmount,
          deliveryFee: t.deliveryFee, grandTotal: t.grandTotal,
          totalUnits: t.totalUnits, totalCases: t.totalCases,
          note: body.note !== undefined ? String(body.note || "") : order.note,
        },
        include: { items: { orderBy: { id: "asc" } } },
      });
      await db.activityLog.create({ data: { action: "UPDATE", entity: "order", entityId: order.id, detail: `Order ${order.invoiceNo} edited ${wasConfirmed ? "after confirm (stock & credits reconciled" + (creditedDelta ? ` ${creditedDelta >= 0 ? "+" : ""}₹${round2(creditedDelta)}` : "") + ")" : "before confirm"} — new total ₹${t.grandTotal}` } });
      return NextResponse.json({ ok: true, order: updated });
    }

    if (action === "confirm") {
      const order = await loadOrder(body.orderId);
      if (!order) return jsonError("Order not found", 404);
      if (order.status !== "PENDING") return jsonError("Order is already confirmed");

      const nextDeliveryDate = String(body.nextDeliveryDate || "").slice(0, 80);
      const productIds = order.items.map((i) => i.productId);
      const [products, warehouses] = await Promise.all([
        db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, stock: true } }),
        db.warehouse.findMany({ where: { active: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }], include: { stocks: { where: { productId: { in: productIds } } } } }),
      ]);
      const pmap = new Map(products.map((p) => [p.id, p]));

      const oos: Array<{ id: string; total: number; name: string }> = [];
      const shipNow: Array<{ id: string; pieces: number; productId: string; name: string }> = [];
      for (const it of order.items) {
        const p = pmap.get(it.productId);
        const available = p ? Math.max(0, Math.round(p.stock)) : 0;
        if (available >= it.pieces && it.pieces > 0) shipNow.push({ id: it.id, pieces: it.pieces, productId: it.productId, name: it.name });
        else oos.push({ id: it.id, total: it.total, name: it.name });
      }

      // serial numbers for every line — shipping lines first, then next-plan lines
      let serial = 1;
      const plannedNote = nextDeliveryDate ? `Next delivery ${nextDeliveryDate} — amount credited to your DMK Mart credit` : "Next delivery — amount credited to your DMK Mart credit";
      for (const l of shipNow) {
        await db.orderItem.update({ where: { id: l.id }, data: { serialNo: serial++, lineStatus: "OK", plannedNote: "" } });
      }
      for (const l of oos) {
        await db.orderItem.update({ where: { id: l.id }, data: { serialNo: serial++, lineStatus: "NEXT_PLAN", plannedNote } });
      }

      // decrement product stock + warehouse allocation (default warehouse first)
      for (const l of shipNow) {
        await db.product.update({ where: { id: l.productId }, data: { stock: { decrement: l.pieces } } }).catch(() => {});
        let remaining = l.pieces;
        for (const w of warehouses) {
          if (remaining <= 0) break;
          const ws = w.stocks.find((s) => s.productId === l.productId);
          if (!ws || ws.qty <= 0) continue;
          const dec = Math.min(ws.qty, Math.ceil(remaining));
          await db.warehouseStock.update({ where: { id: ws.id }, data: { qty: { decrement: dec } } }).catch(() => {});
          remaining -= dec;
        }
      }

      // credit out-of-stock amounts to the buyer's credit balance
      const oosAmount = round2(oos.reduce((s, l) => s + l.total, 0));
      let credited = 0;
      if (oos.length && order.customerId && oosAmount > 0) {
        await db.customer.update({ where: { id: order.customerId }, data: { creditBalance: { increment: oosAmount } } }).catch(() => {});
        credited = oosAmount;
      }

      const updated = await db.order.update({
        where: { id: order.id },
        data: {
          status: "CONFIRMED", confirmedAt: new Date(), confirmedBy: "Super Admin",
          nextDeliveryAt: oos.length ? nextDeliveryDate : "",
        },
        include: { items: { orderBy: { serialNo: "asc" } } },
      });
      await db.activityLog.create({
        data: { action: "CONFIRM", entity: "order", entityId: order.id, detail: `Order ${order.invoiceNo} confirmed — ${shipNow.length} lines ship now, ${oos.length} → next delivery${credited ? ` (₹${credited} credited)` : ""}` },
      });
      return NextResponse.json({ ok: true, order: updated, summary: { shipNow: shipNow.length, nextPlan: oos.length, oosNames: oos.map((o) => o.name), credited, nextDeliveryDate } });
    }

    if (action === "plan-next") {
      // create a "next delivery plan" entry — ActivityLog based list the admin can review
      const order = await loadOrder(body.orderId);
      if (!order) return jsonError("Order not found", 404);
      const oosItems = order.items.filter((i) => i.lineStatus === "NEXT_PLAN");
      await db.activityLog.create({
        data: { action: "NEXT_PLAN", entity: "order", entityId: order.id, detail: `Next delivery plan for ${order.invoiceNo}: ${oosItems.map((i) => `${i.name} ×${i.qty}`).join(", ") || "no OOS lines"} — for ${order.nextDeliveryAt || "unplanned"}` },
      });
      return NextResponse.json({ ok: true });
    }

    return jsonError("Unknown action — use edit | confirm | plan-next");
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Flow failed", 400);
  }
}
