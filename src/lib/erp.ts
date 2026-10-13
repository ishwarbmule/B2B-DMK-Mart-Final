/**
 * ERP sync layer — Neon PostgreSQL is the ERP's production database.
 * STRICT RULE: this module NEVER writes to Neon. It only SELECTs.
 * Pushes TO the ERP happen when the ERP pulls from us / calls our webhook; writing to
 * Neon is gated behind an explicit future feature the owner will enable.
 */
import { Pool } from "pg";

let pool: Pool | null = null;

export function erpPool(): Pool | null {
  const dsn = process.env.NEON_DATABASE_URL;
  if (!dsn) return null;
  if (!pool) {
    pool = new Pool({ connectionString: dsn, max: 3, connectionTimeoutMillis: 20000, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

export type ErpProduct = {
  id: string; sku: string; name: string; category: string; brand: string; company: string;
  unit: string; hsnCode: string; gstRate: number; purchaseCost: number; packQty: number;
  packPrice: number; packDiscountPercent: number; tier1Distributor: number; tier2Wholesale: number;
  tier3SemiWholesale: number; tier4Retailer: number; tier5Mrp: number; stockQuantity: number;
  reservedQty: number; damagedStock: number; lowStockThreshold: number; weightGrams: number;
  piecesPerBox: number; barcode: string; photoUrl: string; isActive: boolean; updatedAt: string;
};

/** Pull the full product catalog from the ERP (read-only). */
export async function pullErpProducts(limit = 5000): Promise<ErpProduct[]> {
  const pool = erpPool();
  if (!pool) throw new Error("NEON_DATABASE_URL not configured");
  const { rows } = await pool.query(
    `SELECT id, sku, name, category, brand, company, unit, "hsnCode", "gstRate",
            "purchaseCost", "packQty", "packPrice", "packDiscountPercent",
            "tier1Distributor", "tier2Wholesale", "tier3SemiWholesale", "tier4Retailer", "tier5Mrp",
            "stockQuantity", "reservedQty", "damagedStock", "lowStockThreshold",
            "weightGrams", "piecesPerBox", barcode, "photoUrl", "isActive", "updatedAt"
     FROM "Product" ORDER BY sku LIMIT $1`,
    [limit]
  );
  return rows as unknown as ErpProduct[];
}

/** ERP portal registration info (read-only) — proves the handshake config. */
export async function pullErpPortal() {
  const pool = erpPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT name, kind, "baseUrl", "webhookUrl", status, "autoSync", "lastSyncAt", "lastSyncStatus", "lastSyncMessage"
     FROM "IntegrationPortal" WHERE kind = 'B2B_STORE' LIMIT 1`
  );
  return rows[0] ?? null;
}

// ───────── webhook payload normalization ─────────
export type NormalizedErpProduct = {
  erpId: string; sku: string; name: string; category: string; brand: string; company: string;
  unit: string; hsn: string; gst: number; purchaseCost: number; packQty: number; packPrice: number;
  packDiscountPct: number; tier1: number; tier2: number; tier3: number; tier4: number; tier5: number;
  stock: number; reserved: number; damaged: number; lowStockThreshold: number; weightGrams: number;
  piecesPerBox: number; barcode: string; image: string; active: boolean;
};

const num = (v: unknown, d = 0) => (v === null || v === undefined || v === "" ? d : Number(v) || d);
const str = (v: unknown, d = "") => (v === null || v === undefined ? d : String(v)).trim();

/** Accepts the ERP's product row shape (snake or camel, partial) and normalizes it. */
export function normalizeErpProduct(raw: Record<string, unknown>): NormalizedErpProduct | null {
  const sku = str(raw.sku ?? raw.SKU);
  const name = str(raw.name ?? raw.productName ?? raw.product_name);
  if (!sku || !name) return null;
  return {
    erpId: str(raw.id ?? raw.erpId),
    sku, name,
    category: str(raw.category, "General"),
    brand: str(raw.brand),
    company: str(raw.company),
    unit: str(raw.unit, "Pcs"),
    hsn: str(raw.hsnCode ?? raw.hsn),
    gst: num(raw.gstRate ?? raw.gst),
    purchaseCost: num(raw.purchaseCost),
    packQty: Math.max(1, Math.round(num(raw.packQty, 1))),
    packPrice: num(raw.packPrice),
    packDiscountPct: num(raw.packDiscountPercent ?? raw.packDiscountPct),
    tier1: num(raw.tier1Distributor ?? raw.tier1),
    tier2: num(raw.tier2Wholesale ?? raw.tier2),
    tier3: num(raw.tier3SemiWholesale ?? raw.tier3),
    tier4: num(raw.tier4Retailer ?? raw.tier4),
    tier5: num(raw.tier5Mrp ?? raw.tier5 ?? raw.mrp),
    stock: num(raw.stockQuantity ?? raw.stock),
    reserved: num(raw.reservedQty ?? raw.reserved),
    damaged: num(raw.damagedStock ?? raw.damaged),
    lowStockThreshold: Math.round(num(raw.lowStockThreshold, 10)),
    weightGrams: num(raw.weightGrams),
    piecesPerBox: Math.round(num(raw.piecesPerBox)),
    barcode: str(raw.barcode),
    image: str(raw.photoUrl ?? raw.image ?? raw.imageUrl),
    active: raw.isActive === undefined ? true : Boolean(raw.isActive),
  };
}
