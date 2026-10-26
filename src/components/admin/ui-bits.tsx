"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Pencil, Trash2, X, Loader2, RefreshCw, ChevronLeft, ChevronRight, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

/** Image URL field with one-click Cloudinary upload (used by every CRUD module with type:"image").
 *  `aspect` enforces a frame ratio client-side (e.g. "16:9" for Big Sale banners) — wrong-shape
 *  files are rejected BEFORE upload so only correctly sized creatives land in Cloudinary. */
function ImageField({ value, onChange, token, aspect }: { value: string; onChange: (v: string) => void; token: string; aspect?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

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
      {value ? <Image src={value} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-md object-cover" unoptimized /> : null}
    </div>
  );
}

export function api(token: string) {
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

export function ModuleHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-black text-gray-900">{title}</h1>
        {sub && <p className="text-xs text-gray-500">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, sub, color = "#111" }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-white p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}18`, color }}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        <p className="text-lg font-black leading-tight text-gray-900">{value}</p>
        {sub && <p className="truncate text-[10px] text-gray-400">{sub}</p>}
      </div>
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
    APPROVED: "bg-emerald-50 text-emerald-700", PENDING: "bg-orange-50 text-orange-600",
    REJECTED: "bg-red-50 text-red-600", COMPLETED: "bg-emerald-50 text-emerald-700",
    CANCELLED: "bg-red-50 text-red-600", PAID: "bg-emerald-50 text-emerald-700",
    DELIVERED: "bg-emerald-50 text-emerald-700", PACKED: "bg-blue-50 text-blue-600",
    DISPATCHED: "bg-indigo-50 text-indigo-600", REQUESTED: "bg-orange-50 text-orange-600",
    REFUNDED: "bg-emerald-50 text-emerald-700", ACTIVE: "bg-emerald-50 text-emerald-700",
    INACTIVE: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${map[status] || "bg-gray-100 text-gray-600"}`}>
      {status.replace(/_/g, " ")}
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

/** Reusable CRUD module: search + add/edit dialog + delete + refresh */
export function CrudModule({
  entity, title, sub, fields, columns, token, nameField, extraActions, tableImage, onRowsChange,
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

  return (
    <div>
      <ModuleHeader title={title} sub={sub}>
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
        <button onClick={openAdd} className="flex items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-xs font-bold text-yellow-400 hover:bg-gray-800">
          <Plus className="h-4 w-4" /> Add New
        </button>
      </ModuleHeader>

      <div className="mb-3 flex items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 w-full rounded-lg border border-gray-200 pl-8 pr-3 text-xs outline-none focus:border-yellow-400" />
        </div>
        <span className="text-[11px] text-gray-400">{filtered.length} records</span>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2.5 font-bold">#</th>
              {tableImage && <th className="px-3 py-2.5 font-bold">Image</th>}
              {columns.map((c) => <th key={c.key} className="px-3 py-2.5 font-bold">{c.label}</th>)}
              <th className="px-3 py-2.5 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + 3} className="px-3 py-10 text-center text-gray-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={columns.length + 3} className="px-3 py-10 text-center text-gray-400">No records found</td></tr>
            ) : (
              pageRows.map((row, i) => (
                <tr key={String(row.id)} className="border-b last:border-0 hover:bg-yellow-50/40">
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
                      <button onClick={() => openEdit(row)} className="rounded-md bg-blue-50 p-1.5 text-blue-600 hover:bg-blue-100" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => remove(row)} className="rounded-md bg-red-50 p-1.5 text-red-600 hover:bg-red-100" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
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
              <h3 className="text-base font-black">{editing.id ? `Edit ${title.replace(/Management|s$/g, "")}` : `Add ${title.replace(/Management|s$/g, "")}`}</h3>
              <button onClick={() => setEditing(null)} aria-label="Close"><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              {fields.map((f) => (
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
                    <ImageField value={String(form[f.key] ?? "")} onChange={(v) => setForm({ ...form, [f.key]: v })} token={token} aspect={f.aspect} />
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
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border px-4 py-2 text-xs font-semibold">Cancel</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-black px-4 py-2 text-xs font-bold text-yellow-400 disabled:opacity-50">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {editing.id ? "Save Changes" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
