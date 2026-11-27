"use client";

/**
 * LoginPageManagement — Admin → Website Management → Login Page Management.
 *
 * The owner's rule: EVERY image and line of text on the customer login page and
 * the warehouse selection page is editable from here — no code changes needed.
 *
 *   Login page            → frame texts (topline, USP chips, panel strip, notes,
 *                           footer) + every slider slide with a DESKTOP image and
 *                           a MOBILE image edited separately, plus kicker /
 *                           heading / paragraph per slide.
 *   Warehouse choice page → heading, subtext, card badge, caption, and the
 *                           location-mismatch warning copy. Per-warehouse photos
 *                           are managed in Admin → Warehouses (Image field).
 *
 * Frame texts save into the SiteContent table (live-content registry keys);
 * slides save straight into the Slider table the login page reads.
 */
import { useEffect, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, RotateCcw, Save, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { api, ImageField, ModuleHeader } from "./ui-bits";
import { LIVE_DEFAULTS } from "@/lib/live-content";

type Row = Record<string, unknown>;

const INPUT_CLS = "h-9 w-full rounded-lg border border-gray-200 px-3 text-[13px] outline-none focus:border-yellow-400";
const AREA_CLS = "w-full rounded-lg border border-gray-200 p-2.5 text-[13px] leading-relaxed outline-none focus:border-yellow-400";
const CARD = "rounded-xl border bg-white p-4";
const SAVE_BTN = "flex h-9 items-center gap-1.5 rounded-lg bg-black px-3.5 text-xs font-bold text-yellow-400 hover:bg-gray-900 disabled:opacity-50";

interface TextDef { key: string; label: string; long?: boolean; hint?: string }

const LOGIN_TEXTS: TextDef[] = [
  { key: "login.topline", label: "Top bar — right-side line" },
  { key: "login.usp.chips", label: "Slider — USP chips (comma-separated)", hint: "e.g. Tier wholesale pricing,Two ready warehouses,GST invoices" },
  { key: "login.panel.strip", label: "Sign-in card — yellow strip text", long: true },
  { key: "login.register.note", label: "Create-account — bottom note", long: true },
  { key: "login.regdone.text", label: "Account-created card — message", long: true },
  { key: "login.footer", label: "Footer line" },
];

const WH_TEXTS: TextDef[] = [
  { key: "wh.title", label: "Page heading" },
  { key: "wh.subtitle", label: "Page subtext", long: true },
  { key: "wh.badge", label: "Card badge line (top-left on each photo)" },
  { key: "wh.cardcaption", label: "Card caption line (under the name)" },
  { key: "wh.mismatch.title", label: "Location-mismatch warning — title" },
  { key: "wh.mismatch.text", label: "Location-mismatch warning — message ({home} / {chosen} placeholders)", long: true },
];

export function LoginPageManagement({ token }: { token: string }) {
  const [tab, setTab] = useState<"login" | "warehouse">("login");
  return (
    <div>
      <div className="mb-4 flex gap-1.5">
        <button onClick={() => setTab("login")} className={`flex h-9 items-center gap-1.5 rounded-lg px-4 text-[13px] transition-colors ${tab === "login" ? "bg-black font-medium text-yellow-400" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
          Customer Login Page
        </button>
        <button onClick={() => setTab("warehouse")} className={`flex h-9 items-center gap-1.5 rounded-lg px-4 text-[13px] transition-colors ${tab === "warehouse" ? "bg-black font-medium text-yellow-400" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
          <Warehouse className="h-4 w-4" /> Warehouse Selection Page
        </button>
      </div>
      {tab === "login" ? <LoginTab token={token} /> : <WarehouseTab token={token} />}
    </div>
  );
}

/* ───────────────────────── LOGIN PAGE ───────────────────────── */

function LoginTab({ token }: { token: string }) {
  const call = api(token);
  const [values, setValues] = useState<Record<string, string>>({});
  const [slides, setSlides] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const [content, crud] = await Promise.all([
        fetch("/api/site-content").then((r) => r.json()),
        call("/api/admin/crud/sliders"),
      ]);
      const ov: Record<string, string> = content?.overrides ?? {};
      const next: Record<string, string> = {};
      for (const t of [...LOGIN_TEXTS, ...WH_TEXTS]) next[t.key] = ov[t.key] ?? "";
      setValues(next);
      setSlides(crud.rows ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  const setValue = (key: string, v: string) => {
    setValues((s) => ({ ...s, [key]: v }));
    setDirty((s) => new Set(s).add(key));
  };

  const saveTexts = async () => {
    if (!dirty.size) return toast.info("Nothing changed yet");
    setSaving("texts");
    try {
      await call("/api/admin/site-content", {
        method: "POST",
        body: JSON.stringify({ changes: [...dirty].map((key) => ({ key, value: values[key] ?? "" })) }),
      });
      toast.success("Login page text saved — refresh the login page to see it");
      setDirty(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving("");
    }
  };

  const patchSlide = async (s: Row, data: Row) => {
    setSaving(String(s.id));
    try {
      await call("/api/admin/crud/sliders", { method: "PATCH", body: JSON.stringify({ id: s.id, ...data }) });
      setSlides((rows) => rows.map((r) => (r.id === s.id ? { ...r, ...data } : r)));
      toast.success("Slide saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving("");
    }
  };

  const setSlideField = (id: string, field: string, v: string) =>
    setSlides((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: v } : r)));

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-yellow-500" /></div>;

  return (
    <div className="space-y-5">
      {/* frame texts */}
      <div className={CARD}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-black text-gray-900">Page frame texts</p>
            <p className="text-[11px] text-gray-500">Every line around the slider and the sign-in panel. Empty = default.</p>
          </div>
          <button onClick={saveTexts} disabled={saving === "texts"} className={SAVE_BTN}>
            {saving === "texts" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save texts
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {LOGIN_TEXTS.map((t) => (
            <div key={t.key} className={t.long ? "md:col-span-2" : ""}>
              <label className="mb-1 flex items-center justify-between text-[12px] font-bold text-gray-700">
                {t.label}
                {dirty.has(t.key) && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">unsaved</span>}
              </label>
              {t.long ? (
                <textarea rows={2} value={values[t.key] ?? ""} onChange={(e) => setValue(t.key, e.target.value)} className={AREA_CLS} placeholder={LIVE_DEFAULTS[t.key]} />
              ) : (
                <input value={values[t.key] ?? ""} onChange={(e) => setValue(t.key, e.target.value)} className={INPUT_CLS} placeholder={LIVE_DEFAULTS[t.key]} />
              )}
              {t.hint && <p className="mt-0.5 text-[10px] text-gray-400">{t.hint}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* slides */}
      <div className={CARD}>
        <p className="text-sm font-black text-gray-900">Slider slides — desktop &amp; mobile images with their text</p>
        <p className="text-[11px] text-gray-500">
          Desktop image fills the wide left panel; the mobile image (portrait, ~3:4) replaces it on phones. These are the same slides the homepage hero uses — the login page shows them without buttons.
        </p>
        <div className="mt-3 space-y-4">
          {slides.map((s, i) => (
            <div key={String(s.id)} className="rounded-xl border p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-500">SLIDE {i + 1}</span>
                <span className="truncate text-xs font-bold text-gray-800">{String(s.heading || "Untitled")}</span>
                {saving === String(s.id) && <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-600" />}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-gray-600"><ImagePlus className="h-3 w-3" /> Desktop image (wide)</p>
                  <ImageField value={String(s.image ?? "")} onChange={(v) => setSlideField(String(s.id), "image", v)} token={token} folder="website" aspect="16:9" />
                </div>
                <div>
                  <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-gray-600"><ImagePlus className="h-3 w-3" /> Mobile image (portrait — shown on phones)</p>
                  <ImageField value={String(s.mobileImage ?? "")} onChange={(v) => setSlideField(String(s.id), "mobileImage", v)} token={token} folder="website" aspect="3:4" />
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-gray-600">Kicker (small uppercase line)</label>
                  <input value={String(s.kicker ?? "")} onChange={(e) => setSlideField(String(s.id), "kicker", e.target.value)} className={INPUT_CLS} />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-[11px] font-bold text-gray-600">Heading</label>
                  <input value={String(s.heading ?? "")} onChange={(e) => setSlideField(String(s.id), "heading", e.target.value)} className={INPUT_CLS} />
                </div>
                <div className="md:col-span-3">
                  <label className="mb-1 block text-[11px] font-bold text-gray-600">Paragraph</label>
                  <textarea rows={2} value={String(s.content ?? "")} onChange={(e) => setSlideField(String(s.id), "content", e.target.value)} className={AREA_CLS} />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[10px] text-gray-400">Preview shows the desktop image — save and open /login to see both.</p>
                <button
                  onClick={() => patchSlide(s, { image: s.image, mobileImage: s.mobileImage, kicker: s.kicker, heading: s.heading, content: s.content })}
                  disabled={saving === String(s.id)}
                  className={SAVE_BTN}
                >
                  {saving === String(s.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save slide
                </button>
              </div>
            </div>
          ))}
          {!slides.length && (
            <p className="rounded-lg border border-dashed p-6 text-center text-xs text-gray-400">
              No slides yet — add them under Website Management → Hero Section (Sliders), or upload desktop/mobile images there.
            </p>
          )}
        </div>
      </div>

      {/* live preview */}
      <div className={CARD}>
        <p className="text-sm font-black text-gray-900">Live preview (desktop image)</p>
        <div className="mt-2 overflow-hidden rounded-xl border">
          {(() => {
            const s = slides[0];
            const img = String(s?.image ?? "");
            return img ? (
              <div className="relative aspect-[16/9] w-full bg-black">
                <Image src={img} alt="slide preview" fill className="object-cover" unoptimized />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-4 right-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-yellow-400">{String(s?.kicker || "DMK MART · WHOLESALE")}</p>
                  <p className="mt-0.5 text-sm font-black text-white">{String(s?.heading || "")}</p>
                </div>
              </div>
            ) : (
              <p className="p-6 text-center text-xs text-gray-400">Upload a desktop image on slide 1 to preview it here.</p>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────── WAREHOUSE SELECTION PAGE ──────────────────── */

function WarehouseTab({ token }: { token: string }) {
  const call = api(token);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const content = await fetch("/api/site-content").then((r) => r.json());
        const ov: Record<string, string> = content?.overrides ?? {};
        const next: Record<string, string> = {};
        for (const t of WH_TEXTS) next[t.key] = ov[t.key] ?? "";
        setValues(next);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    if (!dirty.size) return toast.info("Nothing changed yet");
    setSaving(true);
    try {
      await call("/api/admin/site-content", {
        method: "POST",
        body: JSON.stringify({ changes: [...dirty].map((key) => ({ key, value: values[key] ?? "" })) }),
      });
      toast.success("Warehouse page text saved");
      setDirty(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-yellow-500" /></div>;

  return (
    <div className="space-y-5">
      <div className={CARD}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-black text-gray-900">Warehouse selection page texts</p>
            <p className="text-[11px] text-gray-500">The page every buyer sees right after login. Empty = default.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setValues(Object.fromEntries(WH_TEXTS.map((t) => [t.key, ""]))); setDirty(new Set(WH_TEXTS.map((t) => t.key))); }}
              className="flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold text-gray-600 hover:bg-gray-50"
              title="Reset all fields to defaults (save to apply)"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Defaults
            </button>
            <button onClick={save} disabled={saving} className={SAVE_BTN}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save texts
            </button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {WH_TEXTS.map((t) => (
            <div key={t.key} className={t.long ? "md:col-span-2" : ""}>
              <label className="mb-1 flex items-center justify-between text-[12px] font-bold text-gray-700">
                {t.label}
                {dirty.has(t.key) && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">unsaved</span>}
              </label>
              {t.long ? (
                <textarea rows={2} value={values[t.key] ?? ""} onChange={(e) => { setValue(t.key, e.target.value); }} className={AREA_CLS} placeholder={LIVE_DEFAULTS[t.key]} />
              ) : (
                <input value={values[t.key] ?? ""} onChange={(e) => { setValue(t.key, e.target.value); }} className={INPUT_CLS} placeholder={LIVE_DEFAULTS[t.key]} />
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-lg bg-yellow-50 p-3 text-[11px] leading-relaxed text-gray-600">
          <b>Warehouse photos:</b> each card&apos;s godown image is managed per warehouse under <b>Catalog &amp; Pricing → Warehouses</b> (Image field — upload or pick from Cloudinary).
          When a buyer picks a warehouse in a different area than their registered shop, the mismatch warning (title + message above) is shown before the pick is applied — and again when they confirm an order.
        </p>
      </div>
    </div>
  );

  function setValue(key: string, v: string) {
    setValues((s) => ({ ...s, [key]: v }));
    setDirty((s) => new Set(s).add(key));
  }
}
