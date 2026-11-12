/** GET /api/site-content — public: merged live-content map for the storefront overlay & LiveText. */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { LIVE_DEFAULTS } from "@/lib/live-content";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.siteContent.findMany({ select: { key: true, value: true } });
    const overrides: Record<string, string> = {};
    for (const r of rows) {
      if (r.value && r.value.trim()) overrides[r.key] = r.value; // empty row = back to default
    }
    return NextResponse.json({ overrides, defaults: LIVE_DEFAULTS });
  } catch {
    // table missing / db hiccup — serve defaults so the storefront never breaks
    return NextResponse.json({ overrides: {}, defaults: LIVE_DEFAULTS });
  }
}
