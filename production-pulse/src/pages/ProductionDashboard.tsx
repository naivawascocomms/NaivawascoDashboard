// src/pages/ProductionDashboard.tsx

import { useState, useMemo } from 'react';
import { KpiCard } from '@/components/kpi/KpiCard';
import { PageToolbar } from '@/components/layout/PageToolbar';
import { ErrorState, LoadingState } from '@/components/layout/QueryState';
import { ProductionTrendChart } from '@/components/production/ProductionTrendChart';
import { EnergyChart } from '@/components/production/EnergyChart';
import { KPIRow, KpiComparisonTable } from '@/components/production/KpiComparisonTable';
import { WaterQualitySection } from '@/components/production/WaterQualitySection';
import { RegionalSection } from '@/components/production/RegionalSection';
import { AllSitesTable, PowerBreakdownTable } from '@/components/production/SiteTables';
import { pctColor, pctRealized, pctStatus, type CompanySummaryLike } from '@/components/production/shared';
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
import { toNumber as n, formatCompact as fmt, formatNumber as fmtNum } from '@/lib/format';
import {
  FY_MONTH_ORDER,
  MONTH_SHORT_LABELS,
  calYearForFyMonth,
  formatFyLabel,
  fyYearForDate,
} from '@/lib/fiscalYear';
import type { MonthlyProductionTrend } from '@/types/production';
import type { DashboardSummary, CompanyMonthlySummary, MonthlyProduction, FySiteProductionSummary } from '@/types/api';

const DEFAULT_FY_YEAR = fyYearForDate();
const DEFAULT_MONTH = new Date().getMonth() + 1; // current calendar month

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
    const sum = (f: keyof CompanyMonthlySummary) => all.reduce((s, r) => s + n(r[f] as string | number | null), 0);
    const avg = (f: keyof CompanyMonthlySummary) => {
      const vals = all.map(r => n(r[f] as string | number | null)).filter(v => v > 0);
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
  const effectiveCompany: CompanySummaryLike | null = isAllMonths ? fyCompanyTotals : companySummary;

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
          month: MONTH_SHORT_LABELS[rec.month],
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
      month: MONTH_SHORT_LABELS[month],
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

  // ── loading / error states ─────────────────────────────────────────────

  if (dashboardLoading) {
    return (
      <div className="container py-6 md:py-8">
        <LoadingState label="Loading production dashboard…" />
      </div>
    );
  }

  if (dashboardError) {
    return (
      <div className="container py-6 md:py-8">
        <ErrorState
          title="Failed to load production dashboard data."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  // ── period label ──────────────────────────────────────────────────────────

  const periodLabel = isAllMonths
    ? formatFyLabel(selectedFyYear)
    : `${MONTH_SHORT_LABELS[selectedMonth] ?? ''} ${calYear}`;

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

  const cTargetPowerCosts   = n(effectiveCompany?.target_power_costs);
  const cTargetRM           = n(effectiveCompany?.target_repair_maintenance_costs);
  const cTargetAbstraction  = n(effectiveCompany?.target_abstraction_fee);
  const cTargetChemical     = n(effectiveCompany?.target_chemical_costs);
  const cTargetTotalCosts   = n(effectiveCompany?.target_total_direct_costs);
  const cPowerCosts  = n(effectiveCompany?.power_costs);
  const cRM          = n(effectiveCompany?.repair_maintenance_costs);
  const cAbstraction = n(effectiveCompany?.abstraction_fee);
  const cChemical    = n(effectiveCompany?.chemical_costs);
  const cTotalCosts  = n(effectiveCompany?.total_direct_costs);
  const cCostPerM3   = totalSupply > 0 && cTotalCosts > 0 ? cTotalCosts / totalSupply : 0;
  const cTargetCostPerM3 = tSupply > 0 && cTargetTotalCosts > 0 ? cTargetTotalCosts / tSupply : 0;

  return (
    <div className="min-h-screen bg-gradient-surface">
      <div className="container py-6 md:py-8">
        <PageToolbar periodLabel={periodLabel} onRefresh={() => refetch()} className="mb-6">
          <SiteFilter sites={sites} selectedSite={selectedSite} onSiteChange={setSelectedSite} />
          <PeriodFilter
            selectedMonth={selectedMonth.toString()}
            selectedYear={selectedFyYear.toString()}
            onMonthChange={(m) => setSelectedMonth(parseInt(m))}
            onYearChange={(y) => setSelectedFyYear(parseInt(y))}
          />
        </PageToolbar>

        <Tabs defaultValue="overview" className="space-y-6">
          <div className="rounded-2xl border border-border/50 bg-card/70 p-2 shadow-soft">
            <TabsList className="h-auto flex-wrap gap-1 p-1">
              <TabsTrigger value="overview" className="flex items-center gap-1.5"><Droplets className="w-3.5 h-3.5" /> Overview</TabsTrigger>
              <TabsTrigger value="power" className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Power & Energy</TabsTrigger>
              <TabsTrigger value="costs" className="flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Costs</TabsTrigger>
              <TabsTrigger value="quality" className="flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5" /> Water Quality</TabsTrigger>
              <TabsTrigger value="regional" className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Regional</TabsTrigger>
              <TabsTrigger value="sites" className="flex items-center gap-1.5"><ArrowUpDown className="w-3.5 h-3.5" /> Sites</TabsTrigger>
            </TabsList>
          </div>

          <div className="space-y-6">

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
                  <KpiCard label="Water Abstracted" value={totalWater} unit="m³" target={tWater} percentRealized={pctRealized(totalWater, tWater)} trend={totalWater >= tWater * 0.9 ? 'up' : 'down'} status={pctStatus(pctRealized(totalWater, tWater))} delay={0} />
                  <KpiCard label="Water Supplied"   value={totalSupply} unit="m³" target={tSupply} percentRealized={pctRealized(totalSupply, tSupply)} trend={totalSupply >= tSupply * 0.9 ? 'up' : 'down'} status={pctStatus(pctRealized(totalSupply, tSupply))} delay={100} />
                  <KpiCard label="Production Loss"  value={totalLoss}  unit="m³" target={tLoss} percentRealized={pctRealized(totalLoss, tLoss)} trend={totalLoss <= tLoss ? 'down' : 'up'} status={totalLoss <= tLoss * 1.1 ? 'good' : totalLoss <= tLoss * 1.3 ? 'warning' : 'critical'} delay={200} invertTrend />
                  <KpiCard label="Loss %"           value={lossPct}    unit="%" target={tLossPct} percentRealized={tLossPct > 0 ? (tLossPct / lossPct) * 100 : 0} trend={lossPct <= tLossPct ? 'down' : 'up'} status={lossPct <= tLossPct * 1.1 ? 'good' : lossPct <= tLossPct * 1.3 ? 'warning' : 'critical'} delay={300} invertTrend />
                </div>
              </section>

              {/* Trend charts */}
              <section>
                <h2 className="section-title mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> {isAllMonths
                    ? `${formatFyLabel(selectedFyYear)} Trends (Jul → Jun)`
                    : `YTD Trends (Rolling 12 Months to ${MONTH_SHORT_LABELS[selectedMonth]} ${calYear})`}
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
                <KpiComparisonTable unit="m³ / kWh / %">
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
                </KpiComparisonTable>
              </section>
            </TabsContent>

            {/* ════════════════════ POWER & ENERGY TAB ══════════════════ */}
            <TabsContent value="power" className="space-y-6">
              <section>
                <h2 className="section-title mb-4 flex items-center gap-2"><Zap className="w-4 h-4" /> Power & Energy KPIs</h2>
                <div className="data-grid">
                  <KpiCard label="Grid Power"    value={gridPower}  unit="kWh" target={tGrid}      percentRealized={pctRealized(gridPower, tGrid)}   status={pctStatus(pctRealized(gridPower, tGrid))}   delay={0}   />
                  <KpiCard label="Solar Power"   value={solarPower} unit="kWh" target={tSolar}     percentRealized={pctRealized(solarPower, tSolar)}  status={pctStatus(pctRealized(solarPower, tSolar))} delay={100} variant="solar" />
                  <KpiCard label="Total Power"   value={totalPower} unit="kWh" target={tPower}     percentRealized={pctRealized(totalPower, tPower)}  status={pctStatus(pctRealized(totalPower, tPower))} delay={200} />
                  <KpiCard label="Solar %"       value={solarPct}   unit="%"   target={tSolarPct}  percentRealized={tSolarPct > 0 ? (solarPct / tSolarPct) * 100 : 0} status={solarPct >= tSolarPct * 0.9 ? 'good' : 'warning'} delay={300} variant="solar" />
                  <KpiCard label="Power Efficiency" value={efficiency} unit="kWh/m³" target={tEfficiency} percentRealized={tEfficiency > 0 ? (tEfficiency / efficiency) * 100 : 0} status={efficiency <= tEfficiency * 1.1 ? 'good' : 'warning'} delay={400} />
                </div>
              </section>

              {trendData.length > 0 && (
                <section>
                  <h2 className="section-title mb-4">
                    Energy Trends — {isAllMonths
                      ? formatFyLabel(selectedFyYear)
                      : `YTD (Rolling 12 Months to ${MONTH_SHORT_LABELS[selectedMonth]} ${calYear})`}
                  </h2>
                  <EnergyChart data={trendData} />
                </section>
              )}

              <PowerBreakdownTable rows={tableRows} periodLabel={periodLabel} />
            </TabsContent>

            {/* ════════════════════ COSTS TAB ═══════════════════════════ */}
            <TabsContent value="costs" className="space-y-6">
              <section>
                <h2 className="section-title mb-4 flex items-center gap-2"><DollarSign className="w-4 h-4" /> Cost KPIs — {isAllMonths ? `Full ${formatFyLabel(selectedFyYear)}` : periodLabel}</h2>
                {effectiveCompany ? (
                  <>
                    <div className="data-grid mb-6">
                      <KpiCard label="Total Direct Costs" value={cTotalCosts}  unit="KES" target={cTargetTotalCosts}  percentRealized={pctRealized(cTotalCosts, cTargetTotalCosts)}   status={cTotalCosts <= cTargetTotalCosts * 1.05 ? 'good' : 'warning'} delay={0} />
                      <KpiCard label="Power Costs"        value={cPowerCosts}  unit="KES" target={cTargetPowerCosts}   percentRealized={pctRealized(cPowerCosts, cTargetPowerCosts)}    status={cPowerCosts <= cTargetPowerCosts * 1.05 ? 'good' : 'warning'} delay={100} />
                      <KpiCard label="R&M Costs"          value={cRM}          unit="KES" target={cTargetRM}           percentRealized={pctRealized(cRM, cTargetRM)}                    status={cRM <= cTargetRM * 1.05 ? 'good' : 'warning'} delay={200} />
                      <KpiCard label="Cost per m³"        value={cCostPerM3}   unit="KES/m³" target={cTargetCostPerM3} percentRealized={cTargetCostPerM3 > 0 ? (cTargetCostPerM3 / cCostPerM3) * 100 : 0} status={cCostPerM3 <= cTargetCostPerM3 * 1.1 ? 'good' : 'warning'} delay={300} />
                    </div>
                    <KpiComparisonTable unit="KES">
                      <KPIRow label="Power Costs"        actual={cPowerCosts}  target={cTargetPowerCosts}  unit="KES" inverse />
                      <KPIRow label="R&M Costs"          actual={cRM}          target={cTargetRM}          unit="KES" inverse />
                      <KPIRow label="Abstraction Fee"    actual={cAbstraction} target={cTargetAbstraction} unit="KES" inverse />
                      <KPIRow label="Chemical Costs"     actual={cChemical}    target={cTargetChemical}    unit="KES" inverse />
                      <KPIRow label="Total Direct Costs" actual={cTotalCosts}  target={cTargetTotalCosts}  unit="KES" inverse />
                      <KPIRow label="Cost per m³"        actual={cCostPerM3}   target={cTargetCostPerM3}   unit="KES/m³" inverse />
                    </KpiComparisonTable>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">Company-level cost data not available for this period.</p>
                )}
              </section>
            </TabsContent>

            {/* ════════════════════ WATER QUALITY TAB ══════════════════ */}
            <TabsContent value="quality" className="space-y-6">
              <WaterQualitySection company={effectiveCompany} />
            </TabsContent>

            {/* ════════════════════ REGIONAL TAB ════════════════════════ */}
            <TabsContent value="regional" className="space-y-6">
              <RegionalSection company={effectiveCompany} tableRows={tableRows} periodLabel={periodLabel} />
            </TabsContent>

            {/* ════════════════════ SITES TAB ═══════════════════════════ */}
            <TabsContent value="sites" className="space-y-6">
              <AllSitesTable
                rows={tableRows}
                periodLabel={periodLabel}
                loading={tableLoading || (isAllMonths && fySiteTotals.isLoading)}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
