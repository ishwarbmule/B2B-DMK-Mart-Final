import type { Metadata } from "next";
import { SalesteamPanel } from "@/components/admin/salesteam-panel";

export const metadata: Metadata = {
  title: "Sales Team Portal — DMK Mart B2B",
  robots: { index: false, follow: false },
};

export default function SalesteamLoginPage() {
  return <SalesteamPanel />;
}
