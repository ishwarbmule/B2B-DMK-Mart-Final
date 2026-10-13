"use client";

import { cn } from "@/lib/utils";

export function DmkLogo({ compact = false, onDark = false }: { compact?: boolean; onDark?: boolean }) {
  return (
    <div className="flex items-center gap-2 select-none" aria-label="DMK Mart home">
      <img
        src="/dmk-logo.png"
        alt="DMK Mart logo"
        className={cn("rounded-full object-cover shadow-sm", compact ? "h-9 w-9" : "h-11 w-11")}
      />
      <div className="flex flex-col leading-none">
        <span
          className={cn(
            "font-extrabold tracking-tight",
            compact ? "text-lg" : "text-2xl",
            onDark ? "text-white" : "text-black"
          )}
        >
          DMK <span className={onDark ? "text-[#ffd400]" : "text-[#111]"}>Mart</span>
        </span>
        {!compact && (
          <span className={cn("text-[10px] font-bold leading-none mt-1 tracking-wide", onDark ? "text-[#ffd400]" : "text-black/70")}>
            Save More. Shop More.
          </span>
        )}
      </div>
    </div>
  );
}
