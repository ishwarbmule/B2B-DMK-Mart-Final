/** Legal content — Part C: About Us + Contact Us (company pages, shown in footer Information). */
import { p, h2, ul, ol, table, callout, updated, contact, BIZ, type SeedPage } from "./legal-content-a";

/* ============================= ABOUT US ============================= */

export const about: SeedPage = {
  slug: "about-us",
  title: "About Us",
  type: "CUSTOM",
  metaTitle: "About Us | DMK Mart — B2B Wholesale for Plastic & Home Appliances",
  metaDescription: "DMK Mart is a Pune-based B2B wholesale marketplace supplying 2,000+ SKUs of plastic housewares, kitchenware, furniture and home appliances from 40+ trusted brands to retailers, wholesalers and distributors across India.",
  keywords: "about dmk mart, b2b wholesale marketplace pune, plastic home appliances wholesale india",
  inFooter: true,
  sortOrder: 70,
  blocks: [
    updated(),
    p(`${BIZ} is a business-to-business wholesale marketplace built for the shops that keep India stocked. From our base at the MIDC Industrial Area on Solapur Road, Pune, we supply plastic housewares, kitchenware, furniture, gardening products, cleaning supplies, water storage and home appliances to retailers, kirana stores, wholesalers, distributors and institutional buyers across the country — in pieces, packs and bulk cases, at genuine wholesale rates.`),

    h2("What We Do"),
    p("We bring a curated multi-brand catalogue under one roof — 2,000+ SKUs across 40+ trusted brands — and pair it with the buying experience a busy store owner actually needs: live ERP-synced stock, transparent tier pricing, automatic bulk slabs, GST invoicing and dispatch SLAs you can plan replenishment around. Whether you need a few cases for the weekend or a consolidated multi-brand load for the season, the desk handles it end-to-end."),

    h2("Who We Serve"),
    ul([
      "Retailers & kirana stores — fast-moving plastic and houseware SKUs with case-level picking.",
      "Wholesalers & distributors — deep cartons, slab pricing up to 10% and scheduled weekly loads.",
      "Institutional & HoReCa buyers — cleaning supplies, water jars and commercial kitchen equipment.",
      "Resellers & online sellers — resale-ready packaging with GST invoicing for input credit.",
    ]),

    h2("Why Buyers Choose DMK Mart"),
    table(
      ["What you get", "How it works"],
      [
        ["Genuine wholesale rates", "Tier pricing by account type + automatic slabs: ₹5k+ 2%, ₹25k+ 4%, ₹50k+ 7%, ₹1L+ 10%."],
        ["Live stock you can trust", "Catalogue synced with our inventory ERP — what you see is what we can ship."],
        ["Flexible payments", "UPI, cards, COD and 7-day B2B credit for approved stores."],
        ["OTP-verified delivery", "A 4-digit OTP confirms handover of every consignment — no ambiguity."],
        ["WhatsApp-first support", "One desk for orders, dispatch, claims and credit — fastest replies on WhatsApp."],
        ["GST-ready paperwork", "Proper tax invoices with HSN splits, e-way bills where required."],
      ]
    ),

    h2("Our Promise"),
    p("Wholesale is a trust business. We keep it simple: honest rates, honest stock counts, honest claims handling. Goods leave us resale-ready, and when something goes wrong in transit our 48-hour claim window gets a store owner back in stock fast — replacement first, refund where fitting. That is why stores that buy once from DMK Mart tend to keep buying."),

    callout("info", "Start buying", "Browse the catalogue without an account, or create a free B2B Account to unlock tier pricing, saved addresses and order history. For bulk quotations, message the wholesale desk directly on WhatsApp."),
  ],
};

/* ============================= CONTACT US ============================= */

export const contactUs: SeedPage = {
  slug: "contact-us",
  title: "Contact Us",
  type: "CUSTOM",
  metaTitle: "Contact Us | DMK Mart B2B Wholesale Desk",
  metaDescription: "Reach the DMK Mart wholesale desk on WhatsApp, phone or email — order support, bulk quotations, B2B credit applications, returns and delivery help. Monday–Saturday, 9:30 am–7 pm IST.",
  keywords: "contact dmk mart, wholesale desk contact, b2b support whatsapp india",
  inFooter: true,
  sortOrder: 80,
  blocks: [
    updated(),
    p("Talk to a human — our wholesale desk answers on WhatsApp fastest, and the same team handles orders, quotations, delivery updates, returns and B2B credit. Keep your order number handy (it starts right in your order confirmation) and we'll pick up from there."),

    h2("Reach the Wholesale Desk"),
    contact([
      "WhatsApp:: +91 98220 12345",
      "Phone:: +91 98220 12345 (wholesale desk)",
      "Email:: dmkmartdata@gmail.com",
      "Address:: Plot 14, MIDC Industrial Area, Solapur Road, Pune 411019, Maharashtra, India",
      "Hours:: Monday – Saturday, 9:30 am – 7:00 pm IST (Sunday: dispatch support only)",
    ]),

    h2("What to Contact Us About"),
    ul([
      "Bulk quotations & mixed-brand loads — share the SKUs/cases you need and your PIN code.",
      "Order & delivery status — dispatch SLAs, carrier updates, OTP issues.",
      "Returns & claims — 48-hour window, photos/video, replacement or refund.",
      "B2B Credit applications — store details, trade references, limits.",
      "Pricing & invoices — GST details, e-way bills, slab queries.",
    ]),

    h2("How We Handle Queries"),
    ol([
      "WhatsApp messages are typically answered within business hours the same day.",
      "Email queries get a response within 1 working day.",
      "Order-specific issues are traced with your order number and resolved with a written confirmation on the same channel.",
      "Escalations and grievances go to our Grievance Officer (see Privacy Policy) and are acknowledged within 48 hours.",
    ]),

    callout("info", "Visiting the warehouse?", "Walk-ins are welcome Monday–Saturday during desk hours for catalogue viewing and will-call pickups. Message us a day ahead so your list is picked and packed before you arrive."),
  ],
};
