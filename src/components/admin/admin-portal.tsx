"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, Globe, Package, Building2, ShoppingCart,
  Users, LogOut, Menu, X, Eye, Settings2, ChevronRight, Megaphone,
  Barcode as BarcodeIcon, BadgePercent, IndianRupee, Wallet, FileSpreadsheet,
  Database,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardModule, CustomersModule, PricingModule, BrandProductsModule } from "./business-modules-1";
import { FinancialModule, ReportsModule, WebsiteModule, StorefrontsModule, HomeEditorModule } from "./business-modules-2";
import { ProductsModule } from "./products-module";
import { OrdersModule } from "./orders-module";
import { SettingsModule } from "./settings-module";
import { SyncModule } from "./sync-module";
import { BarcodeStudio } from "./barcode-studio";
import { CrudModule } from "./ui-bits";
import { CONFIGS } from "./crud-configs";

type ModuleId = string;

const NAV: { group: string; items: { id: ModuleId; label: string; icon: React.ComponentType<{ className?: string }>; sub?: { id: string; label: string }[] }[] }[] = [
  { group: "Command Center", items: [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "financial", label: "Financial Section", icon: Wallet },
    { id: "reports", label: "Reports & Exports", icon: FileSpreadsheet },
  ]},
  { group: "Catalog & Pricing", items: [
    { id: "products", label: "Product Management", icon: Package, sub: [
      { id: "products", label: "Products & Sections" },
      { id: "tops", label: "Top Categories" },
      { id: "mids", label: "Mid Categories" },
      { id: "ends", label: "End Categories" },
    ]},
    { id: "brands", label: "Brand Management", icon: Building2, sub: [
      { id: "brands", label: "Brands" },
      { id: "brand-products", label: "Brand Products" },
      { id: "storefronts", label: "Brand Storefronts" },
    ]},
    { id: "pricing", label: "Products Pricing", icon: IndianRupee },
  ]},
  { group: "Sales & Fulfilment", items: [
    { id: "orders", label: "Orders & Invoices", icon: ShoppingCart },
    { id: "barcodes", label: "Barcode Printing", icon: BarcodeIcon },
  ]},
  { group: "Growth", items: [
    { id: "offers", label: "Offers & Coupons", icon: BadgePercent, sub: [
      { id: "offers", label: "Offers / Big Sale Days" },
      { id: "coupons", label: "Coupons" },
    ]},
    { id: "ads", label: "Brand Ads", icon: Megaphone },
  ]},
  { group: "People", items: [
    { id: "customers", label: "Customer Management", icon: Users },
  ]},
  { group: "Website & System", items: [
    { id: "website", label: "Website Management", icon: Globe, sub: [
      { id: "website", label: "Pages / SEO / Robots" },
      { id: "homeEditor", label: "Homepage Editor (v2)" },
      { id: "seoMeta", label: "SEO Manager" },
    ]},
    { id: "sync", label: "Data Sync (ERP MySQL)", icon: Database },
    { id: "settings", label: "Settings", icon: Settings2 },
  ]},
];

export function AdminPortal() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [signing, setSigning] = useState(false);
  const [active, setActive] = useState<ModuleId>("dashboard");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("dmk-admin-token");
    if (t) setToken(t);
  }, []);

  const call = useMemo(
    () => async (path: string, init?: RequestInit) => {
      const res = await fetch(path, {
        ...init,
        headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init?.headers || {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem("dmk-admin-token");
        setToken(null);
        throw new Error("Session expired — sign in again");
      }
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      return data;
    },
    [token]
  );

  const signIn = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSigning(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginId, password }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Invalid credentials"); return; }
      localStorage.setItem("dmk-admin-token", data.token);
      setToken(data.token);
      toast.success("Welcome back, Super Admin!");
    } catch {
      toast.error("Network error");
    } finally {
      setSigning(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem("dmk-admin-token");
    setToken(null);
    router.push("/");
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-4">
        <div className="w-full max-w-sm rounded-3xl border border-gray-800 bg-gray-950 p-8">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <Image src="/dmk-logo.png" alt="DMK Mart" width={56} height={56} className="h-14 w-14 rounded-full" unoptimized />
            <h1 className="text-lg font-black text-white">DMK Mart <span className="text-yellow-400">Super Admin</span></h1>
            <p className="text-[11px] text-gray-500">B2B Administration Portal · secure sign-in</p>
          </div>
          <form onSubmit={signIn} className="space-y-3">
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="Login ID"
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
              {signing ? "Signing in…" : "Sign In to Portal"}
            </button>
          </form>
          <p className="mt-4 text-center text-[10px] text-gray-600">ID: <b className="text-gray-400">B2B DMK Mart</b> · Password: <b className="text-gray-400">1234</b></p>
        </div>
      </div>
    );
  }

  const renderModule = () => {
    switch (active) {
      case "dashboard": return <DashboardModule token={token} />;
      case "products": return <ProductsModule token={token} />;
      case "orders": return <OrdersModule token={token} />;
      case "barcodes": return <BarcodeStudio token={token} />;
      case "customers": return <CustomersModule token={token} />;
      case "pricing": return <PricingModule token={token} />;
      case "financial": return <FinancialModule token={token} />;
      case "reports": return <ReportsModule token={token} />;
      case "website": return <WebsiteModule token={token} />;
      case "homeEditor": return <HomeEditorModule token={token} />;
      case "storefronts": return <StorefrontsModule token={token} />;
      case "sync": return <SyncModule token={token} />;
      case "settings": return <SettingsModule token={token} />;
      case "brand-products": return <BrandProductsModule token={token} />;
      default: {
        const cfg = CONFIGS[active];
        if (!cfg) return <p className="rounded-xl border border-dashed p-10 text-center text-sm text-gray-400">Module not found.</p>;
        return (
          <CrudModule
            key={active}
            entity={active}
            title={cfg.title}
            sub={cfg.sub}
            nameField={cfg.nameField}
            fields={cfg.fields}
            columns={cfg.columns}
            tableImage={cfg.tableImage}
            token={token}
          />
        );
      }
    }
  };

  const activeLabel = NAV.flatMap((g) => g.items).find((i) => i.id === active || i.sub?.some((s) => s.id === active))?.label ?? "Admin";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-black px-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen((s) => !s)} className="text-gray-400 hover:text-white lg:hidden" aria-label="Toggle sidebar">
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Image src="/dmk-logo.png" alt="DMK" width={30} height={30} className="h-[30px] w-[30px] rounded-full" unoptimized />
          <p className="text-sm font-black text-white">DMK Mart <span className="hidden text-yellow-400 sm:inline">Super Admin</span></p>
          <span className="rounded-md bg-yellow-400 px-2 py-0.5 text-[10px] font-black uppercase text-black">14 Modules</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/")} className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-gray-900">
            <Eye className="h-3.5 w-3.5" /> View Store
          </button>
          <button onClick={signOut} className="flex items-center gap-1.5 rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-black text-black hover:bg-yellow-300">
            <LogOut className="h-3.5 w-3.5" /> Logout
          </button>
        </div>
      </div>

      <div className="flex">
        {/* sidebar */}
        <aside
          className={`fixed inset-y-14 left-0 z-30 w-64 overflow-y-auto border-r border-gray-800 bg-gray-950 pb-8 transition-transform lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <nav className="px-2 py-3">
            {NAV.map((g) => (
              <div key={g.group} className="mb-2">
                <p className="px-3 pb-1 pt-2 text-[9px] font-black uppercase tracking-widest text-gray-600">{g.group}</p>
                {g.items.map((it) => {
                  const isOpen = openGroup === it.id;
                  const isActive = active === it.id || it.sub?.some((s) => s.id === active);
                  const Icon = it.icon;
                  return (
                    <div key={it.id}>
                      <button
                        onClick={() => {
                          if (it.sub) setOpenGroup(isOpen ? null : it.id);
                          else { setActive(it.id); setSidebarOpen(false); }
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${isActive ? "bg-yellow-400 text-black" : "text-gray-400 hover:bg-gray-900 hover:text-white"}`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1">{it.label}</span>
                        {it.sub && <ChevronRight className={`h-3 w-3 transition ${isOpen ? "rotate-90" : ""}`} />}
                      </button>
                      {it.sub && isOpen && (
                        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-gray-800 pl-2">
                          {it.sub.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => { setActive(s.id); setSidebarOpen(false); }}
                              className={`block w-full rounded-md px-2.5 py-1.5 text-left text-[11px] font-medium ${active === s.id ? "bg-gray-800 text-yellow-400" : "text-gray-500 hover:text-white"}`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        {sidebarOpen && <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

        {/* main */}
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            Super Admin <span className="text-gray-300">/ {activeLabel}</span>
          </p>
          {renderModule()}
        </main>
      </div>
    </div>
  );
}
