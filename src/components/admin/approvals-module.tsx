"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, MessageCircle, RefreshCcw, UserCheck, UserX, Wallet, Phone, MapPin, Building2 } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader } from "./ui-bits";

type PendingCustomer = {
  id: string; name: string; shopName: string; phone: string; email: string; gstin: string;
  address: string; city: string; pincode: string; customerType: string; createdAt: string;
  orders: number; totalSpent: number; waText: string;
};

const TYPE_OPTIONS = [
  { key: "RETAILER", label: "Retailer" },
  { key: "SEMI_WHOLESALE", label: "Semi-Wholesaler" },
  { key: "WHOLESALE", label: "Wholesaler" },
  { key: "DISTRIBUTOR", label: "Distributor" },
];
const TIER_BY_TYPE: Record<string, string> = { RETAILER: "tier4", SEMI_WHOLESALE: "tier3", WHOLESALE: "tier2", DISTRIBUTOR: "tier1" };

export function ApprovalsModule({ token }: { token: string }) {
  const call = api(token);
  const [rows, setRows] = useState<PendingCustomer[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, { type: string; tier: string }>>({});
  const [waFor, setWaFor] = useState<{ name: string; phone: string; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await call("/api/admin/customers/approve");
      setRows(d.rows ?? []);
      setCounts(d.counts ?? {});
      setChoice(Object.fromEntries((d.rows ?? []).map((r: PendingCustomer) => [r.id, { type: r.customerType, tier: TIER_BY_TYPE[r.customerType] ?? "tier4" }])));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load approvals");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const act = async (c: PendingCustomer, action: "APPROVE" | "REJECT") => {
    setBusy(c.id + action);
    try {
      const ch = choice[c.id] ?? { type: c.customerType, tier: TIER_BY_TYPE[c.customerType] ?? "tier4" };
      const d = await call("/api/admin/customers/approve", {
        method: "POST",
        body: JSON.stringify({ id: c.id, action, tier: ch.tier, customerType: ch.type }),
      });
      if (action === "APPROVE") {
        toast.success(`${c.name} approved as ${TYPE_OPTIONS.find((t) => t.key === ch.type)?.label ?? ch.type} @ ${ch.tier}`);
        setWaFor({ name: c.name, phone: c.phone, text: d.waText ?? "" });
      } else {
        toast.success(`${c.name} rejected (suspended)`);
      }
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally { setBusy(null); }
  };

  return (
    <div>
      <ModuleHeader title="Buyer Account Approvals" sub={`${counts.PENDING ?? 0} awaiting approval · ${counts.APPROVED ?? 0} approved · ${counts.SUSPENDED ?? 0} suspended/rejected`}>
        <button onClick={load} className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-gray-50">
          <RefreshCcw className="h-3.5 w-3.5" /> Refresh
        </button>
      </ModuleHeader>

      {loading && <div className="rounded-xl border bg-white p-10 text-center text-sm text-gray-400">Loading pending accounts…</div>}

      {!loading && rows.length === 0 && (
        <div className="rounded-xl border bg-white p-10 text-center">
          <BadgeCheck className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="mt-2 text-sm font-bold text-gray-700">No pending buyer accounts</p>
          <p className="text-xs text-gray-400">New signups appear here — they cannot log in until you approve them.</p>
        </div>
      )}

      <div className="space-y-3">
        {rows.map((c) => {
          const ch = choice[c.id] ?? { type: c.customerType, tier: TIER_BY_TYPE[c.customerType] ?? "tier4" };
          return (
            <div key={c.id} className="rounded-xl border bg-white p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-[220px] flex-1">
                  <p className="text-sm font-black text-gray-900">{c.shopName || c.name}</p>
                  <p className="text-xs text-gray-500">{c.name} · <Phone className="inline h-3 w-3" /> {c.phone}{c.email ? ` · ${c.email}` : ""}</p>
                  <p className="mt-1 flex items-start gap-1 text-[11px] text-gray-500">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {[c.address, c.city, c.pincode].filter(Boolean).join(", ") || "—"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                    {c.gstin && <span className="rounded bg-gray-100 px-1.5 py-0.5 font-semibold">GSTIN {c.gstin}</span>}
                    <span className="rounded bg-gray-100 px-1.5 py-0.5">Applied {new Date(c.createdAt).toLocaleDateString("en-IN")}</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5">Self-declared: {TYPE_OPTIONS.find((t) => t.key === c.customerType)?.label ?? c.customerType}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500">Account type (buyer sees no pricing until you decide)</label>
                    <select
                      value={ch.type}
                      onChange={(e) => setChoice((m) => ({ ...m, [c.id]: { type: e.target.value, tier: TIER_BY_TYPE[e.target.value] ?? "tier4" } }))}
                      className="h-8 rounded-lg border px-2 text-xs font-semibold"
                    >
                      {TYPE_OPTIONS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500">Price tier</label>
                    <select
                      value={ch.tier}
                      onChange={(e) => setChoice((m) => ({ ...m, [c.id]: { ...m[c.id], tier: e.target.value } }))}
                      className="h-8 rounded-lg border px-2 text-xs font-semibold"
                    >
                      <option value="tier1">Tier 1 (Distributor rates)</option>
                      <option value="tier2">Tier 2 (Wholesale rates)</option>
                      <option value="tier3">Tier 3 (Semi-wholesale)</option>
                      <option value="tier4">Tier 4 (Retail)</option>
                    </select>
                  </div>
                  <button
                    onClick={() => act(c, "APPROVE")}
                    disabled={busy === c.id + "APPROVE"}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <UserCheck className="h-4 w-4" /> {busy === c.id + "APPROVE" ? "…" : "Approve"}
                  </button>
                  <button
                    onClick={() => act(c, "REJECT")}
                    disabled={busy === c.id + "REJECT"}
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
                  >
                    <UserX className="h-4 w-4" /> Reject
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* WhatsApp approval message dialog */}
      {waFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setWaFor(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="flex items-center gap-2 text-sm font-black text-gray-900">
              <MessageCircle className="h-4 w-4 text-emerald-600" /> Account approved — send the welcome message
            </p>
            <p className="mt-1 text-[11px] text-gray-500">Pre-filled for {waFor.name} ({waFor.phone}) — edit if needed, then open WhatsApp and press send.</p>
            <textarea
              value={waFor.text}
              onChange={(e) => setWaFor({ ...waFor, text: e.target.value })}
              rows={12}
              className="mt-2 w-full rounded-lg border p-3 text-xs leading-relaxed outline-none focus:border-emerald-400"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button onClick={() => setWaFor(null)} className="rounded-lg border px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50">Close</button>
              <a
                href={`https://wa.me/91${waFor.phone}?text=${encodeURIComponent(waFor.text)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-[#25D366] px-4 py-2 text-xs font-bold text-white hover:bg-[#1fb958]"
              >
                <MessageCircle className="h-4 w-4" /> Open WhatsApp & Send
              </a>
            </div>
          </div>
        </div>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-400">
        <Wallet className="h-3.5 w-3.5" /> Approved buyers get tier pricing automatically; credit limits are set by account type. Rejected accounts are suspended (cannot log in).
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-400">
        <Building2 className="h-3.5 w-3.5" /> Tip: use Customer Management for edits after approval.
      </p>
    </div>
  );
}
