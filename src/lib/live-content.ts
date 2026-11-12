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
  { key: "home.hiw.cta.phone", page: "home", label: "Custom quote strip — phone number", value: "+91 98220 12345" },

  /* Homepage — trust strip */
  { key: "home.trust.1.title", page: "home", label: "Trust badge 1 — title", value: "4.8/5 B2B rating" },
  { key: "home.trust.1.text", page: "home", label: "Trust badge 1 — subtext", value: "from 480+ retail partners" },
  { key: "home.trust.2.title", page: "home", label: "Trust badge 2 — title", value: "48h dispatch" },
  { key: "home.trust.2.text", page: "home", label: "Trust badge 2 — subtext", value: "from Pune warehouse" },
  { key: "home.trust.3.title", page: "home", label: "Trust badge 3 — title", value: "Tier pricing" },
  { key: "home.trust.3.text", page: "home", label: "Trust badge 3 — subtext", value: "retailer → distributor rates" },
  { key: "home.trust.4.title", page: "home", label: "Trust badge 4 — title", value: "2,272 SKUs" },
  { key: "home.trust.4.text", page: "home", label: "Trust badge 4 — subtext", value: "across 9 departments" },
];

export const LIVE_DEFAULTS: Record<string, string> = Object.fromEntries(LIVE_TEXTS.map((t) => [t.key, t.value]));

export function liveDef(key: string): LiveTextDef | undefined {
  return LIVE_TEXTS.find((t) => t.key === key);
}
