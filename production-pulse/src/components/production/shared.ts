// Shared helpers for the Production module.

import { toNumber } from '@/lib/format';
import type { CompanyMonthlySummary, FySiteProductionSummary, MonthlyProduction } from '@/types/api';

/**
 * Company summary values may come straight from the API (decimal strings) or
 * from a client-side FY aggregation (numbers) — sections accept either.
 */
export type CompanySummaryLike = {
  [K in keyof CompanyMonthlySummary]?: CompanyMonthlySummary[K] | number | null;
};

export type SiteProductionRow = MonthlyProduction | FySiteProductionSummary;

export function pctRealized(actual: number, target: number): number {
  return target > 0 ? (actual / target) * 100 : 0;
}

export function pctStatus(pct: number): 'good' | 'warning' | 'critical' {
  if (pct >= 90) return 'good';
  if (pct >= 70) return 'warning';
  return 'critical';
}

export function pctColor(pct: number): string {
  if (pct >= 90) return 'text-success';
  if (pct >= 70) return 'text-warning';
  return 'text-destructive';
}

/** Prefer explicit supplied volume; fall back to available-for-sale. */
export function supplyForDisplay(record: SiteProductionRow): number {
  const supplied = toNumber(record.water_supplied_m3);
  if (supplied > 0) return supplied;
  return toNumber(record.water_available_for_sale_m3);
}
