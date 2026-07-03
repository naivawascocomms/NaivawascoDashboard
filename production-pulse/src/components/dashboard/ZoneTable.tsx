import { ZonePerformance } from '@/types/dashboard';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Droplet, AlertCircle } from 'lucide-react';

interface ZoneTableProps {
  zones: ZonePerformance[];
  selectedRegion?: string;
}

export function ZoneTable({ zones, selectedRegion }: ZoneTableProps) {
  const filteredZones = selectedRegion && selectedRegion !== 'all'
    ? zones.filter(z => z.region === selectedRegion)
    : zones;

  const formatVolume = (val: number) => {
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toLocaleString();
  };

  const getNRWStatus = (nrw: number) => {
    if (nrw <= 15) return 'good';
    if (nrw <= 25) return 'warning';
    return 'critical';
  };

  const statusStyles = {
    good: 'bg-success/10 text-success border-success/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
    critical: 'bg-destructive/10 text-destructive border-destructive/20',
  };

  return (
    <div className="chart-container animate-slide-up" style={{ animationDelay: '300ms' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Droplet className="w-5 h-5 text-primary" />
          Zone Performance
        </h3>
        <span className="text-xs text-muted-foreground">
          {filteredZones.length} zones
        </span>
      </div>
      
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-xs font-semibold text-muted-foreground">Zone</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Region</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-right">Supplied (m³)</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-right">Sold (m³)</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-center">NRW %</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-right">Connections</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-right">Leaks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredZones.map((zone, idx) => {
              const status = getNRWStatus(zone.nrwPercentage);
              return (
                <TableRow 
                  key={zone.name}
                  className="border-border/30 hover:bg-muted/50 transition-colors"
                >
                  <TableCell className="font-medium text-foreground">{zone.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs font-normal">
                      {zone.region}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right mono-value">{formatVolume(zone.waterSupplied)}</TableCell>
                  <TableCell className="text-right mono-value">{formatVolume(zone.waterSold)}</TableCell>
                  <TableCell className="text-center">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border',
                      statusStyles[status]
                    )}>
                      {zone.nrwPercentage}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right mono-value">{zone.connections.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    {zone.leaksBursts > 0 && (
                      <span className="inline-flex items-center gap-1 text-warning">
                        <AlertCircle className="w-3 h-3" />
                        <span className="mono-value">{zone.leaksBursts}</span>
                      </span>
                    )}
                    {zone.leaksBursts === 0 && (
                      <span className="text-muted-foreground mono-value">0</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
