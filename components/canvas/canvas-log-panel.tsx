"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, ListChecks, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCustomers, useProducts, useSuppliers } from "@/lib/hooks/use-workspace-records";
import { getCanvasStore, type Canvas, type ImageRecord, type Project } from "@/lib/store";
import type { CanvasEdge, CanvasNode, NodeType } from "@/lib/nodes/types";
import { cn } from "@/lib/utils";

interface LogSection {
  id: string;
  title: string;
  blocks: string[];
}

interface LogStep {
  id: string;
  title: string;
  detail: string;
}

function nodeTitle(node: CanvasNode | undefined): string {
  if (!node) return "Unknown node";
  const label = typeof node.data.label === "string" ? node.data.label : "";
  const alias = typeof node.data.alias === "string" ? node.data.alias : "";
  const prompt = typeof node.data.prompt === "string" ? node.data.prompt : "";
  return label || alias || prompt.slice(0, 48) || node.type;
}

function countByType(nodes: readonly CanvasNode[], type: NodeType): number {
  return nodes.filter((node) => node.type === type).length;
}

function buildLogSections(
  nodes: readonly CanvasNode[],
  images: readonly ImageRecord[],
): LogSection[] {
  return [
    {
      id: "supplier-breakdown",
      title: "Supplier breakdown",
      blocks:
        countByType(nodes, "suppler") > 0 ? [`${countByType(nodes, "suppler")} suppliers`] : [],
    },
    {
      id: "customer-products",
      title: "Product list",
      blocks:
        countByType(nodes, "product") > 0 ? [`${countByType(nodes, "product")} products`] : [],
    },
    {
      id: "pantone",
      title: "Pantone",
      blocks: countByType(nodes, "pantone") > 0 ? [`${countByType(nodes, "pantone")} colors`] : [],
    },
    {
      id: "generic-node",
      title: "Generic node",
      blocks:
        countByType(nodes, "imageInput") > 0 ? [`${countByType(nodes, "imageInput")} inputs`] : [],
    },
    {
      id: "output-prompt",
      title: "Output and input prompt",
      blocks: [
        countByType(nodes, "generate") > 0 ? `${countByType(nodes, "generate")} prompts` : "",
        countByType(nodes, "imageOutput") > 0 ? `${countByType(nodes, "imageOutput")} outputs` : "",
        images.length > 0 ? `${images.length} renders` : "",
      ].filter(Boolean),
    },
  ];
}

function buildLogSteps(nodes: readonly CanvasNode[], edges: readonly CanvasEdge[]): LogStep[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
  return [
    ...nodes.slice(0, 80).map((node, index) => ({
      id: `node-${node.id}`,
      title: `${index + 1}. ${node.type} node`,
      detail: `Created ${nodeTitle(node)}.`,
    })),
    ...edges.slice(0, 80).map((edge, index) => ({
      id: `edge-${edge.id}`,
      title: `Link ${index + 1}`,
      detail: `${nodeTitle(nodesById.get(edge.source))} -> ${nodeTitle(nodesById.get(edge.target))}`,
    })),
  ];
}

export function CanvasLogPanel({ canvas, project }: { canvas: Canvas; project: Project | null }) {
  const customers = useCustomers();
  const suppliers = useSuppliers();
  const products = useProducts();
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loadedImagesCanvasId, setLoadedImagesCanvasId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let active = true;
    getCanvasStore()
      .listImages(canvas.id)
      .then((records) => {
        if (!active) return;
        setImages(records);
        setLoadedImagesCanvasId(canvas.id);
      })
      .catch(() => {
        if (!active) return;
        setImages([]);
        setLoadedImagesCanvasId(canvas.id);
      });
    return () => {
      active = false;
    };
  }, [canvas.id]);

  const sections = useMemo(
    () => buildLogSections(canvas.content.nodes, images),
    [canvas.content.nodes, images],
  );
  const steps = useMemo(
    () => buildLogSteps(canvas.content.nodes, canvas.content.edges),
    [canvas.content.edges, canvas.content.nodes],
  );
  const customerName =
    project?.customerName ??
    customers.data?.find((customer) => customer.id === project?.customerId)?.company.companyName ??
    "Not set";
  const employeeEmail = project?.employeeEmail ?? "Not set";
  const currency =
    [project?.currencyCode, project?.currencySymbol].filter(Boolean).join(" ") || "Not set";
  const destination = project?.destinationCountryName ?? "Not set";

  const loading =
    customers.isLoading ||
    suppliers.isLoading ||
    products.isLoading ||
    loadedImagesCanvasId !== canvas.id;

  return (
    <aside
      className={cn(
        "bg-card relative hidden shrink-0 border-l transition-[width] duration-200 ease-out lg:flex lg:flex-col",
        collapsed ? "w-10" : "w-80",
      )}
    >
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        className="bg-card absolute top-1/2 -left-3 z-20 size-6 -translate-y-1/2 rounded-full shadow-sm"
        aria-label={collapsed ? "Expand log panel" : "Collapse log panel"}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((value) => !value)}
      >
        {collapsed ? <ChevronLeft className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </Button>

      {collapsed ? (
        <div className="flex flex-1 flex-col items-center gap-3 py-4">
          <ListChecks className="size-4" />
          <p
            className="text-muted-foreground text-[0.65rem] font-semibold tracking-wide uppercase"
            style={{ writingMode: "vertical-rl" }}
          >
            Log
          </p>
          {loading ? <Loader2 className="text-muted-foreground size-3.5 animate-spin" /> : null}
        </div>
      ) : (
        <>
          <div className="flex h-14 items-center gap-2 border-b px-4">
            <ListChecks className="size-4" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Log</p>
              <p className="text-muted-foreground truncate text-xs">Canvas report steps</p>
            </div>
            {loading ? (
              <Loader2 className="text-muted-foreground ml-auto size-4 animate-spin" />
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="grid gap-4">
              <section className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  Header
                </p>
                <p className="mt-2 text-sm font-medium">{customerName}</p>
                <p className="text-muted-foreground text-xs">{employeeEmail}</p>
                <p className="text-muted-foreground text-xs">
                  {currency} / {destination}
                </p>
              </section>

              <section>
                <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                  Report menu
                </p>
                <div className="grid gap-2">
                  {sections.map((section) => (
                    <article key={section.id} className="bg-background rounded-lg border p-3">
                      <div className="flex items-center gap-2">
                        <FileText className="text-muted-foreground size-3.5" />
                        <p className="text-xs font-semibold">{section.title}</p>
                        <span className="text-muted-foreground ml-auto text-[0.65rem]">
                          {section.blocks.length}
                        </span>
                      </div>
                      {section.blocks.length ? (
                        <div className="mt-2 grid gap-1">
                          {section.blocks.slice(0, 4).map((block) => (
                            <p key={block} className="text-muted-foreground truncate text-xs">
                              {block}
                            </p>
                          ))}
                          {section.blocks.length > 4 ? (
                            <p className="text-muted-foreground text-xs">
                              +{section.blocks.length - 4} more
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-muted-foreground mt-2 text-xs">No records yet.</p>
                      )}
                    </article>
                  ))}
                </div>
              </section>

              <section>
                <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                  Detailed steps
                </p>
                <div className="grid gap-2">
                  {steps.map((step) => (
                    <article key={step.id} className="bg-background rounded-lg border p-3">
                      <p className="text-xs font-semibold">{step.title}</p>
                      <p className="text-muted-foreground mt-1 text-xs leading-5">{step.detail}</p>
                    </article>
                  ))}
                  {steps.length === 0 ? (
                    <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
                      No canvas actions yet. Add nodes or links to build the report log.
                    </p>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
