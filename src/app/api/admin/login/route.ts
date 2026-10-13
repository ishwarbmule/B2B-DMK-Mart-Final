import { NextRequest, NextResponse } from "next/server";
import { ADMIN_LOGIN_ID, ADMIN_PASSWORD, makeToken } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  try {
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
