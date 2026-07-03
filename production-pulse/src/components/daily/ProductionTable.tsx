import { Factory } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DailyAnalysisRegion } from '@/types/api';
import { cn } from '@/lib/utils';

interface ProductionTableProps {
  regions: DailyAnalysisRegion[];
  className?: string;
}

export function ProductionTable({ regions, className }: ProductionTableProps) {
  const regionColors: Record<string, string> = {
    Eastern: 'border-l-primary',
    Central: 'border-l-accent',
    Southern: 'border-l-emerald-500',
  };

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Factory className="w-4 h-4 text-primary" />
          Production by Site
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {regions.map((region) => (
          <div key={region.region} className={cn('border-l-4 pl-3', regionColors[region.region])}>
            <h4 className="text-sm font-semibold mb-2 text-foreground">{region.region}</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Site</TableHead>
                  <TableHead className="text-right text-xs">Volume (m3)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {region.production_sites.map((site) => (
                  <TableRow key={site.code}>
                    <TableCell className="py-1.5 text-sm">{site.name}</TableCell>
                    <TableCell className={cn('text-right py-1.5 text-sm font-medium', site.volume === 0 ? 'text-muted-foreground' : '')}>
                      {site.volume.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30">
                  <TableCell className="py-1.5 text-sm font-semibold">Total</TableCell>
                  <TableCell className="text-right py-1.5 text-sm font-bold text-primary">
                    {region.total_production.toLocaleString()}
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
