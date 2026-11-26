import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.CUSTOMER_AUTH_SECRET || "dmk-mart-customer-hmac-secret-2026";

export function makeCustomerToken(customerId: string): string {
  const ts = Date.now().toString();
  const sig = createHmac("sha256", SECRET).update(`${customerId}.${ts}`).digest("hex").slice(0, 32);
  return `${customerId}.${ts}.${sig}`;
}

/**
 * Short-lived RESET grant issued after an OTP is verified for "forgot password".
 * Different HMAC basis ("<id>.RESET.<ts>") from login tokens ("<id>.<ts>") so a
 * reset grant can never be replayed as a login session and vice versa.
 */
export function makeCustomerResetToken(customerId: string): string {
  const ts = Date.now().toString();
  const sig = createHmac("sha256", SECRET).update(`${customerId}.RESET.${ts}`).digest("hex").slice(0, 32);
  return `${customerId}.RESET.${ts}.${sig}`;
}

export type CustomerTokenVerifyOpts = { purpose?: "AUTH" | "RESET"; maxAgeSec?: number };

export function verifyCustomerToken(token: string | null | undefined, opts?: CustomerTokenVerifyOpts): string | null {
  if (!token) return null;
  const parts = token.split(".");

  if (opts?.purpose === "RESET") {
    // RESET grants are exactly 4 parts: <id>.RESET.<ts>.<sig>
    if (parts.length !== 4 || parts[1] !== "RESET") return null;
    const [customerId, , ts, sig] = parts;
    if (!customerId || !ts || !sig) return null;
    const expected = createHmac("sha256", SECRET).update(`${customerId}.RESET.${ts}`).digest("hex").slice(0, 32);
    let ok = false;
    try {
      ok = timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return null;
    }
    if (!ok) return null;
    const age = (Date.now() - Number(ts)) / 1000;
    if (!Number.isFinite(age) || age < 0 || age > (opts.maxAgeSec ?? 15 * 60)) return null; // grants burn out
    return customerId;
  }

  // AUTH (default): <id>.<ts>.<sig>
  if (parts.length !== 3) return null;
  const [customerId, ts, sig] = parts;
  if (!customerId || !ts || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(`${customerId}.${ts}`).digest("hex").slice(0, 32);
  let ok = false;
  try {
    ok = timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return null;
  }
  if (!ok) return null;
  if (opts?.maxAgeSec) {
    const age = (Date.now() - Number(ts)) / 1000;
    if (!Number.isFinite(age) || age < 0 || age > opts.maxAgeSec) return null;
  }
  return customerId;
}

/** Cookie `secure` flag that follows the actual request protocol — production
 *  runs HTTPS on Vercel, but plain-HTTP sandboxes/previews would silently drop
 *  Secure cookies (the browser eats them and every gated page re-asks login). */
export function isHttpsReq(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto") || "";
  return proto.split(",")[0].trim() === "https";
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
