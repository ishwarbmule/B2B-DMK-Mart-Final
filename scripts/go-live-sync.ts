/**
 * GO-LIVE: connect the PRODUCTION B2B site (dmkmartb2b.space-z.ai) to the owner's
 * ERP MySQL and run the first real pull — via the site's own admin APIs, using the
 * production server's unrestricted network (this sandbox cannot reach arbitrary hosts).
 *
 * Usage:
 *   npx tsx scripts/go-live-sync.ts login
 *   npx tsx scripts/go-live-sync.ts setup           # save credentials, test connection
 *   npx tsx scripts/go-live-sync.ts status
 *   npx tsx scripts/go-live-sync.ts tables
 *   npx tsx scripts/go-live-sync.ts describe <table>
 *   npx tsx scripts/go-live-sync.ts aliases '<json>'
 *   npx tsx scripts/go-live-sync.ts imagebase <url|''>
 *   npx tsx scripts/go-live-sync.ts pull
 *   npx tsx scripts/go-live-sync.ts verify
 */
const BASE = process.env.PROD_BASE || "https://dmkmartb2b.space-z.ai";
const LOGIN_ID = process.env.ADMIN_LOGIN_ID || "B2B DMK Mart";
const PASSWORD = process.env.ADMIN_PASSWORD || "1234";

const ERP = {
  erp_db_host: "srv844.hstgr.io",
  erp_db_port: "3306",
  erp_db_user: "u671486929_dmkmarterp",
  erp_db_password: "DMKMart@26",
  erp_db_name: "u671486929_dmkmarterpdata",
};

const TOKEN_FILE = "/home/z/my-project/.golive-token";

async function api(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const token = (await import("fs")).existsSync(TOKEN_FILE)
    ? (await import("fs")).readFileSync(TOKEN_FILE, "utf8").trim()
    : "";
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(90_000),
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) },
  });
  let body: unknown = null;
  try { body = await res.json(); } catch { body = `<non-json ${res.status}>`; }
  return { status: res.status, body };
}

async function main() {
  const cmd = process.argv[2] || "status";
  const arg = process.argv[3];

  if (cmd === "login") {
    const { status, body } = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: LOGIN_ID, password: PASSWORD }) });
    const token = (body as { token?: string })?.token;
    if (status === 200 && token) {
      (await import("fs")).writeFileSync(TOKEN_FILE, token);
      console.log(`login OK — token saved (${token.slice(0, 12)}...)`);
    } else {
      console.log(`login FAILED ${status}`, JSON.stringify(body));
      process.exit(1);
    }
    return;
  }

  if (cmd === "setup") {
    const { status, body } = await api("/api/admin/sync/settings", {
      method: "POST",
      body: JSON.stringify({ ...ERP, erp_products_table: arg || "products" }),
    });
    console.log(`setup → ${status}`, JSON.stringify(body, null, 2).replace(/DMKMart@26/g, "***"));
    return;
  }

  if (cmd === "status") {
    const { status, body } = await api("/api/admin/sync/status");
    console.log(`status → ${status}`, JSON.stringify(body, null, 2));
    return;
  }

  if (cmd === "tables") {
    const { status, body } = await api("/api/admin/sync/explorer");
    console.log(`tables → ${status}`, JSON.stringify(body, null, 2));
    return;
  }

  if (cmd === "describe") {
    const { status, body } = await api(`/api/admin/sync/explorer?table=${encodeURIComponent(arg || "products")}`);
    console.log(`describe ${arg} → ${status}`, JSON.stringify(body, null, 2));
    return;
  }

  if (cmd === "aliases") {
    const { status, body } = await api("/api/admin/sync/settings", { method: "POST", body: JSON.stringify({ erp_product_aliases: arg || "{}" }) });
    console.log(`aliases → ${status}`, JSON.stringify(body));
    return;
  }

  if (cmd === "imagebase") {
    const { status, body } = await api("/api/admin/sync/settings", { method: "POST", body: JSON.stringify({ erp_image_base_url: arg || "" }) });
    console.log(`imagebase → ${status}`, JSON.stringify(body));
    return;
  }

  if (cmd === "pull") {
    console.log("Pulling from ERP MySQL via production ...");
    const { status, body } = await api("/api/admin/sync/pull", { method: "POST" });
    console.log(`pull → ${status}`, JSON.stringify(body, null, 2));
    return;
  }

  if (cmd === "pullall") {
    // Chunked full pull: loop ?limit=&offset= until a short chunk comes back.
    // Each call stays far below the serverless timeout; apply is idempotent per SKU.
    // Usage: pullall <chunk=20> [startOffset] — resume support for multi-session pulls.
    const CHUNK = Math.max(10, Number(arg) || 20);
    let offset = Math.max(0, Number(process.argv[4]) || 0);
    const t0 = Date.now();
    const total = { seen: 0, created: 0, updated: 0, skipped: 0, errors: 0 };
    for (let i = 0; ; i++) {
      let status = 0, body: unknown = null, attempt = 0;
      // retry a chunk up to 3 attempts (transient serverless 504s under load)
      for (; attempt < 3; attempt++) {
        const r = await api(`/api/admin/sync/pull?limit=${CHUNK}&offset=${offset}`, { method: "POST" });
        status = r.status; body = r.body;
        const okBody = body as { ok?: boolean };
        if (status === 200 && okBody?.ok) break;
        console.log(`  chunk@${offset} attempt ${attempt + 1} failed (${status}), retrying...`);
        await new Promise((res) => setTimeout(res, 10_000));
      }
      const b = body as { ok?: boolean; fetched?: number; seen?: number; created?: number; updated?: number; skipped?: number; errors?: string[]; durationMs?: number };
      if (status !== 200 || !b?.ok) {
        console.log(`chunk@${offset} FAILED ${status}`, JSON.stringify(body).slice(0, 300));
        process.exit(1);
      }
      total.seen += b.seen || 0; total.created += b.created || 0; total.updated += b.updated || 0;
      total.skipped += b.skipped || 0; total.errors += (b.errors || []).length;
      console.log(`chunk ${i}: offset=${offset} fetched=${b.fetched} created=${b.created} updated=${b.updated} skipped=${b.skipped} errors=${(b.errors || []).length} (${b.durationMs}ms)`);
      if ((b.errors || []).length) console.log("  first errors:", JSON.stringify((b.errors || []).slice(0, 3)));
      if ((b.fetched || 0) < CHUNK) break;
      offset += CHUNK;
    }
    console.log(`PULL DONE in ${Math.round((Date.now() - t0) / 1000)}s —`, JSON.stringify(total));
    return;
  }

  if (cmd === "fix-images") {
    const { status, body } = await api("/api/admin/sync/fix-images", { method: "POST" });
    console.log(`fix-images → ${status}`, JSON.stringify(body, null, 2));
    return;
  }

  if (cmd === "verify") {
    const pub = await api("/api/products?limit=1000");
    console.log(`public products api → ${pub.status}`, JSON.stringify(pub.body).slice(0, 400));
    return;
  }

  console.log("unknown command");
  process.exit(1);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
