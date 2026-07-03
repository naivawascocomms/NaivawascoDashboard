import { SourcePerformance } from '@/types/production';
import { cn } from '@/lib/utils';
import { Activity, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface SourceTableProps {
  sources: SourcePerformance[];
}

export function SourceTable({ sources }: SourceTableProps) {
  const statusIcons = {
    active: <CheckCircle className="w-4 h-4 text-success" />,
    maintenance: <AlertTriangle className="w-4 h-4 text-warning" />,
    offline: <XCircle className="w-4 h-4 text-destructive" />,
  };

  const formatVolume = (vol: number) => {
    if (vol >= 1000000) return `${(vol / 1000000).toFixed(2)}M`;
    if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    return vol.toLocaleString();
  };

  return (
    <div className="chart-container animate-slide-up overflow-hidden" style={{ animationDelay: '300ms' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Production Source Performance
        </h3>
      </div>
      
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Daily (m³)</TableHead>
              <TableHead className="text-right">Monthly (m³)</TableHead>
              <TableHead className="text-right">Cumulative (m³)</TableHead>
              <TableHead className="text-right">Utilization</TableHead>
              <TableHead className="text-right">Efficiency</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((source) => (
              <TableRow key={source.id}>
                <TableCell className="font-medium">{source.name}</TableCell>
                <TableCell className="text-muted-foreground">{source.type}</TableCell>
                <TableCell className="text-right mono-value">{formatVolume(source.dailyProduction)}</TableCell>
                <TableCell className="text-right mono-value">{formatVolume(source.monthlyProduction)}</TableCell>
                <TableCell className="text-right mono-value">{formatVolume(source.cumulativeProduction)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          'h-full rounded-full',
                          source.utilizationRate >= 70 ? 'bg-success' :
                          source.utilizationRate >= 50 ? 'bg-warning' : 'bg-destructive'
                        )}
                        style={{ width: `${source.utilizationRate}%` }}
                      />
                    </div>
                    <span className="mono-value text-xs w-10 text-right">{source.utilizationRate}%</span>
                  </div>
                </TableCell>
                <TableCell className="text-right mono-value">{source.energyEfficiency.toFixed(2)}</TableCell>
                <TableCell className="text-center">{statusIcons[source.status]}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
