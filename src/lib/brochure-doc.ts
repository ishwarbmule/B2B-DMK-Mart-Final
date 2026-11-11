/**
 * Brochure / Catalog DOC BUILDER (pure — no database, no path aliases).
 *
 * Design v2 — print-brochure standard:
 *   • full-bleed dark cover with a 6-tile product collage ("full screen products")
 *   • table of contents on its own page
 *   • every section starts on a fresh page
 *   • big 2-column cards: large image, name + SKU, pack size, BIG MRP + BIG rate,
 *     badge chips (READY TO DISPATCH / TOP / HOT) — no description, no stock text
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
const INK = "#111111";
const GRAY = "#6b7280";
const SOFT = "#9ca3af";
const CARD_LINE = "#ececf1";

export interface BrochureCard {
  id: string; sku: string; name: string; company: string;
  packLabel: string; image: string;               // image = dataURL (or "")
  price: number | null; mrp: number;
  stock: number; low: number;
  isTop: boolean; isHot: boolean;
  section: string; sectionKey: string;
}

export interface SectionInfo { name: string; count: number }

export interface DocOpts {
  firmName: string; firmPhone: string;
  logo: string;                                   // dataURL (or "")
  qr: string;                                     // dataURL (or "")
  id: string; generatedAtIST: string; validTillIST: string;
  titleScope: string; monthName: string;
  tierLabel: string;                              // "DEALER" | "TIER1"…
  siteDisplay: string;
}

const A4_W = 595.28;
const A4_H = 841.89;

/* ── badge chips (filled table cells = pill look, no radius support) ── */

function chip(label: string, bg: string, fg: string): unknown {
  return {
    table: { widths: [label.length * 4.1 + 14], body: [[{ text: label, fontSize: 6.6, bold: true, color: fg, alignment: "center", characterSpacing: 0.9 }]] },
    layout: { fillColor: () => bg, hLineColor: () => bg, vLineColor: () => bg, paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 3.2, paddingBottom: () => 3.2 },
  };
}

function badgesRow(p: BrochureCard): unknown[] {
  const chips: Record<string, unknown>[] = [];
  if (p.stock > 0) chips.push(chip("READY TO DISPATCH", "#16a34a", "#ffffff") as Record<string, unknown>);
  if (p.isTop) chips.push(chip("TOP", INK, YELLOW) as Record<string, unknown>);
  if (p.isHot) chips.push(chip("HOT", YELLOW, INK) as Record<string, unknown>);
  if (!chips.length) return [];
  const cols: unknown[] = [];
  for (const c of chips) cols.push({ ...c, width: "auto" });
  cols.push({ text: "", width: "*" });
  return [{ columns: cols, margin: [0, 0, 0, 7], alignment: "left" }];
}

/* ── product card (2-per-row, big image, big price) ── */

function productCell(p: BrochureCard, logo: string): unknown {
  const hasPrice = p.price != null && p.price > 0;
  const mrpHigher = p.mrp > (p.price ?? 0);
  const unitSuffix = /^1 /.test(p.packLabel) ? "" : ` / ${p.packLabel.replace(/^(Pack|Box) of /i, "")}`;

  const priceBlock: unknown[] = hasPrice
    ? [
        { text: [{ text: "MRP ", fontSize: 8, bold: true, color: SOFT }, { text: `₹${p.mrp.toLocaleString("en-IN")}`, fontSize: 10, bold: true, color: SOFT, decoration: mrpHigher ? "lineThrough" : undefined }], alignment: "center", margin: [0, 0, 0, 1.5] },
        {
          columns: [
            { text: `₹${(p.price as number).toLocaleString("en-IN")}`, fontSize: 16, bold: true, color: INK },
            { text: unitSuffix, fontSize: 8.5, bold: true, color: GRAY, margin: [0, 6.5, 0, 0] },
          ],
          alignment: "center", margin: [0, 0, 0, 0],
        },
      ]
    : [{ text: "Login to View Price", fontSize: 11, bold: true, color: GRAY, italics: true, alignment: "center", margin: [0, 5, 0, 5] }];

  return {
    stack: [
      ...badgesRow(p),
      p.image
        ? { image: p.image, fit: [200, 152], alignment: "center", margin: [0, 2, 0, 7] }
        : logo
          ? { image: logo, fit: [80, 80], alignment: "center", opacity: 0.5, margin: [36, 24, 36, 30] }
          : { text: " ", margin: [0, 46] },
      { text: p.name, fontSize: 10.3, bold: true, color: INK, alignment: "center", margin: [0, 0, 0, 2], lineHeight: 1.12 },
      { text: `SKU  ${p.sku}  ·  ${p.company}`, fontSize: 7.8, color: GRAY, alignment: "center", margin: [0, 0, 0, 3.5] },
      { canvas: [{ type: "line", x1: 52, y1: 0, x2: 154, y2: 0, lineWidth: 0.8, lineColor: YELLOW }], margin: [0, 0, 0, 4] },
      { text: p.packLabel, fontSize: 9, bold: true, color: INK, alignment: "center", margin: [0, 0, 0, 3] },
      ...priceBlock,
    ],
    margin: [8, 8, 8, 10],
    alignment: "center",
  };
}

/* ── section header (every section starts a fresh page) ── */

function sectionHeader(index: number, s: SectionInfo, first: boolean): unknown[] {
  return [
    {
      ...(first ? {} : { pageBreak: "before" }),
      columns: [
        { table: { widths: [26], body: [[{ text: String(index + 1).padStart(2, "0"), fontSize: 10, bold: true, color: YELLOW, alignment: "center" }]] },
          layout: { fillColor: () => INK, hLineColor: () => INK, vLineColor: () => INK, paddingTop: () => 3.5, paddingBottom: () => 3.5 } , width: 30 },
        { stack: [
            { text: s.name.toUpperCase(), fontSize: 12.5, bold: true, color: INK, characterSpacing: 1.2, margin: [0, 1, 0, 1] },
            { text: `${s.count} product${s.count > 1 ? "s" : ""}`, fontSize: 7.8, color: GRAY },
          ], margin: [10, 0, 0, 0] },
        { text: "", width: "*" },
      ],
    },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 539, y2: 0, lineWidth: 1.3, lineColor: YELLOW }], margin: [0, 4, 0, 8] },
  ];
}

/* ── cover (full-bleed dark, product collage) ── */

function coverContent(cards: BrochureCard[], sections: SectionInfo[], o: DocOpts): unknown[] {
  const c: unknown[] = [];
  // backdrop
  c.push({ absolutePosition: { x: 0, y: 0 }, canvas: [
    { type: "rect", x: 0, y: 0, w: A4_W, h: A4_H, color: INK },
    { type: "rect", x: 0, y: 0, w: A4_W, h: 8, color: YELLOW },
  ] });

  // logo chip — square logo centered inside the yellow chip (203×205 source)
  if (o.logo) {
    c.push({ absolutePosition: { x: 40, y: 30 }, canvas: [{ type: "rect", x: 0, y: 0, w: 122, h: 48, color: YELLOW }] });
    c.push({ absolutePosition: { x: 82, y: 35 }, image: o.logo, width: 38 });
  }

  // headline block
  c.push({ absolutePosition: { x: 41, y: 98 }, text: "WHOLESALE  ·  B2B PRODUCT CATALOG", fontSize: 9, bold: true, color: YELLOW, characterSpacing: 2.6 });
  c.push({ absolutePosition: { x: 38, y: 114 }, text: "OFFICIAL PRODUCT", fontSize: 31, bold: true, color: "#ffffff", characterSpacing: 0.6 });
  c.push({ absolutePosition: { x: 38, y: 150 }, text: "CATALOG", fontSize: 31, bold: true, color: YELLOW, characterSpacing: 0.6 });
  c.push({ absolutePosition: { x: 41, y: 194 }, text: o.titleScope.toUpperCase().slice(0, 62), fontSize: 11.5, bold: true, color: "#ffffff", characterSpacing: 1.1 });
  c.push({ absolutePosition: { x: 41, y: 214 }, text: `${o.monthName} Edition  ·  ${cards.length} Products Live`, fontSize: 9.5, color: SOFT });

  // full-bleed product collage — 3 × 2 tiles
  const tileW = A4_W / 3;
  const tileH = 178;
  const y0 = 242;
  const withImg = cards.filter((p) => p.image).slice(0, 6);
  for (let i = 0; i < 6; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    const x = col * tileW, y = y0 + row * tileH;
    const img = withImg[i]?.image;
    if (img) {
      c.push({ absolutePosition: { x: Math.round(x * 10) / 10, y }, image: img, width: Math.round(tileW * 10) / 10, height: tileH });
    } else {
      c.push({ absolutePosition: { x: Math.round(x * 10) / 10, y }, canvas: [{ type: "rect", x: 0, y: 0, w: tileW, h: tileH, color: "#1f2937" }] });
      c.push({ absolutePosition: { x: Math.round(x * 10) / 10, y: y + tileH / 2 - 8 }, text: "DMK MART", fontSize: 10, bold: true, color: YELLOW, alignment: "center", characterSpacing: 2 });
    }
  }
  c.push({ absolutePosition: { x: 0, y: y0 + 2 * tileH }, canvas: [{ type: "rect", x: 0, y: 0, w: A4_W, h: 5, color: YELLOW }] });

  // stats band
  const stats: [string, string][] = [
    ["PRODUCTS", String(cards.length)],
    ["COMPANIES", String(new Set(cards.map((p) => p.company)).size)],
    ["SECTIONS", String(sections.length)],
  ];
  stats.forEach(([label, value], i) => {
    const x = 41 + i * 178;
    c.push({ absolutePosition: { x, y: 638 }, text: label, fontSize: 6.8, bold: true, color: YELLOW, characterSpacing: 1.8 });
    c.push({ absolutePosition: { x, y: 648 }, text: value, fontSize: 21, bold: true, color: "#ffffff" });
  });
  c.push({ absolutePosition: { x: 41, y: 690 }, text: `Version ${o.id}  ·  Generated ${o.generatedAtIST}  ·  ${o.tierLabel} rates valid till ${o.validTillIST}`, fontSize: 7.6, color: SOFT });

  // order strip
  c.push({ absolutePosition: { x: 0, y: 762 }, canvas: [{ type: "rect", x: 0, y: 0, w: A4_W, h: 80, color: YELLOW }] });
  c.push({ absolutePosition: { x: 41, y: 780 }, text: `ORDER ONLINE — ${o.siteDisplay.toUpperCase()}`, fontSize: 12.5, bold: true, color: INK, characterSpacing: 0.5 });
  c.push({ absolutePosition: { x: 41, y: 801 }, text: [o.firmPhone ? `Call / WhatsApp ${o.firmPhone}` : "", "Prices exclusive of GST", "Tier pricing for approved B2B accounts"].filter(Boolean).join("   ·   "), fontSize: 8, bold: true, color: "#374151" });
  if (o.qr) {
    c.push({ absolutePosition: { x: 500, y: 770 }, canvas: [{ type: "rect", x: 0, y: 0, w: 62, h: 62, color: "#ffffff" }] });
    c.push({ absolutePosition: { x: 505, y: 775 }, image: o.qr, width: 52, height: 52 });
  }

  // move flow to page 2
  c.push({ text: " ", pageBreak: "after" });
  return c;
}

/* ── table of contents (own page) ── */

function tocContent(sections: SectionInfo[], o: DocOpts): unknown[] {
  const rows: unknown[][] = [];
  for (let i = 0; i < sections.length; i += 2) {
    const mk = (idx: number): unknown => {
      if (idx >= sections.length) return { text: "" };
      const s = sections[idx];
      return { columns: [
        { table: { widths: [20], body: [[{ text: String(idx + 1).padStart(2, "0"), fontSize: 8.5, bold: true, color: YELLOW, alignment: "center" }]] },
          layout: { fillColor: () => INK, hLineColor: () => INK, vLineColor: () => INK, paddingTop: () => 3, paddingBottom: () => 3 }, width: 26, margin: [0, 1, 0, 0] },
        { stack: [
            { text: s.name, fontSize: 10.5, bold: true, color: INK },
            { text: `${s.count} product${s.count > 1 ? "s" : ""}`, fontSize: 7.6, color: GRAY },
          ], margin: [8, 1, 0, 0] },
      ] };
    };
    rows.push([mk(i), mk(i + 1)]);
  }
  return [
    { text: "TABLE OF CONTENTS", fontSize: 17, bold: true, color: INK, characterSpacing: 2, margin: [0, 6, 0, 3] },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 539, y2: 0, lineWidth: 1.6, lineColor: YELLOW }], margin: [0, 0, 0, 4] },
    { text: `${o.firmName} · ${o.titleScope} · ${o.monthName}`, fontSize: 9, color: GRAY, margin: [0, 4, 0, 14] },
    { table: { widths: ["50%", "50%"], body: rows },
      layout: { hLineColor: () => "#f3f4f6", vLineColor: () => "#f3f4f6", paddingLeft: () => 6, paddingRight: () => 10, paddingTop: () => 5, paddingBottom: () => 5 } },
    { text: `Pack sizes, MRP and ${o.tierLabel} rates as of ${o.generatedAtIST}. Prices exclusive of GST.`, fontSize: 8, color: GRAY, italics: true, margin: [0, 16, 0, 0], pageBreak: "after" },
  ];
}

/* ── assemble ── */

/** Render a doc definition to a PDF buffer with the vfs-backed engine. */
export async function renderPdf(docDefinition: Record<string, unknown>): Promise<Buffer> {
  return (await pdfmake.createPdf(docDefinition as never).getBuffer()) as Buffer;
}

export function buildDocDefinition(cards: BrochureCard[], sections: SectionInfo[], o: DocOpts): Record<string, unknown> {
  const content: unknown[] = [];

  /* 1 — cover */
  content.push(...coverContent(cards, sections, o));

  /* 2 — table of contents (fresh page) */
  content.push(...tocContent(sections, o));

  /* 3+ — product sections, each on a fresh page */
  let lastKey = "";
  let sectionIndex = -1;
  let rowOnPage = 0;
  for (let i = 0; i < cards.length; i += 2) {
    if (cards[i].sectionKey !== lastKey) {
      lastKey = cards[i].sectionKey;
      sectionIndex += 1;
      rowOnPage = 0;
      const s = sections.find((x) => x.name === cards[i].section) || { name: cards[i].section, count: 1 };
      content.push(...sectionHeader(sectionIndex, s, sectionIndex === 0));
    }
    const pair = [productCell(cards[i], o.logo), cards[i + 1] ? productCell(cards[i + 1], o.logo) : { text: "" }];
    // deterministic pagination: exactly 2 card rows per page — break after the
    // 2nd row unless the section continues on the next page via its own header
    rowOnPage += 1;
    const moreRowsInThisSection = cards[i + 2] && cards[i + 2].sectionKey === cards[i].sectionKey;
    const breakNow = rowOnPage === 2 && moreRowsInThisSection;
    if (breakNow) rowOnPage = 0;
    content.push({
      ...(breakNow ? { pageBreak: "after" } : {}),
      table: { widths: ["50%", "50%"], body: [pair] },
      layout: { hLineColor: () => CARD_LINE, vLineColor: () => CARD_LINE, paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 3, paddingBottom: () => 3 },
    });
  }

  /* closing — terms + QR (fresh page) */
  content.push(
    { text: " ", pageBreak: "before" },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 539, y2: 0, lineWidth: 1.4, lineColor: INK }], margin: [0, 0, 0, 10] },
    { columns: [
        { width: "*", stack: [
            { text: "TERMS & CONDITIONS", fontSize: 11, bold: true, color: INK, characterSpacing: 1.4, margin: [0, 0, 0, 8] },
            { text: `1.  All rates shown are ${o.tierLabel} tier, exclusive of GST, and valid till ${o.validTillIST}.`, fontSize: 8.6, color: GRAY, margin: [0, 0, 0, 4] },
            { text: "2.  Minimum wholesale quantities apply on marked pack sizes. Damaged-goods claims within 48 hours of delivery.", fontSize: 8.6, color: GRAY, margin: [0, 0, 0, 4] },
            { text: "3.  Prices are live from DMK Mart inventory at generation time; tier pricing applies to approved B2B accounts.", fontSize: 8.6, color: GRAY, margin: [0, 0, 0, 4] },
            { text: `4.  Catalog version ${o.id} supersedes all earlier price lists and printouts.`, fontSize: 8.6, color: GRAY },
          ] },
        ...(o.qr ? [{ width: 92, stack: [{ image: o.qr, width: 84, alignment: "right" }, { text: "SCAN → ORDER ONLINE", fontSize: 7, bold: true, color: INK, alignment: "center", margin: [0, 4, 0, 0] }] }] : []),
      ] },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 539, y2: 0, lineWidth: 0.8, lineColor: CARD_LINE }], margin: [0, 12, 0, 8] },
    { text: `${o.firmName}${o.firmPhone ? `  ·  ${o.firmPhone}` : ""}  ·  ${o.siteDisplay}`, fontSize: 9.5, bold: true, color: INK, alignment: "center" },
    { text: `${o.monthName} Edition · Version ${o.id} · Generated ${o.generatedAtIST}`, fontSize: 7.5, color: GRAY, alignment: "center", margin: [0, 3, 0, 0] },
  );

  return {
    pageSize: "A4",
    pageMargins: [28, 34, 28, 44] as [number, number, number, number],
    defaultStyle: { font: "Roboto", fontSize: 9, color: "#1f2937" },
    dontBreakRows: true, // card rows (tables) never split across pages
    header: (currentPage: number) => currentPage === 1 ? null : ({
      margin: [28, 12, 28, 0],
      columns: [
        { text: `${o.firmName} — Product Catalog`, fontSize: 7.5, bold: true, color: INK },
        { text: o.titleScope.slice(0, 48), fontSize: 7.5, color: GRAY, alignment: "right" },
      ],
    }),
    footer: (currentPage: number, pageCount: number) => ({
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
