/** Clear bogus (0,0) pins created by the import (Number(null)→0 quirk), then re-check all pins. */
const BASE = "https://b2b-dmk-mart.vercel.app";
const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 300); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${d}`);
  return d;
};
const login = await jf("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
const H = { authorization: `Bearer ${login.token}`, "content-type": "application/json" };

const rows = (await jf("/api/admin/crud/customers", { headers: H })).rows ?? [];
const zeros = rows.filter(c => c.lat === 0 && c.lng === 0);
console.log("customers with 0,0 pin:", zeros.map(c => `${c.phone} ${c.name}`));
for (const c of zeros) {
  await jf("/api/admin/customers/locations", { method: "PUT", headers: H, body: JSON.stringify({ id: c.id, clear: true }) });
  console.log(`cleared bogus pin for ${c.phone} ${c.name}`);
}
const loc = await jf("/api/admin/customers/locations", { headers: H });
console.log(`store-map now → total:${loc.stats.total} pinned:${loc.stats.pinned} unpinned:${loc.stats.unpinned}`);
const demo = (await jf("/api/admin/crud/customers", { headers: H })).rows.find(c => c.phone === "7350608416");
console.log(`Demo 7350608416 → lat:${demo.lat} lng:${demo.lng} status:${demo.status}`);
