import { cn } from '@/lib/utils';
import { RegionalFinanceMetrics } from '@/types/finance';
import { MapPin, TrendingUp, TrendingDown } from 'lucide-react';

interface RegionalFinanceCardProps {
  region: RegionalFinanceMetrics;
  delay?: number;
}

export function RegionalFinanceCard({ region, delay = 0 }: RegionalFinanceCardProps) {
  const formatCurrency = (val: number) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(0)}K`;
    return val.toLocaleString();
  };

  const efficiencyStatus = region.collectionEfficiency.monthly >= 100 ? 'good' : 
    region.collectionEfficiency.monthly >= 80 ? 'warning' : 'critical';

  return (
    <div 
      className="chart-container animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">{region.region} Region</h3>
        </div>
        <div className={cn(
          'px-2 py-1 rounded-full text-xs font-medium',
          efficiencyStatus === 'good' ? 'bg-success/10 text-success' :
          efficiencyStatus === 'warning' ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive'
        )}>
          {region.collectionEfficiency.monthly.toFixed(1)}% Efficiency
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="p-3 bg-muted/30 rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">Total Billed</p>
          <p className="text-lg font-bold mono-value">{formatCurrency(region.totalBilled.monthly)}</p>
          <p className="text-xs text-muted-foreground">YTD: {formatCurrency(region.totalBilled.cumulative)}</p>
        </div>
        <div className="p-3 bg-muted/30 rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">Collected</p>
          <p className="text-lg font-bold mono-value">{formatCurrency(region.collected.monthly)}</p>
          <p className="text-xs text-muted-foreground">YTD: {formatCurrency(region.collected.cumulative)}</p>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Water Sales</span>
          <span className="mono-value">{formatCurrency(region.billedWater.monthly)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Sewer Sales</span>
          <span className="mono-value">{formatCurrency(region.billedSewer.monthly)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Other Sales</span>
          <span className="mono-value">{formatCurrency(region.otherSales.monthly)}</span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">YTD Efficiency</span>
        <div className="flex items-center gap-1">
          {region.collectionEfficiency.cumulative >= 100 ? (
            <TrendingUp className="w-3 h-3 text-success" />
          ) : (
            <TrendingDown className="w-3 h-3 text-warning" />
          )}
          <span className={cn(
            'text-sm font-semibold',
            region.collectionEfficiency.cumulative >= 100 ? 'text-success' : 'text-warning'
          )}>
            {region.collectionEfficiency.cumulative.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}
