const BASE = "https://b2b-dmk-mart.vercel.app";
const login = await fetch(BASE + "/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) }).then(r => r.json());
const H = { authorization: `Bearer ${login.token}` };
const orders = await fetch(BASE + "/api/admin/orders?page=1&limit=5", { headers: H }).then(r => r.json());
const o = (orders.rows ?? [])[0];
console.log(JSON.stringify({ token: login.token, orderId: o?.id, invoice: o?.invoiceNo, status: o?.status }));
