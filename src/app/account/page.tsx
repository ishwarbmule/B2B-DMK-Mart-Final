"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle, ArrowLeft, Building2, CheckCircle2, Eye, EyeOff, KeyRound,
  LogOut, Package, ShieldCheck, User,
} from "lucide-react";
import { toast } from "sonner";
import { StoreChrome } from "@/components/dmk/store-chrome";
import { useHydrated } from "@/hooks/use-hydrated";
import { formatINR } from "@/lib/store";
import { clearCustomerToken, getCustomerToken, setCustomerToken } from "@/lib/customer-session";
import { Checkbox } from "@/components/ui/checkbox";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

type Customer = {
  id: string; name: string; shopName: string; phone: string; email: string;
  customerType: string; tier: string; status: string; city: string; gstin: string; pincode?: string;
  orders: number; totalSpent: number;
};

type NearestWarehouse = { id: string; name: string; city: string; address: string; phone: string } | null;

type RecentOrder = { id: string; invoiceNo: string; grandTotal: number; status: string; createdAt: string; otp?: string };

type Identity = { identifier: string; kind: "phone" | "email"; masked: string; name: string; shopName: string };

type Step = "identify" | "password" | "otp" | "newpass" | "create" | "registered";

const TYPES = [
  { key: "RETAILER", label: "Retailer", hint: "Shop counter resale", icon: User },
  { key: "SEMI_WHOLESALE", label: "Semi-Wholesaler", hint: "Sub-distribution resale", icon: Package },
  { key: "WHOLESALE", label: "Wholesaler", hint: "Bulk resale", icon: Building2 },
  { key: "DISTRIBUTOR", label: "Distributor", hint: "Territory distribution", icon: Package },
];

const BTN_PRIMARY = "h-11 w-full rounded-full bg-black text-sm font-bold uppercase tracking-wide text-yellow-400 transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_OUTLINE = "h-11 w-full rounded-full border border-gray-300 bg-white text-sm font-bold text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50";
const INPUT = "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-400/30";
const LABEL = "mb-1 block text-[13px] font-bold text-gray-900";
const LINK = "font-semibold text-yellow-700 underline-offset-2 hover:underline";

const emptyReg = { name: "", shopName: "", phone: "", email: "", password: "", confirm: "", customerType: "RETAILER", gstin: "", city: "", pincode: "" };

function AlertBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] leading-snug text-red-700" role="alert">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function NoticeBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[13px] leading-snug text-emerald-800" role="status">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
      <span className="h-px flex-1 bg-gray-200" />
      {label}
      <span className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

function AccountInner() {
  const hydrated = useHydrated();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [step, setStep] = useState<Step>("identify");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [nearest, setNearest] = useState<NearestWarehouse>(null);
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // sign-in state
  const [idValue, setIdValue] = useState("");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  // otp state
  const [otpPurpose, setOtpPurpose] = useState<"LOGIN" | "RESET">("LOGIN");
  const [code, setCode] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [resetToken, setResetToken] = useState("");
  const [newPwd, setNewPwd] = useState({ p: "", c: "" });

  // registration state
  const [reg, setReg] = useState(emptyReg);
  const [regErrors, setRegErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const token = getCustomerToken();
    if (token) loadMe(token);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const loadMe = async (token: string) => {
    try {
      const r = await fetch("/api/auth/me", { headers: { "x-customer-token": token } });
      if (!r.ok) return clearCustomerToken();
      const d = await r.json();
      if (d?.customer) {
        setCustomer(d.customer);
        setNearest(d.nearestWarehouse ?? null);
        setOrders(d.recentOrders ?? []);
      } else clearCustomerToken();
    } catch {
      /* network hiccup — stay logged out silently */
    }
  };

  const finishLogin = async (token: string, shop: string) => {
    setCustomerToken(token, remember);
    await loadMe(token);
    toast.success(`Welcome back, ${shop}!`);
    if (next && next.startsWith("/")) router.push(next);
    router.refresh();
  };

  const logout = () => {
    clearCustomerToken();
    setCustomer(null);
    setOrders([]);
    setStep("identify");
    toast("Signed out of your B2B account");
  };

  /* ── step 1: identify account (mobile or email) ── */
  const doIdentify = async () => {
    if (!idValue.trim()) return setError("Enter your mobile number or email address.");
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch("/api/auth/identify", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: idValue.trim() }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Something went wrong. Please try again.");
        return;
      }
      const id: Identity = { identifier: idValue.trim(), kind: d.kind, masked: d.masked, name: d.name, shopName: d.shopName };
      setIdentity(id);
      if (d.hasPassword) {
        setPassword("");
        setStep("password");
      } else {
        // Account exists but has no password (e.g. created offline) — go straight to OTP.
        toast.info("No password is set for this account. We sent you a login code.");
        await sendOtp("LOGIN", id.identifier);
      }
    } finally {
      setBusy(false);
    }
  };

  /* ── sign in with password ── */
  const doLogin = async () => {
    if (!password) return setError("Enter your password.");
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: identity?.identifier ?? idValue.trim(), password }),
      });
      const d = await res.json();
      if (!res.ok) return setError(d.error ?? "Sign-in failed. Please try again.");
      await finishLogin(d.token, d.customer.shopName || d.customer.name);
    } finally {
      setBusy(false);
    }
  };

  /* ── OTP: send / resend ── */
  const sendOtp = async (purpose: "LOGIN" | "RESET", identifier?: string) => {
    const id = identifier ?? identity?.identifier ?? idValue.trim();
    if (!id) return setError("Enter your mobile number or email address first.");
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: id, purpose }),
      });
      const d = await res.json();
      if (!res.ok) return setError(d.error ?? "Could not send the code. Please try again.");
      setOtpPurpose(purpose);
      setCode("");
      setDevOtp(d.devOtp ?? null);
      setCooldown(d.cooldownSec ?? 45);
      setStep("otp");
    } finally {
      setBusy(false);
    }
  };

  /* ── OTP: verify (login or reset grant) ── */
  const doVerify = async () => {
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code to continue.");
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: identity?.identifier ?? idValue.trim(), code, purpose: otpPurpose }),
      });
      const d = await res.json();
      if (!res.ok) return setError(d.error ?? "That code is invalid or has expired.");
      if (otpPurpose === "RESET") {
        setResetToken(d.resetToken);
        setNewPwd({ p: "", c: "" });
        setStep("newpass");
      } else {
        await finishLogin(d.token, identity?.shopName || identity?.name || "there");
      }
    } finally {
      setBusy(false);
    }
  };

  // auto-submit when the 6th digit lands (Flipkart-style)
  useEffect(() => {
    if (step === "otp" && code.length === 6 && !busy) doVerify();
  }, [code]);

  /* ── set new password after OTP reset ── */
  const doNewPassword = async () => {
    if (newPwd.p.length < 6) return setError("Passwords must be at least 6 characters.");
    if (newPwd.p !== newPwd.c) return setError("The two passwords do not match.");
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ resetToken, password: newPwd.p }),
      });
      const d = await res.json();
      if (!res.ok) return setError(d.error ?? "Could not update password. Please try again.");
      toast.success("Password updated");
      setNotice("Password updated. Sign in with your new password.");
      setPassword("");
      setStep("password");
    } finally {
      setBusy(false);
    }
  };

  /* ── registration ── */
  const doRegister = async () => {
    const e: Record<string, string> = {};
    if (reg.shopName.trim().length < 2) e.shopName = "Enter your business / shop name";
    if (reg.name.trim().length < 2) e.name = "Enter the contact person name";
    if (!/^[6-9]\d{9}$/.test(reg.phone.trim())) e.phone = "Enter a valid 10-digit Indian mobile number";
    if (reg.email && !/^\S+@\S+\.\S+$/.test(reg.email)) e.email = "Enter a valid email address";
    if (reg.pincode && !/^\d{6}$/.test(reg.pincode)) e.pincode = "Pincode must be 6 digits";
    if (reg.password.length < 6) e.password = "Use at least 6 characters";
    if (reg.password !== reg.confirm) e.confirm = "The two passwords do not match";
    setRegErrors(e);
    if (Object.keys(e).length > 0) return;
    setBusy(true); setError(null);
    try {
      const { confirm: _c, ...payload } = reg;
      const res = await fetch("/api/auth/register", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, phone: reg.phone.trim(), email: reg.email.trim() }),
      });
      const d = await res.json();
      if (!res.ok) return setError(d.error ?? "Registration failed. Please try again.");
      setReg(emptyReg);
      setRegErrors({});
      setStep("registered");
    } finally {
      setBusy(false);
    }
  };

  const goTo = (s: Step) => {
    setError(null);
    setNotice(null);
    setStep(s);
  };

  const maskedDest = identity ? `${identity.masked}` : idValue;

  return (
    <StoreChrome>
      <div className="min-h-[70vh] bg-[#f7f8f8] py-8 md:py-12">
        <div className="mx-auto w-full max-w-[420px] px-3">
          {/* brand mark */}
          <div className="mb-6 flex flex-col items-center">
            <div className="flex h-12 items-center gap-2 rounded-xl bg-black px-5 shadow-sm">
              <span className="text-lg font-black tracking-tight text-white">DMK MART</span>
              <span className="rounded bg-yellow-400 px-1.5 py-0.5 text-[10px] font-black text-black">B2B</span>
            </div>
            <p className="mt-2 text-center text-[11px] text-gray-500">Plastics &amp; appliances for retailers, wholesalers &amp; distributors</p>
          </div>

          {!hydrated ? null : customer ? (
            /* ─────────────── DASHBOARD (signed in) ─────────────── */
            <div className="space-y-5">
              <div className="flex items-center justify-between rounded-2xl border bg-white p-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-yellow-600">{customer.customerType}</p>
                  <h1 className="text-xl font-black text-gray-900">{customer.shopName || customer.name}</h1>
                  <p className="text-xs text-gray-500">{customer.phone} · {customer.city || "—"} {customer.gstin ? `· GSTIN ${customer.gstin}` : ""}</p>
                  {nearest && (
                    <p className="mt-1 text-[11px] font-semibold text-emerald-700">📍 Your nearest DMK Mart warehouse: {nearest.name}{nearest.city ? ` (${nearest.city})` : ""} — pickup available</p>
                  )}
                </div>
                <button onClick={logout} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50">
                  <LogOut className="h-3.5 w-3.5" /> Logout
                </button>
              </div>

              {customer.status !== "APPROVED" && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-bold">Account pending approval</p>
                    <p className="text-xs">Your account is under verification by the DMK Mart team. You will receive a WhatsApp message the moment it is approved.</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border bg-white p-4 text-center">
                  <p className="text-xl font-black text-gray-900">{customer.orders}</p>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Orders</p>
                </div>
                <div className="rounded-2xl border bg-white p-4 text-center">
                  <p className="text-xl font-black text-gray-900">{formatINR(customer.totalSpent)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Lifetime value</p>
                </div>
                <div className="rounded-2xl border bg-white p-4 text-center">
                  <p className="text-xl font-black uppercase text-yellow-600">{customer.tier}</p>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Price tier</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border bg-white">
                <p className="border-b bg-gray-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-600">Recent Orders</p>
                {orders.length === 0 ? (
                  <p className="p-6 text-center text-xs text-gray-400">No orders yet — <Link href="/catalog" className="font-bold text-yellow-600">start ordering →</Link></p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id} className="border-b last:border-0">
                          <td className="px-4 py-2.5 font-bold text-gray-900">{o.invoiceNo}</td>
                          <td className="px-4 py-2.5 text-gray-500">{new Date(o.createdAt).toLocaleDateString("en-IN")}</td>
                          <td className="px-4 py-2.5 font-black">{formatINR(o.grandTotal)}</td>
                          <td className="px-4 py-2.5">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${o.status === "DELIVERED" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>{o.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            /* ─────────────── AUTH CARD ─────────────── */
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              {step === "identify" && (
                <>
                  <h1 className="text-2xl font-black text-gray-900">Sign in</h1>
                  <p className="mb-4 mt-1 text-[13px] text-gray-500">Use your registered mobile number or email</p>
                  {error && <div className="mb-3"><AlertBox>{error}{error.includes("couldn't find") && <> <button onClick={() => goTo("create")} className={LINK}>Create your B2B account →</button></>}</AlertBox></div>}
                  {notice && <div className="mb-3"><NoticeBox>{notice}</NoticeBox></div>}
                  <label className={LABEL} htmlFor="identifier">Mobile number or email</label>
                  <input
                    id="identifier"
                    value={idValue}
                    onChange={(e) => setIdValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !busy && doIdentify()}
                    placeholder="10-digit mobile or email"
                    inputMode="text"
                    autoComplete="username"
                    className={INPUT}
                  />
                  <button onClick={doIdentify} disabled={busy} className={`${BTN_PRIMARY} mt-4`}>
                    {busy ? "Checking…" : "Continue"}
                  </button>
                  <p className="mt-4 text-[12px] leading-relaxed text-gray-500">
                    By continuing, you agree to DMK Mart B2B&apos;s{" "}
                    <Link href="/page/terms-and-conditions" className={LINK}>Conditions of Use</Link> and{" "}
                    <Link href="/page/privacy-policy" className={LINK}>Privacy Notice</Link>.
                  </p>
                  <Divider label="New to DMK Mart?" />
                  <button onClick={() => goTo("create")} className={BTN_OUTLINE}>Create your B2B account</button>
                </>
              )}

              {step === "password" && (
                <>
                  <button onClick={() => goTo("identify")} className="mb-3 flex items-center gap-1 text-xs font-bold text-yellow-700 hover:underline">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                  <h1 className="text-2xl font-black text-gray-900">Welcome back</h1>
                  <p className="mb-3 mt-1 text-[13px] text-gray-500">Hello, {identity?.shopName || identity?.name || "there"} — sign in to continue ordering.</p>
                  <div className="mb-4 flex items-center justify-between rounded-lg bg-gray-100 px-3 py-2 text-xs">
                    <span className="font-semibold text-gray-700">{identity?.masked}</span>
                    <button onClick={() => goTo("identify")} className={LINK}>Change</button>
                  </div>
                  {error && <div className="mb-3"><AlertBox>{error}</AlertBox></div>}
                  {notice && <div className="mb-3"><NoticeBox>{notice}</NoticeBox></div>}
                  <label className={LABEL} htmlFor="password">Password</label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !busy && doLogin()}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className={`${INPUT} pr-10`}
                    />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button onClick={() => sendOtp("RESET")} className={`mt-2 block text-[13px] ${LINK}`}>Forgot your password?</button>
                  <div className="mt-4 flex items-center gap-2">
                    <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} className="data-[state=checked]:border-black data-[state=checked]:bg-black" />
                    <label htmlFor="remember" className="cursor-pointer text-[13px] text-gray-700">Keep me signed in</label>
                  </div>
                  <button onClick={doLogin} disabled={busy} className={`${BTN_PRIMARY} mt-4`}>
                    {busy ? "Signing in…" : "Sign in"}
                  </button>
                  <Divider label="or" />
                  <button onClick={() => sendOtp("LOGIN")} disabled={busy} className={BTN_OUTLINE}>
                    <span className="flex items-center justify-center gap-2"><KeyRound className="h-4 w-4" /> Login with OTP</span>
                  </button>
                </>
              )}

              {step === "otp" && (
                <>
                  <button onClick={() => goTo(otpPurpose === "RESET" ? "password" : "identify")} className="mb-3 flex items-center gap-1 text-xs font-bold text-yellow-700 hover:underline">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                  <h1 className="text-2xl font-black text-gray-900">Verify code</h1>
                  <p className="mb-4 mt-1 text-[13px] text-gray-500">
                    We sent a 6-digit code to <span className="font-bold text-gray-900">{maskedDest}</span>.{" "}
                    <button onClick={() => goTo(otpPurpose === "RESET" ? "password" : "identify")} className={LINK}>Change</button>
                  </p>
                  {error && <div className="mb-3"><AlertBox>{error}</AlertBox></div>}
                  {devOtp && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-800" role="status">
                      <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Demo mode — the SMS gateway is not connected yet, so your code is shown here: <span className="font-black tracking-widest">{devOtp}</span></span>
                    </div>
                  )}
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={code} onChange={setCode} disabled={busy}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <button onClick={doVerify} disabled={busy || code.length < 6} className={`${BTN_PRIMARY} mt-5`}>
                    {busy ? "Verifying…" : otpPurpose === "RESET" ? "Verify code" : "Verify & sign in"}
                  </button>
                  <p className="mt-4 text-center text-[13px] text-gray-500">
                    {cooldown > 0 ? (
                      <>Resend code in <span className="font-bold text-gray-900">{cooldown}s</span></>
                    ) : (
                      <>Did not get it? <button onClick={() => sendOtp(otpPurpose)} className={LINK}>Resend code</button></>
                    )}
                  </p>
                </>
              )}

              {step === "newpass" && (
                <>
                  <button onClick={() => goTo("password")} className="mb-3 flex items-center gap-1 text-xs font-bold text-yellow-700 hover:underline">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                  <h1 className="text-2xl font-black text-gray-900">Set a new password</h1>
                  <p className="mb-4 mt-1 text-[13px] text-gray-500">Identity verified for {maskedDest}. Choose a new password for your B2B account.</p>
                  {error && <div className="mb-3"><AlertBox>{error}</AlertBox></div>}
                  <label className={LABEL} htmlFor="new-password">New password</label>
                  <input id="new-password" type="password" value={newPwd.p} onChange={(e) => setNewPwd((f) => ({ ...f, p: e.target.value }))} placeholder="At least 6 characters" autoComplete="new-password" className={INPUT} />
                  <label className={`${LABEL} mt-3`} htmlFor="confirm-password">Re-enter password</label>
                  <input id="confirm-password" type="password" value={newPwd.c} onChange={(e) => setNewPwd((f) => ({ ...f, c: e.target.value }))} placeholder="Re-enter new password" autoComplete="new-password" onKeyDown={(e) => e.key === "Enter" && !busy && doNewPassword()} className={INPUT} />
                  <button onClick={doNewPassword} disabled={busy} className={`${BTN_PRIMARY} mt-4`}>
                    {busy ? "Saving…" : "Save & sign in"}
                  </button>
                </>
              )}

              {step === "create" && (
                <>
                  <button onClick={() => goTo("identify")} className="mb-3 flex items-center gap-1 text-xs font-bold text-yellow-700 hover:underline">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                  </button>
                  <h1 className="text-2xl font-black text-gray-900">Create B2B account</h1>
                  <p className="mb-4 mt-1 text-[13px] text-gray-500">Tell us about your business — our team verifies every buyer before the account opens.</p>
                  {error && <div className="mb-3"><AlertBox>{error}</AlertBox></div>}
                  <label className={LABEL}>Business type</label>
                  <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {TYPES.map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setReg((f) => ({ ...f, customerType: t.key }))}
                        className={`rounded-xl border-2 p-2.5 text-center transition ${reg.customerType === t.key ? "border-yellow-500 bg-yellow-50" : "border-gray-200 hover:border-gray-300"}`}
                      >
                        <t.icon className="mx-auto h-5 w-5 text-gray-700" />
                        <p className="mt-1 text-[11px] font-black">{t.label}</p>
                        <p className="text-[9px] leading-tight text-gray-400">{t.hint}</p>
                      </button>
                    ))}
                  </div>
                  {([
                    ["shopName", "Business / shop name *", "text", "e.g. Sri Ganesh Traders"],
                    ["name", "Contact person name *", "text", "Full name"],
                    ["phone", "Mobile number *", "tel", "10-digit mobile"],
                    ["email", "Email (optional)", "email", "you@business.com"],
                    ["password", "Password * (min 6 chars)", "password", "Create a password"],
                    ["confirm", "Re-enter password *", "password", "Re-enter password"],
                  ] as const).map(([key, label, type, ph]) => (
                    <div key={key} className="mb-2.5">
                      <label className={LABEL} htmlFor={`reg-${key}`}>{label}</label>
                      <input
                        id={`reg-${key}`}
                        type={type}
                        value={reg[key]}
                        onChange={(e) => setReg((f) => ({ ...f, [key]: e.target.value }))}
                        placeholder={ph}
                        autoComplete={key === "phone" ? "tel" : key === "password" ? "new-password" : "off"}
                        className={regErrors[key] ? INPUT.replace("border-gray-300", "border-red-400") : INPUT}
                      />
                      {regErrors[key] && <p className="mt-0.5 text-[11px] text-red-500">{regErrors[key]}</p>}
                    </div>
                  ))}
                  <div className="mb-2.5 grid grid-cols-2 gap-2">
                    <div>
                      <label className={LABEL} htmlFor="reg-city">City</label>
                      <input id="reg-city" value={reg.city} onChange={(e) => setReg((f) => ({ ...f, city: e.target.value }))} placeholder="City" className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL} htmlFor="reg-pincode">Pincode (location)</label>
                      <input id="reg-pincode" value={reg.pincode} onChange={(e) => setReg((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="e.g. 411001" inputMode="numeric" className={regErrors.pincode ? INPUT.replace("border-gray-300", "border-red-400") : INPUT} />
                      {regErrors.pincode && <p className="mt-0.5 text-[11px] text-red-500">{regErrors.pincode}</p>}
                    </div>
                  </div>
                  <div className="mb-2.5">
                    <label className={LABEL} htmlFor="reg-gstin">GSTIN (optional)</label>
                    <input id="reg-gstin" value={reg.gstin} onChange={(e) => setReg((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))} placeholder="27ABCDE1234F1Z5" className={INPUT} />
                  </div>
                  <p className="mb-2.5 text-[11px] leading-relaxed text-gray-400">City + pincode place you near a DMK Mart warehouse — after login the site shows pickup availability and the nearest godown for your orders.</p>
                  <button onClick={doRegister} disabled={busy} className={`${BTN_PRIMARY} mt-2`}>
                    {busy ? "Creating…" : "Create account"}
                  </button>
                  <p className="mt-3 text-center text-[11px] text-gray-400">Every B2B account is verified by the DMK Mart team before it opens. No pricing is shown at signup — your price tier is assigned privately at approval.</p>
                </>
              )}

              {step === "registered" && (
                <>
                  <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                    <div>
                      <h1 className="text-lg font-black text-emerald-900">Account created!</h1>
                      <p className="mt-1 text-[13px] leading-relaxed text-emerald-800">
                        What happens next: our team verifies your business details, usually within 1 working day.
                        Your account opens as soon as it is approved — you will get a WhatsApp message from us the moment it is ready.
                      </p>
                    </div>
                  </div>
                  <ul className="mb-5 space-y-2 text-[13px] text-gray-600">
                    <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-yellow-600" /> Sign in with your mobile number and password</li>
                    <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-yellow-600" /> Add products to cart and place your first order</li>
                    <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-yellow-600" /> Track orders and delivery OTP from this account page</li>
                  </ul>
                  <button onClick={() => goTo("identify")} className={BTN_PRIMARY}>Continue to sign in</button>
                </>
              )}
            </div>
          )}

          {/* reassurance strip */}
          {hydrated && !customer && (
            <div className="mt-6 flex items-start gap-2.5 rounded-2xl border bg-white p-4 text-[12px] text-gray-600">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
              <p>
                <span className="font-bold text-gray-900">Wholesale pricing, GST invoices &amp; credit terms.</span>{" "}
                DMK Mart accounts are for verified businesses only — your details stay private and are used solely for order fulfilment.
              </p>
            </div>
          )}
        </div>
      </div>
    </StoreChrome>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountInner />
    </Suspense>
  );
}
