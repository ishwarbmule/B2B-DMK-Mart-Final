/** Production bootstrap for the admin ops suite: schema migration, default warehouse, cron secret, ERP tick. */
const BASE = "https://b2b-dmk-mart.vercel.app";
const TOKEN_FILE = "/home/z/my-project/.golive-token";
import * as fs from "fs";

async function api(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const token = fs.readFileSync(TOKEN_FILE, "utf8").trim();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(120_000),
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  let body: any = null;
  try { body = await res.json(); } catch { body = `<non-json ${res.status}>`; }
  return { status: res.status, body };
}

async function main() {
  const cmd = process.argv[2] || "all";

  if (cmd === "migrate" || cmd === "all") {
    const m = await api("/api/admin/sync/apply-order-schema", { method: "POST" });
    console.log("MIGRATE:", m.status, JSON.stringify(m.body).slice(0, 500));
  }

  if (cmd === "warehouse" || cmd === "all") {
    const list = await api("/api/admin/crud/warehouses");
    const existing = (list.body?.rows ?? []) as any[];
    if (existing.length === 0) {
      const c = await api("/api/admin/crud/warehouses", {
        method: "POST",
        body: JSON.stringify({ name: "Main Warehouse — Pune", code: "W1", city: "Pune", address: "Plot 14, MIDC Industrial Area, Solapur Road, Pune 411019", isDefault: true, active: true, sortOrder: 0 }),
      });
      console.log("WAREHOUSE CREATED:", c.status, c.body?.row?.id ?? JSON.stringify(c.body).slice(0, 200));
    } else {
      console.log("WAREHOUSES EXIST:", existing.map((w) => `${w.name}${w.isDefault ? " (default)" : ""}`).join(", "));
    }
  }

  if (cmd === "cron-secret" || cmd === "all") {
    const secret = `dmkcron-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    const s = await api("/api/admin/settings", { method: "POST", body: JSON.stringify({ cron_secret: secret, erp_auto_sync_minutes: "30" }) });
    console.log("CRON SECRET SAVE:", s.status, JSON.stringify(s.body).slice(0, 200));
    fs.writeFileSync("/home/z/my-project/.cron-secret", secret);
    console.log("SECRET:", secret);
    console.log(`CRON URL (for cron-job.org, every 15 min): ${BASE}/api/cron/erp-sync?key=${secret}`);
  }

  if (cmd === "tick" || cmd === "all") {
    const t = await api("/api/cron/erp-sync?force=1", { method: "POST" });
    console.log("ERP TICK:", t.status, JSON.stringify(t.body).slice(0, 400));
  }

  if (cmd === "verify" || cmd === "all") {
    const checks: Array<[string, () => Promise<number>]> = [
      ["orders-flow stock-check (401 unauth)", async () => (await fetch(`${BASE}/api/admin/orders-flow`)).status],
      ["warehouse-stock (401 unauth)", async () => (await fetch(`${BASE}/api/admin/warehouse-stock`)).status],
      ["approve (401 unauth)", async () => (await fetch(`${BASE}/api/admin/customers/approve`)).status],
      ["homepage 200", async () => (await fetch(`${BASE}/`)).status],
    ];
    for (const [name, fn] of checks) console.log(`${name}: ${await fn()}`);
    const cat = await (await fetch(`${BASE}/api/catalog`)).json();
    const tops = (cat.tops ?? []).filter((t: any) => (t.productCount ?? 0) > 0).length;
    console.log(`catalog tops with SKUs: ${tops} (category row will render these)`);
  }
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
