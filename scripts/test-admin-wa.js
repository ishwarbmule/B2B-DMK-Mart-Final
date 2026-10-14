/** Admin WhatsApp buttons + waOptIn + homepage editor tests. Run: node scripts/test-admin-wa.js */
const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log(`  PASS ${name}${extra ? " — " + extra : ""}`); } else { fail++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); } };

async function main() {
  const login = await fetch(`${BASE}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
  const { token } = await login.json();
  ok("admin login", Boolean(token));
  const H = { "content-type": "application/json", authorization: `Bearer ${token}` };

  // 1. order preview per status
  const orders = await fetch(`${BASE}/api/admin/orders?limit=1`, { headers: H });
  const oj = await orders.json();
  const order = (oj.rows || [])[0];
  if (!order) { console.log("  (no orders — skipping order tests)"); }
  else {
    const prev = await fetch(`${BASE}/api/admin/whatsapp?action=order-preview&orderId=${order.id}&status=DISPATCHED`, { headers: H });
    const pd = await prev.json();
    ok("order-preview DISPATCHED", prev.ok && pd.message?.includes("ON THE WAY") && pd.message?.includes(order.invoiceNo), pd.message?.slice(0, 60));

    // 2. ORDER_STATUS send (gateway OFF → MANUAL + waUrl)
    const send = await fetch(`${BASE}/api/admin/whatsapp`, { method: "POST", headers: H, body: JSON.stringify({ action: "ORDER_STATUS", orderId: order.id, status: "DISPATCHED" }) });
    const sd = await send.json();
    ok("ORDER_STATUS → MANUAL + wa.me", send.ok && sd.mode === "MANUAL" && sd.waUrl?.startsWith("https://wa.me/91"), sd.waUrl?.slice(0, 55));

    // 3. unauthorized access blocked
    const un = await fetch(`${BASE}/api/admin/whatsapp?action=order-preview&orderId=${order.id}&status=PENDING`);
    ok("unauthorized WhatsApp API → 401", un.status === 401);
  }

  // 4. customer OTP end-to-end: generate via admin → verify via public auth flow
  const custs = await fetch(`${BASE}/api/admin/crud/customers`, { headers: H });
  const cj = await custs.json();
  const cust = (cj.rows || [])[0];
  if (!cust) console.log("  (no customers — skipping OTP tests)");
  else {
    const gen = await fetch(`${BASE}/api/admin/whatsapp`, { method: "POST", headers: H, body: JSON.stringify({ action: "CUSTOMER_OTP", customerId: cust.id, purpose: "RESET" }) });
    const gd = await gen.json();
    ok("CUSTOMER_OTP generates 6-digit code", gen.ok && /^\d{6}$/.test(gd.code || ""), `code ${gd.code}`);

    if (gd.code && cust.phone) {
      const digits = String(cust.phone).replace(/\D/g, "").slice(-10);
      const verify = await fetch(`${BASE}/api/auth/otp/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier: digits, code: gd.code, purpose: "RESET" }) });
      const vd = await verify.json();
      ok("generated OTP verifies via public auth (E2E)", verify.ok && Boolean(vd.resetToken));
    }

    // 5. custom message
    const cm = await fetch(`${BASE}/api/admin/whatsapp`, { method: "POST", headers: H, body: JSON.stringify({ action: "CUSTOM", phone: cust.phone, message: "Test custom WhatsApp from admin" }) });
    const cd = await cm.json();
    ok("CUSTOM message → MANUAL + wa.me", cm.ok && cd.mode === "MANUAL" && cd.waUrl?.includes("Test%20custom"));
  }

  // 6. waOptIn column live on orders (PATCH still works after schema change)
  if (order) {
    const patch = await fetch(`${BASE}/api/admin/orders`, { method: "PATCH", headers: H, body: JSON.stringify({ id: order.id, status: order.status || "PENDING" }) });
    ok("order PATCH works after waOptIn migration", patch.ok);
  }

  // 7. home_sections setting save + homepage render
  const cfg = JSON.stringify([{ id: "offerHero", visible: true }, { id: "howItWorks", visible: true, title: "Why DMK Mart" }, { id: "deptCards", visible: true }, { id: "brandStrip", visible: true }, { id: "couponStrip", visible: true }, { id: "dealsRail", visible: true }, { id: "tabbedShowcase", visible: true }, { id: "adsStrip", visible: true }, { id: "trustStrip", visible: true }]);
  const put = await fetch(`${BASE}/api/admin/settings`, { method: "PUT", headers: H, body: JSON.stringify({ home_sections: cfg }) });
  ok("home_sections saved", put.ok);
  const home = await fetch(`${BASE}/`);
  const html = await home.text();
  ok("homepage 200 with section config", home.ok);
  // restore default (all visible, default titles) so storefront stays standard
  await fetch(`${BASE}/api/admin/settings`, { method: "PUT", headers: H, body: JSON.stringify({ home_sections: JSON.stringify(["offerHero", "brandStrip", "couponStrip", "dealsRail", "tabbedShowcase", "adsStrip", "deptCards", "trustStrip", "howItWorks"].map((id) => ({ id, visible: true }))) }) });

  console.log(`\n${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
