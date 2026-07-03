// src/hooks/useDistribution.ts
// React Query hooks for distribution data

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { distributionService } from '@/services/distributionService';

type QueryOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
};

const DEFAULT_STALE_TIME = 5 * 60 * 1000;

function withQueryBehavior(options?: QueryOptions) {
  return {
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? DEFAULT_STALE_TIME,
    refetchInterval: options?.refetchInterval ?? false,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnReconnect: options?.refetchOnReconnect ?? false,
  };
}

export const useZones = (params?: any) => {
  return useQuery({
    queryKey: ['zones', params],
    queryFn: () => distributionService.getZones(params),
    staleTime: DEFAULT_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useCommercialDashboardReports = (params?: any, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['commercial-dashboard-reports', params],
    queryFn: () => distributionService.getCommercialDashboardReports(params),
    ...withQueryBehavior(options),
  });
};

export const useCommercialDashboard = (
  reportId?: number,
  params?: { month?: number },
  options?: QueryOptions,
) => {
  return useQuery({
    queryKey: ['commercial-dashboard', reportId, params],
    queryFn: () => distributionService.getCommercialDashboard(reportId!, params),
    ...withQueryBehavior(options),
    enabled: (options?.enabled ?? true) && !!reportId,
  });
};

export const useCommercialDashboardKpis = (
  params?: { report?: number },
  options?: QueryOptions,
) => {
  return useQuery({
    queryKey: ['commercial-dashboard-kpis', params],
    queryFn: () => distributionService.getAllCommercialDashboardKpis(params),
    ...withQueryBehavior(options),
    enabled: (options?.enabled ?? true) && !!params?.report,
  });
};

export const useDistributionDashboard = (params?: any, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['distribution-dashboard', params],
    queryFn: () => distributionService.getDistributionDashboard(params),
    ...withQueryBehavior(options),
  });
};

export const useDailyAnalysis = (
  params?: { start_date?: string; end_date?: string },
  options?: QueryOptions,
) => {
  return useQuery({
    queryKey: ['daily-analysis', params],
    queryFn: () => distributionService.getDailyAnalysis(params),
    ...withQueryBehavior(options),
  });
};

export const useMonthlyDistribution = (params?: any, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['monthly-distribution', params],
    queryFn: () => distributionService.getMonthlyDistribution(params),
    ...withQueryBehavior(options),
  });
};

export const useDistributionFyTrend = (params?: {
  fy_year?: number;
  up_to_month?: number;
  region?: number;
  mode?: 'fy' | 'rolling_12';
  anchor_year?: number;
  anchor_month?: number;
}, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['distribution-fy-trend', params],
    queryFn: () => distributionService.getFyTrend(params ?? {}),
    ...withQueryBehavior(options),
    enabled:
      (options?.enabled ?? true) &&
      !!(params?.fy_year || (params?.mode === 'rolling_12' && params?.anchor_year && params?.anchor_month)),
  });
};

export const useRegionalDistribution = (params?: any, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['regional-distribution', params],
    queryFn: () => distributionService.getRegionalDistribution(params),
    ...withQueryBehavior(options),
  });
};

export const useCustomerBillingData = (params?: any, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['customer-billing', params],
    queryFn: () => distributionService.getCustomerBillingData(params),
    ...withQueryBehavior(options),
  });
};

export const useGlobalNRW = (params?: any, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['global-nrw', params],
    queryFn: () => distributionService.getGlobalNRW(params),
    ...withQueryBehavior(options),
  });
};

export const useCreateDistributionReading = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: distributionService.createDistributionReading,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distribution-dashboard'] });
    },
  });
};
