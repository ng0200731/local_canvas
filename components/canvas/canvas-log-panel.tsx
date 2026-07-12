"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, ListChecks, Loader2 } from "lucide-react";

import { buildCanvasReport } from "@/lib/canvas-report";
import { useCustomers, useProducts, useSuppliers } from "@/lib/hooks/use-workspace-records";
import { getCanvasStore, type Canvas, type ImageRecord, type Project } from "@/lib/store";

export function CanvasLogPanel({ canvas, project }: { canvas: Canvas; project: Project | null }) {
  const customers = useCustomers();
  const suppliers = useSuppliers();
  const products = useProducts();
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loadedImagesCanvasId, setLoadedImagesCanvasId] = useState<string | null>(null);

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

  const report = useMemo(
    () =>
      buildCanvasReport({
        canvas,
        project,
        customers: customers.data ?? [],
        suppliers: suppliers.data ?? [],
        products: products.data ?? [],
        images,
      }),
    [canvas, customers.data, images, products.data, project, suppliers.data],
  );

  const loading =
    customers.isLoading ||
    suppliers.isLoading ||
    products.isLoading ||
    loadedImagesCanvasId !== canvas.id;

  return (
    <aside className="bg-card hidden w-80 shrink-0 border-l lg:flex lg:flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <ListChecks className="size-4" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Log</p>
          <p className="text-muted-foreground truncate text-xs">Canvas report steps</p>
        </div>
        {loading ? <Loader2 className="text-muted-foreground ml-auto size-4 animate-spin" /> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid gap-4">
          <section className="rounded-lg border p-3">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Header
            </p>
            <p className="mt-2 text-sm font-medium">{report.project.customerName}</p>
            <p className="text-muted-foreground text-xs">{report.project.employeeEmail}</p>
            <p className="text-muted-foreground text-xs">
              {report.project.currency} / {report.project.destination}
            </p>
          </section>

          <section>
            <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              Report menu
            </p>
            <div className="grid gap-2">
              {report.sections.map((section) => (
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
                        <p key={block.id} className="text-muted-foreground truncate text-xs">
                          {block.title}
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
              {report.steps.map((step) => (
                <article key={step.id} className="bg-background rounded-lg border p-3">
                  <p className="text-xs font-semibold">{step.title}</p>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">{step.detail}</p>
                </article>
              ))}
              {report.steps.length === 0 ? (
                <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
                  No canvas actions yet. Add nodes or links to build the report log.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}
