"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Pencil, Trash2, X, Loader2, RefreshCw, ChevronLeft, ChevronRight, UploadCloud, Images, Eraser, Sparkles } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

/** Cloudinary media picker — browse images ALREADY uploaded to the site's
 *  Cloudinary library (folder-scoped) and pick one, so brand logos / banners
 *  can be reused without re-uploading. */
function CloudinaryPicker({ token, folder, onPick, onClose }: {
  token: string; folder: string; onPick: (url: string) => void; onClose: () => void;
}) {
  const [images, setImages] = useState<{ url: string; publicId: string }[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`/api/admin/cloudinary?folder=${encodeURIComponent(folder)}&max=60`, { headers: { authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `List failed (${r.status})`);
        setImages(d.images || []);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load Cloudinary images"));
  }, [token, folder]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[86vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="flex items-center gap-2 text-[15px] font-semibold text-gray-900"><Images className="h-4 w-4 text-yellow-600" /> Pick from Cloudinary</p>
            <p className="text-[11px] text-gray-400">Images already in your media library · folder dmk-mart/{folder}</p>
          </div>
          <button onClick={onClose} aria-label="Close"><X className="h-4 w-4 text-gray-400 hover:text-gray-700" /></button>
        </div>
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
        {images === null && !err && <p className="flex items-center gap-2 py-10 text-center text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading library…</p>}
        {images !== null && images.length === 0 && !err && (
          <p className="rounded-lg border border-dashed p-8 text-center text-xs text-gray-400">No images in dmk-mart/{folder} yet — upload one and it will appear here for next time.</p>
        )}
        {images !== null && images.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {images.map((img) => (
              <button
                key={img.publicId}
                type="button"
                onClick={() => { onPick(img.url); onClose(); }}
                className="group overflow-hidden rounded-lg border border-gray-200 transition-colors hover:border-yellow-400"
                title={img.publicId}
              >
                <Image src={img.url} alt="" width={120} height={120} className="aspect-square w-full object-cover" unoptimized />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Image URL field with one-click Cloudinary upload, media-library picker and
 *  a clear (remove) action. `aspect` enforces a frame ratio client-side
 *  (e.g. "16:9" for Big Sale banners) — wrong-shape files are rejected BEFORE
 *  upload so only correctly sized creatives land in Cloudinary. */
export function ImageField({ value, onChange, token, aspect, folder }: { value: string; onChange: (v: string) => void; token: string; aspect?: string; folder?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState(false);

  const checkAspect = (file: File, want: string): Promise<string | null> =>
    new Promise((resolve) => {
      const [w, h] = want.split(":").map(Number);
      if (!w || !h) return resolve(null);
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const diff = Math.abs(img.naturalWidth / img.naturalHeight - w / h);
        resolve(diff / (w / h) > 0.06 ? `Image must be exactly ${w}:${h} (e.g. ${w * 60}×${h * 60}px). Uploaded file is ${img.naturalWidth}×${img.naturalHeight}.` : null);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve("Could not read image dimensions.");
      };
      img.src = url;
    });

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (aspect) {
      const err = await checkAspect(file, aspect);
      if (err) {
        toast.error(err);
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd, headers: { authorization: `Bearer ${token}` } });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Upload failed (${res.status})`);
      onChange(d.url);
      toast.success("Image uploaded to Cloudinary");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={aspect ? `paste URL or upload — frame must be ${aspect}` : "/cms/slider-0.svg or upload →"}
        className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
      />
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        title="Upload image to Cloudinary"
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-[11px] font-bold text-gray-600 hover:border-yellow-400 hover:text-black disabled:opacity-50"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
        {uploading ? "Uploading…" : "Upload"}
      </button>
      <button
        type="button"
        onClick={() => setPicking(true)}
        title="Pick an image already stored in Cloudinary"
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-[11px] font-bold text-gray-600 hover:border-yellow-400 hover:text-black"
      >
        <Images className="h-4 w-4" /> Library
      </button>
      {value ? (
        <>
          <Image src={value} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-md object-cover" unoptimized />
          <button
            type="button"
            onClick={() => onChange("")}
            title="Remove this image (clears the field — the file stays in Cloudinary)"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-100 text-red-500 hover:bg-red-50"
            aria-label="Remove image"
          >
            <Eraser className="h-4 w-4" />
          </button>
        </>
      ) : null}
      {picking && <CloudinaryPicker token={token} folder={folder || "products"} onPick={(url) => onChange(url)} onClose={() => setPicking(false)} />}
    </div>
  );
}

/** Build the admin API caller. NOT exported — use api() which caches per token. */
function makeApi(token: string) {
  return async (path: string, init?: RequestInit) => {
    const res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  };
}

/** Per-token cache of api callers. Every module does `const call = api(token)` on each render —
 *  without this cache the returned closure gets a NEW identity every render, which re-triggers
 *  `useCallback(..., [call])` + `useEffect(..., [load])` chains into an infinite refetch loop
 *  (React "Maximum update depth exceeded" + thousands of duplicate API calls that exhaust the
 *  Hostinger MySQL connection cap). Stable identity per token breaks the loop everywhere. */
const apiCache = new Map<string, ReturnType<typeof makeApi>>();

export function api(token: string) {
  let fn = apiCache.get(token);
  if (!fn) {
    fn = makeApi(token);
    apiCache.set(token, fn);
    // keep the cache tiny — login/logout token churn must not leak
    if (apiCache.size > 8) {
      const oldest = apiCache.keys().next().value;
      if (oldest !== undefined) apiCache.delete(oldest);
    }
  }
  return fn;
}

export function ModuleHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[20px] font-semibold leading-tight tracking-[-0.01em] text-gray-900">{title}</h1>
        {sub && <p className="mt-1 text-[13px] text-gray-500">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, sub, color = "#111", extra }: {
  icon: React.ComponentType<{ className?: string }> | null | undefined;
  label: string; value: string | number; sub?: string; color?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[12px] text-gray-500">{label}</p>
        {/* icon is optional — a null icon must never crash the module (financial section outage) */}
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-gray-400" /> : null}
      </div>
      <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.01em] tabular-nums text-gray-900">{value}</p>
      {sub && <p className="mt-2 truncate text-[12px] text-gray-400">{sub}</p>}
      {extra != null && <div className="mt-2">{extra}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition ${checked ? "bg-yellow-400" : "bg-gray-200"} ${disabled ? "opacity-50" : ""}`}
      aria-checked={checked}
      role="switch"
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    APPROVED: "bg-emerald-50 text-emerald-700", PENDING: "bg-orange-50 text-orange-700",
    REJECTED: "bg-red-50 text-red-700", COMPLETED: "bg-emerald-50 text-emerald-700",
    CANCELLED: "bg-red-50 text-red-700", PAID: "bg-emerald-50 text-emerald-700",
    DELIVERED: "bg-emerald-50 text-emerald-700", PACKED: "bg-blue-50 text-blue-700",
    DISPATCHED: "bg-indigo-50 text-indigo-700", REQUESTED: "bg-orange-50 text-orange-700",
    REFUNDED: "bg-emerald-50 text-emerald-700", ACTIVE: "bg-emerald-50 text-emerald-700",
    INACTIVE: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${map[status] || "bg-gray-100 text-gray-600"}`}>
      {status.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "toggle" | "textarea" | "image" | "password" | "ref" | "scope";
  options?: string[];
  refEntity?: string; // for select of another crud entity (id/name)
  refLabelField?: string;
  required?: boolean;
  placeholder?: string;
  step?: string;
  hideInTable?: boolean;
  default?: string | number | boolean;
  aspect?: string; // for image fields — enforce frame ratio, e.g. "16:9"
  folder?: string; // for image fields — Cloudinary sub-folder for Upload/Library
  advanced?: boolean; // grouped under "Advanced styling" in the form — presets usually fill these
}

/** One-click prebuilt setups — clicking a chip fills the whole form with sane
 *  values so a non-technical admin only tweaks the basics and saves. */
export interface PresetDef {
  label: string;
  hint?: string;
  values: Record<string, string | number | boolean>;
}

export interface ColumnDef {
  key: string;
  label: string;
  render?: (row: Record<string, unknown>) => React.ReactNode;
}

/** Apply-to scope picker — turns the coupon's `scopeType` into concrete targets.
 *  BRAND → checkbox list (stores slugs, matching /api/coupons/validate),
 *  CATEGORY → multi-select of departments + sub-categories (stores ids),
 *  PRODUCT → search-and-add product list (stores ids; coupon applies to those only). */
function ScopePicker({ scopeType, value, onChange, token }: { scopeType: string; value: string; onChange: (v: string) => void; token: string }) {
  const call = useMemo(() => api(token), [token]);
  const ids = useMemo(() => {
    try { return JSON.parse(value || "[]") as string[]; } catch { return []; }
  }, [value]);
  const toggle = (id: string) => onChange(JSON.stringify(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const [brands, setBrands] = useState<{ slug: string; name: string }[]>([]);
  const [cats, setCats] = useState<{ id: string; label: string }[]>([]);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (scopeType === "BRAND" && brands.length === 0) {
      call("/api/admin/crud/brands")
        .then((d) => setBrands((d.rows || []).map((r: Record<string, unknown>) => ({ slug: String(r.slug), name: String(r.name) }))))
        .catch(() => {});
    }
    if (scopeType === "CATEGORY" && cats.length === 0) {
      Promise.all([call("/api/admin/crud/tops"), call("/api/admin/crud/mids")])
        .then(([t, m]) => {
          const tops = (t.rows || []) as Record<string, unknown>[];
          const mids = (m.rows || []) as Record<string, unknown>[];
          setCats([
            ...tops.map((r) => ({ id: String(r.id), label: `${String(r.name)} · department` })),
            ...mids.map((r) => ({ id: String(r.id), label: `${String((r.top as { name?: string } | undefined)?.name ?? "?")} › ${String(r.name)}` })),
          ]);
        })
        .catch(() => {});
    }
  }, [scopeType, call, brands.length, cats.length]);

  const search = async () => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const d = await call(`/api/products?q=${encodeURIComponent(q.trim())}&limit=8`);
      setResults(((d.products || []) as { id: string; name: string }[]).map((p) => ({ id: p.id, name: p.name })));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const box = "max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-gray-200 p-2";

  if (scopeType === "ALL") {
    return <p className="rounded-lg bg-yellow-50 px-3 py-2 text-[11px] font-semibold text-gray-600">Applies to every product in the catalog — no selection needed.</p>;
  }

  if (scopeType === "BRAND") {
    return (
      <div className={box}>
        {brands.map((b) => (
          <label key={b.slug} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-yellow-50">
            <input type="checkbox" checked={ids.includes(b.slug)} onChange={() => toggle(b.slug)} className="h-3.5 w-3.5 accent-yellow-500" />
            <span className="font-semibold text-gray-800">{b.name}</span>
          </label>
        ))}
        {brands.length === 0 && <p className="px-1.5 py-1 text-[11px] text-gray-400">Loading brands…</p>}
      </div>
    );
  }

  if (scopeType === "CATEGORY") {
    return (
      <div className={box}>
        {cats.map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-yellow-50">
            <input type="checkbox" checked={ids.includes(c.id)} onChange={() => toggle(c.id)} className="h-3.5 w-3.5 accent-yellow-500" />
            <span className="font-semibold text-gray-800">{c.label}</span>
          </label>
        ))}
        {cats.length === 0 && <p className="px-1.5 py-1 text-[11px] text-gray-400">Loading categories…</p>}
      </div>
    );
  }

  // PRODUCT — search and add; only listed products get the discount
  return (
    <div className="space-y-2">
      {ids.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ids.map((id) => (
            <span key={id} className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-700">
              {picked[id] || `#${id.slice(-6)}`}
              <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${picked[id] || id}`}><X className="h-3 w-3 text-gray-500 hover:text-red-600" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())}
          placeholder="Search products to add…"
          className="h-9 w-full rounded-lg border border-gray-200 px-3 text-xs outline-none focus:border-yellow-400"
        />
        <button type="button" onClick={search} disabled={searching} className="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-black px-3 text-[11px] font-bold text-yellow-400 disabled:opacity-50">
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
        </button>
      </div>
      <div className="space-y-0.5">
        {results.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => { if (!ids.includes(r.id)) { toggle(r.id); setPicked((p) => ({ ...p, [r.id]: r.name })); } }}
            disabled={ids.includes(r.id)}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-yellow-50 disabled:opacity-40"
          >
            <span className="truncate">{r.name}</span>
            <span className="shrink-0 font-bold text-yellow-600">{ids.includes(r.id) ? "Added" : "+ Add"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Reusable CRUD module: search + add/edit dialog + delete + refresh.
 *  `presets` — one-click prebuilt setups shown above the form (non-technical UX);
 *  fields flagged `advanced` collapse into an "Advanced styling" drawer that
 *  presets fill automatically. `headerExtra` — module-wide action button(s). */
export function CrudModule({
  entity, title, sub, fields, columns, token, nameField, extraActions, tableImage, onRowsChange, presets, headerExtra,
}: {
  entity: string;
  title: string;
  sub?: string;
  fields: FieldDef[];
  columns: ColumnDef[];
  token: string;
  nameField: string;
  tableImage?: string;
  extraActions?: (row: Record<string, unknown>, refresh: () => void) => React.ReactNode;
  onRowsChange?: (rows: Record<string, unknown>[]) => void;
  presets?: PresetDef[];
  headerExtra?: React.ReactNode;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [refs, setRefs] = useState<Record<string, Record<string, unknown>[]>>({});
  const [page, setPage] = useState(1);
  const perPage = 12;
  const call = useMemo(() => api(token), [token]);

  const load = async () => {
    setLoading(true);
    try {
      const d = await call(`/api/admin/crud/${entity}`);
      setRows(d.rows || []);
      onRowsChange?.(d.rows || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load();   }, [entity]);
  useEffect(() => { setPage(1); }, [q]);

  // load referenced entities for select fields
  useEffect(() => {
    for (const f of fields) {
      if (f.type === "ref" && f.refEntity && !refs[f.refEntity]) {
        call(`/api/admin/crud/${f.refEntity}`)
          .then((d) => setRefs((r) => ({ ...r, [f.refEntity!]: d.rows || [] })))
          .catch(() => {});
      }
    }
  }, [fields, call, refs]);

  const filtered = rows.filter((r) => {
    if (!q) return true;
    return Object.values(r).some((v) => String(v).toLowerCase().includes(q.toLowerCase()));
  });
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);

  const openAdd = () => {
    const init: Record<string, unknown> = {};
    for (const f of fields) init[f.key] = f.default ?? (f.type === "toggle" ? false : "");
    setForm(init);
    setEditing({});
  };
  const openEdit = (row: Record<string, unknown>) => {
    const init: Record<string, unknown> = {};
    for (const f of fields) {
      const v = row[f.key];
      if (f.type === "ref") init[f.key] = typeof v === "object" && v ? (v as Record<string, unknown>).id : v;
      else init[f.key] = v ?? "";
    }
    setForm(init);
    setEditing(row);
  };

  /** apply a prebuilt setup onto the current form (keeps name/identity fields) */
  const applyPreset = (p: PresetDef) => {
    setForm((f) => ({ ...f, ...p.values }));
    toast.success(`${p.label} setup applied — review the details and save`);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of fields) {
        let v = form[f.key];
        if (f.type === "number") v = Number(v) || 0;
        if (f.type === "toggle") v = !!v;
        if (f.type === "ref") v = String(v);
        if (f.type === "text" && f.key === nameField && !String(v).trim() && f.required !== false) throw new Error(`${f.label} is required`);
        payload[f.key] = v;
      }
      if (editing?.id) {
        await call(`/api/admin/crud/${entity}`, { method: "PATCH", body: JSON.stringify({ id: editing.id, ...payload }) });
        toast.success("Saved");
      } else {
        await call(`/api/admin/crud/${entity}`, { method: "POST", body: JSON.stringify(payload) });
        toast.success("Created");
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Record<string, unknown>) => {
    if (!confirm(`Delete "${row[nameField]}"? This cannot be undone.`)) return;
    try {
      await call(`/api/admin/crud/${entity}?id=${row.id}`, { method: "DELETE" });
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const simpleFields = fields.filter((f) => !f.advanced);
  const advancedFields = fields.filter((f) => f.advanced);

  const renderField = (f: FieldDef) => (
    <div key={f.key}>
      <label className="text-xs font-semibold text-gray-700">{f.label}{f.required !== false && f.type !== "toggle" ? " *" : ""}</label>
      {f.type === "toggle" ? (
        <div className="pt-1.5"><Toggle checked={!!form[f.key]} onChange={(v) => setForm({ ...form, [f.key]: v })} /></div>
      ) : f.type === "select" ? (
        <select value={String(form[f.key] ?? "")} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-2 text-sm outline-none focus:border-yellow-400">
          <option value="">Select…</option>
          {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.type === "ref" ? (
        <select value={String(form[f.key] ?? "")} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="h-10 w-full rounded-lg border border-gray-200 px-2 text-sm outline-none focus:border-yellow-400">
          <option value="">Select…</option>
          {(refs[f.refEntity || ""] || []).map((r) => (
            <option key={String(r.id)} value={String(r.id)}>{String(r[f.refLabelField || "name"])}</option>
          ))}
        </select>
      ) : f.type === "textarea" ? (
        <textarea value={String(form[f.key] ?? "")} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-yellow-400" />
      ) : f.type === "scope" ? (
        <ScopePicker scopeType={String(form.scopeType || "ALL")} value={String(form[f.key] ?? "[]")} onChange={(v) => setForm({ ...form, [f.key]: v })} token={token} />
      ) : f.type === "image" ? (
        <ImageField value={String(form[f.key] ?? "")} onChange={(v) => setForm({ ...form, [f.key]: v })} token={token} aspect={f.aspect} folder={f.folder} />
      ) : (
        <input
          type={f.type === "number" ? "number" : f.type === "password" ? "password" : "text"}
          step={f.step}
          value={String(form[f.key] ?? "")}
          onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
          placeholder={f.placeholder}
          className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
        />
      )}
    </div>
  );

  return (
    <div>
      <ModuleHeader title={title} sub={sub}>
        {headerExtra}
        <button onClick={load} className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
        <button onClick={openAdd} className="flex h-9 items-center gap-1.5 rounded-lg bg-black px-4 text-[13px] font-semibold text-yellow-400 transition-colors hover:bg-gray-900">
          <Plus className="h-4 w-4" /> Add
        </button>
      </ModuleHeader>

      <div className="mb-3 flex items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-9 w-full rounded-lg border border-gray-200 pl-8 pr-3 text-[13px] outline-none transition-colors focus:border-gray-400" />
        </div>
        <span className="text-[12px] tabular-nums text-gray-400">{filtered.length} records</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-[13px] tabular-nums">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-[12px] font-medium text-gray-500">
              <th className="px-3 py-2.5">#</th>
              {tableImage && <th className="px-3 py-2.5">Image</th>}
              {columns.map((c) => <th key={c.key} className="px-3 py-2.5">{c.label}</th>)}
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + 3} className="px-3 py-10 text-center text-gray-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={columns.length + 3} className="px-3 py-10 text-center text-gray-400">No records found</td></tr>
            ) : (
              pageRows.map((row, i) => (
                <tr key={String(row.id)} className="border-b border-gray-100 last:border-0 transition-colors hover:bg-gray-50">
                  <td className="px-3 py-2.5 text-gray-400">{(page - 1) * perPage + i + 1}</td>
                  {tableImage && (
                    <td className="px-3 py-2.5">
                      <Image src={String(row[tableImage] || "/dmk-logo.png")} alt="" width={36} height={36} className="h-9 w-9 rounded-md object-cover" unoptimized />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className="max-w-[240px] truncate px-3 py-2.5">{c.render ? c.render(row) : String(row[c.key] ?? "—")}</td>
                  ))}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {extraActions?.(row, load)}
                      <button onClick={() => openEdit(row)} className="rounded-md border border-gray-200 p-1.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => remove(row)} className="rounded-md border border-red-100 p-1.5 text-red-500 transition-colors hover:bg-red-50" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border px-2.5 py-1.5 font-semibold disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <span className="font-semibold text-gray-600">Page {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-md border px-2.5 py-1.5 font-semibold disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-gray-900">{editing.id ? `Edit ${title.replace(/Management|s$/g, "")}` : `Add ${title.replace(/Management|s$/g, "")}`}</h3>
              <button onClick={() => setEditing(null)} aria-label="Close"><X className="h-4 w-4 text-gray-400 transition-colors hover:text-gray-700" /></button>
            </div>
            {presets && presets.length > 0 && (
              <div className="mb-4 rounded-xl border border-yellow-300 bg-yellow-50 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-gray-700"><Sparkles className="h-3.5 w-3.5 text-yellow-600" /> Prebuilt setups — pick one, tweak the basics, save</p>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyPreset(p)}
                      title={p.hint || p.label}
                      className="rounded-full border border-yellow-400 bg-white px-3 py-1.5 text-[11px] font-bold text-gray-700 hover:bg-yellow-100"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-3">
              {simpleFields.map(renderField)}
              {advancedFields.length > 0 && (
                <details className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                  <summary className="cursor-pointer select-none text-[12px] font-bold text-gray-600">Advanced styling &amp; layout ({advancedFields.length} fields — presets already set these)</summary>
                  <div className="mt-3 space-y-3">
                    {advancedFields.map(renderField)}
                  </div>
                </details>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="h-9 rounded-lg border border-gray-200 px-4 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={saving} className="flex h-9 items-center gap-1.5 rounded-lg bg-black px-4 text-[13px] font-semibold text-yellow-400 transition-colors hover:bg-gray-900 disabled:opacity-50">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {editing.id ? "Save changes" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
