/** POST /api/auth/change-password — customer sets a new password.
 *  Used by the mandatory "set your new password" popup shown to migrated accounts
 *  (mustChangePassword = true) and by the account security editor.
 *  Auth: x-customer-token header (same HMAC token as every customer API).
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { customerFromReq } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const schema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(6, "New password must be at least 6 characters").max(72),
});

export async function POST(req: NextRequest) {
  const customerId = customerFromReq(req);
  if (!customerId) return NextResponse.json({ error: "Please login first" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) return NextResponse.json({ error: "Session expired — login again" }, { status: 401 });

  if (customer.password && customer.password !== sha(currentPassword)) {
    return NextResponse.json({ error: "Your current password is incorrect. Please try again." }, { status: 400 });
  }
  if (customer.password && customer.password === sha(newPassword)) {
    return NextResponse.json({ error: "Choose a password different from the current one." }, { status: 400 });
  }

  await db.customer.update({
    where: { id: customerId },
    data: { password: sha(newPassword), mustChangePassword: false },
  });

  return NextResponse.json({ ok: true, message: "Password updated — it is now active for all your future logins." });
}
