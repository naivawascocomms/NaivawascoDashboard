export interface FinanceKPI {
  label: string;
  value: number;
  unit: string;
  target?: number;
  percentRealized?: number;
  trend?: 'up' | 'down' | 'stable';
  status?: 'good' | 'warning' | 'critical';
  monthlyValue?: number;
  cumulativeValue?: number;
}

export interface BillingMetrics {
  waterSales: { monthly: number; cumulative: number; target: number; percentRealized: number };
  sewerageSales: { monthly: number; cumulative: number; target: number; percentRealized: number };
  totalBilled: { monthly: number; cumulative: number; target: number; percentRealized: number };
  bulkWater: { monthly: number; cumulative: number };
  meterRent?: { monthly: number; cumulative: number };
  sanitation?: { monthly: number; cumulative: number };
  newConnectionsWater: { monthly: number; cumulative: number };
  newConnectionsSewer: { monthly: number; cumulative: number };
  reconnections: { monthly: number; cumulative: number };
  prepaidKiosk: { monthly: number; cumulative: number };
  miscIncome?: { monthly: number; cumulative: number };
  penalties: { monthly: number; cumulative: number };
  exhauster?: { monthly: number; cumulative: number };
  companyExhauster?: { monthly: number; cumulative: number };
  customerExhauster?: { monthly: number; cumulative: number };
}

export interface CollectionMetrics {
  totalCollection: { monthly: number; cumulative: number; target: number; percentRealized: number };
  collectionEfficiency: { monthly: number; cumulative: number; target: number };
  disconnectedWater: { monthly: number; cumulative: number };
  disconnectedSewer: { monthly: number; cumulative: number };
}

export interface RegionalFinanceMetrics {
  region: string;
  billedWater: { monthly: number; cumulative: number };
  billedSewer: { monthly: number; cumulative: number };
  otherSales: { monthly: number; cumulative: number };
  totalBilled: { monthly: number; cumulative: number };
  collected: { monthly: number; cumulative: number };
  collectionEfficiency: { monthly: number; cumulative: number };
}

export interface MonthlyFinanceTrend {
  month: string;
  billed: number;
  collected: number;
  collectionEfficiency: number;
  target: number;
}

export interface FinanceReport {
  id: number;
  name: string;
  fiscal_year_start: number;
  fiscal_year_label: string;
  current_snapshot_date: string | null;
  current_fiscal_month_index: number | null;
  source_workbook: string;
  notes: string;
  is_active: boolean;
  section_count: number;
  metric_count: number;
}

export interface FinanceValuePair {
  raw: string | null;
  numeric: number | null;
}

export interface FinanceDashboardRow {
  id: number;
  code: string;
  label: string;
  unit: string;
  metric_kind: 'MONEY' | 'PERCENTAGE' | 'COUNT' | 'DATE' | 'TEXT';
  scope_type: 'GLOBAL' | 'REGION' | 'CUSTOM';
  scope_name: string;
  is_total: boolean;
  is_summary: boolean;
  monthly_target: FinanceValuePair;
  monthly_actual: FinanceValuePair;
  monthly_realization_percent: number | null;
  cumulative_target: FinanceValuePair;
  cumulative_actual: FinanceValuePair;
  cumulative_realization_percent: number | null;
}

export interface FinanceDashboardSection {
  id: number;
  title: string;
  display_order: number;
  rows: FinanceDashboardRow[];
}

export interface FinanceDashboardSummary {
  currentYear: {
    totalBilled: number;
    totalCollected: number;
    collectionEfficiency: number;
  };
  receivables: number;
  adjustments: number;
}

export interface FinanceDashboardPayload {
  report: FinanceReport;
  selected_month: number;
  selected_year: number;
  sections: FinanceDashboardSection[];
  rows: FinanceDashboardRow[];
  summary: FinanceDashboardSummary;
  finance_kpis: FinanceKPI[];
  cumulative_finance_kpis: FinanceKPI[];
  billing: BillingMetrics;
  collections: CollectionMetrics;
  regional: RegionalFinanceMetrics[];
  trend: MonthlyFinanceTrend[];
}
