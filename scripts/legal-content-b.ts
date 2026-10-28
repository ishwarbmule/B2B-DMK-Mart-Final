/** Legal content — Part B: Refund & Returns, Shipping & Delivery, Cancellation, Pricing & Payment. */
import { p, h2, h3, ul, ol, table, callout, updated, divider, contact, BIZ, type SeedPage } from "./legal-content-a";

/* ============================= REFUND & RETURNS ============================= */

export const refund: SeedPage = {
  slug: "refund-returns-policy",
  title: "Refund & Returns Policy",
  type: "LEGAL",
  metaTitle: "Refund & Returns Policy",
  metaDescription: "Damaged, defective, wrong or short-shipped wholesale orders? Learn DMK Mart's 48-hour claim process, evidence requirements, replacement and refund timelines for B2B buyers across India.",
  keywords: "dmk mart refund policy, b2b wholesale returns india, damaged shipment claim wholesale",
  inFooter: false,
  sortOrder: 30,
  blocks: [
    updated(),
    p(`At ${BIZ} every consignment leaves our warehouse in case-level, resale-ready packaging — but we know things can occasionally go wrong in transit or in manufacturing. This Policy explains exactly what is covered, what is not, and how we make it right. Because we are a business-to-business wholesaler, our returns framework is built around genuine supply problems rather than change-of-mind purchases.`),

    h2("1. Inspect at Delivery"),
    p("Please check the outer cartons and piece count in front of the delivery partner before accepting, and complete the OTP-verified handover. Visible damage (crushed cartons, broken seals, water marks) should be noted with the delivery partner where the channel allows. An unboxing video for high-value cases is the single best protection for a smooth claim."),

    h2("2. What Is Covered — Eligible Claims"),
    ul([
      "Transit damage — items cracked, chipped or crushed during shipping.",
      "Manufacturing defects — faulty goods found on first inspection (not wear from resale).",
      "Wrong item delivered — a different SKU, colour or size than invoiced.",
      "Short shipment — fewer cases or pieces than the invoice, including missing cartons.",
      "Quality mismatch — goods materially different from the listing description (e.g. wrong material grade).",
    ]),
    callout("ok", "48-hour claim window", "Report any eligible issue within 48 hours of delivery with photos (and video where possible) on WhatsApp or email. Claims raised within the window are prioritised by our wholesale desk."),

    h2("3. What Is Not Covered"),
    ul([
      "Change of mind, overstocking or 'we couldn't sell it' returns — standard for B2B wholesale supply.",
      "Goods that have been resold, shelf-displayed, washed, assembled, price-tagged or otherwise put into commerce.",
      "Minor batch variations in colour tone, packaging artwork or mould marks that do not affect usability — these are normal across manufacturer lots.",
      "Damage caused by the Buyer's storage, handling, transport after delivery, or misuse.",
      "Claims raised after the 48-hour window without a valid reason for the delay.",
    ]),

    h2("4. How to File a Claim"),
    ol([
      "Message our wholesale desk on WhatsApp or email within 48 hours of delivery, quoting your order number.",
      "Attach photographs of the damaged goods and cartons, the invoice, and — ideally — the unboxing video.",
      "Keep the goods, packaging and invoice together until the claim is resolved; do not discard anything.",
      "Our team reviews within 1–2 business days and may ask a short clarifying question (e.g. how many units per case are affected).",
    ]),

    h2("5. Resolution — Replacement First, Refund Where Fitting"),
    p("Our default resolution for verified claims is a replacement in your next dispatch or an express re-shipment, since B2B buyers usually need the stock. Where a replacement is unavailable (discontinued lot, out of stock) or you prefer money back, we issue a refund as below. For partially affected cases, resolution is offered case-wise or pro-rata by affected units."),
    table(
      ["Claim type", "Usual resolution", "Timeline"],
      [
        ["Minor damage (few units)", "Replacement units with next dispatch / pro-rata refund", "2–4 business days"],
        ["Case-level damage or defect", "Full case replacement or case-value refund", "2–5 business days"],
        ["Wrong item shipped", "Pickup + correct item re-shipped, or full refund", "3–7 business days"],
        ["Short shipment", "Dispatch shortfall or refund the difference", "2–4 business days"],
      ]
    ),

    h2("6. Refund Timelines"),
    ul([
      "Verified refunds are issued within 5–7 business days of claim approval (bank posting times vary).",
      "Refunds go to the bank account or settlement channel you nominate — our desk confirms the details with you on WhatsApp/email before posting.",
      "Where the affected amount was already settled, the refund is reversed to the same source.",
      "Coupon-funded discounts — refunds are net of the discount actually availed on the order.",
    ]),
    callout("info", "One honest note", "Refund clocks start from claim approval, not from the report date — because the desk must verify evidence first. Providing clear photos/video at filing is the fastest route to your money back."),

    h2("7. Failed Deliveries & Refused Consignments"),
    p("Where a consignment cannot be delivered after three attempts (unreachable consignee, wrong address) and is returned to origin, the order value is refunded minus two-way freight, or re-shipped at actual freight cost. Consignments refused without cause may make the Buyer liable for forward and return freight."),

    h2("8. Chargebacks & Disputes"),
    p("Please talk to us before raising a bank chargeback — nearly every claim is resolved faster directly with the desk. Orders under dispute should have supporting evidence shared with our team; we cooperate fully with banks during any formal review."),

    divider(),
    h2("9. Contact for Returns & Refunds"),
    contact([
      "WhatsApp:: +91 98220 12345",
      "Phone:: +91 98220 12345 (wholesale desk)",
      "Email:: dmkmartdata@gmail.com",
      "Address:: Plot 14, MIDC Industrial Area, Solapur Road, Pune 411019, Maharashtra, India",
      "Hours:: Monday – Saturday, 9:30 am – 7:00 pm IST",
    ]),
  ],
};

/* ============================= SHIPPING & DELIVERY ============================= */

export const shipping: SeedPage = {
  slug: "shipping-delivery-policy",
  title: "Shipping & Delivery Policy",
  type: "LEGAL",
  metaTitle: "Shipping & Delivery Policy",
  metaDescription: "Dispatch SLAs, delivery timelines, OTP-verified handover, ₹250 flat shipping fee, packaging and undeliverable-shipment handling for DMK Mart B2B wholesale orders across India.",
  keywords: "dmk mart shipping policy, wholesale delivery india, otp verified delivery, dispatch time b2b",
  inFooter: false,
  sortOrder: 40,
  blocks: [
    updated(),
    p(`${BIZ} ships case-packed wholesale consignments across India from our Pune warehouse. This Policy covers dispatch commitments, delivery timelines, charges, the OTP-verified handover process, and what happens when a delivery cannot be completed.`),

    h2("1. Dispatch Slots & SLAs"),
    p("At checkout you can pick the dispatch rhythm that suits your store's replenishment cycle:"),
    table(
      ["Dispatch slot", "What it means"],
      [
        ["Standard dispatch (48h)", "Order packed and handed to the carrier within 48 working hours of confirmation."],
        ["Express 2-day", "Priority picking — dispatched within 2 working days, best for stock-out situations."],
        ["Weekly scheduled", "Consolidated weekly dispatch — ideal for planned replenishment and mixed-brand loads."],
      ]
    ),
    p("Dispatch confirmation, carrier details and the delivery OTP are shared on WhatsApp/SMS. Delivery timelines after dispatch typically range from 2–3 days within Maharashtra and neighbouring states to 4–8 days for the rest of India, depending on the carrier network and destination PIN code."),

    h2("2. Shipping Charges"),
    ul([
      "A flat delivery fee of ₹250 is applied per order and shown transparently at checkout before you confirm the order.",
      "Bulk and very heavy consignments (multi-case furniture, commercial kitchen equipment) may attract actual-freight pricing — our desk always confirms the final freight on WhatsApp before dispatching such orders.",
      "There are no hidden handling, packing or OTP charges.",
    ]),

    h2("3. Serviceability"),
    p("We deliver to virtually every PIN code served by our courier and transport partners. Extremely remote or route-limited PIN codes may take longer or be serviced through surface transport with an ETA shared by the desk. If your PIN code is temporarily unserviceable (carrier restrictions, weather, regional holidays), we will inform you and either hold the dispatch, reroute, or refund the affected order."),

    h2("4. Packaging & Case-Level Picking"),
    p("Wholesale goods ship in manufacturer-grade cases with additional protective packing where the product category needs it (glassware, ceramics, appliances). Orders are picked against the invoice at case and piece level; the delivery documents show total cases and units so your team can verify counts in seconds at handover."),

    h2("5. OTP-Verified Delivery"),
    p("Every consignment is handed over against a 4-digit OTP that is displayed after checkout and sent to your registered mobile. Please share the OTP only with the person receiving the goods, and only at the moment of handover. If an OTP cannot be verified (e.g. phone unavailable), the carrier follows identity-alternate protocols; contact the desk immediately if you are asked for anything unusual."),

    h2("6. Risk & Title"),
    p("Risk in the goods passes to you when the consignment is delivered and the OTP handover is completed at the agreed address. Title passes on receipt of full payment. For transit damage discovered at or immediately after handover, the Refund & Returns Policy's 48-hour claim process applies."),

    h2("7. Address Accuracy & Consignee Availability"),
    p("Please provide a complete deliverable address — shop/firm name, floor, landmark, PIN code and a reachable phone number. We are not responsible for delays or failed delivery caused by incorrect addresses or the consignee being unavailable. After three delivery attempts, the consignment returns to origin and Section 8 applies."),

    h2("8. Undeliverable & Returned-to-Origin Shipments"),
    ul([
      "Returned-to-origin (RTO) prepaid orders are refunded minus two-way freight, or re-shipped on payment of fresh freight.",
      "Consignments refused without cause may attract forward and return freight liability.",
      "Re-shipments are prioritised once the corrected address or delivery slot is confirmed on WhatsApp.",
    ]),

    h2("9. Delays Beyond Our Control"),
    p("Festival-season carrier backlogs, strikes, adverse weather, route restrictions and similar force-majeure events can delay carriers nationwide. When such events affect your consignment, the desk proactively shares revised ETAs on WhatsApp. Where a delay becomes unacceptable to you and the goods are not yet dispatched, you may cancel free of charge (see Cancellation Policy)."),

    divider(),
    h2("10. Delivery Support"),
    contact([
      "WhatsApp:: +91 98220 12345",
      "Phone:: +91 98220 12345 (wholesale desk)",
      "Email:: dmkmartdata@gmail.com",
      "Hours:: Monday – Saturday, 9:30 am – 7:00 pm IST",
    ]),
  ],
};

/* ============================= CANCELLATION POLICY ============================= */

export const cancellation: SeedPage = {
  slug: "cancellation-policy",
  title: "Cancellation Policy",
  type: "LEGAL",
  metaTitle: "Cancellation Policy",
  metaDescription: "Cancel your DMK Mart wholesale order free before dispatch — plus rules for shipped orders, order changes and refund timelines for cancelled orders.",
  keywords: "dmk mart cancellation policy, cancel wholesale order, b2b order cancellation india",
  inFooter: false,
  sortOrder: 50,
  blocks: [
    updated(),
    p("Plans change — stock sells through, a customer pre-book shifts, or a better lot arrives. This Policy explains when and how you can cancel a DMK Mart order, what happens after dispatch, and how refunds for cancelled orders are handled."),

    h2("1. Cancelling Before Dispatch"),
    p("Orders can be cancelled free of charge any time before they are dispatched from our Pune warehouse. Simply message the wholesale desk on WhatsApp or email with your order number; we confirm the cancellation on the same channel. Because Standard orders are packed within 48 working hours, the cancellation window is widest for Weekly scheduled dispatches and narrowest for Express 2-day ones."),
    callout("ok", "Fastest route", "WhatsApp your order number to the wholesale desk before the dispatch cut-off — morning requests are almost always cancellable the same day."),

    h2("2. Cancelling After Dispatch"),
    p("Once a consignment is handed to the carrier it is in transit and cannot be cancelled. If you no longer need the goods, you may refuse the delivery at handover — but this is treated as a returned-to-origin shipment under the Shipping & Delivery Policy and may attract two-way freight liability. Genuine damage, defect, wrong-item or short-shipment issues discovered at delivery are handled under the Refund & Returns Policy instead of cancellation."),

    h2("3. Changing an Order Instead of Cancelling"),
    p("Before dispatch we can usually add items, remove items, or split an order — subject to pack rules and re-priced automatically under the applicable bulk slab. Message the desk with the order number and the change; any price difference is refunded or collected as appropriate. Changes after dispatch are not possible."),

    h2("4. Refunds for Cancelled Orders"),
    p("Refunds for cancelled orders are issued within 5–7 business days of the cancellation confirmation, to the bank account or settlement channel you nominate — no cancellation charges apply before dispatch."),
    p("Partial cancellations (some items only) refund the cancelled value minus any slab discount that no longer applies — e.g. dropping from a 7% slab to a 4% slab adjusts the whole order's discount proportionally."),

    h2("5. Cancellations by DMK Mart"),
    p("We may cancel an order (with a full refund and, where possible, an alternative suggestion) when: stock becomes unavailable despite live inventory checks; the address or identity cannot be verified; the order appears fraudulent or abusive (e.g. systematic delivery refusals); a pricing or data error occurred; or legal or carrier restrictions prevent dispatch. You will always be informed with a reason on your registered channel."),

    divider(),
    h2("6. Cancellation Support"),
    contact([
      "WhatsApp:: +91 98220 12345",
      "Phone:: +91 98220 12345 (wholesale desk)",
      "Email:: dmkmartdata@gmail.com",
      "Hours:: Monday – Saturday, 9:30 am – 7:00 pm IST",
    ]),
  ],
};

/* ============================= PRICING & PAYMENT ============================= */

export const pricing: SeedPage = {
  slug: "pricing-payment-policy",
  title: "Pricing & Billing Policy",
  type: "LEGAL",
  metaTitle: "Pricing & Billing Policy",
  metaDescription: "How DMK Mart pricing works — GST-exclusive rates, automatic bulk slabs up to 10% off, tier pricing for retailers and distributors, GST invoicing and live ERP-synced prices.",
  keywords: "dmk mart pricing, b2b wholesale pricing india, gst wholesale invoice, bulk discount slabs",
  inFooter: false,
  sortOrder: 60,
  blocks: [
    updated(),
    p("This Policy explains how prices are displayed, how bulk discounts and tier pricing work, and how GST invoicing is handled. It complements the Terms & Conditions; capitalised terms have the meanings given there."),

    h2("1. Pricing Basis — GST Exclusive"),
    p("Listed prices are wholesale trade rates in Indian Rupees (INR) and are exclusive of GST unless a listing explicitly states otherwise. The cart shows item total, slab discount, delivery fee and applicable GST separately before you confirm the order, so there are no surprises on the invoice. Manufacturer MRP (where printed) applies to your resale channel, not to our B2B rates."),

    h2("2. Automatic Bulk Slabs"),
    p("Discounts apply automatically in the cart based on order value — no codes needed:"),
    table(
      ["Order value (before GST)", "Automatic discount"],
      [
        ["₹5,000 and above", "2% off"],
        ["₹25,000 and above", "4% off"],
        ["₹50,000 and above", "7% off"],
        ["₹1,00,000 and above", "10% off"],
      ]
    ),
    p("Slabs apply to the order subtotal after item pricing but before GST and delivery. If items are removed later and the order value falls into a lower slab, the discount recalculates to the applicable slab."),

    h2("3. Tier Pricing for Account Types"),
    p("Beyond open slabs, registered B2B accounts are assigned a pricing tier — Retailer, Wholesaler or Distributor — reflecting relationship depth and volumes. Tier members see improved per-unit rates on eligible catalogues. Tier assignment and revision are at our discretion and communicated on your registered WhatsApp/email. Guest checkout always prices at the standard wholesale tier."),

    h2("4. GST Invoicing"),
    p("Every order carries a GST invoice showing HSN codes, taxable value, slab discount, GST rate split (CGST/SGST or IGST) and our GST registration details. Provide your GSTIN and firm details at checkout if you need input-credit documentation — we cannot always adjust invoices after dispatch. E-way bills are generated where required for the consignment value and distance."),

    h2("5. Price Changes, Errors & Live Stock"),
    p("Catalogue prices and stock are synchronised live from our ERP. Costs from manufacturers change with raw-material cycles, so listed prices may change without notice — but the price we confirm at order acceptance is the price you pay. In the rare event of a manifest pricing or data error, we will contact you before processing; you may confirm at the corrected price or cancel free of charge."),

    h2("6. Taxes & Duties"),
    p("GST is charged at the rate applicable to each product's HSN classification on the invoice date. Any new statutory levy, cess or TCS introduced by law will be shown separately on invoices. Buyers are responsible for their own tax compliance on resale."),

    divider(),
    h2("7. Pricing & Billing Support"),
    contact([
      "WhatsApp:: +91 98220 12345",
      "Phone:: +91 98220 12345 (wholesale desk)",
      "Email:: dmkmartdata@gmail.com",
      "Address:: Plot 14, MIDC Industrial Area, Solapur Road, Pune 411019, Maharashtra, India",
      "Hours:: Monday – Saturday, 9:30 am – 7:00 pm IST",
    ]),
  ],
};
