import {
  getWorkspaceProductTypeLabel,
  type ProductImageInput,
  type ProductRecord,
  type ProductVariantRecord,
} from "@/lib/workspace-records";

export interface ProductImageGalleryItem {
  id: string;
  product: ProductRecord;
  variant: ProductVariantRecord & { image: ProductImageInput };
  variantIndex: number;
}

export function buildProductImageSearchText(item: ProductImageGalleryItem): string {
  const { product, variant } = item;
  return [
    getWorkspaceProductTypeLabel(product.productType),
    product.subject,
    product.detail,
    variant.material,
    variant.colorNotes,
    variant.unitPrice,
    variant.priceUnit,
    variant.image.name,
    ...Object.entries(variant.parameters).flatMap(([key, value]) => [key, value]),
  ]
    .join(" ")
    .trim();
}

export function productRecordSearchText(product: ProductRecord): string {
  return getProductImageGalleryItems([product])
    .map(buildProductImageSearchText)
    .concat([getWorkspaceProductTypeLabel(product.productType), product.subject, product.detail])
    .join(" ")
    .trim();
}

export function getProductImageGalleryItems(
  products: readonly ProductRecord[],
): ProductImageGalleryItem[] {
  return products.flatMap((product) =>
    product.variants.flatMap((variant, variantIndex) => {
      if (!variant.image) return [];
      return [
        {
          id: `${product.id}:${variant.id}`,
          product,
          variant: { ...variant, image: variant.image },
          variantIndex,
        },
      ];
    }),
  );
}

export function filterProductImageGalleryItems(
  items: readonly ProductImageGalleryItem[],
  query: string,
): ProductImageGalleryItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...items];

  return items.filter((item) =>
    buildProductImageSearchText(item).toLocaleLowerCase().includes(normalizedQuery),
  );
}
