"use client";

/**
 * Live Visual Editor module (Website Management) — admin control room for the
 * on-page click-to-edit overlay (the production adaptation of live-edit).
 *
 * - "Open Live Editor" launches the storefront with ?live=1; the admin token in
 *   localStorage activates the overlay (hover → click → double-click → Ctrl+S).
 * - The table below is the same content editable as a form, for quick tweaks
 *   or mobile use. Saving writes the SiteContent table — live instantly.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, MousePointerClick, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader } from "./ui-bits";

type Row = {
  key: string; page: string; label: string; defaultValue: string;
  multiline: boolean; value: string; updatedAt: string | null;
};

export function LiveEditorModule({ token }: { token: string }) {
  const call = api(token);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    call("/api/admin/site-content")
      .then((d) => setRows(d.rows ?? []))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [call]);

  useEffect(() => { load(); }, [load]);

  const changed = useMemo(() => Object.keys(dirty).length, [dirty]);

  const setValue = (key: string, value: string) => setDirty((d) => ({ ...d, [key]: value }));

  const save = useCallback(async (keys?: string[]) => {
    const list = keys ?? Object.keys(dirty);
    const changes = list
      .filter((k) => dirty[k] !== undefined)
      .map((k) => ({ key: k, value: dirty[k] }));
    if (!changes.length) { toast.info("Nothing to save"); return; }
    setSaving(true);
    try {
      const res = await call("/api/admin/site-content", { method: "POST", body: JSON.stringify({ changes }) });
      toast.success(`${res.saved ?? changes.length} text${res.saved === 1 ? "" : "s"} saved — live on the website`);
      setDirty((d) => {
        const next = { ...d };
        for (const c of changes) delete next[c.key];
        return next;
      });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [call, dirty, load]);

  const pages = useMemo(() => [...new Set(rows.map((r) => r.page))], [rows]);

  return (
    <div>
      <ModuleHeader title="Live Visual Editor" sub="Click-to-edit your website copy on the live storefront — hover, double-click, save. Changes go live instantly.">
        <a
          href="/?live=1"
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 items-center gap-1.5 rounded-lg bg-black px-3.5 text-xs font-bold text-yellow-400 hover:bg-gray-800"
        >
          <MousePointerClick className="h-3.5 w-3.5" /> Open Live Editor <ExternalLink className="h-3 w-3" />
        </a>
      </ModuleHeader>

      {/* how-to strip */}
      <div className="mb-4 grid gap-2 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-xs text-yellow-900 md:grid-cols-4">
        <p><b>1.</b> Open the storefront with the button above (adds <code>?live=1</code>).</p>
        <p><b>2.</b> Editable copy gets dashed outlines — hover to see it.</p>
        <p><b>3.</b> Double-click a text, type the new copy, press <b>Enter</b> (<b>Esc</b> cancels).</p>
        <p><b>4.</b> Press <b>Ctrl/Cmd + S</b> or the Save button — texts persist on the live site.</p>
      </div>

      {loading ? (
        <p className="rounded-xl border bg-white p-10 text-center text-sm text-gray-400">Loading editable texts…</p>
      ) : (
        <div className="space-y-5">
          {pages.map((page) => (
            <div key={page} className="rounded-xl border bg-white">
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <p className="text-xs font-black uppercase tracking-wide text-gray-500">Page: {page}</p>
                <span className="text-[10px] font-semibold text-gray-400">{rows.filter((r) => r.page === page).length} texts</span>
              </div>
              <div className="divide-y">
                {rows.filter((r) => r.page === page).map((r) => {
                  const current = dirty[r.key] ?? r.value;
                  const isOverridden = !!r.value.trim();
                  const isDirty = dirty[r.key] !== undefined && dirty[r.key] !== r.value;
                  return (
                    <div key={r.key} className={`flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center ${isDirty ? "bg-yellow-50/60" : ""}`}>
                      <div className="min-w-0 md:w-72">
                        <p className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                          {r.label}
                          {isOverridden && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black text-emerald-600">CUSTOM</span>}
                        </p>
                        <code className="text-[9px] text-gray-400">{r.key}</code>
                        {!r.multiline && isOverridden && <p className="text-[9px] text-gray-400">default: &quot;{r.defaultValue}&quot;</p>}
                      </div>
                      <div className="flex-1">
                        {r.multiline ? (
                          <textarea
                            value={current}
                            onChange={(e) => setValue(r.key, e.target.value)}
                            rows={2}
                            className="w-full rounded-lg border px-2.5 py-1.5 text-xs outline-none focus:border-yellow-400"
                          />
                        ) : (
                          <input
                            value={current}
                            onChange={(e) => setValue(r.key, e.target.value)}
                            className="h-9 w-full rounded-lg border px-2.5 text-xs outline-none focus:border-yellow-400"
                          />
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          onClick={() => { setValue(r.key, ""); save([r.key]); }}
                          disabled={!isOverridden || saving}
                          title="Reset to default text"
                          className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold text-gray-500 hover:bg-gray-50 disabled:opacity-30"
                        >
                          <RotateCcw className="h-3 w-3" /> Reset
                        </button>
                        <button
                          onClick={() => save([r.key])}
                          disabled={!isDirty || saving}
                          className="flex items-center gap-1 rounded-lg bg-black px-2.5 py-1.5 text-[10px] font-bold text-yellow-400 disabled:opacity-30"
                        >
                          <Save className="h-3 w-3" /> Save
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {changed > 0 && (
            <div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-yellow-300 bg-yellow-400 px-4 py-3 shadow-lg">
              <p className="text-xs font-black text-black">{changed} unsaved change{changed === 1 ? "" : "s"}</p>
              <button onClick={() => save()} disabled={saving} className="rounded-lg bg-black px-4 py-2 text-xs font-black text-yellow-400 hover:bg-gray-900 disabled:opacity-50">
                {saving ? "Saving…" : "Save all & publish"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
