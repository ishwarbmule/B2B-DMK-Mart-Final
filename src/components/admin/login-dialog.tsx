"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Lock, LogIn, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export function AdminLoginDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginId, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Invalid credentials");
        return;
      }
      localStorage.setItem("dmk-admin-token", data.token);
      toast.success("Welcome back, Super Admin!");
      onOpenChange(false);
      router.push("/admin");
    } catch {
      toast.error("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <div className="mb-1 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-yellow-500" />
          <h3 className="text-base font-black">Super Admin Portal</h3>
        </div>
        <p className="mb-4 text-xs text-gray-500">Restricted access · DMK Mart B2B administration</p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-700">Login ID</label>
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              placeholder="B2B DMK Mart"
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              placeholder="••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-black py-2.5 text-sm font-bold uppercase tracking-wide text-yellow-400 hover:bg-gray-800 disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" /> {busy ? "Signing in…" : "Sign In"}
          </button>
          <p className="flex items-center justify-center gap-1 text-[10px] text-gray-400">
            <Lock className="h-3 w-3" /> Session is secured with HMAC token authentication
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
