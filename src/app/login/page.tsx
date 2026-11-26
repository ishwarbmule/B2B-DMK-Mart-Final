"use client";

/**
 * /login — the ONLY door into the website (middleware sends every logged-out
 * page visit here). The owner's rule: this site is for DMK Mart customers.
 *
 * Creative split layout:
 *  - LEFT  (desktop): auto-rotating brand image slider — the same hero
 *            artwork the storefront uses (admin sliders first, brand photo
 *            fallbacks), with DMK Mart copy + USP chips on top.
 *  - RIGHT: sign-in / create-account panel.
 *  - Phones: slim slider banner above the panel.
 *
 *  - Sign in: mobile/email + password → warehouse chooser → shop
 *  - Create account: signup works immediately but the account stays
 *    PENDING — admin approval unlocks browsing (login says so plainly)
 *  - Forgot password → public /forgot-password wizard (OTP → new password)
 * A buyer who already has a valid localStorage token from before this gate
 * existed is synced into the session cookie automatically — no forced re-login.
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, CheckCircle2, Eye, EyeOff, LockKeyhole, MapPin, Phone, User } from "lucide-react";
import { toast } from "sonner";
import { getCustomerToken, setCustomerToken, clearCustomerToken } from "@/lib/customer-session";
import { useCustomerSession } from "@/lib/customer-client";

const INPUT = "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-400/30";
const BTN = "h-11 w-full rounded-full bg-black text-sm font-bold uppercase tracking-wide text-yellow-400 transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50";
const LINK_CLS = "font-semibold text-yellow-700 underline-offset-2 hover:underline";

const TYPES = [
  { key: "RETAILER", label: "Retailer" },
  { key: "SEMI_WHOLESALE", label: "Semi-Wholesaler" },
  { key: "WHOLESALE", label: "Wholesaler" },
  { key: "DISTRIBUTOR", label: "Distributor" },
];

/** Brand photos used when the admin hero sliders have no usable photo yet. */
const FALLBACK_SLIDES = [
  { img: "/images/hero/hero-1.jpg", kicker: "DMK MART · WHOLESALE", heading: "Everything your shop needs, at true wholesale rates", content: "Hardware, kitchenware, storage, garden and more — 4,700+ catalog products from two ready godowns." },
  { img: "/images/hero/hero-2.jpg", kicker: "TWO ORDERING LOCATIONS", heading: "Order from the godown nearest to your shop", content: "Pick Pune or Kolhar after sign-in — you see only that warehouse's live products and prices." },
  { img: "/images/hero/hero-3.jpg", kicker: "BUILT FOR RETAILERS", heading: "Tier pricing, credit notes and door-step delivery", content: "Your price tier is set by our team — no self-selected rates, full transparency on every invoice." },
];

type Slide = { img: string; kicker?: string; heading?: string; content?: string };

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gray-50"><div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-yellow-400" /></div>}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const [tab, setTab] = useState<"login" | "register">("login");
  const [synced, setSynced] = useState(false);

  // hero slides from the admin catalog (fallback: brand photo set)
  const [slides, setSlides] = useState<Slide[]>(FALLBACK_SLIDES);

  // login form
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // register form
  const [reg, setReg] = useState({ name: "", shopName: "", phone: "", email: "", password: "", confirm: "", customerType: "RETAILER", gstin: "", city: "", pincode: "" });
  const [regErr, setRegErr] = useState<string | null>(null);
  const [regDone, setRegDone] = useState(false);

  // slider state
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const fromAdmin: Slide[] = (d?.sliders ?? [])
          .filter((s: { image?: string; mobileImage?: string }) => (s.image || s.mobileImage || "").trim())
          .map((s: { image?: string; mobileImage?: string; kicker?: string; heading?: string; content?: string }) => ({
            img: (s.image || s.mobileImage || "").trim(),
            kicker: s.kicker || undefined,
            heading: (s.heading || "").replace(/\*/g, "").trim() || undefined, // strip hero *highlight* markers
            content: (s.content || "").replace(/\*/g, "").trim() || undefined,
          }))
          .filter((s: Slide) => !s.img.endsWith(".svg")); // skip placeholder art, prefer real photos
        if (fromAdmin.length >= 2) setSlides(fromAdmin.slice(0, 5));
        else if (fromAdmin.length === 1) setSlides([...fromAdmin, ...FALLBACK_SLIDES]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % slides.length), 5200);
    return () => clearInterval(t);
  }, [slides.length]);

  const current = useMemo(() => slides[slide % slides.length], [slides, slide]);

  const continueAs = () => {
    // middleware sends the buyer to /choose-warehouse when no warehouse cookie
    // exists yet, and back to `next` when it does — just go home and let it route
    router.push(next && next.startsWith("/") ? next : "/");
  };

  // legacy sessions: token in storage (pre-gate buyers) → sync into the cookie gate
  useEffect(() => {
    if (synced) return;
    setSynced(true);
    const token = getCustomerToken();
    if (!token) return;
    fetch("/api/auth/session", { method: "POST", headers: { "x-customer-token": token } })
      .then((r) => (r.ok ? continueAs() : clearCustomerToken()))
      .catch(() => {});
  }, []);

  const doLogin = async (e: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setPending(false);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier, password }) });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Login failed");
        if (res.status === 403) setPending(true);
        return;
      }
      setCustomerToken(d.token, remember);
      useCustomerSession.getState().refresh();
      toast.success(`Welcome back, ${d.customer.shopName || d.customer.name}!`);
      continueAs();
    } catch {
      setError("Network problem — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async (e: React.FormEvent) => {
    e?.preventDefault();
    setRegErr(null);
    if (reg.password !== reg.confirm) { setRegErr("Passwords do not match."); return; }
    if (reg.password.length < 6) { setRegErr("Password must be at least 6 characters."); return; }
    if (!/^[6-9]\d{9}$/.test(reg.phone.replace(/\s/g, "").replace(/^\+?91/, ""))) { setRegErr("Enter a valid 10-digit mobile number."); return; }
    if (!/^\d{6}$/.test(reg.pincode)) { setRegErr("Enter the 6-digit pincode of your shop location."); return; }
    setBusy(true);
    try {
      // pin the shop on the map automatically from the pincode (the admin Store
      // Map section needs every buyer's location) — GPS fallback below
      let lat = 0, lng = 0, geoSource: "MAP" | "GPS" = "MAP";
      try {
        const g = await fetch(`/api/geocode?q=${encodeURIComponent(reg.pincode)}`).then((r) => r.json());
        const hit = g.results?.[0];
        if (hit) { lat = hit.lat; lng = hit.lng; }
      } catch { /* GPS fallback next */ }
      if (!lat && !lng && navigator.geolocation) {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 6000 }));
        lat = pos.coords.latitude; lng = pos.coords.longitude; geoSource = "GPS";
      }
      if (!lat && !lng) { setRegErr("Could not place your shop on the map — check the pincode."); return; }
      const res = await fetch("/api/auth/register", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: reg.name, shopName: reg.shopName,
          phone: reg.phone.replace(/\s/g, "").replace(/^\+?91/, ""),
          email: reg.email || undefined, password: reg.password,
          customerType: reg.customerType, gstin: reg.gstin || undefined,
          city: reg.city, pincode: reg.pincode,
          lat, lng, geoSource,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setRegErr(d.error || "Signup failed"); return; }
      setRegDone(true);
    } catch {
      setRegErr("Network problem — please try again.");
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
          <p className="ml-auto hidden text-[11px] text-gray-400 sm:block">Wholesale marketplace for verified B2B buyers</p>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 gap-0 lg:grid-cols-[1.25fr_1fr]">
        {/* LEFT — creative brand slider (desktop), slim banner (mobile) */}
        <div className="relative m-0 flex min-h-[190px] flex-col overflow-hidden bg-black lg:m-6 lg:min-h-[560px] lg:rounded-3xl lg:border lg:border-yellow-400/30 lg:shadow-2xl">
          {slides.map((s, i) => (
            <Image key={`${s.img}-${i}`} src={s.img} alt="" fill priority={i === 0} sizes="(max-width: 1024px) 100vw, 58vw"
              className={`object-cover transition-opacity duration-1000 ${i === slide % slides.length ? "opacity-100" : "opacity-0"}`} unoptimized />
          ))}
          {/* brand gradient scrims — dark bottom for copy legibility */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-yellow-400/10 via-transparent to-black/20" />

          {/* top brand ribbon */}
          <div className="relative z-10 flex items-center gap-3 p-4 lg:p-6">
            <span className="rounded-full border border-yellow-400/50 bg-black/60 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-yellow-400 backdrop-blur">
              DMK Mart B2B
            </span>
            <span className="hidden rounded-full border border-white/20 bg-black/50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-200 backdrop-blur sm:inline">
              Pune · Kolhar godowns
            </span>
          </div>

          {/* copy block */}
          <div className="relative z-10 mt-auto space-y-3 p-5 pb-6 lg:p-8 lg:pb-10">
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-yellow-400">{current?.kicker || "DMK MART · WHOLESALE"}</p>
            <h1 className="max-w-xl text-xl font-black leading-tight text-white lg:text-4xl">
              {current?.heading || FALLBACK_SLIDES[0].heading}
            </h1>
            <p className="hidden max-w-lg text-sm leading-relaxed text-gray-300 sm:block lg:text-[15px]">
              {current?.content || FALLBACK_SLIDES[0].content}
            </p>
            <div className="hidden flex-wrap gap-2 pt-1 sm:flex">
              {["Tier wholesale pricing", "Two ready warehouses", "Door-step delivery", "GST invoices"].map((chip) => (
                <span key={chip} className="rounded-full border border-yellow-400/40 bg-yellow-400/10 px-3 py-1 text-[11px] font-bold text-yellow-300">
                  {chip}
                </span>
              ))}
            </div>
            {/* slide dots */}
            {slides.length > 1 && (
              <div className="flex items-center gap-2 pt-3">
                {slides.map((_, i) => (
                  <button key={i} aria-label={`Slide ${i + 1}`} onClick={() => setSlide(i)}
                    className={`h-1.5 rounded-full transition-all ${i === slide % slides.length ? "w-7 bg-yellow-400" : "w-3 bg-white/40 hover:bg-white/70"}`} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — auth panel */}
        <div className="flex flex-col justify-center px-4 py-8 sm:px-8 lg:pr-10">
          <div className="mx-auto w-full max-w-md">
            {regDone ? (
              <div className="rounded-2xl border bg-white p-6 text-center shadow-sm">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
                <h2 className="mt-3 text-lg font-black text-gray-900">Account created!</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  The DMK Mart team verifies every B2B buyer before the catalog opens.
                  You will get a WhatsApp message as soon as your account is approved —
                  then just sign in and start ordering.
                </p>
                <button onClick={() => { setTab("login"); setRegDone(false); }} className="mt-5 rounded-full bg-black px-6 py-2.5 text-sm font-bold text-yellow-400 hover:bg-gray-900">
                  Back to Sign in
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <div className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-gray-100 p-1">
                  {(["login", "register"] as const).map((k) => (
                    <button key={k} onClick={() => { setTab(k); setError(null); setRegErr(null); }}
                      className={`h-9 rounded-full text-sm font-bold transition ${tab === k ? "bg-black text-yellow-400" : "text-gray-600 hover:text-black"}`}>
                      {k === "login" ? "Sign in" : "Create account"}
                    </button>
                  ))}
                </div>

                {tab === "login" ? (
                  <form onSubmit={doLogin} className="space-y-3">
                    <div>
                      <label className="mb-1 block text-[13px] font-bold text-gray-900">Mobile number or email</label>
                      <div className="relative">
                        <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="9876543210 or you@shop.com"
                          className={`${INPUT} pl-9`} inputMode="text" autoComplete="username" required />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[13px] font-bold text-gray-900">Password</label>
                      <div className="relative">
                        <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                          placeholder="Your password" className={`${INPUT} pl-9 pr-10`} autoComplete="current-password" required />
                        <button type="button" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-3.5 w-3.5 accent-black" />
                        Keep me signed in
                      </label>
                      <Link href="/forgot-password" className="text-xs font-bold text-yellow-700 underline-offset-2 hover:underline">Forgot password?</Link>
                    </div>
                    {error && (
                      <div className={`rounded-lg border p-3 text-[13px] leading-snug ${pending ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700"}`} role="alert">
                        {error}
                        {pending && (
                          <p className="mt-1 text-[12px]">You will be able to sign in the moment the team approves your account.</p>
                        )}
                      </div>
                    )}
                    <button type="submit" disabled={busy} className={BTN}>{busy ? "Signing in…" : "Sign in"}</button>
                    <p className="rounded-lg bg-yellow-50 p-3 text-[11px] leading-relaxed text-gray-600">
                      New to DMK Mart? Wholesale rates, tier pricing and two ordering locations —
                      <b> Pune</b> and <b>Kolhar</b>. Create an account and our team will approve it fast.
                    </p>
                  </form>
                ) : (
                  <form onSubmit={doRegister} className="space-y-3">
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="mb-1 block text-[13px] font-bold text-gray-900">Your name</label>
                        <div className="relative">
                          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <input value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} className={`${INPUT} pl-9`} required minLength={2} />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-[13px] font-bold text-gray-900">Shop name</label>
                        <div className="relative">
                          <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <input value={reg.shopName} onChange={(e) => setReg({ ...reg, shopName: e.target.value })} className={`${INPUT} pl-9`} required minLength={2} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-[13px] font-bold text-gray-900">Mobile</label>
                          <input value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} placeholder="9876543210" className={INPUT} inputMode="numeric" required />
                        </div>
                        <div>
                          <label className="mb-1 block text-[13px] font-bold text-gray-900">Email <span className="font-normal text-gray-400">(optional)</span></label>
                          <input value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} type="email" className={INPUT} />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-[13px] font-bold text-gray-900">Business type</label>
                        <select value={reg.customerType} onChange={(e) => setReg({ ...reg, customerType: e.target.value })} className={INPUT}>
                          {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-[13px] font-bold text-gray-900">City / town</label>
                          <input value={reg.city} onChange={(e) => setReg({ ...reg, city: e.target.value })} className={INPUT} required minLength={2} />
                        </div>
                        <div>
                          <label className="mb-1 flex items-center gap-1 text-[13px] font-bold text-gray-900">Pincode <MapPin className="h-3 w-3 text-yellow-500" /></label>
                          <input value={reg.pincode} onChange={(e) => setReg({ ...reg, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="411019" className={INPUT} inputMode="numeric" required />
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-400">Your shop is pinned on our store map automatically from the pincode.</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-[13px] font-bold text-gray-900">Password</label>
                          <input type="password" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} className={INPUT} required />
                        </div>
                        <div>
                          <label className="mb-1 block text-[13px] font-bold text-gray-900">Confirm</label>
                          <input type="password" value={reg.confirm} onChange={(e) => setReg({ ...reg, confirm: e.target.value })} className={INPUT} required />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-[13px] font-bold text-gray-900">GSTIN <span className="font-normal text-gray-400">(optional)</span></label>
                        <input value={reg.gstin} onChange={(e) => setReg({ ...reg, gstin: e.target.value.toUpperCase() })} className={INPUT} />
                      </div>
                    </div>
                    {regErr && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] leading-snug text-red-700" role="alert">{regErr}</div>
                    )}
                    <button type="submit" disabled={busy} className={BTN}>{busy ? "Creating…" : "Create account"}</button>
                    <p className="text-center text-[11px] leading-relaxed text-gray-500">
                      Accounts open after a quick admin verification — pricing is assigned by the DMK Mart team, never self-selected.
                    </p>
                  </form>
                )}
              </div>
            )}

            <p className="mt-4 text-center text-[11px] text-gray-500">
              Are you part of the DMK Mart team?{" "}
              <Link href="/admin" className="font-semibold text-gray-700 underline-offset-2 hover:underline">Staff portal</Link>
              {" · "}
              <Link href="/salesteam" className="font-semibold text-gray-700 underline-offset-2 hover:underline">Salesperson</Link>
              {" · "}
              <Link href="/warehouse" className="font-semibold text-gray-700 underline-offset-2 hover:underline">Warehouse</Link>
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 py-4 text-center text-[11px] text-gray-500">
        © 2026 DMK Mart · Wholesale marketplace for verified B2B buyers
      </div>
    </div>
  );
}
