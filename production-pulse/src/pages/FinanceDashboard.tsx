import { BillingBreakdownCard } from '@/components/finance/BillingBreakdownCard';
import { CollectionTrendChart } from '@/components/finance/CollectionTrendChart';
import { KpiCard } from '@/components/kpi/KpiCard';
import { PageToolbar } from '@/components/layout/PageToolbar';
import { ErrorState, LoadingState } from '@/components/layout/QueryState';
import { RegionalFinanceCard } from '@/components/finance/RegionalFinanceCard';
import { PeriodFilter } from '@/components/filters/PeriodFilter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFinanceDashboard, useFinanceReports } from '@/hooks/useFinance';
import type { FinanceDashboardRow, FinanceKPI } from '@/types/finance';
import { AlertCircle, Coins, Loader2, MapPin, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatCompact } from '@/lib/format';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const FISCAL_MONTHS = [
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
];

function formatMetricValue(row: FinanceDashboardRow, value: number | null) {
  if (value === null || value === undefined) return '-';
  if (row.metric_kind === 'PERCENTAGE' || row.unit === '%') {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (row.metric_kind === 'MONEY' || row.unit.toLowerCase().includes('ksh')) {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatRealization(value: number | null) {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(1)}%`;
}

function normalizeKpis(kpis: FinanceKPI[]) {
  return kpis.map((kpi) => ({
    ...kpi,
    trend: (kpi.percentRealized ?? 0) >= 100 ? 'up' as const : 'down' as const,
    status: (kpi.percentRealized ?? 0) >= 90
      ? 'good' as const
      : (kpi.percentRealized ?? 0) >= 70
        ? 'warning' as const
        : 'critical' as const,
  }));
}

export default function FinanceDashboard() {
  const [selectedReportId, setSelectedReportId] = useState('');
  const [selectedFyYear, setSelectedFyYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [activeSection, setActiveSection] = useState<'revenue' | 'billing' | 'accounts'>('revenue');

  const { data: reportsData, isLoading: reportsLoading } = useFinanceReports({ is_active: true });
  const reports = reportsData?.results ?? [];
  const activeReport = reports.find((report) => report.id.toString() === selectedReportId)
    ?? reports.find((report) => report.is_active)
    ?? reports[0];
  const reportId = activeReport?.id;
  const fyYearValue = selectedFyYear || (activeReport?.fiscal_year_start ? String(activeReport.fiscal_year_start) : '');
  const defaultFiscalIndex = Math.max(1, Math.min(12, activeReport?.current_fiscal_month_index ?? 9));
  const monthValue = selectedMonth || String(FISCAL_MONTHS[defaultFiscalIndex - 1].value);
  const dashboardParams = useMemo(() => ({
    fy_year: fyYearValue ? Number(fyYearValue) : undefined,
    month: monthValue ? Number(monthValue) : undefined,
  }), [fyYearValue, monthValue]);
  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    isError,
    refetch,
  } = useFinanceDashboard(reportId, dashboardParams);

  const currentPeriod = dashboardData
    ? `${MONTH_NAMES[dashboardData.selected_month - 1]} ${dashboardData.selected_year}`
    : 'Finance';
  const fiscalYearOptions = useMemo(() => {
    const years = new Set(reports.map((report) => report.fiscal_year_start));
    if (activeReport?.fiscal_year_start) years.add(activeReport.fiscal_year_start);
    return Array.from(years)
      .sort((a, b) => b - a)
      .map((year) => ({
        value: String(year),
        label: `${year}-${year + 1}`,
      }));
  }, [activeReport, reports]);

  const handleFyYearChange = (value: string) => {
    const report = reports.find((item) => item.fiscal_year_start.toString() === value);
    setSelectedFyYear(value);
    if (report) {
      setSelectedReportId(String(report.id));
      const fiscalIndex = Math.max(1, Math.min(12, report.current_fiscal_month_index ?? 12));
      setSelectedMonth(String(FISCAL_MONTHS[fiscalIndex - 1].value));
    }
    setSelectedRegion('all');
  };

  if (reportsLoading || dashboardLoading) {
    return (
      <div className="min-h-screen bg-gradient-surface">
        <div className="container py-6 md:py-8">
          <LoadingState label="Loading finance dashboard…" />
        </div>
      </div>
    );
  }

  if (isError || !dashboardData) {
    return (
      <div className="min-h-screen bg-gradient-surface">
        <div className="container py-6 md:py-8">
          <ErrorState
            title="Finance dashboard data is not available."
            message="Check that the finance workbook has been imported."
            onRetry={() => refetch()}
          />
        </div>
      </div>
    );
  }

  const financeSummary = dashboardData.summary;
  const financeKPIs = normalizeKpis(dashboardData.finance_kpis);
  const cumulativeFinanceKPIs = normalizeKpis(dashboardData.cumulative_finance_kpis);
  const visibleRegionalMetrics = selectedRegion === 'all'
    ? dashboardData.regional
    : dashboardData.regional.filter((region) => region.region === selectedRegion);

  return (
    <div className="min-h-screen bg-gradient-surface">
      <div className="container py-6 md:py-8">
        <Tabs
          value={activeSection}
          onValueChange={(value) => setActiveSection(value as 'revenue' | 'billing' | 'accounts')}
          className="space-y-6"
        >
          <div className="rounded-2xl border border-border/50 bg-card/70 p-2 shadow-soft">
            <TabsList className="h-auto flex-wrap gap-1 p-1">
              <TabsTrigger value="revenue" className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                Revenue
              </TabsTrigger>
              <TabsTrigger value="billing" className="flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5" />
                Billing
              </TabsTrigger>
              <TabsTrigger value="accounts" className="flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5" />
                Accounts
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="revenue" className="space-y-6">
          <PageToolbar periodLabel={currentPeriod} onRefresh={() => refetch()}>
            <PeriodFilter
              selectedMonth={monthValue}
              selectedYear={fyYearValue}
              onMonthChange={setSelectedMonth}
              onYearChange={handleFyYearChange}
              fiscalYears={fiscalYearOptions}
              allowAllMonths={false}
            />
            <FinanceRegionFilter
              selectedRegion={selectedRegion}
              onRegionChange={setSelectedRegion}
              regions={dashboardData.regional.map((region) => region.region)}
            />
          </PageToolbar>

          <div className="rounded-xl border border-success/20 bg-success/10 p-4 animate-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Wallet className="w-6 h-6 text-success" />
                <div>
                  <p className="text-sm text-muted-foreground">Current Year Financial Summary</p>
                  <p className="text-2xl font-bold mono-value">
                    {formatCompact(financeSummary.currentYear.totalCollected)} KES Collected
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Billed:</span>{' '}
                  <span className="font-semibold mono-value">
                    {formatCompact(financeSummary.currentYear.totalBilled)} KES
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Collection Eff.:</span>{' '}
                  <span className="font-semibold mono-value">
                    {financeSummary.currentYear.collectionEfficiency.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Receivables:</span>{' '}
                  <span className="font-semibold mono-value">
                    {formatCompact(financeSummary.receivables)} KES
                  </span>
                </div>
              </div>
            </div>
          </div>

          <section>
            <h2 className="section-title mb-4 flex items-center gap-2">
              <Receipt className="w-4 h-4" /> Monthly Finance KPIs
            </h2>
            <div className="data-grid">
              {financeKPIs.map((kpi, idx) => (
                <KpiCard key={kpi.label} {...kpi} delay={idx * 75} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="section-title mb-4 flex items-center gap-2">
              <Coins className="w-4 h-4" /> Cumulative Finance KPIs
            </h2>
            <div className="data-grid">
              {cumulativeFinanceKPIs.map((kpi, idx) => (
                <KpiCard key={kpi.label} {...kpi} delay={idx * 60} />
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <CollectionTrendChart data={dashboardData.trend} />
            <BillingBreakdownCard billing={dashboardData.billing} />
          </section>

          <section>
            <h2 className="section-title mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Collections Snapshot
            </h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <CompactFinanceStat
                label="Monthly Collection"
                value={`${formatCompact(dashboardData.collections.totalCollection.monthly)} KES`}
              />
              <CompactFinanceStat
                label="YTD Collection"
                value={`${formatCompact(dashboardData.collections.totalCollection.cumulative)} KES`}
              />
              <CompactFinanceStat
                label="Collection Efficiency"
                value={`${dashboardData.collections.collectionEfficiency.monthly.toFixed(1)}%`}
              />
              <CompactFinanceStat
                label="Water Disconnections"
                value={dashboardData.collections.disconnectedWater.monthly.toLocaleString()}
              />
            </div>
          </section>

          <section>
            <h2 className="section-title mb-4">Regional Finance Snapshot</h2>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {visibleRegionalMetrics.map((region, idx) => (
                <RegionalFinanceCard key={region.region} region={region} delay={idx * 75} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="section-title mb-4">Detailed Finance Metrics</h2>
            <div className="overflow-x-auto rounded-lg border border-border/50 bg-card">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/40">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Section</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Metric</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Monthly Target</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Monthly Actual</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Monthly %</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">YTD Target</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">YTD Actual</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">YTD %</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.sections.flatMap((section) =>
                    section.rows.map((row) => (
                      <tr key={row.id} className="border-b border-border/30 last:border-0">
                        <td className="px-4 py-3 text-muted-foreground">{section.title}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{row.label}</td>
                        <td className="px-4 py-3 text-right mono-value">
                          {formatMetricValue(row, row.monthly_target.numeric)}
                        </td>
                        <td className="px-4 py-3 text-right mono-value">
                          {formatMetricValue(row, row.monthly_actual.numeric)}
                        </td>
                        <td className="px-4 py-3 text-right mono-value">
                          {formatRealization(row.monthly_realization_percent)}
                        </td>
                        <td className="px-4 py-3 text-right mono-value text-muted-foreground">
                          {formatMetricValue(row, row.cumulative_target.numeric)}
                        </td>
                        <td className="px-4 py-3 text-right mono-value text-muted-foreground">
                          {formatMetricValue(row, row.cumulative_actual.numeric)}
                        </td>
                        <td className="px-4 py-3 text-right mono-value text-muted-foreground">
                          {formatRealization(row.cumulative_realization_percent)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
          </TabsContent>

          <TabsContent value="billing" className="space-y-6">
            <div className="chart-container p-6 text-sm text-muted-foreground">
              Billing analysis will be added later.
            </div>
          </TabsContent>

          <TabsContent value="accounts" className="space-y-6">
            <div className="chart-container p-6 text-sm text-muted-foreground">
              Accounts analysis will be added later.
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function FinanceRegionFilter({
  selectedRegion,
  onRegionChange,
  regions,
}: {
  selectedRegion: string;
  onRegionChange: (value: string) => void;
  regions: string[];
}) {
  return (
    <div className="flex items-center gap-2">
      <MapPin className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Region:</span>
      <Select value={selectedRegion} onValueChange={onRegionChange}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Region" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Regions</SelectItem>
          {regions.map((region) => (
            <SelectItem key={region} value={region}>
              {region}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CompactFinanceStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-lg font-semibold mono-value text-foreground">{value}</div>
    </div>
  );
}
