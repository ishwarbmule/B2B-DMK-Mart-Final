"use client";

/**
 * Mandatory "set your new password" popup.
 *
 * Shown globally (StoreChrome) whenever the signed-in customer has
 * mustChangePassword = true — migrated old-website accounts start with a
 * temporary password (e.g. 1234) and MUST choose their own before continuing.
 * The dialog cannot be dismissed: no overlay-click close, no escape close.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { KeyRound, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useCustomerSession } from "@/lib/customer-client";
import { getCustomerToken } from "@/lib/customer-session";

export function ForcePasswordDialog() {
  const customer = useCustomerSession((s) => s.customer);
  const refresh = useCustomerSession((s) => s.refresh);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOpen(Boolean(customer?.mustChangePassword));
    if (!customer?.mustChangePassword) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setError(null);
    }
  }, [customer?.mustChangePassword]);

  if (!customer) return null;

  const submit = async () => {
    setError(null);
    if (!current) return setError("Enter the temporary password you use today (it was given to you by DMK Mart).");
    if (next.length < 6) return setError("New password must be at least 6 characters.");
    if (next !== confirm) return setError("New password and confirmation do not match.");
    if (next === current) return setError("The new password must be different from the temporary one.");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json", "x-customer-token": getCustomerToken() ?? "" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not update the password");
      setOpen(false);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Your new password is set — welcome aboard!");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => { /* mandatory — cannot be dismissed */ }}>
      <DialogContent
        className="max-w-md rounded-2xl border-0 shadow-2xl [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-2 text-left">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-100">
            <KeyRound className="h-5 w-5 text-yellow-600" />
          </div>
          <DialogTitle className="text-lg font-black">Set your new password</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-gray-600">
            Your account was moved from the old DMK Mart website with a temporary password
            (usually <span className="font-bold text-gray-800">1234</span>). For your shop&apos;s security,
            choose your own password before you continue ordering.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="fp-current" className="text-xs font-bold text-gray-700">Current (temporary) password</Label>
            <div className="relative">
              <Input
                id="fp-current" type={show ? "text" : "password"} value={current} autoFocus
                onChange={(e) => setCurrent(e.target.value)} placeholder="e.g. 1234"
                className="h-10 rounded-lg pr-10"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fp-new" className="text-xs font-bold text-gray-700">New password</Label>
            <Input id="fp-new" type={show ? "text" : "password"} value={next}
              onChange={(e) => setNext(e.target.value)} placeholder="At least 6 characters"
              className="h-10 rounded-lg"
              onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fp-confirm" className="text-xs font-bold text-gray-700">Confirm new password</Label>
            <Input id="fp-confirm" type={show ? "text" : "password"} value={confirm}
              onChange={(e) => setConfirm(e.target.value)} placeholder="Type the new password again"
              className="h-10 rounded-lg"
              onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}

          <Button onClick={submit} disabled={busy}
            className="h-11 w-full rounded-lg bg-yellow-400 text-base font-black text-black shadow hover:bg-yellow-300 disabled:opacity-60">
            {busy ? "Saving…" : "Save password & continue"}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
            <ShieldCheck className="h-3.5 w-3.5" /> One-time setup — you will not see this again
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
