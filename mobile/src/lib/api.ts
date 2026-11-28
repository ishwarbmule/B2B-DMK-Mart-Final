/**
 * DMK Mart customer app — API client.
 * Talks to the same backend as the website (b2b-dmk-mart.vercel.app):
 *   • x-customer-token header  — login token (30-day HMAC)
 *   • x-warehouse-id header    — the chosen godown (products API scope)
 */
const BASE = "https://b2b-dmk-mart.vercel.app";

export type Customer = {
  id: string;
  name: string;
  shopName: string;
  phone: string;
  email: string;
  customerType: string;
  tier: string;
  status: string;
  city: string;
  pincode: string;
  gstin: string;
  address: string;
  orders: number;
  totalSpent: number;
  mustChangePassword: boolean;
};

export type Warehouse = {
  id: string;
  name: string;
  city: string;
  address?: string;
  phone?: string;
  image?: string;
  isDefault?: boolean;
};

export type ApiProduct = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  dealerPrice: number;
  basePrice: number;
  mrp: number;
  tier1: number;
  tier2: number;
  tier3: number;
  tier4: number;
  tier5: number;
  locPrice?: { dealerPrice: number; mrp?: number; deliveryRate?: number } | null;
  packPrice: number;
  packQty: number;
  piecesPerBox: number;
  unit: string;
  barcode: string;
  gst: number;
  image: string;
  inStock: boolean;
  isHot: boolean;
  isTop: boolean;
  isFeatured: boolean;
  isDeal: boolean;
  dealPrice: number;
  active: boolean;
  rating: number;
  reviewCount: number;
  company: string;
  brand: { name: string; slug: string; logo: string } | null;
  topId: string;
  midId: string;
  endId: string;
};

export type TopCategory = { id: string; name: string; emoji: string; image: string; color: string; productCount?: number };
export type MidCategory = { id: string; name: string; ends?: { id: string; name: string }[] };
export type Brand = { id: string; name: string; slug: string; logo: string; color?: string };
export type Slider = { id: string; heading: string; content: string; image: string; mobileImage: string; buttonText: string; buttonUrl: string; kicker: string; highlight: string; chips: string; textColor: string };
export type SalesPerson = { id: string; name: string };

export type Catalog = {
  tops: TopCategory[];
  brands: Brand[];
  sliders: Slider[];
  settings: Record<string, string>;
  warehouses: Warehouse[];
  salespersons: SalesPerson[];
};

export type OrderItem = { id: string; name?: string; unitType?: string; qty?: number; unitPrice?: number; total?: number };

export type ApiOrder = {
  id: string;
  invoiceNo: string;
  createdAt: string;
  confirmedAt: string | null;
  grandTotal: number;
  itemTotal: number;
  deliveryFee: number;
  discount: number;
  gstAmount: number;
  totalSavings: number;
  totalCases: number;
  totalUnits: number;
  itemCount?: number;
  items: OrderItem[];
  customerName: string;
  phone: string;
  addressLine: string;
  city: string;
  paymentMethod: string;
  fulfillment?: string;
  status?: string;
};

export type MeResponse = {
  customer: Customer;
  nearestWarehouse: Warehouse | null;
  warehouses: Warehouse[];
  recentOrders: ApiOrder[];
};

export type ProductsResponse = {
  products: ApiProduct[];
  total: number;
  page: number;
  pages: number;
  buyerWarehouse?: string;
};

export type Bill = {
  itemTotal: number;
  slabPct: number;
  slabDisc: number;
  couponDisc: number;
  discount: number;
  gstAmount: number;
  deliveryFee: number;
  grandTotal: number;
  totalSavings: number;
  totalPieces: number;
  fulfillment: string;
  pickupWarehouseName?: string;
};

// ── token / warehouse persistence ─────────────────────────
export const KEYS = { token: "dmk_token", warehouse: "dmk_warehouse", cart: "dmk_cart" };

let authToken = "";
let warehouseId = "";

export function setAuth(token: string, whId: string) {
  authToken = token;
  warehouseId = whId;
}

export function getAuth() {
  return { token: authToken, warehouseId };
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (authToken) headers["x-customer-token"] = authToken;
  if (warehouseId) headers["x-warehouse-id"] = warehouseId;
  const res = await fetch(BASE + path, { ...init, headers });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
};

// ── endpoints ──────────────────────────────────────────────
export const endpoints = {
  login: (identifier: string, password: string) =>
    api.post<{ ok: boolean; token: string; customer: Customer }>("/api/auth/login", { identifier, password }),
  me: () => api.get<MeResponse>("/api/auth/me"),
  catalog: () => api.get<Catalog>("/api/catalog"),
  selectWarehouse: (warehouseId: string) => api.post<{ ok: boolean; warehouse: Warehouse }>("/api/auth/select-warehouse", { warehouseId }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ ok: boolean }>("/api/auth/change-password", { currentPassword, newPassword }),
  products: (params: Record<string, string | number>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== "" && v != null) sp.set(k, String(v));
    return api.get<ProductsResponse>(`/api/products?${sp.toString()}`);
  },
  placeOrder: (body: Record<string, unknown>) =>
    api.post<{ ok: boolean; orderId: string; invoiceNo: string; otp: string; bill: Bill }>("/api/orders", body),
};
