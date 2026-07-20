import { useEffect, useMemo, useState } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useDailyAnalysis } from '@/hooks/useDistribution';
import { KpiCard } from '@/components/kpi/KpiCard';
import { PageToolbar } from '@/components/layout/PageToolbar';
import { RegionalBreakdown } from '@/components/daily/RegionalBreakdown';
import { ProductionTable } from '@/components/daily/ProductionTable';
import { SupplyTable } from '@/components/daily/SupplyTable';
import { DailyTrendChart } from '@/components/daily/DailyTrendChart';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ErrorState, LoadingState } from '@/components/layout/QueryState';
import { cn } from '@/lib/utils';

function toApiDate(value: Date) {
  return format(value, 'yyyy-MM-dd');
}

function clampDate(value: Date, minDate: Date, maxDate: Date) {
  if (value.getTime() < minDate.getTime()) {
    return minDate;
  }
  if (value.getTime() > maxDate.getTime()) {
    return maxDate;
  }
  return value;
}

export default function DailyAnalysis() {
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const params = useMemo(
    () => (
      dateFrom && dateTo
        ? {
            start_date: toApiDate(dateFrom),
            end_date: toApiDate(dateTo),
          }
        : undefined
    ),
    [dateFrom, dateTo],
  );

  const { data, isLoading, isError, refetch } = useDailyAnalysis(params, {
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!data || (dateFrom && dateTo)) {
      return;
    }

    const availableStart = parseISO(data.available_start_date);
    const availableEnd = parseISO(data.available_end_date);
    const yesterday = subDays(new Date(), 1);
    const defaultDate = clampDate(yesterday, availableStart, availableEnd);

    setDateFrom(defaultDate);
    setDateTo(defaultDate);
  }, [data, dateFrom, dateTo]);

  const minDate = data ? parseISO(data.available_start_date) : undefined;
  const maxDate = data ? parseISO(data.available_end_date) : undefined;
  const summary = data?.summary;
  const regions = data?.regions ?? [];
  const trends = data?.trends ?? [];

  const getGapStatus = (percentage: number): 'good' | 'warning' | 'critical' => {
    if (percentage <= 10) return 'good';
    if (percentage <= 20) return 'warning';
    return 'critical';
  };

  return (
    <div className="min-h-screen bg-gradient-surface">
      <div className="container py-6">
        <PageToolbar className="mb-6">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">From:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-[160px] justify-start text-left font-normal',
                      !dateFrom && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, 'dd MMM yyyy') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateFrom}
                    onSelect={(date) => date && setDateFrom(date)}
                    disabled={(date) => {
                      if (!minDate || !maxDate) return true;
                      if (dateTo && date > dateTo) return true;
                      return date < minDate || date > maxDate;
                    }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">To:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-[160px] justify-start text-left font-normal',
                      !dateTo && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, 'dd MMM yyyy') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateTo}
                    onSelect={(date) => date && setDateTo(date)}
                    disabled={(date) => {
                      if (!minDate || !maxDate) return true;
                      if (dateFrom && date < dateFrom) return true;
                      return date < minDate || date > maxDate;
                    }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
        </PageToolbar>

        {isLoading && !data ? (
          <LoadingState label="Loading daily analysis…" className="mb-6" />
        ) : null}

        {isError ? (
          <ErrorState
            title="Daily analysis data could not be loaded."
            onRetry={() => refetch()}
            className="mb-6"
          />
        ) : null}

        {summary ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
              <KpiCard
                label="Total Production"
                value={summary.total_production}
                unit="m3"
                status="good"
              />
              <KpiCard
                label="Total Supply"
                value={summary.total_supply}
                unit="m3"
                status="good"
              />
              <KpiCard
                label="Total Collection"
                value={summary.total_collection}
                unit="KES"
                status="good"
              />
              <KpiCard
                label="Gap"
                value={summary.gap}
                unit="m3"
                status={getGapStatus(Math.abs(summary.gap_percentage))}
              />
              <KpiCard
                label="Gap %"
                value={summary.gap_percentage}
                unit="%"
                status={getGapStatus(Math.abs(summary.gap_percentage))}
              />
              <KpiCard
                label="Regions"
                value={summary.total_regions}
                unit="active"
                status="good"
              />
              <KpiCard
                label="Days"
                value={summary.days}
                unit="selected"
                status="good"
              />
            </div>

            <RegionalBreakdown regions={regions} className="mb-6" />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <DailyTrendChart data={trends} className="lg:col-span-3" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ProductionTable regions={regions} />
              <SupplyTable regions={regions} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
