export interface TopCategoryNode {
  id: string;
  name: string;
  emoji: string;
  image: string;
  color: string;
  sortOrder: number;
  productCount?: number;
  mids: {
    id: string;
    name: string;
    ends: { id: string; name: string }[];
  }[];
}

export interface BrandNode {
  id: string;
  name: string;
  slug: string;
  logo: string;
  tagline?: string;
  isFeatured: boolean;
  _count?: { products: number };
}

export interface OfferNode {
  id: string;
  name: string;
  slug: string;
  type: string;
  headline: string;
  subText: string;
  ctaText: string;
  ctaUrl: string;
  bannerImage?: string;
  contentPosition?: string; // TOP-LEFT | TOP-RIGHT | CENTER | BOTTOM-LEFT | BOTTOM-RIGHT
  discountType?: string; // PERCENT | AMOUNT
  discountValue?: number;
  minOrder?: number;
  bgColor: string;
  textColor: string;
  heroSlot: boolean;
  startAt?: string | null;
  endAt?: string | null;
}

export interface CouponNode {
  id: string;
  code: string;
  headline: string;
  subText: string;
  type: string;
  value: number;
  minOrder: number;
  maxDiscount: number;
  bgColor: string;
  textColor: string;
}

export interface SliderRow {
  id: string;
  heading: string;
  content: string;
  buttonText: string;
  buttonUrl: string;
  image: string;
  mobileImage?: string;
  kicker?: string;
  highlight?: string;
  chips?: string;
  tagline?: string;
  mobilePosition?: string;
  textColor?: string;
  headingScale?: string;
  position: string;
}

export interface AdRow {
  id: string;
  title: string;
  link: string;
  image: string;
  brand?: { name: string; slug: string } | null;
}

export interface CatalogPayload {
  tops: TopCategoryNode[];
  brands: BrandNode[];
  sliders: SliderRow[];
  ads: AdRow[];
  settings: Record<string, string>;
  stats: { products: number; stores: number; brands: number };
  activeOffer: OfferNode | null;
  homeCoupons: CouponNode[];
  footerPages: { slug: string; title: string; type: string }[];
}

export interface DProduct {
  id: string;
  sku: string;
  slug?: string;
  name: string;
  dealerPrice: number;
  basePrice: number;
  mrp: number;
  // Task 15: slab prices ride on every product payload — the client pricing engine
  // (lib/pricing.ts) picks the slab: buyer's tier when logged in, wholesale (tier2) otherwise.
  tier1?: number;
  tier2?: number;
  tier3?: number;
  tier4?: number;
  packPrice?: number;
  packQty: number;
  piecesPerBox?: number;
  unit?: string;
  stock: number;
  barcode: string;
  gst: number;
  image: string;
  isHot: boolean;
  isTop: boolean;
  isFeatured: boolean;
  isDeal?: boolean;
  dealPrice?: number;
  active: boolean;
  rating?: number;
  reviewCount?: number;
  brand?: { name: string; slug: string; logo?: string };
  top?: { name: string };
  mid?: { name: string };
  end?: { name: string };
}

export interface OrderItemRow {
  id: string;
  productId: string;
  sku: string;
  name: string;
  image: string;
  unitType: string;
  packQty: number;
  qty: number;
  pieces: number;
  unitPrice: number;
  gst: number;
  hsn: string;
  total: number;
  barcode: string;
  serialNo?: number;
  lineStatus?: string; // OK | NEXT_PLAN
  plannedNote?: string;
}

export interface OrderRow {
  id: string;
  invoiceNo: string;
  otp?: string;
  items?: OrderItemRow[];
  customerId?: string;
  totalPieces?: number;
  itemTotal: number;
  gstAmount: number;
  deliveryFee: number;
  discount: number;
  couponCode?: string;
  grandTotal: number;
  totalSavings: number;
  customerName: string;
  customerType?: string;
  priceTier?: string;
  phone: string;
  email: string;
  addressLine: string;
  city: string;
  pincode: string;
  zone: string;
  slot: string;
  paymentMethod: string;
  paymentStatus: string;
  shippingStatus: string;
  status: string;
  source: string;
  // Task 15: fulfillment mode + chosen pickup warehouse
  fulfillment?: string; // PICKUP | DELIVERY
  pickupWarehouseId?: string;
  pickupWarehouseName?: string;
  note?: string;
  confirmedAt?: string;
  nextDeliveryAt?: string;
  createdAt: string;
}

export function discountPct(mrp: number, price: number): number {
  if (!mrp || mrp <= price) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}
