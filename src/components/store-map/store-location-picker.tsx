"use client";

/**
 * StoreLocationPicker — OpenStreetMap (Leaflet) pin picker used at signup
 * ("set your store location on map") and in the admin Store Map section.
 *
 * - click anywhere on the map to drop/move the store pin
 * - "use my location" via browser GPS (geoSource = GPS)
 * - free-text search (city / pincode / landmark) via /api/geocode (Nominatim proxy)
 * - optional auto-locate from typed city+pincode when the picker mounts empty
 *
 * Pure leaflet, loaded dynamically client-side; pin is a divIcon so no image
 * assets are needed. Emits { lat, lng, source } through onChange.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as LType from "leaflet";

export interface PickedLocation { lat: number; lng: number; source: "MAP" | "GPS" }

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (loc: PickedLocation) => void;
  /** map center before a pin exists (default: Shrirampur, MH — the home market) */
  initialCenter?: [number, number];
  initialZoom?: number;
  /** bump to re-run invalidateSize + recenter (dialog open, tab switch) */
  fitKey?: number;
  /** "pincode city" string — geocoded once on mount when no pin exists yet */
  autoQuery?: string;
  compact?: boolean;
  disabled?: boolean;
}

const PIN_SVG = `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg"><path d="M15 0C6.7 0 0 6.7 0 15c0 10.2 12.1 24 15 24s15-13.8 15-24C30 6.7 23.3 0 15 0z" fill="#0a0a0a" stroke="#facc15" stroke-width="2.5"/><circle cx="15" cy="14.5" r="5.5" fill="#facc15"/></svg>`;

const DEFAULT_CENTER: [number, number] = [19.6231, 74.6633]; // Shrirampur, Maharashtra

export default function StoreLocationPicker({
  lat,
  lng,
  onChange,
  initialCenter,
  initialZoom = 13,
  fitKey = 0,
  autoQuery,
  compact = false,
  disabled = false,
}: Props) {
  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LType.Map | null>(null);
  const leafletRef = useRef<typeof LType | null>(null);
  const markerRef = useRef<LType.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const didAuto = useRef(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ label: string; lat: number; lng: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [note, setNote] = useState("");

  onChangeRef.current = onChange;

  const setPin = useCallback((pLat: number, pLng: number, source: "MAP" | "GPS", fly = true) => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (!markerRef.current) {
      const icon = L.divIcon({
        html: `<div style="filter:drop-shadow(0 3px 4px rgba(0,0,0,.45));transform:translate(-15px,-40px)">${PIN_SVG}</div>`,
        className: "",
        iconSize: [30, 42],
        iconAnchor: [0, 0],
      });
      markerRef.current = L.marker([pLat, pLng], { icon, draggable: !disabled }).addTo(map);
      markerRef.current.on("dragend", () => {
        const pos = markerRef.current!.getLatLng();
        onChangeRef.current({ lat: pos.lat, lng: pos.lng, source: "MAP" });
      });
    } else {
      markerRef.current.setLatLng([pLat, pLng]);
    }
    if (fly) map.setView([pLat, pLng], Math.max(map.getZoom(), 15));
    onChangeRef.current({ lat: pLat, lng: pLng, source });
  }, [disabled]);

  // init map once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !holder.current || mapRef.current) return;
      leafletRef.current = L;
      const center = (lat != null && lng != null ? [lat, lng] : (initialCenter ?? DEFAULT_CENTER)) as [number, number];
      const map = L.map(holder.current, { zoomControl: true, scrollWheelZoom: true }).setView(center, lat != null ? 15 : initialZoom);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      map.on("click", (e: LType.LeafletMouseEvent) => {
        if (!disabled) setPin(e.latlng.lat, e.latlng.lng, "MAP", false);
      });
      mapRef.current = map;
      if (lat != null && lng != null) setPin(lat, lng, "MAP", false);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // dialogs/tabs: invalidate size + recenter
  useEffect(() => {
    if (!fitKey || !mapRef.current) return;
    const t = setTimeout(() => {
      mapRef.current?.invalidateSize();
      if (lat != null && lng != null) mapRef.current?.setView([lat, lng], Math.max(mapRef.current!.getZoom(), 14));
      else mapRef.current?.setView(initialCenter ?? DEFAULT_CENTER, initialZoom);
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // auto-locate from typed city+pincode (signup UX) — only when no pin yet
  useEffect(() => {
    if (didAuto.current || lat != null || !autoQuery || autoQuery.trim().length < 4) return;
    didAuto.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(autoQuery.trim())}`);
        const d = await res.json();
        const first = d.results?.[0];
        if (first && mapRef.current) {
          mapRef.current.setView([first.lat, first.lng], 13);
          setNote("Map moved near your area — tap the exact shop spot.");
        }
      } catch { /* silent */ }
    })();
  }, [autoQuery, lat]);

  const search = useCallback(async () => {
    const term = q.trim();
    if (term.length < 3) return;
    setSearching(true);
    setHits([]);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(term)}`);
      const d = await res.json();
      setHits(d.results || []);
      if (!d.results?.length) setNote("No match found — try pincode + city, or just tap the map.");
    } catch {
      setNote("Search failed — check connection, or tap the map directly.");
    } finally {
      setSearching(false);
    }
  }, [q]);

  const useGps = useCallback(() => {
    if (!navigator.geolocation) { setNote("GPS not available on this device — tap the map instead."); return; }
    setGpsBusy(true);
    setNote("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsBusy(false);
        setPin(pos.coords.latitude, pos.coords.longitude, "GPS");
        setNote("GPS location captured — drag the pin if it needs fine-tuning.");
      },
      () => {
        setGpsBusy(false);
        setNote("Location permission denied — search your area or tap the map.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }, [setPin]);

  const hasPin = lat != null && lng != null;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* search row */}
      <div className="flex items-center gap-1.5 border-b bg-gray-50 p-2">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setNote(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }}
          placeholder="Search pincode / city / landmark…"
          className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 text-[12px] outline-none focus:border-yellow-500"
          aria-label="Search location"
        />
        <button type="button" onClick={search} disabled={searching} className="h-9 shrink-0 rounded-lg bg-black px-3 text-[11px] font-bold text-yellow-400 disabled:opacity-60">
          {searching ? "…" : "Search"}
        </button>
        <button type="button" onClick={useGps} disabled={gpsBusy} title="Use my current location" className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 text-[11px] font-bold text-gray-700 disabled:opacity-60">
          {gpsBusy ? "…" : "📍 GPS"}
        </button>
      </div>

      {hits.length > 0 && (
        <div className="max-h-36 overflow-y-auto border-b bg-white">
          {hits.map((h, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setPin(h.lat, h.lng, "MAP"); setHits([]); setQ(""); setNote(""); }}
              className="block w-full px-3 py-2 text-left text-[11px] leading-snug text-gray-700 hover:bg-yellow-50"
            >
              {h.label}
            </button>
          ))}
        </div>
      )}

      {/* map */}
      <div
        ref={holder}
        style={{ height: compact ? 240 : 320 }}
        className={`w-full ${disabled ? "pointer-events-none opacity-70" : ""}`}
        role="application"
        aria-label="Store location map — click to place your store pin"
      />

      <div className="flex items-center justify-between gap-2 border-t bg-gray-50 px-2.5 py-1.5">
        <p className={`truncate text-[10.5px] font-semibold ${hasPin ? "text-green-700" : "text-gray-500"}`}>
          {hasPin ? `✔ Store pinned  (${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)})` : "Tap the map to drop your store pin"}
        </p>
        {note && <p className="truncate text-[10px] text-amber-700" title={note}>{note}</p>}
      </div>
    </div>
  );
}
