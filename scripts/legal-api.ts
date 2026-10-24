/** Legal pages task: login to production admin, upsert Page records, verify rendering. */
const BASE = process.env.PROD_BASE || "https://b2b-dmk-mart.vercel.app";
const LOGIN_ID = process.env.ADMIN_LOGIN_ID || "B2B DMK Mart";
const PASSWORD = process.env.ADMIN_PASSWORD || "DmkMartB2B!2026";
const TOKEN_FILE = "/home/z/my-project/.golive-token";

import * as fs from "fs";
import { terms, privacy } from "./legal-content-a";
import { refund, shipping, cancellation, pricing } from "./legal-content-b";
import { about, contactUs } from "./legal-content-c";
import type { SeedPage } from "./legal-content-a";

const ALL: SeedPage[] = [terms, privacy, refund, shipping, cancellation, pricing, about, contactUs];

async function api(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const token = fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, "utf8").trim() : "";
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(90_000),
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) },
  });
  let body: any = null;
  try { body = await res.json(); } catch { body = `<non-json ${res.status}>`; }
  return { status: res.status, body };
}

async function main() {
  const cmd = process.argv[2] || "list";

  if (cmd === "login") {
    const { status, body } = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ loginId: LOGIN_ID, password: PASSWORD }) });
    console.log("login:", status, JSON.stringify(body).slice(0, 300));
    const tok = body?.token || body?.data?.token;
    if (tok) { fs.writeFileSync(TOKEN_FILE, tok); console.log("token saved"); }
    return;
  }

  if (cmd === "list") {
    const { status, body } = await api("/api/admin/crud/pages");
    const rows = body?.rows || [];
    console.log("status:", status, "count:", rows.length);
    for (const pg of rows) console.log(`- ${pg.slug} | ${pg.title} | type=${pg.type} | footer=${pg.inFooter} | active=${pg.active} | sortOrder=${pg.sortOrder} | blocksLen=${(pg.blocks || "").length}`);
    return;
  }

  if (cmd === "apply") {
    let created = 0, updatedN = 0, failed = 0;
    const { body: listBody } = await api("/api/admin/crud/pages");
    const existing: any[] = listBody?.rows || [];
    for (const pg of ALL) {
      const found = existing.find((x) => x.slug === pg.slug);
      const payload = {
        slug: pg.slug, title: pg.title, type: pg.type,
        blocks: JSON.stringify(pg.blocks),
        metaTitle: pg.metaTitle, metaDescription: pg.metaDescription,
        keywords: pg.keywords, inFooter: pg.inFooter, sortOrder: pg.sortOrder, active: true,
      };
      const res = found
        ? await api("/api/admin/crud/pages", { method: "PATCH", body: JSON.stringify({ id: found.id, ...payload }) })
        : await api("/api/admin/crud/pages", { method: "POST", body: JSON.stringify(payload) });
      if (res.status < 300) { found ? updatedN++ : created++; console.log(`${found ? "UPDATED" : "CREATED"}: ${pg.slug} (${pg.blocks.length} blocks)`); }
      else { failed++; console.log(`FAILED: ${pg.slug} ->`, res.status, JSON.stringify(res.body).slice(0, 300)); }
    }
    console.log(`\nDone. created=${created} updated=${updatedN} failed=${failed}`);
    return;
  }

  if (cmd === "verify") {
    const slugs = process.argv[3] ? [process.argv[3]] : ALL.map((x) => x.slug);
    for (const slug of slugs) {
      const res = await fetch(`${BASE}/page/${slug}`, { signal: AbortSignal.timeout(60_000) });
      const html = await res.text();
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1] || "";
      const h2s = (html.match(/<h2/g) || []).length;
      const hasToc = html.includes("On this page");
      const hasRelated = html.includes("Related pages");
      const updatedTag = html.includes("Last updated");
      console.log(`${res.status} /page/${slug} len=${html.length} title="${title.slice(0, 60)}" h2=${h2s} toc=${hasToc} related=${hasRelated} updated=${updatedTag}`);
    }
    const sitemap = await fetch(`${BASE}/sitemap.xml`, { signal: AbortSignal.timeout(60_000) });
    const sm = await sitemap.text();
    const inSitemap = slugs.filter((s) => sm.includes(`/page/${s}`));
    console.log(`\nsitemap.xml: ${sitemap.status}, contains ${inSitemap.length}/${slugs.length} seeded pages`);
    const footer = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(60_000) });
    const fh = await footer.text();
    console.log("homepage footer 'Information' section:", fh.includes("Information"), "| About link:", fh.includes("/page/about-us"), "| Contact link:", fh.includes("/page/contact-us"));
  }
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
