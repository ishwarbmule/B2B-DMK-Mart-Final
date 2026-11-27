/**
 * Live Visual Editor — storefront text registry (Website Management → Live Visual Editor).
 *
 * Every entry is a piece of storefront copy the admin can edit by clicking it on the
 * live website (double-click → type → save) or from the admin panel table.
 * `value` here is the DEFAULT; overrides live in the SiteContent table (key → value).
 * An empty override ("") means "back to default".
 *
 * Keys are stable identifiers — never rename one, the DB rows point at it.
 */

export type LiveTextDef = {
  key: string;
  page: string;
  label: string;
  value: string;
  multiline?: boolean;
};

export const LIVE_TEXTS: LiveTextDef[] = [
  /* Homepage — offer / campaign hero */
  { key: "home.offer.kicker", page: "home", label: "Offer hero — kicker line", value: "Limited Period Campaign" },

  /* Homepage — How It Works (black section) */
  { key: "home.hiw.title", page: "home", label: "How It Works — heading", value: "Built for Serious B2B Buyers" },
  { key: "home.hiw.step1.title", page: "home", label: "Step 1 — title", value: "Create B2B Account" },
  { key: "home.hiw.step1.text", page: "home", label: "Step 1 — description", value: "Register as retailer, wholesaler or distributor — get your price tier after approval.", multiline: true },
  { key: "home.hiw.step2.title", page: "home", label: "Step 2 — title", value: "Order Pieces or Full Packs" },
  { key: "home.hiw.step2.text", page: "home", label: "Step 2 — description", value: "Every product supports single pieces and sealed full packs with transparent pricing — pack rates when you pick up.", multiline: true },
  { key: "home.hiw.step3.title", page: "home", label: "Step 3 — title", value: "OTP-verified Delivery" },
  { key: "home.hiw.step3.text", page: "home", label: "Step 3 — description", value: "A 4-digit OTP is printed on your invoice — share it only when your order arrives.", multiline: true },
  { key: "home.hiw.cta.title", page: "home", label: "Custom quote strip — heading", value: "Need a custom quote for container loads?" },
  { key: "home.hiw.cta.text", page: "home", label: "Custom quote strip — subtext", value: "Talk to our wholesale desk — slab pricing up to 16% off." },
  { key: "home.hiw.cta.phone", page: "home", label: "Custom quote strip — phone number", value: "+91 93095 75173" },

  /* Homepage — trust strip */
  { key: "home.trust.1.title", page: "home", label: "Trust badge 1 — title", value: "4.8/5 B2B rating" },
  { key: "home.trust.1.text", page: "home", label: "Trust badge 1 — subtext", value: "from 480+ retail partners" },
  { key: "home.trust.2.title", page: "home", label: "Trust badge 2 — title", value: "48h dispatch" },
  { key: "home.trust.2.text", page: "home", label: "Trust badge 2 — subtext", value: "from Pune warehouse" },
  { key: "home.trust.3.title", page: "home", label: "Trust badge 3 — title", value: "Tier pricing" },
  { key: "home.trust.3.text", page: "home", label: "Trust badge 3 — subtext", value: "retailer → distributor rates" },
  { key: "home.trust.4.title", page: "home", label: "Trust badge 4 — title", value: "2,272 SKUs" },
  { key: "home.trust.4.text", page: "home", label: "Trust badge 4 — subtext", value: "across 9 departments" },

  /* Homepage — section headings & sublines. These are FALLBACKS: a title set in the
     Homepage Editor (v2) always wins; the live overlay edits these defaults when no
     admin title is configured. */
  { key: "home.sec.brandStrip.title", page: "home", label: "Section — Shop by Brand (title)", value: "Shop by Brand" },
  { key: "home.sec.categoryGrid.title", page: "home", label: "Section — Shop by Category (title)", value: "Shop by Category" },
  { key: "home.sec.categoryGrid.sub", page: "home", label: "Section — Shop by Category (subtext)", value: "All wholesale departments in one row — tap to browse" },
  { key: "home.sec.deals.title", page: "home", label: "Section — Deals of the Day (title)", value: "Deals of the Day" },
  { key: "home.sec.deals.sub", page: "home", label: "Section — Deals of the Day (subtext)", value: "Extra margin on today's picks — while stocks last" },
  { key: "home.sec.ads.title", page: "home", label: "Section — Sponsored Promotions (title)", value: "Sponsored Promotions" },
  { key: "home.sec.allProducts.title", page: "home", label: "Section — All Products (title)", value: "All Products" },
  { key: "home.sec.allProducts.sub", page: "home", label: "Section — All Products (subtext)", value: "Complete wholesale range — filter by department, category, brand, price and sort" },
  { key: "home.sec.dept.title", page: "home", label: "Section — Wholesale Departments (title)", value: "Wholesale Departments" },

  /* Login page — the owner edits every word/image from Admin → Website
     Management → Login Page Management (slider slides live in the Slider
     table; these keys cover the frame around them) */
  { key: "login.topline", page: "login", label: "Top bar — right-side line", value: "Wholesale marketplace for verified B2B buyers" },
  { key: "login.usp.chips", page: "login", label: "Slider — USP chips (comma-separated)", value: "Tier wholesale pricing,Two ready warehouses,Door-step delivery,GST invoices" },
  { key: "login.panel.strip", page: "login", label: "Sign-in card — yellow strip text", value: "New to DMK Mart? Wholesale rates, tier pricing and two ordering locations — Pune and Kolhar. Create an account and our team will approve it fast." },
  { key: "login.register.note", page: "login", label: "Create-account — bottom note", value: "Accounts open after a quick admin verification — pricing is assigned by the DMK Mart team, never self-selected." },
  { key: "login.regdone.text", page: "login", label: "Account-created card — message", value: "The DMK Mart team verifies every B2B buyer before the catalog opens. You will get a WhatsApp message as soon as your account is approved — then just sign in and start ordering.", multiline: true },
  { key: "login.footer", page: "login", label: "Footer line", value: "© 2026 DMK Mart · Wholesale marketplace for verified B2B buyers" },

  /* Warehouse selection page — same treatment (per-warehouse photos live in
     Admin → Warehouses) */
  { key: "wh.badge", page: "warehouse", label: "Card badge line", value: "DMK Mart godown" },
  { key: "wh.title", page: "warehouse", label: "Page heading", value: "Which warehouse will you order from?" },
  { key: "wh.subtitle", page: "warehouse", label: "Page subtext", value: "You will see that location's products and prices — you can change it anytime." },
  { key: "wh.cardcaption", page: "warehouse", label: "Card caption line", value: "Full catalog of this location · pickup & delivery" },
  { key: "wh.mismatch.title", page: "warehouse", label: "Location-mismatch warning — title", value: "Different area than your registered shop" },
  { key: "wh.mismatch.text", page: "warehouse", label: "Location-mismatch warning — message", value: "Your shop is registered near {home}, but you are ordering from {chosen}. Products, prices and stock belong to that warehouse. Continue only if that is intended.", multiline: true },
];

export const LIVE_DEFAULTS: Record<string, string> = Object.fromEntries(LIVE_TEXTS.map((t) => [t.key, t.value]));

export function liveDef(key: string): LiveTextDef | undefined {
  return LIVE_TEXTS.find((t) => t.key === key);
}
