/** One-time: assign ALL active products to both warehouses (qty = live stock). */
const BASE = "https://b2b-dmk-mart.vercel.app";
const LOGIN_ID = process.env.ADMIN_LOGIN_ID || "B2B DMK Mart";
const PASSWORD = process.env.ADMIN_PASSWORD || "DmkMartB2B!2026";
let TOKEN = "";

async function api(p: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${p}`, {
    ...init, signal: AbortSignal.timeout(120_000),
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, ...(init?.headers || {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  const login = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: LOGIN_ID, password: PASSWORD }) });
  TOKEN = login.body?.token;
  if (!TOKEN) throw new Error("login failed");

  const wh = await api("/api/admin/crud/warehouses");
  for (const w of wh.body?.rows ?? []) {
    const r = await api("/api/admin/warehouse-stock", {
      method: "POST",
      body: JSON.stringify({ warehouseId: w.id, action: "bulkAdd", mode: "ALL", qty: "STOCK" }),
    });
    console.log(`${w.name}:`, JSON.stringify(r.body));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
