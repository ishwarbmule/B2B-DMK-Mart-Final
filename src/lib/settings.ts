/**
 * Key-value application settings (Setting table) — the single, dependency-free
 * settings helper for the whole app.
 *
 * Used by the Universal Inventory API integration (Admin → Inventory Sync), the
 * signed ERP webhook, the daily delta cron, SMS/WhatsApp config and the cron
 * secret. Previously this lived in lib/erp.ts together with the direct-ERP-MySQL
 * connector — that connector was retired: products now sync exclusively through
 * the dmkmarterp.in Universal REST API (API key + push secret stored here).
 */
import { db } from "@/lib/db";

/** Read one setting (trimmed) or fall back to the provided default. */
export async function getSetting(key: string, fallback = ""): Promise<string> {
  try {
    const row = await db.setting.findUnique({ where: { key } });
    return row?.value?.trim() ?? fallback;
  } catch {
    return fallback;
  }
}

/** Upsert one setting. Empty string deletes the row (keeps the table clean). */
export async function setSetting(key: string, value: string): Promise<void> {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    await db.setting.deleteMany({ where: { key } });
    return;
  }
  await db.setting.upsert({
    where: { key },
    create: { key, value: trimmed },
    update: { value: trimmed },
  });
}

/** Append one row to the sync history log (Admin → Inventory Sync → History). */
export async function logSyncEvent(data: {
  direction: string;
  action: string;
  status?: string;
  message?: string;
  seen?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  durationMs?: number;
}) {
  await db.syncEvent.create({
    data: {
      direction: data.direction,
      action: data.action,
      status: data.status ?? "OK",
      message: (data.message ?? "").slice(0, 500),
      productsSeen: data.seen ?? 0,
      created: data.created ?? 0,
      updated: data.updated ?? 0,
      skipped: data.skipped ?? 0,
      durationMs: data.durationMs ?? 0,
    },
  });
}
