/** Post-prune deep verification: case-insensitive company sweep + remaining company census (dedupe-safe). */
const fs = require("fs");
const BASE = "https://b2b-dmk-mart.vercel.app";
const TOKEN_FILE = "/home/z/my-project/.golive-token";

async function api(path) {
  const token = fs.readFileSync(TOKEN_FILE, "utf8").trim();
  const res = await fetch(BASE + path, { headers: { "content-type": "application/json", authorization: `Bearer ${token}` } });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 400); }
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 300)}`);
  return d;
}

(async () => {
  // dedupe-safe full census
  const seen = new Map(); // id -> company
  let page = 1;
  for (;;) {
    const d = await api(`/api/admin/products?limit=100&page=${page}`);
    for (const r of d.rows || []) seen.set(r.id, { sku: r.sku, company: r.company || "", name: r.name });
    if (!d.total || seen.size >= d.total || !(d.rows || []).length) break;
    page++;
  }
  console.log("unique products:", seen.size);

  const GST_PATTERNS = [/^dmk traders$/i, /^hd poly.?plast$/i, /^plastic world$/i, /^steelking/i, /^jay yogeshwar/i];
  const byCompany = new Map();
  let gstHits = [];
  for (const p of seen.values()) {
    byCompany.set(p.company || "(blank)", (byCompany.get(p.company || "(blank)") || 0) + 1);
    if (GST_PATTERNS.some((re) => re.test(p.company || ""))) gstHits.push(p);
  }
  console.log("\ncompanies after prune (top 30):");
  for (const [c, n] of [...byCompany.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${c}: ${n}`);
  console.log(`\ncase-insensitive GST-firm company hits: ${gstHits.length}`);
  for (const h of gstHits.slice(0, 40)) console.log(`  ${h.sku} | ${h.company} | ${h.name.slice(0, 55)}`);

  // the earlier "HD Poly Plast" group specifically
  const hdp = [...seen.values()].filter((p) => /hd poly/i.test(p.company));
  console.log(`\n"HD Poly*" company products still present: ${hdp.length}`);
  const skus = hdp.map((p) => p.sku);
  console.log("SKUs:", JSON.stringify(skus.slice(0, 40)));
})().catch((e) => { console.error("VERIFY ERROR:", e.message); process.exit(1); });
