import { api } from './api';
import type { PaginatedResponse } from '@/types/api';
import type { FinanceDashboardPayload, FinanceReport } from '@/types/finance';

export const financeService = {
  getReports: (params?: { is_active?: boolean; search?: string }) =>
    api.get<PaginatedResponse<FinanceReport>>('/finance/reports/', params),

  getDashboard: (
    reportId: number,
    params?: {
      fy_year?: number;
      month?: number;
    },
  ) =>
    api.get<FinanceDashboardPayload>(`/finance/reports/${reportId}/dashboard/`, params),
};
