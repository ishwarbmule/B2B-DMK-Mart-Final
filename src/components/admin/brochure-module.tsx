"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { BookOpen, Loader2, FileDown } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader } from "./ui-bits";
import { formatINR } from "@/lib/store";
import type { DProduct } from "@/lib/types";

/** Catalog Generator / Download Brochure — printable brand-wise catalog */
export function BrochureModule({ token }: { token: string }) {
  const call = useMemo(() => api(token), [token]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [company, setCompany] = useState("");
  const [rows, setRows] = useState<DProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useMemo(() => {
    call("/api/admin/crud/companies").then((d) => setCompanies(d.rows)).catch(() => {});
  }, [call]);

  const generate = async () => {
    setLoading(true);
    try {
      const d = await call(`/api/admin/products?limit=60&company=${company}`);
      setRows(d.rows); setLoaded(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setLoading(false); }
  };

  const download = () => window.print();

  return (
    <div>
      <ModuleHeader title="Catalog Generator / Download Brochure" sub="Generate a printable brand-wise dealer catalog">
        <select value={company} onChange={(e) => setCompany(e.target.value)} className="h-9 rounded-lg border border-gray-200 px-2 text-xs" aria-label="Select brand">
          <option value="">All Companies</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={generate} className="flex items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-xs font-bold text-yellow-400">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />} Generate Catalog
        </button>
        {loaded && (
          <button onClick={download} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">
            <FileDown className="h-3.5 w-3.5" /> Print / Save PDF
          </button>
        )}
      </ModuleHeader>

      {loaded && (
        <div id="brochure-sheet" className="rounded-xl border bg-white p-5 print:border-0">
          <div className="mb-4 flex items-center gap-3 border-b-2 border-yellow-400 pb-3">
            <Image src="/dmk-logo.png" alt="DMK Mart" width={48} height={48} className="h-12 w-12 rounded-full" unoptimized />
            <div>
              <h2 className="text-lg font-black">DMK MART — Wholesale Dealer Catalog</h2>
              <p className="text-[11px] text-gray-500">{rows.length} SKUs {company ? `· ${brands.find((c) => c.id === company)?.name}` : "· all brands"} · wholesale prices · valid while stocks last</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border p-2">
                <Image src={r.image} alt="" width={80} height={80} className="mx-auto h-20 w-20 rounded-md object-cover" unoptimized />
                <p className="mt-1 line-clamp-2 min-h-[28px] text-[11px] font-bold leading-tight">{r.name}</p>
                <p className="text-[9px] text-gray-400">{r.brand?.name} · {r.packQty} u/pack</p>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-[11px] font-black text-yellow-700">{formatINR(r.basePrice)}</span>
                  <span className="text-[9px] text-gray-400 line-through">{formatINR(r.mrp)}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-[10px] text-gray-400">DMK Mart · b2b.dmkmart.com · Manjri Midc Road, Pune 412307 · 97654 32100</p>
        </div>
      )}
    </div>
  );
}
