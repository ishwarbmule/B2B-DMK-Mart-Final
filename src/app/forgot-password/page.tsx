"use client";

/**
 * /forgot-password — PUBLIC reset wizard (proxy.ts lists it as a public path).
 * Used to live only inside the gated /account page, so the "Forgot password?"
 * link on /login just bounced straight back to /login and reset never worked.
 * Flow: identify account → OTP (RESET) → verify → set a new password.
 * Demo mode note: until a WhatsApp/SMS gateway is configured the OTP is shown
 * on screen (devOtp) — same behaviour as the /account and /login flows.
 */
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, Phone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const INPUT = "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-400/30";
const BTN = "h-11 w-full rounded-full bg-black text-sm font-bold uppercase tracking-wide text-yellow-400 transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50";
const LINK_CLS = "font-semibold text-yellow-700 underline-offset-2 hover:underline";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"identify" | "otp" | "newpass" | "done">("identify");
  const [identifier, setIdentifier] = useState("");
  const [masked, setMasked] = useState("");
  const [code, setCode] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doIdentify = async (e: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/identify", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const d = await res.json();
      if (!res.ok || !d.found) { setError(d.error || "We could not find that account. Check the mobile number or email."); return; }
      setMasked(d.masked || identifier);
      setStep("otp");
      sendOtp();
    } catch {
      setError("Network problem — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, purpose: "RESET" }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Could not send the code. Try again in a minute."); return; }
      setDevOtp(d.devOtp || "");
      toast.success(`Verification code sent to ${d.masked || masked}`);
    } catch {
      setError("Network problem — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const doVerify = async (e: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, code, purpose: "RESET" }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "That code is invalid or has expired."); return; }
      setResetToken(d.resetToken || "");
      setStep("newpass");
    } catch {
      setError("Network problem — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const doNewPassword = async (e: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ resetToken, password }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Could not update the password. Start again."); return; }
      setStep("done");
    } catch {
      setError("Network problem — please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <div className="border-b-2 border-yellow-400 bg-black py-4">
        <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-4">
          <Image src="/dmk-logo.png" alt="DMK Mart" width={40} height={40} className="h-10 w-10 rounded-full" unoptimized />
          <div>
            <p className="text-base font-black leading-tight text-white">DMK <span className="text-yellow-400">Mart</span></p>
            <p className="text-[10px] text-gray-400">B2B Wholesale Marketplace</p>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        {step === "done" ? (
          <div className="rounded-2xl border bg-white p-6 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h1 className="mt-3 text-lg font-black text-gray-900">Password updated!</h1>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              Your new password is saved. Sign in with it and continue ordering.
            </p>
            <Link href="/login" className="mt-5 inline-block rounded-full bg-black px-6 py-2.5 text-sm font-bold text-yellow-400 hover:bg-gray-900">
              Go to Sign in
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-yellow-600" />
              <h1 className="text-lg font-black text-gray-900">Reset your password</h1>
            </div>

            {/* progress rail */}
            <div className="mb-5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
              {(["identify", "otp", "newpass"] as const).map((s, i) => {
                const idx = { identify: 0, otp: 1, newpass: 2 }[s];
                const cur = { identify: 0, otp: 1, newpass: 2 }[step];
                const active = idx <= cur;
                return (
                  <div key={s} className="flex items-center gap-2">
                    {i > 0 && <span className={`h-px w-6 ${active ? "bg-yellow-500" : "bg-gray-300"}`} />}
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full ${active ? "bg-black text-yellow-400" : "bg-gray-200 text-gray-500"}`}>{idx + 1}</span>
                    <span className={active ? "text-gray-900" : "text-gray-400"}>{s === "identify" ? "Account" : s === "otp" ? "Verify" : "New password"}</span>
                  </div>
                );
              })}
            </div>

            {step === "identify" && (
              <form onSubmit={doIdentify} className="space-y-3">
                <div>
                  <label className="mb-1 block text-[13px] font-bold text-gray-900">Mobile number or email</label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="9876543210 or you@shop.com"
                      className={`${INPUT} pl-9`} inputMode="text" autoComplete="username" required />
                  </div>
                </div>
                {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] leading-snug text-red-700" role="alert">{error}</div>}
                <button type="submit" disabled={busy} className={BTN}>{busy ? "Checking…" : "Send verification code"}</button>
                <p className="text-center text-xs text-gray-500">
                  Remembered it after all? <Link href="/login" className={LINK_CLS}>Back to sign in</Link>
                </p>
              </form>
            )}

            {step === "otp" && (
              <form onSubmit={doVerify} className="space-y-3">
                <p className="rounded-lg bg-yellow-50 p-3 text-[13px] leading-relaxed text-gray-700">
                  We sent a 6-digit code to <b>{masked}</b>.
                  {devOtp && (
                    <span className="mt-1 block text-[12px]">
                      Demo gateway active — your code is <b className="font-mono text-base tracking-[0.3em] text-gray-900">{devOtp}</b>
                    </span>
                  )}
                </p>
                <div>
                  <label className="mb-1 block text-[13px] font-bold text-gray-900">Verification code</label>
                  <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••"
                    className={`${INPUT} text-center font-mono text-lg tracking-[0.5em]`} inputMode="numeric" autoFocus required />
                </div>
                {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] leading-snug text-red-700" role="alert">{error}</div>}
                <button type="submit" disabled={busy || code.length !== 6} className={BTN}>{busy ? "Verifying…" : "Verify code"}</button>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <button type="button" onClick={() => setStep("identify")} className="inline-flex items-center gap-1 hover:text-gray-800">
                    <ArrowLeft className="h-3 w-3" /> Change number
                  </button>
                  <button type="button" onClick={sendOtp} disabled={busy} className="inline-flex items-center gap-1 hover:text-gray-800">
                    <ShieldCheck className="h-3 w-3" /> Resend code
                  </button>
                </div>
              </form>
            )}

            {step === "newpass" && (
              <form onSubmit={doNewPassword} className="space-y-3">
                <div>
                  <label className="mb-1 block text-[13px] font-bold text-gray-900">New password</label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters" className={`${INPUT} pl-9 pr-10`} autoComplete="new-password" required />
                    <button type="button" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[13px] font-bold text-gray-900">Confirm new password</label>
                  <input type={showPassword ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    className={INPUT} autoComplete="new-password" required />
                </div>
                {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] leading-snug text-red-700" role="alert">{error}</div>}
                <button type="submit" disabled={busy} className={BTN}>{busy ? "Saving…" : "Set new password"}</button>
              </form>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 py-4 text-center text-[11px] text-gray-500">
        © 2026 DMK Mart · Wholesale marketplace for verified B2B buyers
      </div>
    </div>
  );
}
