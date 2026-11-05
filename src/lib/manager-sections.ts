/** Client-safe constants: admin-panel sections a warehouse manager can be granted.
 *  Mirrors the admin-portal module ids (staff-auth.ts re-exports for server use). */
export const MANAGER_SECTIONS: { id: string; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "orders", label: "Orders & Invoices" },
  { id: "warehouseStock", label: "Warehouse Stock" },
  { id: "products", label: "Product Management" },
  { id: "financial", label: "Financial Section" },
  { id: "reports", label: "Reports & Exports" },
  { id: "customers", label: "Customer Management" },
  { id: "approvals", label: "Buyer Approvals" },
];
