// src/pages/ProductionDashboard.tsx

import { useState, useMemo } from 'react';
import { Header } from '@/components/dashboard/Header';
import { ProductionKPICard } from '@/components/production/ProductionKPICard';
import { ProductionTrendChart } from '@/components/production/ProductionTrendChart';
import { EnergyChart } from '@/components/production/EnergyChart';
import { PeriodFilter } from '@/components/filters/PeriodFilter';
import { SiteFilter } from '@/components/filters/SiteFilter';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  useProductionSites,
  useProductionDashboard,
  useMonthlyProduction,
  useFyYearlyProduction,
  useFySiteTotals,
  useCompanySummary,
  useFyCompanySummary,
} from '@/hooks/useProduction';
import {
  Droplets, TrendingUp, Loader2, AlertCircle, Zap, DollarSign,
  FlaskConical, MapPin, Target, ArrowUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MonthlyProductionTrend } from '@/types/production';
import type { DashboardSummary, CompanyMonthlySummary, MonthlyProduction, FySiteProductionSummary } from '@/types/api';

// Financial year starts July — default to FY 2025 (Jul 2025 – Jun 2026)
const NOW = new Date();
// If we're past June (month ≥ 7), current FY start year is the current calendar year
// If we're in Jan–June, the FY started last calendar year
const DEFAULT_FY_YEAR = NOW.getMonth() >= 6 ? NOW.getFullYear() : NOW.getFullYear() - 1;
const DEFAULT_MONTH = NOW.getMonth() + 1; // current calendar month

// FY month order: Jul=7 … Dec=12, Jan=1 … Jun=6
const FY_MONTH_ORDER = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
const FY_MONTH_LABELS: Record<number, string> = {
  7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec',
  1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun',
};
const CALENDAR_MONTH_LABELS: Record<number, string> = {
  1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun',
  7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec',
};

// ── helpers ────────────────────────────────────────────────────────────────

function n(val: string | number | null | undefined): number {
  if (val == null || val === '') return 0;
  const parsed = typeof val === 'number' ? val : parseFloat(val as string);
  return isNaN(parsed) ? 0 : parsed;
}

function fmt(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
  return val.toFixed(0);
}

function fmtNum(val: number): string {
  return val.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function pctRealized(actual: number, target: number): number {
  return target > 0 ? (actual / target) * 100 : 0;
}

function pctStatus(pct: number): 'good' | 'warning' | 'critical' {
  if (pct >= 90) return 'good';
  if (pct >= 70) return 'warning';
  return 'critical';
}

function pctColor(pct: number): string {
  if (pct >= 90) return 'text-success';
  if (pct >= 70) return 'text-warning';
  return 'text-destructive';
}

/** Return the calendar year that the given month belongs to within a given FY start year.
 *  e.g. fyYear=2025, month=7 → 2025; fyYear=2025, month=1 → 2026 */
function calYearForFyMonth(fyYear: number, month: number): number {
  return month >= 7 ? fyYear : fyYear + 1;
}

// ── KPI comparison row ────────────────────────────────────────────────────

interface KPIRowProps {
  label: string;
  actual: number;
  target: number;
  unit: string;
  inverse?: boolean;
}

function KPIRow({ label, actual, target, inverse }: KPIRowProps) {
  const realization = pctRealized(actual, target);
  const variance = actual - target;
  // For inverse KPIs (costs, loss), lower actual is better
  const varColor = inverse
    ? (variance <= 0 ? 'text-success' : 'text-destructive')
    : (variance >= 0 ? 'text-success' : 'text-destructive');
  const realizationForColor = inverse
    ? (target > 0 ? (target / actual) * 100 : 100)
    : realization;

  return (
    <div className="grid grid-cols-5 gap-2 items-center py-2.5 px-3 rounded-lg hover:bg-muted/30 transition-colors">
      <div className="col-span-1 text-sm font-medium text-foreground">{label}</div>
      <div className="text-right mono-value text-sm">{fmt(target)}</div>
      <div className="text-right mono-value text-sm font-semibold">{fmt(actual)}</div>
      <div className={cn('text-right mono-value text-sm font-semibold', varColor)}>
        {variance >= 0 ? '+' : ''}{fmt(variance)}
      </div>
      <div className="text-right">
        <span className={cn('mono-value text-sm font-bold', pctColor(realizationForColor))}>
          {realization > 0 ? `${realization.toFixed(1)}%` : '—'}
        </span>
      </div>
    </div>
  );
}

function KPITableHeader({ unit }: { unit?: string }) {
  return (
    <div className="grid grid-cols-5 gap-2 py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border/50">
      <div>KPI</div>
      <div className="text-right">Target {unit ? `(${unit})` : ''}</div>
      <div className="text-right">Actual {unit ? `(${unit})` : ''}</div>
      <div className="text-right">Variance</div>
      <div className="text-right">Realization</div>
    </div>
  );
}

// ── component ──────────────────────────────────────────────────────────────

export default function ProductionDashboard() {
  const [selectedSite,  setSelectedSite]  = useState('all');
  // month=0 means "All Months (full FY)"
  const [selectedMonth, setSelectedMonth] = useState(DEFAULT_MONTH);
  const [selectedFyYear, setSelectedFyYear] = useState(DEFAULT_FY_YEAR);

  const isAllMonths = selectedMonth === 0;
  const siteParam = selectedSite !== 'all' ? { production_site: parseInt(selectedSite) } : {};

  // Calendar year to use when a specific month is selected (e.g. Jan 2026 is in FY 2025)
  const calYear = isAllMonths ? null : calYearForFyMonth(selectedFyYear, selectedMonth);

  // ── API queries ──────────────────────────────────────────────────────────

  const { data: sitesData } = useProductionSites({ is_active: true });

  // Dashboard summary — FY mode vs specific month
  const dashParams = isAllMonths
    ? { fy_year: selectedFyYear, ...siteParam }
    : { year: calYear!, month: selectedMonth, ...siteParam };

  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    isError: dashboardError,
    refetch,
  } = useProductionDashboard(dashParams);

  // Monthly records for the sites table/breakdowns
  const monthlyParams = isAllMonths
    ? null // don't fetch when "All" — table shows FY data from yearly hook
    : { year: calYear!, month: selectedMonth, ...siteParam };

  const { data: monthlyData, isLoading: tableLoading } = useMonthlyProduction(
    monthlyParams ?? {},
  );

  // Always fetch FY yearly data for trend charts
  const fyYearly = useFyYearlyProduction({ fyYear: selectedFyYear, ...siteParam });
  const previousFyYearly = useFyYearlyProduction({ fyYear: selectedFyYear - 1, ...siteParam });
  const fySiteTotals = useFySiteTotals(isAllMonths ? { fyYear: selectedFyYear, ...siteParam } : undefined);

  // Company summary
  const { data: companySingleData } = useCompanySummary(
    isAllMonths ? undefined : { year: calYear!, month: selectedMonth },
  );
  const { data: fyCompanyData } = useFyCompanySummary(
    isAllMonths ? { fyYear: selectedFyYear } : undefined,
  );

  // ── derived data ─────────────────────────────────────────────────────────

  const sites = useMemo(() => {
    if (!sitesData?.results) return [];
    return sitesData.results.map(s => ({ id: s.id.toString(), name: s.name }));
  }, [sitesData]);

  const summary: DashboardSummary | null = dashboardData ?? null;

  // Company summary: single month or FY aggregate
  const companySummary: CompanyMonthlySummary | null = isAllMonths ? null : (companySingleData?.results?.[0] ?? null);

  // FY company totals (aggregated across all months of the FY)
  const fyCompanyTotals = useMemo(() => {
    if (!isAllMonths || !fyCompanyData?.length) return null;
    const all = fyCompanyData;
    const sum = (f: keyof CompanyMonthlySummary) => all.reduce((s, r) => s + n(r[f] as any), 0);
    const avg = (f: keyof CompanyMonthlySummary) => {
      const vals = all.map(r => n(r[f] as any)).filter(v => v > 0);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    // Use the most recent record for regional dates (last available month of FY)
    const sorted = [...all].sort((a, b) => {
      const aOrder = a.month >= 7 ? a.month - 7 : a.month + 6;
      const bOrder = b.month >= 7 ? b.month - 7 : b.month + 6;
      return bOrder - aOrder;
    });
    const latest = sorted[0];
    return {
      target_power_costs: sum('target_power_costs'),
      target_repair_maintenance_costs: sum('target_repair_maintenance_costs'),
      target_abstraction_fee: sum('target_abstraction_fee'),
      target_chemical_costs: sum('target_chemical_costs'),
      target_total_direct_costs: sum('target_total_direct_costs'),
      power_costs: sum('power_costs'),
      repair_maintenance_costs: sum('repair_maintenance_costs'),
      abstraction_fee: sum('abstraction_fee'),
      chemical_costs: sum('chemical_costs'),
      total_direct_costs: sum('total_direct_costs'),
      // Water quality — average compliance, sum test counts
      target_chemical_tests_production: sum('target_chemical_tests_production'),
      target_biological_tests_production: sum('target_biological_tests_production'),
      target_chemical_tests_consumer: sum('target_chemical_tests_consumer'),
      target_biological_tests_consumer: sum('target_biological_tests_consumer'),
      chemical_tests_production: sum('chemical_tests_production'),
      biological_tests_production: sum('biological_tests_production'),
      chemical_tests_consumer: sum('chemical_tests_consumer'),
      biological_tests_consumer: sum('biological_tests_consumer'),
      who_compliance_chemical_production: avg('who_compliance_chemical_production'),
      who_compliance_biological_production: avg('who_compliance_biological_production'),
      who_compliance_chemical_consumer: avg('who_compliance_chemical_consumer'),
      who_compliance_biological_consumer: avg('who_compliance_biological_consumer'),
      // Regional — from latest available month
      central_opening_date: latest?.central_opening_date ?? null,
      central_closing_date: latest?.central_closing_date ?? null,
      central_production_loss_m3: sum('central_production_loss_m3'),
      central_available_for_sale_m3: sum('central_available_for_sale_m3'),
      southern_opening_date: latest?.southern_opening_date ?? null,
      southern_closing_date: latest?.southern_closing_date ?? null,
      southern_production_loss_m3: sum('southern_production_loss_m3'),
      southern_available_for_sale_m3: sum('southern_available_for_sale_m3'),
      eastern_opening_date: latest?.eastern_opening_date ?? null,
      eastern_closing_date: latest?.eastern_closing_date ?? null,
      eastern_production_loss_m3: sum('eastern_production_loss_m3'),
      eastern_available_for_sale_m3: sum('eastern_available_for_sale_m3'),
    };
  }, [isAllMonths, fyCompanyData]);

  // Effective company data (single month or FY aggregate)
  const effectiveCompany = isAllMonths ? fyCompanyTotals : companySummary;

  // Build trend data — group by month in FY order, aggregate across sites
  const trendData = useMemo((): MonthlyProductionTrend[] => {
    const allRecords = [
      ...(previousFyYearly.data?.results ?? []),
      ...(fyYearly.data?.results ?? []),
    ];
    if (!allRecords.length) return [];

    const byYearMonth: Record<string, MonthlyProductionTrend> = {};
    for (const rec of allRecords) {
      const key = `${rec.year}-${rec.month}`;
      if (!byYearMonth[key]) {
        byYearMonth[key] = {
          month: CALENDAR_MONTH_LABELS[rec.month],
          production: 0,
          target: 0,
          solarEnergy: 0,
          gridEnergy: 0,
          energyCost: 0,
        };
      }
      byYearMonth[key].production += n(rec.water_abstracted_m3);
      byYearMonth[key].target += n(rec.target_details?.water_abstraction_target_m3);
      byYearMonth[key].solarEnergy += n(rec.power_solar_kwh);
      byYearMonth[key].gridEnergy += n(rec.power_grid_kwh);
      byYearMonth[key].energyCost += n(rec.power_costs);
    }

    const emptyPoint = (month: number): MonthlyProductionTrend => ({
      month: CALENDAR_MONTH_LABELS[month],
      production: 0,
      target: 0,
      solarEnergy: 0,
      gridEnergy: 0,
      energyCost: 0,
    });

    if (isAllMonths) {
      return FY_MONTH_ORDER.map((month) => {
        const year = calYearForFyMonth(selectedFyYear, month);
        return byYearMonth[`${year}-${month}`] ?? emptyPoint(month);
      });
    }

    const anchorYear = calYearForFyMonth(selectedFyYear, selectedMonth);
    const rollingPeriods = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(anchorYear, selectedMonth - 1 - 11 + i, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });

    return rollingPeriods.map(({ year, month }) => (
      byYearMonth[`${year}-${month}`] ?? emptyPoint(month)
    ));
  }, [previousFyYearly.data, fyYearly.data, isAllMonths, selectedFyYear, selectedMonth]);

  const tableRows: (MonthlyProduction | FySiteProductionSummary)[] = isAllMonths
    ? (fySiteTotals.data ?? [])
    : (monthlyData?.results ?? []);

  const supplyForDisplay = (record: MonthlyProduction | FySiteProductionSummary) => {
    const supplied = n(record.water_supplied_m3);
    if (supplied > 0) return supplied;
    return n(record.water_available_for_sale_m3);
  };

  // ── loading / error states ─────────────────────────────────────────────

  if (dashboardLoading) {
    return (
      <div className="min-h-screen bg-gradient-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (dashboardError) {
    return (
      <div className="min-h-screen bg-gradient-surface flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <AlertCircle className="w-8 h-8 text-destructive" />
          <p>Failed to load dashboard data. Please try again.</p>
          <button onClick={() => refetch()} className="text-sm text-primary underline">Retry</button>
        </div>
      </div>
    );
  }

  // ── period label ──────────────────────────────────────────────────────────

  const periodLabel = isAllMonths
    ? `FY ${selectedFyYear}/${String(selectedFyYear + 1).slice(-2)}`
    : `${FY_MONTH_LABELS[selectedMonth] ?? ''} ${calYear}`;

  // ── pre-computed aggregated values ────────────────────────────────────────

  const totalWater  = n(summary?.total_water_abstracted);
  const totalSupply = n(summary?.total_water_supplied);
  const totalLoss   = n(summary?.total_production_loss);
  const lossPct     = n(summary?.production_loss_percentage);
  const totalPower  = n(summary?.total_power_consumption);
  const gridPower   = n(summary?.total_grid_power);
  const solarPower  = n(summary?.total_solar_power);
  const solarPct    = n(summary?.solar_power_percentage);
  const efficiency  = n(summary?.average_power_efficiency);
  const realization = n(summary?.target_realization_percentage);

  const tWater     = n(summary?.target_water_abstracted);
  const tSupply    = n(summary?.target_water_supplied);
  const tLoss      = n(summary?.target_production_loss);
  const tLossPct   = n(summary?.target_production_loss_percentage);
  const tPower     = n(summary?.target_power_consumption);
  const tGrid      = n(summary?.target_grid_power);
  const tSolar     = n(summary?.target_solar_power);
  const tSolarPct  = n(summary?.target_solar_percentage);
  const tEfficiency = n(summary?.target_power_efficiency);

  const cTargetPowerCosts   = effectiveCompany ? n(effectiveCompany.target_power_costs as any) : 0;
  const cTargetRM           = effectiveCompany ? n(effectiveCompany.target_repair_maintenance_costs as any) : 0;
  const cTargetAbstraction  = effectiveCompany ? n(effectiveCompany.target_abstraction_fee as any) : 0;
  const cTargetChemical     = effectiveCompany ? n(effectiveCompany.target_chemical_costs as any) : 0;
  const cTargetTotalCosts   = effectiveCompany ? n(effectiveCompany.target_total_direct_costs as any) : 0;
  const cPowerCosts  = effectiveCompany ? n(effectiveCompany.power_costs as any) : 0;
  const cRM          = effectiveCompany ? n(effectiveCompany.repair_maintenance_costs as any) : 0;
  const cAbstraction = effectiveCompany ? n(effectiveCompany.abstraction_fee as any) : 0;
  const cChemical    = effectiveCompany ? n(effectiveCompany.chemical_costs as any) : 0;
  const cTotalCosts  = effectiveCompany ? n(effectiveCompany.total_direct_costs as any) : 0;
  const cCostPerM3   = totalSupply > 0 && cTotalCosts > 0 ? cTotalCosts / totalSupply : 0;
  const cTargetCostPerM3 = tSupply > 0 && cTargetTotalCosts > 0 ? cTargetTotalCosts / tSupply : 0;

  return (
    <div className="min-h-screen bg-gradient-surface">
      <div className="container py-6 md:py-8">
        <Header currentPeriod={periodLabel} onRefresh={refetch} />

        <Tabs defaultValue="overview" className="space-y-6">
          <div className="rounded-2xl border border-border/50 bg-card/70 p-4 shadow-soft">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-foreground">Production</h2>
              <TabsList className="h-auto flex-wrap gap-1 p-1">
                <TabsTrigger value="overview" className="flex items-center gap-1.5"><Droplets className="w-3.5 h-3.5" /> Overview</TabsTrigger>
                <TabsTrigger value="power" className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Power & Energy</TabsTrigger>
                <TabsTrigger value="costs" className="flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Costs</TabsTrigger>
                <TabsTrigger value="quality" className="flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5" /> Water Quality</TabsTrigger>
                <TabsTrigger value="regional" className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Regional</TabsTrigger>
                <TabsTrigger value="sites" className="flex items-center gap-1.5"><ArrowUpDown className="w-3.5 h-3.5" /> Sites</TabsTrigger>
              </TabsList>
            </div>
          </div>

          <div className="space-y-6">

          {/* ── Filters ───────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/50 bg-card p-4">
            <SiteFilter sites={sites} selectedSite={selectedSite} onSiteChange={setSelectedSite} />
            <PeriodFilter
              selectedMonth={selectedMonth.toString()}
              selectedYear={selectedFyYear.toString()}
              onMonthChange={(m) => setSelectedMonth(parseInt(m))}
              onYearChange={(y) => setSelectedFyYear(parseInt(y))}
            />
          </div>

          {/* ── Summary Banner ────────────────────────────────────────── */}
          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 animate-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-6 h-6 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Abstraction — {periodLabel}</p>
                  <p className="text-2xl font-bold mono-value">
                    {totalWater > 0 ? `${fmt(totalWater)} m³` : '— m³'}
                  </p>
                </div>
              </div>
              <div className="flex gap-6 text-sm flex-wrap">
                <div>
                  <span className="text-muted-foreground">Available for Sale:</span>{' '}
                  <span className="font-semibold mono-value">{totalSupply > 0 ? `${fmt(totalSupply)} m³` : '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Realization:</span>{' '}
                  <span className={cn('font-semibold mono-value', pctColor(realization))}>
                    {realization > 0 ? `${realization.toFixed(1)}%` : '—'}
                  </span>
                </div>
                {cTotalCosts > 0 && (
                  <div>
                    <span className="text-muted-foreground">Total Costs:</span>{' '}
                    <span className="font-semibold mono-value">KES {fmt(cTotalCosts)}</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Sites:</span>{' '}
                  <span className="font-semibold mono-value">{summary?.active_sites ?? '—'} active</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Sub-navigation Tabs ──────────────────────────────────── */}


            {/* ════════════════════ OVERVIEW TAB ════════════════════════ */}
            <TabsContent value="overview" className="space-y-6">
              <section>
                <h2 className="section-title mb-4 flex items-center gap-2">
                  <Target className="w-4 h-4" /> Water Production KPIs — {periodLabel}
                </h2>
                <div className="data-grid">
                  <ProductionKPICard label="Water Abstracted" value={totalWater} unit="m³" target={tWater} percentRealized={pctRealized(totalWater, tWater)} trend={totalWater >= tWater * 0.9 ? 'up' : 'down'} status={pctStatus(pctRealized(totalWater, tWater))} delay={0} />
                  <ProductionKPICard label="Water Supplied"   value={totalSupply} unit="m³" target={tSupply} percentRealized={pctRealized(totalSupply, tSupply)} trend={totalSupply >= tSupply * 0.9 ? 'up' : 'down'} status={pctStatus(pctRealized(totalSupply, tSupply))} delay={100} />
                  <ProductionKPICard label="Production Loss"  value={totalLoss}  unit="m³" target={tLoss} percentRealized={pctRealized(totalLoss, tLoss)} trend={totalLoss <= tLoss ? 'down' : 'up'} status={totalLoss <= tLoss * 1.1 ? 'good' : totalLoss <= tLoss * 1.3 ? 'warning' : 'critical'} delay={200} />
                  <ProductionKPICard label="Loss %"           value={lossPct}    unit="%" target={tLossPct} percentRealized={tLossPct > 0 ? (tLossPct / lossPct) * 100 : 0} trend={lossPct <= tLossPct ? 'down' : 'up'} status={lossPct <= tLossPct * 1.1 ? 'good' : lossPct <= tLossPct * 1.3 ? 'warning' : 'critical'} delay={300} />
                </div>
              </section>

              {/* Trend charts */}
              <section>
                <h2 className="section-title mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> {isAllMonths
                    ? `FY ${selectedFyYear}/${String(selectedFyYear + 1).slice(-2)} Trends (Jul → Jun)`
                    : `YTD Trends (Rolling 12 Months to ${FY_MONTH_LABELS[selectedMonth]} ${calYear})`}
                </h2>
                {trendData.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ProductionTrendChart data={trendData} />
                    <EnergyChart data={trendData} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">No monthly records found for this financial year.</p>
                )}
              </section>

              {/* Full KPI comparison table */}
              <section>
                <h2 className="section-title mb-4">All Production KPIs</h2>
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                  <KPITableHeader unit="m³ / kWh / %" />
                  <div className="divide-y divide-border/30">
                    <KPIRow label="Water Abstracted"   actual={totalWater}  target={tWater}     unit="m³" />
                    <KPIRow label="Water Supplied"     actual={totalSupply} target={tSupply}    unit="m³" />
                    <KPIRow label="Production Loss"    actual={totalLoss}   target={tLoss}      unit="m³"     inverse />
                    <KPIRow label="Loss %"             actual={lossPct}     target={tLossPct}   unit="%"      inverse />
                    <KPIRow label="Grid Power"         actual={gridPower}   target={tGrid}      unit="kWh" />
                    <KPIRow label="Solar Power"        actual={solarPower}  target={tSolar}     unit="kWh" />
                    <KPIRow label="Total Power"        actual={totalPower}  target={tPower}     unit="kWh" />
                    <KPIRow label="Solar %"            actual={solarPct}    target={tSolarPct}  unit="%" />
                    <KPIRow label="Efficiency"         actual={efficiency}  target={tEfficiency} unit="kWh/m³" inverse />
                    {effectiveCompany && <>
                      <KPIRow label="Total Direct Costs" actual={cTotalCosts} target={cTargetTotalCosts} unit="KES" inverse />
                      <KPIRow label="Cost per m³"        actual={cCostPerM3}  target={cTargetCostPerM3}  unit="KES/m³" inverse />
                    </>}
                  </div>
                </div>
              </section>
            </TabsContent>

            {/* ════════════════════ POWER & ENERGY TAB ══════════════════ */}
            <TabsContent value="power" className="space-y-6">
              <section>
                <h2 className="section-title mb-4 flex items-center gap-2"><Zap className="w-4 h-4" /> Power & Energy KPIs</h2>
                <div className="data-grid">
                  <ProductionKPICard label="Grid Power"    value={gridPower}  unit="kWh" target={tGrid}      percentRealized={pctRealized(gridPower, tGrid)}   status={pctStatus(pctRealized(gridPower, tGrid))}   delay={0}   variant="energy" />
                  <ProductionKPICard label="Solar Power"   value={solarPower} unit="kWh" target={tSolar}     percentRealized={pctRealized(solarPower, tSolar)}  status={pctStatus(pctRealized(solarPower, tSolar))} delay={100} variant="solar" />
                  <ProductionKPICard label="Total Power"   value={totalPower} unit="kWh" target={tPower}     percentRealized={pctRealized(totalPower, tPower)}  status={pctStatus(pctRealized(totalPower, tPower))} delay={200} variant="energy" />
                  <ProductionKPICard label="Solar %"       value={solarPct}   unit="%"   target={tSolarPct}  percentRealized={tSolarPct > 0 ? (solarPct / tSolarPct) * 100 : 0} status={solarPct >= tSolarPct * 0.9 ? 'good' : 'warning'} delay={300} variant="solar" />
                  <ProductionKPICard label="Power Efficiency" value={efficiency} unit="kWh/m³" target={tEfficiency} percentRealized={tEfficiency > 0 ? (tEfficiency / efficiency) * 100 : 0} status={efficiency <= tEfficiency * 1.1 ? 'good' : 'warning'} delay={400} />
                </div>
              </section>

              {trendData.length > 0 && (
                <section>
                  <h2 className="section-title mb-4">
                    Energy Trends — {isAllMonths
                      ? `FY ${selectedFyYear}/${String(selectedFyYear + 1).slice(-2)}`
                      : `YTD (Rolling 12 Months to ${FY_MONTH_LABELS[selectedMonth]} ${calYear})`}
                  </h2>
                  <EnergyChart data={trendData} />
                </section>
              )}

              <section>
                <h2 className="section-title mb-4">Per-Site Power Breakdown — {periodLabel}</h2>
                <div className="overflow-x-auto rounded-xl border border-border/50">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3 text-xs font-medium">Site</th>
                        <th className="text-right p-3 text-xs font-medium">Grid (kWh)</th>
                        <th className="text-right p-3 text-xs font-medium">Solar (kWh)</th>
                        <th className="text-right p-3 text-xs font-medium">Total (kWh)</th>
                        <th className="text-right p-3 text-xs font-medium">Solar %</th>
                        <th className="text-right p-3 text-xs font-medium">Actual Eff.</th>
                        <th className="text-right p-3 text-xs font-medium">Target Eff.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.length === 0 ? (
                        <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No data</td></tr>
                      ) : tableRows.map(site => (
                        <tr key={site.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="p-3 text-sm font-medium">{site.production_site_name}</td>
                          <td className="p-3 text-right mono-value text-sm">{fmtNum(n(site.power_grid_kwh))}</td>
                          <td className="p-3 text-right mono-value text-sm">{fmtNum(n(site.power_solar_kwh))}</td>
                          <td className="p-3 text-right mono-value text-sm font-semibold">{fmtNum(n(site.total_power_kwh))}</td>
                          <td className="p-3 text-right mono-value text-sm">{n(site.solar_percentage) > 0 ? `${n(site.solar_percentage).toFixed(1)}%` : '—'}</td>
                          <td className="p-3 text-right mono-value text-sm">{n(site.power_efficiency_kwh_per_m3) > 0 ? n(site.power_efficiency_kwh_per_m3).toFixed(2) : '—'}</td>
                          <td className="p-3 text-right mono-value text-sm text-muted-foreground">{site.target_details?.power_efficiency_target_kwh_per_m3 ? n(site.target_details.power_efficiency_target_kwh_per_m3).toFixed(2) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </TabsContent>

            {/* ════════════════════ COSTS TAB ═══════════════════════════ */}
            <TabsContent value="costs" className="space-y-6">
              <section>
                <h2 className="section-title mb-4 flex items-center gap-2"><DollarSign className="w-4 h-4" /> Cost KPIs — {isAllMonths ? `Full FY ${selectedFyYear}/${String(selectedFyYear + 1).slice(-2)}` : periodLabel}</h2>
                {effectiveCompany ? (
                  <>
                    <div className="data-grid mb-6">
                      <ProductionKPICard label="Total Direct Costs" value={cTotalCosts}  unit="KES" target={cTargetTotalCosts}  percentRealized={pctRealized(cTotalCosts, cTargetTotalCosts)}   status={cTotalCosts <= cTargetTotalCosts * 1.05 ? 'good' : 'warning'} delay={0} />
                      <ProductionKPICard label="Power Costs"        value={cPowerCosts}  unit="KES" target={cTargetPowerCosts}   percentRealized={pctRealized(cPowerCosts, cTargetPowerCosts)}    status={cPowerCosts <= cTargetPowerCosts * 1.05 ? 'good' : 'warning'} delay={100} />
                      <ProductionKPICard label="R&M Costs"          value={cRM}          unit="KES" target={cTargetRM}           percentRealized={pctRealized(cRM, cTargetRM)}                    status={cRM <= cTargetRM * 1.05 ? 'good' : 'warning'} delay={200} />
                      <ProductionKPICard label="Cost per m³"        value={cCostPerM3}   unit="KES/m³" target={cTargetCostPerM3} percentRealized={cTargetCostPerM3 > 0 ? (cTargetCostPerM3 / cCostPerM3) * 100 : 0} status={cCostPerM3 <= cTargetCostPerM3 * 1.1 ? 'good' : 'warning'} delay={300} />
                    </div>
                    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                      <KPITableHeader unit="KES" />
                      <div className="divide-y divide-border/30">
                        <KPIRow label="Power Costs"        actual={cPowerCosts}  target={cTargetPowerCosts}  unit="KES" inverse />
                        <KPIRow label="R&M Costs"          actual={cRM}          target={cTargetRM}          unit="KES" inverse />
                        <KPIRow label="Abstraction Fee"    actual={cAbstraction} target={cTargetAbstraction} unit="KES" inverse />
                        <KPIRow label="Chemical Costs"     actual={cChemical}    target={cTargetChemical}    unit="KES" inverse />
                        <KPIRow label="Total Direct Costs" actual={cTotalCosts}  target={cTargetTotalCosts}  unit="KES" inverse />
                        <KPIRow label="Cost per m³"        actual={cCostPerM3}   target={cTargetCostPerM3}   unit="KES/m³" inverse />
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">Company-level cost data not available for this period.</p>
                )}
              </section>
            </TabsContent>

            {/* ════════════════════ WATER QUALITY TAB ══════════════════ */}
            <TabsContent value="quality" className="space-y-6">
              <section>
                <h2 className="section-title mb-4 flex items-center gap-2"><FlaskConical className="w-4 h-4" /> Water Quality Testing & WHO Compliance</h2>
                {effectiveCompany ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      <div className="rounded-xl border border-border/50 bg-card p-5">
                        <h3 className="font-semibold text-sm mb-4">Production Point Tests</h3>
                        <div className="space-y-4">
                          <TestCountBar label="Chemical Tests"   actual={n(effectiveCompany.chemical_tests_production as any)}  target={n(effectiveCompany.target_chemical_tests_production as any)} />
                          <TestCountBar label="Biological Tests" actual={n(effectiveCompany.biological_tests_production as any)} target={n(effectiveCompany.target_biological_tests_production as any)} />
                        </div>
                        <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
                          <ComplianceBadge label="Chemical WHO Compliance"   value={n(effectiveCompany.who_compliance_chemical_production as any)} />
                          <ComplianceBadge label="Biological WHO Compliance" value={n(effectiveCompany.who_compliance_biological_production as any)} />
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/50 bg-card p-5">
                        <h3 className="font-semibold text-sm mb-4">Consumer Point Tests</h3>
                        <div className="space-y-4">
                          <TestCountBar label="Chemical Tests"   actual={n(effectiveCompany.chemical_tests_consumer as any)}  target={n(effectiveCompany.target_chemical_tests_consumer as any)} />
                          <TestCountBar label="Biological Tests" actual={n(effectiveCompany.biological_tests_consumer as any)} target={n(effectiveCompany.target_biological_tests_consumer as any)} />
                        </div>
                        <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
                          <ComplianceBadge label="Chemical WHO Compliance"   value={n(effectiveCompany.who_compliance_chemical_consumer as any)} />
                          <ComplianceBadge label="Biological WHO Compliance" value={n(effectiveCompany.who_compliance_biological_consumer as any)} />
                        </div>
                      </div>
                    </div>
                    <div className="data-grid">
                      <ProductionKPICard label="WHO Chemical (Prod)"     value={n(effectiveCompany.who_compliance_chemical_production as any)}   unit="%" target={100} percentRealized={n(effectiveCompany.who_compliance_chemical_production as any)}   status={n(effectiveCompany.who_compliance_chemical_production as any) >= 95 ? 'good' : 'warning'} delay={0} />
                      <ProductionKPICard label="WHO Biological (Prod)"   value={n(effectiveCompany.who_compliance_biological_production as any)} unit="%" target={100} percentRealized={n(effectiveCompany.who_compliance_biological_production as any)} status={n(effectiveCompany.who_compliance_biological_production as any) >= 95 ? 'good' : 'warning'} delay={100} />
                      <ProductionKPICard label="WHO Chemical (Consumer)" value={n(effectiveCompany.who_compliance_chemical_consumer as any)}     unit="%" target={100} percentRealized={n(effectiveCompany.who_compliance_chemical_consumer as any)}     status={n(effectiveCompany.who_compliance_chemical_consumer as any) >= 95 ? 'good' : 'warning'} delay={200} />
                      <ProductionKPICard label="WHO Biological (Consumer)" value={n(effectiveCompany.who_compliance_biological_consumer as any)} unit="%" target={100} percentRealized={n(effectiveCompany.who_compliance_biological_consumer as any)} status={n(effectiveCompany.who_compliance_biological_consumer as any) >= 95 ? 'good' : 'warning'} delay={300} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">Water quality data not available for this period.</p>
                )}
              </section>
            </TabsContent>

            {/* ════════════════════ REGIONAL TAB ════════════════════════ */}
            <TabsContent value="regional" className="space-y-6">
              <section>
                <h2 className="section-title mb-4 flex items-center gap-2"><MapPin className="w-4 h-4" /> Regional Summary — {periodLabel}</h2>
                {effectiveCompany ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <RegionalCard region="Central"  openingDate={effectiveCompany.central_opening_date as any}  closingDate={effectiveCompany.central_closing_date as any}  productionLoss={n(effectiveCompany.central_production_loss_m3 as any)}  availableForSale={n(effectiveCompany.central_available_for_sale_m3 as any)}  color="bg-blue-500/10 border-blue-500/30" />
                    <RegionalCard region="Southern" openingDate={effectiveCompany.southern_opening_date as any} closingDate={effectiveCompany.southern_closing_date as any} productionLoss={n(effectiveCompany.southern_production_loss_m3 as any)} availableForSale={n(effectiveCompany.southern_available_for_sale_m3 as any)} color="bg-amber-500/10 border-amber-500/30" />
                    <RegionalCard region="Eastern"  openingDate={effectiveCompany.eastern_opening_date as any}  closingDate={effectiveCompany.eastern_closing_date as any}  productionLoss={n(effectiveCompany.eastern_production_loss_m3 as any)}  availableForSale={n(effectiveCompany.eastern_available_for_sale_m3 as any)}  color="bg-emerald-500/10 border-emerald-500/30" />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">Regional data not available for this period.</p>
                )}
              </section>

              <section>
                <h2 className="section-title mb-4">Sites by Region — {periodLabel}</h2>
                {(['Central', 'Southern', 'Eastern'] as const).map(regionName => {
                  const regionRows = tableRows.filter(r =>
                    r.region_name?.toUpperCase().includes(regionName.toUpperCase())
                  );
                  if (!regionRows.length) return null;
                  const regionTotal = regionRows.reduce((s, r) => s + supplyForDisplay(r), 0);
                  return (
                    <div key={regionName} className="mb-4">
                      <h3 className="text-sm font-semibold mb-2 text-muted-foreground">
                        {regionName} Region — Available for Sale:{' '}
                        <span className="text-foreground mono-value">{fmtNum(regionTotal)} m³</span>
                      </h3>
                      <div className="overflow-x-auto rounded-lg border border-border/50">
                        <table className="w-full">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left p-2.5 text-xs font-medium">Site</th>
                              <th className="text-right p-2.5 text-xs font-medium">Abstracted (m³)</th>
                              <th className="text-right p-2.5 text-xs font-medium">Supplied (m³)</th>
                              <th className="text-right p-2.5 text-xs font-medium">Loss %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {regionRows.map(site => (
                              <tr key={site.id} className="border-b border-border/50 hover:bg-muted/30">
                                <td className="p-2.5 text-sm">{site.production_site_name}</td>
                                <td className="p-2.5 text-right mono-value text-sm">{fmtNum(n(site.water_abstracted_m3))}</td>
                                <td className="p-2.5 text-right mono-value text-sm">{fmtNum(supplyForDisplay(site))}</td>
                                <td className="p-2.5 text-right mono-value text-sm">{n(site.production_loss_percentage) > 0 ? `${n(site.production_loss_percentage).toFixed(1)}%` : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </section>
            </TabsContent>

            {/* ════════════════════ SITES TAB ═══════════════════════════ */}
            <TabsContent value="sites" className="space-y-6">
              <section>
                <h2 className="section-title mb-4">All Production Sites — {periodLabel}</h2>
                <div className="overflow-x-auto rounded-xl border border-border/50">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3 text-xs font-medium">Site</th>
                        <th className="text-right p-3 text-xs font-medium">Region</th>
                        <th className="text-right p-3 text-xs font-medium">Target (m³)</th>
                        <th className="text-right p-3 text-xs font-medium">Actual (m³)</th>
                        <th className="text-right p-3 text-xs font-medium">Supplied (m³)</th>
                        <th className="text-right p-3 text-xs font-medium">Loss %</th>
                        <th className="text-right p-3 text-xs font-medium">Power (kWh)</th>
                        <th className="text-right p-3 text-xs font-medium">Eff. (kWh/m³)</th>
                        <th className="text-right p-3 text-xs font-medium">Realization</th>
                        <th className="text-right p-3 text-xs font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(tableLoading || (isAllMonths && fySiteTotals.isLoading)) ? (
                        <tr><td colSpan={10} className="p-6 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading...</td></tr>
                      ) : tableRows.length === 0 ? (
                        <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">No production records for {periodLabel}.</td></tr>
                      ) : tableRows.map(site => {
                        const real = n(site.water_abstraction_realization_percent);
                        return (
                          <tr key={site.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                            <td className="p-3 text-sm font-medium">{site.production_site_name}</td>
                            <td className="p-3 text-right text-xs text-muted-foreground">{site.region_name}</td>
                            <td className="p-3 text-right mono-value text-sm text-muted-foreground">{site.target_details ? fmtNum(n(site.target_details.water_abstraction_target_m3)) : '—'}</td>
                            <td className="p-3 text-right mono-value text-sm font-semibold">{fmtNum(n(site.water_abstracted_m3))}</td>
                            <td className="p-3 text-right mono-value text-sm">{fmtNum(supplyForDisplay(site))}</td>
                            <td className="p-3 text-right mono-value text-sm">{n(site.production_loss_percentage) > 0 ? `${n(site.production_loss_percentage).toFixed(1)}%` : '—'}</td>
                            <td className="p-3 text-right mono-value text-sm">{fmtNum(n(site.total_power_kwh))}</td>
                            <td className="p-3 text-right mono-value text-sm">{n(site.power_efficiency_kwh_per_m3) > 0 ? n(site.power_efficiency_kwh_per_m3).toFixed(2) : '—'}</td>
                            <td className="p-3 text-right">
                              <span className={cn('mono-value text-sm font-bold', pctColor(real))}>{real > 0 ? `${real.toFixed(1)}%` : '—'}</span>
                            </td>
                            <td className="p-3 text-right">
                              {site.is_finalized
                                ? <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium">Finalized</span>
                                : <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning font-medium">Draft</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

// ── Helper sub-components ──────────────────────────────────────────────────

function TestCountBar({ label, actual, target }: { label: string; actual: number; target: number }) {
  const pct = target > 0 ? (actual / target) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="mono-value text-muted-foreground">{actual} / {target}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', pct >= 90 ? 'bg-success' : pct >= 70 ? 'bg-warning' : 'bg-destructive')} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="text-right text-xs text-muted-foreground">{pct.toFixed(0)}% realized</div>
    </div>
  );
}

function ComplianceBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-bold mono-value', value >= 95 ? 'text-success' : value >= 80 ? 'text-warning' : 'text-destructive')}>
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

function RegionalCard({ region, openingDate, closingDate, productionLoss, availableForSale, color }: {
  region: string; openingDate: string | null; closingDate: string | null;
  productionLoss: number; availableForSale: number; color: string;
}) {
  return (
    <div className={cn('rounded-xl border p-5 space-y-3', color)}>
      <h3 className="font-semibold text-lg">{region} Region</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Opening Date</span>
          <span className="font-medium mono-value">{openingDate ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Closing Date</span>
          <span className="font-medium mono-value">{closingDate ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Production Loss</span>
          <span className="font-medium mono-value">{fmtNum(productionLoss)} m³</span>
        </div>
        <div className="flex justify-between border-t border-border/50 pt-2">
          <span className="text-muted-foreground font-medium">Available for Sale</span>
          <span className="font-bold mono-value text-foreground">{fmtNum(availableForSale)} m³</span>
        </div>
      </div>
    </div>
  );
}
