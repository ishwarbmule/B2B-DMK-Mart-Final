/**
 * GET /api/geocode?q=... — public location-search proxy for the store-location map picker.
 *
 * Backed by OpenStreetMap Nominatim (free, no API key). Server-side proxy because
 * Nominatim's usage policy requires a proper User-Agent + light rate limiting, which
 * is unreliable from the browser. Results are cached in memory for 1 hour — repeated
 * searches for the same city/pincode cost zero upstream calls.
 *
 * Response: { results: [{ label, lat, lng }] }  (max 5)
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface GeoHit { label: string; lat: number; lng: number }

const CACHE = new Map<string, { at: number; hits: GeoHit[] }>();
const CACHE_TTL = 60 * 60 * 1000; // 1h
const buckets = new Map<string, number[]>(); // ip → timestamps (sliding window, 30/min max)

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 3) return NextResponse.json({ results: [] });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const now = Date.now();
  const arr = (buckets.get(ip) || []).filter((t) => now - t < 60_000);
  if (arr.length >= 30) return NextResponse.json({ error: "Too many searches — try again in a minute." }, { status: 429 });
  arr.push(now);
  buckets.set(ip, arr);

  const cached = CACHE.get(q.toLowerCase());
  if (cached && now - cached.at < CACHE_TTL) return NextResponse.json({ results: cached.hits });

  try {
    const hits = await geocode(q);
    CACHE.set(q.toLowerCase(), { at: now, hits });
    return NextResponse.json({ results: hits });
  } catch {
    return NextResponse.json({ results: [] });
  }
}

/** Bare Indian pincode → Zippopotam first, then Nominatim; text → Nominatim. */
async function geocode(q: string): Promise<GeoHit[]> {
  if (/^\d{6}$/.test(q)) {
    const z = await viaZippopotam(q).catch(() => []);
    if (z.length) return z;
    return nominatim(`${q}, India`);
  }
  return nominatim(q.includes("india") ? q : `${q}, India`);
}

async function viaZippopotam(pin: string): Promise<GeoHit[]> {
  const res = await fetch(`https://api.zippopotam.us/in/${pin}`, {
    headers: { "User-Agent": "DMK-Mart-B2B/1.0 (store location picker)" },
    signal: AbortSignal.timeout(7000),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { places?: { "place name": string; latitude: string; longitude: string; state: string }[] };
  return (data.places || []).slice(0, 5).map((p) => ({
    label: `${p["place name"]}, ${p.state} — ${pin}`,
    lat: Math.round(Number(p.latitude) * 1e6) / 1e6,
    lng: Math.round(Number(p.longitude) * 1e6) / 1e6,
  }));
}

async function nominatim(q: string): Promise<GeoHit[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "0");
  const res = await fetch(url, {
    headers: {
      // Nominatim policy: identify the app; contact reachable via the site host.
      "User-Agent": "DMK-Mart-B2B/1.0 (store location picker)",
      "Accept-Language": "en",
    },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const raw = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  const hits = raw.map((r) => ({
    label: r.display_name,
    lat: Math.round(Number(r.lat) * 1e6) / 1e6,
    lng: Math.round(Number(r.lon) * 1e6) / 1e6,
  }));

  // Nominatim's fuzzy ranking routinely puts the wrong twin city first
  // (e.g. "Serampore WB" for "Shrirampur MH"). Re-rank: hits whose label
  // contains the query's city word(s) / pincode as a whole token win.
  const pin = q.match(/\b\d{6}\b/)?.[0];
  const words = q.toLowerCase().replace(/\d+/g, " ").split(/\s+/).filter((w) => w.length >= 4 && w !== "india");
  const score = (label: string) => {
    const l = label.toLowerCase();
    let s = 0;
    if (pin && l.includes(pin)) s += 2;
    for (const w of words) if (new RegExp(`\\b${w}\\b`).test(l)) s += 2;
    return s;
  };
  return hits
    .map((h, i) => ({ h, s: score(h.label) - i * 0.1 }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.h);
}
