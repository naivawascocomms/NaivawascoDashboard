import { useState } from 'react';
import { PageToolbar } from '@/components/layout/PageToolbar';
import { SalesCustomerCareSection } from '@/components/distribution/SalesCustomerCareSection';

export default function SalesCustCare() {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [periodLabel, setPeriodLabel] = useState('');

  return (
    <div className="min-h-screen bg-gradient-surface">
      <div className="container space-y-6 py-6 md:py-8">
        <PageToolbar
          periodLabel={periodLabel || undefined}
          onRefresh={() => setRefreshNonce((value) => value + 1)}
        />
        <SalesCustomerCareSection
          refreshNonce={refreshNonce}
          onPeriodChange={setPeriodLabel}
        />
      </div>
    </div>
  );
}
