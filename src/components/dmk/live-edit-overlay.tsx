"use client";

/**
 * Live Visual Editor overlay — the production adaptation of the live-edit project
 * (github.com/lakshya1282/live-edit) wired into Website Management.
 *
 * Same interaction model as live-edit: hover highlights editable copy, click selects
 * it, double-click edits inline (Enter commits, Esc cancels), Ctrl+S / Save flushes
 * everything. Instead of writing to source files through a local proxy (impossible on
 * a serverless deploy), staged changes are saved to the SiteContent table via
 * /api/admin/site-content — so edits persist on production instantly.
 *
 * Activation: open the storefront with ?live=1 while signed in to the admin portal.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveContent } from "./live-content-context";
import { LIVE_DEFAULTS, liveDef } from "@/lib/live-content";

const ADMIN_TOKEN_KEY = "dmk-admin-token";

type Staged = Record<string, string>;

export function LiveEditOverlay() {
  const { reload } = useLiveContent();
  const [active, setActive] = useState(false);
  const [checked, setChecked] = useState(false);
  /** why the overlay is NOT active on a ?live=1 page — surfaced as a visible banner
   *  so a missing admin session is never a silent no-op */
  const [blocked, setBlocked] = useState<"no-token" | "unauthorized" | "error" | null>(null);
  const [editableCount, setEditableCount] = useState(0);
  const [selected, setSelected] = useState<{ el: HTMLElement; label: string } | null>(null);
  const [editing, setEditing] = useState<HTMLElement | null>(null);
  const [staged, setStaged] = useState<Staged>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const stagedRef = useRef<Staged>({});
  stagedRef.current = staged;

  /* ── activation ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("live") !== "1") { setChecked(true); return; }
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token) { setBlocked("no-token"); setChecked(true); return; }
    fetch("/api/admin/site-content", { headers: { authorization: `Bearer ${token}` } })
      .then((r) => {
        if (r.ok) setActive(true);
        else if (r.status === 401) setBlocked("unauthorized");
        else setBlocked("error");
      })
      .catch(() => setBlocked("error"))
      .finally(() => setChecked(true));
  }, []);

  /* count editable texts on this page + pulse them once so coverage is obvious */
  useEffect(() => {
    if (!active) return;
    const count = () => document.querySelectorAll("[data-live-key]").length;
    setEditableCount(count());
    document.body.setAttribute("data-live-pulse", "1");
    const t1 = setTimeout(() => document.body.removeAttribute("data-live-pulse"), 2200);
    const mo = new MutationObserver(() => setEditableCount(count()));
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { clearTimeout(t1); mo.disconnect(); };
  }, [active]);

  const exit = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("live");
    window.history.replaceState({}, "", url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : "") + url.hash);
    setActive(false);
    setSelected(null);
    setEditing(null);
    document.querySelectorAll("[data-live-editing],[data-live-hover],[data-live-selected]").forEach((el) => {
      el.removeAttribute("data-live-editing");
      el.removeAttribute("data-live-hover");
      el.removeAttribute("data-live-selected");
    });
  }, []);

  /* ── style + listeners ── */
  useEffect(() => {
    if (!active) return;
    const style = document.createElement("style");
    style.id = "dmk-live-edit-style";
    style.textContent = `
      [data-live-key] { cursor: default; }
      body[data-live-on] [data-live-key] { outline: 1.5px dashed rgba(250,204,21,.55); outline-offset: 2px; transition: outline-color .15s; }
      body[data-live-on] [data-live-key][data-live-hover] { outline: 2px dashed #facc15; outline-offset: 2px; background: rgba(250,204,21,.08); }
      body[data-live-on] [data-live-key][data-live-selected] { outline: 2.5px solid #111; outline-offset: 3px; background: rgba(250,204,21,.14); }
      body[data-live-on] [data-live-key][data-live-editing] { outline: 2.5px solid #16a34a; outline-offset: 3px; background: rgba(22,163,74,.08); cursor: text; }
      body[data-live-on] { -webkit-user-select: none; user-select: none; }
      body[data-live-on] [data-live-editing] { -webkit-user-select: text; user-select: text; }
      /* one-time coverage pulse: every editable text flashes yellow so the admin instantly
         sees what can be clicked — fades to the steady dashed outline */
      @keyframes dmk-live-pulse { 0%, 100% { outline-color: rgba(250,204,21,.55); background: transparent; } 40% { outline: 2.5px dashed #f59e0b; outline-offset: 2px; background: rgba(245,158,11,.14); } }
      body[data-live-pulse] [data-live-key] { animation: dmk-live-pulse 1.9s ease-in-out .1s 1; }
    `;
    document.head.appendChild(style);
    document.body.setAttribute("data-live-on", "1");
    return () => {
      document.getElementById("dmk-live-edit-style")?.remove();
      document.body.removeAttribute("data-live-on");
      document.body.removeAttribute("data-live-pulse");
    };
  }, [active]);

  const commitEdit = useCallback((el: HTMLElement) => {
    const key = el.getAttribute("data-live-key") || "";
    const next = (el.textContent || "").replace(/\u00a0/g, " ").trim();
    // "unchanged" base = the value the element rendered with (registry default + override,
    // or the current DB text for slider:* marks) — NOT the raw registry default
    const def = el.getAttribute("data-live-default") ?? LIVE_DEFAULTS[key] ?? "";
    el.removeAttribute("data-live-editing");
    el.contentEditable = "false";
    setEditing(null);
    if (next === def) {
      el.textContent = def;
      setStaged((s) => { const c = { ...s }; delete c[key]; return c; });
    } else if (next) {
      el.textContent = next;
      setStaged((s) => ({ ...s, [key]: next }));
    } else {
      el.textContent = def;
      setStaged((s) => ({ ...s, [key]: "" })); // cleared → reset to default
    }
  }, [setStaged]);

  useEffect(() => {
    if (!active) return;

    const liveEl = (t: EventTarget | null): HTMLElement | null =>
      t instanceof HTMLElement ? t.closest<HTMLElement>("[data-live-key]") : null;

    const onOver = (e: MouseEvent) => {
      const el = liveEl(e.target);
      if (el && el !== editing) {
        el.setAttribute("data-live-hover", "1");
        el.title = "Double-click to edit";
      }
    };
    const onOut = (e: MouseEvent) => {
      const el = liveEl(e.target);
      if (el) {
        el.removeAttribute("data-live-hover");
        el.removeAttribute("title");
      }
    };
    const onClick = (e: MouseEvent) => {
      if (editing) return; // typing — don't hijack
      const el = liveEl(e.target);
      document.querySelectorAll("[data-live-selected]").forEach((x) => x.removeAttribute("data-live-selected"));
      if (!el) { setSelected(null); return; }
      e.preventDefault();
      e.stopPropagation();
      el.setAttribute("data-live-selected", "1");
      const k = el.getAttribute("data-live-key") || "";
      setSelected({ el, label: liveDef(k)?.label || k.replace(/^slider:\d+:/, "Hero slide — ") });
    };
    const onDblClick = (e: MouseEvent) => {
      const el = liveEl(e.target);
      if (!el || editing) return;
      e.preventDefault();
      e.stopPropagation();
      el.removeAttribute("data-live-selected");
      setSelected(null);
      el.setAttribute("data-live-editing", "1");
      el.contentEditable = "true";
      el.focus();
      // select all text for quick replace
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      setEditing(el);
    };
    const onKey = (e: KeyboardEvent) => {
      if (editing && (e.key === "Enter" || e.key === "Escape")) {
        e.preventDefault();
        if (e.key === "Escape") {
          editing.textContent = editing.getAttribute("data-live-default") ?? LIVE_DEFAULTS[editing.getAttribute("data-live-key") || ""] ?? "";
          editing.removeAttribute("data-live-editing");
          editing.contentEditable = "false";
          setEditing(null);
        } else {
          commitEdit(editing);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (Object.keys(stagedRef.current).length) saveRef.current?.();
      }
    };

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("click", onClick, true);
    document.addEventListener("dblclick", onDblClick);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dblclick", onDblClick);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [active, editing, commitEdit]);

  /* ── save ── */
  const save = useCallback(async () => {
    const changes = Object.entries(stagedRef.current).map(([key, value]) => ({ key, value }));
    if (!changes.length) return;
    setSaving(true);
    try {
      const token = localStorage.getItem(ADMIN_TOKEN_KEY) || "";
      const res = await fetch("/api/admin/site-content", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ changes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setStaged({});
      const touchedHero = changes.some((c) => c.key.startsWith("slider:"));
      if (touchedHero) {
        // hero copy comes from the catalog API (15s edge cache) — a reload picks up the
        // fresh slide text; the toast tells the admin what just happened
        setToast({ ok: true, msg: `${data.saved ?? changes.length} text${data.saved === 1 ? "" : "s"} saved — refreshing…` });
        setTimeout(() => window.location.reload(), 900);
      } else {
        await reload();
        setToast({ ok: true, msg: `${data.saved ?? changes.length} text${data.saved === 1 ? "" : "s"} saved — live on the website` });
      }
    } catch (e) {
      setToast({ ok: false, msg: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3500);
    }
  }, [reload]);
  const saveRef = useRef<(() => void) | null>(null);
  saveRef.current = save;

  /* ── unsaved guard ── */
  useEffect(() => {
    if (!active) return;
    const guard = (e: BeforeUnloadEvent) => {
      if (Object.keys(stagedRef.current).length) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [active]);

  /* ?live=1 without a working admin session — never silent, always explain */
  if (checked && !active && blocked) {
    const msg =
      blocked === "no-token"
        ? "Live Edit needs the admin portal sign-in in this browser."
        : blocked === "unauthorized"
          ? "Admin session expired — sign in again to use Live Edit."
          : "Live Edit could not reach the admin API. Try again shortly.";
    return (
      <div className="fixed left-1/2 top-4 z-[99999] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3 shadow-2xl">
        <span className="text-sm font-black text-yellow-900">✏️ {msg}</span>
        <a
          href="/admin"
          className="rounded-lg bg-black px-3 py-1.5 text-xs font-bold text-yellow-400 hover:bg-gray-800"
        >
          Open Admin Portal
        </a>
        <button
          onClick={() => { const u = new URL(window.location.href); u.searchParams.delete("live"); window.history.replaceState({}, "", u.pathname + u.search); setBlocked(null); }}
          className="rounded-lg border border-yellow-400 px-2.5 py-1.5 text-xs font-bold text-yellow-800 hover:bg-yellow-100"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (!checked || !active) return null;
  const pending = Object.keys(staged).length;

  const resetSelected = () => {
    if (!selected) return;
    const key = selected.el.getAttribute("data-live-key") || "";
    const def = selected.el.getAttribute("data-live-default") ?? LIVE_DEFAULTS[key] ?? "";
    selected.el.textContent = def;
    if (def.trim()) setStaged((s) => ({ ...s, [key]: "" })); // empty override → back to default
    else setStaged((s) => { const c = { ...s }; delete c[key]; return c; }); // slider field cleared
    setSelected(null);
    selected.el.removeAttribute("data-live-selected");
  };

  const toolbarFor = () => {
    if (!selected) return null;
    const r = selected.el.getBoundingClientRect();
    const top = Math.max(8, r.top - 44);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - 320);
    return (
      <div className="fixed z-[99999] flex items-center gap-1.5 rounded-xl border border-gray-700 bg-gray-950 px-2 py-1.5 shadow-2xl" style={{ top, left }}>
        <span className="max-w-[150px] truncate text-[10px] font-bold text-yellow-400">{selected.label}</span>
        <button
          onClick={() => {
            const el = selected.el;
            el.removeAttribute("data-live-selected");
            setSelected(null);
            el.setAttribute("data-live-editing", "1");
            el.contentEditable = "true";
            el.focus();
            const range = document.createRange();
            range.selectNodeContents(el);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            setEditing(el);
          }}
          className="rounded-lg bg-yellow-400 px-2.5 py-1 text-[10px] font-black text-black hover:bg-yellow-300"
        >
          Edit text
        </button>
        <button onClick={resetSelected} className="rounded-lg border border-gray-600 px-2.5 py-1 text-[10px] font-bold text-gray-300 hover:bg-gray-800">Reset</button>
        <button
          onClick={() => { selected.el.removeAttribute("data-live-selected"); setSelected(null); }}
          className="rounded-lg px-1.5 py-1 text-[10px] font-bold text-gray-500 hover:text-white"
        >
          ✕
        </button>
      </div>
    );
  };

  return (
    <>
      {toolbarFor()}
      {/* bottom status bar — mirrors live-edit's editor bar */}
      <div className="fixed bottom-4 right-4 z-[99999] flex items-center gap-2 rounded-2xl border border-gray-700 bg-gray-950 px-3.5 py-2.5 shadow-2xl">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-yellow-400" />
        </span>
        <div className="mr-1">
          <p className="text-[11px] font-black leading-none text-white">Live Edit ON</p>
          <p className="mt-0.5 text-[9px] leading-none text-gray-500">
            {pending
              ? `${pending} unsaved change${pending === 1 ? "" : "s"}`
              : `${editableCount} editable text${editableCount === 1 ? "" : "s"} on this page — double-click any`}
          </p>
        </div>
        <button
          onClick={save}
          disabled={!pending || saving}
          className="rounded-lg bg-yellow-400 px-3 py-1.5 text-[10px] font-black text-black hover:bg-yellow-300 disabled:opacity-40"
        >
          {saving ? "Saving…" : `Save ${pending || ""}`}
        </button>
        <button onClick={exit} className="rounded-lg border border-gray-600 px-3 py-1.5 text-[10px] font-bold text-gray-300 hover:bg-gray-800">
          Exit
        </button>
      </div>
      {toast && (
        <div className={`fixed bottom-20 right-4 z-[99999] rounded-xl px-4 py-2.5 text-xs font-bold shadow-2xl ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
