import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatCompact as fmt } from '@/lib/format';
import { pctColor, pctRealized } from './shared';

interface KPIRowProps {
  label: string;
  actual: number;
  target: number;
  unit: string;
  inverse?: boolean;
}

export function KPIRow({ label, actual, target, inverse }: KPIRowProps) {
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

/** Card wrapper with the standard Target/Actual/Variance/Realization header. */
export function KpiComparisonTable({ unit, children }: { unit?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <div className="grid grid-cols-5 gap-2 py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border/50">
        <div>KPI</div>
        <div className="text-right">Target {unit ? `(${unit})` : ''}</div>
        <div className="text-right">Actual {unit ? `(${unit})` : ''}</div>
        <div className="text-right">Variance</div>
        <div className="text-right">Realization</div>
      </div>
      <div className="divide-y divide-border/30">{children}</div>
    </div>
  );
}
