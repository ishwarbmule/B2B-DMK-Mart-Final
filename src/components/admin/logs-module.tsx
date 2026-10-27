"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader } from "./ui-bits";

export function LogsModule({ token }: { token: string }) {
  const call = useMemo(() => api(token), [token]);
  const [rows, setRows] = useState<{ id: string; action: string; entity: string; detail: string; user: string; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = () => {
    call("/api/admin/logs?limit=120").then((d) => setRows(d.rows)).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => {
    fetchLogs();
     
  }, [call]);
  const load = () => { setLoading(true); fetchLogs(); };

  const color = (a: string) =>
    a === "CREATE" ? "bg-emerald-50 text-emerald-700"
    : a === "DELETE" ? "bg-red-50 text-red-600"
    : a === "UPDATE" ? "bg-blue-50 text-blue-600"
    : "bg-gray-100 text-gray-600";

  return (
    <div>
      <ModuleHeader title="Activity Logs" sub="Every admin mutation is recorded for audit">
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-semibold">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </ModuleHeader>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-xl border bg-white px-3 py-2.5 text-xs">
            <span className={`w-16 shrink-0 rounded-md px-1.5 py-1 text-center text-[10px] font-black ${color(r.action)}`}>{r.action}</span>
            <span className="w-20 shrink-0 font-semibold uppercase text-gray-400">{r.entity}</span>
            <span className="min-w-0 flex-1 truncate text-gray-700">{r.detail}</span>
            <span className="hidden shrink-0 text-[10px] text-gray-400 md:block">{r.user}</span>
            <span className="shrink-0 text-[10px] text-gray-400">{new Date(r.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        ))}
        {loading && <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-300" /></div>}
        {!loading && !rows.length && <p className="rounded-xl border border-dashed py-10 text-center text-sm text-gray-400">No activity recorded yet.</p>}
      </div>
    </div>
  );
}
