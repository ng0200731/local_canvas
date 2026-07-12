"use client";

import { type NodeProps } from "@xyflow/react";
import { Package, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProducts, useSuppliers } from "@/lib/hooks/use-workspace-records";
import { NODE_PORT_COLORS } from "@/lib/nodes/ports";
import type { SupplerCanvasNode } from "@/lib/nodes/types";
import {
  supplierProductTypeLabels,
  supplierProductTypes,
  type SupplierProductType,
} from "@/lib/workspace-records";
import { cn } from "@/lib/utils";
import { useCanvasActions, useConnectionHighlight, useGroupAccent } from "../canvas-context";
import { NodeDeleteButton } from "./delete-button";
import { InputPort, OutputPort } from "./port";
import { ResizeHandle } from "./resize-handle";

const DEFAULT_WIDTH = 280;
const DEFAULT_HEIGHT = 320;

function normalizeQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function fuzzyIncludes(value: string, query: string): boolean {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return true;
  const normalizedValue = normalizeQuery(value);
  if (normalizedValue.includes(normalizedQuery)) return true;

  let queryIndex = 0;
  for (const character of normalizedValue) {
    if (character === normalizedQuery[queryIndex]) queryIndex += 1;
    if (queryIndex === normalizedQuery.length) return true;
  }
  return false;
}

export function SupplerNode({ id, data, parentId, selected }: NodeProps<SupplerCanvasNode>) {
  const { updateNodeData } = useCanvasActions();
  const highlight = useConnectionHighlight(id);
  const accent = useGroupAccent(parentId);
  const suppliers = useSuppliers();
  const products = useProducts();
  const width = data.width ?? DEFAULT_WIDTH;
  const height = data.height ?? DEFAULT_HEIGHT;
  const selectedProductType = data.selectedProductType;
  const productTypeQuery = data.productTypeQuery ?? "";
  const supplierQuery = data.supplierQuery ?? "";
  const supplierProducts = products.data ?? [];
  const productTypes = supplierProductTypes.filter((productType) =>
    fuzzyIncludes(supplierProductTypeLabels[productType], productTypeQuery),
  );

  const matchingSuppliers = (suppliers.data ?? [])
    .filter((supplier) =>
      selectedProductType ? supplier.company.productTypes.includes(selectedProductType) : true,
    )
    .filter((supplier) =>
      fuzzyIncludes(
        [
          supplier.company.companyName,
          supplier.company.emailDomainSuffix,
          supplier.company.productTypes.map((type) => supplierProductTypeLabels[type]).join(" "),
        ].join(" "),
        supplierQuery,
      ),
    )
    .map((supplier) => {
      const variantCount = supplierProducts
        .filter(
          (product) =>
            product.supplierId === supplier.id &&
            (!selectedProductType || product.productType === selectedProductType),
        )
        .reduce(
          (total, product) =>
            total + product.variants.filter((variant) => variant.image !== null).length,
          0,
        );
      return { supplier, variantCount };
    });

  function selectProductType(productType: SupplierProductType) {
    updateNodeData(id, {
      selectedProductType: productType,
      productTypeQuery: supplierProductTypeLabels[productType],
      supplierId: null,
      supplierName: null,
      supplierQuery: "",
    });
  }

  return (
    <div
      style={{
        width,
        height,
        ...(accent ? { outline: `2px solid ${accent}`, outlineOffset: 2 } : {}),
        ...highlight,
      }}
      className={cn(
        "group bg-card relative flex flex-col gap-3 overflow-hidden rounded-lg border p-3 shadow-md",
        selected && "ring-primary ring-offset-background shadow-lg ring-2 ring-offset-2",
      )}
    >
      <NodeDeleteButton id={id} />
      <InputPort color={NODE_PORT_COLORS.suppler} />
      <div className="flex items-center gap-2 pr-7 text-sm font-medium">
        <Package className="size-4" />
        Supplier
      </div>

      <div className="grid gap-1.5">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <Input
            data-new-node-focus-field
            value={productTypeQuery}
            onChange={(event) =>
              updateNodeData(id, {
                productTypeQuery: event.target.value,
                selectedProductType: null,
                supplierId: null,
                supplierName: null,
              })
            }
            placeholder="Search product type"
            aria-label="Search supplier product type"
            className="nodrag h-8 pl-7 text-xs"
          />
          {selectedProductType ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Clear product type"
              className="nodrag absolute top-1/2 right-1 size-6 -translate-y-1/2"
              onClick={() =>
                updateNodeData(id, {
                  selectedProductType: null,
                  productTypeQuery: "",
                  supplierId: null,
                  supplierName: null,
                })
              }
            >
              <X className="size-3" />
            </Button>
          ) : null}
        </div>
        <div className="bg-background max-h-28 overflow-y-auto rounded-md border">
          {productTypes.map((productType) => (
            <button
              key={productType}
              type="button"
              className={cn(
                "nodrag hover:bg-muted/50 flex w-full items-center justify-between px-2 py-1.5 text-left text-xs",
                selectedProductType === productType && "bg-muted",
              )}
              onClick={() => selectProductType(productType)}
            >
              <span>{supplierProductTypeLabels[productType]}</span>
            </button>
          ))}
          {productTypes.length === 0 ? (
            <p className="text-muted-foreground px-2 py-3 text-xs">No product type found.</p>
          ) : null}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-1.5">
        <Input
          value={supplierQuery}
          onChange={(event) => updateNodeData(id, { supplierQuery: event.target.value })}
          placeholder="Search matching supplier"
          aria-label="Search matching supplier"
          className="nodrag h-8 text-xs"
          disabled={!selectedProductType}
        />
        <div className="bg-background min-h-0 flex-1 overflow-y-auto rounded-md border">
          {!selectedProductType ? (
            <p className="text-muted-foreground px-2 py-3 text-xs">
              Select one product type first.
            </p>
          ) : suppliers.isLoading || products.isLoading ? (
            <p className="text-muted-foreground px-2 py-3 text-xs">Loading suppliers...</p>
          ) : matchingSuppliers.length ? (
            matchingSuppliers.map(({ supplier, variantCount }) => (
              <button
                key={supplier.id}
                type="button"
                className={cn(
                  "nodrag hover:bg-muted/50 flex w-full items-start justify-between gap-2 px-2 py-2 text-left text-xs",
                  data.supplierId === supplier.id && "bg-muted",
                )}
                onClick={() =>
                  updateNodeData(id, {
                    supplierId: supplier.id,
                    supplierName: supplier.company.companyName,
                    supplierQuery: supplier.company.companyName,
                  })
                }
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{supplier.company.companyName}</span>
                  <span className="text-muted-foreground block truncate">
                    {variantCount} image{variantCount === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="text-muted-foreground px-2 py-3 text-xs">No matching supplier.</p>
          )}
        </div>
      </div>

      <OutputPort color={NODE_PORT_COLORS.suppler} />
      <ResizeHandle nodeId={id} width={width} height={height} minWidth={240} minHeight={260} />
    </div>
  );
}
