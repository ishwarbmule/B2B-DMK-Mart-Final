/** E2E test of the Amazon/Flipkart-style auth flows against the dev server. */
const BASE = "http://localhost:3000";
let failures = 0;

const post = async (path, body) => {
  const res = await fetch(BASE + path, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
  if (!cond) failures++;
};

(async () => {
  const PHONE = "9822011102";
  const EMAIL_ACC = "web@dmkmart.in"; // may not exist; only used if found

  // 1. identify — phone
  let r = await post("/api/auth/identify", { identifier: PHONE });
  check("identify by phone finds demo account", r.status === 200 && r.data.found && r.data.hasPassword, JSON.stringify(r.data).slice(0, 120));

  // 2. identify — bad input
  r = await post("/api/auth/identify", { identifier: "123" });
  check("identify rejects invalid input", r.status === 400);

  // 3. identify — unknown
  r = await post("/api/auth/identify", { identifier: "9111111111" });
  check("identify 404 for unknown phone", r.status === 404 && r.data.found === false);

  // 4. login with phone + password
  r = await post("/api/auth/login", { identifier: PHONE, password: "demo1234" });
  check("login by phone + password", r.status === 200 && r.data.token && r.data.customer.shopName === "Sai Distributors");

  // 5. login wrong password
  r = await post("/api/auth/login", { identifier: PHONE, password: "wrong" });
  check("login rejects wrong password", r.status === 401);

  // 6. login with +91 format
  r = await post("/api/auth/login", { identifier: "+91 98220 11102", password: "demo1234" });
  check("login tolerates +91/spaces", r.status === 200);

  // 7. OTP send (LOGIN)
  r = await post("/api/auth/otp/send", { identifier: PHONE, purpose: "LOGIN" });
  check("otp/send returns devOtp + masked", r.status === 200 && /^\d{6}$/.test(r.data.devOtp), r.data.masked);
  const otp = r.data.devOtp;

  // 8. resend cooldown
  r = await post("/api/auth/otp/send", { identifier: PHONE, purpose: "LOGIN" });
  check("otp/send enforces 45s cooldown", r.status === 429);

  // 9. wrong code
  r = await post("/api/auth/otp/verify", { identifier: PHONE, code: "000000", purpose: "LOGIN" });
  check("otp/verify rejects wrong code", r.status === 400);

  // 10. correct code → token
  r = await post("/api/auth/otp/verify", { identifier: PHONE, code: otp, purpose: "LOGIN" });
  check("otp/verify logs in with valid code", r.status === 200 && r.data.token);

  // 11. consumed code cannot replay
  r = await post("/api/auth/otp/verify", { identifier: PHONE, code: otp, purpose: "LOGIN" });
  check("otp/verify blocks replay of consumed code", r.status === 400);

  // 12. forgot password: RESET OTP
  r = await post("/api/auth/otp/send", { identifier: PHONE, purpose: "RESET" });
  check("otp/send RESET purpose", r.status === 200 && r.data.devOtp);
  const resetOtp = r.data.devOtp;

  // 13. verify RESET → resetToken
  r = await post("/api/auth/otp/verify", { identifier: PHONE, code: resetOtp, purpose: "RESET" });
  check("otp/verify RESET grants resetToken", r.status === 200 && r.data.resetToken);
  const resetToken = r.data.resetToken;

  // 14. reset password
  r = await post("/api/auth/reset-password", { resetToken, password: "demo1234" });
  check("reset-password works (same password)", r.status === 200);

  // 15. bad reset token
  r = await post("/api/auth/reset-password", { resetToken: "x.y.z", password: "whatever" });
  check("reset-password rejects bad token", r.status === 401);

  // 16. register duplicate phone
  r = await post("/api/auth/register", {
    name: "Test Person", shopName: "Test Shop", phone: PHONE, password: "abcdef",
    customerType: "RETAILER",
  });
  check("register rejects duplicate phone", r.status === 409);

  // 17. me endpoint with token from step 4
  const login = await post("/api/auth/login", { identifier: PHONE, password: "demo1234" });
  const me = await fetch(BASE + "/api/auth/me", { headers: { "x-customer-token": login.data.token } });
  const meData = await me.json();
  check("auth/me works with new token", me.status === 200 && meData.customer?.id);

  console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
