"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, LogIn, Loader2, ShieldCheck } from "lucide-react";

export function AdminLogin({
  open,
  onOpenChange,
  onLogin,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onLogin: (token: string) => void;
}) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId: loginId.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      onLogin(data.token);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden">
        <div className="bg-black px-5 py-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[#ffd400] flex items-center justify-center">
            <Lock className="h-5 w-5 text-black" />
          </div>
          <div>
            <DialogTitle className="text-white text-base font-bold">DMK Mart Admin</DialogTitle>
            <DialogDescription className="text-white/60 text-xs">
              B2B panel · authorised staff only
            </DialogDescription>
          </div>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <Label htmlFor="admin-id" className="text-xs text-slate-500">Login ID</Label>
            <Input
              id="admin-id"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="B2B DMK Mart"
              autoComplete="username"
              className="mt-1 h-9"
              required
            />
          </div>
          <div>
            <Label htmlFor="admin-pass" className="text-xs text-slate-500">Password</Label>
            <Input
              id="admin-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••"
              autoComplete="current-password"
              className="mt-1 h-9"
              required
            />
          </div>
          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#ffd400] hover:bg-[#f0c800] text-black font-bold h-10"
          >
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
            Sign In
          </Button>
          <p className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
            <ShieldCheck className="h-3 w-3" /> Demo credentials: B2B DMK Mart / 1234
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
