"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getCanvasStore } from "@/lib/store";

export const SAMPLE_ORDERS_KEY = ["sample-orders"] as const;

export function useSampleOrders() {
  return useQuery({
    queryKey: SAMPLE_ORDERS_KEY,
    queryFn: () => getCanvasStore().listSampleOrders(),
    refetchInterval: 15_000,
  });
}

export function useGenerateDemoSampleOrders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (count: number) => getCanvasStore().generateDemoSampleOrders(count),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SAMPLE_ORDERS_KEY }),
  });
}

export function useDeleteSampleOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getCanvasStore().deleteSampleOrder(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SAMPLE_ORDERS_KEY }),
  });
}

export function useDeleteSampleOrders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: readonly string[]) => {
      for (const id of ids) await getCanvasStore().deleteSampleOrder(id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SAMPLE_ORDERS_KEY }),
  });
}

