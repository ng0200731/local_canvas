"use client";

import { type NodeProps } from "@xyflow/react";
import { BookOpen, ImageIcon, PackageOpen, Search, X } from "lucide-react";

import { ImagePreviewDialog } from "@/components/image-preview-dialog";
import { ProductImageBrowserDialog } from "@/components/product-image-browser-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCustomers, useProducts } from "@/lib/hooks/use-workspace-records";
import { NODE_PORT_COLORS } from "@/lib/nodes/ports";
import type { ProductCanvasNode } from "@/lib/nodes/types";
import {
  getProductImageGalleryItems,
  type ProductImageGalleryItem,
} from "@/lib/product-image-gallery";
import { cn } from "@/lib/utils";
import { useCanvasActions, useConnectionHighlight, useGroupAccent } from "../canvas-context";
import { NodeDeleteButton } from "./delete-button";
import { InputPort, OutputPort } from "./port";
import { ResizeHandle } from "./resize-handle";

const DEFAULT_WIDTH = 280;
const DEFAULT_HEIGHT = 420;

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

export function ProductNode({ id, data, parentId, selected }: NodeProps<ProductCanvasNode>) {
  const { updateNodeData } = useCanvasActions();
  const highlight = useConnectionHighlight(id);
  const accent = useGroupAccent(parentId);
  const customers = useCustomers();
  const products = useProducts();
  const width = data.width ?? DEFAULT_WIDTH;
  const height = data.height ?? DEFAULT_HEIGHT;
  const alias = typeof data.alias === "string" ? data.alias : "product";
  const customerQuery = data.customerQuery ?? "";
  const customerProducts = (products.data ?? []).filter(
    (product) => product.ownerKind === "customer",
  );
  const selectedCustomerProducts = customerProducts.filter(
    (product) => product.customerId === data.customerId,
  );
  const selectedGalleryItemId =
    data.productId && data.variantId ? `${data.productId}:${data.variantId}` : null;
  const selectedGalleryItems = getProductImageGalleryItems(selectedCustomerProducts);
  const selectedGalleryIndex = selectedGalleryItemId
    ? selectedGalleryItems.findIndex((item) => item.id === selectedGalleryItemId)
    : 0;
  const matchingCustomers = (customers.data ?? [])
    .filter((customer) =>
      fuzzyIncludes(
        [
          customer.company.companyName,
          customer.company.emailDomainSuffix,
          customer.company.type,
        ].join(" "),
        customerQuery,
      ),
    )
    .map((customer) => {
      const imageCount = customerProducts
        .filter((product) => product.customerId === customer.id)
        .reduce(
          (total, product) =>
            total + product.variants.filter((variant) => variant.image !== null).length,
          0,
        );
      return { customer, imageCount };
    });

  function selectProductImage(item: ProductImageGalleryItem) {
    updateNodeData(id, {
      productId: item.product.id,
      productSubject: item.product.subject,
      variantId: item.variant.id,
      variantImageUrl: item.variant.image.url,
      variantImageName: item.variant.image.name,
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
      <InputPort color={NODE_PORT_COLORS.product} />
      <div className="flex items-center gap-2 pr-7 text-sm font-medium">
        <PackageOpen className="size-4" />
        Product
      </div>

      <Input
        data-new-node-focus-field
        value={alias}
        onChange={(event) => updateNodeData(id, { alias: event.target.value })}
        placeholder="alias"
        aria-label="Product image alias"
        className="nodrag h-8 text-xs"
      />

      <div className="grid min-h-0 flex-1 gap-1.5">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
          <Input
            value={customerQuery}
            onChange={(event) =>
              updateNodeData(id, {
                customerQuery: event.target.value,
                customerId: null,
                customerName: null,
                productId: null,
                productSubject: null,
                variantId: null,
                variantImageUrl: null,
                variantImageName: null,
              })
            }
            placeholder="Search customer"
            aria-label="Search customer"
            className="nodrag h-8 pl-7 text-xs"
          />
          {data.customerId ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Clear customer"
              className="nodrag absolute top-1/2 right-1 size-6 -translate-y-1/2"
              onClick={() =>
                updateNodeData(id, {
                  customerQuery: "",
                  customerId: null,
                  customerName: null,
                  productId: null,
                  productSubject: null,
                  variantId: null,
                  variantImageUrl: null,
                  variantImageName: null,
                })
              }
            >
              <X className="size-3" />
            </Button>
          ) : null}
        </div>
        <div className="bg-background min-h-0 flex-1 overflow-y-auto rounded-md border">
          {customers.isLoading || products.isLoading ? (
            <p className="text-muted-foreground px-2 py-3 text-xs">Loading customers...</p>
          ) : matchingCustomers.length ? (
            matchingCustomers.map(({ customer, imageCount }) => (
              <button
                key={customer.id}
                type="button"
                className={cn(
                  "nodrag hover:bg-muted/50 flex w-full items-start justify-between gap-2 px-2 py-2 text-left text-xs",
                  data.customerId === customer.id && "bg-muted",
                )}
                onClick={() =>
                  updateNodeData(id, {
                    customerId: customer.id,
                    customerName: customer.company.companyName,
                    customerQuery: customer.company.companyName,
                    productId: null,
                    productSubject: null,
                    variantId: null,
                    variantImageUrl: null,
                    variantImageName: null,
                  })
                }
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{customer.company.companyName}</span>
                  <span className="text-muted-foreground block truncate">
                    {imageCount} image{imageCount === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="text-muted-foreground px-2 py-3 text-xs">No matching customer.</p>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground truncate text-xs">
            {data.customerName ?? "No customer confirmed"}
          </p>
          {data.customerId ? (
            <ProductImageBrowserDialog
              products={selectedCustomerProducts}
              title={`${data.customerName ?? "Customer"} product images`}
              selectedItemId={selectedGalleryItemId}
              onSelect={selectProductImage}
              trigger={
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label="Open customer product image book"
                  title="Open customer product image book"
                  className="nodrag"
                  disabled={selectedCustomerProducts.length === 0}
                >
                  <BookOpen />
                </Button>
              }
            />
          ) : null}
        </div>
        {data.variantImageUrl ? (
          <div className="bg-muted overflow-hidden rounded-md border">
            <ImagePreviewDialog
              src={data.variantImageUrl}
              alt={data.variantImageName ?? data.productSubject ?? "Selected customer product"}
              title={data.productSubject ?? data.variantImageName ?? "Selected product image"}
              gallery={
                selectedGalleryItems.length
                  ? selectedGalleryItems.map((item) => ({
                      id: item.id,
                      src: item.variant.image.url,
                      alt: item.variant.image.name,
                    }))
                  : undefined
              }
              initialIndex={selectedGalleryIndex >= 0 ? selectedGalleryIndex : 0}
              selectedItemId={selectedGalleryItemId}
              selectLabel="Select image"
              selectedLabel="Selected"
              onSelect={(_item, index) => {
                const galleryItem = selectedGalleryItems[index];
                if (galleryItem) selectProductImage(galleryItem);
              }}
              trigger={
                <button
                  type="button"
                  className="nodrag nopan focus-visible:ring-ring block w-full cursor-zoom-in overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset"
                  aria-label="Open selected product image preview"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={data.variantImageUrl}
                    alt={
                      data.variantImageName ?? data.productSubject ?? "Selected customer product"
                    }
                    className="aspect-video w-full object-contain"
                  />
                </button>
              }
            />
            <div className="flex items-center justify-between gap-2 p-2">
              <span className="min-w-0 truncate text-xs font-medium">
                {data.productSubject ?? data.variantImageName ?? "Selected image"}
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Remove selected product image"
                className="nodrag"
                onClick={() =>
                  updateNodeData(id, {
                    productId: null,
                    productSubject: null,
                    variantId: null,
                    variantImageUrl: null,
                    variantImageName: null,
                  })
                }
              >
                <X />
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground bg-muted/50 grid min-h-20 place-items-center rounded-md border border-dashed text-xs">
            <span className="inline-flex items-center gap-2">
              <ImageIcon className="size-4" />
              Select image from book
            </span>
          </div>
        )}
      </div>

      <OutputPort color={NODE_PORT_COLORS.product} />
      <ResizeHandle nodeId={id} width={width} height={height} minWidth={240} minHeight={320} />
    </div>
  );
}
