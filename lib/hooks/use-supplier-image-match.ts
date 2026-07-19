"use client";

import { useMutation } from "@tanstack/react-query";

import {
  supplierImageMatchErrorSchema,
  supplierImageMatchRequestSchema,
  supplierImageMatchResponseSchema,
  type SupplierImageMatchRequest,
  type SupplierImageMatchResponse,
} from "@/lib/supplier-image-match";

export async function requestSupplierImageMatch(
  input: SupplierImageMatchRequest,
): Promise<SupplierImageMatchResponse> {
  const validatedInput = supplierImageMatchRequestSchema.parse(input);
  const response = await fetch("/api/supplier-image-match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validatedInput),
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The image search service returned an unreadable response.");
  }
  if (!response.ok) {
    const error = supplierImageMatchErrorSchema.safeParse(payload);
    throw new Error(error.success ? error.data.error : "Supplier image search failed.");
  }
  const parsed = supplierImageMatchResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error("The image search service returned invalid results.");
  return parsed.data;
}

export function useSupplierImageMatch() {
  return useMutation({ mutationFn: requestSupplierImageMatch });
}
