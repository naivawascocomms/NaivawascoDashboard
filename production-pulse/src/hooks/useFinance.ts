import { useQuery } from '@tanstack/react-query';
import { financeService } from '@/services/financeService';

const DEFAULT_STALE_TIME = 5 * 60 * 1000;

export const useFinanceReports = (params?: { is_active?: boolean; search?: string }) => {
  return useQuery({
    queryKey: ['finance-reports', params],
    queryFn: () => financeService.getReports(params),
    staleTime: DEFAULT_STALE_TIME,
    refetchOnWindowFocus: false,
  });
};

export const useFinanceDashboard = (
  reportId?: number,
  params?: {
    fy_year?: number;
    month?: number;
  },
) => {
  return useQuery({
    queryKey: ['finance-dashboard', reportId, params],
    queryFn: () => financeService.getDashboard(reportId!, params),
    enabled: !!reportId,
    refetchInterval: 60000,
  });
};
