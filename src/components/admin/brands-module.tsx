"use client";

/**
 * Brand Management wrapper — the generic CRUD table plus two one-click
 * actions. Brands mirror the companies already present in the catalog
 * (brand = company), so a fresh catalog never needs manual brand creation:
 *   - "Sync brands from companies" creates any missing brands and instantly
 *     applies the matching Cloudinary logo when a file with that name exists.
 *   - "Update logos from Cloudinary" re-runs the logo match for every brand —
 *     file names in dmk-mart/brand-logos (or dmk-mart/brands) matching the
 *     brand name / URL slug / data-source alias are applied as Brand.logo.
 * Per-brand upload / library picking in the form stays available for the rest.
 */
import { useState } from "react";
import { Images, Users } from "lucide-react";
import { toast } from "sonner";
import { CrudModule, api } from "./ui-bits";
import { CONFIGS } from "./crud-configs";

export function BrandsModule({ token }: { token: string }) {
  const call = api(token);
  const cfg = CONFIGS.brands;
  const [syncing, setSyncing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const syncCompanies = async () => {
    if (!confirm("Create a brand for every company in the catalog that doesn't have one yet?")) return;
    setSyncing(true);
    try {
      const d = await call("/api/admin/brands/sync-companies", { method: "POST" });
      if (d.created > 0) {
        const logos = d.logosMatched ? ` — ${d.logosMatched} logo${d.logosMatched > 1 ? "s" : ""} pulled from Cloudinary` : "";
        toast.success(`${d.created} brand${d.created > 1 ? "s" : ""} created from ${d.totalCompanies} companies${logos}`);
      } else {
        toast.message(`All ${d.totalCompanies} companies already have brands — nothing to create`);
      }
      setRefreshKey((k) => k + 1); // remount CrudModule → refetches the list
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Brand sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const pullLogos = async () => {
    if (!confirm("Match every brand's logo from the Cloudinary library? File names that match a brand name are applied automatically.")) return;
    setPulling(true);
    try {
      const d = await call("/api/admin/brands/cloudinary-logos", { method: "POST" });
      const missing = (d.missing ?? []) as { name: string }[];
      if (d.updated > 0) {
        toast.success(`${d.updated} logo${d.updated > 1 ? "s" : ""} updated from Cloudinary` + (missing.length ? ` — ${missing.length} brand${missing.length > 1 ? "s" : ""} still without a file` : ""));
      } else if (missing.length) {
        toast.message(`All matched logos already current — ${missing.length} brand${missing.length > 1 ? "s" : ""} without a Cloudinary file: ${missing.slice(0, 5).map((m) => m.name).join(", ")}${missing.length > 5 ? "…" : ""}`);
      } else {
        toast.success("All brand logos are already up to date");
      }
      if (d.updated > 0) setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Logo pull failed");
    } finally {
      setPulling(false);
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
        <>
          <button
            onClick={syncCompanies}
            disabled={syncing}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-yellow-400 bg-yellow-50 px-3 text-[13px] font-semibold text-gray-800 transition-colors hover:bg-yellow-100 disabled:opacity-50"
          >
            <Users className="h-4 w-4 text-yellow-600" /> {syncing ? "Syncing…" : "Sync brands from companies"}
          </button>
          <button
            onClick={pullLogos}
            disabled={pulling}
            title="Applies the Cloudinary file whose name matches each brand (name, URL slug or data-source alias) as its logo"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-yellow-400 bg-yellow-50 px-3 text-[13px] font-semibold text-gray-800 transition-colors hover:bg-yellow-100 disabled:opacity-50"
          >
            <Images className="h-4 w-4 text-yellow-600" /> {pulling ? "Matching…" : "Update logos from Cloudinary"}
          </button>
        </>
      }
    />
  );
}
