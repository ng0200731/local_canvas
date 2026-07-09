"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { usingLocalStore } from "@/lib/store";

/** Dismissible amber banner shown in local/demo mode (no Supabase configured). */
export function DemoBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (!usingLocalStore || dismissed) return null;

  return (
    <div className="bg-accent/65 text-accent-foreground flex items-center justify-center gap-3 border-b px-4 py-2 text-center text-xs">
      <span className="leading-5">
        <strong>Demo mode:</strong> projects are saved in this browser only. Add Supabase keys (
        <code>.env.local</code>) to sync to the cloud.
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="focus-visible:ring-ring flex size-7 shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity outline-none hover:opacity-100 focus-visible:ring-2"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
