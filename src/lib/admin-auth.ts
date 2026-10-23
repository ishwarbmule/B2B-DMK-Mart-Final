import { createHmac, timingSafeEqual } from "crypto";

const SECRET = process.env.ADMIN_AUTH_SECRET || "dmk-mart-admin-hmac-secret-2026";

export const ADMIN_LOGIN_ID = process.env.ADMIN_LOGIN_ID || "B2B DMK Mart";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "1234";

export function makeToken(): string {
  const ts = Date.now().toString();
  const sig = createHmac("sha256", SECRET).update(ts).digest("hex").slice(0, 24);
  return `${ts}.${sig}`;
}

export function verifyToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const [ts, sig] = token.split(".");
  if (!ts || !sig) return false;
  const expected = createHmac("sha256", SECRET).update(ts).digest("hex").slice(0, 24);
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function extractToken(header: string | null): string | null {
  if (!header) return null;
  if (header.startsWith("Bearer ")) return header.slice(7);
  return header;
}

/** Require a valid admin token; returns null if OK, else a 401 NextResponse.
 *  Accepts the token from either the `authorization` header (Bearer, /admin portal)
 *  or the `x-admin-token` header (legacy dmart admin dashboard). */
export function requireAdmin(req: Request): Response | null {
  const token =
    extractToken(req.headers.get("authorization")) ??
    req.headers.get("x-admin-token");
  if (!verifyToken(token)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}

export function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
