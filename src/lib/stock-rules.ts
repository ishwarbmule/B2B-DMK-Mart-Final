/**
 * Auto Ready-to-Dispatch rule (the owner's standing instruction):
 *
 *   stock ≥ 1  →  product is Ready to Dispatch (isTop ON)
 *   stock = 0  →  Ready to Dispatch OFF (moves to the Out-of-Stock sub-section)
 *
 * The rule runs ONLY on products whose stock actually changed — ERP stock pull,
 * ERP product pull, admin stock edits and Excel imports all route through
 * applyAutoDispatchBySkus(). Admin panels can still set isTop by hand: an
 * explicit isTop in the same request always wins over the rule.
 *
 * The automation is gated by the Setting "auto_ready_dispatch" (default ON) so
 * the owner can pause it from Product Management without a deploy.
 *
 * isTop drives every "Ready to Dispatch" surface on the site (home grid,
 * catalog flag=top, product page chip, brand storefront section).
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";

export const AUTO_DISPATCH_KEY = "auto_ready_dispatch";

/** ON unless the owner explicitly turned it off. */
export async function autoDispatchEnabled(): Promise<boolean> {
  return (await getSetting(AUTO_DISPATCH_KEY, "1")) !== "0";
}

/**
 * Apply the rule to the given SKUs in ONE bulk statement (the 504 lesson —
 * never per-row updateMany on a 2k+ catalog). Only these SKUs are touched, so
 * products whose stock did not change keep any manual flag the owner set.
 * Returns the number of products updated.
 */
export async function applyAutoDispatchBySkus(skus: string[]): Promise<number> {
  if (!skus.length) return 0;
  if (!(await autoDispatchEnabled())) return 0;
  const unique = [...new Set(skus.filter(Boolean))];
  if (!unique.length) return 0;
  const values = Prisma.join(unique.map((sku) => Prisma.sql`(${sku})`));
  return db.$executeRaw(
    Prisma.sql`UPDATE "Product" p SET "isTop" = (p."stock" >= 1) FROM (VALUES ${values}) AS v(sku) WHERE p."sku" = v.sku`,
  );
}

/** Same rule for a product id list (admin flows resolve ids, not SKUs). */
export async function applyAutoDispatchByIds(ids: string[], stockById: Map<string, number>): Promise<void> {
  for (const id of ids) {
    const stock = stockById.get(id);
    if (stock === undefined) continue;
    await db.product.update({ where: { id }, data: { isTop: stock >= 1 } }).catch(() => {});
  }
}
