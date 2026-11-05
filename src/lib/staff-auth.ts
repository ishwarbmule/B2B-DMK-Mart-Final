/**
 * Staff auth — login tokens for the two secondary portals:
 *   /salesteam → SalesPerson accounts (created by admin, `SLS:<id>.<ts>.<sig>` tokens)
 *   /warehouse → WarehouseManager accounts (created by admin, `WHM:<id>.<ts>.<sig>` tokens)
 * The Super Admin portal keeps its own token (lib/admin-auth.ts) and always passes.
 * Warehouse managers additionally carry a section-permission list chosen by admin.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { extractToken, verifyToken } from "@/lib/admin-auth";
import { MANAGER_SECTIONS } from "@/lib/manager-sections";

export { MANAGER_SECTIONS };

const SECRET = process.env.ADMIN_AUTH_SECRET || "dmk-mart-admin-hmac-secret-2026";

export function makeStaffToken(kind: "SLS" | "WHM", id: string): string {
  const ts = Date.now().toString();
  const sig = createHmac("sha256", SECRET).update(`${kind}:${id}:${ts}`).digest("hex").slice(0, 24);
  return `${kind}:${id}.${ts}.${sig}`;
}

/** Verify a staff token of the given kind; returns the account id or null. */
export function verifyStaffToken(kind: "SLS" | "WHM", token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [prefixId, ts, sig] = parts;
  if (!prefixId.startsWith(`${kind}:`) || !ts || !sig) return null;
  const id = prefixId.slice(kind.length + 1);
  if (!id) return null;
  const expected = createHmac("sha256", SECRET).update(`${kind}:${id}:${ts}`).digest("hex").slice(0, 24);
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return id;
}

type StaffCheck =
  | { role: "admin" }
  | { role: "manager"; managerId: string; warehouseId: string; permissions: string[] }
  | { role: "salesperson"; salesPersonId: string; name: string }
  | null;

/** Resolve the caller's staff identity: Super Admin token → admin; manager token → manager (+permissions). */
export async function staffIdentity(req: Request): Promise<StaffCheck> {
  const token = extractToken(req.headers.get("authorization")) ?? req.headers.get("x-admin-token");
  if (verifyToken(token)) return { role: "admin" };

  const mgrId = verifyStaffToken("WHM", token);
  if (mgrId) {
    const mgr = await db.warehouseManager.findUnique({ where: { id: mgrId } });
    if (mgr && mgr.active) {
      let permissions: string[] = [];
      try { permissions = JSON.parse(mgr.permissions || "[]") as string[]; } catch { permissions = []; }
      return { role: "manager", managerId: mgr.id, warehouseId: mgr.warehouseId, permissions };
    }
  }

  const spId = verifyStaffToken("SLS", token);
  if (spId) {
    const sp = await db.salesPerson.findUnique({ where: { id: spId } });
    if (sp && sp.active) return { role: "salesperson", salesPersonId: sp.id, name: sp.name };
  }
  return null;
}

/**
 * Guard an admin API for staff access: Super Admin always passes; a warehouse manager
 * passes only when `section` is in their permission list. Returns a 401/403 Response or null.
 */
export async function requireStaff(req: Request, section: string | string[]): Promise<Response | null> {
  const identity = await staffIdentity(req);
  if (!identity) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  if (identity.role === "admin") return null;
  if (identity.role !== "manager") {
    return new Response(JSON.stringify({ error: "Not available for this account" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  const wanted = Array.isArray(section) ? section : [section];
  const ok = wanted.some((s) => identity.permissions.includes(s));
  if (!ok) {
    return new Response(JSON.stringify({ error: "This section is not enabled for your account" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}
