/** E2E test: ads pipeline + SMS demo hooks. */
const BASE = "http://localhost:3000";
let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}${extra ? ` (${extra})` : ""}`);
  if (!cond) failures++;
};
const adminCall = async (path, init = {}) => {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

let token = "";

(async () => {
  // 0. admin login
  const login = await fetch(BASE + "/api/admin/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }),
  });
  token = login.data?.token ?? (await login.json())?.token;
  check("admin login", login.status === 200 && token);

  // 1. upload a test image (tiny 1x1 PNG)
  const pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const fd = new FormData();
  fd.append("file", new Blob([Buffer.from(pngB64, "base64")], { type: "image/png" }), "test-ad.png");
  const up = await fetch(BASE + "/api/admin/upload", { method: "POST", body: fd, headers: { authorization: `Bearer ${token}` } });
  const upD = await up.json().catch(() => ({}));
  check("cloudinary upload", up.status === 200 && String(upD.url || "").includes("res.cloudinary.com"), String(upD.url || upD.error || "").slice(0, 90));

  // 2. unauthorized upload rejected
  const up2 = await fetch(BASE + "/api/admin/upload", { method: "POST", body: fd });
  check("upload requires admin", up2.status === 401);

  // 3. create ad linked to a brand
  const brands = await adminCall("/api/admin/crud/brands");
  const brand = (brands.data.rows || [])[0];
  check("brands available for linking", Boolean(brand?.id), brand?.name);
  const created = await adminCall("/api/admin/crud/ads", {
    method: "POST",
    body: JSON.stringify({ title: "E2E Test Ad", image: upD.url, brandId: brand?.id ?? "", link: "#", sortOrder: 1, active: true }),
  });
  check("create ad", created.status === 200 && created.data.row?.id, created.data.row?.brand?.name || created.data.error);
  const adId = created.data.row?.id;

  // 4. catalog exposes ads with brand slug
  const cat = await fetch(BASE + "/api/catalog").then((r) => r.json());
  const catAd = (cat.ads || []).find((a) => a.id === adId);
  check("catalog returns ad with brand", Boolean(catAd?.image && catAd?.brand?.slug), catAd?.brand?.slug);

  // 5. update + delete ad
  const upd = await adminCall("/api/admin/crud/ads", { method: "PATCH", body: JSON.stringify({ id: adId, active: false }) });
  check("patch ad", upd.status === 200 && upd.data.row?.active === false);
  const del = await adminCall(`/api/admin/crud/ads?id=${adId}`, { method: "DELETE" });
  check("delete ad", del.status === 200);

  // 6. SMS demo hooks: order-status PATCH triggers [SMS:DEMO] log (gateway OFF)
  const orders = await adminCall("/api/admin/orders?page=1").catch(() => ({ data: { orders: [] } }));
  const order = (orders.data.orders || orders.data.rows || [])[0];
  if (order?.id) {
    const before = (await adminCall("/api/admin/orders?page=1")).data.orders?.find((o) => o.id === order.id);
    const prevStatus = before?.status ?? "PENDING";
    const nextStatus = prevStatus === "PENDING" ? "CONFIRMED" : prevStatus;
    const patch = await adminCall("/api/admin/orders", { method: "PATCH", body: JSON.stringify({ id: order.id, status: nextStatus }) });
    check("order status patch (with SMS hook)", patch.status === 200);
    // restore original status (also triggers a second SMS log — harmless demo)
    await adminCall("/api/admin/orders", { method: "PATCH", body: JSON.stringify({ id: order.id, status: prevStatus }) });
  } else {
    console.log("SKIP — no orders in DB for status test");
  }

  // 7. sms test endpoint (demo mode)
  const t = await adminCall("/api/admin/sms/test", { method: "POST", body: JSON.stringify({ phone: "9822011102" }) });
  check("sms test endpoint (demo)", t.status === 200 && t.data.demo === true && t.data.provider === "OFF");

  console.log(failures === 0 ? "\nALL ADS/SMS TESTS PASSED" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
