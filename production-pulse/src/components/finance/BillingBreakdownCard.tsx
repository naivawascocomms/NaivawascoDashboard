import { BillingMetrics } from '@/types/finance';
import { Receipt } from 'lucide-react';

interface BillingBreakdownCardProps {
  billing: BillingMetrics;
}

export function BillingBreakdownCard({ billing }: BillingBreakdownCardProps) {
  const emptyLine = { monthly: 0, cumulative: 0 };
  const formatCurrency = (val: number) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(0)}K`;
    return val.toLocaleString();
  };

  const items = [
    { label: 'Water Sales', monthly: billing.waterSales.monthly, cumulative: billing.waterSales.cumulative },
    { label: 'Sewerage Sales', monthly: billing.sewerageSales.monthly, cumulative: billing.sewerageSales.cumulative },
    { label: 'Bulk Water', monthly: billing.bulkWater.monthly, cumulative: billing.bulkWater.cumulative },
    { label: 'Sanitation', monthly: (billing.sanitation ?? billing.meterRent ?? emptyLine).monthly, cumulative: (billing.sanitation ?? billing.meterRent ?? emptyLine).cumulative },
    { label: 'New Connections (Water)', monthly: billing.newConnectionsWater.monthly, cumulative: billing.newConnectionsWater.cumulative },
    { label: 'New Connections (Sewer)', monthly: billing.newConnectionsSewer.monthly, cumulative: billing.newConnectionsSewer.cumulative },
    { label: 'Reconnections', monthly: billing.reconnections.monthly, cumulative: billing.reconnections.cumulative },
    { label: 'Prepaid Kiosk', monthly: billing.prepaidKiosk.monthly, cumulative: billing.prepaidKiosk.cumulative },
    { label: 'Misc Income', monthly: (billing.miscIncome ?? emptyLine).monthly, cumulative: (billing.miscIncome ?? emptyLine).cumulative },
    { label: 'Penalties', monthly: billing.penalties.monthly, cumulative: billing.penalties.cumulative },
    { label: 'Company Exhauster', monthly: (billing.companyExhauster ?? billing.exhauster ?? emptyLine).monthly, cumulative: (billing.companyExhauster ?? billing.exhauster ?? emptyLine).cumulative },
    { label: 'Customer Exhauster', monthly: (billing.customerExhauster ?? emptyLine).monthly, cumulative: (billing.customerExhauster ?? emptyLine).cumulative },
  ];

  return (
    <div className="chart-container animate-slide-up" style={{ animationDelay: '200ms' }}>
      <div className="flex items-center gap-2 mb-4">
        <Receipt className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Billing Breakdown</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-2 text-muted-foreground font-medium">Category</th>
              <th className="text-right py-2 text-muted-foreground font-medium">Monthly</th>
              <th className="text-right py-2 text-muted-foreground font-medium">Cumulative</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.label} className="border-b border-border/30">
                <td className="py-2 text-foreground">{item.label}</td>
                <td className="py-2 text-right mono-value">{formatCurrency(item.monthly)}</td>
                <td className="py-2 text-right mono-value text-muted-foreground">{formatCurrency(item.cumulative)}</td>
              </tr>
            ))}
            <tr className="bg-muted/30 font-semibold">
              <td className="py-2 text-foreground">Total Billed</td>
              <td className="py-2 text-right mono-value">{formatCurrency(billing.totalBilled.monthly)}</td>
              <td className="py-2 text-right mono-value">{formatCurrency(billing.totalBilled.cumulative)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
