/**
 * E2E test of the location-aware catalog:
 * 1. pick/patch a test customer (city=Pune, pincode=411001) via admin API
 * 2. OTP-login as that customer (demo mode returns devOtp)
 * 3. GET /api/products with the customer token → expect buyerWarehouse + filtered totals
 * 4. compare with anonymous totals
 */
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

  // 1. test customer
  const custs = await api("/api/admin/crud/customers");
  const rows = custs.body?.rows ?? [];
  console.log("customers:", rows.length);
  const cust = rows.find((c: Record<string, unknown>) => c.status === "APPROVED") ?? rows[0];
  if (!cust) throw new Error("no customer found");
  const phone = String(cust.phone);
  console.log("test customer:", cust.shopName || cust.name, phone, "city:", cust.city, "status:", cust.status);
  await api("/api/admin/crud/customers", { method: "PATCH", body: JSON.stringify({ id: cust.id, city: "Pune", pincode: "411001" }) });

  // 2. OTP login
  const send = await fetch(`${BASE}/api/auth/otp/send`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: phone, purpose: "LOGIN" }),
  }).then((r) => r.json());
  console.log("otp send:", send.devOtp ? "devOtp ok" : JSON.stringify(send).slice(0, 120));
  if (!send.devOtp) throw new Error("no devOtp (gateway connected?)");
  const verify = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: phone, code: send.devOtp, purpose: "LOGIN" }),
  }).then((r) => r.json());
  const custToken = verify.token;
  if (!custToken) throw new Error(`verify failed: ${JSON.stringify(verify).slice(0, 200)}`);
  console.log("✓ customer logged in");

  // 3. location-aware products
  const mine = await fetch(`${BASE}/api/products?limit=8`, { headers: { "x-customer-token": custToken } }).then((r) => r.json());
  console.log("customer view: total =", mine.total, "| buyerWarehouse =", mine.buyerWarehouse);
  const anon = await fetch(`${BASE}/api/products?limit=8`).then((r) => r.json());
  console.log("anonymous view: total =", anon.total);

  // 4. warehouse-scoped direct check (Kolhar)
  const wh = await api("/api/admin/crud/warehouses");
  const kolhar = (wh.body?.rows ?? []).find((w: { name: string }) => /kolhar/i.test(w.name));
  const stock = await api(`/api/admin/warehouse-stock?warehouseId=${kolhar.id}&page=1`);
  console.log(`Kolhar stock rows: ${stock.body?.total} | units: ${stock.body?.warehouseTotal}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
