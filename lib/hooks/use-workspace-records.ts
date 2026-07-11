"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getWorkspaceRecordStore } from "@/lib/store/workspaceRecords";
import type {
  CustomerRecordInput,
  ProductRecordInput,
  SupplierRecordInput,
} from "@/lib/workspace-records";

const CUSTOMERS_KEY = ["workspace-records", "customers"] as const;
const SUPPLIERS_KEY = ["workspace-records", "suppliers"] as const;
const PRODUCTS_KEY = ["workspace-records", "products"] as const;

export function useCustomers() {
  return useQuery({
    queryKey: CUSTOMERS_KEY,
    queryFn: () => getWorkspaceRecordStore().listCustomers(),
  });
}

export function useUpsertCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: CustomerRecordInput }) =>
      getWorkspaceRecordStore().upsertCustomer(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CUSTOMERS_KEY }),
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: SUPPLIERS_KEY,
    queryFn: () => getWorkspaceRecordStore().listSuppliers(),
  });
}

export function useUpsertSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: SupplierRecordInput }) =>
      getWorkspaceRecordStore().upsertSupplier(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUPPLIERS_KEY }),
  });
}

export function useProducts() {
  return useQuery({
    queryKey: PRODUCTS_KEY,
    queryFn: () => getWorkspaceRecordStore().listProducts(),
  });
}

export function useUpsertProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: ProductRecordInput }) =>
      getWorkspaceRecordStore().upsertProduct(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  });
}
