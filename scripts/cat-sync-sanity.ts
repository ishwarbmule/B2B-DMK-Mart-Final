/**
 * Offline sanity harness for the ERP category sync logic — no DB, no ERP:
 * imports only pure functions and exercises the detection regexes, the name
 * cleaner and row normalization exactly as the sync engine will.
 */
import { normalizeProductRow, autoDetectMapping, type ProductMapping } from "../src/lib/erp-direct-sync";

// detectCatCols is private — exercise its regexes through autoDetectMapping's
// shape by stubbing describeErpTable… not exported either. Instead: replicate
// the exact regex list here AND assert against the real ERP column list.
const CAT_REGEX = {
  top: [/^top[_\-]?level[_\-]?cat/i, /^top[_\-]?cat/i, /^department$/i, /^dept$/i],
  mid: [/sub[_\-]?cat/i, /mid[_\-]?cat/i, /sub[_\-]?dept/i],
  end: [/^end[_\-]?level[_\-]?cat/i, /^end[_\-]?cat/i, /last[_\-]?cat/i],
};
const ERP_PRODUCT_COLS = ["id", "firmId", "sku", "name", "category", "brand", "unit", "hsnCode", "gstRate",
  "purchaseCost", "packQty", "packPrice", "packDiscountPercent", "tier1Distributor", "tier2Wholesale",
  "tier3SemiWholesale", "tier4Retailer", "tier5Mrp", "stockQuantity", "reservedQty", "damagedStock",
  "lowStockThreshold", "manufacturerVendorId", "weightGrams", "piecesPerBox", "barcode", "photoUrl",
  "imageFileName", "imageVerified", "imageMatchName", "imageVerifiedAt", "sourcePortal", "isActive",
  "createdAt", "updatedAt", "company", "alternateName", "top_level_category", "end_level_category",
  "delivery_rate", "endCategory", "deliveryRate"];

const find = (res: RegExp[]) => ERP_PRODUCT_COLS.find((c) => res.some((r) => r.test(c))) || "";
const det = { top: find(CAT_REGEX.top), mid: find(CAT_REGEX.mid), end: find(CAT_REGEX.end) };
console.log("detection on real ERP columns:", det);
if (det.top !== "top_level_category") throw new Error("top detection wrong: " + det.top);
if (det.end !== "end_level_category") throw new Error("end detection wrong: " + det.end);
if (det.mid !== "") throw new Error("mid detection should be empty on this ERP, got: " + det.mid);

const m: ProductMapping = {
  table: "Product", skuCol: "sku", nameCol: "name", companyCol: "company",
  mrpCol: "tier5Mrp", rateCol: "tier4Retailer", stockCol: "stockQuantity", imageCol: "photoUrl",
  activeCol: "isActive", unitCol: "unit", packQtyCol: "packQty", piecesPerBoxCol: "piecesPerBox",
  hsnCol: "hsnCode", gstCol: "gstRate", weightCol: "weightGrams", tier4Col: "tier4Retailer", tier5Col: "tier5Mrp",
  topCatCol: "top_level_category", endCatCol: "end_level_category",
  columns: ["sku", "name", "company"],
};

const rows = [
  { id: "p1", sku: "S1", name: "Chair Deluxe", company: "ACME", top_level_category: "KITCHEN WARE", end_level_category: "Watter Bottles !" },
  { id: "p2", sku: "S2", name: "Tub Small", company: "ACME", top_level_category: "  HouseHold   Unbreakable ", end_level_category: "Tub's" },
  { id: "p3", sku: "S3", name: "No category item", company: "ACME" }, // no category values
  { id: "p4", sku: "S4", name: "End only", company: "ACME", end_level_category: "Chair" }, // end w/o top
  { id: "p5", sku: "S5", name: "SS Item", company: "ACME", top_level_category: "NV PRODUCTS-FERIWALA", end_level_category: "SS STEEL RACKS" },
];
for (const r of rows) {
  const n = normalizeProductRow(r as Record<string, unknown>, m, "");
  console.log(n ? `${n.sku}: top="${n.topCat}" mid="" end="${n.endCat}"` : "null row");
  if (!n) throw new Error("row normalized to null: " + r.sku);
}
const n1 = normalizeProductRow(rows[0] as Record<string, unknown>, m, "");
if (n1!.topCat !== "Kitchen Ware") throw new Error("ALL-CAPS top not title-cased: " + n1!.topCat);
const n5 = normalizeProductRow(rows[4] as Record<string, unknown>, m, "");
if (n5!.topCat !== "NV Products-Feriwala") throw new Error("NV acronym kept: " + n5!.topCat);
if (n5!.endCat !== "SS Steel Racks") throw new Error("SS acronym kept: " + n5!.endCat);
console.log("ALL-CAPS title-casing + acronym preservation OK");
console.log("ALL CHECKS PASSED");
