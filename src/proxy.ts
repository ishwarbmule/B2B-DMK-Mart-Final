/**
 * Login-first storefront gate (the owner's rule: this website is ONLY for DMK
 * Mart customers — opening any page without a session lands on /login; right
 * after login every buyer picks their warehouse (Pune / Kolhar) and then sees
 * ONLY that warehouse's products).
 *
 * Pages only. Every API keeps its own real auth (node HMAC verify + admin
 * bearer): the middleware cookie check is the UX gate, the APIs are the gate
 * that actually protects data.
 *
 * Public paths: /login, /admin (the portal has its own auth), /api,
 * Next internals and static assets.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyCustomerTokenEdge, CUSTOMER_SESSION_COOKIE, CUSTOMER_WAREHOUSE_COOKIE } from "@/lib/customer-auth-edge";

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|dmk-logo.png|robots.txt|sitemap.xml|wh-pune.png|wh-kolhar.png).*)"],
};

const PUBLIC_PATHS = ["/login"];

function isStaticAsset(pathname: string): boolean {
  return /\.[a-zA-Z0-9]{1,8}$/.test(pathname) && !pathname.endsWith(".php");
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/admin") || isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const sess = req.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;
  const customerId = await verifyCustomerTokenEdge(sess);
  const next = `${pathname}${search}`.replace(/\?*$/, "");

  if (!customerId) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
    return NextResponse.redirect(url);
  }

  // logged in but no warehouse picked yet → the chooser comes first (skip for
  // the chooser itself so the buyer can change their mind later)
  const wh = req.cookies.get(CUSTOMER_WAREHOUSE_COOKIE)?.value;
  if (!wh && pathname !== "/choose-warehouse") {
    const url = req.nextUrl.clone();
    url.pathname = "/choose-warehouse";
    url.search = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
