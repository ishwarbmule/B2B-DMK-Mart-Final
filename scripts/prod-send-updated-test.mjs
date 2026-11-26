const BASE = "https://b2b-dmk-mart.vercel.app";
const login = await fetch(BASE + "/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) }).then(r => r.json());
const H = { "content-type": "application/json", authorization: `Bearer ${login.token}` };
const r = await fetch(BASE + "/api/admin/orders-flow", { method: "POST", headers: H, body: JSON.stringify({ action: "send-updated", orderId: "cmwx98fcs0000l908ernnzu1g" }) });
const d = await r.json();
console.log("send-updated:", r.status, d.ok ? `channel=${d.channel} demo=${d.demo} notifiedAt=${d.order?.customerNotifiedAt ?? "?"} · preview starts: ${String(d.preview).split("\n")[0]}` : JSON.stringify(d).slice(0, 200));
// bogus ids must 404 (wiring healthy)
const r2 = await fetch(BASE + "/api/admin/orders-flow", { method: "POST", headers: H, body: JSON.stringify({ action: "plan-oos", orderId: "nonexistent" }) });
console.log("plan-oos bogus:", r2.status, r2.status === 404 ? "✓ route alive" : "?");
