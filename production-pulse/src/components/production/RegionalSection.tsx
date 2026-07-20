import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber as fmtNum, toNumber as n } from '@/lib/format';
import type { CompanySummaryLike, SiteProductionRow } from './shared';
import { supplyForDisplay } from './shared';

const REGION_NAMES = ['Central', 'Southern', 'Eastern'] as const;

function RegionalCard({ region, openingDate, closingDate, productionLoss, availableForSale, color }: {
  region: string; openingDate: string | number | null | undefined; closingDate: string | number | null | undefined;
  productionLoss: number; availableForSale: number; color: string;
}) {
  return (
    <div className={cn('rounded-xl border p-5 space-y-3', color)}>
      <h3 className="font-semibold text-lg">{region} Region</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Opening Date</span>
          <span className="font-medium mono-value">{openingDate ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Closing Date</span>
          <span className="font-medium mono-value">{closingDate ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Production Loss</span>
          <span className="font-medium mono-value">{fmtNum(productionLoss)} m³</span>
        </div>
        <div className="flex justify-between border-t border-border/50 pt-2">
          <span className="text-muted-foreground font-medium">Available for Sale</span>
          <span className="font-bold mono-value text-foreground">{fmtNum(availableForSale)} m³</span>
        </div>
      </div>
    </div>
  );
}

interface RegionalSectionProps {
  company: CompanySummaryLike | null;
  tableRows: SiteProductionRow[];
  periodLabel: string;
}

export function RegionalSection({ company, tableRows, periodLabel }: RegionalSectionProps) {
  return (
    <>
      <section>
        <h2 className="section-title mb-4 flex items-center gap-2"><MapPin className="w-4 h-4" /> Regional Summary — {periodLabel}</h2>
        {company ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <RegionalCard region="Central"  openingDate={company.central_opening_date}  closingDate={company.central_closing_date}  productionLoss={n(company.central_production_loss_m3)}  availableForSale={n(company.central_available_for_sale_m3)}  color="bg-blue-500/10 border-blue-500/30" />
            <RegionalCard region="Southern" openingDate={company.southern_opening_date} closingDate={company.southern_closing_date} productionLoss={n(company.southern_production_loss_m3)} availableForSale={n(company.southern_available_for_sale_m3)} color="bg-amber-500/10 border-amber-500/30" />
            <RegionalCard region="Eastern"  openingDate={company.eastern_opening_date}  closingDate={company.eastern_closing_date}  productionLoss={n(company.eastern_production_loss_m3)}  availableForSale={n(company.eastern_available_for_sale_m3)}  color="bg-emerald-500/10 border-emerald-500/30" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4">Regional data not available for this period.</p>
        )}
      </section>

      <section>
        <h2 className="section-title mb-4">Sites by Region — {periodLabel}</h2>
        {REGION_NAMES.map(regionName => {
          const regionRows = tableRows.filter(r =>
            r.region_name?.toUpperCase().includes(regionName.toUpperCase())
          );
          if (!regionRows.length) return null;
          const regionTotal = regionRows.reduce((s, r) => s + supplyForDisplay(r), 0);
          return (
            <div key={regionName} className="mb-4">
              <h3 className="text-sm font-semibold mb-2 text-muted-foreground">
                {regionName} Region — Available for Sale:{' '}
                <span className="text-foreground mono-value">{fmtNum(regionTotal)} m³</span>
              </h3>
              <div className="overflow-x-auto rounded-lg border border-border/50">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2.5 text-xs font-medium">Site</th>
                      <th className="text-right p-2.5 text-xs font-medium">Abstracted (m³)</th>
                      <th className="text-right p-2.5 text-xs font-medium">Supplied (m³)</th>
                      <th className="text-right p-2.5 text-xs font-medium">Loss %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regionRows.map(site => (
                      <tr key={site.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="p-2.5 text-sm">{site.production_site_name}</td>
                        <td className="p-2.5 text-right mono-value text-sm">{fmtNum(n(site.water_abstracted_m3))}</td>
                        <td className="p-2.5 text-right mono-value text-sm">{fmtNum(supplyForDisplay(site))}</td>
                        <td className="p-2.5 text-right mono-value text-sm">{n(site.production_loss_percentage) > 0 ? `${n(site.production_loss_percentage).toFixed(1)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
