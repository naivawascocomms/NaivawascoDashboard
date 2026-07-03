import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, Target, Zap, Droplets, Clock, Sun } from 'lucide-react';
import { ProductionKPI } from '@/types/production';

interface ProductionKPICardProps extends ProductionKPI {
  className?: string;
  delay?: number;
  variant?: 'default' | 'energy' | 'solar';
}

const iconMap: Record<string, React.ElementType> = {
  production: Droplets,
  energy: Zap,
  solar: Sun,
  hours: Clock,
};

export function ProductionKPICard({
  label,
  value,
  unit,
  target,
  percentRealized,
  trend,
  status = 'good',
  className,
  delay = 0,
  variant = 'default',
}: ProductionKPICardProps) {
  const statusColors = {
    good: 'stat-card-success',
    warning: 'stat-card-warning',
    critical: 'stat-card-destructive',
  };

  const variantStyles = {
    default: 'stat-card-primary',
    energy: 'stat-card-accent',
    solar: 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30',
  };

  const TrendIcon = {
    up: TrendingUp,
    down: TrendingDown,
    stable: Minus,
  }[trend || 'stable'];

  const trendColors = {
    up: label.includes('Cost') ? 'text-destructive' : 'text-success',
    down: label.includes('Cost') || label.includes('Efficiency') ? 'text-success' : 'text-destructive',
    stable: 'text-muted-foreground',
  };

  const formatValue = (val: number) => {
    if (unit === '%') return val.toFixed(1);
    if (unit === 'm³/kWh' || unit === 'kWh/m³' || unit === 'KES/m³') return val.toFixed(2);
    if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const formatPercentRealized = (val: number) => val.toFixed(1);

  return (
    <div
      className={cn(
        'stat-card animate-slide-up',
        variant === 'solar' ? variantStyles.solar : statusColors[status],
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        {trend && (
          <TrendIcon className={cn('w-4 h-4', trendColors[trend])} />
        )}
      </div>
      
      <div className="flex items-baseline gap-1 mb-3">
        <span className="text-3xl font-bold mono-value text-foreground">
          {formatValue(value)}
        </span>
        <span className="text-sm font-medium text-muted-foreground">{unit}</span>
      </div>
      
      {target !== undefined && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Target className="w-3 h-3" />
              <span>Target: {formatValue(target)} {unit}</span>
            </div>
            {percentRealized !== undefined && (
              <span className={cn(
                'font-semibold',
                percentRealized >= 90 ? 'text-success' :
                percentRealized >= 70 ? 'text-warning' : 'text-destructive'
              )}>
                {formatPercentRealized(percentRealized)}%
              </span>
            )}
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                percentRealized && percentRealized >= 90 ? 'bg-success' :
                percentRealized && percentRealized >= 70 ? 'bg-warning' : 'bg-destructive'
              )}
              style={{ width: `${Math.min(percentRealized || 0, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
