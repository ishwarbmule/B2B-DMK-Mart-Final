/** Tallies ALL ERP WarehouseStock rows per godown (paginated read-only). */
const BASE = "https://b2b-dmk-mart.vercel.app";
const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 300); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${JSON.stringify(d).slice(0, 200)}`);
  return d;
};
const login = await jf("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
const H = { authorization: `Bearer ${login.token}` };

const tally = new Map(); // whId -> { rows, qty, positive }
let page = 1, total = null;
for (;;) {
  const d = await jf(`/api/admin/erp-direct/data?entity=stock&page=${page}`, { headers: H });
  total = d.total;
  for (const r of d.rows || []) {
    const t = tally.get(r.warehouseId) || { rows: 0, qty: 0, positive: 0 };
    t.rows++;
    t.qty += Number(r.quantity) || 0;
    if (Number(r.quantity) > 0) t.positive++;
    tally.set(r.warehouseId, t);
  }
  if (page * 50 >= total) break;
  page++;
}
console.log(`ERP WarehouseStock total=${total} (fetched ${[...tally.values()].reduce((a, t) => a + t.rows, 0)})`);
const NAMES = {
  cmudwqdr900o8lx4soq8vl561: "KOLHAR WARE HOUSE (WH-MAIN) — selected, non-GST",
  cmwi87vk9001a3noxycid64gg: "DMK MART PUNE (PDMKMAIN01) — selected, non-GST",
};
for (const [wh, t] of [...tally.entries()].sort((a, b) => b[1].rows - a[1].rows)) {
  console.log(`${NAMES[wh] || wh}: rows=${t.rows} qtySum=${t.qty} rowsWithQty>0=${t.positive}`);
}
