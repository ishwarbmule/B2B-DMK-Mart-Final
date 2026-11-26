/** Main generator — requires db-doc-lib.cjs */
const L = require("./db-doc-lib.cjs");
const {
  P, buildCoverR1, h1, h2, body, bodyRuns, caption, tableTitle, makeTable, fieldTable, FONT,
  img, IMG_W, IMG_H, Document, Packer, Paragraph, TextRun, PageBreak, Header, Footer,
  PageNumber, NumberFormat, AlignmentType, SectionType, TableOfContents, BorderStyle, ImageRun, fs,
} = L;

// ───────────────────────── body content ─────────────────────────
const B = [];

// 1. The big picture
B.push(h1("1. The Big Picture — Three Layers"));
B.push(body("The inventory is organized in three simple layers. Layer one is the product catalog: one row per SKU, holding its name, brand, prices, categories, photos and description. Layer two is the warehouse (godown): the physical shops and stores. Layer three is the stock row: one line per godown per product, holding how many pieces THAT godown holds. A product can have a stock row in both godowns, in only one, or in none at all."));
B.push(body("One rule ties everything together: the catalog is the same across godowns. Every godown sees the same product list; what differs is the quantity. When a product has no stock row in a godown, that godown simply treats it as quantity 0. This is why the brochure picker and the admin product panel can list the full catalog for any godown, each line showing that godown's own number."));
B.push(body("Ownership is split clearly. Product data, godowns and stock quantities come from the ERP system (Hostinger MySQL) through a read-only sync — the website never writes to the ERP. Everything the owner arranges on top (featured flags, deal prices, photos, catalog order, brochures) is website-owned and is never overwritten by a sync."));
B.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 160, after: 40 },
  children: [new ImageRun({ data: img, transformation: { width: IMG_W, height: IMG_H }, type: "png" })],
}));
B.push(caption("Figure 1 - The three inventory layers and how the storefront reads them"));

// 2. Live snapshot
B.push(h1("2. Live Snapshot (26 November 2026)"));
B.push(body("These are the real numbers from production right now, so every field description below can be read against them."));
B.push(tableTitle("Table 2-1 - What the database holds today"));
B.push(makeTable(["Layer", "What is stored", "Today's numbers"], [
  ["Product catalog", "Products", "4,781 synced (845 shown on the site, 3,936 hidden)"],
  ["ERP catalog (source)", "Products in the ERP", "4,848"],
  ["Godowns shown", "Warehouses with active = true", "2 - KOLHAR WARE HOUSE (WH-MAIN), DMK MART PUNE (PDMKMAIN01)"],
  ["Godowns hidden", "GST-firm godowns (not selectable)", "3 - DMK Traders and Sons, DMK Traders-1, Pune DMK Mart Main (0 stock rows each)"],
  ["Stock rows (site)", "WarehouseStock lines in shown godowns", "2,558 - Kolhar 2,312 (366 with quantity above 0), Pune 246 (all above 0)"],
  ["Stock rows (ERP)", "All godowns incl. hidden ones", "2,756 - Kolhar 2,312, Pune 246, DMK Traders and Sons 99, DMK Traders-1 99"],
  ["P-pattern SKUs", "P + 6 letters + 4 digits (Pune's own coding)", "2,043 in catalog - 188 stocked at DMK Mart Pune, the rest catalog-only"],
], [20, 38, 42]));
B.push(body("The counts move on their own: every daily sync refreshes quantities, and products move between shown and hidden as the ERP adds or removes stock rows. So read this table as a photograph, not a fixed state."));

// 3. Warehouse
B.push(h1("3. Warehouse - the Godowns"));
B.push(body("Each godown is one row in the Warehouse table. ERP godowns arrive from the sync with source = ERP and keep the godown's own name, code and city. Godowns the owner creates by hand in the panel get source = LOCAL. The single most important field is active: it is the tick. An active godown appears in the ERP Sync picker, in the brochure warehouse dropdown and in warehouse-wise product management. Deactivating a godown hides it everywhere and, at the next sync or finalize, all of its stock rows are removed - so an unticked godown can never leak products."));
B.push(tableTitle("Table 3-1 - Warehouse fields"));
B.push(fieldTable([
  ["id", "text", "Internal row id (cuid). Example: cmwoih7d70002l80796kwykd5"],
  ["name", "text", "Display name. Example: DMK MART PUNE"],
  ["code", "text", "The ERP godown code. Example: PDMKMAIN01. Note: codes can repeat across firms (WH-MAIN exists twice in the ERP), so the sync tracks godowns by row id, never by code"],
  ["source", "ERP / LOCAL", "ERP = mirrored from the ERP; LOCAL = created by the admin in the panel"],
  ["address / city / phone", "text", "Contact details. Example city: PUNE"],
  ["isDefault", "yes/no", "Which godown is pre-selected in the UI first"],
  ["active", "yes/no", "THE tick. true = shown everywhere; false = hidden and its stock rows are purged"],
  ["sortOrder", "number", "Manual ordering"],
  ["createdAt / updatedAt", "date", "Row timestamps"],
]));
B.push(body("Related table - WarehouseManager: one row per godown portal login (username, password, phone, email, the godown it belongs to, a JSON list of which admin modules that manager may open, and active). Warehouse managers log into the /warehouse portal with these credentials."));

// 4. WarehouseStock
B.push(h1("4. WarehouseStock - Which Godown Holds What"));
B.push(body("This is the heart of warehouse inventory. Every row answers one question: how many pieces of product X does godown Y hold right now? The pair (warehouseId, productId) is unique - a godown can never hold two rows for the same product. When the ERP has no row for a product in a godown, the website treats the quantity as 0; nothing is invented."));
B.push(tableTitle("Table 4-1 - WarehouseStock fields"));
B.push(fieldTable([
  ["id", "text", "Internal row id"],
  ["warehouseId + productId", "two links", "The godown and the product. UNIQUE together - one row per godown per product"],
  ["qty", "number", "That godown's own quantity. Example: Kolhar holds 910 pcs of APPLAS0006"],
  ["updatedAt", "date", "Last touched by a sync or an admin edit"],
]));
B.push(body("How rows live and die. During a stock sync the engine reads the ERP stock table joined to products and godowns, but only for the godowns the owner has ticked. Rows are created or updated to match the ERP exactly. Rows the ERP no longer has are deleted, so the site never shows phantom stock. For godowns that are not ticked, the cleanup is absolute: zero rows remain, on every sync and on every finalize pass."));
B.push(body("How the site reads them. The product's public stock number is the sum of its godown quantities - this is what drives the green in-stock dot, the out-of-stock badge and the automatic Ready-to-Dispatch flag on the storefront. The brochure and the warehouse product lens read the same rows: every godown lists the full catalog with its own quantity, so the owner can print or manage anything, including items the godown does not currently stock (printed with qty 0)."));

// 5. Product
B.push(h1("5. Product - the Catalog"));
B.push(body("One row per SKU. Synced products carry the ERP's SKU; the ERP row id is remembered for traceability. Everything the buyer sees - price, photo, description, categories, stock - lives here, together with the merchandising switches the owner controls."));
B.push(h2("5.1 Identity and grouping"));
B.push(tableTitle("Table 5-1 - Identity fields"));
B.push(fieldTable([
  ["id", "text", "Internal row id"],
  ["sku", "text", "UNIQUE stock code. Synced items use the ERP SKU. Example: PSTEELK0115"],
  ["erpId", "text", "Traceability link to the source row (falls back to the SKU when the source exposes no row id)"],
  ["slug", "text", "URL name for the product page. Example: deep-household-dinner-set-12pcs"],
  ["name", "text", "Display name"],
  ["company", "text", "THE brand grouping (= ERP company name). All brand-oriented sorting and sections group on this field"],
  ["brandId", "link", "Optional legacy link to the Brand table (new synced products have none - company is the grouping)"],
  ["topId / midId / endId", "three links", "The product's place in the 3-level category tree (see section 6)"],
]));
B.push(h2("5.2 Pricing"));
B.push(tableTitle("Table 5-2 - Price fields (all in rupees)"));
B.push(fieldTable([
  ["purchaseCost", "number", "What DMK Mart pays - admin-only. Never leaves the admin panel"],
  ["dealerPrice", "number", "The selling price shown to buyers (tier4 is the default)"],
  ["basePrice", "number", "Reference price"],
  ["mrp", "number", "Maximum retail price (= ERP tier5Mrp)"],
  ["tier1..tier5", "numbers", "The five slab prices: Distributor, Wholesale, Semi-Wholesale, Retailer, MRP"],
  ["deliveryRate", "number", "Delivery-basis rate column from the source sheet"],
  ["packPrice", "number", "Pickup pack rate"],
  ["dealPrice", "number", "Deal-of-the-day price"],
  ["locationPrices", "JSON", "City/town price overrides, e.g. {\"Pune\": {\"d\": 210, \"m\": 300}} - written by the location pricing tool"],
]));
B.push(h2("5.3 Stock and logistics"));
B.push(tableTitle("Table 5-3 - Stock, compliance and units"));
B.push(fieldTable([
  ["stock", "number", "TOTAL across godowns - what buyers can order. Recomputed from WarehouseStock on every stock sync"],
  ["damagedStock / reservedQty", "numbers", "Mirror of the ERP damaged and reserved columns"],
  ["lowStockThreshold", "number", "Below this the product shows as low stock (default 10)"],
  ["unit / packQty / piecesPerBox", "text / numbers", "Selling unit. Example: Pcs, Pack of 12, Box of 6"],
  ["barcode / hsn / gst", "text / number", "Compliance fields from the ERP"],
  ["weightGrams", "number", "Shipping weight"],
]));
B.push(h2("5.4 Media, content and merchandising"));
B.push(tableTitle("Table 5-4 - Media, SEO and the owner's switches"));
B.push(fieldTable([
  ["image / gallery", "text", "Cloudinary photo URL + JSON array of extra photos"],
  ["description", "text", "Product description"],
  ["seoTitle / seoDesc / keywords", "text", "Search engine fields"],
  ["rating / reviewCount", "numbers", "Display-only rating (default 4.5)"],
  ["isHot / isTop / isFeatured / isDeal", "yes/no", "Merchandising flags: Hot Products, Ready-to-Dispatch (auto-flips with stock), Featured, Deals of the Day. Admin-owned - a sync never changes them (isTop auto-rules aside)"],
  ["dealPrice", "number", "Goes with isDeal"],
  ["active", "yes/no", "Shown on the storefront or hidden"],
  ["activeSource", "ERP / ADMIN", "Who controls the active switch. ADMIN = the owner hid/showed it by hand and no sync will override"],
  ["syncSource", "ERP / LOCAL / LEGACY", "Where the row came from. LOCAL = created by the admin and never touched by the sync"],
  ["lastSyncedAt", "date", "Last ERP refresh of this row"],
]));

// 6. Brand & categories
B.push(h1("6. Brand (= Company) and the Category Tree"));
B.push(body("Brand means the ERP company. Every distinct company value on a product is kept as a Brand row, with erpNames storing the exact ERP spellings that map to it (so MILTON and Milton land on one brand). Brand logos live in Cloudinary under dmk-mart/brand-logos and are attached through the logo field; the /brands page and brochure brand page read from here."));
B.push(tableTitle("Table 6-1 - Brand fields"));
B.push(fieldTable([
  ["name / slug", "text", "Display name + URL name (unique). Example: Milton Kitchenware"],
  ["logo / banner", "text", "Cloudinary URLs (logos uploaded with deterministic names)"],
  ["erpNames", "JSON", "ERP company-name aliases that resolve to this brand"],
  ["tagline / description / color", "text", "Brand page content"],
  ["storefrontLayout / storefrontConfig", "number / JSON", "Which of the 10 brand-page templates is used and its settings"],
  ["isFeatured / sortOrder / active", "flags", "Ordering and visibility of the brand page"],
]));
B.push(body("Categories form a strict tree: TopCategory holds the departments shown on the home page; MidCategory hangs under a top; EndCategory hangs under a mid. Every product points at one top, one mid and one end. The ERP's top_level_category and end_level_category columns build this tree automatically during sync; products the ERP leaves unclassified keep whatever the admin assigned."));
B.push(tableTitle("Table 6-2 - Category tables"));
B.push(fieldTable([
  ["TopCategory", "tree root", "name (unique), emoji, image (Cloudinary - the home-page tiles), color, sortOrder"],
  ["MidCategory", "tree middle", "name + topId (unique together)"],
  ["EndCategory", "tree leaf", "name + midId (unique together) - this is the finest grouping the brochure sections use"],
]));

// 7. Stock transfers
B.push(h1("7. Stock Movements - Transfers Between Godowns"));
B.push(body("When stock moves from one godown to another, the admin records a StockTransfer. Creating it executes atomically: the from-godown's row is reduced, the to-godown's row is increased, and the transfer is stored with status RECEIVED for the audit trail. Items snapshot the SKU and name at transfer time, so old records stay readable even if products are renamed later."));
B.push(tableTitle("Table 7-1 - Transfer tables"));
B.push(fieldTable([
  ["StockTransfer", "header", "code (TRF-0001...), fromWarehouseId, toWarehouseId, status, note, itemCount, totalQty, createdBy, createdAt"],
  ["StockTransferItem", "lines", "transferId, productId, sku, name, qty - a frozen copy per line"],
]));

// 8. ERP sync support tables
B.push(h1("8. ERP Sync Support Tables"));
B.push(body("Three tables keep the sync auditable and safe. They never face buyers."));
B.push(tableTitle("Table 8-1 - Support tables"));
B.push(fieldTable([
  ["ErpProductMirror", "shadow copy", "Per SKU: the ERP's name, MRP, costPrice (ADMIN-ONLY - never shown publicly), deliveryRate, availableStock, plus payloadJson with the last raw payload for audit"],
  ["SyncEvent", "audit log", "Every sync action with direction, action name, status and a human-readable message"],
  ["PriceChangeLog", "price history", "Every price change: which field (mrp, dealerPrice, tier1..5, dealPrice), old value, new value, the basis (e.g. purchaseCost + 18%) and who made it"],
]));
B.push(body("The sync's configuration lives in the Setting table (key-value rows, no new tables): erp_map_products, erp_map_warehouses and erp_map_stock store which tables and columns are shared; erp_sync_selected_whids stores the ticked godown row ids; erp_wh_neon_map links each ERP godown id to its Warehouse row here. The ERP credentials themselves sit in settings too, and the ERP is strictly read-only - every query is checked to be a SELECT/SHOW/DESCRIBE before it runs."));

// 9. How the sync works
B.push(h1("9. How the ERP Sync Works"));
B.push(body("The guided flow in Admin -> ERP Sync maps one-to-one onto the tables above. The steps, in order:"));
B.push(makeTable(["Step", "What happens", "What it touches"], [
  ["1 - Connect", "Read-only connection test against the saved credentials", "nothing written"],
  ["2 - Pick godowns", "Only non-GST firms' godowns are offered: KOLHAR WARE HOUSE and DMK MART PUNE. The tick is saved as ERP row ids (codes collide across firms)", "erp_sync_selected_whids, Warehouse.active"],
  ["3 - Tick columns", "Which product columns the site may read (prices, tiers, stock, categories, photos...)", "erp_map_products / warehouses / stock"],
  ["4 - Update Products (Sync now)", "Full pull: refreshes godowns, stock and catalog; NEW SKUs are added", "Warehouse, WarehouseStock, Product, Brand, categories"],
  ["4b - Update information", "The button beside Sync now: refreshes prices, MRP, names, brands, categories and stock for products ALREADY listed; brand-new SKUs are counted, not added", "Product fields, WarehouseStock"],
  ["5 - Daily cron", "Automatic maintenance pass each day with the same scope as Sync now", "same as step 4"],
], [22, 48, 30]));
B.push(body("Standing rules, in plain language: the ERP is never written to. Only ticked godowns feed the site, and un-ticked godowns always end up with zero stock rows. Hidden godowns never reappear on their own - the daily cron re-hides and re-purges them. The owner's merchandising (hot, featured, deal, photos, deal prices) is overlay data a sync never overwrites. Product pages and stock pulls run in chunks with a saved cursor, so a 4,800-SKU catalog never hits the serverless time limit."));

// 10. SKU conventions
B.push(h1("10. SKU Conventions - Reading the Codes"));
B.push(body("SKUs follow two visible conventions, and they line up with the two godowns. Supplier-style codes are six letters plus four digits - APPLAS0006 (AP Plastics), BELSTA0002 (Belstar), HIMALA0035 (Himalaya Thermoplast). These dominate Kolhar's 2,312 rows. The P-codes are P plus a six-letter company abbreviation plus four digits - PSTEELK0115 (Steel King), PSUNRIS0001 (Sunrise), PDEEPHO0167 (Deep Household)."));
B.push(body("We checked every one of the 2,756 ERP stock rows against this pattern. Answer to the standing question: the P-pattern products belong to DMK MART PUNE - 188 of them are stocked there (every one with a quantity above zero), and a further 50 PARIWA-style six-letter codes with quantities sit there too. The remaining roughly 1,800 P-codes exist in the ERP product catalog but have no stock row in ANY godown - they are catalogue-only entries, listed everywhere at quantity 0 until the ERP records stock for them. Nothing is missing from the panel; the ERP itself simply has no quantities recorded for those SKUs yet."));

// ───────────────────────── document assembly ─────────────────────────
const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

function pageFooter(marker) {
  // marker color distinguishes roman (front matter) from arabic (body) in post-processing
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: marker })],
    })],
  });
}
const bodyHeader = new Header({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "E2D9C8", space: 4 } },
    children: [new TextRun({ text: "DMK Mart B2B - Inventory & Warehouse Database Structure", size: 16, color: P.secondary, font: FONT })],
  })],
});

const doc = new Document({
  creator: "DMK Mart",
  title: "Inventory, Warehouse & Products - Database Structure Guide",
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 22, color: P.body },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: FONT, size: 30, bold: true, color: P.primary },
        paragraph: { spacing: { before: 400, after: 160, line: 312 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: FONT, size: 25, bold: true, color: P.primary },
        paragraph: { spacing: { before: 280, after: 120, line: 312 }, outlineLevel: 1 },
      },
    },
  },
  sections: [
    { // Section 1 — cover
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1({
        title: "Inventory & Warehouse Database",
        subtitle: "How products, godowns and stock are stored in the DMK Mart B2B platform",
        englishLabel: "DMK MART B2B PLATFORM",
        metaLines: [
          "Production: b2b-dmk-mart.vercel.app",
          "Site data: Neon Postgres - Source data: Hostinger MySQL (read-only)",
          "Prepared: 26 November 2026",
        ],
        footerLeft: "DMK MART",
        footerRight: "DATABASE STRUCTURE GUIDE",
        palette: P.cover,
      }),
    },
    { // Section 2 — front matter (TOC), Roman numerals
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      footers: { default: pageFooter("878787") },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 480, after: 360 },
          children: [new TextRun({ text: "Table of Contents", bold: true, size: 30, font: FONT, color: P.primary })],
        }),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
        new Paragraph({
          spacing: { before: 200 },
          children: [new TextRun({
            text: "Note: this table of contents is generated via field codes. After editing, right-click it and choose \"Update Field\" to refresh page numbers.",
            italics: true, size: 18, color: "888888", font: FONT,
          })],
        }),
        // no trailing PageBreak here — the body section below starts on a new
        // page by itself (PageBreak + NEXT_PAGE section = blank page)
      ],
    },
    { // Section 3 — body, Arabic from 1
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: bodyHeader },
      footers: { default: pageFooter("888888") },
      children: B,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync("/home/z/my-project/download/DMK-Mart-Inventory-Database-Structure.docx", buf);
  console.log("written", buf.length, "bytes");
});
