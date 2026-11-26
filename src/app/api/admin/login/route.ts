import { NextRequest, NextResponse } from "next/server";
import { ADMIN_LOGIN_ID, ADMIN_PASSWORD, makeToken } from "@/lib/admin-auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/** POST /api/admin/login — Super Admin portal login.
 *  Brute-force guard: 5 tries per 5 minutes per IP (harder than customer login —
 *  this account controls the whole panel). */
export async function POST(req: NextRequest) {
  try {
    if (!rateLimit(`admin-login:${clientIp(req)}`, { limit: 5, windowMs: 5 * 60 * 1000 })) {
      return NextResponse.json({ error: "Too many login attempts — please wait a few minutes." }, { status: 429 });
    }
    const { loginId, password } = await req.json();
    const idOk = String(loginId ?? "").trim() === ADMIN_LOGIN_ID;
    const passOk = String(password ?? "") === ADMIN_PASSWORD;

    if (!idOk || !passOk) {
      return NextResponse.json({ error: "Invalid ID or password" }, { status: 401 });
    }
    return NextResponse.json({ ok: true, token: makeToken(), loginId: ADMIN_LOGIN_ID });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
