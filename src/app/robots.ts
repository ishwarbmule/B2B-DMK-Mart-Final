import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://dmkmartb2b.space-z.ai";

export default async function robots(): Promise<MetadataRoute.Robots> {
  let rules: MetadataRoute.Robots = {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
  try {
    const setting = await db.setting.findUnique({ where: { key: "robots_txt" } });
    if (setting?.value) {
      // parse simple directives from the admin-managed robots.txt content
      const lines = setting.value.split("\n").map((l) => l.trim());
      const disallow = lines.filter((l) => l.toLowerCase().startsWith("disallow:")).map((l) => l.slice(9).trim()).filter(Boolean);
      const allow = lines.filter((l) => l.toLowerCase().startsWith("allow:")).map((l) => l.slice(6).trim()).filter(Boolean);
      const sitemap = lines.find((l) => l.toLowerCase().startsWith("sitemap:"))?.slice(8).trim();
      rules = {
        rules: [{ userAgent: "*", allow: allow.length ? allow : "/", disallow: disallow.length ? disallow : ["/admin", "/api/"] }],
        sitemap: sitemap ? sitemap.replace("{SITE_URL}", SITE) : `${SITE}/sitemap.xml`,
      };
    }
  } catch { /* fall back to defaults */ }
  return rules;
}
