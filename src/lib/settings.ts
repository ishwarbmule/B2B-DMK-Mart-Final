/**
 * Key-value application settings (Setting table) — the single, dependency-free
 * settings helper for the whole app.
 *
 * Used by the direct ERP MySQL integration (Admin → ERP Data: credentials,
 * ticked table/column mappings, sync cursor), the SMS/WhatsApp config and the
 * cron secret. Formerly hosted the Universal REST API keys — that integration
 * was retired when the owner shared the ERP MySQL database directly.
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
