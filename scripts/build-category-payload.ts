/**
 * Build the final category payload: cleaned top/mid/end names + assignments per DB sku.
 * Output: scripts/category-payload.json  { tops, assignments }
 */
import fs from "fs";

const d = JSON.parse(fs.readFileSync("/home/z/my-project/scripts/category-assignments.json", "utf8"));

// ── clean/display overrides (Excel name -> storefront name) ──
const TOP_MAP: Record<string, { name: string; emoji: string; color: string }> = {
  "NV PRODUCTS-FERIWALA": { name: "NV Products & Feriwala", emoji: "🧺", color: "#f59e0b" },
  "KITCHEN WARE": { name: "Kitchen Ware", emoji: "🍽️", color: "#ef4444" },
  "Gardening Tools & Planters": { name: "Gardening Tools & Planters", emoji: "🌱", color: "#16a34a" },
  "Clening & HouseHolds": { name: "Cleaning & Households", emoji: "🧹", color: "#0d9488" },
  "Kitchen Equipments Commercial": { name: "Commercial Kitchen Equipments", emoji: "🍳", color: "#ea580c" },
  "Furniture": { name: "Furniture", emoji: "🪑", color: "#a16207" },
  "HouseHold Unbreakable": { name: "Household Unbreakable", emoji: "🪣", color: "#7c3aed" },
  "Home Decor": { name: "Home Decor", emoji: "🪔", color: "#db2777" },
  "WATER JAR  & BOTTLE": { name: "Water Jar & Bottles", emoji: "💧", color: "#0891b2" },
};
const MID_MAP: Record<string, string> = {
  "Home furniture, chairs, tables, etc": "Home Furniture & More",
  "SKY": "Sky Series",
  "Pots For plants": "Pots For Plants",
  "100% Pure Virgin Quality Plastic": "Virgin Plastic Series",
  "MAHANANDA UNBREAKABLE": "Mahananda Unbreakable",
  "HOT-POT PLASTIC & STAINLESS STEAL": "Hot Pots (Plastic & Steel)",
  "SLICER & SS PRODUCTS": "Slicers & SS Products",
  "Ap Plastic": "AP Plastic",
  "Black": "Black Series",
  "PARIVAR PLASTICS": "Parivar Plastics",
  "POSAI": "Posai",
  "SS BOTTLE": "SS Bottles",
  "Bucket Mops & Other Products": "Bucket Mops & Other Products",
  "Steel King Cleaning": "Steel King Cleaning",
  "Gardening Tools": "Gardening Tools",
  "Goldex Kitchen Equipments": "Goldex Kitchen Equipments",
  "Mauli Plastic": "Mauli Plastic",
  "Shradha": "Shradha",
  "Deep Plastic": "Deep Plastic",
  "Mahananda Cleaning Products": "Mahananda Cleaning Products",
};
function cleanEnd(s: string): string {
  let t = s.trim().replace(/’/g, "'").replace(/'/g, "");
  t = t
    .replace(/^Stool's$/i, "Stools").replace(/^Tub's$/i, "Tubs")
    .replace(/Watter/g, "Water")
    .replace(/\s+/g, " ")
    .replace(/ !$/, "")
    .trim();
  // Title-case ALL-CAPS names longer than 4 chars for readability, keep acronyms <=4
  if (/^[A-Z0-9 &()\/\-\.]+$/.test(t) && t.length > 4) {
    t = t.toLowerCase().replace(/(^|[\s(\/&-])([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());
    t = t.replace(/\bSs\b/g, "SS").replace(/\bNv\b/g, "NV").replace(/\bGn\b/g, "GN").replace(/\bHd\b/g, "HD");
  }
  return t;
}

const rows = d.assignments.filter((x: any) => TOP_MAP[x.top.trim()]);
// count products per top for sort order
const topCount = new Map<string, number>();
const seenSku = new Set<string>();
for (const r of rows) {
  if (seenSku.has(r.dbSku)) continue;
  seenSku.add(r.dbSku);
  topCount.set(r.top, (topCount.get(r.top) || 0) + 1);
}
const tops = [...topCount.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([excelName, n], i) => ({
    excelName,
    name: TOP_MAP[excelName].name,
    emoji: TOP_MAP[excelName].emoji,
    color: TOP_MAP[excelName].color,
    sortOrder: (i + 1) * 10,
    products: n,
  }));

const assignments = rows.map((r: any) => ({
  sku: r.dbSku,
  top: TOP_MAP[r.top.trim()].name,
  mid: MID_MAP[r.mid.trim()] || r.mid.trim(),
  end: cleanEnd(r.end),
}));

fs.writeFileSync("/home/z/my-project/scripts/category-payload.json", JSON.stringify({ tops, assignments }, null, 1));
console.log(`tops: ${tops.length}`);
tops.forEach((t) => console.log(`  ${t.sortOrder}. ${t.emoji} ${t.name} (${t.products} products)`));
console.log(`assignments: ${assignments.length}`);
// distinct mids/ends sanity
const mids = new Set(assignments.map((a) => `${a.top}|${a.mid}`));
const ends = new Set(assignments.map((a) => `${a.top}|${a.mid}|${a.end}`));
console.log(`distinct mids: ${mids.size}, distinct ends: ${ends.size}`);
