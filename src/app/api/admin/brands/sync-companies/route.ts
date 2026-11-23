/**
 * POST /api/admin/brands/sync-companies — one click "brands = companies from the
 * data source". Creates a Brand row for every Product.company that does not yet
 * have one (matched by exact name or an existing erpNames alias), so the brand
 * pages/logos surface covers the whole catalog. Never deletes or renames —
 * existing brands stay untouched; logos can then be picked/uploaded per brand.
 *   POST → { created, totalCompanies, brands: [{ name, created }] }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, jsonError } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function slugify(s: string): string {
  return s.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 70) || "brand";
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    // distinct companies across the live catalog
    const grouped = await db.product.groupBy({ by: ["company"], _count: { _all: true }, where: { active: true } });
    const companies = grouped
      .map((g) => (g.company || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    if (!companies.length) return jsonError("No companies found in the catalog yet — sync products first.", 400);

    const existing = await db.brand.findMany({ select: { name: true, slug: true, erpNames: true } });
    const byName = new Map(existing.map((b) => [b.name.toLowerCase(), b]));
    const byAlias = new Map<string, typeof existing[number]>();
    for (const b of existing) {
      try {
        for (const alias of JSON.parse(b.erpNames || "[]") as string[]) {
          const a = String(alias).trim().toLowerCase();
          if (a) byAlias.set(a, b);
        }
      } catch { /* malformed erpNames — ignore that row */ }
    }

    const created: { name: string }[] = [];
    let order = existing.length;
    for (const company of companies) {
      const key = company.toLowerCase();
      if (byName.has(key) || byAlias.has(key)) continue; // already covered (exact or alias)
      let slug = slugify(company);
      if (await db.brand.findUnique({ where: { slug }, select: { id: true } })) slug = `${slug}-${created.length + 1}`;
      await db.brand.create({
        data: {
          name: company,
          slug,
          erpNames: JSON.stringify([company]),
          sortOrder: ++order,
          active: true,
        },
      });
      created.push({ name: company });
    }

    await db.activityLog.create({
      data: { action: "CREATE", entity: "brand", detail: `Brand sync from companies — ${created.length} created of ${companies.length} companies`, user: "Super Admin" },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      created: created.length,
      totalCompanies: companies.length,
      brands: created,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message.slice(0, 300) : "Brand sync failed", 500);
  }
}
