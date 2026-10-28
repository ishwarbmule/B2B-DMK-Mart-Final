import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
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
    ];
  },
};

export default nextConfig;
