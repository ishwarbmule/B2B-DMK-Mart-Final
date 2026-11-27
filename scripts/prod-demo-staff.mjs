/** Create demo staff logins: 1 salesperson + 1 warehouse manager (idempotent). */
const BASE = "https://b2b-dmk-mart.vercel.app";
const login = await fetch(BASE + "/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }) }).then(r => r.json());
const H = { "content-type": "application/json", authorization: `Bearer ${login.token}` };

// salesperson demo
const spList = (await fetch(BASE + "/api/admin/crud/salespersons", { headers: H }).then(r => r.json())).rows ?? [];
let sp = spList.find(x => x.username === "rahul" || x.mobile === "9000000001");
if (!sp) {
  const r = await fetch(BASE + "/api/admin/crud/salespersons", { method: "POST", headers: H, body: JSON.stringify({ name: "Rahul Patil (Demo)", mobile: "9000000001", username: "rahul", password: "rahul123", area: "Pune", email: "", historyAccess: true, active: true }) }).then(r => r.json());
  sp = r.row;
  console.log("salesperson created:", sp?.name, sp?.id);
} else console.log("salesperson exists:", sp.name);
// assign the Pune godown to the salesperson (admin picks the warehouse per salesperson)
const whList = (await fetch(BASE + "/api/admin/warehouses", { headers: H }).then(r => r.json())).warehouses ?? [];
const pune = whList.find(w => /pune/i.test(w.name)) || whList[0];
if (pune) {
  await fetch(BASE + "/api/admin/crud/salespersons", { method: "PATCH", headers: H, body: JSON.stringify({ id: sp.id, warehouseId: pune.id }) });
  console.log("salesperson warehouse assigned:", pune.name);
}
console.log("SALESPERSON LOGIN → username: rahul · password: rahul123");
// verify login
const sl = await fetch(BASE + "/api/salesteam/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "rahul", password: "rahul123" }) }).then(r => r.json());
console.log("salesperson login test:", sl.token ? "✓ token issued for " + sl.profile?.name + (sl.profile?.warehouse ? " → " + sl.profile.warehouse.name : " (no warehouse)") : "❌ " + JSON.stringify(sl).slice(0, 120));

// warehouse manager demo (Kolhar)
const whs = (await fetch(BASE + "/api/admin/warehouses", { headers: H }).then(r => r.json())).warehouses;
const kolhar = whs.find(w => /kolhar/i.test(w.name)) || whs[0];
const mgList = (await fetch(BASE + "/api/admin/managers", { headers: H }).then(r => r.json()));
const mgrs = Array.isArray(mgList) ? mgList : (mgList.managers ?? mgList.rows ?? []);
let mgr = mgrs.find(x => x.username === "kolharmgr");
if (!mgr) {
  const r = await fetch(BASE + "/api/admin/managers", { method: "POST", headers: H, body: JSON.stringify({ name: "Ganesh Manager (Demo)", username: "kolharmgr", password: "kolhar123", phone: "8983433664", warehouseId: kolhar.id, permissions: JSON.stringify(["dashboard", "orders", "warehouseStock", "products", "customers", "approvals"]), active: true }) }).then(r => r.json());
  mgr = r.manager ?? r.row ?? r;
  console.log("manager created:", mgr?.name ?? JSON.stringify(r).slice(0, 160));
} else console.log("manager exists:", mgr.name);
console.log("MANAGER LOGIN → username: kolharmgr · password: kolhar123 (godown: " + kolhar.name + ")");
const ml = await fetch(BASE + "/api/warehouse/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "kolharmgr", password: "kolhar123" }) }).then(r => r.json());
console.log("manager login test:", ml.token ? "✓ token issued for " + ml.profile?.name + " @ " + (ml.profile?.warehouse?.name ?? ml.warehouse?.name ?? "?") : "❌ " + JSON.stringify(ml).slice(0, 160));
