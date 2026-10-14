"use client";

import Image from "next/image";
import Link from "next/link";
import { Phone, Mail, MapPin, ShieldCheck, Truck, Store, MessageCircle } from "lucide-react";
import { useEffect } from "react";
import { useCatalog } from "./site-header-v2";
import { useSiteStore } from "@/lib/store";
import { waLink } from "./whatsapp-float";

export function SiteFooter() {
  const catalog = useCatalog();
  const gst = useSiteStore((s) => s.gstEnabled);
  useEffect(() => { useSiteStore.getState().load(); }, []);
  const tops = catalog?.tops ?? [];
  const pages = catalog?.footerPages ?? [];
  const settings = catalog?.settings ?? {};

  return (
    <footer className="mt-12 bg-black text-gray-300">
      <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-10 md:grid-cols-4 md:px-8">
        <div>
          <Link href="/" className="flex items-center gap-2">
            <Image src="/dmk-logo.png" alt="DMK Mart" width={40} height={40} className="h-10 w-10 rounded-full" unoptimized />
            <div>
              <p className="text-base font-black text-white">DMK <span className="text-yellow-400">Mart</span></p>
              <p className="text-[10px] text-gray-500">B2B Wholesale Marketplace</p>
            </div>
          </Link>
          <p className="mt-3 text-xs leading-relaxed text-gray-400">
            {settings.site_tagline ?? "Plastic & Home Appliances Wholesale"} — pieces, packs & bulk cases from 39 trusted brands with tier-based B2B pricing.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
            {gst && <span className="flex items-center gap-1 rounded-full border border-gray-800 px-2 py-1"><ShieldCheck className="h-3 w-3 text-yellow-400" /> GST Registered</span>}
            <span className="flex items-center gap-1 rounded-full border border-gray-800 px-2 py-1"><Truck className="h-3 w-3 text-yellow-400" /> Fast Dispatch</span>
            <span className="flex items-center gap-1 rounded-full border border-gray-800 px-2 py-1"><Store className="h-3 w-3 text-yellow-400" /> OTP-verified Delivery</span>
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-yellow-400">Top Departments</p>
          <ul className="space-y-1.5 text-xs">
            {tops.slice(0, 7).map((t) => (
              <li key={t.id}>
                <Link href={`/catalog?top=${t.id}`} className="text-gray-400 hover:text-yellow-400">{t.name}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-yellow-400">Quick Links</p>
          <ul className="space-y-1.5 text-xs">
            <li><Link href="/catalog" className="text-gray-400 hover:text-yellow-400">All Products</Link></li>
            <li><Link href="/brands" className="text-gray-400 hover:text-yellow-400">Brand Portfolio</Link></li>
            <li><Link href="/catalog?flag=deal" className="text-gray-400 hover:text-yellow-400">Deals of the Day</Link></li>
            <li><Link href="/account" className="text-gray-400 hover:text-yellow-400">B2B Account</Link></li>
            <li><Link href="/admin" className="font-semibold text-yellow-400 hover:underline">Admin Login</Link></li>
          </ul>
          <p className="mt-4 mb-2 text-xs font-bold uppercase tracking-widest text-yellow-400">B2B Price Slabs</p>
          <ul className="space-y-1 text-[11px] text-gray-500">
            <li>₹5k+ order · 2% off</li>
            <li>₹25k+ order · 4% off</li>
            <li>₹50k+ order · 7% off</li>
            <li>₹1L+ order · 10% off</li>
          </ul>
        </div>

        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-yellow-400">Contact</p>
          <ul className="space-y-2.5 text-xs">
            {(() => {
              const wa = waLink(settings.support_phone);
              return wa ? (
                <li className="flex gap-2">
                  <MessageCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-400 hover:underline">Chat on WhatsApp</a>
                </li>
              ) : null;
            })()}
            <li className="flex gap-2"><Phone className="h-4 w-4 shrink-0 text-yellow-400" /> {settings.support_phone ?? "+91 98220 12345"} (wholesale desk)</li>
            <li className="flex gap-2"><Mail className="h-4 w-4 shrink-0 text-yellow-400" /> {settings.support_email ?? "dmkmartdata@gmail.com"}</li>
            <li className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-yellow-400" /> <span className="text-gray-400">{settings.address ?? "Plot 14, MIDC Industrial Area, Solapur Road, Pune 411019"}</span></li>
          </ul>
          {pages.length > 0 && (
            <>
              <p className="mt-4 mb-2 text-xs font-bold uppercase tracking-widest text-yellow-400">Information</p>
              <ul className="space-y-1 text-[11px]">
                {pages.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/page/${p.slug}`} className="text-gray-400 hover:text-yellow-400">{p.title}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
      <div className="border-t border-gray-900 py-4 text-center text-[11px] text-gray-600">
        © 2026 DMK Mart · All rights reserved · {gst ? "Prices exclusive of GST unless stated" : "Prices as marked · no additional taxes"}
      </div>
    </footer>
  );
}
