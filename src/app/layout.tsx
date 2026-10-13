import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "DMK Mart B2B — Wholesale Marketplace | Plastic, Kitchenware & Home Appliances",
    template: "%s | DMK Mart B2B",
  },
  description:
    "DMK Mart is a B2B wholesale marketplace for plastic household products, kitchenware, furniture and home appliances — 2,272+ SKUs from 39 trusted brands with retailer, wholesaler & distributor tier pricing, GST invoicing and OTP-verified delivery.",
  keywords: ["DMK Mart", "B2B wholesale", "plastic household", "kitchenware wholesale", "bulk appliances", "retailer distributor", "Maharashtra"],
  icons: {
    icon: "/dmk-logo.png",
  },
  openGraph: {
    siteName: "DMK Mart B2B",
    type: "website",
    images: ["/dmk-logo.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#ffd400",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <SonnerToaster position="bottom-center" richColors closeButton />
      </body>
    </html>
  );
}
