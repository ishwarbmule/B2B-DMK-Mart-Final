import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

export const metadata = { title: "DMK Mart — Homepage Design Gallery" };

const DESIGNS = [
  {
    href: "/home/dmart",
    name: "DMart style",
    tag: "Value Bazaar",
    desc: "Clean, price-first grocery-warehouse look — wide yellow banner, category circles, deal scrollers and a no-nonsense best-sellers grid.",
    points: ["Everyday-low-price banner", "Circular category chips", "Deals of the Day rail", "Compact price-led cards"],
    accent: "bg-yellow-400",
  },
  {
    href: "/home/etsy",
    name: "Etsy style",
    tag: "Editorial Marketplace",
    desc: "Warm cream marketplace feel — serif display type, inspiration collage hero, Editors' Picks grid, shop-by-price chips and gift guides.",
    points: ["Serif editorial hero", "Circular category row", "Editors' Picks + price chips", "Gift guide banners"],
    accent: "bg-amber-300",
  },
  {
    href: "/home/croma",
    name: "Croma style",
    tag: "Sleek Tech Retail",
    desc: "Black-and-white tech-store energy — utility strip, glossy dark hero, live-countdown Deals of the Day band and best-rated product cards.",
    points: ["Dark mega-days hero", "Countdown deals band", "Rectangular category tiles", "Ratings + bank-offer tags"],
    accent: "bg-zinc-700",
  },
  {
    href: "/home/vijaysales",
    name: "Vijay Sales style",
    tag: "Deal Blitz",
    desc: "Offer-heavy electronics-bazaar energy — scrolling announcement marquee, 1+2 banner grid, bank-offer strip and claimed-stock deal cards.",
    points: ["Offer marquee ticker", "Big + stacked banner grid", "Bank-offer tiles", "Deal of the Day with stock bars"],
    accent: "bg-red-500",
  },
];

export default function HomeIndex() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex items-center gap-3">
          <Image src="/dmk-logo.png" alt="DMK Mart" width={44} height={44} className="h-11 w-11 rounded-full" unoptimized />
          <div>
            <h1 className="text-2xl font-black tracking-tight">Homepage Design Gallery</h1>
            <p className="text-xs text-gray-400">Four store-grade homepage layouts built on the live DMK Mart catalog</p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {DESIGNS.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className="group rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-yellow-400/60 hover:bg-white/10"
            >
              <div className="flex items-center justify-between">
                <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-black ${d.accent}`}>
                  {d.tag}
                </span>
                <ArrowRight className="h-4 w-4 text-gray-500 transition group-hover:translate-x-1 group-hover:text-yellow-400" />
              </div>
              <h2 className="mt-4 text-xl font-black">{d.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">{d.desc}</p>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {d.points.map((p) => (
                  <li key={p} className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold text-gray-300">
                    {p}
                  </li>
                ))}
              </ul>
            </Link>
          ))}
        </div>

        <Link
          href="/"
          className="mt-8 flex items-center justify-between rounded-2xl border border-yellow-400/40 bg-yellow-400/10 p-6 transition hover:bg-yellow-400/20"
        >
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-yellow-400">The original</p>
            <h2 className="mt-1 text-xl font-black">DMK Commerce X homepage</h2>
            <p className="mt-1 text-sm text-gray-400">Dark editorial hero, bento deals, tabbed showcase and brand marquee.</p>
          </div>
          <ArrowRight className="h-5 w-5 text-yellow-400" />
        </Link>
      </div>
    </div>
  );
}
