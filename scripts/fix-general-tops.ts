/**
 * Re-point products still sitting in the "General" top to a sensible department
 * inferred from brand (primary) and product-name keywords (fallback).
 * Only touches products whose CURRENT top is "General".
 */
const BASE = "https://b2b-dmk-mart.vercel.app";
const LOGIN_ID = process.env.ADMIN_LOGIN_ID || "B2B DMK Mart";
const PASSWORD = process.env.ADMIN_PASSWORD || "DmkMartB2B!2026";
let TOKEN = "";

const NV = "NV Products & Feriwala";
const HU = "Household Unbreakable";
const CH = "Cleaning & Households";
const GA = "Gardening Tools & Planters";
const FU = "Furniture";
const KW = "Kitchen Ware";
const CK = "Commercial Kitchen Equipments";
const WJ = "Water Jar & Bottles";

const BRAND_TOP: Record<string, string> = {
  "deep household": NV, "pariwar households": NV, "parivar": NV, "mauli plastic": NV, "black": NV,
  "ap plastics": NV, "novae plastic": NV, "shradha unbreakable": NV, "hd poly plast": KW,
  "mahavir unbreakable": HU, "mahananda unbreakable": HU, "himalaya thrmoplast": HU, "himalaya thermoplast": HU,
  "king": HU, "drum": HU, "nilkamal": HU, "shradha": NV,
  "samarthya cleaning": CH, "steel king cleaning": CH, "crazy": CH, "sai": CH,
  "galaxy garden": GA, "garden needs": GA, "falcon garden tools": GA, "kohinoor": GA,
  "sky furniture": FU, "mango furniture": FU, "dmk mart": FU, "dmk polymers": FU,
  "shreeji kitchenware": KW, "goldex kitchen equipments": CK, "posai jar": WJ,
};

const KEYWORD_TOP: Array<[RegExp, string]> = [
  [/chair|table|stool|palna|walker|armless|tipoy/, FU],
  [/planter|pot\b|pots|basket|fence|railing|secateurs|sprinkler|shear|hijet|sprayer|grass/, GA],
  [/mop|wiper|brush|broom|kharata|dustpan|scruber|scrubber|plunger|squeegee|duster|lofa|clip\b/, CH],
  [/chopper|solta|mixer|grinder|slicer|juicer|kettle|toaster|gas lighter|hotpot|hot pot|tawa|kadai|patila|steamer|sarovar|_SAMPLER/, KW],
  [/jar|bottle|flask/, WJ],
  [/machine|warmer|fryer|bhatti|working table|sink|display counter|freezer/, CK],
  [/tub|basin|mug|can\b|crate|bucket|dustbin|unbreakable|bath|matka|ghemela|hamper/, HU],
];

function norm(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }

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
  if (!TOKEN) throw new Error("login failed");

  // pull ALL products (paginated) — only General-top ones matter
  const products: Array<{ sku: string; name: string; brand: string; top: string }> = [];
  let page = 1, pages = 1;
  do {
    const d = await api(`/api/admin/products?limit=100&page=${page}&all=1`);
    pages = d.body?.pages ?? 1;
    for (const x of d.body?.rows ?? []) {
      products.push({ sku: String(x.sku), name: String(x.name), brand: String(x.brand?.name ?? ""), top: String(x.top?.name ?? "") });
    }
    page++;
  } while (page <= pages);
  const gen = products.filter((p) => p.top === "General");
  console.log(`products: ${products.length}, in General: ${gen.length}`);

  const counts: Record<string, number> = {};
  const assignments = gen.map((p) => {
    const b = norm(p.brand);
    let top = BRAND_TOP[b];
    if (!top) {
      const n = norm(p.name);
      for (const [re, t] of KEYWORD_TOP) {
        if (re.test(n)) { top = t; break; }
      }
    }
    top = top || NV;
    counts[top] = (counts[top] ?? 0) + 1;
    return { sku: p.sku, top, mid: "General", end: "General" };
  });
  console.log("inferred distribution:", counts);
  console.log(`assignments: ${assignments.length} (dry=${dry})`);
  if (dry) return;

  const tops = await api("/api/admin/catalog/apply-categories");
  const topList = (tops.body?.tops ?? []).map((t: { name: string }) => ({ name: t.name }));
  const half = Math.ceil(assignments.length / 2);
  for (const chunk of [assignments.slice(0, half), assignments.slice(half)]) {
    const r = await api("/api/admin/catalog/apply-categories", { method: "POST", body: JSON.stringify({ dryRun: false, tops: topList, assignments: chunk }) });
    console.log(JSON.stringify(r.body));
    if (r.status !== 200) throw new Error("chunk failed");
  }
  console.log("done");
}

main().catch((e) => { console.error(e); process.exit(1); });
