/**
 * /api/admin/orders-flow — admin order pipeline:
 *   GET  ?orderId=...            → auto stock-check per line (pieces needed vs available) + per-warehouse view
 *   POST { action: "verify" }    → WAREHOUSE MANAGER verification (N4): the serving godown's manager marks
 *                                  each line available / not-available from THEIR warehouse BEFORE the
 *                                  Super Admin confirms — stamps Order.verifiedAt/verifiedBy
 *   POST { action: "edit", ... } → admin edits order lines (qty / unit price / remove lines) + recompute totals
 *                                  (tracked: editedAt/editedBy — the customer is NOT told until send-updated)
 *   POST { action: "confirm" }   → confirm order: in-stock lines ship now (serials 1..n, stock + warehouse
 *                                  allocation decrement — the ORDER's godown first, then the rest),
 *                                  out-of-stock lines → NEXT_PLAN (next delivery date, line amount credited
 *                                  to the buyer's credit balance). Optional lines[] override lets admin
 *                                  ship/next-plan individual lines regardless of the auto stock check.
 *   POST { action: "plan-oos" }  → vendor-acquiring plan: mark lines (default: every out-of-stock line) as
 *                                  NEXT_PLAN with a vendor note; on CONFIRMED orders the stock is restored
 *                                  and the amount credited automatically
 *   POST { action: "send-updated" } → send the updated order list to the customer (WhatsApp/SMS/demo) and
 *                                  stamp customerNotifiedAt — until this fires the customer sees NO edit marker
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";
import { requireStaff, staffIdentity } from "@/lib/staff-auth";
import { notifyCustomer } from "@/lib/whatsapp";
import { locationPriceFor, piecePriceOf } from "@/lib/pricing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function round2(n: number) { return Math.round(n * 100) / 100; }
function num2(n: number) { return Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

/** Who is acting — for editedBy / confirmedBy stamps. */
async function actorName(req: NextRequest): Promise<string> {
  const identity = await staffIdentity(req);
  if (!identity) return "Super Admin";
  if (identity.role === "admin") return "Super Admin";
  if (identity.role === "manager") {
    const mgr = await db.warehouseManager.findUnique({ where: { id: identity.managerId }, select: { name: true } });
    return mgr?.name || "Warehouse Manager";
  }
  return identity.name;
}

async function loadOrder(orderId: string) {
  return db.order.findUnique({ where: { id: orderId }, include: { items: { orderBy: { id: "asc" } } } });
}

function recomputeTotals(order: NonNullable<Awaited<ReturnType<typeof loadOrder>>>, lines: { total: number; pieces: number; qty: number; unitType: string }[]) {
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
  const gstAmount = 0; // No GST — DMK Mart does not charge or provide GST.
  const deliveryFee = 250; // flat delivery charge — no free-delivery threshold
  const grandTotal = round2(taxableBase + gstAmount + deliveryFee);
  const totalPieces = lines.reduce((s, l) => s + l.pieces, 0);
  const totalCases = lines.reduce((s, l) => s + (l.unitType === "BULK" ? l.qty : 0), 0);
  return { itemTotal, discount, gstAmount, deliveryFee, grandTotal, totalUnits: Math.round(totalPieces), totalCases: Math.round(totalCases), slabPct };
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireStaff(req, "orders");
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
      plannedNote: it.plannedNote,
      available, ok,
      // qty sitting in the ORDER's own serving godown — the warehouse manager verifies against this
      atWarehouse: order.warehouseId ? (wsMap.get(`${it.productId}:${order.warehouseId}`) ?? 0) : (wsMap.get(`${it.productId}:${order.pickupWarehouseId}`) ?? 0),
      perWarehouse: warehouses.map((w) => ({ warehouseId: w.id, name: w.name, qty: wsMap.get(`${it.productId}:${w.id}`) ?? 0 })),
    };
  });

  const oosLines = lines.filter((l) => !l.ok);
  return NextResponse.json({
    order: {
      id: order.id, invoiceNo: order.invoiceNo, status: order.status,
      warehouseId: order.warehouseId, warehouseName: order.warehouseName,
      confirmedAt: order.confirmedAt, nextDeliveryAt: order.nextDeliveryAt,
      editedAt: order.editedAt, editedBy: order.editedBy,
      verifiedAt: order.verifiedAt, verifiedBy: order.verifiedBy,
      customerNotifiedAt: order.customerNotifiedAt,
    },
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
  const unauthorized = await requireStaff(req, "orders");
  if (unauthorized) return unauthorized;
  try {
    const body = await req.json();
    const action = String(body.action || "");
    if (!body.orderId) return jsonError("Missing orderId");

    if (action === "verify") {
      // WAREHOUSE-MANAGER VERIFICATION — the serving godown's manager walks the order
      // lines and marks what they can dispatch/pick up NOW and what is not available.
      // The result is advisory input for the Super Admin's confirm decision.
      const identity = await staffIdentity(req);
      const order = await loadOrder(body.orderId);
      if (!order) return jsonError("Order not found", 404);
      if (identity?.role === "manager") {
        const servingId = order.warehouseId || order.pickupWarehouseId;
        if (servingId && servingId !== identity.warehouseId) {
          return jsonError("This order belongs to a different warehouse", 403);
        }
      }
      if (order.status === "PENDING") {
        // first verification before admin confirm
      } else if (order.status === "CONFIRMED") {
        // re-verification loop (owner workflow): admin refilled material → manager
        // re-checks ONLY the planned (NEXT_PLAN) lines; shipped lines stay locked
      } else {
        return jsonError(`Orders can be verified while PENDING or CONFIRMED — this one is ${order.status}`);
      }
      const confirmedReverify = order.status === "CONFIRMED";

      const marks: Array<{ id: string; available: boolean }> = Array.isArray(body.lines) ? body.lines : [];
      const byId = new Map(order.items.map((it) => [it.id, it]));
      const note = String(body.note || "").slice(0, 200);
      let okCount = 0;
      let oosCount = 0;
      for (const m of marks) {
        const it = byId.get(String(m.id));
        if (!it) continue;
        // on a confirmed order the re-check is ADVISORY: planned lines keep their
        // NEXT_PLAN status (stock & credit still pending) — only the note changes;
        // the Super Admin decides with "Confirm planned lines" (confirm-planned)
        if (confirmedReverify) {
          if (it.lineStatus !== "NEXT_PLAN") continue;
          const lineNote = m.available
            ? "✓ Verified available after refill — ready for the next trip"
            : note ? `Still not available — ${note}` : "Still not available after refill";
          await db.orderItem.update({ where: { id: it.id }, data: { plannedNote: lineNote } }).catch(() => {});
          if (m.available) okCount++; else oosCount++;
          continue;
        }
        if (m.available) {
          okCount++;
          await db.orderItem.update({ where: { id: it.id }, data: { lineStatus: "OK", plannedNote: "" } }).catch(() => {});
        } else {
          oosCount++;
          const lineNote = note ? `${note} — marked by warehouse check` : "Not available at this warehouse — awaiting stock / next plan";
          await db.orderItem.update({ where: { id: it.id }, data: { lineStatus: "NEXT_PLAN", plannedNote: lineNote } }).catch(() => {});
        }
      }
      if (!okCount && !oosCount) {
        if (confirmedReverify) {
          // re-verify touched nothing — acceptable (all planned lines unchanged)
          const actor = await actorName(req);
          await db.order.update({ where: { id: order.id }, data: { verifiedAt: new Date(), verifiedBy: actor } });
          return NextResponse.json({ ok: true, order: await loadOrder(order.id), summary: { okCount: 0, oosCount: 0, reverified: true } });
        }
        return jsonError("No line marks received — tick at least one line");
      }

      const actor = await actorName(req);
      await db.order.update({
        where: { id: order.id },
        data: { verifiedAt: new Date(), verifiedBy: actor },
      });
      await db.activityLog.create({
        data: { action: "VERIFY", entity: "order", entityId: order.id, detail: `Warehouse verification by ${actor} for ${order.invoiceNo} — ${okCount} available, ${oosCount} not available${order.warehouseName ? ` at ${order.warehouseName}` : ""}` },
      });
      const updated = await loadOrder(order.id);
      return NextResponse.json({ ok: true, order: updated, summary: { okCount, oosCount } });
    }

    if (action === "edit") {
      const identity = await staffIdentity(req);
      const order = await loadOrder(body.orderId);
      if (!order) return jsonError("Order not found", 404);
      if (identity?.role === "manager") {
        const servingId = order.warehouseId || order.pickupWarehouseId;
        if (servingId && servingId !== identity.warehouseId) {
          return jsonError("This order belongs to a different warehouse", 403);
        }
      }
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

      const t = recomputeTotals(order, lines.map((l) => ({ total: l.total, pieces: l.pieces, qty: l.qty, unitType: l.unitType })));
      const actor = await actorName(req);
      const updated = await db.order.update({
        where: { id: order.id },
        data: {
          itemTotal: t.itemTotal, discount: t.discount, gstAmount: t.gstAmount,
          deliveryFee: t.deliveryFee, grandTotal: t.grandTotal,
          totalUnits: t.totalUnits, totalCases: t.totalCases,
          note: body.note !== undefined ? String(body.note || "") : order.note,
          // edit tracking — the customer is not notified until send-updated fires
          editedAt: new Date(),
          editedBy: actor,
        },
        include: { items: { orderBy: { id: "asc" } } },
      });
      await db.activityLog.create({ data: { action: "UPDATE", entity: "order", entityId: order.id, detail: `Order ${order.invoiceNo} edited ${wasConfirmed ? "after confirm (stock & credits reconciled" + (creditedDelta ? ` ${creditedDelta >= 0 ? "+" : ""}₹${round2(creditedDelta)}` : "") + ")" : "before confirm"} — new total ₹${t.grandTotal}` } });
      return NextResponse.json({ ok: true, order: updated });
    }

    if (action === "confirm") {
      const identity = await staffIdentity(req);
      const order = await loadOrder(body.orderId);
      if (!order) return jsonError("Order not found", 404);
      if (identity?.role === "manager") {
        const servingId = order.warehouseId || order.pickupWarehouseId;
        if (servingId && servingId !== identity.warehouseId) {
          return jsonError("This order belongs to a different warehouse", 403);
        }
      }
      if (order.status !== "PENDING") return jsonError("Order is already confirmed");

      const nextDeliveryDate = String(body.nextDeliveryDate || "").slice(0, 80);
      const productIds = order.items.map((i) => i.productId);
      const [products, warehouses] = await Promise.all([
        db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, stock: true } }),
        db.warehouse.findMany({ where: { active: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }], include: { stocks: { where: { productId: { in: productIds } } } } }),
      ]);
      const pmap = new Map(products.map((p) => [p.id, p]));

      // Admin per-line override ({ id, ship }) — when the dialog sends explicit
      // ship/next-plan choices they win over the auto stock check.
      const overrides = new Map<string, boolean>(
        (Array.isArray(body.lines) ? body.lines : [])
          .filter((l: { id?: unknown; ship?: unknown }) => l && typeof l.id === "string" && typeof l.ship === "boolean")
          .map((l: { id: string; ship: boolean }) => [l.id, l.ship]),
      );

      const oos: Array<{ id: string; total: number; name: string; plannedNote: string }> = [];
      const shipNow: Array<{ id: string; pieces: number; productId: string; name: string }> = [];
      for (const it of order.items) {
        const p = pmap.get(it.productId);
        const available = p ? Math.max(0, Math.round(p.stock)) : 0;
        const autoOk = available >= it.pieces && it.pieces > 0;
        const ship = overrides.get(it.id) ?? autoOk;
        if (ship && it.pieces > 0) shipNow.push({ id: it.id, pieces: it.pieces, productId: it.productId, name: it.name });
        else oos.push({ id: it.id, total: it.total, name: it.name, plannedNote: it.plannedNote });
      }

      // serial numbers for every line — shipping lines first, then next-plan lines
      let serial = 1;
      const plannedNote = nextDeliveryDate ? `Next delivery ${nextDeliveryDate} — amount credited to your DMK Mart credit` : "Next delivery — amount credited to your DMK Mart credit";
      for (const l of shipNow) {
        await db.orderItem.update({ where: { id: l.id }, data: { serialNo: serial++, lineStatus: "OK", plannedNote: "" } });
      }
      for (const l of oos) {
        // keep a vendor plan note the admin already wrote (plan-oos) — append the credit line only when blank
        const note = l.plannedNote ? l.plannedNote : plannedNote;
        await db.orderItem.update({ where: { id: l.id }, data: { serialNo: serial++, lineStatus: "NEXT_PLAN", plannedNote: note } });
      }

      // decrement product stock + warehouse allocation — THE ORDER'S OWN GODOWN FIRST
      // (the warehouse manager verified availability there), then every other godown
      const servingId = order.warehouseId || order.pickupWarehouseId;
      const orderedWhs = servingId
        ? [...warehouses].sort((a, b) => (a.id === servingId ? -1 : 0) - (b.id === servingId ? -1 : 0))
        : warehouses;
      for (const l of shipNow) {
        await db.product.update({ where: { id: l.productId }, data: { stock: { decrement: l.pieces } } }).catch(() => {});
        let remaining = l.pieces;
        for (const w of orderedWhs) {
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

      const actor = await actorName(req);
      const updated = await db.order.update({
        where: { id: order.id },
        data: {
          status: "CONFIRMED", confirmedAt: new Date(), confirmedBy: actor,
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

    if (action === "plan-oos") {
      // Vendor-acquiring plan — mark lines for the next trip / vendor purchase.
      // PENDING order  → tag the chosen lines NEXT_PLAN with the vendor note (confirm keeps it).
      // CONFIRMED order→ converting a shipped (OK) line restores stock + credits the buyer,
      //                  exactly like removing it would — totals stay consistent.
      const order = await loadOrder(body.orderId);
      if (!order) return jsonError("Order not found", 404);
      if (order.status !== "PENDING" && order.status !== "CONFIRMED") {
        return jsonError(`Planning works on PENDING or CONFIRMED orders — this one is ${order.status}`);
      }
      const note = String(body.note || "").slice(0, 200) || "To be acquired from vendor — planned for the next trip";
      const nextDeliveryDate = String(body.nextDeliveryDate || "").slice(0, 80);
      const lineIds: string[] = Array.isArray(body.lineIds) && body.lineIds.length
        ? body.lineIds.map(String)
        : []; // empty = every line that is NOT already planned
      const wasConfirmed = order.status === "CONFIRMED";

      const targets = order.items.filter((it) =>
        lineIds.length ? lineIds.includes(it.id) : it.lineStatus !== "NEXT_PLAN",
      );
      if (!targets.length) return jsonError("No lines to plan — the chosen lines are already on the next-trip plan");

      let creditedDelta = 0;
      if (wasConfirmed) {
        const warehouses = await db.warehouse.findMany({ where: { active: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }], include: { stocks: true } });
        for (const it of targets) {
          if (it.lineStatus === "NEXT_PLAN") { creditedDelta += 0; continue; }
          // shipped line → back to the shelves
          await db.product.update({ where: { id: it.productId }, data: { stock: { increment: it.pieces } } }).catch(() => {});
          const ws = warehouses.flatMap((w) => w.stocks).find((s) => s.productId === it.productId);
          if (ws) await db.warehouseStock.update({ where: { id: ws.id }, data: { qty: { increment: Math.ceil(it.pieces) } } }).catch(() => {});
          creditedDelta += it.total;
        }
        if (order.customerId && creditedDelta >= 0.01) {
          await db.customer.update({ where: { id: order.customerId }, data: { creditBalance: { increment: round2(creditedDelta) } } }).catch(() => {});
        }
      }

      for (const it of targets) {
        await db.orderItem.update({ where: { id: it.id }, data: { lineStatus: "NEXT_PLAN", plannedNote: note } });
      }
      if (nextDeliveryDate) {
        await db.order.update({ where: { id: order.id }, data: { nextDeliveryAt: nextDeliveryDate } }).catch(() => {});
      }
      const actor = await actorName(req);
      await db.activityLog.create({
        data: { action: "NEXT_PLAN", entity: "order", entityId: order.id, detail: `Vendor plan (${actor}) for ${order.invoiceNo}: ${targets.map((i) => `${i.name} ×${i.qty}`).join(", ")} — ${note}${creditedDelta ? ` · ₹${round2(creditedDelta)} credited` : ""}` },
      });
      const updated = await loadOrder(order.id);
      return NextResponse.json({ ok: true, order: updated, planned: targets.length, credited: round2(creditedDelta) });
    }

    if (action === "swap-product") {
      // ADMIN PRODUCT SWAP — replace an out-of-stock (or any) line's product with
      // another in-stock product, INTERNALLY: the customer is NOT notified (no
      // WhatsApp, no notification stamp) — the updated list only goes out if the
      // admin later presses "Send Updated List" on purpose. The replacement is
      // priced at the buyer's own slab (the tier the order was billed at) plus
      // their city override.
      const identity = await staffIdentity(req);
      if (identity?.role === "manager") return jsonError("Product swap is a Super Admin action", 403);
      const order = await loadOrder(body.orderId);
      if (!order) return jsonError("Order not found", 404);
      if (order.status !== "PENDING" && order.status !== "CONFIRMED") {
        return jsonError(`Swap works on PENDING or CONFIRMED orders — this one is ${order.status}`);
      }
      const line = order.items.find((i) => i.id === String(body.lineId || ""));
      if (!line) return jsonError("Order line not found", 404);
      const replacement = await db.product.findUnique({ where: { id: String(body.newProductId || "") } });
      if (!replacement) return jsonError("Replacement product not found", 404);

      // price the replacement for THIS buyer: order's slab tier + city override
      const loc = locationPriceFor(replacement.locationPrices, order.city);
      const tier = order.priceTier || "tier2";
      const unitPrice = Math.max(0, piecePriceOf(
        {
          tier1: replacement.tier1, tier2: replacement.tier2, tier3: replacement.tier3,
          tier4: replacement.tier4, tier5: replacement.tier5, dealerPrice: replacement.dealerPrice,
          packPrice: replacement.packPrice ?? 0, packQty: replacement.packQty, piecesPerBox: replacement.piecesPerBox,
          locPrice: loc,
        },
        tier,
      ));
      const qty = Number(body.qty) > 0 ? Number(body.qty) : line.qty;
      const newPieces = round2(qty * line.packQty);
      const newTotal = round2(qty * unitPrice);

      // CONFIRMED order reconciliation — old line state moves to the new product:
      //   shipped old line → restore its stock; planned old line → consume its credit;
      //   the replacement ALWAYS ships (that is the point of the swap) → decrement its stock.
      let creditedDelta = 0;
      if (order.status === "CONFIRMED") {
        const warehouses = await db.warehouse.findMany({
          where: { active: true },
          orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
          include: { stocks: { where: { productId: { in: [line.productId, replacement.id] } } } },
        });
        const servingId = order.warehouseId || order.pickupWarehouseId;
        const orderedWhs = servingId
          ? [...warehouses].sort((a, b) => (a.id === servingId ? -1 : 0) - (b.id === servingId ? -1 : 0))
          : warehouses;

        // live-stock guard for the replacement
        const live = Math.max(0, Math.round(replacement.stock));
        if (live < newPieces) {
          return jsonError(`Not enough stock for ${replacement.name} — only ${live} pcs left`, 400);
        }

        if (line.lineStatus !== "NEXT_PLAN") {
          // old shipped product goes back to the shelves
          await db.product.update({ where: { id: line.productId }, data: { stock: { increment: line.pieces } } }).catch(() => {});
          const oldWs = orderedWhs.flatMap((w) => w.stocks).find((s) => s.productId === line.productId);
          if (oldWs) await db.warehouseStock.update({ where: { id: oldWs.id }, data: { qty: { increment: Math.ceil(line.pieces) } } }).catch(() => {});
        } else if (order.customerId) {
          // the buyer was credited for this planned line — the swap consumes it
          creditedDelta -= line.total;
        }

        // replacement ships now: decrement its stock, order's godown first
        await db.product.update({ where: { id: replacement.id }, data: { stock: { decrement: newPieces } } }).catch(() => {});
        let remaining = newPieces;
        for (const w of orderedWhs) {
          if (remaining <= 0) break;
          const ws = w.stocks.find((s) => s.productId === replacement.id);
          if (!ws || ws.qty <= 0) continue;
          const dec = Math.min(ws.qty, Math.ceil(remaining));
          await db.warehouseStock.update({ where: { id: ws.id }, data: { qty: { decrement: dec } } }).catch(() => {});
          remaining -= dec;
        }
        if (order.customerId && Math.abs(creditedDelta) >= 0.01) {
          await db.customer.update({ where: { id: order.customerId }, data: { creditBalance: { increment: round2(creditedDelta) } } }).catch(() => {});
        }
      }

      await db.orderItem.update({
        where: { id: line.id },
        data: {
          productId: replacement.id, sku: replacement.sku, name: replacement.name,
          image: replacement.image, barcode: replacement.barcode, gst: replacement.gst, hsn: replacement.hsn,
          unitPrice, qty, pieces: newPieces, total: newTotal,
          // the replacement ships — plannedNote cleared, line becomes OK
          lineStatus: "OK", plannedNote: "",
        },
      });

      // recompute the order bill from the updated lines
      const refreshed = await loadOrder(order.id);
      const t = recomputeTotals(order, refreshed!.items.map((l) => ({ total: l.total, pieces: l.pieces, qty: l.qty, unitType: l.unitType })));
      await db.order.update({
        where: { id: order.id },
        data: { itemTotal: t.itemTotal, discount: t.discount, gstAmount: t.gstAmount, deliveryFee: t.deliveryFee, grandTotal: t.grandTotal, totalUnits: t.totalUnits, totalCases: t.totalCases },
      });
      await db.activityLog.create({
        data: { action: "UPDATE", entity: "order", entityId: order.id, detail: `Product swapped internally on ${order.invoiceNo}: "${line.name}" → "${replacement.name}" ×${qty} @ ₹${num2(unitPrice)} — customer not notified` },
      });
      const updated = await loadOrder(order.id);
      return NextResponse.json({ ok: true, order: updated, swapped: { from: line.name, to: replacement.name, unitPrice, total: newTotal } });
    }

    if (action === "confirm-planned") {
      // CONFIRM PLANNED LINES (next trip) — after the admin refilled material and the
      // warehouse manager re-verified, this ships the planned (NEXT_PLAN) lines:
      // serials continue, live stock decrements (order's godown first), the buyer
      // credit that was granted at confirm time is consumed. Admin-only.
      const identity = await staffIdentity(req);
      if (identity?.role === "manager") return jsonError("Confirming planned lines is a Super Admin action", 403);
      const order = await loadOrder(body.orderId);
      if (!order) return jsonError("Order not found", 404);
      if (order.status !== "CONFIRMED") return jsonError("Planned lines confirm on CONFIRMED orders — this one is " + order.status);
      const planned = order.items.filter((it) => it.lineStatus === "NEXT_PLAN");
      if (!planned.length) return jsonError("This order has no planned (next-trip) lines");

      const shipIds = new Set<string>((Array.isArray(body.lineIds) ? body.lineIds : []).map(String));
      const targets = shipIds.size ? planned.filter((it) => shipIds.has(it.id)) : planned;
      if (!targets.length) return jsonError("No planned lines selected");

      // live-stock guard for every target line
      const productIds = targets.map((t2) => t2.productId);
      const products = await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, stock: true } });
      const pmap = new Map(products.map((p) => [p.id, p]));
      for (const t2 of targets) {
        const live = Math.max(0, Math.round(pmap.get(t2.productId)?.stock ?? 0));
        if (live < t2.pieces) return jsonError(`Not enough stock for ${t2.name} — only ${live} pcs in stock. Refill the warehouse first.`, 400);
      }

      const warehouses = await db.warehouse.findMany({
        where: { active: true },
        orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
        include: { stocks: { where: { productId: { in: productIds } } } },
      });
      const servingId = order.warehouseId || order.pickupWarehouseId;
      const orderedWhs = servingId
        ? [...warehouses].sort((a, b) => (a.id === servingId ? -1 : 0) - (b.id === servingId ? -1 : 0))
        : warehouses;

      let serial = order.items.reduce((mx, it) => Math.max(mx, it.serialNo || 0), 0) + 1;
      let shippedAmount = 0;
      for (const t2 of targets) {
        await db.product.update({ where: { id: t2.productId }, data: { stock: { decrement: t2.pieces } } }).catch(() => {});
        let remaining = t2.pieces;
        for (const w of orderedWhs) {
          if (remaining <= 0) break;
          const ws = w.stocks.find((s) => s.productId === t2.productId);
          if (!ws || ws.qty <= 0) continue;
          const dec = Math.min(ws.qty, Math.ceil(remaining));
          await db.warehouseStock.update({ where: { id: ws.id }, data: { qty: { decrement: dec } } }).catch(() => {});
          remaining -= dec;
        }
        await db.orderItem.update({ where: { id: t2.id }, data: { serialNo: serial++, lineStatus: "OK", plannedNote: "" } });
        shippedAmount += t2.total;
      }

      // consume the credit that was granted for these lines when the order was confirmed
      if (order.customerId && shippedAmount > 0) {
        await db.customer.update({ where: { id: order.customerId }, data: { creditBalance: { decrement: round2(shippedAmount) } } }).catch(() => {});
      }

      const stillPlanned = planned.length - targets.length;
      const actor = await actorName(req);
      await db.activityLog.create({
        data: { action: "CONFIRM", entity: "order", entityId: order.id, detail: `Planned lines confirmed for next trip by ${actor} on ${order.invoiceNo} — ${targets.length} lines ship (₹${round2(shippedAmount)} credit consumed)${stillPlanned ? `, ${stillPlanned} still planned` : ""}` },
      });
      const updated = await loadOrder(order.id);
      return NextResponse.json({ ok: true, order: updated, summary: { shipped: targets.length, stillPlanned, creditConsumed: round2(shippedAmount) } });
    }

    if (action === "send-updated") {
      // Send the updated order list to the customer — until this fires, the
      // customer-facing order shows NO sign of admin edits (plain new values).
      const order = await loadOrder(body.orderId);
      if (!order) return jsonError("Order not found", 404);
      if (!order.phone) return jsonError("Order has no phone number to send to");

      const extraNote = String(body.message || "").slice(0, 300);
      const itemLines = order.items
        .slice()
        .sort((a, b) => (a.serialNo || 999) - (b.serialNo || 999))
        .map((it, i) => `${i + 1}. ${it.name} × ${it.qty} ${it.unitType === "PACK" ? `pack(${it.packQty})` : "pcs"} — ₹${num2(it.total)}${it.lineStatus === "NEXT_PLAN" ? " (next delivery)" : ""}`)
        .join("\n");
      const text = [
        `*DMK Mart — Updated Order ${order.invoiceNo}*`,
        `Hello ${order.customerName},`,
        extraNote ? `${extraNote}` : "Our team reviewed your order — here is the updated list:",
        "",
        itemLines,
        "",
        `Items: ₹${num2(order.itemTotal)}${order.discount ? ` · Discount: -₹${num2(order.discount)}` : ""}${order.deliveryFee ? ` · Delivery: ₹${num2(order.deliveryFee)}` : ""}`,
        `*Grand Total: ₹${num2(order.grandTotal)}*`,
        order.nextDeliveryAt ? `Next delivery for pending lines: ${order.nextDeliveryAt}` : "",
        "",
        "Thank you for ordering with DMK Mart!",
      ].filter(Boolean).join("\n");

      const wa = await notifyCustomer(order.phone, text);
      const updated = await db.order.update({
        where: { id: order.id },
        data: { customerNotifiedAt: new Date() },
        include: { items: { orderBy: { id: "asc" } } },
      });
      await db.activityLog.create({ data: { action: "UPDATE", entity: "order", entityId: order.id, detail: `Updated order list sent to ${order.phone} (${wa.channel}${wa.demo ? " · demo" : ""})` } });
      return NextResponse.json({ ok: true, order: updated, channel: wa.channel, demo: wa.demo, preview: text });
    }

    return jsonError("Unknown action — use verify | edit | confirm | plan-next | plan-oos | swap-product | confirm-planned | send-updated");
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Flow failed", 400);
  }
}
