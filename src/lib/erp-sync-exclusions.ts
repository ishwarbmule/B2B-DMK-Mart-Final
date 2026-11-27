/**
 * GST-firm product exclusion — the owner's standing rule (27 Nov 2026).
 *
 * The two Excel exports ("dmk-products-all-2026-11-27.xlsx" and "(1)") list the
 * product lines of the GST firms (DMK Traders / HD Polyplast / Plastic World /
 * Steelking Industries). DMK Mart sells ONLY the non-GST firms' products from
 * the Kolhar and Pune warehouses, so these lines must:
 *   1. never sync into the website (skip on every pull path), and
 *   2. be removed from the admin panel / storefront (one-time prune).
 *
 * Keyed by SKU: the same physical line appears under different company labels
 * in the two firm books (e.g. "DMK TRADERS" in one, "HD POLYPLAST" / blank in
 * the other, and non-GST-styled labels in the site DB), so SKU is the only
 * stable identity. Company-name matching is a second belt for future pulls.
 */

export const EXCLUDED_SKUS: string[] = [
  "FLOORWIPER16",
  "HDCHOPPER450",
  "KITCSTOBB",
  "KITCHSTOBOXG",
  "KRISTOCHOPPER650ML",
  "PUSHCHOPPER650",
  "SOLTAPU",
  "MAHABASIN13",
  "MAHABAS17",
  "MAHABASI17",
  "MAHABASIN24",
  "MAHAMIL15",
  "MAHASTOOL2",
  "MAHASTOOL3",
  "MAHAT110L",
  "MAHATU50",
  "MAHAT70",
  "NILKAMALCRATE",
  "PLASTICROPE",
  "RP10LTR",
  "RP10\"PLAN",
  "RP10STOOL",
  "RP107P",
  "RP108PE",
  "RP109PE",
  "111KOHIN",
  "RP12PLAN",
  "RP13LT",
  "RP14PLA",
  "RP14\"PLAN",
  "RP14STOOL",
  "RP16\"PL",
  "RP17LT",
  "RP18LT",
  "RP2LT",
  "RP20LTR",
  "RP20LT",
  "RP2020KIT",
  "RP21STOOL",
  "RP25LT",
  "RP4\"PL",
  "RP5LE",
  "RP5LT",
  "RP6\"SQUA",
  "RP60LT",
  "RP60LTR",
  "RP8PLAN",
  "RP8\"SQ",
  "AMARP",
  "RPJUM",
  "RPKITCHMN",
  "RPMON",
  "RPMOONTR",
  "RING1000",
  "RPSUNTR",
  "RPTAML",
  "VENUSTROL",
  "RP10SQUA",
  "SV105PE",
  "SV1500ML",
  "SV1600MLC",
  "SV2100ML",
  "SV222MA",
  "SV333MA",
  "SV500ML",
  "SV6NO",
  "SV750ML",
  "SV8HA",
  "SKI-108FW-01",
  "SKI-106PS-04",
  "SKI-",
  "SKI-219 PS-03",
  "SKI-152BM-02",
  "SKI-151BM-01",
  "SKI-117MP-01",
  "SKI-118MP-03",
  "SKI-198FW-18",
  "SKI-199FW-19",
  "SKI-148",
  "SKI-127BR-06",
  "SKI-110SP-01",
  "SKI-126BR-04",
  "MICROF14",
  "SKI-225BR-12",
  "SKI-108FW-02",
  "SKI-237BM-05",
  "SKI-103HU-06",
  "SKI-BM-08",
  "SKI-BM-07",
  "SKI-114MP-02",
  "SKI-115MP-04",
  "SKI-280",
  "SKI-007BHH-06",
  "SKI-007AHH-05",
  "SOFT&FLEX",
  "SKI-109SS-01",
  "SKI-222BR-01",
  "SKI-BR-",
  "SKI-166PI-01",
];

/** GST-firm company names (case/space-insensitive) — second belt on sync. */
export const EXCLUDED_COMPANIES: string[] = [
  "DMK TRADERS",
  "HD POLYPLAST",
  "HD POLY PLAST",
  "PLASTIC WORLD",
  "STEELKING INDUSTRIES PRIVATE LIMITED",
];

const normSku = (s: string) => String(s || "").trim().toUpperCase();
const normCompany = (s: string) => String(s || "").trim().toUpperCase().replace(/\s+/g, " ");

const EXCLUDED_SKU_SET = new Set(EXCLUDED_SKUS.map(normSku));
const EXCLUDED_COMPANY_SET = new Set(EXCLUDED_COMPANIES.map(normCompany));

export function isExcludedSku(sku: string): boolean {
  return EXCLUDED_SKU_SET.has(normSku(sku));
}

export function isExcludedCompany(company: string): boolean {
  return EXCLUDED_COMPANY_SET.has(normCompany(company));
}

/** Owner rule: the product line must not be collected — SKU match OR GST-firm company. */
export function isExcludedProduct(sku: string, company?: string): boolean {
  return isExcludedSku(sku) || (!!company && isExcludedCompany(company));
}
