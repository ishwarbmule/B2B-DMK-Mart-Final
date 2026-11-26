import type { NextConfig } from "next";
import { execSync } from "child_process";

// Build stamp inlined into client bundles — shown on the admin login screen so
// a stale browser tab / old cached bundle is instantly recognizable.
let portalBuild = "unknown";
try {
  portalBuild = execSync("git rev-parse --short HEAD").toString().trim();
} catch {
  portalBuild = new Date().toISOString().slice(0, 16);
}

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_PORTAL_BUILD: portalBuild,
  },
  // pdfmake (brochure PDF engine) is BUNDLED into the route on purpose: with it
  // marked external the serverless lambda needed file-traced node_modules +
  // font assets, which silently go missing on Vercel and 500 every request.
  // Fonts/logo/hero are embedded base64 (see scripts/gen-brochure-assets.mjs),
  // so the bundled route is fully self-contained.
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // CDN caching for DB-backed dynamic-segment pages. Next 16 does not
  // Full-Route-Cache dynamic segments rendered on demand, so these HTML
  // responses re-hit the Mumbai DB every request (~2.5s). All user-specific
  // data (auth/cart/pricing) is client-side via APIs, so the HTML is identical
  // for every visitor and safe to cache at the edge per URL. Deployments purge
  // the CDN cache automatically. ERP sync refreshes on its own 15-30 min cycle.
  //
  // NO stale-while-revalidate anywhere: SWR serves the previous (stale) copy
  // instantly and refreshes in the background, which made the site visibly
  // show the old version for a few seconds first. Plain short s-maxage means
  // users always get the current version once the window expires.
  async headers() {
    return [
      {
        source: "/product/:slug",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=60" },
        ],
      },
      {
        source: "/brand/:slug",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=120" },
        ],
      },
      {
        source: "/brands",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=120" },
        ],
      },
      {
        source: "/page/:slug",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=60" },
        ],
      },
      // security headers on every route (MVP hardening — CSP left out until the
      // inline scripts/pdfmake worker are nonce-able; these carry no breaking risk)
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
