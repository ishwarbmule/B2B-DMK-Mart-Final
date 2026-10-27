"use client";

import { DmkLogo } from "./logo";
import { Phone, Mail, MapPin, Lock } from "lucide-react";

const columns = [
  {
    title: "Shop",
    links: ["Planters & Garden", "Buckets & Tubs", "Cleaning Tools", "Furniture & Seating", "Storage & Organization", "Appliances & Machines"],
  },
  {
    title: "B2B",
    links: ["Tier Pricing", "Bulk Orders", "Distributor Network", "Dealer Registration", "Itemised Invoicing"],
  },
  {
    title: "Help",
    links: ["FAQs", "Contact Us", "Returns Policy", "Delivery Information", "Terms of Use", "Privacy Policy"],
  },
];

export function Footer({ onAdmin }: { onAdmin: () => void }) {
  return (
    <footer className="mt-auto bg-black text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1">
          <div className="inline-flex items-center gap-2">
            <img src="/dmk-logo.png" alt="DMK Mart logo" className="h-11 w-11 rounded-full" />
            <div className="flex flex-col leading-none">
              <span className="font-extrabold text-2xl text-white">DMK <span className="text-[#ffd400]">Mart</span></span>
              <span className="text-[10px] font-bold text-[#ffd400] mt-1">Save More. Shop More.</span>
            </div>
          </div>
          <p className="text-xs text-white/60 mt-3 leading-relaxed">
            DMK Mart — one-stop bazaar for household plastics, planters, kitchenware, furniture and
            cleaning essentials at wholesale-tier prices. Demo store for preview purposes.
          </p>
          <div className="mt-4 space-y-1.5 text-xs text-white/60">
            <p className="flex items-center gap-2"><Phone className="h-3 w-3 text-[#ffd400]" /> 1800-123-4567 (toll free)</p>
            <p className="flex items-center gap-2"><Mail className="h-3 w-3 text-[#ffd400]" /> care@dmkmart.example</p>
            <p className="flex items-center gap-2"><MapPin className="h-3 w-3 text-[#ffd400]" /> Serving 200+ cities across India</p>
          </div>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <h4 className="text-sm font-bold mb-3 text-[#ffd400]">{col.title}</h4>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l}>
                  <span className="text-xs text-white/60 hover:text-white cursor-pointer transition-colors">
                    {l}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-[11px] text-white/50">
            © {new Date().getFullYear()} DMK Mart. All rights reserved. For demonstration only.
          </p>
          <button
            onClick={onAdmin}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/60 hover:text-[#ffd400] transition-colors"
          >
            <Lock className="h-3 w-3" /> Admin Login
          </button>
        </div>
      </div>
    </footer>
  );
}
