"use client";

/**
 * StoreMapModule — main admin panel "Store Map" section (realtime).
 *
 * Every customer who dropped their store pin at signup (or whom the admin pins
 * later) shows as a marker here. Data refreshes automatically every 20 seconds
 * (poll — the honest "realtime" for a serverless deployment), with a LIVE chip
 * showing the last refresh. Admins can drop/fix a pin for any customer that is
 * missing one without leaving the section.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as LType from "leaflet";
import { Loader2, MapPin, RefreshCw, Search, Store, X } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader } from "./ui-bits";
import { formatINR } from "@/lib/store";
import StoreLocationPicker, { type PickedLocation } from "@/components/store-map/store-location-picker";

interface MarkerRow {
  id: string; name: string; shopName: string; phone: string;
  city: string; pincode: string; customerType: string; tier: string;
  status: string; orders: number; totalSpent: number;
  lat: number | null; lng: number | null; geoSource: string; geoUpdatedAt: string | null;
  createdAt: string;
}
interface Stats { total: number; pinned: number; unpinned: number; approved: number; pending: number }

const POLL_MS = 20_000;
const HOME_CENTER: [number, number] = [19.6231, 74.6633]; // Shrirampur, MH

const TYPE_SHORT: Record<string, string> = {
  RETAILER: "Retailer", WHOLESALE: "Wholesale", SEMI_WHOLESALE: "Semi-Wsl", DISTRIBUTOR: "Distributor",
};

function pinIcon(L: typeof LType, color: string) {
  return L.divIcon({
    html: `<div style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.4));transform:translate(-13px,-36px)">
      <svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg">
        <path d="M13 0C5.8 0 0 5.8 0 13c0 8.8 10.5 20.8 13 20.8S26 21.8 26 13C26 5.8 20.2 0 13 0z" fill="${color}" stroke="#111" stroke-width="1.6"/>
        <circle cx="13" cy="12.6" r="4.6" fill="#111"/>
      </svg></div>`,
    className: "",
    iconSize: [26, 36],
    iconAnchor: [0, 0],
  });
}

const STATUS_COLOR: Record<string, string> = { APPROVED: "#16a34a", PENDING: "#f59e0b", SUSPENDED: "#dc2626", REJECTED: "#9ca3af" };

export function StoreMapModule({ token }: { token: string }) {
  const call = useMemo(() => api(token), [token]);
  const [rows, setRows] = useState<MarkerRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);
  const [secsAgo, setSecsAgo] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "APPROVED" | "PENDING" | "SUSPENDED">("ALL");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<MarkerRow | null>(null);
  const [pendingLoc, setPendingLoc] = useState<PickedLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const LRef = useRef<typeof LType | null>(null);
  const layerRef = useRef<LType.LayerGroup | null>(null);
  const markerById = useRef<Map<string, LType.Marker>>(new Map());
  const rowsRef = useRef<MarkerRow[]>([]);
  rowsRef.current = rows;
  // poll-safe view: remember what the admin is looking at so the 20s realtime
  // refresh never yanks the map (no re-fit, no marker churn, popup stays open)
  const selectedIdRef = useRef<string | null>(null);
  const fittedRef = useRef(false);
  const filterKeyRef = useRef<string>("\u0000init\u0000");
  const sigRef = useRef<string>("");

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const d = await call("/api/admin/customers/locations");
      setRows(d.rows || []);
      setStats(d.stats || null);
      setSecsAgo(0);
    } catch (e) {
      if (initial) toast.error(e instanceof Error ? e.message : "Failed to load map data");
    } finally {
      if (initial) setLoading(false);
    }
  }, [call]);

  useEffect(() => { load(true); }, [load]);

  // realtime: poll while the tab is visible
  useEffect(() => {
    const tick = setInterval(() => {
      if (document.visibilityState === "visible" && live) load();
    }, POLL_MS);
    const sec = setInterval(() => setSecsAgo((s) => s + 1), 1000);
    return () => { clearInterval(tick); clearInterval(sec); };
  }, [load, live]);

  // init leaflet once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !holder.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(holder.current, { scrollWheelZoom: true }).setView(HOME_CENTER, 11);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);
      // popup action buttons (rendered as raw HTML inside leaflet popups)
      map.on("popupopen", (e: LType.PopupEvent) => {
        const root = e.popup.getElement();
        const custId = root?.querySelector<HTMLElement>("[data-cust-id]")?.dataset.custId;
        if (!custId) return;
        selectedIdRef.current = custId;
        root?.querySelector<HTMLElement>("[data-act='edit']")?.addEventListener("click", () => {
          const row = rowsRef.current.find((r) => r.id === custId);
          if (row) openEdit(row);
        });
        root?.querySelector<HTMLElement>("[data-act='wa']")?.addEventListener("click", () => {
          const row = rowsRef.current.find((r) => r.id === custId);
          if (row) window.open(`https://wa.me/91${row.phone}`, "_blank");
        });
      });
    })();
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = useCallback(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.shopName, r.name, r.phone, r.city, r.pincode].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [rows, statusFilter, query]);

  const popupHtml = (r: MarkerRow) => `
    <div data-cust-id="${r.id}" style="font-family:inherit;min-width:230px">
      <div style="font-weight:900;font-size:13.5px;margin-bottom:2px">${escapeHtml(r.shopName || r.name)}</div>
      <div style="font-size:11px;color:#555;margin-bottom:4px">${escapeHtml(r.name)} · <a href="tel:+91${escapeHtml(r.phone)}" style="color:#111;font-weight:800;text-decoration:none">${escapeHtml(r.phone)}</a></div>
      <div style="font-size:11px;color:#555;margin-bottom:6px">${escapeHtml([r.city, r.pincode].filter(Boolean).join(" - ") || "—")} · ${TYPE_SHORT[r.customerType] || r.customerType} · ${escapeHtml((r.tier || "tier4").toUpperCase())}</div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
        <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;background:${STATUS_COLOR[r.status] || "#888"}22;color:${STATUS_COLOR[r.status] || "#555"}">${r.status}</span>
        <span style="font-size:10px;color:#777">${r.orders} ord · ${formatINR(r.totalSpent)} spend</span>
      </div>
      <div style="font-size:9.5px;color:#999;margin-bottom:8px">Pin: ${escapeHtml(r.geoSource || "—")} · customer since ${new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
      <div style="display:flex;gap:6px">
        <button data-act="edit" style="flex:1;font-size:11px;font-weight:800;padding:5px 8px;border-radius:8px;background:#111;color:#facc15;border:0;cursor:pointer">📍 Move pin</button>
        <a href="tel:+91${escapeHtml(r.phone)}" style="flex:1;text-align:center;font-size:11px;font-weight:800;padding:5px 8px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none">Call</a>
        <button data-act="wa" style="flex:1;font-size:11px;font-weight:800;padding:5px 8px;border-radius:8px;background:#16a34a;color:#fff;border:0;cursor:pointer">WhatsApp</button>
      </div>
    </div>`;

  // hover tooltip — quick-glance identity before committing to a full popup
  const tooltipHtml = (r: MarkerRow) => `
    <div style="font-family:inherit;white-space:nowrap">
      <span style="font-weight:800;font-size:11px">${escapeHtml(r.shopName || r.name)}</span>
      <span style="font-size:10px;color:#666"> · ${escapeHtml(r.city || TYPE_SHORT[r.customerType] || r.customerType)}</span>
    </div>`;

  // paint markers — poll-safe: repaint ONLY when pin data/filters actually
  // changed, keep the admin's zoom/pan between realtime refreshes, re-open the
  // popup they had open. First paint (or an explicit filter change) fits all
  // pins so the full network of stores is visible right at the start.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer || !mapReady) return;
    const filtered = filteredRows();
    const pts = filtered.filter((r) => r.lat != null && r.lng != null);
    const sig =
      pts.map((r) => `${r.id}:${r.lat!.toFixed(5)},${r.lng!.toFixed(5)}:${r.status}:${r.orders}`).join("|") +
      `#${filtered.length}#${statusFilter}#${query}`;
    if (sig === sigRef.current) return; // identical realtime poll — leave the view alone
    const filterChanged = `${statusFilter}|${query}` !== filterKeyRef.current;
    filterKeyRef.current = `${statusFilter}|${query}`;
    sigRef.current = sig;
    const prevSelected = selectedIdRef.current;
    layer.clearLayers();
    markerById.current.clear();
    for (const r of filtered) {
      if (r.lat == null || r.lng == null) continue;
      const color = STATUS_COLOR[r.status] || "#2563eb";
      const m = L.marker([r.lat, r.lng], { icon: pinIcon(L, color) }).addTo(layer);
      m.bindTooltip(tooltipHtml(r), { direction: "top", offset: [0, -42], opacity: 0.95 });
      m.bindPopup(popupHtml(r), { maxWidth: 280 });
      markerById.current.set(r.id, m);
    }
    const coords = pts.map((r) => [r.lat!, r.lng!] as [number, number]);
    if (coords.length && (!fittedRef.current || filterChanged)) {
      fittedRef.current = true;
      map.fitBounds(L.latLngBounds(coords).pad(0.18), { maxZoom: 13 });
    }
    if (prevSelected) markerById.current.get(prevSelected)?.openPopup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, statusFilter, query, mapReady]);


  const focusCustomer = (r: MarkerRow) => {
    if (r.lat != null && r.lng != null) {
      mapRef.current?.setView([r.lat, r.lng], 16);
      markerById.current.get(r.id)?.openPopup();
    } else {
      openEdit(r);
    }
    if (window.innerWidth < 1024) document.getElementById("storemap-list")?.scrollIntoView({ behavior: "smooth" });
  };

  const openEdit = (r: MarkerRow) => {
    setEditing(r);
    setPendingLoc(r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng, source: "MAP" } : null);
  };

  const savePin = async () => {
    if (!editing || !pendingLoc) return;
    setSaving(true);
    try {
      await call("/api/admin/customers/locations", {
        method: "PUT",
        body: JSON.stringify({ id: editing.id, lat: pendingLoc.lat, lng: pendingLoc.lng }),
      });
      toast.success(`Store pin saved for ${editing.shopName || editing.name}`);
      setEditing(null);
      setPendingLoc(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save location");
    } finally {
      setSaving(false);
    }
  };

  const clearPin = async (r: MarkerRow) => {
    try {
      await call("/api/admin/customers/locations", { method: "PUT", body: JSON.stringify({ id: r.id, clear: true }) });
      toast.success("Pin removed");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove pin");
    }
  };

  const pinnedList = filteredRows().filter((r) => r.lat != null);
  const unpinnedList = filteredRows().filter((r) => r.lat == null);


  return (
    <div>
      <ModuleHeader title="Store Map" sub="Every customer store on one live map — pins captured at signup, refreshed in realtime">
        <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black ${live ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-emerald-500" : "bg-gray-400"}`} />
          {live ? `LIVE · ${secsAgo}s ago` : "PAUSED"}
        </span>
        <button onClick={() => setLive((v) => !v)} className="rounded-lg border bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-700 hover:bg-gray-50">
          {live ? "Pause" : "Resume"}
        </button>
        <button onClick={() => load(true)} className="flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-700 hover:bg-gray-50">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </ModuleHeader>

      {/* stats */}
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Customers", String(stats?.total ?? "—"), "text-gray-900"],
          ["Pinned on map", String(stats?.pinned ?? "—"), "text-emerald-700"],
          ["Waiting for pin", String(stats?.unpinned ?? "—"), "text-orange-600"],
          ["Approved", String(stats?.approved ?? "—"), "text-gray-900"],
          ["Pending approval", String(stats?.pending ?? "—"), "text-orange-600"],
        ].map(([label, value, cls]) => (
          <div key={label} className="rounded-xl border bg-white p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
            <p className={`mt-0.5 text-lg font-black ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["ALL", "APPROVED", "PENDING", "SUSPENDED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${statusFilter === s ? "bg-black text-yellow-400" : "border bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shop, phone, city, pincode…"
            className="h-9 w-full rounded-lg border border-gray-200 pl-8 pr-2 text-xs outline-none focus:border-yellow-500"
          />
        </div>
      </div>

      {/* map + list */}
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-xl border bg-white">
          {/* map is always mounted — tiles render the instant the section opens;
              pins paint as soon as the first realtime fetch lands */}
          <div className="relative">
            <div ref={holder} id="storemap-map" style={{ height: 480 }} className="w-full" role="application" aria-label="Customer store map" />
            {loading && (
              <div className="absolute inset-0 z-[900] flex items-center justify-center gap-2 bg-white/75 text-xs font-bold text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading store pins…
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t bg-gray-50 px-3 py-2">
            <p className="text-[10.5px] font-semibold text-gray-500">
              🟢 Approved · 🟠 Pending · 🔴 Suspended — {pinnedList.length} stores on map
            </p>
            <p className="text-[10px] text-gray-400">Hover a pin for a quick look — click for full store details</p>
          </div>
        </div>

        <div id="storemap-list" className="max-h-[520px] overflow-y-auto rounded-xl border bg-white">
          <p className="sticky top-0 z-10 border-b bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
            Stores ({filteredRows().length})
          </p>
          {filteredRows().map((r) => (
            <button
              key={r.id}
              onClick={() => focusCustomer(r)}
              className={`flex w-full items-center gap-2.5 border-b px-3 py-2.5 text-left transition hover:bg-yellow-50 ${r.lat == null ? "opacity-70" : ""}`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px]" style={{ background: `${STATUS_COLOR[r.status] || "#888"}22`, color: STATUS_COLOR[r.status] || "#555" }}>
                {r.lat != null ? <MapPin className="h-3.5 w-3.5" /> : <Store className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-gray-900">{r.shopName || r.name}</span>
                <span className="block truncate text-[10px] text-gray-400">{r.city || "—"} · {TYPE_SHORT[r.customerType] || r.customerType}{r.lat == null ? " · pin missing" : ""}</span>
              </span>
            </button>
          ))}
          {filteredRows().length === 0 && !loading && (
            <p className="px-3 py-8 text-center text-xs text-gray-400">No customers match.</p>
          )}
        </div>
      </div>

      {/* waiting for pin */}
      {unpinnedList.length > 0 && (
        <div className="mt-4 rounded-xl border bg-white">
          <p className="border-b px-3 py-2.5 text-xs font-black text-gray-900">
            Waiting for store pin <span className="ml-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-600">{unpinnedList.length}</span>
          </p>
          <div className="max-h-56 overflow-y-auto">
            {unpinnedList.slice(0, 50).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 border-b px-3 py-2 last:border-b-0">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-gray-900">{r.shopName || r.name} <span className="font-normal text-gray-400">· {r.phone}</span></p>
                  <p className="truncate text-[10px] text-gray-400">{[r.city, r.pincode].filter(Boolean).join(" - ") || "no city on record"}</p>
                </div>
                <button onClick={() => openEdit(r)} className="shrink-0 rounded-lg bg-black px-3 py-1.5 text-[11px] font-bold text-yellow-400">
                  📍 Set location
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* set-location dialog */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !saving && setEditing(null)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-sm font-black text-gray-900">Store pin — {editing.shopName || editing.name}</h3>
                <p className="text-[11px] text-gray-500">{editing.phone} · {[editing.city, editing.pincode].filter(Boolean).join(" - ") || "no address"}</p>
              </div>
              <button onClick={() => setEditing(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <StoreLocationPicker
              lat={pendingLoc?.lat ?? null}
              lng={pendingLoc?.lng ?? null}
              onChange={(loc) => setPendingLoc(loc)}
              autoQuery={`${editing.pincode} ${editing.city}`.trim()}
              fitKey={1}
              compact
            />
            <div className="mt-3 flex items-center justify-between gap-2">
              {editing.lat != null ? (
                <button onClick={() => clearPin(editing)} className="rounded-lg border border-red-200 px-3 py-2 text-[11px] font-bold text-red-600 hover:bg-red-50">Remove pin</button>
              ) : <span />}
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)} className="rounded-lg border px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50">Cancel</button>
                <button
                  onClick={savePin}
                  disabled={!pendingLoc || saving}
                  className="flex items-center gap-1.5 rounded-lg bg-black px-4 py-2 text-xs font-black text-yellow-400 disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save pin
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}
