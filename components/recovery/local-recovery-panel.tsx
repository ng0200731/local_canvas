"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, CloudUpload, Download, ShieldCheck, Upload } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  createLocalRecoveryArchive,
  importLocalRecoveryArchive,
  localRecoveryArchiveSchema,
  type LocalRecoveryArchive,
} from "@/lib/local-recovery";

const importResponseSchema = z.object({
  imported: z.object({ projects: z.number(), canvases: z.number(), nodes: z.number(),
    customers: z.number(), suppliers: z.number(), products: z.number(), images: z.number() }),
});

function downloadArchive(archive: LocalRecoveryArchive, label: string): void {
  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `infinite-canvas-${label}-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ArchiveCounts({ archive }: { archive: LocalRecoveryArchive }) {
  const counts = [
    ["Projects", archive.projects.length],
    ["Canvases", archive.canvases.length],
    ["Customers", archive.customers.length],
    ["Suppliers", archive.suppliers.length],
    ["Products", archive.products.length],
  ] as const;
  return <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-5">
    {counts.map(([label, count]) => <div className="bg-background p-4" key={label}><p className="text-2xl font-semibold tabular-nums">{count}</p><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p></div>)}
  </div>;
}

export function LocalRecoveryPanel() {
  const [archive, setArchive] = useState<LocalRecoveryArchive | null>(null);
  const [pending, setPending] = useState<LocalRecoveryArchive | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void createLocalRecoveryArchive().then(setArchive).catch(() => toast.error("Could not read local records.")); }, []);

  async function exportCurrent(): Promise<void> {
    const current = await createLocalRecoveryArchive();
    setArchive(current);
    downloadArchive(current, `backup-${location.port || "default"}`);
    toast.success("Backup downloaded. Keep this file safe.");
  }

  async function chooseFile(file: File): Promise<void> {
    try { setPending(localRecoveryArchiveSchema.parse(JSON.parse(await file.text()) as unknown)); }
    catch { setPending(null); toast.error("This is not a valid Infinite Canvas backup."); }
  }

  async function mergePending(): Promise<void> {
    if (!pending) return;
    const before = await createLocalRecoveryArchive();
    downloadArchive(before, "before-merge");
    await importLocalRecoveryArchive(pending);
    setPending(null);
    setArchive(await createLocalRecoveryArchive());
    toast.success("Records merged. Reloading the project list…");
    window.setTimeout(() => { window.location.href = "/projects"; }, 900);
  }

  async function uploadToSupabase(): Promise<void> {
    setUploading(true);
    try {
      const current = await createLocalRecoveryArchive();
      downloadArchive(current, "before-supabase-import");
      const response = await fetch("/api/recovery/import", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(current),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = z.object({ error: z.string() }).safeParse(body);
        throw new Error(message.success ? message.data.error : "Supabase import failed.");
      }
      const result = importResponseSchema.parse(body).imported;
      toast.success(`Imported ${result.projects} projects, ${result.canvases} canvases, and ${result.nodes} nodes.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Supabase import failed.");
    } finally { setUploading(false); }
  }

  return <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,var(--muted),transparent_42%)] px-5 py-12 text-foreground sm:px-10">
    <section className="mx-auto max-w-5xl">
      <div className="mb-10 flex items-start justify-between gap-6 border-b pb-8">
        <div><p className="mb-3 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Local archive{archive ? ` · ${archive.origin}` : ""}</p><h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">Recover before you migrate.</h1><p className="mt-4 max-w-2xl text-muted-foreground">Export this port, then import its file on the other port. Nothing is deleted, and a backup is downloaded before every merge.</p></div>
        <div className="rounded-full border p-3"><Archive className="size-6" /></div>
      </div>
      {archive ? <ArchiveCounts archive={archive} /> : <div className="h-24 animate-pulse rounded-xl bg-muted" />}
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <article className="rounded-2xl border bg-background/90 p-6 shadow-sm"><Download className="mb-8 size-7" /><h2 className="text-xl font-semibold">1. Export this port</h2><p className="mt-2 min-h-12 text-sm text-muted-foreground">Includes canvas graphs stored in IndexedDB, not only visible project metadata.</p><Button className="mt-7 w-full" onClick={() => void exportCurrent()}>Download backup</Button></article>
        <article className="rounded-2xl border bg-background/90 p-6 shadow-sm"><Upload className="mb-8 size-7" /><h2 className="text-xl font-semibold">2. Merge another port</h2><p className="mt-2 min-h-12 text-sm text-muted-foreground">Select the backup downloaded from port 3000 or 3001. Matching IDs keep the newest version.</p><input ref={inputRef} className="hidden" type="file" accept="application/json,.json" onChange={(event) => { const file=event.target.files?.[0]; if(file) void chooseFile(file); }} /><Button className="mt-7 w-full" variant="outline" onClick={() => inputRef.current?.click()}>Choose backup file</Button></article>
      </div>
      <article className="mt-5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6">
        <CloudUpload className="mb-5 size-7" /><h2 className="text-xl font-semibold">3. Upload this port to Supabase</h2>
        <p className="mt-2 text-sm text-muted-foreground">Sign in first. A JSON backup downloads automatically, then validated records are written under your account. Local data is not removed.</p>
        <Button className="mt-5" disabled={uploading || !archive} onClick={() => void uploadToSupabase()}>{uploading ? "Uploading…" : "Upload to Supabase"}</Button>
      </article>
      {pending && <div className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6"><div className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0" /><div className="flex-1"><h2 className="font-semibold">Ready to merge backup from {pending.origin}</h2><p className="mt-1 text-sm text-muted-foreground">Review its counts below. A pre-merge backup downloads automatically.</p><div className="mt-4"><ArchiveCounts archive={pending} /></div><div className="mt-5 flex gap-3"><Button onClick={() => void mergePending()}>Merge records</Button><Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button></div></div></div></div>}
    </section>
  </main>;
}
