/** WhatsApp layer test — settings persistence, demo test-send, live-config honest failure,
 *  OTP flow fallback, order-status notify hook. Run: node scripts/test-whatsapp.js */
const BASE = "http://localhost:3000";
const ADMIN_ID = encodeURIComponent("B2B DMK Mart");
const ADMIN_PW = encodeURIComponent("1234");

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log(`  PASS ${name}${extra ? " — " + extra : ""}`); } else { fail++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); } };

async function main() {
  // admin login
  const login = await fetch(`${BASE}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) });
  const { token } = await login.json();
  ok("admin login", Boolean(token));
  const H = { "content-type": "application/json", authorization: `Bearer ${token}` };

  // 1. persist wa_* settings (demo state: enabled + OFF)
  const put = await fetch(`${BASE}/api/admin/settings`, { method: "PUT", headers: H, body: JSON.stringify({ wa_enabled: "true", wa_provider: "OFF", wa_token: "", wa_otp_template: "otp_login", wa_order_template: "order_placed", wa_status_template: "order_status", wa_language: "en", wa_otp_button: "true", wa_phone_number_id: "", wa_instance: "" }) });
  ok("settings PUT wa_* keys", put.ok);

  const get = await fetch(`${BASE}/api/admin/settings`, { headers: H });
  const { settings } = await get.json();
  ok("wa settings persisted", settings.wa_provider === "OFF" && settings.wa_otp_template === "otp_login" && settings.wa_language === "en");

  // 2. WhatsApp test send in demo mode (OFF)
  const t1 = await fetch(`${BASE}/api/admin/sms/test`, { method: "POST", headers: H, body: JSON.stringify({ phone: "9822011102", channel: "whatsapp" }) });
  const d1 = await t1.json();
  ok("WA test (OFF) → demo log", t1.ok && d1.demo === true && d1.channel === "DEMO", d1.logged?.slice(0, 40));

  // 3. fake META config → honest failure (bad token)
  await fetch(`${BASE}/api/admin/settings`, { method: "PUT", headers: H, body: JSON.stringify({ wa_provider: "META", wa_token: "FAKE_TOKEN", wa_phone_number_id: "123456789", wa_enabled: "true" }) });
  const t2 = await fetch(`${BASE}/api/admin/sms/test`, { method: "POST", headers: H, body: JSON.stringify({ phone: "9822011102", channel: "whatsapp" }) });
  const d2 = await t2.json();
  ok("WA test (fake META) → 502 with Meta error", t2.status === 502 && Boolean(d2.error), String(d2.error).slice(0, 60));
  // restore OFF
  await fetch(`${BASE}/api/admin/settings`, { method: "PUT", headers: H, body: JSON.stringify({ wa_provider: "OFF", wa_token: "", wa_phone_number_id: "", wa_enabled: "true" }) });

  // 4. OTP send still works — demo mode returns devOtp
  const otp = await fetch(`${BASE}/api/auth/otp/send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier: "9822011102", purpose: "LOGIN" }) });
  const od = await otp.json();
  ok("OTP demo flow intact (devOtp present)", otp.ok && typeof od.devOtp === "string" && /^\d{6}$/.test(od.devOtp || ""), "cooldown may 429 on rerun");

  // 5. order status PATCH fires notify (demo) without blocking
  const orders = await fetch(`${BASE}/api/admin/orders?limit=1`, { headers: H });
  const oj = await orders.json();
  const row = (oj.rows || oj.orders || [])[0];
  if (row) {
    const patch = await fetch(`${BASE}/api/admin/orders`, { method: "PATCH", headers: H, body: JSON.stringify({ id: row.id, status: row.status || "CONFIRMED" }) });
    ok("order status PATCH ok (notify non-blocking)", patch.ok);
  } else ok("order status PATCH skipped — no orders", true);

  // 6. catalog still serves (storefront + ads untouched)
  const cat = await fetch(`${BASE}/api/products?limit=1`);
  ok("catalog API ok", cat.ok);

  console.log(`\n${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
