import { NextRequest, NextResponse } from "next/server";

/**
 * CDN cache rules for DB-backed storefront pages (Hostinger MySQL sits in
 * Mumbai; serverless functions render in iad1 — every uncached render costs
 * multiple ~230ms DB round trips). These pages render identical HTML for all
 * visitors (auth/cart/pricing are client-side API calls), so per-URL edge
 * caching is safe. Deployments purge the CDN cache automatically.
 *
 * NOTE: kept narrow on purpose — admin/API/auth routes are never touched.
 */
const CDN_RULES: Array<[RegExp, string]> = [
  [/^\/product\/[^/]+$/, "public, s-maxage=120, stale-while-revalidate=600"],
  [/^\/brand\/[^/]+$/, "public, s-maxage=300, stale-while-revalidate=1800"],
  [/^\/brands\/?$/, "public, s-maxage=300, stale-while-revalidate=1800"],
  [/^\/page\/[^/]+$/, "public, s-maxage=60, stale-while-revalidate=300"],
];

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const { pathname } = req.nextUrl;
  for (const [re, cc] of CDN_RULES) {
    if (re.test(pathname)) {
      res.headers.set("Cache-Control", cc);
      break;
    }
  }
  return res;
}

export const config = {
  matcher: ["/product/:path*", "/brand/:path*", "/brands", "/page/:path*"],
};
