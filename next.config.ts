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
  async headers() {
    return [
      {
        source: "/product/:slug",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=120, stale-while-revalidate=600" },
        ],
      },
      {
        source: "/brand/:slug",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=300, stale-while-revalidate=1800" },
        ],
      },
      {
        source: "/brands",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=300, stale-while-revalidate=1800" },
        ],
      },
      {
        source: "/page/:slug",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=60, stale-while-revalidate=300" },
        ],
      },
    ];
  },
};

export default nextConfig;
