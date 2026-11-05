import type { Metadata } from "next";
import { WarehousePanel } from "@/components/admin/warehouse-panel";

export const metadata: Metadata = {
  title: "Warehouse Manager Portal — DMK Mart B2B",
  robots: { index: false, follow: false },
};

export default function WarehouseLoginPage() {
  return <WarehousePanel />;
}
