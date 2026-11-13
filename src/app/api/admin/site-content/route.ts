/**
 * /api/admin/site-content — Live Visual Editor persistence.
 *  GET            → all SiteContent rows joined with the registry + hero slider rows
 *  POST { changes } → batch upsert; value "" deletes the row (back to default)
 *
 *  Key namespaces:
 *  - "home.*"          → SiteContent table (registry-backed overrides)
 *  - "slider:<id>:<field>" → Slider table direct write (hero slide copy:
 *    kicker | heading | content | buttonText | tagline). Plain text only —
 *    the multicolour *star* heading syntax stays a Hero Section (Sliders) admin feature.
 *
 * Self-healing: if the SiteContent table is missing on a fresh MySQL deploy
 * (schema pushed only on next `prisma db push`), the first admin request creates
 * it idempotently so the editor works immediately.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { LIVE_TEXTS } from "@/lib/live-content";

export const dynamic = "force-dynamic";

let ensured = false;

const SLIDER_FIELDS = ["kicker", "heading", "content", "buttonText", "tagline"] as const;
type SliderField = (typeof SLIDER_FIELDS)[number];

function parseSliderKey(key: string): { id: string; field: SliderField } | null {
  const m = /^slider:([A-Za-z0-9]+):(\w+)$/.exec(key);
  if (!m) return null;
  const [, id, field] = m;
  if (!SLIDER_FIELDS.includes(field as SliderField)) return null;
  return { id, field: field as SliderField };
}

/** SQLite twin locally, MySQL in production — detect by asking for a SQLite-only function. */
async function isSqliteRuntime(): Promise<boolean> {
  try {
    await db.$queryRawUnsafe("SELECT sqlite_version() AS v");
    return true;
  } catch {
    return false;
  }
}

async function ensureTable(): Promise<void> {
  if (ensured) return;
  const sqlite = await isSqliteRuntime();
  if (sqlite) {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "SiteContent" (
         "id" TEXT NOT NULL PRIMARY KEY,
         "key" TEXT NOT NULL,
         "page" TEXT NOT NULL DEFAULT 'home',
         "label" TEXT NOT NULL DEFAULT '',
         "value" TEXT NOT NULL,
         "updatedAt" DATETIME NOT NULL
       )`
    );
    await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "SiteContent_key_key" ON "SiteContent"("key")`);
  } else {
    await db.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS \`SiteContent\` (
         \`id\` VARCHAR(191) NOT NULL,
         \`key\` VARCHAR(191) NOT NULL,
         \`page\` VARCHAR(191) NOT NULL DEFAULT 'home',
         \`label\` VARCHAR(191) NOT NULL DEFAULT '',
         \`value\` TEXT NOT NULL,
         \`updatedAt\` DATETIME(3) NOT NULL,
         PRIMARY KEY (\`id\`),
         UNIQUE INDEX \`SiteContent_key_key\` (\`key\`)
       ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  }
  ensured = true;
}

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    await ensureTable();
    const rows = await db.siteContent.findMany({ orderBy: { key: "asc" } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const sliders = await db.slider.findMany({ orderBy: { sortOrder: "asc" } });
    const sliderRows = sliders.flatMap((s, i) =>
      SLIDER_FIELDS.map((field) => ({
        key: `slider:${s.id}:${field}`,
        page: "hero",
        label: `Slide ${i + 1}${s.heading ? ` — ${s.heading.slice(0, 24)}` : ""} · ${field}`,
        defaultValue: (s as unknown as Record<string, unknown>)[field] as string ?? "",
        multiline: field === "content" || field === "tagline",
        value: (s as unknown as Record<string, unknown>)[field] as string ?? "",
        updatedAt: null,
        dbRow: true,
      })),
    );
    return NextResponse.json({
      rows: [
        ...LIVE_TEXTS.map((def) => {
          const row = byKey.get(def.key);
          return {
            key: def.key,
            page: def.page,
            label: def.label,
            defaultValue: def.value,
            multiline: !!def.multiline,
            value: row?.value ?? "",
            updatedAt: row?.updatedAt ?? null,
            dbRow: false,
          };
        }),
        ...sliderRows,
      ],
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Load failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  try {
    await ensureTable();
    const { changes } = (await req.json()) as { changes?: { key: string; value: string; label?: string; page?: string }[] };
    if (!Array.isArray(changes) || !changes.length) {
      return NextResponse.json({ error: "No changes" }, { status: 400 });
    }
    let saved = 0;
    for (const c of changes) {
      const value = String(c.value ?? "");
      const sliderKey = parseSliderKey(c.key);
      if (sliderKey) {
        // hero slide copy — direct Slider write (plain text; empty value clears the field)
        try {
          await db.slider.update({ where: { id: sliderKey.id }, data: { [sliderKey.field]: value } });
          saved++;
        } catch (err) {
          console.error("[site-content] slider update failed", c.key, err instanceof Error ? err.message : err);
        }
        continue;
      }
      const def = LIVE_TEXTS.find((t) => t.key === c.key);
      if (!def) continue; // only registry keys are writable
      if (!value.trim()) {
        await db.siteContent.deleteMany({ where: { key: def.key } }); // reset to default
      } else {
        await db.siteContent.upsert({
          where: { key: def.key },
          create: { key: def.key, value, page: def.page, label: def.label },
          update: { value },
        });
      }
      saved++;
    }
    return NextResponse.json({ ok: true, saved });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 500 });
  }
}
