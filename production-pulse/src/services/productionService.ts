// src/services/productionService.ts
// Production API service

import { api } from './api';
import { apiClient } from './api';
import type {
  ProductionSite,
  ProductionMeter,
  MonthlyProduction,
  MeterReading,
  ProductionTarget,
  DashboardSummary,
  CompanyMonthlySummary,
  FySiteProductionSummary,
  WaterQualityTest,
  PaginatedResponse,
} from '@/types/api';

type MonthlyProductionParams = {
  year?: number;
  month?: number;
  production_site?: number;
  region?: number;
  page?: number;
  page_size?: number;
  ordering?: string;
};

type CompanySummaryParams = {
  year?: number;
  month?: number;
  page?: number;
  page_size?: number;
  ordering?: string;
};

async function fetchAllPages<T>(
  url: string,
  params?: Record<string, unknown>,
): Promise<PaginatedResponse<T>> {
  let nextUrl: string | null = url;
  let nextParams: Record<string, unknown> | undefined = params;
  let count = 0;
  const results: T[] = [];

  while (nextUrl) {
    const response = nextUrl === url
      ? await api.get<PaginatedResponse<T>>(url, nextParams)
      : (await apiClient.get<PaginatedResponse<T>>(nextUrl)).data;

    count = response.count;
    results.push(...response.results);
    nextUrl = response.next;
    nextParams = undefined;
  }

  return {
    count,
    next: null,
    previous: null,
    results,
  };
}

export const productionService = {
  // Production Sites
  getProductionSites: (params?: { region?: string; is_active?: boolean }) =>
    api.get<PaginatedResponse<ProductionSite>>('/production/production-sites/', params),

  getProductionSite: (id: number) =>
    api.get<ProductionSite>(`/production/production-sites/${id}/`),

  getProductionMeters: (params?: { production_site?: number; meter_type?: string; is_active?: boolean }) =>
    api.get<PaginatedResponse<ProductionMeter>>('/production/meters/', params),

  // Monthly Production
  getMonthlyProduction: (params?: MonthlyProductionParams) =>
    api.get<PaginatedResponse<MonthlyProduction>>('/production/monthly-production/', params),

  getAllMonthlyProduction: (params?: MonthlyProductionParams) =>
    fetchAllPages<MonthlyProduction>('/production/monthly-production/', params),

  getMonthlyProductionById: (id: number) =>
    api.get<MonthlyProduction>(`/production/monthly-production/${id}/`),

  getFySiteTotals: (params?: {
    fy_year?: number;
    region?: number;
    production_site?: number;
  }) =>
    api.get<FySiteProductionSummary[]>('/production/monthly-production/fy_site_totals/', params),

  // Dashboard Summary — pass fy_year for a full financial year, or year+month for a specific period
  getDashboardSummary: (params?: {
    fy_year?: number;
    year?: number;
    month?: number;
    region?: number;
    production_site?: number;
  }) =>
    api.get<DashboardSummary>('/water-balance/models/production-dashboard/', params),

  // Target Comparison
  getTargetComparison: (year: number, month: number) =>
    api.get('/production/monthly-production/target_comparison/', { year, month }),

  // Meter Readings
  getMeterReadings: (params?: {
    meter?: number;
    reading_date?: string;
    start_date?: string;
    end_date?: string;
  }) =>
    api.get<PaginatedResponse<MeterReading>>('/production/meter-readings/', params),

  createMeterReading: (data: {
    meter: number;
    reading_date: string;
    current_reading: number;
    read_by?: string;
    reading_method?: string;
  }) =>
    api.post<MeterReading>('/production/meter-readings/', data),

  bulkCreateMeterReadings: (readings: any[]) =>
    api.post('/production/meter-readings/bulk_create/', readings),

  validateReadings: (reading_ids: number[]) =>
    api.post('/production/meter-readings/validate_readings/', { reading_ids }),

  // Production Targets
  getProductionTargets: (params?: { year?: number; month?: number; production_site?: number }) =>
    api.get<PaginatedResponse<ProductionTarget>>('/production/production-targets/', params),

  // Company Monthly Summary
  getCompanySummary: (params?: CompanySummaryParams) =>
    api.get<PaginatedResponse<CompanyMonthlySummary>>('/production/company-summary/', params),

  getAllCompanySummary: (params?: CompanySummaryParams) =>
    fetchAllPages<CompanyMonthlySummary>('/production/company-summary/', params),

  getCompanySummaryByPeriod: (year: number, month: number) =>
    api.get<PaginatedResponse<CompanyMonthlySummary>>('/production/company-summary/', { year, month }),

  // Water Quality Tests
  getWaterQualityTests: (params?: {
    production_site?: number;
    test_date?: string;
    test_type?: string;
    test_location?: string;
    start_date?: string;
    end_date?: string;
  }) =>
    api.get<PaginatedResponse<WaterQualityTest>>('/production/water-quality-tests/', params),
};
