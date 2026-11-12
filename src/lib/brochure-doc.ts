/**
 * Brochure / Catalog DOC BUILDER (pure — no database, no path aliases).
 *
 * Design v3 — homepage-hero look, print-brochure standard:
 *   • COVER  = warm cream hero-style page: logo chip, two-tone title with a
 *     yellow highlight block, then the actual homepage hero artwork band
 *     (NO catalog product collage), ink stats band, yellow CTA strip + QR
 *   • TOC    = own page — every end-level category as an image tile in ONE
 *     adaptive grid (never extends to a second page)
 *   • PRODUCTS flow continuously (no per-category page breaks): slim inline
 *     category bars, 3 cards per row with visible card outlines, vertical
 *     READY TO DISPATCH / HOT / TOP pills attached above the image (website
 *     card language), big image, company label, name, SKU + pack line,
 *     BIG MRP + BIG rate — no description, no stock text
 *   • BRANDS = own page — logo + clickable brand names (real storefront links)
 *   • END    = own page — big CTAs + clickable links + QR + compact terms
 *
 * Card grids use FLAT table rows with per-cell borders + narrow spacer
 * columns (no nested tables) so pdfmake's dontBreakRows reliably keeps every
 * row whole — a row that does not fit a page moves to the next one intact.
 *
 * Consumed by src/lib/brochure.ts (data loading) and by the local design
 * preview script (scripts/brochure-preview.ts).
 */
import pdfmake from "pdfmake"; // Node engine — fonts ship via outputFileTracingIncludes (see next.config.ts)
import Roboto from "pdfmake/fonts/Roboto";

try { pdfmake.addFonts(Roboto); } catch { /* already registered */ }
pdfmake.setUrlAccessPolicy(() => true);
pdfmake.setLocalAccessPolicy(() => true);

const YELLOW = "#facc15";
const CREAM = "#fff6e0";
const INK = "#111111";
const GRAY = "#6b7280";
const SOFT = "#9ca3af";
const CARD_LINE = "#ececf1";
const BRAND_GOLD = "#b45309"; // website brand label colour (yellow-700)
const RTD_GREEN = "#16a34a";
const HOT_ORANGE = "#f97316";

export interface BrochureCard {
  id: string; sku: string; name: string; company: string;
  dept: string;                                  // top-level department caption
  packLabel: string; image: string;              // image = dataURL (or "")
  price: number | null; mrp: number;
  stock: number; low: number;
  isTop: boolean; isHot: boolean;
  section: string; sectionKey: string;
}

export interface SectionInfo {
  name: string; count: number;
  dept?: string; thumb?: string;                 // thumb = first product image (TOC tile)
}

export interface BrochureBrand {
  name: string; url: string; logo: string;       // logo = dataURL (or "")
  skus: number; tagline: string; isFeatured: boolean;
}

export interface DocOpts {
  firmName: string; firmPhone: string;
  logo: string;                                   // dataURL (or "")
  qr: string;                                     // dataURL (or "")
  heroImage: string;                              // dataURL of the homepage hero artwork (or "")
  brands: BrochureBrand[];
  id: string; generatedAtIST: string; validTillIST: string;
  titleScope: string; monthName: string;
  tierLabel: string;                              // "DEALER" | "TIER1"…
  siteDisplay: string;
  siteUrl: string;                                // absolute, for clickable links
}

const A4_W = 595.28;
const A4_H = 841.89;
const CONTENT_W = A4_W - 56; // 539.28 with [28,34,28,44] margins

/* ── small helpers ── */

const cut = (s: string, n: number) => (s && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s || "");

const phoneDigits = (phone: string): string => {
  const d = (phone || "").replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  return d;
};

function numChip(n: number, fontSize = 8.5): Record<string, unknown> {
  return {
    table: { widths: [fontSize * 2.6], body: [[{ text: String(n).padStart(2, "0"), fontSize, bold: true, color: YELLOW, alignment: "center" }]] },
    layout: { fillColor: () => INK, hLineColor: () => INK, vLineColor: () => INK, paddingLeft: () => 2.5, paddingRight: () => 2.5, paddingTop: () => 2.4, paddingBottom: () => 2.4 },
  };
}

function chip(label: string, bg: string, fg: string): unknown {
  return {
    table: { widths: [label.length * 4 + 13], body: [[{ text: label, fontSize: 6.3, bold: true, color: fg, alignment: "center", characterSpacing: 0.8 }]] },
    layout: { fillColor: () => bg, hLineColor: () => bg, vLineColor: () => bg, paddingLeft: () => 4.5, paddingRight: () => 4.5, paddingTop: () => 2.6, paddingBottom: () => 2.6 },
  };
}

/* ── flat grid plumbing: bordered card cells + invisible spacer columns ── */

const CARD_BORDER = [true, true, true, true] as [boolean, boolean, boolean, boolean];
const NO_BORDER = [false, false, false, false] as [boolean, boolean, boolean, boolean];
const BORDER_COLORS: [string, string, string, string] = [CARD_LINE, CARD_LINE, CARD_LINE, CARD_LINE];

function cardCell(stack: unknown[]): unknown {
  return { stack, border: CARD_BORDER, borderColor: BORDER_COLORS };
}

function gapCell(): unknown {
  return { text: "", border: NO_BORDER, borderColor: BORDER_COLORS };
}

/** even column indexes are cards (pad), odd ones are spacers (no pad) */
function gridLayout(padL: number, padR: number, padT: number, padB: number): unknown {
  return {
    hLineWidth: () => 0.8,
    vLineWidth: () => 0.8,
    hLineColor: () => CARD_LINE,
    vLineColor: () => CARD_LINE,
    paddingLeft: (i: number) => (i % 2 === 0 ? padL : 0),
    paddingRight: (i: number) => (i % 2 === 0 ? padR : 0),
    paddingTop: () => padT,
    paddingBottom: () => padB,
  };
}

/* ── vertical badge pills — attached above the image, one per line,
      same stacking as the website product card (Deal/Hot/Top column) ── */

function badgesColumn(p: BrochureCard): unknown[] {
  const pills: Record<string, unknown>[] = [];
  if (p.stock > 0) pills.push(chip("READY TO DISPATCH", RTD_GREEN, "#ffffff") as Record<string, unknown>);
  if (p.isHot) pills.push(chip("HOT PRODUCT", HOT_ORANGE, "#ffffff") as Record<string, unknown>);
  if (p.isTop) pills.push(chip("TOP", INK, YELLOW) as Record<string, unknown>);
  return pills.map((c) => ({ columns: [{ ...c, width: "auto" }, { text: "", width: "*" }], margin: [0, 0, 0, 2.5], alignment: "left" }));
}

/* ── product card — mirrors the website ProductCard:
      image on top (badges above it), gold company label, name, SKU + pack,
      big rate /pc with struck MRP. 3 per row, visible outline. ── */

// 3 cards ("32%") + 2 spacers ("2%") per row
const CARD_W = CONTENT_W * 0.32;             // ≈172.6 outer cell
const CARD_INNER_W = CARD_W - 16;            // minus cell padding (14) + borders (1.6)

function productStack(p: BrochureCard, logo: string): unknown[] {
  const hasPrice = p.price != null && p.price > 0;
  const mrpHigher = p.mrp > (p.price ?? 0);

  const priceRow: unknown = hasPrice
    ? {
        columns: [
          { text: `₹${(p.price as number).toLocaleString("en-IN")}`, fontSize: 16, bold: true, color: INK },
          { text: "/pc", fontSize: 7.5, bold: true, color: GRAY, margin: [1.5, 6.5, 0, 0] },
          { text: [
              { text: "MRP ", fontSize: 6.6, bold: true, color: SOFT },
              { text: `₹${p.mrp.toLocaleString("en-IN")}`, fontSize: 9.2, bold: true, color: SOFT, decoration: mrpHigher ? "lineThrough" : undefined },
            ], margin: [6, 5.5, 0, 0] },
          { text: "", width: "*" },
        ],
        alignment: "left", margin: [0, 1, 0, 0],
      }
    : { text: "Login to View Price", fontSize: 10.5, bold: true, color: GRAY, italics: true, alignment: "center", margin: [0, 4, 0, 4] };

  return [
    ...badgesColumn(p),
    p.image
      ? { image: p.image, fit: [CARD_INNER_W, 140], alignment: "center", margin: [0, 1, 0, 5] }
      : logo
        ? { image: logo, fit: [72, 72], alignment: "center", opacity: 0.45, margin: [30, 26, 30, 34] }
        : { text: " ", margin: [0, 44] },
    { text: cut(p.company, 26).toUpperCase(), fontSize: 6.9, bold: true, color: BRAND_GOLD, characterSpacing: 0.7, alignment: "left", margin: [0, 0, 0, 1] },
    { text: cut(p.name, 78), fontSize: 9.3, bold: true, color: INK, alignment: "left", lineHeight: 1.12, margin: [0, 0, 0, 2] },
    { text: `SKU ${p.sku}  ·  ${p.packLabel}`, fontSize: 7.2, color: GRAY, alignment: "left", margin: [0, 0, 0, 3] },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 118, y2: 0, lineWidth: 0.9, lineColor: YELLOW }], margin: [0, 0, 0, 3.5], alignment: "left" },
    priceRow,
  ];
}

/* ── inline category bar (NO page break — products continue under it) ── */

function categoryBar(index: number, s: SectionInfo): unknown[] {
  return [
    {
      margin: [0, 7, 0, 0],
      columns: [
        { ...numChip(index + 1, 9), width: 30 },
        { stack: [
            { text: s.name.toUpperCase(), fontSize: 11.5, bold: true, color: INK, characterSpacing: 1.1, margin: [0, 1, 0, 1] },
            { text: `${s.count} product${s.count > 1 ? "s" : ""}${s.dept ? `  ·  ${s.dept}` : ""}`, fontSize: 7.4, color: GRAY },
          ], margin: [10, 0, 0, 0] },
        { text: "", width: "*" },
      ],
    },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 1.2, lineColor: YELLOW }], margin: [0, 4, 0, 6] },
  ];
}

/* ── cover — homepage-hero type design, brochure-standard content ── */

function coverContent(cards: BrochureCard[], sections: SectionInfo[], o: DocOpts): unknown[] {
  const c: unknown[] = [];
  const companies = new Set(cards.map((p) => p.company)).size;

  // warm cream backdrop + brand yellow top edge
  c.push({ absolutePosition: { x: 0, y: 0 }, canvas: [
    { type: "rect", x: 0, y: 0, w: A4_W, h: A4_H, color: CREAM },
    { type: "rect", x: 0, y: 0, w: A4_W, h: 8, color: YELLOW },
  ] });

  // logo chip — square logo centered inside the yellow chip
  if (o.logo) {
    c.push({ absolutePosition: { x: 40, y: 26 }, canvas: [{ type: "rect", x: 0, y: 0, w: 122, h: 48, color: YELLOW }] });
    c.push({ absolutePosition: { x: 82, y: 31 }, image: o.logo, width: 38 });
  }

  // headline block
  c.push({ absolutePosition: { x: 41, y: 94 }, text: "WHOLESALE  ·  B2B PRODUCT CATALOG", fontSize: 9, bold: true, color: INK, characterSpacing: 2.4 });
  c.push({ absolutePosition: { x: 38, y: 110 }, text: "OFFICIAL PRODUCT", fontSize: 30, bold: true, color: INK, characterSpacing: 0.6 });
  // yellow highlight block behind the accent word (hero-style two-tone title)
  c.push({ absolutePosition: { x: 36, y: 147 }, canvas: [{ type: "rect", x: 0, y: 0, w: 172, h: 42, color: YELLOW }] });
  c.push({ absolutePosition: { x: 40, y: 151 }, text: "CATALOG", fontSize: 30, bold: true, color: INK, characterSpacing: 0.6 });
  c.push({ absolutePosition: { x: 41, y: 200 }, text: o.titleScope.toUpperCase().slice(0, 62), fontSize: 11.5, bold: true, color: INK, characterSpacing: 1.1 });
  c.push({ absolutePosition: { x: 41, y: 220 }, text: `${o.monthName} Edition  ·  ${cards.length} Products Live  ·  ${sections.length} Categories`, fontSize: 9.5, color: GRAY });

  // homepage hero artwork band — full bleed width, no catalog product collage
  const HERO_H = 318;
  if (o.heroImage) {
    c.push({ absolutePosition: { x: 0, y: 246 }, image: o.heroImage, width: A4_W, height: HERO_H });
  } else {
    c.push({ absolutePosition: { x: 0, y: 246 }, canvas: [{ type: "rect", x: 0, y: 0, w: A4_W, h: HERO_H, color: "#fbe8b4" }] });
    c.push({ absolutePosition: { x: 0, y: 246 + HERO_H / 2 - 12 }, text: o.firmName.toUpperCase(), fontSize: 16, bold: true, color: BRAND_GOLD, alignment: "center", characterSpacing: 3 });
  }
  c.push({ absolutePosition: { x: 0, y: 246 + HERO_H }, canvas: [{ type: "rect", x: 0, y: 0, w: A4_W, h: 4, color: YELLOW }] });

  // ink stats band
  c.push({ absolutePosition: { x: 0, y: 572 }, canvas: [{ type: "rect", x: 0, y: 0, w: A4_W, h: 190, color: INK }] });
  const stats: [string, string][] = [
    ["PRODUCTS", String(cards.length)],
    ["COMPANIES", String(companies)],
    ["CATEGORIES", String(sections.length)],
  ];
  stats.forEach(([label, value], i) => {
    const x = 41 + i * 178;
    c.push({ absolutePosition: { x, y: 588 }, text: label, fontSize: 6.8, bold: true, color: YELLOW, characterSpacing: 1.8 });
    c.push({ absolutePosition: { x, y: 598 }, text: value, fontSize: 21, bold: true, color: "#ffffff" });
  });
  c.push({ absolutePosition: { x: 41, y: 646 }, canvas: [{ type: "line", x1: 0, y1: 0, x2: 513, y2: 0, lineWidth: 0.8, lineColor: "#374151" }] });
  c.push({ absolutePosition: { x: 41, y: 656 }, text: "WHAT'S INSIDE", fontSize: 6.8, bold: true, color: YELLOW, characterSpacing: 1.8 });
  c.push({ absolutePosition: { x: 41, y: 667 }, text: `${sections.length} live categories  ·  ${o.brands.length} brand storefronts  ·  ${o.tierLabel} tier pricing  ·  GST extra`, fontSize: 8.5, color: "#ffffff" });
  c.push({ absolutePosition: { x: 41, y: 688 }, text: `Version ${o.id}  ·  Generated ${o.generatedAtIST}  ·  rates valid till ${o.validTillIST}`, fontSize: 7.6, color: SOFT });

  // yellow order strip — keep flowing text ABOVE y≈797 (content-area bottom,
  // 842 - bottom margin): pdfmake pushes text absolutes past it to page 2
  c.push({ absolutePosition: { x: 0, y: 758 }, canvas: [{ type: "rect", x: 0, y: 0, w: A4_W, h: 84, color: YELLOW }] });
  c.push({ absolutePosition: { x: 41, y: 770 }, text: `ORDER ONLINE — ${o.siteDisplay.toUpperCase()}`, fontSize: 12.5, bold: true, color: INK, characterSpacing: 0.5, link: o.siteUrl });
  c.push({ absolutePosition: { x: 41, y: 786 }, text: [o.firmPhone ? `Call / WhatsApp ${o.firmPhone}` : "", "Prices exclusive of GST", "Tier pricing for approved B2B accounts"].filter(Boolean).join("   ·   "), fontSize: 8, bold: true, color: "#374151" });
  if (o.qr) {
    c.push({ absolutePosition: { x: 500, y: 764 }, canvas: [{ type: "rect", x: 0, y: 0, w: 62, h: 62, color: "#ffffff" }] });
    c.push({ absolutePosition: { x: 505, y: 769 }, image: o.qr, width: 52, height: 52 });
  }

  // move flow to page 2
  c.push({ text: " ", pageBreak: "after" });
  return c;
}

/* ── table of contents — one page, every end-level category as an image tile ── */

function tocContent(sections: SectionInfo[], o: DocOpts): unknown[] {
  const n = sections.length;

  // adaptive grid: pick the widest tiles that still fit ALL rows on this page
  const HEADER_H = 96;
  const NOTE_H = 30;
  const availH = A4_H - 34 - 44 - HEADER_H - NOTE_H - 24; // 24pt safety → never extends
  let cols = 4, tileW = 0, thumbH = 0;
  for (const cTry of [4, 5, 6, 7, 8]) {
    const w = (CONTENT_W * (100 - 2 * (cTry - 1))) / 100 / cTry;
    const th = Math.min(Math.round(w * 0.74), 96);
    const rowH = th + 62;
    if (Math.ceil(n / cTry) * rowH <= availH || cTry === 8) { cols = cTry; tileW = w; thumbH = th; break; }
  }
  const nameChars = cols <= 4 ? 40 : cols === 5 ? 32 : cols === 6 ? 26 : 22;
  const tilePct = (100 - 2 * (cols - 1)) / cols;

  const tileCell = (idx: number): unknown => {
    if (idx >= n) return gapCell();
    const s = sections[idx];
    const thumb: unknown = s.thumb
      ? { image: s.thumb, fit: [tileW - 12, thumbH], alignment: "center" }
      : o.logo
        ? { image: o.logo, fit: [thumbH * 0.62, thumbH * 0.62], alignment: "center", opacity: 0.4, margin: [0, thumbH * 0.12, 0, thumbH * 0.12] }
        : { text: " ", margin: [0, thumbH * 0.3] };
    return cardCell([
      { ...numChip(idx + 1, 6.8), margin: [0, 0, 0, 3] },
      thumb,
      { text: cut(s.dept || "", 24).toUpperCase(), fontSize: 5.8, bold: true, color: SOFT, characterSpacing: 0.6, alignment: "center", margin: [0, 3, 0, 0] },
      { text: cut(s.name, nameChars), fontSize: cols <= 5 ? 8.6 : 7.9, bold: true, color: INK, alignment: "center", lineHeight: 1.08 },
      { text: `${s.count} product${s.count > 1 ? "s" : ""}`, fontSize: 6.3, color: GRAY, alignment: "center", margin: [0, 1, 0, 0] },
    ]);
  };

  const rows: unknown[][] = [];
  const widths: string[] = [];
  for (let j = 0; j < cols; j++) {
    widths.push(`${tilePct}%`);
    if (j < cols - 1) widths.push("2%");
  }
  for (let i = 0; i < n; i += cols) {
    const cells: unknown[] = [];
    for (let j = 0; j < cols; j++) {
      cells.push(tileCell(i + j));
      if (j < cols - 1) cells.push(gapCell());
    }
    rows.push(cells);
  }

  return [
    { text: "TABLE OF CONTENTS", fontSize: 17, bold: true, color: INK, characterSpacing: 2, margin: [0, 6, 0, 3] },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 1.6, lineColor: YELLOW }], margin: [0, 0, 0, 4] },
    { text: `${o.firmName} · ${o.titleScope} · ${o.monthName}   —   every end-level category inside, all on this page`, fontSize: 9, color: GRAY, margin: [0, 4, 0, 14] },
    { table: { widths, body: rows }, layout: gridLayout(4, 4, 5, 5), dontBreakRows: true },
    { text: `Pack sizes, MRP and ${o.tierLabel} rates as of ${o.generatedAtIST}. Prices exclusive of GST.`, fontSize: 8, color: GRAY, italics: true, margin: [0, 12, 0, 0], pageBreak: "after" },
  ];
}

/* ── brands page — logo + clickable name per brand ── */

function brandsGrid(o: DocOpts): unknown[] {
  const head: unknown[] = [
    { text: "OUR BRANDS", fontSize: 17, bold: true, color: INK, characterSpacing: 2, margin: [0, 6, 0, 3] },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 1.6, lineColor: YELLOW }], margin: [0, 0, 0, 4] },
    { text: `${o.brands.length} brand storefronts — each brand name below is clickable and opens its online store`, fontSize: 9, color: GRAY, margin: [0, 4, 0, 14] },
  ];

  if (!o.brands.length) return [...head, { text: "Brand storefronts are being set up — every product card shows its company name.", fontSize: 9.5, color: GRAY, italics: true, margin: [0, 10, 0, 0] }];

  const tileCell = (b: BrochureBrand | null): unknown => {
    if (!b) return gapCell();
    const logoBlock: unknown = b.logo
      ? { image: b.logo, fit: [150, 52], alignment: "center", margin: [0, 2, 0, 5] }
      : { text: b.name.slice(0, 2).toUpperCase(), fontSize: 17, bold: true, color: "#d1d5db", alignment: "center", margin: [0, 16, 0, 18] };
    return cardCell([
      logoBlock,
      { text: (b.isFeatured ? "★ " : "") + cut(b.name, 30), fontSize: 10, bold: true, color: INK, alignment: "center", link: b.url, decoration: "underline", margin: [0, 0, 0, 1] },
      { text: `${b.skus} SKU${b.skus === 1 ? "" : "s"}${b.tagline ? `  ·  ${cut(b.tagline, 26)}` : ""}`, fontSize: 6.8, color: GRAY, alignment: "center", margin: [0, 0, 0, 2] },
      { text: "VISIT STORE →", fontSize: 6.6, bold: true, color: BRAND_GOLD, characterSpacing: 1, alignment: "center", link: b.url },
    ]);
  };

  const rows: unknown[][] = [];
  for (let i = 0; i < o.brands.length; i += 3) {
    const cells: unknown[] = [];
    for (let j = 0; j < 3; j++) {
      cells.push(tileCell(o.brands[i + j] || null));
      if (j < 2) cells.push(gapCell());
    }
    rows.push(cells);
  }

  return [
    ...head,
    { table: { widths: ["32%", "2%", "32%", "2%", "32%"], body: rows }, layout: gridLayout(8, 8, 7, 8), dontBreakRows: true },
    { text: "Store links work in the digital PDF — tap a brand name to open its storefront.", fontSize: 8, color: GRAY, italics: true, margin: [0, 10, 0, 0] },
  ];
}

/* ── end page — CTAs + clickable links ── */

function endContent(o: DocOpts): unknown[] {
  const digits = phoneDigits(o.firmPhone);
  const wa = digits ? `https://wa.me/${digits}` : "";
  const tel = digits ? `tel:+${digits}` : "";

  const linkRow = (label: string, url: string, display: string): unknown => ({
    margin: [0, 0, 0, 0],
    table: { widths: ["*", "auto"], body: [[
      { text: label, fontSize: 10.5, bold: true, color: INK, link: url, decoration: "underline", margin: [2, 5, 0, 5] },
      { text: display, fontSize: 7.8, color: GRAY, link: url, alignment: "right", margin: [0, 7, 2, 5] },
    ]] },
    layout: { hLineColor: () => CARD_LINE, vLineColor: () => "#ffffff", paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 0, paddingBottom: () => 0 },
  });

  const links: unknown[] = [];
  links.push(linkRow("Browse the full catalog online", `${o.siteUrl}/catalog`, `${o.siteDisplay}/catalog`));
  links.push(linkRow("Ready to Dispatch picks — in stock now", `${o.siteUrl}/catalog?flag=top`, `${o.siteDisplay}/catalog?flag=top`));
  links.push(linkRow("All brand storefronts", `${o.siteUrl}/brands`, `${o.siteDisplay}/brands`));
  if (tel) links.push(linkRow(`Call our order desk — ${o.firmPhone}`, tel, o.firmPhone));
  if (wa) links.push(linkRow("WhatsApp us your order list", wa, `wa.me/${digits}`));

  return [
    // hero CTA panel
    { table: { widths: ["*"], body: [[{ stack: [
        { text: "READY TO STOCK UP?", fontSize: 20, bold: true, color: "#ffffff", characterSpacing: 1.2 },
        { text: "Wholesale rates · live stock · order in minutes", fontSize: 9.5, bold: true, color: YELLOW, margin: [0, 4, 0, 0] },
      ] }]] },
      layout: { fillColor: () => INK, hLineColor: () => INK, vLineColor: () => INK, paddingLeft: () => 18, paddingRight: () => 18, paddingTop: () => 16, paddingBottom: () => 16 },
      margin: [0, 6, 0, 12] },

    // yellow order band (clickable)
    { table: { widths: ["*"], body: [[{ columns: [
        { text: "ORDER ONLINE", fontSize: 13, bold: true, color: INK, characterSpacing: 1.2, margin: [2, 4, 0, 4] },
        { text: o.siteUrl, fontSize: 10.5, bold: true, color: INK, link: o.siteUrl, decoration: "underline", alignment: "right", margin: [0, 5.5, 2, 4] },
      ] }]] },
      layout: { fillColor: () => YELLOW, hLineColor: () => YELLOW, vLineColor: () => YELLOW, paddingLeft: () => 14, paddingRight: () => 14, paddingTop: () => 6, paddingBottom: () => 6 },
      margin: [0, 0, 0, 12] },

    // clickable quick links
    { text: "QUICK LINKS — TAP ANY LINE", fontSize: 7.5, bold: true, color: SOFT, characterSpacing: 1.6, margin: [0, 0, 0, 5] },
    ...links,
    { text: "", margin: [0, 0, 0, 10] },

    // QR + firm block
    { columns: [
        ...(o.qr ? [{ width: 96, stack: [
          { image: o.qr, width: 88, alignment: "center" },
          { text: "SCAN → ORDER ONLINE", fontSize: 6.6, bold: true, color: INK, alignment: "center", characterSpacing: 1, margin: [0, 4, 0, 0] },
        ] }] : []),
        { width: "*", stack: [
          { text: o.firmName, fontSize: 13, bold: true, color: INK },
          { text: [o.firmPhone, o.siteDisplay].filter(Boolean).join("   ·   "), fontSize: 9, bold: true, color: GRAY, margin: [0, 2, 0, 0] },
          { text: `Homes · Shops · Businesses — all in one place. ${o.tierLabel} tier rates, live inventory, doorstep delivery.`, fontSize: 8.2, color: GRAY, margin: [0, 6, 0, 0], lineHeight: 1.3 },
        ], margin: [14, 4, 0, 0] },
      ] },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.8, lineColor: CARD_LINE }], margin: [0, 12, 0, 8] },

    // compact terms
    { text: "TERMS & CONDITIONS", fontSize: 8, bold: true, color: INK, characterSpacing: 1.4, margin: [0, 0, 0, 4] },
    { text: `1.  All rates shown are ${o.tierLabel} tier, exclusive of GST, and valid till ${o.validTillIST}.`, fontSize: 7.6, color: GRAY, margin: [0, 0, 0, 2.5] },
    { text: "2.  Minimum wholesale quantities apply on marked pack sizes. Damaged-goods claims within 48 hours of delivery.", fontSize: 7.6, color: GRAY, margin: [0, 0, 0, 2.5] },
    { text: `3.  Prices are live from inventory at generation time; catalog version ${o.id} supersedes all earlier price lists.`, fontSize: 7.6, color: GRAY },

    { text: `${o.firmName}  ·  ${o.monthName} Edition  ·  Version ${o.id}  ·  Generated ${o.generatedAtIST}`, fontSize: 7.5, color: GRAY, alignment: "center", margin: [0, 14, 0, 0] },
  ];
}

/* ── assemble ── */

/** Render a doc definition to a PDF buffer with the vfs-backed engine. */
export async function renderPdf(docDefinition: Record<string, unknown>): Promise<Buffer> {
  return (await pdfmake.createPdf(docDefinition as never).getBuffer()) as Buffer;
}

export function buildDocDefinition(cards: BrochureCard[], sections: SectionInfo[], o: DocOpts): Record<string, unknown> {
  const content: unknown[] = [];

  // derive sections from the cards themselves, keyed by sectionKey — duplicate
  // end-category names under different parents stay distinct; each section
  // carries its department caption + first product image for the TOC tiles
  const secs: SectionInfo[] = [];
  const keyMap = new Map<string, SectionInfo>();
  for (const p of cards) {
    const cur = keyMap.get(p.sectionKey);
    if (cur) cur.count += 1;
    else {
      const s: SectionInfo = { name: p.section, count: 1, dept: p.dept, thumb: p.image };
      keyMap.set(p.sectionKey, s);
      secs.push(s);
    }
  }
  void sections; // kept for API compatibility; key-derived list is authoritative

  /* 1 — cover (hero artwork + brochure content) */
  content.push(...coverContent(cards, secs, o));

  /* 2 — table of contents: every end category as an image tile, single page */
  content.push(...tocContent(secs, o));

  /* 3+ — product pages: continuous flow, inline category bars, 3 cards per row */
  let lastKey = "";
  let sectionIndex = -1;
  for (let i = 0; i < cards.length; i += 3) {
    if (cards[i].sectionKey !== lastKey) {
      lastKey = cards[i].sectionKey;
      sectionIndex += 1;
      const s = keyMap.get(cards[i].sectionKey) || { name: cards[i].section, count: 1, dept: cards[i].dept, thumb: "" };
      content.push(...categoryBar(sectionIndex, s));
    }
    const trio: unknown[] = [];
    for (let j = 0; j < 3; j++) {
      trio.push(cards[i + j] ? cardCell(productStack(cards[i + j], o.logo)) : gapCell());
      if (j < 2) trio.push(gapCell());
    }
    content.push({
      table: { widths: ["32%", "2%", "32%", "2%", "32%"], body: [trio] },
      layout: gridLayout(7, 7, 6, 7),
      // pdfmake's dontBreakRows only guards rows with rowIndex > 0 — every trio
      // is a single (row 0) table, so the whole node is marked unbreakable:
      // a row that does not fit the page moves to the next one intact.
      unbreakable: true,
    });
  }

  /* brands page (fresh page) */
  content.push({ text: " ", pageBreak: "before" });
  content.push(...brandsGrid(o));

  /* end page — CTAs + clickable links (fresh page) */
  content.push({ text: " ", pageBreak: "before" });
  content.push(...endContent(o));

  return {
    pageSize: "A4",
    pageMargins: [28, 34, 28, 44] as [number, number, number, number],
    defaultStyle: { font: "Roboto", fontSize: 9, color: "#1f2937" },
    header: (currentPage: number) => currentPage === 1 ? null : ({
      margin: [28, 12, 28, 0],
      columns: [
        { text: `${o.firmName} — Product Catalog`, fontSize: 7.5, bold: true, color: INK },
        { text: o.titleScope.slice(0, 48), fontSize: 7.5, color: GRAY, alignment: "right" },
      ],
    }),
    footer: (currentPage: number, pageCount: number) => currentPage === 1 ? null : ({
      margin: [28, 8, 28, 0],
      columns: [
        { text: `${o.firmName} · Catalog ${o.id}`, fontSize: 6.5, color: GRAY, alignment: "left" },
        { text: `Page ${currentPage} of ${pageCount}`, fontSize: 6.5, color: GRAY, alignment: "right" },
      ],
    }),
    info: { title: `${o.firmName} Catalog ${o.id}`, author: o.firmName, subject: `Official product catalog ${o.monthName}` },
    content,
  };
}
