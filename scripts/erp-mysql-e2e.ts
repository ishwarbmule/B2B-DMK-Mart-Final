/**
 * Full end-to-end test of the ERP MySQL pull path against a REAL MySQL server.
 *
 * The owner's Hostinger firewall blocks this sandbox's IP, so we simulate the ERP
 * locally with mysql-memory-server — same driver (mysql2), same SQL, same code path
 * that production will run against srv844.hstgr.io.
 *
 * What it verifies (per owner requirements):
 *  1. Only products + images are pulled from the ERP MySQL.
 *  2. Each product row's image URL is picked up (Cloudinary / https / relative).
 *  3. active/inactive: active → visible on website; inactive → stays in admin only.
 *  4. Admin activation is never undone by a later ERP pull (last-writer-wins).
 *  5. ERP stays untouched (push dry-run is read-only, writes stay locked).
 *
 * Run: DATABASE_URL=file:/home/z/my-project/db/custom.db \
 *      LD_LIBRARY_PATH=/home/z/my-project/.test-libs/extracted/usr/lib/x86_64-linux-gnu \
 *      npx tsx scripts/erp-mysql-e2e.ts
 */
import { createDB } from "mysql-memory-server";
import mysql from "mysql2/promise";
import { pullErpProducts } from "../src/lib/erp";
import { applyErpProducts, previewPushToErp } from "../src/lib/erp-sync";
import { db } from "../src/lib/db";

const SETTING_KEYS = ["erp_db_host", "erp_db_port", "erp_db_user", "erp_db_password", "erp_db_name", "erp_products_table", "erp_product_aliases", "erp_image_base_url", "erp_write_enabled"];

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ FAIL: ${label}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  // 0. snapshot current ERP settings so we can restore them afterwards
  const snap = await db.setting.findMany({ where: { key: { in: SETTING_KEYS } } });
  const snapMap = new Map(snap.map((s) => [s.key, s.value]));
  console.log(`Snapshot of ${snapMap.size} ERP settings taken for restore.`);

  // make re-runs deterministic: wipe any leftovers of previous test runs
  const TEST_SKUS = ["DMK-001", "DMK-002", "DMK-003", "DMK-004", "DMK-005", "DMK-006", "DMK-007", "DMK-008", "ITM-100", "ITM-101", "ITM-102"];
  const gone = await db.product.deleteMany({ where: { sku: { in: TEST_SKUS } } });
  if (gone.count) console.log(`Cleaned ${gone.count} leftover test product(s).`);

  // 1. start ephemeral MySQL
  console.log("Starting ephemeral MySQL server (first run downloads binary)...");
  const server = await createDB({ version: "8.0.x" });
  console.log(`MySQL up on 127.0.0.1:${server.port}`);

  try {
    // 2. build a realistic owner-style ERP database
    const admin = await mysql.createConnection({ host: "127.0.0.1", user: server.username, password: "", port: server.port });
    await admin.query("CREATE DATABASE IF NOT EXISTS u671486929_dmkmarterpdata");
    await admin.changeUser({ database: "u671486929_dmkmarterpdata" });
    await admin.query(`
      CREATE TABLE products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item_code VARCHAR(50) NOT NULL,
        item_name VARCHAR(200) NOT NULL,
        company_name VARCHAR(120),
        category VARCHAR(120),
        unit VARCHAR(20),
        stock_quantity INT DEFAULT 0,
        purchase_cost DECIMAL(10,2) DEFAULT 0,
        rate_distributor DECIMAL(10,2) DEFAULT 0,
        rate_wholesale DECIMAL(10,2) DEFAULT 0,
        rate_semiwholesale DECIMAL(10,2) DEFAULT 0,
        rate_retailer DECIMAL(10,2) DEFAULT 0,
        rate_mrp DECIMAL(10,2) DEFAULT 0,
        image_url VARCHAR(500),
        status VARCHAR(20) DEFAULT 'Active',
        updated_at DATETIME
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    const CLOUD = "https://res.cloudinary.com/dmkmart/image/upload/v1729000000/steel-casserole-1500ml.jpg";
    const rows: (string | number)[][] = [
      ["DMK-001", "Steel Casserole 1500ml", "DMK Housewares", "Kitchen Storage", "Pcs", 120, 285, 340, 360, 380, 410, 450, CLOUD, "Active"],
      ["DMK-002", "Granite Fry Pan 24cm", "DMK Housewares", "Cookware", "Pcs", 80, 410, 490, 520, 555, 600, 665, "https://cdn.example-erp.com/images/granite-fry-pan-24cm.jpg", "Active"],
      ["DMK-003", "Water Bottle 1L", "DMK Housewares", "Drinkware", "Pcs", 300, 95, 120, 130, 140, 155, 175, "/uploads/water-bottle-1l.jpg", "Active"],
      ["DMK-004", "Dinner Set 32pcs", "DMK Housewares", "Dining", "Set", 25, 2450, 2900, 3050, 3200, 3450, 3800, "", "Inactive"],
      ["DMK-005", "Storage Container Set 5pc", "DMK Housewares", "Kitchen Storage", "Set", 60, 640, 760, 810, 860, 930, 1025, "https://res.cloudinary.com/dmkmart/image/upload/v1729000500/storage-container-set.jpg", "Inactive"],
      ["DMK-006", "Non-stick Tawa 28cm", "DMK Housewares", "Cookware", "Pcs", 150, 330, 395, 420, 445, 480, 530, "https://cdn.example-erp.com/images/nonstick-tawa-28cm.jpg", "Active"],
      ["DMK-007", "Vacuum Flask 750ml", "DMK Housewares", "Drinkware", "Pcs", 40, 380, 450, 480, 510, 550, 610, "https://cdn.example-erp.com/images/vacuum-flask-750ml.jpg", "0"],
      ["DMK-008", "Lunch Box 3 Tier", "DMK Housewares", "Dining", "Pcs", 0, 210, 255, 270, 285, 310, 345, "https://cdn.example-erp.com/images/lunch-box-3-tier.jpg", "1"],
    ];
    for (const r of rows) {
      await admin.query(
        `INSERT INTO products (item_code, item_name, company_name, category, unit, stock_quantity, purchase_cost, rate_distributor, rate_wholesale, rate_semiwholesale, rate_retailer, rate_mrp, image_url, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        r
      );
    }
    const [cntBefore] = await admin.query("SELECT COUNT(*) AS n FROM products");
    console.log(`ERP simulation ready: ${(cntBefore as { n: number }[])[0].n} product rows.`);
    await admin.end();

    // 3. point the app at this MySQL through the Setting table (the production path)
    const set = async (k: string, v: string) =>
      db.setting.upsert({ where: { key: k }, create: { key: k, value: v }, update: { value: v } });
    await set("erp_db_host", "127.0.0.1");
    await set("erp_db_port", String(server.port));
    await set("erp_db_user", server.username);
    await set("erp_db_password", "");
    await set("erp_db_name", "u671486929_dmkmarterpdata");
    await set("erp_products_table", "products");
    await set("erp_product_aliases", JSON.stringify({
      sku: "item_code", name: "item_name", company: "company_name", category: "category",
      stock: "stock_quantity", purchaseCost: "purchase_cost",
      tier1: "rate_distributor", tier2: "rate_wholesale", tier3: "rate_semiwholesale",
      tier4: "rate_retailer", tier5: "rate_mrp",
      image: "image_url", active: "status",
    }));
    await set("erp_image_base_url", "https://cdn.dmkmart.in");
    await set("erp_write_enabled", "false");

    // 4. RUN THE REAL PRODUCTION PULL
    console.log("\n── Pull from ERP MySQL ──");
    const raw = await pullErpProducts(5000);
    check("pull returned 8 rows (only products, nothing else)", raw.length === 8, `got ${raw.length}`);
    const result = await applyErpProducts(raw);
    console.log("  apply:", JSON.stringify(result));
    check("8 products created", result.created === 8, `created=${result.created}`);
    check("no errors", result.errors.length === 0, result.errors.join("; ").slice(0, 200));

    // 5. verify images + flags
    console.log("\n── Images & flags in B2B database ──");
    const p1 = await db.product.findUnique({ where: { sku: "DMK-001" } });
    const p3 = await db.product.findUnique({ where: { sku: "DMK-003" } });
    const p4 = await db.product.findUnique({ where: { sku: "DMK-004" } });
    const p7 = await db.product.findUnique({ where: { sku: "DMK-007" } });
    const p8 = await db.product.findUnique({ where: { sku: "DMK-008" } });
    check("Cloudinary URL passes through untouched", p1?.image === CLOUD, p1?.image ?? "none");
    check("gallery mirrors the ERP image URL", p1 ? (JSON.parse(p1.gallery || "[]") as string[])[0] === CLOUD : false);
    check("relative path gets erp_image_base_url prefix", p3?.image === "https://cdn.dmkmart.in/uploads/water-bottle-1l.jpg", p3?.image ?? "none");
    check("empty image stays empty", p4?.image === "");
    check("status 'Active' → active=true", p1?.active === true);
    check("status 'Inactive' → active=false", p4?.active === false);
    check("status '0' → active=false", p7?.active === false);
    check("status '1' → active=true (stock 0 still active)", p8?.active === true && p8?.stock === 0);
    check("tier prices mapped (DMK-001 tier1=340, tier5=450)", p1?.tier1 === 340 && p1?.tier5 === 450);
    check("stock mapped (DMK-001 = 120)", p1?.stock === 120);

    // 6. active/inactive visibility split
    console.log("\n── Website vs admin visibility ──");
    const visible = await db.product.findMany({ where: { active: true }, select: { sku: true } });
    const hidden = await db.product.findMany({ where: { active: false }, select: { sku: true } });
    const dmkVis = visible.filter((v) => v.sku.startsWith("DMK-")).map((v) => v.sku);
    const dmkHid = hidden.filter((h) => h.sku.startsWith("DMK-")).map((h) => h.sku);
    check("website shows exactly the 5 active DMK test products (pre-existing catalog untouched)",
      dmkVis.length === 5 && ["DMK-001", "DMK-002", "DMK-003", "DMK-006", "DMK-008"].every((s) => dmkVis.includes(s)), dmkVis.join(","));
    check("3 inactive DMK test products stay in admin panel only",
      dmkHid.length === 3 && ["DMK-004", "DMK-005", "DMK-007"].every((s) => dmkHid.includes(s)), dmkHid.join(","));

    // 7. admin activates DMK-005 manually → later ERP pull must NOT undo it
    console.log("\n── Admin activation protection (last-writer-wins) ──");
    await db.product.update({ where: { sku: "DMK-005" }, data: { active: true, activeSource: "ADMIN" } });
    const raw2 = await pullErpProducts(5000);
    await applyErpProducts(raw2);
    const p5after = await db.product.findUnique({ where: { sku: "DMK-005" } });
    check("admin-activated DMK-005 still active after ERP re-pull (ERP says Inactive)", p5after?.active === true && p5after?.activeSource === "ADMIN");

    // 8. idempotency + push dry-run (ERP untouched)
    console.log("\n── Idempotency & push safety ──");
    const raw3 = await pullErpProducts(5000);
    const again = await applyErpProducts(raw3);
    check("second pull updates (not duplicates)", again.created === 0 && again.updated >= 7, `created=${again.created} updated=${again.updated}`);
    const preview = await previewPushToErp(5000);
    check("push dry-run sees all 8 ERP rows", preview.checkedErpRows === 8);
    check("push writes stay LOCKED (erp_write_enabled=false)", preview.writeEnabled === false);
    const [cntAfter] = await (await mysql.createConnection({ host: "127.0.0.1", user: server.username, password: "", port: server.port, database: "u671486929_dmkmarterpdata" })).query("SELECT COUNT(*) AS n FROM products");
    check("ERP table row count unchanged (read-only respected)", (cntAfter as { n: number }[])[0].n === 8);

    // 9. AUTO-DETECT: first-pull resilience — no aliases, unusual column names
    console.log("\n── Auto-detect (no aliases, unusual column names) ──");
    const setRaw = async (k: string, v: string) =>
      db.setting.update({ where: { key: k }, data: { value: v } });
    await setRaw("erp_products_table", "items");
    await setRaw("erp_product_aliases", "{}");
    await setRaw("erp_image_base_url", "");
    const c2 = await mysql.createConnection({ host: "127.0.0.1", user: server.username, password: "", port: server.port, database: "u671486929_dmkmarterpdata" });
    await c2.query(`CREATE TABLE items (
      ref_no VARCHAR(50) PRIMARY KEY,
      item_desc VARCHAR(200),
      prod_img_url VARCHAR(500),
      p_status VARCHAR(20),
      qty INT
    )`);
    await c2.query("INSERT INTO items VALUES ('ITM-100','Glass Jar 500ml','https://res.cloudinary.com/dmkmart/image/upload/glass-jar.jpg','Active',50)");
    await c2.query("INSERT INTO items VALUES ('ITM-101','Spoon Set 6pc','https://cdn.example-erp.com/spoon-set.jpg','Inactive',10)");
    await c2.query("INSERT INTO items VALUES ('ITM-102','Tray Large','', '1',5)");
    await c2.end();
    const raw4 = await pullErpProducts(5000);
    const res4 = await applyErpProducts(raw4);
    check("auto-detected table pulled 3 rows without aliases", res4.created === 3, JSON.stringify(res4).slice(0, 200));
    const i0 = await db.product.findUnique({ where: { sku: "ITM-100" } });
    const i1 = await db.product.findUnique({ where: { sku: "ITM-101" } });
    const i2 = await db.product.findUnique({ where: { sku: "ITM-102" } });
    check("sku auto-detected from ref_no column", Boolean(i0));
    check("name auto-detected from item_desc column", i0?.name === "Glass Jar 500ml", i0?.name ?? "none");
    check("image auto-detected from prod_img_url (URL wins)", i0?.image === "https://res.cloudinary.com/dmkmart/image/upload/glass-jar.jpg", i0?.image ?? "none");
    check("p_status 'Active' → active", i0?.active === true);
    check("p_status 'Inactive' → inactive (stays out of storefront)", i1?.active === false);
    check("numeric p_status '1' → active, empty image ok", i2?.active === true && i2?.image === "");

    console.log(`\n══════ RESULT: ${pass} passed, ${fail} failed ══════`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    // 9. restore original ERP settings (Hostinger stays configured for go-live)
    for (const k of SETTING_KEYS) {
      if (snapMap.has(k)) await db.setting.upsert({ where: { key: k }, create: { key: k, value: snapMap.get(k)! }, update: { value: snapMap.get(k)! } });
      else await db.setting.deleteMany({ where: { key: k } });
    }
    await server.stop();
    console.log("Settings restored + ephemeral MySQL stopped.");
  }
  process.exit(process.exitCode ?? 0);
}

main().catch((e) => { console.error("E2E CRASH:", e); process.exit(1); });
