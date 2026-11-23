// DMK Mart B2B - PRD generator (docx skill: R1 cover recipe + GO-1 palette, Profile A English)
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, NumberFormat, AlignmentType, HeadingLevel,
  WidthType, BorderStyle, ShadingType, SectionType, TableOfContents,
  TableLayoutType,
} = require("docx");
const fs = require("fs");
const path = require("path");

const A = require("./prd-content-a.js");
const B = require("./prd-content-b.js");
const C = require("./prd-content-c.js");
const blocks = [...A, ...B, ...C];

// ---------- Palette: GO-1 Graphite Orange (design-system: proposals / bidding / PRD) ----------
const PAL = {
  bg: "1A2330", primary: "FFFFFF", accent: "D4875A",
  cover: { titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078" },
  table: { headerBg: "D4875A", headerText: "FFFFFF", accentLine: "D4875A", innerLine: "DDD0C8", surface: "F8F0EB" },
};
const HEADING_COLOR = "1A2330"; // dark graphite for white-page headings (Dark Cover -> Light Table rule)
const BODY_COLOR = "000000";    // Profile A pure black body
const FONT = { ascii: "Times New Roman", eastAsia: "SimSun" };

const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

function safeText(v, ph) {
  if (v === undefined || v === null || v === "" || String(v) === "NaN" || String(v) === "undefined") return ph || "N/A";
  return String(v);
}

// ---------- Cover helpers (from design-system.md, verbatim logic) ----------
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([..."\uFF0C\u3002\u3001\uFF1B\uFF1A\uFF01\uFF1F", ..."-_/", ..." \t"]);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
      }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop();
    lines[lines.length - 1] += last;
  }
  return lines;
}

function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 20;
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt;
  let lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    lines = splitTitleLines(title, charsPerLine(minPt));
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

function calcCoverSpacing(params) {
  const {
    titleLineCount = 1, titlePt = 36, hasSubtitle = false,
    hasEnglishLabel = false, metaLineCount = 0,
    fixedHeight = 800, pageHeight = 16838,
    marginTop = 0, marginBottom = 0,
  } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

// ---------- Recipe R1: Pure Paragraph Cover (Left-Aligned) ----------
function buildCoverR1(config) {
  const P = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length,
    fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "),
        size: 18, color: P.accent, font: { ascii: "Calibri", eastAsia: "SimHei" }, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true,
        color: P.titleColor, font: { eastAsia: "SimHei", ascii: "Arial" } })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: P.subtitleColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: P.metaColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: P.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: P.footerColor, font: { ascii: "Arial" } }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders,
        children,
      })],
    })],
  })];
}

// ---------- Body builders ----------
function heading(text, level) {
  return new Paragraph({ heading: level, children: [new TextRun({ text: safeText(text), bold: true, color: HEADING_COLOR, font: FONT })] });
}
function body(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 120 },
    children: [new TextRun({ text: safeText(text), size: 24, color: BODY_COLOR, font: FONT })],
  });
}
function caption(text) {
  return new Paragraph({
    keepNext: true, spacing: { before: 220, after: 90, line: 312 },
    children: [new TextRun({ text: safeText(text), bold: true, size: 21, color: HEADING_COLOR, font: FONT })],
  });
}
function cellPara(text, opts) {
  const o = opts || {};
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: 276 },
    children: [new TextRun({ text: safeText(text), size: 21, bold: !!o.bold, color: o.color || BODY_COLOR, font: FONT })],
  });
}
function buildTable(spec) {
  const widths = spec.widths;
  const headerRow = new TableRow({
    tableHeader: true, cantSplit: true,
    children: spec.headers.map((h, i) => new TableCell({
      children: [cellPara(h, { bold: true, color: PAL.table.headerText })],
      shading: { type: ShadingType.CLEAR, fill: PAL.table.headerBg },
      margins: { top: 70, bottom: 70, left: 120, right: 120 },
      width: { size: widths[i], type: WidthType.PERCENTAGE },
    })),
  });
  const dataRows = spec.rows.map((r, ri) => new TableRow({
    cantSplit: true,
    children: r.map((v, i) => new TableCell({
      children: [cellPara(v)],
      shading: ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: PAL.table.surface } : undefined,
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      width: { size: widths[i], type: WidthType.PERCENTAGE },
    })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: PAL.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: PAL.table.accentLine },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: PAL.table.innerLine },
      insideVertical: NB,
    },
    rows: [headerRow, ...dataRows],
  });
}

const bodyChildren = [];
for (const b of blocks) {
  if (b.h1) bodyChildren.push(heading(b.h1, HeadingLevel.HEADING_1));
  else if (b.h2) bodyChildren.push(heading(b.h2, HeadingLevel.HEADING_2));
  else if (b.h3) bodyChildren.push(heading(b.h3, HeadingLevel.HEADING_3));
  else if (b.p) bodyChildren.push(body(b.p));
  else if (b.table) { bodyChildren.push(caption(b.table.title)); bodyChildren.push(buildTable(b.table)); }
}

// ---------- Front matter (Roman section): document control + TOC ----------
const frontMatter = [
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 300, after: 240, line: 312 },
    children: [new TextRun({ text: "Document Control", bold: true, size: 30, color: HEADING_COLOR, font: FONT })],
  }),
  buildTable({ widths: [30, 70], headers: ["Field", "Value"], rows: [
    ["Document title", "DMK Mart B2B Commerce Platform - Product Requirements Document"],
    ["Version / status", "2.0 - Living specification"],
    ["Date", "23 November 2026"],
    ["Prepared for", "DMK Mart (B2B wholesale and distribution)"],
    ["Coverage", "Ecommerce website, Admin panel, Sales Team Portal, Warehouse Manager Portal, ERP integration"],
    ["Distribution", "Internal - product, engineering and operations teams"],
  ]}),
  new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: "", size: 2 })] }),
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 420, after: 360, line: 312 },
    children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, color: HEADING_COLOR, font: FONT })],
  }),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
  new Paragraph({
    spacing: { before: 200 },
    children: [new TextRun({
      text: "Note: This Table of Contents is generated via field codes. To ensure page number accuracy after editing, please right-click the TOC and select \"Update Field.\"",
      italics: true, size: 18, color: "888888", font: FONT,
    })],
  }),
];

// ---------- Footers / header ----------
function pageFooter(colorHex) {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: colorHex, font: FONT })],
    })],
  });
}
const bodyHeader = new Header({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: PAL.table.innerLine, space: 4 } },
    children: [new TextRun({ text: "DMK Mart B2B Commerce Platform - Product Requirements Document", size: 18, color: "808080", font: FONT })],
  })],
});

// ---------- Assembly ----------
const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

const doc = new Document({
  creator: "DMK Mart",
  title: "DMK Mart B2B Commerce Platform - Product Requirements Document",
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 24, color: BODY_COLOR },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: FONT, size: 32, bold: true, color: HEADING_COLOR },
        paragraph: { spacing: { before: 400, after: 180, line: 312 }, keepNext: true },
      },
      heading2: {
        run: { font: FONT, size: 28, bold: true, color: HEADING_COLOR },
        paragraph: { spacing: { before: 280, after: 130, line: 312 }, keepNext: true },
      },
      heading3: {
        run: { font: FONT, size: 26, bold: true, color: HEADING_COLOR },
        paragraph: { spacing: { before: 220, after: 110, line: 312 }, keepNext: true },
      },
    },
  },
  sections: [
    { // Section 1: Cover - margin 0, no footer, no page numbers
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1({
        title: "DMK Mart B2B Platform",
        subtitle: "Product Requirements Document",
        englishLabel: "PRODUCT REQUIREMENTS",
        metaLines: [
          "Covers: Ecommerce Website, Admin Panel, Sales Team Portal, Warehouse Manager Portal",
          "Version 2.0 | Status: Living specification",
          "Prepared for: DMK Mart - B2B Wholesale and Distribution",
          "Date: 23 November 2026",
        ],
        footerLeft: "DMK Mart B2B Commerce Platform",
        footerRight: "Confidential - Internal Use",
        palette: { bg: PAL.bg, titleColor: PAL.cover.titleColor, subtitleColor: PAL.cover.subtitleColor, metaColor: PAL.cover.metaColor, accent: PAL.accent, footerColor: PAL.cover.footerColor },
      }),
    },
    { // Section 2: Front matter - Roman numerals
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      footers: { default: pageFooter("888888") },
      children: frontMatter,
    },
    { // Section 3: Body - Arabic numerals restart at 1
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: bodyHeader },
      footers: { default: pageFooter("808080") },
      children: bodyChildren,
    },
  ],
});

const outPath = path.join("/home/z/my-project/download", "DMK-Mart-B2B-PRD.docx");
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log("WROTE", outPath, buf.length, "bytes;", "blocks:", blocks.length, "; body elements:", bodyChildren.length);
});
