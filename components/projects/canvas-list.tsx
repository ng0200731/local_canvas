"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toDataURL } from "qrcode";
import { ArrowUpRight, Check, FileImage, Loader2, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { buildCanvasReport } from "@/lib/canvas-report";
import { ImagePreviewDialog } from "@/components/image-preview-dialog";
import { Badge } from "@/components/ui/badge";
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
import {
  getCanvasStore,
  type Canvas,
  type CanvasSendRecord,
  type ImageRecord,
  type Project,
} from "@/lib/store";

function canvasStatusLabel(status: Canvas["status"]): string {
  if (status === "awaiting_approval") return "Await approval";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Draft";
}

function makeApprovalToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `approval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function fuzzyMatch(value: string, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const haystack = value.toLocaleLowerCase();
  if (haystack.includes(needle)) return true;
  let index = 0;
  for (const character of haystack) {
    if (character === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
}

interface CanvasColumnFilters {
  name: string;
  created: string;
  updated: string;
  status: string;
  email: string;
}

const emptyCanvasColumnFilters: CanvasColumnFilters = {
  name: "",
  created: "",
  updated: "",
  status: "",
  email: "",
};

function SendCanvasDialog({
  canvas,
  project,
  defaultRecipient,
}: {
  canvas: Canvas;
  project: Project | null;
  defaultRecipient: string;
}) {
  const queryClient = useQueryClient();
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
  const [sendHistory, setSendHistory] = useState<CanvasSendRecord[]>([]);
  const [recipient, setRecipient] = useState(defaultRecipient);
  const previewItems = images.map((image) => ({
    id: image.id,
    src: image.url,
    alt: image.prompt ?? "Render history image",
  }));

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) return;
    if (!recipient) setRecipient(defaultRecipient);
    setLoading(true);
    try {
      const [fullCanvas, renderImages] = await Promise.all([
        getCanvasStore().getCanvas(canvas.id),
        getCanvasStore().listImages(canvas.id),
        getCanvasStore().listCanvasSends(canvas.id).then(setSendHistory),
      ]);
      setLoadedCanvas(fullCanvas ?? canvas);
      setImages(renderImages);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load render history");
    } finally {
      setLoading(false);
    }
  }

  function selectImage(imageId: string) {
    setSelectedImageIds([imageId]);
  }

  async function sendSelected() {
    const parsedRecipient = emailRecipientSchema.safeParse(recipient);
    if (!parsedRecipient.success) {
      toast.error(parsedRecipient.error.issues[0]?.message ?? "Enter a valid recipient email.");
      return;
    }
    if (selectedImageIds.length === 0) {
      toast.error("Please select one render image before sending the canvas report.");
      return;
    }

    setSending(true);
    try {
      const selectedImages = images.filter((image) => selectedImageIds.includes(image.id));
      const origin = window.location.origin;
      const approvalToken = makeApprovalToken();
      const provisionalSend = await getCanvasStore().createCanvasSend({
        canvasId: canvas.id,
        recipientEmail: parsedRecipient.data,
        reportUrl: `${origin}/canvas-sends/pending`,
        approvalToken,
        approvalUrl: `${origin}/api/canvas-sends/respond?token=${approvalToken}&decision=approved`,
        rejectionUrl: `${origin}/api/canvas-sends/respond?token=${approvalToken}&decision=rejected`,
        qrCodeDataUrl: null,
        selectedImageIds,
        reportSnapshot: { pending: true },
      });
      const reportUrl = `${origin}/canvas-sends/${provisionalSend.sequence}?token=${approvalToken}`;
      const approvalUrl = `${origin}/api/canvas-sends/respond?token=${approvalToken}&decision=approved`;
      const rejectionUrl = `${origin}/api/canvas-sends/respond?token=${approvalToken}&decision=rejected`;
      const qrCodeDataUrl = await toDataURL(reportUrl, {
        width: 180,
        margin: 1,
        errorCorrectionLevel: "M",
      });
      const report = buildCanvasReport({
        canvas: loadedCanvas ?? canvas,
        project,
        customers: customers.data ?? [],
        suppliers: suppliers.data ?? [],
        products: products.data ?? [],
        images: selectedImages,
        send: {
          sequence: provisionalSend.sequence,
          reportUrl,
          approvalUrl,
          rejectionUrl,
          qrCodeDataUrl,
        },
      });
      const finalizedSend = await getCanvasStore().updateCanvasSend(provisionalSend.id, {
        reportUrl,
        approvalUrl,
        rejectionUrl,
        qrCodeDataUrl,
        reportSnapshot: {
          title: report.title,
          generatedAt: report.generatedAt,
          project: report.project,
          sections: report.sections,
          steps: report.steps,
          send: report.send,
        },
      });
      const filename = canvas.name.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "") || "canvas";
      const result = await sendCanvasReportEmail({
        to: parsedRecipient.data,
        canvasName: canvas.name,
        subject: `${canvas.name} canvas report`,
        html: report.html,
        text: report.text,
        pdfFilename: `${filename}-report.pdf`,
        report: {
          title: report.title,
          generatedAt: report.generatedAt,
          project: report.project,
          sections: report.sections,
          steps: report.steps,
          send: report.send,
        },
      });
      await getCanvasStore().updateCanvasStatus(canvas.id, "awaiting_approval");
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
        `${sentAt} - ${finalizedSend.sequence} delivered to ${parsedRecipient.data} with ${
          result.provider === "local"
            ? "Local SMTP"
            : result.provider === "163"
              ? "163.com"
              : "Gmail"
        }`,
        ...current.filter((record) => !record.startsWith(sentAt)),
      ]);
      setSendHistory((current) => [finalizedSend, ...current]);
      void queryClient.invalidateQueries({ queryKey: ["canvases", canvas.projectId] });
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
              Sends the full canvas report by local server email. 163.com is tried first, then
              Gmail; a PDF copy is attached when available.
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
              {images.map((image, index) => {
                const selected = selectedImageIds.includes(image.id);
                return (
                  <div
                    key={image.id}
                    className={`relative rounded-md border p-2 text-left ${
                      selected ? "border-primary ring-primary ring-2" : ""
                    }`}
                  >
                    <button
                      type="button"
                      aria-label={`${selected ? "Unselect" : "Select"} render from ${formatDate(
                        image.createdAt,
                      )}`}
                      className={`absolute top-3 right-3 z-10 flex size-6 items-center justify-center rounded-full border shadow-sm ${
                        selected
                          ? "bg-primary border-primary text-primary-foreground"
                          : "bg-background/90 text-muted-foreground"
                      }`}
                      onClick={() => selectImage(image.id)}
                    >
                      {selected ? <Check className="size-3.5" /> : null}
                    </button>
                    <ImagePreviewDialog
                      src={image.url}
                      alt={image.prompt ?? "Render history image"}
                      title="Render preview"
                      gallery={previewItems}
                      initialIndex={index}
                      selectedItemId={selectedImageIds[0] ?? null}
                      selectedLabel="Selected"
                      selectLabel="Select"
                      onSelect={(item) => {
                        if (item.id) selectImage(item.id);
                      }}
                      trigger={
                        <button
                          type="button"
                          className="focus-visible:ring-ring block w-full cursor-zoom-in rounded outline-none focus-visible:ring-2"
                          aria-label="Open render preview"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={image.url}
                            alt={image.prompt ?? "Render history image"}
                            className="bg-muted aspect-video w-full rounded object-contain"
                          />
                        </button>
                      }
                    />
                    <span className="text-muted-foreground mt-2 block truncate text-xs">
                      {formatDate(image.createdAt)}
                    </span>
                  </div>
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
          {sendHistory.length ? (
            <div className="rounded-md border p-3">
              <p className="mb-2 text-sm font-medium">Approval history</p>
              <div className="text-muted-foreground grid gap-1 text-xs">
                {sendHistory.map((record) => (
                  <p key={record.id}>
                    {record.sequence} - {canvasStatusLabel(record.status)} -{" "}
                    {formatDate(record.createdAt)} - {record.recipientEmail}
                  </p>
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
  const [columnFilters, setColumnFilters] = useState<CanvasColumnFilters>(emptyCanvasColumnFilters);
  const employeeEmail = project.data?.employeeEmail ?? "";
  const visibleCanvases =
    canvases?.filter(
      (canvas) =>
        fuzzyMatch(canvas.name, columnFilters.name) &&
        fuzzyMatch(formatDate(canvas.createdAt), columnFilters.created) &&
        fuzzyMatch(formatDate(canvas.updatedAt), columnFilters.updated) &&
        fuzzyMatch(canvasStatusLabel(canvas.status), columnFilters.status) &&
        (project.isLoading || fuzzyMatch(employeeEmail || "Not set", columnFilters.email)),
    ) ?? [];

  function updateColumnFilter(key: keyof CanvasColumnFilters, value: string) {
    setColumnFilters((current) => ({ ...current, [key]: value }));
  }

  function filterInput(key: keyof CanvasColumnFilters, label: string) {
    return (
      <Input
        value={columnFilters[key]}
        onChange={(event) => updateColumnFilter(key, event.target.value)}
        placeholder="Search"
        aria-label={`Search ${label}`}
        className="bg-background h-8 min-w-28 text-xs normal-case"
      />
    );
  }

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
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Employer email</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
                <tr className="bg-background/70 border-t">
                  <th className="px-4 py-2">{filterInput("name", "canvas name")}</th>
                  <th className="px-4 py-2">{filterInput("created", "create time")}</th>
                  <th className="px-4 py-2">{filterInput("updated", "last update")}</th>
                  <th className="px-4 py-2">{filterInput("status", "status")}</th>
                  <th className="px-4 py-2">{filterInput("email", "employer email")}</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleCanvases.length ? (
                  visibleCanvases.map((canvas) => (
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
                      <td className="px-4 py-3">
                        <Badge variant={canvas.status === "approved" ? "default" : "secondary"}>
                          {canvasStatusLabel(canvas.status)}
                        </Badge>
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
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-muted-foreground px-4 py-10 text-center">
                      No matching canvases.
                    </td>
                  </tr>
                )}
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
