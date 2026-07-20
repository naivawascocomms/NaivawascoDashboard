import { Minus, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatKpiValue } from '@/lib/format';

export type KpiStatus = 'good' | 'warning' | 'critical';
export type KpiTrend = 'up' | 'down' | 'stable';

export interface KpiCardProps {
  label: string;
  value: number;
  unit: string;
  target?: number;
  /** 0–100; drives the target progress bar and its color. */
  percentRealized?: number;
  trend?: KpiTrend;
  /** For KPIs where lower is better (losses, costs): shows a downward trend as positive. */
  invertTrend?: boolean;
  status?: KpiStatus;
  /** "solar" renders the amber solar-energy styling instead of status coloring. */
  variant?: 'default' | 'solar';
  delay?: number;
  className?: string;
}

const statusClasses: Record<KpiStatus, string> = {
  good: 'stat-card-success',
  warning: 'stat-card-warning',
  critical: 'stat-card-destructive',
};

const trendIcons: Record<KpiTrend, typeof TrendingUp> = {
  up: TrendingUp,
  down: TrendingDown,
  stable: Minus,
};

const statusText: Record<KpiStatus, string> = {
  good: 'on track',
  warning: 'needs attention',
  critical: 'critical',
};

export function KpiCard({
  label,
  value,
  unit,
  target,
  percentRealized,
  trend,
  invertTrend = false,
  status = 'good',
  variant = 'default',
  delay = 0,
  className,
}: KpiCardProps) {
  const TrendIcon = trendIcons[trend ?? 'stable'];
  const trendColors: Record<KpiTrend, string> = {
    up: invertTrend ? 'text-destructive' : 'text-success',
    down: invertTrend ? 'text-success' : 'text-destructive',
    stable: 'text-muted-foreground',
  };

  const realizationTextClass = (pct: number) =>
    pct >= 90 ? 'text-success' : pct >= 70 ? 'text-warning' : 'text-destructive';
  const realizationBarClass = (pct: number) =>
    pct >= 90 ? 'bg-success' : pct >= 70 ? 'bg-warning' : 'bg-destructive';

  return (
    <div
      className={cn(
        'stat-card animate-slide-up',
        variant === 'solar'
          ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30'
          : statusClasses[status],
        className,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
          {/* Status is otherwise conveyed by color alone — announce it for screen readers. */}
          <span className="sr-only"> ({statusText[status]})</span>
        </span>
        {trend && <TrendIcon aria-hidden className={cn('w-4 h-4', trendColors[trend])} />}
      </div>

      <div className="flex items-baseline gap-1 mb-3">
        <span className="text-3xl font-bold mono-value text-foreground">
          {formatKpiValue(value, unit)}
        </span>
        <span className="text-sm font-medium text-muted-foreground">{unit}</span>
      </div>

      {target !== undefined && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Target className="w-3 h-3" />
              <span>Target: {formatKpiValue(target, unit)} {unit}</span>
            </div>
            {percentRealized !== undefined && (
              <span className={cn('font-semibold', realizationTextClass(percentRealized))}>
                {percentRealized.toFixed(1)}%
              </span>
            )}
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                realizationBarClass(percentRealized ?? 0),
              )}
              style={{ width: `${Math.min(percentRealized ?? 0, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
