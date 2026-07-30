"use client";

import { useMemo, useState } from "react";
import { toDataURL } from "qrcode";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  ExternalLink,
  FlaskConical,
  Loader2,
  PackageCheck,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Bell,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { sendPurchaseSamplingEmail, sendReminderEmail } from "@/lib/email/client";
import {
  useDeleteSampleOrders,
  useGenerateDemoSampleOrders,
  useSampleOrders,
} from "@/lib/hooks/use-sample-orders";
import {
  SAMPLE_STAGES,
  SAMPLE_STAGE_LABELS,
  SUPPLIER_UPDATE_STAGES,
  createPublicToken,
  payloadSummary,
  sha256Token,
  type SampleOrder,
  type SampleStage,
} from "@/lib/sample-orders";
import { getCanvasStore, usingLocalStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not set";
}

function pmcDateFromOrder(order: SampleOrder): string | undefined {
  if (order.currentPayload?.stage === "pmc") {
    return (order.currentPayload as { pmcDate?: string }).pmcDate;
  }
  const pmcUpdate = [...order.updates]
    .reverse()
    .find((update) => update.payload.stage === "pmc");
  if (pmcUpdate?.payload.stage === "pmc") {
    return (pmcUpdate.payload as { pmcDate?: string }).pmcDate;
  }
  return undefined;
}

function StatusBadge({ value, kind }: { value: string; kind: "email" | "approval" | "stage" }) {
  const success = value === "sent" || value === "approved";
  const danger = value === "failed" || value === "rejected";
  return (
    <Badge
      variant={danger ? "destructive" : success ? "default" : "secondary"}
      className="whitespace-nowrap"
    >
      {kind === "stage" && value in SAMPLE_STAGE_LABELS
        ? SAMPLE_STAGE_LABELS[value as keyof typeof SAMPLE_STAGE_LABELS]
        : value.replaceAll("_", " ")}
    </Badge>
  );
}

function OrderTimeline({ order }: { order: SampleOrder }) {
  if (!order.updates.length) {
    return (
      <p className="text-muted-foreground text-xs">
        No supplier updates yet — awaiting first stage submission.
      </p>
    );
  }
  const ordered = [...order.updates].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <ol className="grid gap-2">
      {ordered.map((update) => (
        <li key={update.id} className="border-primary/25 border-l-2 pl-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{SAMPLE_STAGE_LABELS[update.stage]}</span>
            <time className="text-muted-foreground">{formatDate(update.createdAt)}</time>
          </div>
          <p className="text-muted-foreground mt-0.5">{payloadSummary(update.payload)}</p>
        </li>
      ))}
    </ol>
  );
}

function SupplierCard({
  order,
  onRetry,
  onRetryApproval,
  onDelete,
  onSendReminder,
  onShipOut,
  retrying,
  actioning,
}: {
  order: SampleOrder;
  onRetry: (order: SampleOrder) => void;
  onRetryApproval: (order: SampleOrder) => void;
  onDelete: (order: SampleOrder) => void;
  onSendReminder: (order: SampleOrder) => void;
  onShipOut: (order: SampleOrder) => void;
  retrying: string | null;
  actioning: string | null;
}) {
  const pmcDate = pmcDateFromOrder(order);
  return (
    <div className="bg-background overflow-hidden rounded-xl border">
      <div className="bg-muted/30 flex items-center justify-between gap-2 border-b px-4 py-3">
        <p className="font-medium text-sm">{order.snapshot.supplier.name}</p>
        {order.currentStage ? (
          <StatusBadge value={order.currentStage} kind="stage" />
        ) : (
          <Badge variant="outline">Not started</Badge>
        )}
      </div>
      <div className="grid gap-3 p-4 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">Email</span>
          <StatusBadge value={order.emailStatus} kind="email" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">Approval</span>
          <StatusBadge value={order.approvalStatus} kind="approval" />
        </div>
        {order.latestUpdateAt ? (
          <p className="text-muted-foreground text-xs">Latest: {formatDate(order.latestUpdateAt)}</p>
        ) : null}
        {pmcDate ? (
          <p className="bg-amber-50 border-amber-200 text-amber-800 rounded-md border px-2 py-1 text-xs">
            PMC delivery date: <strong>{pmcDate}</strong>
          </p>
        ) : null}
        <div className="border-t pt-2">
          <p className="text-muted-foreground mb-1 text-xs font-semibold">Status timeline</p>
          <OrderTimeline order={order} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {order.emailStatus === "failed" ? (
            <Button
              size="icon-sm"
              variant="ghost"
              title="Retry purchase email"
              aria-label={`Retry ${order.sequence} purchase email`}
              disabled={retrying === order.id}
              onClick={() => onRetry(order)}
            >
              {retrying === order.id ? <Loader2 className="animate-spin" /> : <Send />}
            </Button>
          ) : null}
          {order.approvalEmailStatus === "failed" ? (
            <Button
              size="icon-sm"
              variant="ghost"
              title="Retry approval email"
              aria-label={`Retry ${order.sequence} approval email`}
              disabled={retrying === order.id}
              onClick={() => onRetryApproval(order)}
            >
              {retrying === order.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            title="Send reminder email mentioning PMC delivery date"
            disabled={actioning === order.id}
            onClick={() => onSendReminder(order)}
          >
            {actioning === order.id ? <Loader2 className="size-3 animate-spin" /> : <Bell className="size-3" />}
            Remind
          </Button>
          {isOrderComplete(order) ? (
            <Button
              size="sm"
              variant="default"
              title="Mark this completed order as shipped out"
              disabled={actioning === order.id}
              onClick={() => onShipOut(order)}
            >
              {actioning === order.id ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
              Ship out
            </Button>
          ) : null}
          <Button
            size="icon-sm"
            variant="ghost"
            title="Delete supplier order"
            aria-label={`Delete ${order.sequence} ${order.snapshot.supplier.name}`}
            onClick={() => onDelete(order)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** All suppliers' statuses for one project order, grouped by CA sequence. */
function ProjectOrderDetails({
  sequence,
  orders,
  onRetry,
  onRetryApproval,
  onDelete,
  onSendReminder,
  onShipOut,
  retrying,
  actioning,
}: {
  sequence: string;
  orders: readonly SampleOrder[];
  onRetry: (order: SampleOrder) => void;
  onRetryApproval: (order: SampleOrder) => void;
  onDelete: (order: SampleOrder) => void;
  onSendReminder: (order: SampleOrder) => void;
  onShipOut: (order: SampleOrder) => void;
  retrying: string | null;
  actioning: string | null;
}) {
  const projectName = orders[0]?.snapshot.project.name ?? "Unknown";
  const canvasName = orders[0]?.snapshot.canvas.name ?? "Unknown";
  const reportUrl = orders[0]?.snapshot.canvas.reportUrl ?? "#";
  return (
    <div className="bg-muted/20 grid gap-5 border-t p-5">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium">{projectName} / {canvasName}</span>
        <a
          href={reportUrl}
          target="_blank"
          rel="noreferrer"
          className="text-primary inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
        >
          Approved canvas report <ExternalLink className="size-3" />
        </a>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {orders.map((order) => (
          <SupplierCard
            key={order.id}
            order={order}
            onRetry={onRetry}
            onRetryApproval={onRetryApproval}
            onDelete={onDelete}
            onSendReminder={onSendReminder}
            onShipOut={onShipOut}
            retrying={retrying}
            actioning={actioning}
          />
        ))}
      </div>
    </div>
  );
}

function isOrderComplete(order: SampleOrder): boolean {
  return order.currentStage === "invoice";
}

function isGroupComplete(orders: readonly SampleOrder[]): boolean {
  return orders.length > 0 && orders.every(isOrderComplete);
}

export function SampleStatusDashboard() {
  const orders = useSampleOrders();
  const generate = useGenerateDemoSampleOrders();
  const deleteMutation = useDeleteSampleOrders();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [approval, setApproval] = useState("all");
  const [sort, setSort] = useState("updated-desc");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  /** Group orders by sequence (CA#). Each group = one project order sent to N suppliers. */
  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const all = orders.data ?? [];
    return Object.entries(
      all.reduce<Record<string, SampleOrder[]>>((acc, order) => {
        if (
          normalized &&
          ![order.sequence, order.snapshot.project.name, order.snapshot.supplier.name]
            .join(" ")
            .toLowerCase()
            .includes(normalized)
        ) {
          return acc;
        }
        if (stage !== "all" && order.currentStage !== stage) return acc;
        if (approval !== "all" && order.approvalStatus !== approval) return acc;
        (acc[order.sequence] ??= []).push(order);
        return acc;
      }, {}),
    )
      .map(([sequence, group]) => ({ sequence, orders: group }))
      .sort((left, right) => {
        if (sort === "ca-asc") return left.sequence.localeCompare(right.sequence);
        const leftTime = left.orders.reduce(
          (max, o) => (o.updatedAt > max ? o.updatedAt : max),
          "",
        );
        const rightTime = right.orders.reduce(
          (max, o) => (o.updatedAt > max ? o.updatedAt : max),
          "",
        );
        return sort === "updated-asc"
          ? leftTime.localeCompare(rightTime)
          : rightTime.localeCompare(leftTime);
      });
  }, [approval, orders.data, query, sort, stage]);

  const summary = useMemo(() => {
    const all = orders.data ?? [];
    const allGroups = Object.entries(
      all.reduce<Record<string, SampleOrder[]>>((acc, o) => {
        (acc[o.sequence] ??= []).push(o);
        return acc;
      }, {}),
    );
    return {
      total: all.length,
      attention: all.filter(
        (order) => order.emailStatus === "failed" || order.approvalEmailStatus === "failed",
      ).length,
      approval: all.filter((order) => order.approvalStatus === "pending").length,
      approved: all.filter((order) => order.approvalStatus === "approved").length,
      completeGroups: allGroups.filter(([, group]) => isGroupComplete(group)).length,
    };
  }, [orders.data]);

  async function retry(order: SampleOrder) {
    setRetrying(order.id);
    try {
      const token = createPublicToken();
      const updateUrl = `${window.location.origin}/sample-orders/${token}`;
      const qrCodeDataUrl = await toDataURL(updateUrl, {
        width: 180,
        margin: 1,
        errorCorrectionLevel: "M",
      });
      await getCanvasStore().rotateSampleOrderToken(order.id, {
        supplierTokenHash: await sha256Token(token),
      });
      try {
        await sendPurchaseSamplingEmail({
          to: order.recipientEmail,
          sequence: order.sequence,
          supplierName: order.snapshot.supplier.name,
          projectName: order.snapshot.project.name,
          canvasName: order.snapshot.canvas.name,
          purchaseDate: formatDate(order.purchaseSentAt),
          reportUrl: order.snapshot.canvas.reportUrl,
          updateUrl,
          qrCodeDataUrl,
          supplierDetails: order.snapshot.lines.flatMap((line) => [line.subject, ...line.details]),
        });
        await getCanvasStore().updateSampleOrderEmail(order.id, {
          status: "sent",
          error: null,
          sentAt: new Date().toISOString(),
        });
        toast.success(`Purchase email resent to ${order.recipientEmail}.`);
      } catch (error) {
        await getCanvasStore().updateSampleOrderEmail(order.id, {
          status: "failed",
          error: error instanceof Error ? error.message : "Email failed",
        });
        throw error;
      }
      await orders.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry failed.");
    } finally {
      setRetrying(null);
    }
  }

  async function retryApproval(order: SampleOrder) {
    setRetrying(order.id);
    try {
      const response = await fetch("/api/sample-orders/retry-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "Approval retry failed.";
        throw new Error(message);
      }
      toast.success(`Approval email resent to ${order.approverEmail}.`);
      await orders.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approval retry failed.");
    } finally {
      setRetrying(null);
    }
  }

  async function sendReminder(order: SampleOrder) {
    setActioning(order.id);
    try {
      const pmcDate = pmcDateFromOrder(order);
      await sendReminderEmail({
        to: order.recipientEmail,
        sequence: order.sequence,
        supplierName: order.snapshot.supplier.name,
        projectName: order.snapshot.project.name,
        canvasName: order.snapshot.canvas.name,
        currentStage: order.currentStage
          ? SAMPLE_STAGE_LABELS[order.currentStage]
          : "Not started",
        pmcDate,
        updateUrl: `${window.location.origin}/sample-orders/${createPublicToken()}`,
      });
      toast.success(`Reminder sent to ${order.snapshot.supplier.name}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reminder failed.");
    } finally {
      setActioning(null);
    }
  }

  async function shipOut(order: SampleOrder) {
    setActioning(order.id);
    try {
      const response = await fetch("/api/sample-orders/social-shipout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "Ship-out failed.";
        throw new Error(message);
      }
      toast.success(`${order.sequence} marked as shipped.`);
      await orders.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ship-out failed.");
    } finally {
      setActioning(null);
    }
  }

  async function deleteOrder(order: SampleOrder) {
    if (!window.confirm(`Delete ${order.snapshot.supplier.name} order ${order.sequence}?`)) return;
    try {
      await getCanvasStore().deleteSampleOrder(order.id);
      setSelected((current) => current.filter((id) => id !== order.id));
      toast.success(`${order.snapshot.supplier.name} order deleted.`);
      await orders.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed.");
    }
  }

  async function deleteSelected() {
    if (selected.length === 0) return;
    if (!window.confirm(`Delete ${selected.length} selected order(s)?`)) return;
    try {
      await deleteMutation.mutateAsync(selected);
      setSelected([]);
      toast.success(`${selected.length} order(s) deleted.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed.");
    }
  }

  function toggleSelected(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  if (orders.isLoading)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-72" />
      </div>
    );
  if (orders.isError)
    return (
      <div className="mx-auto flex min-h-80 max-w-xl flex-col items-center justify-center text-center">
        <AlertCircle className="text-destructive size-10" />
        <h2 className="mt-4 text-xl font-semibold">Sample Status could not load</h2>
        <p className="text-muted-foreground mt-2 text-sm">{orders.error.message}</p>
        <Button className="mt-5" variant="outline" onClick={() => void orders.refetch()}>
          <RefreshCw />
          Retry
        </Button>
      </div>
    );

  const allOrders = orders.data ?? [];

  const cards = [
    { label: "Supplier orders", value: summary.total, icon: FlaskConical },
    { label: "Needs attention", value: summary.attention, icon: AlertCircle },
    { label: "Awaiting approval", value: summary.approval, icon: Clock3 },
    { label: "Sample approved", value: summary.approved, icon: CheckCircle2 },
  ];

  return (
    <div className="mx-auto grid w-full max-w-[1500px] gap-6">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
            Sampling operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sample Status</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            Every supplier purchase order, progress update, shipment, and physical-sample decision
            in one place.
          </p>
        </div>
        {usingLocalStore ? (
          <Button
            variant="outline"
            disabled={generate.isPending}
            onClick={() => generate.mutate(10)}
          >
            {generate.isPending ? <Loader2 className="animate-spin" /> : <FlaskConical />}Generate
            10 demo orders
          </Button>
        ) : null}
      </header>

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Sample order summary"
      >
        {cards.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="overflow-hidden">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  {label}
                </p>
                <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
              </div>
              <span className="bg-primary/10 text-primary rounded-xl p-3">
                <Icon className="size-5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="bg-background overflow-hidden rounded-xl border shadow-sm">
        <div className="grid gap-3 border-b p-4 lg:grid-cols-[minmax(240px,1fr)_180px_180px_180px]">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search CA, project, supplier"
              aria-label="Search sample orders"
              className="pl-9"
            />
          </div>
          <Select value={stage} onValueChange={(value) => setStage(value ?? "all")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {SUPPLIER_UPDATE_STAGES.map((value) => (
                <SelectItem key={value} value={value}>
                  {SAMPLE_STAGE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={approval} onValueChange={(value) => setApproval(value ?? "all")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All approvals</SelectItem>
              {["not_requested", "pending", "approved", "rejected"].map((value) => (
                <SelectItem key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => setSort(value ?? "updated-desc")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated-desc">Newest update</SelectItem>
              <SelectItem value="updated-asc">Oldest update</SelectItem>
              <SelectItem value="ca-asc">CA number</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selected.length > 0 ? (
          <div className="bg-muted/30 flex items-center justify-between gap-3 border-b px-4 py-2 text-sm">
            <span>{selected.length} selected</span>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => void deleteSelected()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete selected
            </Button>
          </div>
        ) : null}

        {groups.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
            <PackageCheck className="text-muted-foreground size-10" />
            <h2 className="mt-4 font-semibold">No sample orders found</h2>
            <p className="text-muted-foreground mt-2 max-w-md text-sm">
              Send a supplier purchase order from an approved canvas
              {usingLocalStore ? " or generate demo orders" : ""}.
            </p>
          </div>
        ) : (
          <div>
            <div className="bg-muted/30 text-muted-foreground hidden grid-cols-[40px_110px_minmax(150px,1fr)_minmax(150px,1fr)_110px_100px_90px] gap-3 border-b px-4 py-3 text-xs font-semibold tracking-wide uppercase md:grid">
              <span />
              <span>CA number</span>
              <span>Project / canvas</span>
              <span>Suppliers</span>
              <span>Order status</span>
              <span>Status</span>
              <span className="text-right">Action</span>
            </div>
            {groups.map(({ sequence, orders: groupOrders }) => {
              const isExpanded = expanded === sequence;
              const suppliersSummary = groupOrders
                .map((o) => o.snapshot.supplier.name)
                .join(", ");
              const allStages = groupOrders
                .map((o) => o.currentStage)
                .filter((s): s is SampleStage => s !== null);
              const worstStage = allStages.length
                ? allStages.reduce((a, b) =>
                    SAMPLE_STAGES.indexOf(a) <= SAMPLE_STAGES.indexOf(b) ? a : b,
                  )
                : null;
              const groupComplete = isGroupComplete(groupOrders);
              const allGroupSelected = groupOrders.every((o) => selected.includes(o.id));
              function toggleGroup() {
                const ids = groupOrders.map((o) => o.id);
                if (allGroupSelected) {
                  setSelected((cur) => cur.filter((id) => !ids.includes(id)));
                } else {
                  setSelected((cur) => [...new Set([...cur, ...ids])]);
                }
              }
              return (
                <article key={sequence} className="border-b last:border-b-0">
                  <div className="grid gap-3 p-4 md:grid-cols-[40px_110px_minmax(150px,1fr)_minmax(150px,1fr)_110px_100px_90px] md:items-center">
                    <input
                      type="checkbox"
                      aria-label={`Select all ${sequence} orders`}
                      checked={allGroupSelected}
                      onChange={toggleGroup}
                      className="size-4"
                    />
                    <div>
                      <span className="text-muted-foreground text-xs md:hidden">CA number</span>
                      <p className="font-mono text-sm font-semibold">{sequence}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs md:hidden">
                        Project / canvas
                      </span>
                      <p className="font-medium">{groupOrders[0]?.snapshot.project.name}</p>
                      <p className="text-muted-foreground text-sm">
                        {groupOrders[0]?.snapshot.canvas.name}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs md:hidden">Suppliers</span>
                      <p className="font-medium">{suppliersSummary}</p>
                      <p className="text-muted-foreground text-sm">
                        {groupOrders.length} supplier{groupOrders.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground mr-2 text-xs md:hidden">Order status</span>
                      {groupComplete ? (
                        <Badge variant="default" className="bg-emerald-600">Complete</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800">Pending</Badge>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground mr-2 text-xs md:hidden">Status</span>
                      {worstStage ? (
                        <StatusBadge value={worstStage} kind="stage" />
                      ) : (
                        <Badge variant="outline">Not started</Badge>
                      )}
                    </div>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? "Hide" : "Show"} ${sequence} details`}
                        onClick={() => setExpanded(isExpanded ? null : sequence)}
                      >
                        {isExpanded ? <ChevronUp /> : <ChevronDown />}
                      </Button>
                    </div>
                  </div>
                  <div className={cn(!isExpanded && "hidden")}>
                    {isExpanded ? (
                      <ProjectOrderDetails
                        sequence={sequence}
                        orders={groupOrders}
                        onRetry={retry}
                        onRetryApproval={retryApproval}
                        onDelete={deleteOrder}
                        onSendReminder={sendReminder}
                        onShipOut={shipOut}
                        retrying={retrying}
                        actioning={actioning}
                      />
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
