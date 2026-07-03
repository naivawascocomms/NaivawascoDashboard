// src/hooks/useProduction.ts
// React Query hooks for production data

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productionService } from '@/services/productionService';

const DEFAULT_STALE_TIME = 5 * 60 * 1000;

export const useProductionSites = (params?: any) => {
  return useQuery({
    queryKey: ['production-sites', params],
    queryFn: () => productionService.getProductionSites(params),
    staleTime: DEFAULT_STALE_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useProductionMeters = (params?: any) => {
  return useQuery({
    queryKey: ['production-meters', params],
    queryFn: () => productionService.getProductionMeters(params),
    enabled: !!params?.production_site,
  });
};

export const useMonthlyProduction = (params?: any) => {
  return useQuery({
    queryKey: ['monthly-production', params],
    queryFn: () => productionService.getMonthlyProduction(params),
  });
};

export const useProductionDashboard = (params?: {
  fy_year?: number;
  year?: number;
  month?: number;
  production_site?: number;
}) => {
  return useQuery({
    queryKey: ['production-dashboard', params],
    queryFn: () => productionService.getDashboardSummary(params),
    refetchInterval: 60000,
  });
};

// Fetches all months for a full financial year (Jul fyYear - Jun fyYear+1).
// Makes two requests, first half and second half, then returns combined results.
// page_size: 200 covers 15 sites x 12 months = 180 max records per half.
export const useFyYearlyProduction = (params?: { fyYear?: number; production_site?: number }) => {
  const siteParam = params?.production_site ? { production_site: params.production_site } : {};

  const firstHalf = useQuery({
    queryKey: ['fy-production-h1', params],
    queryFn: () => productionService.getAllMonthlyProduction({
      year: params?.fyYear, ordering: 'month,production_site', ...siteParam,
    } as any),
    enabled: !!params?.fyYear,
  });

  const secondHalf = useQuery({
    queryKey: ['fy-production-h2', params],
    queryFn: () => productionService.getAllMonthlyProduction({
      year: params?.fyYear ? params.fyYear + 1 : undefined, ordering: 'month,production_site', ...siteParam,
    } as any),
    enabled: !!params?.fyYear,
  });

  const h1 = firstHalf.data?.results?.filter((record) => record.month >= 7) ?? [];
  const h2 = secondHalf.data?.results?.filter((record) => record.month <= 6) ?? [];

  return {
    data: { results: [...h1, ...h2] },
    isLoading: firstHalf.isLoading || secondHalf.isLoading,
    isError: firstHalf.isError || secondHalf.isError,
  };
};

export const useFySiteTotals = (params?: { fyYear?: number; production_site?: number }) => {
  const siteParam = params?.production_site ? { production_site: params.production_site } : {};

  return useQuery({
    queryKey: ['fy-site-totals', params],
    queryFn: () => productionService.getFySiteTotals({
      fy_year: params?.fyYear,
      ...siteParam,
    }),
    enabled: !!params?.fyYear,
  });
};

// Fetches all CompanyMonthlySummary records for a full FY (Jul fyYear - Jun fyYear+1).
export const useFyCompanySummary = (params?: { fyYear?: number }) => {
  const firstHalf = useQuery({
    queryKey: ['fy-company-h1', params],
    queryFn: () => productionService.getAllCompanySummary({ year: params?.fyYear, ordering: 'month' } as any),
    enabled: !!params?.fyYear,
  });

  const secondHalf = useQuery({
    queryKey: ['fy-company-h2', params],
    queryFn: () => productionService.getAllCompanySummary({
      year: params?.fyYear ? params.fyYear + 1 : undefined, ordering: 'month',
    } as any),
    enabled: !!params?.fyYear,
  });

  const h1 = firstHalf.data?.results?.filter((record) => record.month >= 7) ?? [];
  const h2 = secondHalf.data?.results?.filter((record) => record.month <= 6) ?? [];

  return {
    data: [...h1, ...h2],
    isLoading: firstHalf.isLoading || secondHalf.isLoading,
  };
};

export const useCompanySummary = (params?: { year?: number; month?: number }) => {
  return useQuery({
    queryKey: ['company-summary', params],
    queryFn: () => productionService.getCompanySummary(params),
    enabled: !!params?.year && !!params?.month,
  });
};

export const useWaterQualityTests = (params?: any) => {
  return useQuery({
    queryKey: ['water-quality-tests', params],
    queryFn: () => productionService.getWaterQualityTests(params),
  });
};

export const useCreateMeterReading = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: productionService.createMeterReading,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meter-readings'] });
      queryClient.invalidateQueries({ queryKey: ['production-dashboard'] });
    },
  });
};

export const useBulkCreateMeterReadings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: productionService.bulkCreateMeterReadings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meter-readings'] });
      queryClient.invalidateQueries({ queryKey: ['production-dashboard'] });
    },
  });
};
