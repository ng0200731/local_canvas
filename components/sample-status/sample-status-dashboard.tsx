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
import { sendPurchaseSamplingEmail } from "@/lib/email/client";
import { useGenerateDemoSampleOrders, useSampleOrders } from "@/lib/hooks/use-sample-orders";
import {
  SAMPLE_STAGES,
  SAMPLE_STAGE_LABELS,
  createPublicToken,
  payloadSummary,
  sha256Token,
  type SampleOrder,
} from "@/lib/sample-orders";
import { getCanvasStore, usingLocalStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not set";
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

function OrderDetails({ order }: { order: SampleOrder }) {
  return (
    <div className="bg-muted/20 grid gap-5 border-t p-5 lg:grid-cols-3">
      <section>
        <h3 className="text-sm font-semibold">Supplier contacts</h3>
        <div className="mt-3 grid gap-2 text-sm">
          {order.snapshot.supplier.employees.map((employee) => (
            <div key={employee.email} className="bg-background rounded-lg border p-3">
              <p className="font-medium">
                {employee.name} · {employee.title}
              </p>
              <p className="text-muted-foreground mt-1 break-all">{employee.email}</p>
              <p className="text-muted-foreground">{employee.tel}</p>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3 className="text-sm font-semibold">Purchase lines</h3>
        <div className="mt-3 grid gap-2">
          {order.snapshot.lines.map((line) => (
            <div key={line.nodeId} className="bg-background rounded-lg border p-3 text-sm">
              <p className="font-medium">{line.subject}</p>
              <ul className="text-muted-foreground mt-1 grid gap-0.5 text-xs">
                {line.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <a
          href={order.snapshot.canvas.reportUrl}
          target="_blank"
          rel="noreferrer"
          className="text-primary mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-medium hover:underline"
        >
          Approved canvas report <ExternalLink className="size-4" />
        </a>
      </section>
      <section>
        <h3 className="text-sm font-semibold">Status timeline</h3>
        {order.updates.length ? (
          <ol className="mt-3 grid gap-3">
            {order.updates.map((update) => (
              <li key={update.id} className="border-primary/25 border-l-2 pl-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{SAMPLE_STAGE_LABELS[update.stage]}</span>
                  <time className="text-muted-foreground text-xs">
                    {formatDate(update.createdAt)}
                  </time>
                </div>
                <p className="text-muted-foreground mt-1">{payloadSummary(update.payload)}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            Awaiting the supplier’s first update.
          </p>
        )}
      </section>
    </div>
  );
}

export function SampleStatusDashboard() {
  const orders = useSampleOrders();
  const generate = useGenerateDemoSampleOrders();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [approval, setApproval] = useState("all");
  const [sort, setSort] = useState("updated-desc");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...(orders.data ?? [])]
      .filter((order) => {
        const searchable = [
          order.sequence,
          order.snapshot.project.name,
          order.snapshot.canvas.name,
          order.snapshot.supplier.name,
        ]
          .join(" ")
          .toLowerCase();
        return (
          (!normalized || searchable.includes(normalized)) &&
          (stage === "all" || order.currentStage === stage) &&
          (approval === "all" || order.approvalStatus === approval)
        );
      })
      .sort((left, right) =>
        sort === "updated-asc"
          ? left.updatedAt.localeCompare(right.updatedAt)
          : sort === "ca-asc"
            ? left.sequence.localeCompare(right.sequence)
            : right.updatedAt.localeCompare(left.updatedAt),
      );
  }, [approval, orders.data, query, sort, stage]);

  const summary = useMemo(() => {
    const all = orders.data ?? [];
    return {
      total: all.length,
      attention: all.filter(
        (order) => order.emailStatus === "failed" || order.approvalEmailStatus === "failed",
      ).length,
      approval: all.filter((order) => order.approvalStatus === "pending").length,
      approved: all.filter((order) => order.approvalStatus === "approved").length,
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
              placeholder="Search CA, project, canvas, supplier"
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
              {SAMPLE_STAGES.map((value) => (
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

        {filtered.length === 0 ? (
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
            <div className="bg-muted/30 text-muted-foreground hidden grid-cols-[110px_minmax(150px,1fr)_minmax(150px,1fr)_150px_140px_150px_80px] gap-3 border-b px-4 py-3 text-xs font-semibold tracking-wide uppercase md:grid">
              <span>CA number</span>
              <span>Project / canvas</span>
              <span>Supplier</span>
              <span>Stage</span>
              <span>Email</span>
              <span>Approval</span>
              <span className="text-right">Action</span>
            </div>
            {filtered.map((order) => {
              const isExpanded = expanded === order.id;
              return (
                <article key={order.id} className="border-b last:border-b-0">
                  <div className="grid gap-3 p-4 md:grid-cols-[110px_minmax(150px,1fr)_minmax(150px,1fr)_150px_140px_150px_80px] md:items-center">
                    <div>
                      <span className="text-muted-foreground text-xs md:hidden">CA number</span>
                      <p className="font-mono text-sm font-semibold">{order.sequence}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs md:hidden">
                        Project / canvas
                      </span>
                      <p className="font-medium">{order.snapshot.project.name}</p>
                      <p className="text-muted-foreground text-sm">{order.snapshot.canvas.name}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs md:hidden">Supplier</span>
                      <p className="font-medium">{order.snapshot.supplier.name}</p>
                      <p className="text-muted-foreground text-sm break-all">
                        {order.recipientEmail}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground mr-2 text-xs md:hidden">Stage</span>
                      {order.currentStage ? (
                        <StatusBadge value={order.currentStage} kind="stage" />
                      ) : (
                        <Badge variant="outline">Not started</Badge>
                      )}
                      <p className="text-muted-foreground mt-1 text-xs">
                        {formatDate(order.latestUpdateAt)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground mr-2 text-xs md:hidden">Email</span>
                      <StatusBadge value={order.emailStatus} kind="email" />
                      {order.emailError ? (
                        <p
                          className="text-destructive mt-1 line-clamp-2 text-xs"
                          title={order.emailError}
                        >
                          {order.emailError}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <span className="text-muted-foreground mr-2 text-xs md:hidden">Approval</span>
                      <StatusBadge value={order.approvalStatus} kind="approval" />
                    </div>
                    <div className="flex justify-end gap-1">
                      {order.emailStatus === "failed" ? (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="Retry purchase email"
                          aria-label={`Retry ${order.sequence} purchase email`}
                          disabled={retrying === order.id}
                          onClick={() => void retry(order)}
                        >
                          {retrying === order.id ? <Loader2 className="animate-spin" /> : <Send />}
                        </Button>
                      ) : null}
                      {order.approvalEmailStatus === "failed" ? (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="Retry physical-sample approval email"
                          aria-label={`Retry ${order.sequence} approval email`}
                          disabled={retrying === order.id}
                          onClick={() => void retryApproval(order)}
                        >
                          {retrying === order.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <RefreshCw />
                          )}
                        </Button>
                      ) : null}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? "Hide" : "Show"} ${order.sequence} details`}
                        onClick={() => setExpanded(isExpanded ? null : order.id)}
                      >
                        {isExpanded ? <ChevronUp /> : <ChevronDown />}
                      </Button>
                    </div>
                  </div>
                  <div className={cn(!isExpanded && "hidden")}>
                    {isExpanded ? <OrderDetails order={order} /> : null}
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
