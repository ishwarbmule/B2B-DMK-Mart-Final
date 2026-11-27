/**
 * A① — scrub the OLD phone number (+91 98220 12345) out of production DATA.
 * The code is already clean (all hardcodes use +91 93095 75173), but rows seeded
 * into Neon by older seed/legal scripts still carry the old number:
 *   Setting.support_phone / Setting.firm_phone · Page.blocks (contact-us, legal
 *   pages) · Store rows.
 * Idempotent: run any number of times — nothing to change → no writes.
 * Usage: node scripts/prod-phone-scrub.mjs
 */
const BASE = "https://b2b-dmk-mart.vercel.app";
const OLD = /(\+91[\s-]?)?98220[\s-]?12345/g;
const NEW = "+91 93095 75173";
const jf = async (url, opts = {}) => {
  const res = await fetch(BASE + url, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, cache: "no-store" });
  const t = await res.text();
  let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 300); }
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${typeof d === "string" ? d : JSON.stringify(d).slice(0, 300)}`);
  return d;
};

const login = await jf("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
const H = { authorization: `Bearer ${login.token}` };

// 1 · Settings — support_phone / firm_phone (and any other phone-ish setting)
{
  const { settings } = await jf("/api/admin/settings", { headers: H });
  const patch = {};
  for (const [k, v] of Object.entries(settings)) {
    if (typeof v === "string" && OLD.test(v)) { patch[k] = v.replace(OLD, NEW); console.log(`setting ${k}: → ${patch[k]}`); }
    OLD.lastIndex = 0;
  }
  if (Object.keys(patch).length) {
    await jf("/api/admin/settings", { method: "PATCH", headers: H, body: JSON.stringify(patch) });
    console.log(`✓ ${Object.keys(patch).length} setting(s) updated`);
  } else console.log("settings: clean");
}

// 2 · Pages — contact-us + legal pages JSON blocks
{
  const { rows } = await jf("/api/admin/crud/pages", { headers: H });
  let touched = 0;
  for (const p of rows) {
    const raw = JSON.stringify(p.blocks ?? "");
    if (!OLD.test(raw)) { OLD.lastIndex = 0; continue; }
    OLD.lastIndex = 0;
    const blocks = JSON.parse(raw).toString ? p.blocks : p.blocks; // keep structure
    const fixed = JSON.parse(raw.replace(OLD, NEW));
    await jf("/api/admin/crud/pages", { method: "PATCH", headers: H, body: JSON.stringify({ id: p.id, blocks: fixed }) });
    console.log(`page "${p.slug ?? p.title}" blocks updated`);
    touched++;
  }
  if (!touched) console.log("pages: clean");
}

// 3 · Stores — storefront phone rows
{
  const { rows } = await jf("/api/admin/crud/stores", { headers: H });
  let touched = 0;
  for (const s of rows) {
    const raw = JSON.stringify(s);
    if (!OLD.test(raw)) { OLD.lastIndex = 0; continue; }
    OLD.lastIndex = 0;
    const patch = {};
    for (const [k, v] of Object.entries(s)) {
      if (typeof v === "string" && OLD.test(v)) { patch[k] = v.replace(OLD, NEW); OLD.lastIndex = 0; }
    }
    await jf("/api/admin/crud/stores", { method: "PATCH", headers: H, body: JSON.stringify({ id: s.id, ...patch }) });
    console.log(`store "${s.name}": ${Object.keys(patch).join(", ")} updated`);
    touched++;
  }
  if (!touched) console.log("stores: clean");
}

// verify
{
  const { settings } = await jf("/api/admin/settings", { headers: H });
  const hits = Object.entries(settings).filter(([, v]) => OLD.test(String(v)));
  OLD.lastIndex = 0;
  console.log(hits.length ? `❌ still present in settings: ${hits.map(([k]) => k).join(", ")}` : "✓ verify pass — no old phone in settings");
}
console.log("phone scrub done");
