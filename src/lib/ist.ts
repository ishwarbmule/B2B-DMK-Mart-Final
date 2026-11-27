/**
 * Indian Standard Time helpers — the owner's rule: this business runs on IST.
 * Every date the customer or admin sees is formatted in Asia/Kolkata, no
 * matter which timezone the server or browser happens to sit in.
 */

export const IST_TZ = "Asia/Kolkata";

const DT = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

const D_ONLY = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const T_ONLY = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

const fmt = (d: Date | string | number | null | undefined, f: Intl.DateTimeFormat, fallback = "—") => {
  if (d === null || d === undefined || d === "") return fallback;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return fallback;
  return f.format(date);
};

/** "27 Nov 2026, 05:00 am" */
export function istDateTime(d: Date | string | number | null | undefined, fallback = "—"): string {
  return fmt(d, DT, fallback);
}

/** "27 Nov 2026" */
export function istDate(d: Date | string | number | null | undefined, fallback = "—"): string {
  return fmt(d, D_ONLY, fallback);
}

/** "05:00 am" */
export function istTime(d: Date | string | number | null | undefined, fallback = "—"): string {
  return fmt(d, T_ONLY, fallback);
}

/** YYYY-MM-DD day key in IST (day buckets must not shift at 5:30 AM). */
export function istDayKey(d: Date | string | number | null | undefined): string {
  if (d === null || d === undefined || d === "") return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date); // en-CA gives YYYY-MM-DD
  return parts;
}

/** The UTC instant of "today 00:00 IST" and "now" boundaries for range queries. */
export function istDayStart(date: Date = new Date()): Date {
  const key = istDayKey(date); // YYYY-MM-DD in IST
  // IST is UTC+5:30, so midnight IST = 18:30 UTC the previous day
  return new Date(`${key}T00:00:00+05:30`);
}
