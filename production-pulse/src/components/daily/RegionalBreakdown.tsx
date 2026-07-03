import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DailyAnalysisRegion } from '@/types/api';
import { cn } from '@/lib/utils';

interface RegionalBreakdownProps {
  regions: DailyAnalysisRegion[];
  className?: string;
}

export function RegionalBreakdown({ regions, className }: RegionalBreakdownProps) {
  const formatNumber = (val: number) => val.toLocaleString();
  const formatCurrency = (val: number) => val.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });

  const regionColors: Record<string, string> = {
    Eastern: 'bg-primary/10 text-primary',
    Central: 'bg-accent/10 text-accent-foreground',
    Southern: 'bg-emerald-500/10 text-emerald-600',
  };

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Regional Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Region</TableHead>
              <TableHead className="text-right">Production (m3)</TableHead>
              <TableHead className="text-right">Supply (m3)</TableHead>
              <TableHead className="text-right">Collection (KES)</TableHead>
              <TableHead className="text-right">Gap (m3)</TableHead>
              <TableHead className="text-right">Gap %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {regions.map((region) => {
              const gap = region.total_production - region.total_supply;
              const gapPercent = region.total_production > 0
                ? ((gap / region.total_production) * 100).toFixed(1)
                : '0.0';

              return (
                <TableRow key={region.region}>
                  <TableCell>
                    <span className={cn('px-2 py-1 rounded-md text-xs font-medium', regionColors[region.region])}>
                      {region.region}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatNumber(region.total_production)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatNumber(region.total_supply)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(region.total_collection)}
                  </TableCell>
                  <TableCell className={cn('text-right font-medium', gap > 0 ? 'text-destructive' : 'text-emerald-500')}>
                    {formatNumber(gap)}
                  </TableCell>
                  <TableCell className={cn('text-right font-medium', parseFloat(gapPercent) > 20 ? 'text-destructive' : parseFloat(gapPercent) > 10 ? 'text-warning' : 'text-emerald-500')}>
                    {gapPercent}%
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
