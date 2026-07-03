import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BarChart3, Loader2, MapPin, PhoneCall, Receipt, Target, Users } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { FinanceKPICard } from '@/components/finance/FinanceKPICard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useCommercialDashboard,
  useCommercialDashboardKpis,
  useCommercialDashboardReports,
} from '@/hooks/useDistribution';
import { cn } from '@/lib/utils';
import type { CommercialDashboardRow } from '@/types/api';

const FY_MONTHS = [
  { value: 7, label: 'July', short: 'Jul' },
  { value: 8, label: 'August', short: 'Aug' },
  { value: 9, label: 'September', short: 'Sep' },
  { value: 10, label: 'October', short: 'Oct' },
  { value: 11, label: 'November', short: 'Nov' },
  { value: 12, label: 'December', short: 'Dec' },
  { value: 1, label: 'January', short: 'Jan' },
  { value: 2, label: 'February', short: 'Feb' },
  { value: 3, label: 'March', short: 'Mar' },
  { value: 4, label: 'April', short: 'Apr' },
  { value: 5, label: 'May', short: 'May' },
  { value: 6, label: 'June', short: 'Jun' },
];

const REGION_NAMES = ['Central', 'Southern', 'Eastern'] as const;

function normalizeLabel(value: string | null | undefined) {
  return String(value ?? '').replace(/[^A-Za-z0-9]+/g, '').toUpperCase();
}

function toNumber(value: string | number | null | undefined): number {
  if (value == null || value === '') return 0;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPercent(value: string | number | null | undefined): number | null {
  const parsed = toOptionalNumber(value);
  if (parsed == null) return null;
  return Math.abs(parsed) <= 2 ? parsed * 100 : parsed;
}

function ratioPercent(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function formatCompact(value: number, unit?: string) {
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString(undefined, { maximumFractionDigits: value % 1 === 0 ? 0 : 2 });
}

function statusFromPercent(percent: number | null): 'good' | 'warning' | 'critical' {
  if (percent == null) return 'warning';
  if (percent >= 90) return 'good';
  if (percent >= 70) return 'warning';
  return 'critical';
}

function trendFromPercent(percent: number | null): 'up' | 'down' | 'stable' {
  if (percent == null) return 'stable';
  return percent >= 100 ? 'up' : 'down';
}

function monthLabel(month: number, fiscalStartYear: number) {
  const item = FY_MONTHS.find(entry => entry.value === month);
  const year = month >= 7 ? fiscalStartYear : fiscalStartYear + 1;
  return `${item?.label ?? month} ${year}`;
}

type SalesCustomerCareSectionProps = {
  refreshNonce?: number;
  onPeriodChange?: (value: string) => void;
};

export function SalesCustomerCareSection({
  refreshNonce = 0,
  onPeriodChange,
}: SalesCustomerCareSectionProps) {
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const reportsQuery = useCommercialDashboardReports({ is_active: true }, { refetchInterval: 60000 });
  const reports = reportsQuery.data?.results ?? [];

  useEffect(() => {
    if (!reports.length) return;
    if (selectedReportId == null || !reports.some(report => report.id === selectedReportId)) {
      setSelectedReportId(reports[0].id);
    }
  }, [reports, selectedReportId]);

  const activeReport = useMemo(
    () => reports.find(report => report.id === selectedReportId) ?? reports[0] ?? null,
    [reports, selectedReportId],
  );

  useEffect(() => {
    if (!activeReport) return;
    if (selectedMonth == null) {
      const snapshotMonth = activeReport.current_snapshot_date
        ? new Date(activeReport.current_snapshot_date).getMonth() + 1
        : null;
      setSelectedMonth(snapshotMonth ?? 6);
    }
  }, [activeReport, selectedMonth]);

  const dashboardQuery = useCommercialDashboard(
    activeReport?.id,
    selectedMonth != null ? { month: selectedMonth } : undefined,
    { enabled: !!activeReport?.id && selectedMonth != null, refetchInterval: 60000 },
  );

  const kpisQuery = useCommercialDashboardKpis(
    activeReport?.id ? { report: activeReport.id } : undefined,
    { enabled: !!activeReport?.id, refetchInterval: 60000 },
  );

  useEffect(() => {
    if (!refreshNonce) return;
    reportsQuery.refetch();
    dashboardQuery.refetch();
    kpisQuery.refetch();
  }, [refreshNonce]);

  const sections = dashboardQuery.data?.sections ?? [];

  const rows = useMemo(() => sections.flatMap(section => section.rows), [sections]);

  const rowsByLabel = useMemo(() => {
    const map = new Map<string, CommercialDashboardRow>();
    rows.forEach(row => map.set(normalizeLabel(row.label), row));
    return map;
  }, [rows]);

  const findRow = (...labels: string[]) => {
    for (const label of labels) {
      const row = rowsByLabel.get(normalizeLabel(label));
      if (row) return row;
    }
    return null;
  };

  const findRowContaining = (...needles: string[]) => {
    const normalizedNeedles = needles.map(normalizeLabel);
    return rows.find(row => {
      const normalized = normalizeLabel(row.label);
      return normalizedNeedles.some(needle => normalized.includes(needle));
    }) ?? null;
  };

  const currentPeriod = activeReport && selectedMonth != null
    ? `Distribution / Sales & CC - ${monthLabel(selectedMonth, activeReport.fiscal_year_start)} - FY ${activeReport.fiscal_year_label}`
    : 'Distribution / Sales & CC';

  useEffect(() => {
    onPeriodChange?.(currentPeriod);
  }, [currentPeriod, onPeriodChange]);

  const monthlyKpis = useMemo(() => {
    const configs = [
      { label: 'Total Volume Billed', row: findRow('TOTAL VOLUME BILLED'), unit: 'm3' },
      { label: 'Total Water Sales', row: findRow('TOTAL WATER SALES'), unit: 'KES' },
      { label: 'Total Sewer Sales', row: findRow('TOTAL SEWER SALES'), unit: 'KES' },
      { label: 'Total Water & Sewer Sales', row: findRow('TOTAL WATER & SEWER SALES'), unit: 'KES' },
      { label: 'Billing Efficiency', row: findRow('Billing Efficiency (%)'), unit: '%' },
      { label: 'Meter Reading Efficiency', row: findRow('Meter Reading Efficiency (%)'), unit: '%' },
      { label: 'Complaints Solved', row: findRow('NO. COMPLAINTS SOLVED'), unit: 'No.' },
      { label: 'Resolution %', row: findRow('% RESOLUTION'), unit: '%' },
    ];

    return configs
      .filter(item => item.row)
      .map(item => {
        const row = item.row!;
        const value = item.unit === '%'
          ? toPercent(row.monthly_actual.numeric) ?? 0
          : toNumber(row.monthly_actual.numeric);
        const target = item.unit === '%'
          ? toPercent(row.monthly_target.numeric) ?? undefined
          : toOptionalNumber(row.monthly_target.numeric);
        const realized = toPercent(row.monthly_realization_percent);

        return {
          label: item.label,
          value,
          unit: item.unit,
          target: target ?? undefined,
          percentRealized: realized == null ? undefined : Math.round(realized),
          trend: trendFromPercent(realized),
          status: statusFromPercent(realized),
        };
      });
  }, [rows]);

  const summary = useMemo(() => {
    const totalSales = findRow('TOTAL WATER & SEWER SALES');
    const billedVolume = findRow('TOTAL VOLUME BILLED');
    const billingEfficiency = findRow('Billing Efficiency (%)');
    const meterReadingEfficiency = findRow('Meter Reading Efficiency (%)');

    return {
      totalSalesMonthly: toNumber(totalSales?.monthly_actual.numeric),
      totalSalesCumulative: toNumber(totalSales?.cumulative_actual.numeric),
      billedVolumeMonthly: toNumber(billedVolume?.monthly_actual.numeric),
      billingEfficiencyMonthly: toPercent(billingEfficiency?.monthly_actual.numeric),
      meterReadingEfficiencyMonthly: toPercent(meterReadingEfficiency?.monthly_actual.numeric),
    };
  }, [rows]);

  const trendData = useMemo(() => {
    const records = kpisQuery.data?.results ?? [];
    const waterSales = records.find(kpi => normalizeLabel(kpi.label) === normalizeLabel('TOTAL WATER SALES'));
    const sewerSales = records.find(kpi => normalizeLabel(kpi.label) === normalizeLabel('TOTAL SEWER SALES'));
    const totalSales = records.find(
      kpi => normalizeLabel(kpi.label) === normalizeLabel('TOTAL WATER & SEWER SALES'),
    );

    return FY_MONTHS.map(month => {
      const water = waterSales?.monthly_values.find(item => item.month === month.value);
      const sewer = sewerSales?.monthly_values.find(item => item.month === month.value);
      const total = totalSales?.monthly_values.find(item => item.month === month.value);

      return {
        month: month.short,
        waterSales: toNumber(water?.actual_value_numeric),
        sewerSales: toNumber(sewer?.actual_value_numeric),
        totalSales: toNumber(total?.actual_value_numeric),
        target: toNumber(total?.target_value_numeric),
      };
    });
  }, [kpisQuery.data]);

  const customerCareStats = useMemo(() => {
    const stats = [
      {
        label: 'Accounts Billed',
        value: toNumber(findRow('Accounts Billed')?.monthly_actual.numeric),
        unit: 'No.',
        icon: Receipt,
      },
      {
        label: 'Active Water Connections',
        value: toNumber(
          findRow('TOTAL ACTIVE WATER CONNECTIONS')?.monthly_actual.numeric ??
          findRowContaining('ACTIVEWATERCONNECTIONS')?.monthly_actual.numeric,
        ),
        unit: 'No.',
        icon: Users,
      },
      {
        label: 'Active Sewer Connections',
        value: toNumber(
          findRow('TOTAL ACTIVE SEWER CONNECTIONS')?.monthly_actual.numeric ??
          findRowContaining('ACTIVESEWERCONNECTIONS')?.monthly_actual.numeric,
        ),
        unit: 'No.',
        icon: Users,
      },
      {
        label: 'Exhauster Sales',
        value: toNumber(findRow('EXHAUSTER SALES')?.monthly_actual.numeric),
        unit: 'KES',
        icon: Receipt,
      },
      {
        label: 'Complaints Booked',
        value: toNumber(findRow('NO. COMPLAINTS BOOKED')?.monthly_actual.numeric),
        unit: 'No.',
        icon: PhoneCall,
      },
      {
        label: 'Complaints Solved',
        value: toNumber(findRow('NO. COMPLAINTS SOLVED')?.monthly_actual.numeric),
        unit: 'No.',
        icon: PhoneCall,
      },
    ];

    return stats.filter(item => item.value > 0);
  }, [rows]);

  const regionalCards = useMemo(() => {
    return REGION_NAMES.map(regionName => {
      const waterSection = sections.find(section => section.title === 'TOTAL BILLING IN KSH - WATER');
      const sewerSection = sections.find(section => section.title === 'TOTAL SALES SEWER - KSH.');
      const billedVolumeSection = sections.find(section => section.title === 'TOTAL BILLING IN M3 - WATER');

      const regionMatcher = (row: CommercialDashboardRow) =>
        row.scope_type === 'REGION' &&
        (row.scope_name?.toUpperCase() ?? '').includes(regionName.toUpperCase());

      const waterRow = waterSection?.rows.find(regionMatcher) ?? null;
      const sewerRow = sewerSection?.rows.find(regionMatcher) ?? null;
      const billedRow = billedVolumeSection?.rows.find(regionMatcher) ?? null;

      return {
        region: regionName,
        waterSales: toNumber(waterRow?.monthly_actual.numeric),
        sewerSales: toNumber(sewerRow?.monthly_actual.numeric),
        billedVolume: toNumber(billedRow?.monthly_actual.numeric),
        realization: toPercent(waterRow?.monthly_realization_percent),
      };
    }).filter(card => card.waterSales > 0 || card.sewerSales > 0 || card.billedVolume > 0);
  }, [sections]);

  const regionalConnectionCards = useMemo(() => {
    const findRegionRow = (sectionTitle: string, regionName: string) => {
      const section = sections.find(item => normalizeLabel(item.title) === normalizeLabel(sectionTitle));
      return section?.rows.find(row =>
        row.scope_type === 'REGION' &&
        (row.scope_name?.toUpperCase() ?? '').includes(regionName.toUpperCase())
      ) ?? null;
    };

    return REGION_NAMES.map(regionName => {
      const totalWater = toNumber(findRegionRow('TOTAL CONNECTIONS-WATER', regionName)?.monthly_actual.numeric);
      const activeWater = toNumber(findRegionRow('TOTAL ACTIVE CONNECTIONS-WATER', regionName)?.monthly_actual.numeric);
      const totalSewer = toNumber(findRegionRow('TOTAL  CONNECTIONS-SEWER', regionName)?.monthly_actual.numeric);
      const activeSewer = toNumber(findRegionRow('TOTAL ACTIVE CONNECTIONS-SEWER', regionName)?.monthly_actual.numeric);
      const totalConnections = totalWater + totalSewer;
      const activeConnections = activeWater + activeSewer;

      return {
        region: regionName,
        totalWater,
        activeWater,
        inactiveWater: Math.max(totalWater - activeWater, 0),
        waterCoverage: ratioPercent(activeWater, totalWater),
        totalSewer,
        activeSewer,
        inactiveSewer: Math.max(totalSewer - activeSewer, 0),
        sewerCoverage: ratioPercent(activeSewer, totalSewer),
        totalConnections,
        activeConnections,
        overallCoverage: ratioPercent(activeConnections, totalConnections),
      };
    }).filter(card => card.totalConnections > 0 || card.activeConnections > 0);
  }, [sections]);

  if (reportsQuery.isLoading || (activeReport?.id && selectedMonth != null && dashboardQuery.isLoading)) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (reportsQuery.isError || dashboardQuery.isError) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <AlertCircle className="w-8 h-8 text-destructive" />
          <p>Failed to load Sales & Customer Care data.</p>
        </div>
      </div>
    );
  }

  if (!activeReport) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <AlertCircle className="w-8 h-8 text-warning" />
          <p>No Sales & Customer Care report has been imported yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/50 bg-card p-4">
        <div>
          <h2 className="section-title mb-1">Sales & Customer Care</h2>
          <p className="text-sm text-muted-foreground">
            Distribution commercial performance, billing, connections, and complaint handling.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={String(activeReport.id)}
            onValueChange={(value) => {
              setSelectedReportId(parseInt(value, 10));
              setSelectedMonth(null);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Report" />
            </SelectTrigger>
            <SelectContent>
              {reports.map(report => (
                <SelectItem key={report.id} value={String(report.id)}>
                  FY {report.fiscal_year_label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedMonth != null ? String(selectedMonth) : undefined}
            onValueChange={(value) => setSelectedMonth(parseInt(value, 10))}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {FY_MONTHS.map(month => (
                <SelectItem key={month.value} value={String(month.value)}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 animate-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Receipt className="w-6 h-6 text-emerald-500" />
            <div>
              <p className="text-sm text-muted-foreground">Monthly Water & Sewer Sales</p>
              <p className="text-2xl font-bold mono-value">{formatCompact(summary.totalSalesMonthly)} KES</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">YTD Sales:</span>{' '}
              <span className="font-semibold mono-value">{formatCompact(summary.totalSalesCumulative)} KES</span>
            </div>
            <div>
              <span className="text-muted-foreground">Billed Volume:</span>{' '}
              <span className="font-semibold mono-value">{formatCompact(summary.billedVolumeMonthly)} m3</span>
            </div>
            <div>
              <span className="text-muted-foreground">Billing Eff.:</span>{' '}
              <span className="font-semibold mono-value">{summary.billingEfficiencyMonthly?.toFixed(1) ?? '-'}%</span>
            </div>
            <div>
              <span className="text-muted-foreground">Meter Reading Eff.:</span>{' '}
              <span className="font-semibold mono-value">{summary.meterReadingEfficiencyMonthly?.toFixed(1) ?? '-'}%</span>
            </div>
          </div>
        </div>
      </div>

      <section>
        <h3 className="section-title mb-4 flex items-center gap-2">
          <Target className="w-4 h-4" /> Major KPI Summary
        </h3>
        <div className="data-grid">
          {monthlyKpis.map((kpi, idx) => (
            <FinanceKPICard key={kpi.label} {...kpi} delay={idx * 60} />
          ))}
        </div>
      </section>

      {regionalConnectionCards.length > 0 && (
        <section>
          <h3 className="section-title mb-4 flex items-center gap-2">
            <Users className="w-4 h-4" /> Regional Connections Coverage
          </h3>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {regionalConnectionCards.map((region, idx) => (
              <RegionConnectionsCard key={region.region} {...region} delay={idx * 75} />
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SalesTrendPanel data={trendData} />
        <div className="chart-container animate-slide-up" style={{ animationDelay: '220ms' }}>
          <div className="flex items-center gap-2 mb-4">
            <PhoneCall className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Customer Care & Connections</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {customerCareStats.map((item) => (
              <SummaryTile key={item.label} label={item.label} value={item.value} unit={item.unit} icon={item.icon} />
            ))}
          </div>
        </div>
      </section>

      {regionalCards.length > 0 && (
        <section>
          <h3 className="section-title mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Regional Sales Snapshot
          </h3>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {regionalCards.map((region, idx) => (
              <RegionSalesCard key={region.region} {...region} delay={idx * 75} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SalesTrendPanel({
  data,
}: {
  data: Array<{ month: string; waterSales: number; sewerSales: number; totalSales: number; target: number }>;
}) {
  return (
    <div className="chart-container animate-slide-up" style={{ animationDelay: '180ms' }}>
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Sales Trend</h3>
      </div>

      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickFormatter={(value) => formatCompact(value)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number, name: string) => [formatCompact(value), ({
                waterSales: 'Water Sales',
                sewerSales: 'Sewer Sales',
                totalSales: 'Water & Sewer Sales',
                target: 'Target',
              } as Record<string, string>)[name] ?? name]}
            />
            <Legend />
            <Line type="monotone" dataKey="waterSales" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Water Sales" />
            <Line type="monotone" dataKey="sewerSales" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} name="Sewer Sales" />
            <Line type="monotone" dataKey="totalSales" stroke="hsl(var(--success))" strokeWidth={3} dot={false} name="Water & Sewer Sales" />
            <Line type="monotone" dataKey="target" stroke="hsl(var(--warning))" strokeWidth={2} strokeDasharray="6 4" dot={false} name="Target" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  unit,
  icon: Icon,
}: {
  label: string;
  value: number;
  unit: string;
  icon: typeof Receipt;
}) {
  return (
    <div className="rounded-lg bg-muted/30 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-xl font-bold mono-value text-foreground">{formatCompact(value, unit)}</div>
      <div className="text-xs text-muted-foreground">{unit}</div>
    </div>
  );
}

function RegionConnectionsCard({
  region,
  totalWater,
  activeWater,
  inactiveWater,
  waterCoverage,
  totalSewer,
  activeSewer,
  inactiveSewer,
  sewerCoverage,
  overallCoverage,
  delay,
}: {
  region: string;
  totalWater: number;
  activeWater: number;
  inactiveWater: number;
  waterCoverage: number;
  totalSewer: number;
  activeSewer: number;
  inactiveSewer: number;
  sewerCoverage: number;
  overallCoverage: number;
  delay: number;
}) {
  const status = statusFromPercent(overallCoverage);

  return (
    <div className="chart-container animate-slide-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">{region} Region</h3>
        </div>
        <div
          className={cn(
            'rounded-full px-2 py-1 text-xs font-medium',
            status === 'good' && 'bg-success/10 text-success',
            status === 'warning' && 'bg-warning/10 text-warning',
            status === 'critical' && 'bg-destructive/10 text-destructive',
          )}
        >
          {overallCoverage.toFixed(1)}% Active
        </div>
      </div>

      <div className="space-y-4">
        <ConnectionCoverageRow
          label="Water"
          total={totalWater}
          active={activeWater}
          inactive={inactiveWater}
          coverage={waterCoverage}
        />
        <ConnectionCoverageRow
          label="Sewer"
          total={totalSewer}
          active={activeSewer}
          inactive={inactiveSewer}
          coverage={sewerCoverage}
        />
      </div>
    </div>
  );
}

function ConnectionCoverageRow({
  label,
  total,
  active,
  inactive,
  coverage,
}: {
  label: string;
  total: number;
  active: number;
  inactive: number;
  coverage: number;
}) {
  return (
    <div className="rounded-lg bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className={cn(
          'mono-value text-sm font-bold',
          coverage >= 90 ? 'text-success' : coverage >= 70 ? 'text-warning' : 'text-destructive'
        )}>
          {coverage > 0 ? `${coverage.toFixed(1)}%` : '-'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">Total</div>
          <div className="mono-value font-semibold">{formatCompact(total, 'No.')}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Active</div>
          <div className="mono-value font-semibold">{formatCompact(active, 'No.')}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Inactive</div>
          <div className="mono-value font-semibold">{formatCompact(inactive, 'No.')}</div>
        </div>
      </div>
    </div>
  );
}

function RegionSalesCard({
  region,
  waterSales,
  sewerSales,
  billedVolume,
  realization,
  delay,
}: {
  region: string;
  waterSales: number;
  sewerSales: number;
  billedVolume: number;
  realization: number | null;
  delay: number;
}) {
  const status = statusFromPercent(realization);

  return (
    <div className="chart-container animate-slide-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">{region} Region</h3>
        </div>
        <div
          className={cn(
            'rounded-full px-2 py-1 text-xs font-medium',
            status === 'good' && 'bg-success/10 text-success',
            status === 'warning' && 'bg-warning/10 text-warning',
            status === 'critical' && 'bg-destructive/10 text-destructive',
          )}
        >
          {realization != null ? `${realization.toFixed(1)}% Water Sales` : 'No target'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SummaryTile label="Water Sales" value={waterSales} unit="KES" icon={Receipt} />
        <SummaryTile label="Sewer Sales" value={sewerSales} unit="KES" icon={Receipt} />
        <SummaryTile label="Billed Volume" value={billedVolume} unit="m3" icon={Users} />
      </div>
    </div>
  );
}
