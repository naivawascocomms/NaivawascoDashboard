import { cn } from '@/lib/utils';
import { RegionPerformance } from '@/types/dashboard';
import { Droplets, TrendingUp, AlertTriangle } from 'lucide-react';

interface RegionCardProps {
  region: RegionPerformance;
  delay?: number;
}

export function RegionCard({ region, delay = 0 }: RegionCardProps) {
  const nrwStatus = region.nrwPercentage <= region.target ? 'good' : 'warning';
  
  const formatVolume = (val: number) => {
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toLocaleString();
  };

  return (
    <div
      className="stat-card stat-card-primary animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg text-foreground">{region.name} Region</h3>
        <div className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
          nrwStatus === 'good' 
            ? 'bg-success/10 text-success' 
            : 'bg-warning/10 text-warning'
        )}>
          {nrwStatus === 'good' ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <AlertTriangle className="w-3 h-3" />
          )}
          <span>{region.nrwPercentage}% NRW</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <span className="text-xs text-muted-foreground">Water Supplied</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold mono-value">{formatVolume(region.waterSupplied)}</span>
            <span className="text-xs text-muted-foreground">m³</span>
          </div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Water Sold</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold mono-value">{formatVolume(region.waterSold)}</span>
            <span className="text-xs text-muted-foreground">m³</span>
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-border/50">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-muted-foreground">NRW vs Target ({region.target}%)</span>
          <span className={cn(
            'font-semibold',
            nrwStatus === 'good' ? 'text-success' : 'text-warning'
          )}>
            {formatVolume(region.nrwVolume)} m³
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              nrwStatus === 'good' ? 'bg-success' : 'bg-warning'
            )}
            style={{ width: `${Math.min((region.nrwPercentage / 50) * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
