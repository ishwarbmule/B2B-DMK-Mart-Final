"use client";

/**
 * People & staff management modules for the Super Admin portal:
 *   SalesTeamModule        — salesperson accounts (login for /salesteam) + performance report
 *   WarehouseManagersModule — per-warehouse manager accounts (login for /warehouse) with
 *                             admin-chosen section permissions
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2, Loader2, Lock, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, UserPlus, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { api, CrudModule, ModuleHeader, StatCard } from "./ui-bits";
import { CONFIGS } from "./crud-configs";
import { MANAGER_SECTIONS } from "@/lib/manager-sections";
import { formatINR } from "@/lib/store";

/* ══════════════ SALESPERSON MANAGEMENT ══════════════ */

type SalesReportRow = {
  name: string; portalReady: boolean; area: string; mobile: string; active: boolean;
  orders: number; revenue: number; orders30d: number; revenue30d: number;
  lastOrderAt: string | null; lastInvoice: string;
};

export function SalesTeamModule({ token }: { token: string }) {
  const call = useMemo(() => api(token), [token]);
  const [report, setReport] = useState<SalesReportRow[] | null>(null);
  const [totalRevenue, setTotalRevenue] = useState(0);

  const loadReport = useCallback(() => {
    call("/api/admin/sales-report")
      .then((d) => { setReport(d.rows ?? []); setTotalRevenue(d.totalRevenue ?? 0); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Report failed"));
  }, [call]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const cfg = CONFIGS.salespersons;

  return (
    <div>
      <ModuleHeader title="Salesperson Management" sub="Field team accounts, /salesteam portal logins and who brings orders to the business">
        <button onClick={loadReport} className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50">
          <RefreshCw className={`h-3.5 w-3.5 ${report === null ? "animate-spin" : ""}`} /> Refresh report
        </button>
      </ModuleHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} label="Salespeople" value={report?.length ?? "—"} sub="team members configured" color="#111111" />
        <StatCard icon={ShieldCheck} label="Portal logins ready" value={report?.filter((r) => r.portalReady).length ?? "—"} sub="username + password set" color="#059669" />
        <StatCard icon={Building2} label="Orders via team" value={report?.reduce((s, r) => s + r.orders, 0) ?? "—"} sub="all time (source: Sales Team)" color="#1d4ed8" />
        <StatCard icon={Lock} label="Revenue brought" value={report ? formatINR(totalRevenue) : "—"} sub="all time by the field team" color="#b45309" />
      </div>

      {/* performance report — which salesperson brings orders */}
      <div className="mb-6 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2.5 font-bold">Salesperson</th>
              <th className="px-3 py-2.5 font-bold">Area</th>
              <th className="px-3 py-2.5 text-right font-bold">Orders</th>
              <th className="px-3 py-2.5 text-right font-bold">Revenue</th>
              <th className="px-3 py-2.5 text-right font-bold">30d Orders</th>
              <th className="px-3 py-2.5 text-right font-bold">30d Revenue</th>
              <th className="px-3 py-2.5 font-bold">Last Order</th>
              <th className="px-3 py-2.5 font-bold">Portal</th>
            </tr>
          </thead>
          <tbody>
            {report === null ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            ) : report.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-400">No orders flow through a salesperson yet — add salespeople below.</td></tr>
            ) : (
              report.map((r) => (
                <tr key={r.name} className="border-b last:border-0 hover:bg-yellow-50/40">
                  <td className="px-3 py-2.5">
                    <span className="font-semibold text-gray-900">{r.name}</span>
                    {!r.active && <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-gray-500">INACTIVE</span>}
                    <p className="text-[10px] text-gray-400">{r.mobile}</p>
                  </td>
                  <td className="px-3 py-2.5">{r.area || "—"}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums">{r.orders}</td>
                  <td className="px-3 py-2.5 text-right font-black tabular-nums">{formatINR(r.revenue)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.orders30d}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(r.revenue30d)}</td>
                  <td className="px-3 py-2.5">{r.lastOrderAt ? <span title={r.lastInvoice}>{new Date(r.lastOrderAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span> : "—"}</td>
                  <td className="px-3 py-2.5">
                    {r.portalReady
                      ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Login ready</span>
                      : <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-600">No login yet</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* CRUD — accounts with username / password / area of working */}
      <CrudModule
        key="salespersons"
        entity="salespersons"
        title={cfg.title}
        sub={cfg.sub}
        nameField={cfg.nameField}
        fields={cfg.fields}
        columns={cfg.columns}
        token={token}
      />
    </div>
  );
}

/* ══════════════ WAREHOUSE MANAGER MANAGEMENT ══════════════ */

type ManagerRow = {
  id: string; name: string; username: string; password?: string; phone: string; email: string;
  warehouseId: string; permissions: string; active: boolean;
  warehouse: { id: string; name: string; city: string } | null;
};
type WarehouseOpt = { id: string; name: string; city: string };

function parsePerms(raw: string): string[] {
  try { return JSON.parse(raw || "[]") as string[]; } catch { return []; }
}

export function WarehouseManagersModule({ token }: { token: string }) {
  const call = useMemo(() => api(token), [token]);
  const [managers, setManagers] = useState<ManagerRow[] | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseOpt[]>([]);
  const [editing, setEditing] = useState<Partial<ManagerRow> | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    call("/api/admin/managers")
      .then((d) => { setManagers(d.rows ?? []); setWarehouses(d.warehouses ?? []); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Load failed"));
  }, [call]);

  useEffect(() => { load(); }, [load]);

  const openAdd = (warehouseId?: string) => {
    setEditing({ name: "", username: "", password: "", phone: "", email: "", warehouseId: warehouseId ?? warehouses[0]?.id ?? "", active: true });
    setPerms(["dashboard", "orders", "warehouseStock"]);
  };
  const openEdit = (m: ManagerRow) => {
    setEditing(m);
    setPerms(parsePerms(m.permissions));
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const payload = { ...editing, permissions: perms };
      if (editing.id) {
        await call("/api/admin/managers", { method: "PATCH", body: JSON.stringify(payload) });
        toast.success("Manager updated");
      } else {
        await call("/api/admin/managers", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Manager account created — share the credentials for /warehouse");
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m: ManagerRow) => {
    if (!confirm(`Delete manager "${m.name}" (${m.username})? Their /warehouse login stops working immediately.`)) return;
    try {
      await call(`/api/admin/managers?id=${m.id}`, { method: "DELETE" });
      toast.success("Manager deleted");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const togglePerm = (id: string) => setPerms((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const input = "h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400";

  return (
    <div>
      <ModuleHeader title="Warehouse Managers" sub="One login per godown at /warehouse — admin decides which admin sections each manager can open">
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50">
          <RefreshCw className={`h-3.5 w-3.5 ${managers === null ? "animate-spin" : ""}`} /> Refresh
        </button>
        <button onClick={() => openAdd()} disabled={warehouses.length === 0} className="flex items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-xs font-bold text-yellow-400 hover:bg-gray-800 disabled:opacity-50">
          <UserPlus className="h-4 w-4" /> Add Manager
        </button>
      </ModuleHeader>

      {warehouses.length === 0 && (
        <p className="mb-4 rounded-xl border border-dashed p-4 text-center text-xs text-gray-500">
          Create a warehouse first (Inventory &amp; Warehouses → Warehouses) — every manager belongs to one godown.
        </p>
      )}

      {/* grouped by warehouse — every warehouse shows its manager (or a create CTA) */}
      <div className="grid gap-3 lg:grid-cols-2">
        {managers === null ? (
          <div className="rounded-xl border bg-white p-10 text-center text-gray-400 lg:col-span-2"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
        ) : (
          warehouses.map((w) => {
            const whManagers = managers.filter((m) => m.warehouseId === w.id);
            return (
              <div key={w.id} className="rounded-xl border bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-black text-gray-900">{w.name}{w.city ? <span className="ml-1 text-[10px] font-semibold text-gray-400">· {w.city}</span> : null}</p>
                    <p className="text-[10px] text-gray-400">{whManagers.length} manager{whManagers.length !== 1 ? "s" : ""}</p>
                  </div>
                  <button onClick={() => openAdd(w.id)} className="flex items-center gap-1 rounded-lg bg-yellow-400 px-2.5 py-1.5 text-[10px] font-black text-black hover:bg-yellow-300">
                    <Plus className="h-3 w-3" /> Manager
                  </button>
                </div>
                {whManagers.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-gray-200 p-3 text-center text-[11px] text-gray-400">
                    No manager yet — create one to open the /warehouse portal for this godown.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {whManagers.map((m) => (
                      <div key={m.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-gray-900">{m.name} <span className="ml-1 font-mono text-[10px] font-normal text-gray-400">{m.username}</span></p>
                          <p className="text-[10px] text-gray-500">{parsePerms(m.permissions).length} sections · {m.active
                            ? <span className="font-bold text-emerald-600">active</span>
                            : <span className="font-bold text-red-500">disabled</span>}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button onClick={() => openEdit(m)} className="rounded-md bg-blue-50 p-1.5 text-blue-600 hover:bg-blue-100" aria-label="Edit manager"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => remove(m)} className="rounded-md bg-red-50 p-1.5 text-red-600 hover:bg-red-100" aria-label="Delete manager"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
        {managers !== null && warehouses.length === 0 && managers.length > 0 && (
          <p className="text-xs text-gray-400 lg:col-span-2">{managers.length} manager(s) exist for warehouses that are now inactive.</p>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-black">{editing.id ? "Edit Warehouse Manager" : "New Warehouse Manager"}</h3>
              <button onClick={() => setEditing(null)} aria-label="Close"><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-700">Full Name *</label>
                <input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={input} placeholder="e.g. Ramesh Kulkarni" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">Username (login) *</label>
                  <input value={editing.username ?? ""} onChange={(e) => setEditing({ ...editing, username: e.target.value })} className={input} placeholder="e.g. pune-manager" disabled={Boolean(editing.id) && false} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">{editing.id ? "New Password (blank = keep)" : "Password *"}</label>
                  <input value={editing.password ?? ""} onChange={(e) => setEditing({ ...editing, password: e.target.value })} className={input} placeholder="min 4 characters" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">Phone</label>
                  <input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} className={input} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Email</label>
                  <input value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className={input} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Warehouse *</label>
                <select value={editing.warehouseId ?? ""} onChange={(e) => setEditing({ ...editing, warehouseId: e.target.value })} className={input}>
                  <option value="">Select…</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}{w.city ? ` — ${w.city}` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700">Admin sections this manager can open *</label>
                <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-gray-200 p-3">
                  {MANAGER_SECTIONS.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-yellow-50">
                      <input type="checkbox" checked={perms.includes(s.id)} onChange={() => togglePerm(s.id)} className="h-3.5 w-3.5 accent-yellow-500" />
                      <span className="font-semibold text-gray-800">{s.label}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-gray-400">Unticked sections stay hidden in the manager&apos;s /warehouse portal — they behave exactly like the admin sections.</p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700">
                <input type="checkbox" checked={editing.active ?? true} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} className="h-3.5 w-3.5 accent-yellow-500" />
                Account active (can log in)
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border px-4 py-2 text-xs font-semibold">Cancel</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-black px-4 py-2 text-xs font-bold text-yellow-400 disabled:opacity-50">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {editing.id ? "Save Changes" : "Create Manager"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
