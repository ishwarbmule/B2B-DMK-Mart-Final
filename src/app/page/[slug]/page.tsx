import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { StoreChrome } from "@/components/dmk/store-chrome";
import {
  ShieldCheck, MessageCircle, Phone, Mail, MapPin, Clock, Info,
  AlertTriangle, CheckCircle2, FileText,
} from "lucide-react";

// ISR with short revalidation: legal/company pages are DB-backed but rarely
// change; 60s keeps admin edits visible quickly while skipping DB per view
export const dynamic = "force-static";
export const revalidate = 60;

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

type Block = {
  id: string;
  type: string;
  visible?: boolean;
  text?: string;
  headline?: string;
  sub?: string;
  bg?: string;
  textColor?: string;
  items?: string[];
  head?: string[];
  rows?: string[][];
  variant?: "info" | "warn" | "ok";
  title?: string;
};

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** Static related-policy strip shown at the bottom of every legal page. */
const LEGAL_LINKS: Array<{ slug: string; label: string }> = [
  { slug: "terms-and-conditions", label: "Terms & Conditions" },
  { slug: "privacy-policy", label: "Privacy Policy" },
  { slug: "refund-returns-policy", label: "Refund & Returns" },
  { slug: "shipping-delivery-policy", label: "Shipping & Delivery" },
  { slug: "cancellation-policy", label: "Cancellation" },
  { slug: "pricing-payment-policy", label: "Pricing & Billing" },
  { slug: "about-us", label: "About Us" },
  { slug: "contact-us", label: "Contact Us" },
];

function Blocks({ blocks }: { blocks: Block[] }) {
  const visible = blocks.filter((b) => b.visible !== false);
  const headings = visible.filter((b) => b.type === "h2" && b.text);

  return (
    <div className="mt-6 space-y-5">
      {headings.length >= 3 && (
        <nav aria-label="On this page" className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5">
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-gray-500">On this page</p>
          <div className="flex flex-wrap gap-1.5">
            {headings.map((h, i) => (
              <a
                key={h.id}
                href={`#${slugify(h.text || "")}`}
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:border-yellow-400 hover:bg-yellow-50 hover:text-gray-900"
              >
                {String(i + 1).padStart(2, "0")} · {h.text}
              </a>
            ))}
          </div>
        </nav>
      )}

      {visible.map((b) => {
        switch (b.type) {
          case "updated":
            return (
              <p key={b.id} className="flex items-center gap-2 text-xs text-gray-500">
                <Clock className="h-3.5 w-3.5 text-yellow-500" />
                <span>Last updated: <strong className="font-semibold text-gray-700">{b.text}</strong></span>
              </p>
            );
          case "p":
            return (
              <p key={b.id} className="text-sm leading-relaxed text-gray-700 md:text-[15px]">{b.text}</p>
            );
          case "h2":
            return (
              <h2 key={b.id} id={slugify(b.text || "")} className="scroll-mt-24 border-l-4 border-yellow-400 pl-3 pt-2 text-lg font-black text-gray-900 md:text-xl">
                {b.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={b.id} className="scroll-mt-24 pt-1 text-sm font-bold text-gray-900 md:text-base">{b.text}</h3>
            );
          case "ul":
            return (
              <ul key={b.id} className="space-y-2">
                {(b.items || []).map((it, i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-gray-700 md:text-[15px]">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-400" />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={b.id} className="space-y-2.5">
                {(b.items || []).map((it, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-gray-700 md:text-[15px]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black text-[10px] font-bold text-yellow-400">{i + 1}</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ol>
            );
          case "table":
            return (
              <div key={b.id} className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="bg-black text-yellow-400">
                      {(b.head || []).map((h, i) => (
                        <th key={i} className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(b.rows || []).map((row, ri) => (
                      <tr key={ri} className={ri % 2 ? "bg-gray-50" : "bg-white"}>
                        {row.map((cell, ci) => (
                          <td key={ci} className={`px-4 py-2.5 align-top ${ci === 0 ? "font-semibold text-gray-900" : "text-gray-600"}`}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "callout": {
            const styles = {
              info: { box: "border-blue-200 bg-blue-50", icon: <Info className="h-4 w-4 text-blue-600" />, title: "text-blue-900" },
              warn: { box: "border-amber-200 bg-amber-50", icon: <AlertTriangle className="h-4 w-4 text-amber-600" />, title: "text-amber-900" },
              ok: { box: "border-emerald-200 bg-emerald-50", icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />, title: "text-emerald-900" },
            }[b.variant || "info"];
            return (
              <div key={b.id} className={`rounded-2xl border p-4 md:p-5 ${styles.box}`}>
                <p className={`flex items-center gap-2 text-sm font-bold ${styles.title}`}>
                  {styles.icon}
                  {b.title}
                </p>
                <p className="mt-1.5 pl-6 text-sm leading-relaxed text-gray-700">{b.text}</p>
              </div>
            );
          }
          case "contact": {
            const icons: Record<string, React.ReactNode> = {
              whatsapp: <MessageCircle className="h-4 w-4 text-emerald-500" />,
              phone: <Phone className="h-4 w-4 text-yellow-600" />,
              email: <Mail className="h-4 w-4 text-blue-500" />,
              address: <MapPin className="h-4 w-4 text-red-500" />,
              hours: <Clock className="h-4 w-4 text-gray-500" />,
              shield: <ShieldCheck className="h-4 w-4 text-gray-500" />,
            };
            const pairs = b.items || [];
            return (
              <div key={b.id} className="grid gap-3 sm:grid-cols-2">
                {pairs.map((pair) => {
                  const [k, v] = pair.split("::");
                  const key = k.trim().toLowerCase();
                  const wa = key === "whatsapp" ? v.replace(/[^0-9]/g, "") : "";
                  const isMail = key === "email";
                  const inner = (
                    <>
                      <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">{icons[key] || <Info className="h-4 w-4" />}{k}</span>
                      <span className="mt-1 block text-sm font-semibold text-gray-900">{v}</span>
                    </>
                  );
                  const cls = "rounded-2xl border border-gray-200 bg-white p-4 transition-colors hover:border-yellow-400";
                  return wa
                    ? <a key={b.id + k} href={`https://wa.me/91${wa}`} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
                    : isMail
                      ? <a key={b.id + k} href={`mailto:${v}`} className={cls}>{inner}</a>
                      : <div key={b.id + k} className={cls}>{inner}</div>;
                })}
              </div>
            );
          }
          case "divider":
            return <hr key={b.id} className="border-gray-200" />;
          case "hero":
            return (
              <div key={b.id} className="rounded-2xl p-6 md:p-10" style={{ background: b.bg || "#0a0a0a", color: b.textColor || "#facc15" }}>
                <h2 className="text-2xl font-black md:text-4xl">{b.headline}</h2>
                <p className="mt-2 text-sm opacity-90">{b.sub}</p>
              </div>
            );
          case "richtext":
            return (
              <div key={b.id} className="rounded-2xl border bg-white p-6">
                {(b.text || "").split("\n").filter(Boolean).map((para, i) => (
                  <p key={i} className="mb-3 text-sm leading-relaxed text-gray-600 last:mb-0">{para}</p>
                ))}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) notFound();
  let blocks: Block[] = [];
  try {
    blocks = JSON.parse(page.blocks || "[]");
  } catch { /* noop */ }

  const related = LEGAL_LINKS.filter((l) => l.slug !== slug);

  return (
    <StoreChrome>
      {/* Brand banner */}
      <div className="bg-black">
        <div className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-10">
          <nav className="mb-3 flex items-center gap-1.5 text-[11px] text-gray-500">
            <Link href="/" className="hover:text-yellow-400">Home</Link>
            <span>/</span>
            <span className={page.type === "LEGAL" ? "text-yellow-400" : "text-gray-300"}>{page.title}</span>
          </nav>
          <h1 className="flex items-start gap-3 text-2xl font-black text-white md:text-4xl">
            {page.type === "LEGAL" && <FileText className="mt-1 h-6 w-6 shrink-0 text-yellow-400 md:h-8 md:w-8" />}
            {page.title}
          </h1>
          {page.metaDescription && (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-400">{page.metaDescription}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-gray-800 px-3 py-1 text-[11px] text-gray-400">
              <ShieldCheck className="h-3.5 w-3.5 text-yellow-400" /> DMK Mart · B2B Wholesale Marketplace
            </span>
            {blocks.find((b) => b.type === "updated")?.text && (
              <span className="flex items-center gap-1.5 rounded-full border border-gray-800 px-3 py-1 text-[11px] text-gray-400">
                <Clock className="h-3.5 w-3.5 text-yellow-400" /> Last updated {blocks.find((b) => b.type === "updated")?.text}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
        <Blocks blocks={blocks} />

        {/* Related policies */}
        <div className="mt-10 rounded-2xl border border-gray-200 bg-white p-5">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-gray-500">Related pages</p>
          <div className="flex flex-wrap gap-2">
            {related.map((l) => (
              <Link
                key={l.slug}
                href={`/page/${l.slug}`}
                className="rounded-full border border-gray-200 bg-gray-50 px-3.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-yellow-400 hover:bg-yellow-50 hover:text-gray-900"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </StoreChrome>
  );
}
