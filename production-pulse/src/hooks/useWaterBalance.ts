// src/hooks/useWaterBalance.ts
// React Query hooks for water balance data

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AllocationRulesParams,
  ConfiguredSourceAttributionParams,
  WaterBalanceModelParams,
  WaterBalanceNodeInputParams,
  WaterBalanceNodeParams,
  WaterBalanceRuleParams,
  SourceAllocationParams,
  ZoneCycleSourceAttributionParams,
  waterBalanceService,
} from '@/services/waterBalanceService';

const DEFAULT_STALE_TIME = 5 * 60 * 1000;

type QueryOptions = {
  enabled?: boolean;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
};

export const useAllocationRules = (params?: AllocationRulesParams, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['water-balance-allocation-rules', params],
    queryFn: () => waterBalanceService.getAllocationRules(params),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? DEFAULT_STALE_TIME,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnReconnect: options?.refetchOnReconnect ?? false,
  });
};

export const useSourceAllocations = (
  params?: SourceAllocationParams,
  options?: QueryOptions,
) => {
  return useQuery({
    queryKey: ['water-balance-source-allocations', params],
    queryFn: () => waterBalanceService.getSourceAllocations(params!),
    enabled:
      (options?.enabled ?? true) &&
      !!params?.start_date &&
      !!params?.end_date,
    staleTime: options?.staleTime ?? DEFAULT_STALE_TIME,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnReconnect: options?.refetchOnReconnect ?? false,
  });
};

export const useConfiguredSourceAttributions = (
  params?: ConfiguredSourceAttributionParams,
  options?: QueryOptions,
) => {
  return useQuery({
    queryKey: ['water-balance-configured-source-attributions', params],
    queryFn: () => waterBalanceService.getConfiguredSourceAttributions(params!),
    enabled:
      (options?.enabled ?? true) &&
      !!params?.start_date &&
      !!params?.end_date,
    staleTime: options?.staleTime ?? DEFAULT_STALE_TIME,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnReconnect: options?.refetchOnReconnect ?? false,
  });
};

export const useZoneCycleSourceAttributions = (
  params?: ZoneCycleSourceAttributionParams,
  options?: QueryOptions,
) => {
  return useQuery({
    queryKey: ['water-balance-zone-cycle-source-attributions', params],
    queryFn: () => waterBalanceService.getZoneCycleSourceAttributions(params!),
    enabled:
      (options?.enabled ?? true) &&
      !!params?.zone &&
      !!params?.year &&
      !!params?.month,
    staleTime: options?.staleTime ?? DEFAULT_STALE_TIME,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnReconnect: options?.refetchOnReconnect ?? false,
  });
};

export const useWaterBalanceNodes = (params?: WaterBalanceNodeParams, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['water-balance-nodes', params],
    queryFn: () => waterBalanceService.getNodes(params),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? DEFAULT_STALE_TIME,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnReconnect: options?.refetchOnReconnect ?? false,
  });
};

export const useWaterBalanceModels = (params?: WaterBalanceModelParams, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['water-balance-models', params],
    queryFn: () => waterBalanceService.getModels(params),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? DEFAULT_STALE_TIME,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnReconnect: options?.refetchOnReconnect ?? false,
  });
};

export const useWaterBalanceRules = (params?: WaterBalanceRuleParams, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['water-balance-rules', params],
    queryFn: () => waterBalanceService.getRules(params),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? DEFAULT_STALE_TIME,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnReconnect: options?.refetchOnReconnect ?? false,
  });
};

export const useWaterBalanceNodeInputs = (params?: WaterBalanceNodeInputParams, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['water-balance-node-inputs', params],
    queryFn: () => waterBalanceService.getNodeInputs(params),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? DEFAULT_STALE_TIME,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnReconnect: options?.refetchOnReconnect ?? false,
  });
};

function invalidateConfiguredWaterBalance(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['water-balance-nodes'] });
  queryClient.invalidateQueries({ queryKey: ['water-balance-models'] });
  queryClient.invalidateQueries({ queryKey: ['water-balance-rules'] });
  queryClient.invalidateQueries({ queryKey: ['water-balance-node-inputs'] });
  queryClient.invalidateQueries({ queryKey: ['water-balance-configured-source-attributions'] });
  queryClient.invalidateQueries({ queryKey: ['water-balance-zone-cycle-source-attributions'] });
}

export const useCreateAllocationRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: waterBalanceService.createAllocationRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['water-balance-allocation-rules'] });
      queryClient.invalidateQueries({ queryKey: ['water-balance-source-allocations'] });
    },
  });
};

export const useCreateWaterBalanceNode = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: waterBalanceService.createNode,
    onSuccess: () => invalidateConfiguredWaterBalance(queryClient),
  });
};

export const useCreateWaterBalanceModel = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: waterBalanceService.createModel,
    onSuccess: () => invalidateConfiguredWaterBalance(queryClient),
  });
};

export const useCreateWaterBalanceRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: waterBalanceService.createRule,
    onSuccess: () => invalidateConfiguredWaterBalance(queryClient),
  });
};

export const useCreateWaterBalanceNodeInput = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: waterBalanceService.createNodeInput,
    onSuccess: () => invalidateConfiguredWaterBalance(queryClient),
  });
};
