import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { StoreChrome } from "@/components/dmk/store-chrome";

export const dynamic = "force-dynamic";

async function getPage(slug: string) {
  return db.page.findFirst({ where: { slug, active: true } });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return { title: "Page not found | DMK Mart" };
  return {
    title: page.metaTitle || `${page.title} | DMK Mart B2B`,
    description: page.metaDescription || "",
    keywords: page.keywords ? page.keywords.split(",").map((k) => k.trim()) : undefined,
    alternates: { canonical: `/page/${page.slug}` },
  };
}

type Block = { id: string; type: string; visible?: boolean; text?: string; headline?: string; sub?: string; bg?: string; textColor?: string };

export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) notFound();
  let blocks: Block[] = [];
  try {
    blocks = JSON.parse(page.blocks || "[]");
  } catch { /* noop */ }

  return (
    <StoreChrome>
      <div className="mx-auto max-w-4xl px-3 py-8 md:px-6">
        <h1 className="text-2xl font-black text-gray-900 md:text-3xl">{page.title}</h1>
        <div className="mt-6 space-y-6">
          {blocks.filter((b) => b.visible !== false).map((b) => {
            if (b.type === "richtext") {
              return (
                <div key={b.id} className="rounded-2xl border bg-white p-6">
                  {(b.text || "").split("\n").filter(Boolean).map((para, i) => (
                    <p key={i} className="mb-3 text-sm leading-relaxed text-gray-600 last:mb-0">{para}</p>
                  ))}
                </div>
              );
            }
            if (b.type === "hero") {
              return (
                <div key={b.id} className="rounded-2xl p-6 md:p-10" style={{ background: b.bg || "#0a0a0a", color: b.textColor || "#facc15" }}>
                  <h2 className="text-2xl font-black md:text-4xl">{b.headline}</h2>
                  <p className="mt-2 text-sm opacity-90">{b.sub}</p>
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>
    </StoreChrome>
  );
}
