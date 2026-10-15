"use client";

import { MessageCircle } from "lucide-react";
import { useCatalog } from "./site-header-v2";

/** Free customer-care WhatsApp deep link (wa.me) — opens a chat with the wholesale desk.
 *  Uses the `support_phone` setting; every customer message opens a 24h service window,
 *  which makes subsequent order-status updates FREE on the official Meta Cloud API. */
export function waLink(supportPhone: string | undefined): string | null {
  const digits = String(supportPhone ?? "").replace(/\D/g, "").slice(-10);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `https://wa.me/91${digits}?text=${encodeURIComponent("Hi DMK Mart, I need help with a wholesale order.")}`;
}

/** Floating green WhatsApp chat bubble (bottom-right) on the storefront. */
export function WhatsAppFloat() {
  const catalog = useCatalog();
  const href = waLink(catalog?.settings?.support_phone);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with DMK Mart on WhatsApp"
      className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/25 transition hover:scale-105 hover:bg-[#1fb958]"
    >
      <MessageCircle className="h-6 w-6 fill-current" />
      <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
      </span>
    </a>
  );
}
