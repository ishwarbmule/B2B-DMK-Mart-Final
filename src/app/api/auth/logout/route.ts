/** POST /api/auth/logout — clears the storefront session + warehouse cookies
 * (the client also drops its localStorage/sessionStorage token). */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("dmk_sess", "", { httpOnly: true, path: "/", maxAge: 0 });
  res.cookies.set("dmk_wh", "", { httpOnly: false, path: "/", maxAge: 0 });
  return res;
}
