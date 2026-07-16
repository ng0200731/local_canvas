"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { usingLocalPostgres, usingLocalStore } from "@/lib/store";

/** Dismissible banner for non-cloud persistence modes. */
export function DemoBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  if (usingLocalPostgres) {
    return (
      <div className="bg-primary/10 text-foreground flex items-center justify-center gap-3 border-b px-4 py-2 text-center text-xs">
        <span className="leading-5">
          <strong>Local Postgres:</strong> data is stored in Docker Postgres on this machine (no
          auth). Clear Supabase keys and keep <code>NEXT_PUBLIC_LOCAL_POSTGRES=true</code> +{" "}
          <code>DATABASE_URL</code> in <code>.env.local</code>.
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

  if (!usingLocalStore) return null;

  return (
    <div className="bg-accent/65 text-accent-foreground flex items-center justify-center gap-3 border-b px-4 py-2 text-center text-xs">
      <span className="leading-5">
        <strong>Demo mode:</strong> projects are saved in this browser only. Add Supabase keys or
        enable local Postgres (<code>DATABASE_URL</code>) for durable SQL storage.
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
