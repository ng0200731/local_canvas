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
