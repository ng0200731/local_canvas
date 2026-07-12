"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, FileImage, Loader2, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { buildCanvasReport } from "@/lib/canvas-report";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateCanvasDialog } from "@/components/projects/create-canvas-dialog";
import { sendCanvasReportEmail } from "@/lib/email/client";
import { emailRecipientSchema } from "@/lib/email/schemas";
import { useCanvases, useDeleteCanvas } from "@/lib/hooks/use-canvases";
import { useProject } from "@/lib/hooks/use-projects";
import { useCustomers, useProducts, useSuppliers } from "@/lib/hooks/use-workspace-records";
import { formatDate } from "@/lib/format";
import { getCanvasStore, type Canvas, type ImageRecord, type Project } from "@/lib/store";

function SendCanvasDialog({
  canvas,
  project,
  defaultRecipient,
}: {
  canvas: Canvas;
  project: Project | null;
  defaultRecipient: string;
}) {
  const [open, setOpen] = useState(false);
  const customers = useCustomers();
  const suppliers = useSuppliers();
  const products = useProducts();
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loadedCanvas, setLoadedCanvas] = useState<Canvas | null>(null);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentRecords, setSentRecords] = useState<string[]>([]);
  const [recipient, setRecipient] = useState(defaultRecipient);

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) return;
    if (!recipient) setRecipient(defaultRecipient);
    setLoading(true);
    try {
      const [fullCanvas, renderImages] = await Promise.all([
        getCanvasStore().getCanvas(canvas.id),
        getCanvasStore().listImages(canvas.id),
      ]);
      setLoadedCanvas(fullCanvas ?? canvas);
      setImages(renderImages);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load render history");
    } finally {
      setLoading(false);
    }
  }

  async function sendSelected() {
    const parsedRecipient = emailRecipientSchema.safeParse(recipient);
    if (!parsedRecipient.success) {
      toast.error(parsedRecipient.error.issues[0]?.message ?? "Enter a valid recipient email.");
      return;
    }

    setSending(true);
    try {
      const report = buildCanvasReport({
        canvas: loadedCanvas ?? canvas,
        project,
        customers: customers.data ?? [],
        suppliers: suppliers.data ?? [],
        products: products.data ?? [],
        images,
      });
      const filename = canvas.name.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "") || "canvas";
      const result = await sendCanvasReportEmail({
        to: parsedRecipient.data,
        canvasName: canvas.name,
        subject: `${canvas.name} canvas report`,
        html: report.html,
        text: report.text,
        pdfFilename: `${filename}-report.pdf`,
      });
      const sentAt = new Date().toLocaleString();
      setSentRecords((current) => [
        `${sentAt} · ${selectedImageIds.length} render image${
          selectedImageIds.length === 1 ? "" : "s"
        } delivered to ${parsedRecipient.data} with ${
          result.provider === "163" ? "163.com" : "Gmail"
        }`,
        ...current,
      ]);
      setSentRecords((current) => [
        `${sentAt} - canvas report delivered to ${parsedRecipient.data} with ${
          result.provider === "local"
            ? "Local SMTP"
            : result.provider === "163"
              ? "163.com"
              : "Gmail"
        }`,
        ...current.filter((record) => !record.startsWith(sentAt)),
      ]);
      toast.success(`Email sent to ${parsedRecipient.data}.`);
      setSelectedImageIds([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Email delivery failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => void handleOpenChange(true)}>
        <Mail />
        Send
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => void handleOpenChange(nextOpen)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Send canvas report</DialogTitle>
            <DialogDescription>
              Sends the full canvas report as HTML and attaches a PDF copy. 163.com is tried first,
              then Gmail; an optional local SMTP catcher overrides both.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`canvas-email-recipient-${canvas.id}`}>Recipient email</Label>
            <Input
              id={`canvas-email-recipient-${canvas.id}`}
              type="email"
              autoComplete="email"
              placeholder="recipient@example.com"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              disabled={sending}
              required
            />
          </div>
          {loading ? (
            <div className="text-muted-foreground flex h-56 items-center justify-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading render history...
            </div>
          ) : images.length ? (
            <div className="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
              {images.map((image) => {
                const selected = selectedImageIds.includes(image.id);
                return (
                  <button
                    key={image.id}
                    type="button"
                    className={`rounded-md border p-2 text-left ${
                      selected ? "border-primary ring-primary ring-2" : ""
                    }`}
                    onClick={() =>
                      setSelectedImageIds((current) =>
                        selected ? current.filter((id) => id !== image.id) : [...current, image.id],
                      )
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt={image.prompt ?? "Render history image"}
                      className="bg-muted aspect-video w-full rounded object-contain"
                    />
                    <span className="text-muted-foreground mt-2 block truncate text-xs">
                      {formatDate(image.createdAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-muted-foreground flex h-56 items-center justify-center text-sm">
              No render history images found.
            </div>
          )}
          {sentRecords.length ? (
            <div className="rounded-md border p-3">
              <p className="mb-2 text-sm font-medium">Send out record</p>
              <div className="text-muted-foreground grid gap-1 text-xs">
                {sentRecords.map((record) => (
                  <p key={record}>{record}</p>
                ))}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              type="button"
              disabled={
                sending ||
                !recipient.trim() ||
                customers.isLoading ||
                suppliers.isLoading ||
                products.isLoading
              }
              onClick={() => void sendSelected()}
            >
              {sending ? "Sending..." : "Send report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CanvasActions({
  canvas,
  projectId,
  project,
  defaultRecipient,
  onOpen,
}: {
  canvas: Canvas;
  projectId: string;
  project: Project | null;
  defaultRecipient: string;
  onOpen?: (canvasId: string) => void;
}) {
  const del = useDeleteCanvas(projectId);

  async function onDelete() {
    await del.mutateAsync(canvas.id);
    toast.success("Canvas deleted");
  }

  return (
    <div className="flex justify-end gap-2">
      {onOpen ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onOpen(canvas.id)}>
          <ArrowUpRight />
          View/Edit
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          render={<Link href={`/projects/${projectId}/canvases/${canvas.id}`} />}
        >
          <ArrowUpRight />
          View/Edit
        </Button>
      )}
      <SendCanvasDialog canvas={canvas} project={project} defaultRecipient={defaultRecipient} />
      <ConfirmDialog
        title="Delete canvas?"
        description="This permanently deletes the canvas."
        onConfirm={onDelete}
        trigger={
          <Button size="icon-sm" variant="ghost" aria-label="Delete canvas">
            <Trash2 />
          </Button>
        }
      />
    </div>
  );
}

export function CanvasList({
  projectId,
  redirectOnCreate = true,
  onOpenCanvas,
  onCanvasCreated,
}: {
  projectId: string;
  redirectOnCreate?: boolean;
  onOpenCanvas?: (canvasId: string) => void;
  onCanvasCreated?: (canvasId: string) => void;
}) {
  const { data: canvases, isLoading, isError, error } = useCanvases(projectId);
  const project = useProject(projectId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Project assets
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Canvases</h2>
        </div>
        <CreateCanvasDialog
          projectId={projectId}
          redirectOnCreate={redirectOnCreate}
          onCreated={(canvas) => onCanvasCreated?.(canvas.id)}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <p className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          Failed to load canvases: {error instanceof Error ? error.message : "unknown error"}
        </p>
      ) : canvases && canvases.length > 0 ? (
        <div className="bg-card overflow-hidden rounded-lg border shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Canvas name</th>
                  <th className="px-4 py-3">Create time</th>
                  <th className="px-4 py-3">Last update</th>
                  <th className="px-4 py-3">Employer email</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {canvases.map((canvas) => (
                  <tr key={canvas.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 font-medium">
                        <FileImage className="text-muted-foreground size-4" />
                        {canvas.name}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-4 py-3">
                      {formatDate(canvas.createdAt)}
                    </td>
                    <td className="text-muted-foreground px-4 py-3">
                      {formatDate(canvas.updatedAt)}
                    </td>
                    <td className="text-muted-foreground px-4 py-3">
                      {project.isLoading ? (
                        <Skeleton className="h-4 w-36" />
                      ) : project.data?.employeeEmail ? (
                        <a
                          href={`mailto:${project.data.employeeEmail}`}
                          className="hover:text-foreground underline-offset-4 hover:underline"
                        >
                          {project.data.employeeEmail}
                        </a>
                      ) : (
                        "Not set"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <CanvasActions
                        canvas={canvas}
                        projectId={projectId}
                        project={project.data ?? null}
                        defaultRecipient={project.data?.employeeEmail ?? ""}
                        onOpen={onOpenCanvas}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-card flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center shadow-sm">
          <div className="bg-secondary text-secondary-foreground flex size-11 items-center justify-center rounded-lg">
            <FileImage className="size-5" />
          </div>
          <p className="font-medium">No canvases yet</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Create a canvas to start arranging notes, references, colors, and generation nodes.
          </p>
          <CreateCanvasDialog
            projectId={projectId}
            redirectOnCreate={redirectOnCreate}
            onCreated={(canvas) => onCanvasCreated?.(canvas.id)}
          />
        </div>
      )}
    </div>
  );
}
