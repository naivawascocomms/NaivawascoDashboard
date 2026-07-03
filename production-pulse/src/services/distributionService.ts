// src/services/distributionService.ts
// Distribution API service

import { api, apiClient } from './api';
import type {
  Zone,
  BillingCycle,
  CustomerBillingData,
  MonthlyDistribution,
  RegionalDistribution,
  GlobalNRWPerformance,
  DistributionDashboard,
  DistributionFyTrendPoint,
  DailyAnalysisPayload,
  CommercialDashboardPayload,
  CommercialDashboardKpiRecord,
  CommercialDashboardReport,
  PaginatedResponse,
} from '@/types/api';

function withBillingCycleFilters<T extends { year?: number; month?: number }>(params?: T) {
  if (!params) return undefined;

  const { year, month, ...rest } = params;
  return {
    ...rest,
    ...(year !== undefined ? { 'billing_cycle__year': year } : {}),
    ...(month !== undefined ? { 'billing_cycle__month': month } : {}),
  };
}

function withBalanceDistributionFilters<T extends { year?: number; month?: number; zone?: number; region?: number }>(params?: T) {
  if (!params) return undefined;
  const { year, month, zone, region, ...rest } = params;
  return {
    ...rest,
    ...(year !== undefined ? { year } : {}),
    ...(month !== undefined ? { month } : {}),
    ...(zone !== undefined ? { zone } : {}),
    ...(region !== undefined ? { region } : {}),
  };
}

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

export const distributionService = {
  // Zones
  getZones: (params?: { region?: number; is_active?: boolean }) =>
    api.get<PaginatedResponse<Zone>>('/distribution/zones/', params),

  getZone: (id: number) =>
    api.get<Zone>(`/distribution/zones/${id}/`),

  getZonePerformance: (id: number, params?: { year?: number; month?: number }) =>
    api.get<MonthlyDistribution[]>(`/distribution/zones/${id}/performance/`, params),

  // Billing Cycles
  getBillingCycles: (params?: { region?: number; year?: number; month?: number }) =>
    api.get<PaginatedResponse<BillingCycle>>('/distribution/billing-cycles/', params),

  getCurrentCycle: (region: number) =>
    api.get<BillingCycle>('/distribution/billing-cycles/current_cycle/', { region }),

  getDailyAnalysis: (params?: { start_date?: string; end_date?: string }) =>
    api.get<DailyAnalysisPayload>('/distribution/daily-distribution/analysis/', params),

  // Monthly Distribution
  getMonthlyDistribution: (params?: {
    zone?: number;
    region?: number;
    year?: number;
    month?: number;
  }) =>
    api.get<PaginatedResponse<MonthlyDistribution>>(
      '/water-balance/models/distribution-zone-summaries/',
      withBalanceDistributionFilters(params)
    ),

  getDistributionDashboard: (params?: { year?: number; month?: number; region?: number }) =>
    api.get<DistributionDashboard>('/water-balance/models/distribution-dashboard/', params),

  getFyTrend: (params: {
    fy_year?: number;
    up_to_month?: number;
    region?: number;
    mode?: 'fy' | 'rolling_12';
    anchor_year?: number;
    anchor_month?: number;
  }) =>
    api.get<DistributionFyTrendPoint[]>('/water-balance/models/distribution-fy-trend/', params),

  // Regional Distribution
  getRegionalDistribution: (params?: { region?: number; year?: number; month?: number }) =>
    api.get<PaginatedResponse<RegionalDistribution>>(
      '/distribution/regional-distribution/',
      withBillingCycleFilters(params)
    ),

  // Global NRW
  getGlobalNRW: (params?: { year?: number; month?: number; region?: number }) =>
    api.get<PaginatedResponse<GlobalNRWPerformance>>(
      '/water-balance/models/global-nrw/',
      params
    ),

  getCommercialDashboardReports: (params?: { fiscal_year_start?: number; is_active?: boolean }) =>
    api.get<PaginatedResponse<CommercialDashboardReport>>('/distribution/commercial-dashboard-reports/', params),

  getCommercialDashboard: (reportId: number, params?: { month?: number }) =>
    api.get<CommercialDashboardPayload>(`/distribution/commercial-dashboard-reports/${reportId}/dashboard/`, params),

  getAllCommercialDashboardKpis: (params?: { report?: number }) =>
    fetchAllPages<CommercialDashboardKpiRecord>('/distribution/commercial-dashboard-kpis/', params),

  // Customer Billing Data
  createCustomerBillingData: (data: {
    zone: number;
    billing_cycle?: number;
    zone_billing_cycle?: number;
    total_volume_billed_m3: number;
    number_of_bills_generated: number;
    number_of_active_connections: number;
  }) =>
    api.post('/distribution/customer-billing/', data),

  getCustomerBillingData: (params?: { zone?: number; region?: number; year?: number; month?: number }) =>
    api.get<PaginatedResponse<CustomerBillingData>>('/distribution/customer-billing/', {
      ...(params?.zone !== undefined ? { zone: params.zone } : {}),
      ...(params?.region !== undefined ? { 'zone__region': params.region } : {}),
      ...(params?.year !== undefined ? { 'billing_cycle__year': params.year } : {}),
      ...(params?.month !== undefined ? { 'billing_cycle__month': params.month } : {}),
    }),

  // Distribution Meter Readings
  createDistributionReading: (data: {
    meter: number;
    reading_date: string;
    current_reading: number;
    read_by?: string;
  }) =>
    api.post('/distribution/meter-readings/', data),
};
