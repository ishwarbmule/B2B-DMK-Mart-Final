import type { Metadata } from "next";
import { AdminPortal } from "@/components/admin/admin-portal";

export const metadata: Metadata = {
  title: "Super Admin Portal — DMK Mart B2B",
  robots: { index: false },
};

export default function AdminPage() {
  return <AdminPortal />;
}
