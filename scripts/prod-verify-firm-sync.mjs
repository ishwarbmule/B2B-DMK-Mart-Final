/** Verify the firm-scope sync result on production Neon via admin APIs. */
const BASE = "https://b2b-dmk-mart.vercel.app";
const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 300); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 200)}`);
  return d;
};
const nf = (n) => Number(n || 0).toLocaleString("en-IN");

const login = await jf("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
const H = { authorization: `Bearer ${login.token}` };

// what does the admin products API expose? try a couple of shapes
let list = null;
for (const u of ["/api/admin/products?q=PAPPLAS0001", "/api/admin/products?search=PAPPLAS0001", "/api/admin/products?page=1&pageSize=5"]) {
  try { const d = await jf(u, { headers: H }); list = { url: u, d }; console.log(`products API ok: ${u}`); break; }
  catch (e) { console.log(`  ${u} → ${String(e).slice(0, 90)}`); }
}
if (list) {
  const d = list.d;
  const rows = d.products || d.items || d.rows || (Array.isArray(d) ? d : []);
  console.log("total field:", d.total ?? d.count ?? "?", "| sample:", JSON.stringify(rows[0] ?? null).slice(0, 300));
}
