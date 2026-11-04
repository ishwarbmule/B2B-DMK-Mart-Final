/** Create the two location warehouses (Kolhar + Pune) with Kolhar as default. */
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

  const list = await api("/api/admin/crud/warehouses");
  const rows = list.body?.rows ?? [];
  console.log("existing:", rows.map((w: { name: string; id: string }) => `${w.name}(${w.id})`).join(", "));

  const kolhar = rows.find((w: { name: string }) => /kolhar/i.test(w.name));
  const pune = rows.find((w: { name: string }) => /pune/i.test(w.name));

  let kolharId = kolhar?.id;
  if (!kolharId) {
    const r = await api("/api/admin/crud/warehouses", {
      method: "POST",
      body: JSON.stringify({
        name: "Kolhar Warehouse", code: "WH-KOL",
        address: "DMK Mart, Kolhar, Ahmednagar, Maharashtra", city: "Kolhar",
        phone: "", isDefault: true, active: true, sortOrder: 5,
      }),
    });
    kolharId = r.body?.row?.id;
    console.log("created Kolhar:", kolharId, JSON.stringify(r.body).slice(0, 160));
  }
  if (!pune) {
    const r = await api("/api/admin/crud/warehouses", {
      method: "POST",
      body: JSON.stringify({
        name: "Pune Warehouse", code: "WH-PUNE",
        address: "DMK Mart Godown, Pune, Maharashtra", city: "Pune",
        phone: "", isDefault: false, active: true, sortOrder: 10,
      }),
    });
    console.log("created Pune:", r.body?.row?.id, JSON.stringify(r.body).slice(0, 160));
  } else if (pune.isDefault) {
    // Kolhar becomes the default (home base); Pune stays a normal location
    const r = await api("/api/admin/crud/warehouses", { method: "PATCH", body: JSON.stringify({ id: pune.id, isDefault: false }) });
    console.log("Pune default flag updated:", r.status);
  }

  const after = await api("/api/admin/crud/warehouses");
  console.log("now:", (after.body?.rows ?? []).map((w: { name: string; isDefault: boolean; _count: { stocks: number } }) => `${w.name}${w.isDefault ? "*" : ""}[${w._count?.stocks ?? 0} skus]`).join(" | "));
}

main().catch((e) => { console.error(e); process.exit(1); });
