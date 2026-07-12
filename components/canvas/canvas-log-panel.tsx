"use client";

import { useEffect, useMemo, useState } from "react";
import { ListChecks, Loader2 } from "lucide-react";

import { buildCanvasReport } from "@/lib/canvas-report";
import { useCustomers, useProducts, useSuppliers } from "@/lib/hooks/use-workspace-records";
import { getCanvasStore, type Canvas, type ImageRecord, type Project } from "@/lib/store";

export function CanvasLogPanel({
  canvas,
  project,
}: {
  canvas: Canvas;
  project: Project | null;
}) {
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
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Header
            </p>
            <p className="mt-2 text-sm font-medium">{report.project.customerName}</p>
            <p className="text-muted-foreground text-xs">{report.project.employeeEmail}</p>
            <p className="text-muted-foreground text-xs">
              {report.project.currency} / {report.project.destination}
            </p>
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Detailed steps
            </p>
            <div className="grid gap-2">
              {report.steps.map((step) => (
                <article key={step.id} className="rounded-lg border bg-background p-3">
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
