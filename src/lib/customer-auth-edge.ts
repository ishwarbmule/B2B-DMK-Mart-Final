/**
 * Edge-runtime customer token verification (Web Crypto) — for middleware.
 * Mirrors lib/customer-auth.ts HMAC construction exactly:
 *   token = "<customerId>.<ts>.<sig>" where sig = first 32 hex chars of
 *   HMAC-SHA256(secret, "<customerId>.<ts>").
 * The Node version (crypto.createHmac) cannot run on the Edge runtime, so the
 * middleware verifies with crypto.subtle; the node version still guards every API.
 */
const SECRET = process.env.CUSTOMER_AUTH_SECRET || "dmk-mart-customer-hmac-secret-2026";

const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{32}$/.test(hex)) return null; // only our 32-hex slice ever matches
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Constant-time-ish compare (lengths fixed at 16 bytes for valid shapes). */
function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Returns the customerId when the token is valid, else null. */
export async function verifyCustomerTokenEdge(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [customerId, ts, sig] = parts;
  if (!customerId || !ts || !sig) return null;
  const sigBytes = hexToBytes(sig);
  if (!sigBytes) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${customerId}.${ts}`));
    const macBytes = new Uint8Array(mac).slice(0, 16); // node version takes digest("hex").slice(0, 32) = 16 bytes
    return safeEqual(sigBytes, macBytes) ? customerId : null;
  } catch {
    return null;
  }
}

export const CUSTOMER_SESSION_COOKIE = "dmk_sess";
export const CUSTOMER_WAREHOUSE_COOKIE = "dmk_wh";
