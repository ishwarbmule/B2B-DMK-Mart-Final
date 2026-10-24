/** Legal content — Part A: Terms & Conditions + Privacy Policy.
 *  Business: DMK Mart — B2B wholesale marketplace (plastic & home appliances), Pune, India. */

export type SeedBlock =
  | { id: string; type: "updated"; text: string }
  | { id: string; type: "p"; text: string }
  | { id: string; type: "h2"; text: string }
  | { id: string; type: "h3"; text: string }
  | { id: string; type: "ul"; items: string[] }
  | { id: string; type: "ol"; items: string[] }
  | { id: string; type: "table"; head: string[]; rows: string[][] }
  | { id: string; type: "callout"; variant: "info" | "warn" | "ok"; title: string; text: string }
  | { id: string; type: "contact"; items: string[] }
  | { id: string; type: "divider" };

export type SeedPage = {
  slug: string;
  title: string;
  type: "LEGAL" | "CUSTOM";
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  inFooter: boolean;
  sortOrder: number;
  blocks: SeedBlock[];
};

export const UPDATED = "24 October 2026";
export const BIZ = "DMK Mart";
export const ADDR = "Plot 14, MIDC Industrial Area, Solapur Road, Pune 411019, Maharashtra, India";
export const EMAIL = "dmkmartdata@gmail.com";
export const PHONE = "+91 98220 12345";

let seq = 0;
const nid = () => `b${(++seq).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

export const p = (text: string): SeedBlock => ({ id: nid(), type: "p", text });
export const h2 = (text: string): SeedBlock => ({ id: nid(), type: "h2", text });
export const h3 = (text: string): SeedBlock => ({ id: nid(), type: "h3", text });
export const ul = (items: string[]): SeedBlock => ({ id: nid(), type: "ul", items });
export const ol = (items: string[]): SeedBlock => ({ id: nid(), type: "ol", items });
export const table = (head: string[], rows: string[][]): SeedBlock => ({ id: nid(), type: "table", head, rows });
export const callout = (variant: "info" | "warn" | "ok", title: string, text: string): SeedBlock => ({ id: nid(), type: "callout", variant, title, text });
export const updated = (): SeedBlock => ({ id: nid(), type: "updated", text: UPDATED });
export const divider = (): SeedBlock => ({ id: nid(), type: "divider" });
export const contact = (items: string[]): SeedBlock => ({ id: nid(), type: "contact", items });

/* ============================= TERMS & CONDITIONS ============================= */

export const terms: SeedPage = {
  slug: "terms-and-conditions",
  title: "Terms & Conditions",
  type: "LEGAL",
  metaTitle: "Terms & Conditions",
  metaDescription: "The terms governing your use of DMK Mart — India's B2B wholesale marketplace for plastic goods and home appliances. Covers eligibility, orders, pricing, GST, payments, B2B credit, delivery, returns and liability.",
  keywords: "dmk mart terms, b2b wholesale terms and conditions, wholesale marketplace india terms, bulk order terms",
  inFooter: false,
  sortOrder: 10,
  blocks: [
    updated(),
    p(`Welcome to ${BIZ}. These Terms & Conditions ("Terms") form a binding agreement between you ("Buyer", "you") and ${BIZ} ("we", "us", "our"), the operator of the B2B wholesale marketplace available at b2b-dmk-mart.vercel.app and any associated apps or ordering channels ("Platform"). By browsing the Platform, creating an account, placing an order, or communicating with our wholesale desk, you accept these Terms in full. If you do not agree with any part of these Terms, please do not use the Platform.`),
    p(`${BIZ} is a business-to-business (B2B) platform. We supply plastic housewares, kitchenware, furniture, gardening products, cleaning supplies, water storage and home appliances in pieces, packs and bulk cases to retailers, kirana stores, wholesalers, distributors, institutional buyers and resellers. Sales made through the Platform are intended for business use and resale — not for personal, family or household consumption.`),

    h2("1. Eligibility & Business Use"),
    p("The Platform is available only to users who are at least 18 years of age and competent to contract under the Indian Contract Act, 1872. By placing an order you confirm that:"),
    ul([
      "You are purchasing in the course of business (as a retailer, wholesaler, distributor, institution or reseller) and not as a consumer buying for personal use.",
      "All information you provide — business name, GSTIN (if applicable), contact details and delivery address — is accurate and belongs to you or your business.",
      "You are authorised to make the purchase using the payment method you select.",
      "You will not resell platform content, price lists or catalogue data as your own service.",
    ]),
    p("We may refuse service, cancel orders or suspend accounts where we reasonably believe a purchase is not a bona fide business transaction, involves fraud or misuse, or breaches these Terms."),

    h2("2. Accounts & Registration"),
    p("You can browse the full catalogue and check out as a guest, or create a B2B Account to save details, track orders and unlock tier-based pricing. Registered customer types include Retailer, Wholesaler and Distributor; each may see different tier pricing configured by us. You are responsible for keeping your account credentials, OTPs and phone number secure, and for all activity that happens under your account. If you suspect unauthorised use of your account, notify us immediately through the wholesale desk so we can secure it."),

    h2("3. Products, Stock & Catalogue Accuracy"),
    p("Our catalogue of 2,000+ SKUs across 40+ brands is synchronised live with our inventory system. We work hard to keep product titles, specifications, case packs, minimum order quantities (MOQ) and photographs accurate, but:"),
    ul([
      "Images and colours are illustrative — actual product appearance, packaging or batch design may vary slightly by manufacturer lot.",
      "Stock availability shown on the Platform is indicative and confirmed at order acceptance; occasionally items sell out between ordering and dispatch.",
      "Where an ordered item becomes unavailable, we will contact you on WhatsApp or phone to arrange a substitution, a part-shipment or a refund of that item.",
      "Product warranties, if any, are the manufacturer's warranties; we assist with claims but do not independently warrant manufactured goods.",
    ]),

    h2("4. Pricing, Taxes & Bulk Discounts"),
    p("All prices are quoted in Indian Rupees (INR). Prices are exclusive of GST unless expressly stated otherwise, and GST is applied at applicable rates on the invoice. Volume discounts are applied automatically in the cart based on the order value:"),
    table(
      ["Order value (before GST)", "Automatic discount"],
      [
        ["₹5,000 and above", "2% off"],
        ["₹25,000 and above", "4% off"],
        ["₹50,000 and above", "7% off"],
        ["₹1,00,000 and above", "10% off"],
      ]
    ),
    p("Prices, offers and discounts may change without prior notice. The price that applies to your order is the price displayed at the moment we accept the order. In the rare case of a pricing or data error (including ERP sync glitches), we will contact you before processing; we will not honour manifest pricing errors, but you may cancel at no cost. More detail is set out in our Pricing & Payment Policy."),

    h2("5. Orders & Acceptance"),
    p("Placing an order on the Platform is an offer to purchase. A contract is formed only when we accept the order — confirmed via on-screen acknowledgement, WhatsApp message, email or invoice. We may decline or partially accept any order (for example, where stock, pricing or delivery constraints exist). Orders are typically dispatched in case-level packaging; individual piece picks are subject to product MOQs shown on each listing."),

    h2("6. Payment Terms"),
    p("We currently accept the following payment methods:"),
    ul([
      "UPI / QR — Google Pay, PhonePe, Paytm and other UPI apps.",
      "Cards — credit, debit and RuPay cards.",
      "Cash on Delivery (COD) — pay in cash when the order arrives, subject to COD eligibility and value limits.",
      "B2B Credit — 7-day credit terms for approved stores, granted at our sole discretion after verification.",
    ]),
    p("For B2B Credit accounts, payment of the invoiced amount is due within 7 days of invoice date unless separately agreed in writing. Late payments may attract suspension of credit facilities and further orders until dues are cleared. Orders unpaid where payment is required at confirmation may be cancelled after reasonable attempts to reach you. Full details: Pricing & Payment Policy."),

    h2("7. Invoicing & GST"),
    p("A GST invoice is issued for every order and shared via WhatsApp/email and in the delivery documents. If you require a GST input claim, provide a valid GSTIN and business details at checkout — details entered after dispatch may not be adjustable. Prices on the Platform are exclusive of GST unless a listing states otherwise. Any TDS/TCS or other statutory deduction applicable to your business must be raised with us before payment with the relevant legal reference; statutory changes in tax rates will be passed through to invoices as required by law."),

    h2("8. Shipping, Delivery & Risk"),
    p("We dispatch across India through courier and transport partners, with dispatch SLAs shown at checkout (Standard dispatch within 48 hours, Express 2-day, or Weekly scheduled routes). A flat delivery fee is displayed at checkout. Deliveries are OTP-verified: a 4-digit OTP shared with you must be provided to the delivery partner at handover. Risk in the goods passes to you on delivery at the agreed address. Title in the goods passes on receipt of full payment. Please review our Shipping & Delivery Policy for timelines, undeliverable shipments and remote-area handling."),

    h2("9. Returns, Refunds & Cancellations"),
    p("As a B2B wholesaler our goods are supplied for resale, so change-of-mind returns are not offered. We do, however, stand behind every dispatch: transit-damaged, defective, wrong or short-shipped items are eligible for replacement or refund when reported within 48 hours of delivery with photographic evidence (an unboxing video is strongly recommended for high-value cases). Cancellations are free before dispatch. The complete processes, evidence requirements and refund timelines are set out in the Refund & Returns Policy and Cancellation Policy, which form part of these Terms."),

    h2("10. Acceptable Use"),
    p("When using the Platform you agree not to:"),
    ul([
      "Place fraudulent, speculative or bulk-hoarding orders intended to disrupt supply.",
      "Abuse COD by repeatedly refusing consignments, or misuse B2B Credit beyond sanctioned terms.",
      "Scrape, copy or reuse catalogue data, images, price lists or software for a competing service.",
      "Interfere with the Platform, attempt unauthorised access, or use it to distribute malware or unlawful content.",
      "Misrepresent your identity, business, GSTIN or payment instruments.",
    ]),
    p("We may suspend or terminate access for violations, and reserve the right to pursue available legal remedies."),

    h2("11. Intellectual Property"),
    p(`The Platform — including its software, design, text, graphics, logos, brand assets and compiled catalogue data — is owned by ${BIZ} or its licensors and is protected by Indian and international intellectual property laws. Brand names and product images of manufacturers (e.g. our 40+ partner brands) belong to their respective owners and are used for identification and resale purposes only. You receive a limited, revocable, non-exclusive licence to view and use the Platform for purchasing; no other rights are granted.`),

    h2("12. Confidentiality & Data"),
    p("Order, customer and account information we hold about you is processed under our Privacy Policy, which complies with India's Digital Personal Data Protection Act, 2023 (DPDP Act). If you receive confidential commercial information from us (e.g. unpublished price lists, scheme documents), you agree to keep it confidential and use it only for your purchasing decisions."),

    h2("13. Limitation of Liability"),
    p("To the maximum extent permitted by law:"),
    ul([
      "Our total liability for any claim arising out of or connected to an order is limited to the invoice value of the goods under that order.",
      "We are not liable for indirect or consequential losses — loss of profit, resale margin, business interruption, or data — even if advised of the possibility.",
      "Nothing in these Terms limits liability that cannot be limited by law (including liability for death or personal injury caused by negligence, or fraud).",
      "Goods are supplied for resale; it is the Buyer's responsibility to comply with applicable trade and product-stacking requirements in their resale channel.",
    ]),

    h2("14. Indemnity"),
    p("You agree to indemnify and hold harmless DMK Mart, its proprietors, employees and partners from claims, damages and reasonable costs arising from your breach of these Terms, your misuse of the Platform, inaccurate information you provide, or your resale of goods in violation of applicable law."),

    h2("15. Force Majeure"),
    p("We are not liable for delay or failure to perform caused by events beyond our reasonable control — including natural events, floods and fires, strikes and transport stoppages, government restrictions, power or network failures, festival-season carrier backlogs, or supplier shortages. Where such events occur we will communicate revised timelines and, if fulfilment becomes impossible, refund affected items."),

    h2("16. Governing Law & Disputes"),
    p("These Terms are governed by the laws of India. Any dispute will first be addressed through good-faith negotiation with our support desk for 30 days. Unresolved disputes will be referred to arbitration by a sole arbitrator under the Arbitration and Conciliation Act, 1996, seated in Pune, Maharashtra, with proceedings in English. Subject to arbitration, courts at Pune, Maharashtra have exclusive jurisdiction. The DPDP Act grievance process (for data matters) is set out in our Privacy Policy."),

    h2("17. Changes to These Terms"),
    p("We may update these Terms as our services, payment options or laws evolve. The revised version is posted on this page with a new 'Last updated' date, and material changes will be communicated on the Platform or via WhatsApp/email. Continued use of the Platform or placing of orders after changes take effect constitutes acceptance of the updated Terms."),

    divider(),
    h2("18. Questions & Grievance"),
    p("For any question on these Terms, or to report a grievance, reach our wholesale desk — we answer fastest on WhatsApp:"),
    contact([
      "WhatsApp:: +91 98220 12345",
      "Phone:: +91 98220 12345 (wholesale desk)",
      "Email:: dmkmartdata@gmail.com",
      "Address:: Plot 14, MIDC Industrial Area, Solapur Road, Pune 411019, Maharashtra, India",
      "Hours:: Monday – Saturday, 9:30 am – 7:00 pm IST",
    ]),
  ],
};

/* ============================= PRIVACY POLICY ============================= */

export const privacy: SeedPage = {
  slug: "privacy-policy",
  title: "Privacy Policy",
  type: "LEGAL",
  metaTitle: "Privacy Policy",
  metaDescription: "How DMK Mart collects, uses, shares and protects personal and business data of B2B buyers — in line with India's Digital Personal Data Protection Act, 2023. Includes your rights and our Grievance Officer contact.",
  keywords: "dmk mart privacy policy, dpdp act b2b ecommerce, data protection wholesale marketplace india",
  inFooter: false,
  sortOrder: 20,
  blocks: [
    updated(),
    p(`${BIZ} ("we", "us", "our") respects your privacy and processes personal data responsibly, lawfully and transparently. This Privacy Policy explains what personal data we collect when you use our B2B wholesale marketplace (the "Platform"), why we collect it, who we share it with, and the rights you have over your data — including under India's Digital Personal Data Protection Act, 2023 ("DPDP Act"). By using the Platform or placing an order, you consent to the processing described in this Policy.`),

    h2("1. Who This Policy Covers"),
    p("This Policy applies to all visitors, registered B2B customers (retailers, wholesalers, distributors), guest buyers, delivery contacts and anyone who communicates with our wholesale desk. It covers data collected through the website, checkout, WhatsApp and phone interactions, and our order-management systems. Where you act for a business (e.g. a store manager ordering for a shop), you confirm you are authorised to share that business's and the contact person's details with us."),

    h2("2. Data We Collect"),
    h3("a) Identity & business details"),
    ul([
      "Name, business/store name, customer type (Retailer / Wholesaler / Distributor / Guest).",
      "Phone number, email address, and business credentials you choose to provide (e.g. GSTIN for invoicing).",
      "Delivery address, city and 6-digit PIN code.",
    ]),
    h3("b) Order & transaction data"),
    ul([
      "Products ordered, quantities (cases/pieces), order value, tier and slab discounts applied.",
      "Payment method (UPI / Card / COD / B2B Credit), payment status and invoice records.",
      "Delivery OTP events, dispatch and delivery confirmations, returns and refunds history.",
    ]),
    h3("c) Communications"),
    ul([
      "Messages and call notes from WhatsApp, phone and email with our wholesale desk.",
      "Support queries, complaints, return claims and their resolutions.",
    ]),
    h3("d) Technical data"),
    ul([
      "IP address, device/browser type and basic usage analytics needed to run and secure the site.",
      "Local storage/cookies that keep your cart, session and preferences working (see Section 7).",
    ]),
    p("We do not knowingly collect more data than is necessary for B2B order fulfilment, and we do not sell your personal data."),

    h2("3. How We Use Your Data"),
    ul([
      "To process, confirm, pack, dispatch and deliver your orders — including OTP-verified handover.",
      "To send transactional updates by WhatsApp, SMS or email: order confirmation, dispatch, delivery OTP and invoice links.",
      "To collect payments, prevent fraud, evaluate B2B Credit applications and manage credit limits.",
      "To provide customer support and resolve return/refund claims.",
      "To improve the catalogue, pricing and Platform performance using aggregated analytics.",
      "To comply with legal, tax (GST), accounting and law-enforcement obligations.",
      "With your separate consent — to send occasional wholesale schemes, offers and new-stock alerts you can opt out of at any time.",
    ]),
    callout("info", "Transactional messages", "Order, payment and delivery OTP messages are service communications required to fulfil your order and are not promotional. You can stop promotional messages at any time without affecting order-related updates."),

    h2("4. Legal Basis for Processing"),
    p("Under the DPDP Act we process your personal data on the following bases:"),
    ul([
      "Consent — given when you submit a form, place an order, or opt in to updates; you may withdraw consent as described in Section 10.",
      "Legitimate uses — processing needed to fulfil a contract with you (delivering your order), to respond to your requests, to comply with law, and to establish/defend legal claims.",
    ]),

    h2("5. Sharing & Disclosure"),
    p("We share personal data only with parties who need it to run the service, and only to the extent necessary:"),
    ul([
      "Logistics and delivery partners — consignee name, address, phone and OTP verification for delivery.",
      "Payment processors/banks — the payment instruments and confirmation data needed to settle your transaction (we do not store full card details).",
      "Communication providers — WhatsApp/SMS/email gateways that deliver your order updates and OTPs.",
      "Technology providers — our hosting, database and image-CDN providers processing data on our instructions.",
      "Professional advisers and authorities — auditors, tax authorities and law-enforcement bodies where required by law or to protect our rights.",
    ]),
    p("Any third party processing personal data on our behalf is bound by confidentiality and data-protection obligations consistent with this Policy."),

    h2("6. WhatsApp & SMS Communications"),
    p("Our primary support and notification channel is WhatsApp, which is free for you to use. When you message us or place an order, we may send service messages within the permitted window, and — where you have opted in — periodic wholesale offers. You can reply 'STOP' or ask our desk to remove you from promotional lists at any time. Delivery OTPs are shown on screen at checkout and also sent by SMS/WhatsApp to the phone number provided for the delivery handover."),

    h2("7. Cookies & Local Storage"),
    p("The Platform uses essential cookies and browser local storage to keep sessions, carts, coupon states and admin logins working, and lightweight analytics to understand traffic. We do not run advertising trackers that profile you across other websites. You can clear or block storage in your browser settings; note that essential storage is required for checkout to function correctly."),

    h2("8. Data Retention"),
    ul([
      "Order, invoice and tax records: retained as long as required under applicable tax and accounting laws (typically 8 years after the financial year).",
      "Account and contact details: retained while your account is active and for a reasonable period afterwards to handle warranty/credit matters.",
      "WhatsApp/support conversations: retained for up to 24 months for quality and dispute resolution.",
      "Delivery OTP records: retained only for the transaction lifecycle and audit.",
      "Data no longer required is deleted or anonymised securely.",
    ]),

    h2("9. Security"),
    p("We protect your data with encryption in transit (HTTPS/TLS), access controls and admin authentication, hashed credentials, least-privilege access for staff, and monitoring of our systems. Payment is handled by the payment provider's secure interface; we never store full card numbers or UPI credentials. No system is perfectly secure — if a data breach affects your rights, we will notify you and the Data Protection Board as required by law."),

    h2("10. Your Rights"),
    p("Subject to applicable law (including the DPDP Act), you may:"),
    ul([
      "Access — request a summary of the personal data we hold about you and how it is processed.",
      "Correct — ask us to fix inaccurate or incomplete data (address, phone, GSTIN, etc.).",
      "Erase — request deletion of data we no longer legally need to keep.",
      "Withdraw consent — stop optional processing (e.g. promotional messages) at any time; this does not affect processing already done or required to complete past orders.",
      "Nominate — nominate another individual to exercise your rights if you are unable to do so.",
      "Grievance — raise a concern with our Grievance Officer, who must respond within 30 days; you may escalate to the Data Protection Board of India thereafter.",
    ]),
    p("To exercise any right, email or WhatsApp our desk with your registered phone number and order details for verification."),

    h2("11. Grievance Officer"),
    p(`Under the DPDP Act and applicable rules, our Grievance Officer can be reached at: ${BIZ} — Grievance Officer, ${ADDR}. Phone/WhatsApp: ${PHONE}. Email: ${EMAIL}. We acknowledge grievances within 48 hours and aim to resolve them within 30 days of receipt.`),

    h2("12. Children's Data"),
    p("The Platform is a B2B service intended for adults engaged in business (18+). We do not knowingly collect data from children. If you believe a minor has provided us personal data, contact us and we will delete it promptly."),

    h2("13. Cross-Border Transfers"),
    p("Our hosting and communication providers may process data outside India (e.g. cloud CDNs). We choose providers that offer safeguards consistent with Indian law and the DPDP Act's requirements for cross-border transfers, and we do not transfer data to countries restricted by the Government of India."),

    h2("14. Changes to This Policy"),
    p("We may update this Policy as our services or laws evolve. The 'Last updated' date at the top reflects the current version, and material changes will be highlighted on the Platform. Continued use of the Platform after an update means you accept the revised Policy."),

    divider(),
    h2("15. Contact Us"),
    p("Questions about privacy? Reach the desk directly — we're fastest on WhatsApp:"),
    contact([
      "WhatsApp:: +91 98220 12345",
      "Email:: dmkmartdata@gmail.com",
      "Address:: Plot 14, MIDC Industrial Area, Solapur Road, Pune 411019, Maharashtra, India",
      "Hours:: Monday – Saturday, 9:30 am – 7:00 pm IST",
    ]),
  ],
};
