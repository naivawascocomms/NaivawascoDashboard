import { ZonalMetrics } from '@/types/distribution';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ZonalTableProps {
  zones: ZonalMetrics[];
  selectedRegion: string;
  variant?: 'commercial' | 'operations';
}

function formatVolume(vol?: number) {
  const safeVol = Number.isFinite(vol) ? (vol as number) : 0;
  if (safeVol >= 1000000) return `${(safeVol / 1000000).toFixed(2)}M`;
  if (safeVol >= 1000) return `${(safeVol / 1000).toFixed(1)}K`;
  return safeVol.toLocaleString();
}

function formatKes(value?: number) {
  const safeValue = Number.isFinite(value) ? (value as number) : 0;
  if (safeValue >= 1000000) return `${(safeValue / 1000000).toFixed(2)}M`;
  if (safeValue >= 1000) return `${(safeValue / 1000).toFixed(1)}K`;
  return safeValue.toLocaleString();
}

export function ZonalTable({ zones, selectedRegion, variant = 'commercial' }: ZonalTableProps) {
  const filteredZones =
    selectedRegion === 'all' ? zones : zones.filter((zone) => zone.region === selectedRegion);

  const showCommercialColumns = variant === 'commercial';

  return (
    <div className="chart-container animate-slide-up overflow-hidden" style={{ animationDelay: '300ms' }}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zone</TableHead>
              <TableHead>Region</TableHead>
              <TableHead className="text-right">Supplied (m3)</TableHead>
              {showCommercialColumns ? (
                <>
                  <TableHead className="text-right">Sold (m3)</TableHead>
                  <TableHead className="text-right">NRW %</TableHead>
                  <TableHead className="text-right">Target %</TableHead>
                </>
              ) : (
                <>
                  <TableHead className="text-right">Daily Avg (m3)</TableHead>
                  <TableHead className="text-right">Month Target (m3)</TableHead>
                  <TableHead className="text-right">Realization</TableHead>
                </>
              )}
              <TableHead className="text-right">Connections</TableHead>
              {showCommercialColumns && (
                <>
                  <TableHead className="text-right">Water Rev.</TableHead>
                  <TableHead className="text-right">Sewer Rev.</TableHead>
                </>
              )}
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredZones.map((zone) => {
              const onTarget = showCommercialColumns
                ? zone.nrwPercentage <= zone.target
                : (zone.cumulativePerformance ?? 0) >= 95;
              const dailyAverage = zone.avgDailyConsumption ?? 0;

              return (
                <TableRow key={zone.id}>
                  <TableCell className="font-medium">{zone.name}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs',
                        zone.region === 'Central'
                          ? 'bg-primary/10 text-primary'
                          : zone.region === 'Southern'
                            ? 'bg-warning/10 text-warning'
                            : 'bg-accent/10 text-accent'
                      )}
                    >
                      {zone.region}
                    </span>
                  </TableCell>
                  <TableCell className="text-right mono-value">{formatVolume(zone.waterSupplied)}</TableCell>
                  {showCommercialColumns ? (
                    <>
                      <TableCell className="text-right mono-value">{formatVolume(zone.waterSold)}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            'font-semibold mono-value',
                            zone.nrwPercentage <= zone.target
                              ? 'text-success'
                              : zone.nrwPercentage <= zone.target * 1.2
                                ? 'text-warning'
                                : 'text-destructive'
                          )}
                        >
                          {zone.nrwPercentage.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right mono-value text-muted-foreground">
                        {zone.target.toFixed(1)}%
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="text-right mono-value">{formatVolume(dailyAverage)}</TableCell>
                      <TableCell className="text-right mono-value text-muted-foreground">
                        {formatVolume(zone.monthlyTarget)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn('font-semibold mono-value', onTarget ? 'text-success' : 'text-warning')}>
                          {(zone.cumulativePerformance ?? 0).toFixed(0)}%
                        </span>
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-right mono-value">
                    {(zone.connections ?? 0).toLocaleString()}
                  </TableCell>
                  {showCommercialColumns && (
                    <>
                      <TableCell className="text-right mono-value">
                        {`KES ${formatKes(zone.waterRevenue)}`}
                      </TableCell>
                      <TableCell className="text-right mono-value">
                        {`KES ${formatKes(zone.sewerRevenue)}`}
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-center">
                    {onTarget ? (
                      <CheckCircle className="inline h-4 w-4 text-success" />
                    ) : (
                      <AlertCircle className="inline h-4 w-4 text-destructive" />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
