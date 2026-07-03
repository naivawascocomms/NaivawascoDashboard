import { cn } from '@/lib/utils';
import { ArrowRight, AlertTriangle, Wrench, PipetteIcon } from 'lucide-react';
import { TransmissionMetrics } from '@/types/distribution';

interface TransmissionCardProps {
  metrics: TransmissionMetrics;
}

export function TransmissionCard({ metrics }: TransmissionCardProps) {
  const formatVolume = (vol: number) => {
    if (vol >= 1000000) return `${(vol / 1000000).toFixed(2)}M`;
    if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    return vol.toLocaleString();
  };

  const lossStatus = metrics.lossPercentage <= 2 ? 'good' : 
                     metrics.lossPercentage <= 5 ? 'warning' : 'critical';

  return (
    <div className="chart-container animate-slide-up" style={{ animationDelay: '150ms' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <PipetteIcon className="w-5 h-5 text-primary" />
          Transmission Performance
        </h3>
        <span className={cn(
          'px-2 py-0.5 rounded-full text-xs font-medium',
          lossStatus === 'good' ? 'bg-success/10 text-success' :
          lossStatus === 'warning' ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive'
        )}>
          {metrics.lossPercentage}% Loss
        </span>
      </div>
      
      {/* Flow visualization */}
      <div className="flex items-center justify-between mb-6 p-4 rounded-lg bg-muted/30">
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Production</p>
          <p className="text-2xl font-bold mono-value text-primary">{formatVolume(metrics.productionVolume)}</p>
          <p className="text-xs text-muted-foreground">m³</p>
        </div>
        <div className="flex flex-col items-center">
          <ArrowRight className="w-8 h-8 text-muted-foreground" />
          <span className="text-xs text-destructive font-medium">-{formatVolume(metrics.lossVolume)} m³</span>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground mb-1">Distribution</p>
          <p className="text-2xl font-bold mono-value text-accent">{formatVolume(metrics.distributionVolume)}</p>
          <p className="text-xs text-muted-foreground">m³</p>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <PipetteIcon className="w-3 h-3" />
            Pipeline Length
          </div>
          <p className="text-xl font-bold mono-value">{metrics.pipelineLength} <span className="text-sm font-normal text-muted-foreground">km</span></p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <AlertTriangle className="w-3 h-3" />
            Leaks Detected
          </div>
          <p className="text-xl font-bold mono-value text-warning">{metrics.leaksDetected}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Wrench className="w-3 h-3" />
            Leaks Repaired
          </div>
          <p className="text-xl font-bold mono-value text-success">{metrics.leaksRepaired}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <AlertTriangle className="w-3 h-3" />
            Pending Repairs
          </div>
          <p className="text-xl font-bold mono-value text-destructive">{metrics.leaksDetected - metrics.leaksRepaired}</p>
        </div>
      </div>
    </div>
  );
}
