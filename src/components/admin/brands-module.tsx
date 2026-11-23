"use client";

/**
 * Brand Management wrapper — the generic CRUD table plus a one-click
 * "Sync brands from companies" action. Brands mirror the companies already
 * present in the catalog (brand = company), so a fresh catalog never needs
 * manual brand creation; logos are then uploaded / picked from Cloudinary
 * (folder dmk-mart/brands) via the form's Library button.
 */
import { useState } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { CrudModule, api } from "./ui-bits";
import { CONFIGS } from "./crud-configs";

export function BrandsModule({ token }: { token: string }) {
  const call = api(token);
  const cfg = CONFIGS.brands;
  const [syncing, setSyncing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const syncCompanies = async () => {
    if (!confirm("Create a brand for every company in the catalog that doesn't have one yet?")) return;
    setSyncing(true);
    try {
      const d = await call("/api/admin/brands/sync-companies", { method: "POST" });
      if (d.created > 0) toast.success(`${d.created} brand${d.created > 1 ? "s" : ""} created from ${d.totalCompanies} companies — now add their logos`);
      else toast.message(`All ${d.totalCompanies} companies already have brands — nothing to create`);
      setRefreshKey((k) => k + 1); // remount CrudModule → refetches the list
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Brand sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <CrudModule
      key={refreshKey}
      entity="brands"
      title={cfg.title}
      sub={cfg.sub}
      nameField={cfg.nameField}
      fields={cfg.fields}
      columns={cfg.columns}
      tableImage={cfg.tableImage}
      token={token}
      headerExtra={
        <button
          onClick={syncCompanies}
          disabled={syncing}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-yellow-400 bg-yellow-50 px-3 text-[13px] font-semibold text-gray-800 transition-colors hover:bg-yellow-100 disabled:opacity-50"
        >
          <Users className="h-4 w-4 text-yellow-600" /> {syncing ? "Syncing…" : "Sync brands from companies"}
        </button>
      }
    />
  );
}
