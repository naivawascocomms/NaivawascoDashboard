import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber as fmtNum, toNumber as n } from '@/lib/format';
import type { SiteProductionRow } from './shared';
import { pctColor, supplyForDisplay } from './shared';

interface SiteTableProps {
  rows: SiteProductionRow[];
  periodLabel: string;
}

/** Per-site grid/solar power breakdown table (Power & Energy tab). */
export function PowerBreakdownTable({ rows, periodLabel }: SiteTableProps) {
  return (
    <section>
      <h2 className="section-title mb-4">Per-Site Power Breakdown — {periodLabel}</h2>
      <div className="overflow-x-auto rounded-xl border border-border/50">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 text-xs font-medium">Site</th>
              <th className="text-right p-3 text-xs font-medium">Grid (kWh)</th>
              <th className="text-right p-3 text-xs font-medium">Solar (kWh)</th>
              <th className="text-right p-3 text-xs font-medium">Total (kWh)</th>
              <th className="text-right p-3 text-xs font-medium">Solar %</th>
              <th className="text-right p-3 text-xs font-medium">Actual Eff.</th>
              <th className="text-right p-3 text-xs font-medium">Target Eff.</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No data</td></tr>
            ) : rows.map(site => (
              <tr key={site.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="p-3 text-sm font-medium">{site.production_site_name}</td>
                <td className="p-3 text-right mono-value text-sm">{fmtNum(n(site.power_grid_kwh))}</td>
                <td className="p-3 text-right mono-value text-sm">{fmtNum(n(site.power_solar_kwh))}</td>
                <td className="p-3 text-right mono-value text-sm font-semibold">{fmtNum(n(site.total_power_kwh))}</td>
                <td className="p-3 text-right mono-value text-sm">{n(site.solar_percentage) > 0 ? `${n(site.solar_percentage).toFixed(1)}%` : '—'}</td>
                <td className="p-3 text-right mono-value text-sm">{n(site.power_efficiency_kwh_per_m3) > 0 ? n(site.power_efficiency_kwh_per_m3).toFixed(2) : '—'}</td>
                <td className="p-3 text-right mono-value text-sm text-muted-foreground">{site.target_details?.power_efficiency_target_kwh_per_m3 ? n(site.target_details.power_efficiency_target_kwh_per_m3).toFixed(2) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Full all-sites production table (Sites tab). */
export function AllSitesTable({ rows, periodLabel, loading }: SiteTableProps & { loading: boolean }) {
  return (
    <section>
      <h2 className="section-title mb-4">All Production Sites — {periodLabel}</h2>
      <div className="overflow-x-auto rounded-xl border border-border/50">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 text-xs font-medium">Site</th>
              <th className="text-right p-3 text-xs font-medium">Region</th>
              <th className="text-right p-3 text-xs font-medium">Target (m³)</th>
              <th className="text-right p-3 text-xs font-medium">Actual (m³)</th>
              <th className="text-right p-3 text-xs font-medium">Supplied (m³)</th>
              <th className="text-right p-3 text-xs font-medium">Loss %</th>
              <th className="text-right p-3 text-xs font-medium">Power (kWh)</th>
              <th className="text-right p-3 text-xs font-medium">Eff. (kWh/m³)</th>
              <th className="text-right p-3 text-xs font-medium">Realization</th>
              <th className="text-right p-3 text-xs font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="p-6 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">No production records for {periodLabel}.</td></tr>
            ) : rows.map(site => {
              const real = n(site.water_abstraction_realization_percent);
              return (
                <tr key={site.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="p-3 text-sm font-medium">{site.production_site_name}</td>
                  <td className="p-3 text-right text-xs text-muted-foreground">{site.region_name}</td>
                  <td className="p-3 text-right mono-value text-sm text-muted-foreground">{site.target_details ? fmtNum(n(site.target_details.water_abstraction_target_m3)) : '—'}</td>
                  <td className="p-3 text-right mono-value text-sm font-semibold">{fmtNum(n(site.water_abstracted_m3))}</td>
                  <td className="p-3 text-right mono-value text-sm">{fmtNum(supplyForDisplay(site))}</td>
                  <td className="p-3 text-right mono-value text-sm">{n(site.production_loss_percentage) > 0 ? `${n(site.production_loss_percentage).toFixed(1)}%` : '—'}</td>
                  <td className="p-3 text-right mono-value text-sm">{fmtNum(n(site.total_power_kwh))}</td>
                  <td className="p-3 text-right mono-value text-sm">{n(site.power_efficiency_kwh_per_m3) > 0 ? n(site.power_efficiency_kwh_per_m3).toFixed(2) : '—'}</td>
                  <td className="p-3 text-right">
                    <span className={cn('mono-value text-sm font-bold', pctColor(real))}>{real > 0 ? `${real.toFixed(1)}%` : '—'}</span>
                  </td>
                  <td className="p-3 text-right">
                    {site.is_finalized
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium">Finalized</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning font-medium">Draft</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
