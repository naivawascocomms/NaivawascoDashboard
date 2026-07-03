import { GitBranch } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DailyAnalysisRegion } from '@/types/api';
import { cn } from '@/lib/utils';

interface SupplyTableProps {
  regions: DailyAnalysisRegion[];
  className?: string;
}

export function SupplyTable({ regions, className }: SupplyTableProps) {
  const formatNumber = (val: number) => val.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });

  const regionColors: Record<string, string> = {
    Eastern: 'border-l-primary',
    Central: 'border-l-accent',
    Southern: 'border-l-emerald-500',
  };

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-accent" />
          Supply and Collection per Zone
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {regions.map((region) => (
          <div key={region.region} className={cn('border-l-4 pl-3', regionColors[region.region])}>
            <h4 className="text-sm font-semibold mb-2 text-foreground">{region.region}</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Zone</TableHead>
                  <TableHead className="text-right text-xs">Supply (m3)</TableHead>
                  <TableHead className="text-right text-xs">Collection (KES)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {region.zones.map((zone) => (
                  <TableRow key={zone.code}>
                    <TableCell className="py-1.5 text-sm">{zone.name}</TableCell>
                    <TableCell className={cn('text-right py-1.5 text-sm font-medium', zone.volume === 0 ? 'text-muted-foreground' : '')}>
                      {formatNumber(zone.volume)}
                    </TableCell>
                    <TableCell className={cn('text-right py-1.5 text-sm font-medium', !zone.collection ? 'text-muted-foreground' : '')}>
                      {formatNumber(zone.collection || 0)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30">
                  <TableCell className="py-1.5 text-sm font-semibold">Total</TableCell>
                  <TableCell className="text-right py-1.5 text-sm font-bold text-accent">
                    {formatNumber(region.total_supply)}
                  </TableCell>
                  <TableCell className="text-right py-1.5 text-sm font-bold text-accent">
                    {formatNumber(region.total_collection)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
