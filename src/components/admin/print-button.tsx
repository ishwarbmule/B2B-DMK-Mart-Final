"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-1.5 rounded-lg bg-black px-4 py-2 text-xs font-bold text-yellow-400 hover:bg-gray-800"
    >
      <Printer className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
