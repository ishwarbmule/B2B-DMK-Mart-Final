import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.CUSTOMER_AUTH_SECRET || "dmk-mart-customer-hmac-secret-2026";

export function makeCustomerToken(customerId: string): string {
  const ts = Date.now().toString();
  const sig = createHmac("sha256", SECRET).update(`${customerId}.${ts}`).digest("hex").slice(0, 32);
  return `${customerId}.${ts}.${sig}`;
}

export function verifyCustomerToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const [customerId, ts, sig] = token.split(".");
  if (!customerId || !ts || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(`${customerId}.${ts}`).digest("hex").slice(0, 32);
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? customerId : null;
  } catch {
    return null;
  }
}

export function extractCustomerToken(header: string | null): string | null {
  if (!header) return null;
  if (header.startsWith("Bearer ")) return header.slice(7);
  return header;
}

/** Returns the authenticated customer id or null. */
export function customerFromReq(req: Request): string | null {
  return verifyCustomerToken(extractCustomerToken(req.headers.get("x-customer-token")));
}

/** Normalize a login identifier: 10-digit Indian mobile (strips +91/spaces) or lowercase email. */
export function normalizeIdentifier(raw: string): { kind: "phone" | "email"; value: string } | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[\s-]/g, "").replace(/^\+?91(?=\d{10}$)/, "");
  if (/^[6-9]\d{9}$/.test(digits)) return { kind: "phone", value: digits };
  const email = trimmed.toLowerCase();
  if (/^\S+@\S+\.\S+$/.test(email)) return { kind: "email", value: email };
  return null;
}

/** Amazon/Flipkart-style masking: 9876543210 → "••••• •3210" · mail@x.com → "m•••@x.com" */
export function maskIdentifier(kind: "phone" | "email", value: string): string {
  if (kind === "phone") return `••••• •${value.slice(-4)}`;
  const [local, domain] = value.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}
