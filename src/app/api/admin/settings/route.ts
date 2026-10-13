import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const rows = await db.setting.findMany();
  return NextResponse.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
}

export async function PUT(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;
  const body = await req.json();
  const entries = Object.entries(body as Record<string, string>);
  for (const [key, value] of entries) {
    await db.setting.upsert({ where: { key }, create: { key, value: String(value) }, update: { value: String(value) } });
  }
  await db.activityLog.create({ data: { action: "UPDATE", entity: "settings", detail: `Website settings updated (${entries.map(([k]) => k).join(", ").slice(0, 120)})` } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  return PUT(req);
}
