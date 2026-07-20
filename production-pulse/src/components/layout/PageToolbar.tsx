import { ReactNode } from 'react';
import { Calendar, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PageToolbarProps {
  /** Filter controls, rendered on the left. */
  children?: ReactNode;
  /** Human-readable label for the period currently shown, e.g. "Jul 2025". */
  periodLabel?: string;
  onRefresh?: () => void;
  className?: string;
}

/**
 * Standard toolbar row under the app header: module filters on the left,
 * current-period chip and refresh action on the right. Every module page
 * should use this instead of ad-hoc filter rows or its own page title.
 */
export function PageToolbar({ children, periodLabel, onRefresh, className }: PageToolbarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/50 bg-card p-4',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-4">{children}</div>

      {(periodLabel || onRefresh) && (
        <div className="ml-auto flex items-center gap-3">
          {periodLabel && (
            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/40 px-3 py-1.5">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{periodLabel}</span>
            </div>
          )}
          {onRefresh && (
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              aria-label="Refresh data"
              className="h-9 w-9 shrink-0"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
