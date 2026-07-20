import { useMemo, useState } from 'react';
import { KpiCard } from '@/components/kpi/KpiCard';
import { PageToolbar } from '@/components/layout/PageToolbar';
import { NRWTrendChart } from '@/components/distribution/NRWTrendChart';
import { RegionalPerformanceCard } from '@/components/distribution/RegionalPerformanceCard';
import { ZonalTable } from '@/components/distribution/ZonalTable';
import { PeriodFilter } from '@/components/filters/PeriodFilter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useCustomerBillingData,
  useDistributionFyTrend,
  useGlobalNRW,
  useMonthlyDistribution,
  useZones,
} from '@/hooks/useDistribution';
import { Droplets } from 'lucide-react';
import { LoadingState } from '@/components/layout/QueryState';
import { toNumber as n } from '@/lib/format';
import { MONTH_SHORT_LABELS, calYearForFyMonth, fyYearForDate } from '@/lib/fiscalYear';
import type { MonthlyDistributionTrend, RegionalMetrics, ZonalMetrics } from '@/types/distribution';

const DEFAULT_FY_YEAR = fyYearForDate();
const DEFAULT_MONTH = new Date().getMonth() + 1;

function getKpiStatus(nrwPercent: number): 'good' | 'warning' | 'critical' {
  if (nrwPercent <= 20) return 'good';
  if (nrwPercent <= 30) return 'warning';
  return 'critical';
}

function titleCaseRegion(region: string | null | undefined): string {
  const value = (region || '').trim();
  if (!value) return 'Unknown';
  return value
    .toLowerCase()
    .split(/[\s_]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTrendMonthLabel(month: string, period?: string) {
  if (!period) return month;
  const [year, monthValue] = period.split('-');
  if (!year || !monthValue) return month;
  const shortYear = year.slice(-2);
  return `${month}-${shortYear}`;
}

function filterByZone<T extends { zone?: number; zones?: string[]; region?: string }>(
  items: T[],
  selectedZoneId: number | undefined,
  zoneNames: Set<string>
) {
  if (!selectedZoneId) return items;
  return items.filter((item) => {
    if (typeof item.zone === 'number') {
      return item.zone === selectedZoneId;
    }
    if (Array.isArray(item.zones)) {
      return item.zones.some((zoneName) => zoneNames.has(zoneName));
    }
    if (typeof item.region === 'string') {
      return zoneNames.size > 0;
    }
    return true;
  });
}

export default function DistributionDashboard() {
  const [selectedMonth, setSelectedMonth] = useState(DEFAULT_MONTH);
  const [selectedFyYear, setSelectedFyYear] = useState(DEFAULT_FY_YEAR);
  const [selectedZone, setSelectedZone] = useState<string>('all');

  const calendarYear = calYearForFyMonth(selectedFyYear, selectedMonth);
  const selectedZoneId = selectedZone === 'all' ? undefined : parseInt(selectedZone, 10);

  const { data: zonesData } = useZones({ is_active: true });
  const zoneMetaMap = useMemo(
    () => new Map((zonesData?.results ?? []).map((zone) => [zone.id, zone])),
    [zonesData]
  );

  const {
    data: commercialMonthlyData,
    isLoading: commercialMonthlyLoading,
    refetch: refetchCommercialMonthly,
  } = useMonthlyDistribution({ year: calendarYear, month: selectedMonth, zone: selectedZoneId });
  const {
    data: globalNRWData,
    isLoading: globalNRWLoading,
    refetch: refetchGlobal,
  } = useGlobalNRW({ year: calendarYear, month: selectedMonth });
  const {
    data: customerBillingCurrentMonthData,
    refetch: refetchBilling,
  } = useCustomerBillingData({ year: calendarYear, month: selectedMonth, zone: selectedZoneId });
  const { data: distributionTrendData } = useDistributionFyTrend({
    mode: 'rolling_12',
    anchor_year: calendarYear,
    anchor_month: selectedMonth,
  });

  const handleRefresh = async () => {
    await Promise.all([
      refetchCommercialMonthly(),
      refetchBilling(),
      refetchGlobal(),
    ]);
  };

  const commercialZonalData = useMemo((): ZonalMetrics[] => {
    if (!commercialMonthlyData?.results) return [];

    const customerBillingMap = new Map(
      (customerBillingCurrentMonthData?.results ?? []).map((row) => [row.zone, row])
    );

    return commercialMonthlyData.results.map((zone) => ({
      id: zone.id.toString(),
      name: zone.zone_name,
      region: titleCaseRegion(zone.region_name),
      waterSupplied: n(zone.volume_supplied_m3),
      waterSold: n(zone.volume_billed_m3),
      nrwVolume: n(zone.nrw_m3),
      nrwPercentage: n(zone.nrw_percentage),
      target: n(zone.nrw_target_percentage) || 22,
      connections:
        customerBillingMap.get(zone.zone)?.number_of_active_connections ??
        zoneMetaMap.get(zone.zone)?.number_of_connections ??
        0,
      waterRevenue: n(customerBillingMap.get(zone.zone)?.water_revenue),
      sewerRevenue: n(customerBillingMap.get(zone.zone)?.sewer_revenue),
      activeLeaks: 0,
      metersCaptured: 0,
      illegalConnections: 0,
      avgDailyConsumption: 0,
      monthlyTarget: n(zone.volume_supplied_target_m3),
      cumulativePerformance: n(zone.nrw_realization_percent),
    }));
  }, [commercialMonthlyData, customerBillingCurrentMonthData, zoneMetaMap]);

  const commercialKPIs = useMemo(() => {
    const rows = commercialMonthlyData?.results ?? [];
    if (!rows.length) return [];

    const supplied = rows.reduce((sum, row) => sum + n(row.volume_supplied_m3), 0);
    const billed = rows.reduce((sum, row) => sum + n(row.volume_billed_m3), 0);
    const nrw = rows.reduce((sum, row) => sum + n(row.nrw_m3), 0);
    const nrwPercent = supplied > 0 ? (nrw / supplied) * 100 : 0;
    const globalTarget = n(globalNRWData?.results?.[0]?.global_nrw_target_percentage) || 22;
    const nrwVolumeTarget = supplied > 0 ? supplied * (globalTarget / 100) : 0;
    const status = getKpiStatus(nrwPercent);

    return [
      {
        label: 'Water Supplied',
        value: supplied,
        unit: 'm3',
        status: 'good' as const,
      },
      {
        label: 'Water Billed',
        value: billed,
        unit: 'm3',
        target: supplied,
        percentRealized: supplied > 0 ? Math.round((billed / supplied) * 100) : 0,
        status: 'good' as const,
      },
      {
        label: 'NRW Volume',
        value: nrw,
        unit: 'm3',
        target: nrwVolumeTarget,
        percentRealized: nrwVolumeTarget > 0 ? Math.round((nrwVolumeTarget / Math.max(nrw, 1)) * 100) : 0,
        status,
      },
      {
        label: 'NRW %',
        value: nrwPercent,
        unit: '%',
        target: globalTarget,
        percentRealized: nrwPercent > 0 ? Math.round((globalTarget / nrwPercent) * 100) : 0,
        status,
      },
    ];
  }, [commercialMonthlyData, globalNRWData]);

  const trendData = useMemo((): MonthlyDistributionTrend[] => {
    return (distributionTrendData ?? []).map((point) => ({
      month: formatTrendMonthLabel(point.month, point.period),
      waterSupplied: n(point.waterSupplied),
      waterBilled: n(point.waterBilled),
      nrwPercentage: n(point.nrwPercentage),
      transmissionLoss: n(point.transmissionLoss),
      target: n(point.target),
    }));
  }, [distributionTrendData]);

  const selectedZoneNames = useMemo(() => {
    if (!selectedZoneId) return new Set<string>();
    const zoneName = zoneMetaMap.get(selectedZoneId)?.name;
    return new Set(zoneName ? [zoneName] : []);
  }, [selectedZoneId, zoneMetaMap]);

  const commercialRegionalCards = useMemo((): RegionalMetrics[] => {
    if (!commercialZonalData.length) return [];

    const grouped = new Map<string, ZonalMetrics[]>();
    commercialZonalData.forEach((zone) => {
      const regionName = titleCaseRegion(zone.region);
      grouped.set(regionName, [...(grouped.get(regionName) ?? []), zone]);
    });

    const cards = Array.from(grouped.entries()).map(([regionName, regionZones]) => {
      const supplied = regionZones.reduce((sum, zone) => sum + zone.waterSupplied, 0);
      const billed = regionZones.reduce((sum, zone) => sum + zone.waterSold, 0);
      const nrw = regionZones.reduce((sum, zone) => sum + zone.nrwVolume, 0);
      const weightedTargetBase = regionZones.reduce((sum, zone) => sum + zone.waterSupplied, 0);
      const averageTarget = regionZones.length > 0
        ? regionZones.reduce((sum, zone) => sum + zone.target, 0) / regionZones.length
        : 22;
      const target = weightedTargetBase > 0
        ? regionZones.reduce((sum, zone) => sum + (zone.target * zone.waterSupplied), 0) / weightedTargetBase
        : averageTarget;

      return {
        region: regionName,
        zones: regionZones.map((zone) => zone.name).sort((a, b) => a.localeCompare(b)),
        waterSupplied: supplied,
        waterSold: billed,
        nrwVolume: nrw,
        nrwPercentage: supplied > 0 ? (nrw / supplied) * 100 : 0,
        target,
        connections: regionZones.reduce((sum, zone) => sum + (zone.connections ?? 0), 0),
        sewerConnections: 0,
        waterRevenue: regionZones.reduce((sum, zone) => sum + (zone.waterRevenue ?? 0), 0),
        sewerRevenue: regionZones.reduce((sum, zone) => sum + (zone.sewerRevenue ?? 0), 0),
        leaksBursts: 0,
        monthlyTarget: 0,
        cumulativeTarget: 0,
        cumulativeActual: 0,
      };
    });

    return filterByZone(cards, selectedZoneId, selectedZoneNames);
  }, [commercialZonalData, selectedZoneId, selectedZoneNames]);

  if (commercialMonthlyLoading || globalNRWLoading) {
    return (
      <div className="container py-6 md:py-8">
        <LoadingState label="Loading distribution dashboard…" />
      </div>
    );
  }

  const globalSummary = globalNRWData?.results?.[0];
  const currentPeriodLabel = `${MONTH_SHORT_LABELS[selectedMonth] || 'Unknown'} ${calendarYear}`;

  return (
    <div className="min-h-screen bg-gradient-surface">
      <div className="container space-y-6 py-6 md:py-8">
        <PageToolbar periodLabel={currentPeriodLabel} onRefresh={handleRefresh}>
          <PeriodFilter
            selectedMonth={selectedMonth.toString()}
            selectedYear={selectedFyYear.toString()}
            onMonthChange={(month) => setSelectedMonth(parseInt(month))}
            onYearChange={(year) => setSelectedFyYear(parseInt(year))}
            allowAllMonths={false}
          />
          <ZoneFilter
            selectedZone={selectedZone}
            onZoneChange={setSelectedZone}
            zones={zonesData?.results ?? []}
          />
        </PageToolbar>

        {globalSummary && (
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 animate-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Droplets className="h-6 w-6 text-accent" />
                <div>
                  <p className="text-sm text-muted-foreground">Global Commercial NRW</p>
                  <p className="text-2xl font-bold mono-value">
                    {n(globalSummary.global_nrw_percentage).toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Target {(n(globalSummary.global_nrw_target_percentage) || 22).toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Available:</span>{' '}
                  <span className="font-semibold mono-value">
                    {(n(globalSummary.water_available_for_sale_m3) / 1000000).toFixed(2)} M m3
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Billed:</span>{' '}
                  <span className="font-semibold mono-value">
                    {(n(globalSummary.volume_billed_to_customers_m3) / 1000000).toFixed(2)} M m3
                  </span>
                </div>
                {n(globalSummary.transmission_loss_percentage) > 0 && (
                  <div>
                    <span className="text-muted-foreground">Transmission Loss:</span>{' '}
                    <span className="font-semibold text-warning mono-value">
                      {n(globalSummary.transmission_loss_percentage).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <section>
          <h2 className="section-title mb-4">Commercial Distribution Performance</h2>
          <div className="data-grid">
            {commercialKPIs.map((kpi, idx) => (
              <KpiCard key={kpi.label} {...kpi} delay={idx * 100} />
            ))}
          </div>
        </section>

        {trendData.length > 1 && (
          <section>
            <h2 className="section-title mb-4">Commercial NRW Trend</h2>
            <NRWTrendChart data={trendData} />
          </section>
        )}

        {commercialRegionalCards.length > 0 && (
          <section>
            <h2 className="section-title mb-4">Regional Commercial Snapshot</h2>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {commercialRegionalCards.map((region, idx) => (
                <RegionalPerformanceCard
                  key={region.region}
                  region={region}
                  variant="commercial"
                  delay={idx * 100}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="section-title mb-4">Commercial Zonal Performance</h2>
          {commercialZonalData.length > 0 ? (
            <ZonalTable zones={commercialZonalData} selectedRegion="all" variant="commercial" />
          ) : (
            <div className="chart-container animate-slide-up p-6 text-sm text-muted-foreground">
              No commercial distribution data is available for the selected period.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ZoneFilter({
  selectedZone,
  onZoneChange,
  zones,
}: {
  selectedZone: string;
  onZoneChange: (value: string) => void;
  zones: Array<{ id: number; name: string }>;
}) {
  return (
    <Select value={selectedZone} onValueChange={onZoneChange}>
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Zone" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Zones</SelectItem>
        {zones.map((zone) => (
          <SelectItem key={zone.id} value={zone.id.toString()}>
            {zone.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
