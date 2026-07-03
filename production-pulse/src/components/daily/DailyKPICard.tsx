import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DailyKPICardProps {
  label: string;
  value: number;
  unit: string;
  previousValue?: number;
  status?: 'good' | 'warning' | 'critical';
  className?: string;
}

export function DailyKPICard({
  label,
  value,
  unit,
  previousValue,
  status = 'good',
  className,
}: DailyKPICardProps) {
  const change = previousValue ? ((value - previousValue) / previousValue) * 100 : 0;
  const trend = change > 1 ? 'up' : change < -1 ? 'down' : 'stable';

  const formatValue = (val: number) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toLocaleString();
  };

  const statusColors = {
    good: 'text-emerald-500',
    warning: 'text-warning',
    critical: 'text-destructive',
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {label}
            </p>
            <div className="flex items-baseline gap-1">
              <span className={cn('text-2xl font-bold', statusColors[status])}>
                {formatValue(value)}
              </span>
              <span className="text-sm text-muted-foreground">{unit}</span>
            </div>
          </div>
          {previousValue !== undefined && (
            <div
              className={cn(
                'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full',
                trend === 'up'
                  ? 'bg-emerald-500/10 text-emerald-500'
                  : trend === 'down'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {trend === 'up' ? (
                <TrendingUp className="w-3 h-3" />
              ) : trend === 'down' ? (
                <TrendingDown className="w-3 h-3" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
              <span>{Math.abs(change).toFixed(1)}%</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
