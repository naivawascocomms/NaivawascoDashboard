import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { MonthlyProductionTrend } from '@/types/production';

interface ProductionTrendChartProps {
  data: MonthlyProductionTrend[];
}

export function ProductionTrendChart({ data }: ProductionTrendChartProps) {
  const chartData = data.map(d => ({
    month: d.month,
    production: d.production / 1000,
    target: d.target / 1000,
  }));

  return (
    <div className="chart-container animate-slide-up" style={{ animationDelay: '100ms' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Production Trends vs Target
        </h3>
        <span className="text-xs text-muted-foreground">Volume in thousands m³</span>
      </div>
      
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorProd" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(205, 85%, 40%)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="hsl(205, 85%, 40%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(210, 20%, 88%)" vertical={false} />
            <XAxis 
              dataKey="month" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(215, 15%, 50%)', fontSize: 12 }}
              interval={0}
              minTickGap={16}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(215, 15%, 50%)', fontSize: 12 }}
              tickFormatter={(val) => `${val}K`}
              domain={['dataMin - 20', 'dataMax + 20']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(0, 0%, 100%)',
                border: '1px solid hsl(210, 20%, 88%)',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              }}
              formatter={(value: number, name: string) => [
                `${value.toFixed(1)}K m³`,
                name === 'production' ? 'Actual' : 'Target'
              ]}
            />
            <ReferenceLine 
              y={0} 
              stroke="hsl(210, 20%, 88%)" 
            />
            <Area
              type="monotone"
              dataKey="production"
              stroke="hsl(205, 85%, 40%)"
              strokeWidth={2}
              fill="url(#colorProd)"
            />
            <Area
              type="monotone"
              dataKey="target"
              stroke="hsl(152, 70%, 40%)"
              strokeWidth={2}
              strokeDasharray="5 5"
              fill="none"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      <div className="flex items-center justify-center gap-6 mt-3 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-primary rounded" />
          <span className="text-muted-foreground">Actual Production</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-success rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 2px, hsl(152, 70%, 40%) 2px, hsl(152, 70%, 40%) 4px)' }} />
          <span className="text-muted-foreground">Target</span>
        </div>
      </div>
    </div>
  );
}
