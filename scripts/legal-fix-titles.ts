/** One-off: clean metaTitles so the root layout template "%s | DMK Mart B2B" doesn't double the brand suffix. */
import * as fs from "fs";

const BASE = "https://b2b-dmk-mart.vercel.app";
const TOKEN_FILE = "/home/z/my-project/.golive-token";

const CLEAN: Record<string, string> = {
  "terms-and-conditions": "Terms & Conditions",
  "privacy-policy": "Privacy Policy",
  "refund-returns-policy": "Refund & Returns Policy",
  "shipping-delivery-policy": "Shipping & Delivery Policy",
  "cancellation-policy": "Cancellation Policy",
  "pricing-payment-policy": "Pricing & Payment Policy",
  "about-us": "About Us",
  "contact-us": "Contact Us",
};

async function main() {
  const token = fs.readFileSync(TOKEN_FILE, "utf8").trim();
  const res = await fetch(`${BASE}/api/admin/crud/pages`, { headers: { authorization: `Bearer ${token}` } });
  const { rows } = await res.json();
  for (const pg of rows) {
    const mt = CLEAN[pg.slug];
    if (!mt) continue;
    if (pg.metaTitle === mt) { console.log(`skip ${pg.slug} (already clean)`); continue; }
    const r = await fetch(`${BASE}/api/admin/crud/pages`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ id: pg.id, metaTitle: mt }),
    });
    console.log(r.status < 300 ? `OK ${pg.slug} -> "${mt}"` : `FAIL ${pg.slug}: ${r.status}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
