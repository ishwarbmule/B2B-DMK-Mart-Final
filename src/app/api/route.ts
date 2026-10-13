import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, service: "DMK Mart B2B API", version: "2.0" });
}
