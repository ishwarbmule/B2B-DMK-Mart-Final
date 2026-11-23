/**
 * Production verification of the customer migration + location lock.
 *  1) login with demo password 1234 → mustChangePassword flag + APPROVED
 *  2) belt lock: Wagholi buyer → DMK MART PUNE · Supa buyer → KOLHAR WARE HOUSE
 *  3) escape hatch blocked: allWarehouses=1 does NOT widen a signed-in buyer
 *  4) guests unaffected (no warehouse filter unless asked)
 *  5) store map: all customers pinned
 */
const BASE = process.env.PROD_BASE || "https://b2b-dmk-mart.vercel.app";

async function j(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const d = await r.json().catch(() => ({}));
  return { status: r.status, d };
}

async function login(phone: string, password: string) {
  const { status, d } = await j(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: phone, password }),
  });
  return { status, d };
}

async function prodStats(token: string, extra = "") {
  const { status, d } = await j(`${BASE}/api/products?limit=100&page=1${extra}`, {
    headers: { "x-customer-token": token },
  });
  return { status, total: d.total as number, wh: d.buyerWarehouse as string | undefined };
}

async function main() {
  console.log("── 1) demo-password login ──");
  const wagholi = await login("9373865676", "1234"); // Mega Mart, Wagholi → PUNE belt
  console.log(`Wagholi buyer login: ${wagholi.status} status=${wagholi.d.customer?.status} mustChangePassword=${wagholi.d.customer?.mustChangePassword} city=${wagholi.d.customer?.city}`);
  const supa = await login("9561431313", "1234"); // New Maharashtra Tredars, Supa → KOLHAR belt
  console.log(`Supa buyer login:    ${supa.status} status=${supa.d.customer?.status} mustChangePassword=${supa.d.customer?.mustChangePassword} city=${supa.d.customer?.city}`);
  const shirdi = await login("8421241111", "1234"); // Akshay ji kadlag, Shirdi → KOLHAR belt
  console.log(`Shirdi buyer login:  ${shirdi.status} status=${shirdi.d.customer?.status} mustChangePassword=${shirdi.d.customer?.mustChangePassword} city=${shirdi.d.customer?.city}`);

  console.log("\n── 2) belt-locked catalog totals ──");
  const wt = wagholi.d.token as string;
  const st = supa.d.token as string;
  const shT = shirdi.d.token as string;
  const w = await prodStats(wt);
  console.log(`Wagholi buyer  → total=${w.total} warehouse=${w.wh}`);
  const s = await prodStats(st);
  console.log(`Supa buyer     → total=${s.total} warehouse=${s.wh}`);
  const sh = await prodStats(shT);
  console.log(`Shirdi buyer   → total=${sh.total} warehouse=${sh.wh}`);

  console.log("\n── 3) escape hatch blocked ──");
  const wAll = await prodStats(wt, "&allWarehouses=1");
  console.log(`Wagholi + allWarehouses=1 → total=${wAll.total} warehouse=${wAll.wh} (must equal plain lock)`);
  const wPick = await prodStats(wt, "&warehouseId=cmwoihb1m0004l807v4ggvzv3"); // Kolhar id
  console.log(`Wagholi + warehouseId=KOLHAR → total=${wPick.total} warehouse=${wPick.wh} (must equal plain lock)`);

  console.log("\n── 4) guests ──");
  const guest = await j(`${BASE}/api/products?limit=1`);
  console.log(`Guest catalog total=${guest.d.total} (unfiltered)`);
  const guestWh = await j(`${BASE}/api/products?limit=1&warehouseId=cmwoihb1m0004l807v4ggvzv3`);
  console.log(`Guest + warehouseId=KOLHAR total=${guestWh.d.total} (guest warehouse filter still works)`);

  console.log("\n── 5) store map pins ──");
  const admin = await j(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ loginId: "B2B DMK Mart", password: "1234" }),
  });
  const at = admin.d.token as string;
  const loc = await j(`${BASE}/api/admin/customers/locations`, { headers: { authorization: `Bearer ${at}` } });
  console.log(`map rows=${loc.d.rows?.length} pinned=${loc.d.stats?.pinned} approved=${loc.d.stats?.approved} pending=${loc.d.stats?.pending}`);
  const byCity = new Map<string, number>();
  for (const r of loc.d.rows ?? []) byCity.set((r as { city: string }).city, (byCity.get((r as { city: string }).city) ?? 0) + 1);
  console.log("cities:", JSON.stringify([...byCity.entries()].sort()));
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
