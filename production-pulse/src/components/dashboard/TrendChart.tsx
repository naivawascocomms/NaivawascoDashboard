import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp } from 'lucide-react';

interface TrendData {
  month: string;
  production: number;
  billed: number;
  nrw: number;
}

interface TrendChartProps {
  data: TrendData[];
}

export function TrendChart({ data }: TrendChartProps) {
  return (
    <div className="chart-container animate-slide-up" style={{ animationDelay: '200ms' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Production & Billing Trends
        </h3>
        <span className="text-xs text-muted-foreground">Last 10 months</span>
      </div>
      
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorProduction" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(205, 85%, 40%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(205, 85%, 40%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorBilled" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(185, 70%, 42%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(185, 70%, 42%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(210, 20%, 88%)" vertical={false} />
            <XAxis 
              dataKey="month" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(215, 15%, 50%)', fontSize: 12 }}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(215, 15%, 50%)', fontSize: 12 }}
              tickFormatter={(val) => `${(val / 1000).toFixed(0)}K`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(0, 0%, 100%)',
                border: '1px solid hsl(210, 20%, 88%)',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              }}
              formatter={(value: number, name: string) => [
                `${(value / 1000).toFixed(1)}K m³`,
                name === 'production' ? 'Production' : 'Billed'
              ]}
            />
            <Legend 
              verticalAlign="top" 
              height={36}
              formatter={(value) => (
                <span className="text-xs text-muted-foreground">
                  {value === 'production' ? 'Production' : 'Billed Volume'}
                </span>
              )}
            />
            <Area
              type="monotone"
              dataKey="production"
              stroke="hsl(205, 85%, 40%)"
              strokeWidth={2}
              fill="url(#colorProduction)"
            />
            <Area
              type="monotone"
              dataKey="billed"
              stroke="hsl(185, 70%, 42%)"
              strokeWidth={2}
              fill="url(#colorBilled)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
