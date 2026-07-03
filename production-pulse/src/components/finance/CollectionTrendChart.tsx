import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { MonthlyFinanceTrend } from '@/types/finance';
import { TrendingUp } from 'lucide-react';

interface CollectionTrendChartProps {
  data: MonthlyFinanceTrend[];
}

export function CollectionTrendChart({ data }: CollectionTrendChartProps) {
  const formatCurrency = (val: number) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    return `${(val / 1000).toFixed(0)}K`;
  };

  return (
    <div className="chart-container animate-slide-up" style={{ animationDelay: '300ms' }}>
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Billing & Collection Trend</h3>
      </div>
      
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis 
              dataKey="month" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickFormatter={formatCurrency}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number, name: string) => {
                if (name === 'collectionEfficiency') return [`${value}%`, 'Efficiency'];
                return [formatCurrency(value), name === 'billed' ? 'Billed' : 'Collected'];
              }}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="billed" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2 }}
              name="Billed"
            />
            <Line 
              type="monotone" 
              dataKey="collected" 
              stroke="hsl(var(--success))" 
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--success))', strokeWidth: 2 }}
              name="Collected"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
