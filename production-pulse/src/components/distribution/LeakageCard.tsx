import { cn } from '@/lib/utils';
import { AlertTriangle, Clock, Droplets, CheckCircle } from 'lucide-react';
import { LeakageMetrics } from '@/types/distribution';

interface LeakageCardProps {
  metrics: LeakageMetrics;
}

export function LeakageCard({ metrics }: LeakageCardProps) {
  const repairRate = (metrics.repaired / metrics.totalLeaks) * 100;

  return (
    <div className="chart-container animate-slide-up" style={{ animationDelay: '250ms' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-warning" />
          Leakage Management
        </h3>
        <span className={cn(
          'px-2 py-0.5 rounded-full text-xs font-medium',
          metrics.highPriorityCount === 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
        )}>
          {metrics.highPriorityCount} High Priority
        </span>
      </div>
      
      {/* Progress ring visualization */}
      <div className="flex items-center justify-center mb-6">
        <div className="relative w-32 h-32">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="12"
            />
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="hsl(var(--success))"
              strokeWidth="12"
              strokeDasharray={`${repairRate * 3.52} 352`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold mono-value">{repairRate.toFixed(0)}%</span>
            <span className="text-xs text-muted-foreground">Repaired</span>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <AlertTriangle className="w-3 h-3" />
            Total Leaks
          </div>
          <p className="text-xl font-bold mono-value">{metrics.totalLeaks}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <CheckCircle className="w-3 h-3" />
            Repaired
          </div>
          <p className="text-xl font-bold mono-value text-success">{metrics.repaired}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Clock className="w-3 h-3" />
            Avg Repair Time
          </div>
          <p className="text-xl font-bold mono-value">{metrics.avgRepairTime} <span className="text-sm font-normal text-muted-foreground">hrs</span></p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Droplets className="w-3 h-3" />
            Est. Daily Loss
          </div>
          <p className="text-xl font-bold mono-value text-destructive">{metrics.estimatedLoss.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">m³</span></p>
        </div>
      </div>
    </div>
  );
}
