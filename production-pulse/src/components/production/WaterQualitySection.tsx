import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toNumber as n } from '@/lib/format';
import { KpiCard } from '@/components/kpi/KpiCard';
import type { CompanySummaryLike } from './shared';

function TestCountBar({ label, actual, target }: { label: string; actual: number; target: number }) {
  const pct = target > 0 ? (actual / target) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="mono-value text-muted-foreground">{actual} / {target}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', pct >= 90 ? 'bg-success' : pct >= 70 ? 'bg-warning' : 'bg-destructive')} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="text-right text-xs text-muted-foreground">{pct.toFixed(0)}% realized</div>
    </div>
  );
}

function ComplianceBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-bold mono-value', value >= 95 ? 'text-success' : value >= 80 ? 'text-warning' : 'text-destructive')}>
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

export function WaterQualitySection({ company }: { company: CompanySummaryLike | null }) {
  return (
    <section>
      <h2 className="section-title mb-4 flex items-center gap-2"><FlaskConical className="w-4 h-4" /> Water Quality Testing & WHO Compliance</h2>
      {company ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="rounded-xl border border-border/50 bg-card p-5">
              <h3 className="font-semibold text-sm mb-4">Production Point Tests</h3>
              <div className="space-y-4">
                <TestCountBar label="Chemical Tests"   actual={n(company.chemical_tests_production)}  target={n(company.target_chemical_tests_production)} />
                <TestCountBar label="Biological Tests" actual={n(company.biological_tests_production)} target={n(company.target_biological_tests_production)} />
              </div>
              <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
                <ComplianceBadge label="Chemical WHO Compliance"   value={n(company.who_compliance_chemical_production)} />
                <ComplianceBadge label="Biological WHO Compliance" value={n(company.who_compliance_biological_production)} />
              </div>
            </div>
            <div className="rounded-xl border border-border/50 bg-card p-5">
              <h3 className="font-semibold text-sm mb-4">Consumer Point Tests</h3>
              <div className="space-y-4">
                <TestCountBar label="Chemical Tests"   actual={n(company.chemical_tests_consumer)}  target={n(company.target_chemical_tests_consumer)} />
                <TestCountBar label="Biological Tests" actual={n(company.biological_tests_consumer)} target={n(company.target_biological_tests_consumer)} />
              </div>
              <div className="mt-4 pt-4 border-t border-border/50 space-y-2">
                <ComplianceBadge label="Chemical WHO Compliance"   value={n(company.who_compliance_chemical_consumer)} />
                <ComplianceBadge label="Biological WHO Compliance" value={n(company.who_compliance_biological_consumer)} />
              </div>
            </div>
          </div>
          <div className="data-grid">
            <KpiCard label="WHO Chemical (Prod)"     value={n(company.who_compliance_chemical_production)}   unit="%" target={100} percentRealized={n(company.who_compliance_chemical_production)}   status={n(company.who_compliance_chemical_production) >= 95 ? 'good' : 'warning'} delay={0} />
            <KpiCard label="WHO Biological (Prod)"   value={n(company.who_compliance_biological_production)} unit="%" target={100} percentRealized={n(company.who_compliance_biological_production)} status={n(company.who_compliance_biological_production) >= 95 ? 'good' : 'warning'} delay={100} />
            <KpiCard label="WHO Chemical (Consumer)" value={n(company.who_compliance_chemical_consumer)}     unit="%" target={100} percentRealized={n(company.who_compliance_chemical_consumer)}     status={n(company.who_compliance_chemical_consumer) >= 95 ? 'good' : 'warning'} delay={200} />
            <KpiCard label="WHO Biological (Consumer)" value={n(company.who_compliance_biological_consumer)} unit="%" target={100} percentRealized={n(company.who_compliance_biological_consumer)} status={n(company.who_compliance_biological_consumer) >= 95 ? 'good' : 'warning'} delay={300} />
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground py-4">Water quality data not available for this period.</p>
      )}
    </section>
  );
}
