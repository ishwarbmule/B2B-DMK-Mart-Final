/**
 * Fix products whose midId still points at a "General" mid belonging to a DIFFERENT top
 * (leftover from the old General bucket). Re-assigns them via apply-categories
 * (top = their current top, mid = General, end = their current end name when it is a real
 * end under a General mid, else "General").
 */
const BASE = "https://b2b-dmk-mart.vercel.app";
const LOGIN_ID = process.env.ADMIN_LOGIN_ID || "B2B DMK Mart";
const PASSWORD = process.env.ADMIN_PASSWORD || "DmkMartB2B!2026";
let TOKEN = "";

async function api(p: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${p}`, {
    ...init, signal: AbortSignal.timeout(120_000),
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, ...(init?.headers || {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  const dry = process.argv[2] !== "apply";
  const login = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: LOGIN_ID, password: PASSWORD }) });
  TOKEN = login.body?.token;

  const tree = await api("/api/admin/catalog/apply-categories");
  // collect every mid with its parent top name
  const midTop = new Map<string, string>(); // midName -> topName (any)
  for (const t of tree.body?.tops ?? []) for (const m of t.mids) midTop.set(`${t.name}|${m.name}`, t.name);

  // paginate products, find mid-name/top-name mismatches where mid is "General"
  const fixes: Array<{ sku: string; top: string; mid: string; end: string }> = [];
  let page = 1, pages = 1;
  do {
    const d = await api(`/api/admin/products?limit=100&page=${page}&all=1`);
    pages = d.body?.pages ?? 1;
    for (const x of d.body?.rows ?? []) {
      const topName = String(x.top?.name ?? "");
      const midName = String(x.mid?.name ?? "");
      const endName = String(x.end?.name ?? "");
      if (midName === "General" && topName && topName !== "General") {
        // end belongs to the OLD General mid — keep only real-looking ends; else reset
        const end = endName && endName !== "General" ? endName : "General";
        fixes.push({ sku: String(x.sku), top: topName, mid: "General", end });
      }
    }
    page++;
  } while (page <= pages);

  console.log(`mismatched General-mid products: ${fixes.length}`, dry ? "(dry)" : "");
  if (!fixes.length || dry) return;

  const topList = (tree.body?.tops ?? []).map((t: { name: string }) => ({ name: t.name }));
  const r = await api("/api/admin/catalog/apply-categories", { method: "POST", body: JSON.stringify({ dryRun: false, tops: topList, assignments: fixes }) });
  console.log(JSON.stringify(r.body));
}

main().catch((e) => { console.error(e); process.exit(1); });
