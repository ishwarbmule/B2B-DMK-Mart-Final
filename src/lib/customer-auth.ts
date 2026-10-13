import { createHmac, timingSafeEqual } from "crypto";

const SECRET = "dmk-mart-customer-hmac-secret-2026";

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
