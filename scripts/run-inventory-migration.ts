/** Drive the production inventory migration: Excel rows → /api/admin/sync/migrate-inventory. */
import * as fs from "fs";

const BASE = "https://b2b-dmk-mart.vercel.app";
const SECRET = fs.readFileSync("/home/z/my-project/.cron-secret", "utf8").trim();

type Row = Record<string, unknown>;

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(180_000),
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body as Record<string, unknown> };
}

async function main() {
  const mode = process.argv[2] || "universal";
  const force = process.argv.includes("--force");
  const excel = JSON.parse(fs.readFileSync("/home/z/my-project/scripts/excel-products.json", "utf8")) as { rows: Row[] };
  const rows = excel.rows;
  console.log(`rows: ${rows.length}, mode: ${mode}, force: ${force}`);

  if (mode === "universal" || mode === "all") {
    const allRenames: [string, string][] = [];
    const unmatchedRows: { sku: string; name: string }[] = [];
    const unmatchedCats = new Set<string>();
    const errors: string[] = [];
    let updated = 0, renamed = 0, created = 0, skipped = 0, start = 0, guard = 0, retry = 0;

    while (start < rows.length && guard++ < 120) {
      const r = await call(`/api/admin/sync/migrate-inventory?key=${SECRET}&chunk=80`, {
        method: "POST",
        body: JSON.stringify({ rows, start, mode: "universal", force: start === 0 ? force : false }),
      });
      if ((r.status === 504 || r.status === 502 || r.status === 500) && retry < 3) {
        retry++;
        console.warn(`  chunk @${start} got ${r.status} — retry ${retry}/3 after 5s`);
        await new Promise((res) => setTimeout(res, 5000));
        continue;
      }
      if (r.status !== 200 || !r.body.ok) {
        console.error("CHUNK FAILED", r.status, JSON.stringify(r.body).slice(0, 400));
        process.exit(1);
      }
      retry = 0;
      updated += Number(r.body.updated ?? 0);
      renamed += Number(r.body.renamed ?? 0);
      created += Number(r.body.created ?? 0);
      skipped += Number(r.body.skipped ?? 0);
      for (const pair of (r.body.renames as [string, string][]) ?? []) allRenames.push(pair);
      for (const u of (r.body.unmatchedRows as { sku: string; name: string }[]) ?? []) unmatchedRows.push(u);
      for (const c of (r.body.unmatchedCategories as string[]) ?? []) unmatchedCats.add(c);
      for (const e of (r.body.errors as string[]) ?? []) errors.push(e);
      const next = Number(r.body.nextStart ?? 0);
      console.log(`  chunk ${start}→${next}: updated=${r.body.updated} renamed=${r.body.renamed} created=${r.body.created} skipped=${r.body.skipped}`);
      start = next;
      if (r.body.done) break;
    }

    console.log("\n════ UNIVERSAL MIGRATION RESULT ════");
    console.log(`updated: ${updated} (of which SKU-renumbered: ${renamed})`);
    console.log(`created: ${created}`);
    console.log(`skipped: ${skipped}`);
    console.log(`errors: ${errors.length}`, errors.slice(0, 10));
    console.log(`unmatched categories (${unmatchedCats.size}):`, [...unmatchedCats].slice(0, 20));
    console.log(`created-row list (${unmatchedRows.length}):`, unmatchedRows.slice(0, 30));
    fs.writeFileSync("/home/z/my-project/scripts/migration-renames.json", JSON.stringify(allRenames));
    console.log(`renames saved: ${allRenames.length} -> scripts/migration-renames.json`);

    if (mode === "all") {
      const e = await call(`/api/admin/sync/migrate-inventory?key=${SECRET}`, {
        method: "POST",
        body: JSON.stringify({ rows, mode: "erp", renames: allRenames }),
      });
      console.log("\n════ ERP ALIGNMENT RESULT ════");
      console.log(JSON.stringify(e.body, null, 2).slice(0, 3000));
    }
  } else if (mode === "erp") {
    const renames = JSON.parse(fs.readFileSync("/home/z/my-project/scripts/migration-renames.json", "utf8")) as [string, string][];
    console.log(`renames loaded: ${renames.length}`);
    const e = await call(`/api/admin/sync/migrate-inventory?key=${SECRET}`, {
      method: "POST",
      body: JSON.stringify({ rows, mode: "erp", renames }),
    });
    console.log(JSON.stringify(e.body, null, 2).slice(0, 3000));
  }
}

main().catch((e) => { console.error("DRIVER FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
