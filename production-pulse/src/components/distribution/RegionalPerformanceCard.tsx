import { cn } from '@/lib/utils';
import { Droplets, MapPin, Target } from 'lucide-react';
import { RegionalMetrics } from '@/types/distribution';

interface RegionalPerformanceCardProps {
  region: RegionalMetrics;
  delay?: number;
  variant?: 'commercial' | 'operations';
}

function formatVolume(vol: number) {
  if (vol >= 1000000) return `${(vol / 1000000).toFixed(2)}M`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
  return vol.toLocaleString();
}

export function RegionalPerformanceCard({
  region,
  delay = 0,
  variant = 'commercial',
}: RegionalPerformanceCardProps) {
  const onTarget = variant === 'commercial'
    ? region.nrwPercentage <= region.target
    : (region.cumulativeActual ?? 0) >= 95;

  return (
    <div
      className={cn(
        'stat-card animate-slide-up',
        onTarget ? 'border-l-4 border-l-success' : 'border-l-4 border-l-warning'
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          <MapPin className="h-4 w-4 text-primary" />
          {region.region}
        </h3>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            onTarget ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
          )}
        >
          {variant === 'commercial' ? `${region.nrwPercentage.toFixed(1)}%` : `${(region.cumulativeActual ?? 0).toFixed(0)}%`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Droplets className="h-3 w-3" />
            Supplied
          </div>
          <p className="text-lg font-bold mono-value">{formatVolume(region.waterSupplied)}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Droplets className="h-3 w-3" />
            {variant === 'commercial' ? 'Billed' : 'Daily Avg'}
          </div>
          <p className="text-lg font-bold mono-value">
            {formatVolume(variant === 'commercial' ? region.waterSold : region.monthlyTarget)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Target className="h-3 w-3" />
          <span>
            {variant === 'commercial'
              ? `Target ${region.target.toFixed(1)}%`
              : `Target ${formatVolume(region.cumulativeTarget)} m3`}
          </span>
        </div>
        <span className={cn('font-semibold', onTarget ? 'text-success' : 'text-warning')}>
          {variant === 'commercial'
            ? (onTarget ? 'On target' : `${(region.nrwPercentage - region.target).toFixed(1)} pts high`)
            : (onTarget ? 'Flow on target' : 'Supply below target')}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
        <div>
          {variant === 'commercial' ? 'Water Rev:' : 'Connections:'}{' '}
          <span className="font-semibold text-foreground">
            {variant === 'commercial' ? `KES ${formatVolume(region.waterRevenue ?? 0)}` : (region.connections ?? 0).toLocaleString()}
          </span>
        </div>
        <div>
          {variant === 'commercial' ? 'Sewer Rev:' : 'Zones:'}{' '}
          <span className="font-semibold text-foreground">
            {variant === 'commercial' ? `KES ${formatVolume(region.sewerRevenue ?? 0)}` : region.zones.length}
          </span>
        </div>
      </div>
    </div>
  );
}
