"use client";

/**
 * Warehouse Manager Portal (/warehouse) — logins created by the admin per godown.
 * The admin chooses which admin sections each manager can open; the granted sections
 * render with the very same modules as the Super Admin portal. Orders are scoped to
 * the manager's warehouse (routing: pickup choice / nearest to the buyer's city) and
 * Warehouse Stock is locked to their godown.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { LogOut, Menu, X, Warehouse as WarehouseIcon } from "lucide-react";
import { toast } from "sonner";
import { DashboardModule, CustomersModule, PricingModule } from "./business-modules-1";
import { FinancialModule, ReportsModule } from "./business-modules-2";
import { ProductsModule } from "./products-module";
import { OrdersModule } from "./orders-module";
import { ApprovalsModule } from "./approvals-module";
import { WarehouseStockModule } from "./warehouse-stock-module";
import { MANAGER_SECTIONS } from "@/lib/manager-sections";

type ManagerProfile = {
  id: string; name: string; username: string;
  warehouseId: string; warehouseName: string; warehouseCity: string;
  permissions: string[];
};

const SECTION_ICONS: Record<string, string> = {
  dashboard: "📊", orders: "🧾", warehouseStock: "📦", products: "🏷️",
  financial: "💰", reports: "📑", customers: "🤝", approvals: "✅",
};

export function WarehousePanel() {
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<ManagerProfile | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [signing, setSigning] = useState(false);
  const [active, setActive] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("dmk-warehouse-token");
    const p = localStorage.getItem("dmk-warehouse-profile");
    if (t && p) {
      setToken(t);
      try {
        const parsed = JSON.parse(p) as ManagerProfile;
        setProfile(parsed);
        setActive(parsed.permissions[0] ?? "");
      } catch { /* relogin */ }
    }
  }, []);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigning(true);
    try {
      const res = await fetch("/api/warehouse/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Invalid credentials"); return; }
      localStorage.setItem("dmk-warehouse-token", data.token);
      localStorage.setItem("dmk-warehouse-profile", JSON.stringify(data.profile));
      setToken(data.token);
      setProfile(data.profile);
      setActive((data.profile.permissions ?? [])[0] ?? "");
      toast.success(`Welcome ${data.profile.name} — ${data.profile.warehouseName}`);
    } catch {
      toast.error("Network error");
    } finally {
      setSigning(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem("dmk-warehouse-token");
    localStorage.removeItem("dmk-warehouse-profile");
    setToken(null);
    setProfile(null);
  };

  if (!token || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-4">
        <div className="w-full max-w-sm rounded-3xl border border-gray-800 bg-gray-950 p-8">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <Image src="/dmk-logo.png" alt="DMK Mart" width={56} height={56} className="h-14 w-14 rounded-full" unoptimized />
            <h1 className="text-lg font-black text-white">DMK Mart <span className="text-yellow-400">Warehouse</span></h1>
            <p className="text-[11px] text-gray-500">Godown manager portal · orders &amp; stock for your warehouse</p>
          </div>
          <form onSubmit={signIn} className="space-y-3">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="h-11 w-full rounded-xl border border-gray-800 bg-gray-900 px-3.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-yellow-400"
              required
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="h-11 w-full rounded-xl border border-gray-800 bg-gray-900 px-3.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-yellow-400"
              required
            />
            <button
              type="submit"
              disabled={signing}
              className="h-11 w-full rounded-xl bg-yellow-400 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:opacity-60"
            >
              {signing ? "Signing in…" : "Sign In"}
            </button>
          </form>
          <p className="mt-4 text-center text-[10px] text-gray-600">Manager logins are created by the DMK Mart admin (Warehouse Managers).</p>
        </div>
      </div>
    );
  }

  const sections = MANAGER_SECTIONS.filter((s) => profile.permissions.includes(s.id));
  const activeLabel = sections.find((s) => s.id === active)?.label ?? "Warehouse";

  const renderSection = () => {
    switch (active) {
      case "dashboard": return <DashboardModule token={token} />;
      case "orders": return <OrdersModule token={token} lockedWarehouseId={profile.warehouseId} />;
      case "warehouseStock": return <WarehouseStockModule token={token} lockedWarehouseId={profile.warehouseId} />;
      case "products": return <ProductsModule token={token} />;
      case "financial": return <FinancialModule token={token} />;
      case "reports": return <ReportsModule token={token} />;
      case "customers": return <CustomersModule token={token} />;
      case "approvals": return <ApprovalsModule token={token} />;
      default:
        return <p className="rounded-xl border border-dashed p-10 text-center text-sm text-gray-400">No sections enabled — ask the admin to grant you access.</p>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-black px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={() => setSidebarOpen((s) => !s)} className="text-gray-400 hover:text-white lg:hidden" aria-label="Toggle sidebar">
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Image src="/dmk-logo.png" alt="DMK" width={30} height={30} className="h-[30px] w-[30px] rounded-full" unoptimized />
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-white">{profile.name} <span className="hidden text-yellow-400 sm:inline">· Warehouse Manager</span></p>
            <p className="truncate text-[10px] text-yellow-400">🏭 {profile.warehouseName}{profile.warehouseCity ? ` — ${profile.warehouseCity}` : ""}</p>
          </div>
        </div>
        <button onClick={signOut} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-black text-black hover:bg-yellow-300">
          <LogOut className="h-3.5 w-3.5" /> Logout
        </button>
      </div>

      <div className="flex">
        <aside
          className={`fixed inset-y-14 left-0 z-30 w-60 overflow-y-auto border-r border-gray-800 bg-gray-950 pb-8 transition-transform lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <nav className="px-2 py-3">
            <p className="px-3 pb-1 pt-2 text-[9px] font-black uppercase tracking-widest text-gray-600">My Sections</p>
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => { setActive(s.id); setSidebarOpen(false); }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${active === s.id ? "bg-yellow-400 text-black" : "text-gray-400 hover:bg-gray-900 hover:text-white"}`}
              >
                <span aria-hidden>{SECTION_ICONS[s.id] ?? "•"}</span>
                {s.label}
              </button>
            ))}
            {sections.length === 0 && (
              <p className="px-3 py-2 text-[10px] text-gray-500">No sections granted yet — contact the Super Admin.</p>
            )}
            <div className="mt-4 border-t border-gray-800 px-3 pt-3">
              <p className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500"><WarehouseIcon className="h-3 w-3" /> My godown is locked — orders &amp; stock are scoped to {profile.warehouseName}.</p>
            </div>
          </nav>
        </aside>

        {sidebarOpen && <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

        <main className="min-w-0 flex-1 p-4 md:p-6">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            Warehouse <span className="text-gray-300">/ {activeLabel}</span>
          </p>
          {renderSection()}
        </main>
      </div>
    </div>
  );
}
