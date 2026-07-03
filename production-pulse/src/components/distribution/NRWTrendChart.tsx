import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity } from 'lucide-react';
import { MonthlyDistributionTrend } from '@/types/distribution';

interface NRWTrendChartProps {
  data: MonthlyDistributionTrend[];
}

export function NRWTrendChart({ data }: NRWTrendChartProps) {
  const chartData = data.map((item) => ({
    month: item.month,
    nrw: item.nrwPercentage,
    target: item.target,
  }));

  return (
    <div className="chart-container animate-slide-up" style={{ animationDelay: '200ms' }}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          <Activity className="h-5 w-5 text-primary" />
          NRW Performance Trend
        </h3>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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
              tickFormatter={(value) => `${value}%`}
              domain={[0, 40]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(0, 0%, 100%)',
                border: '1px solid hsl(210, 20%, 88%)',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              }}
              formatter={(value: number, name: string) => [
                `${value.toFixed(1)}%`,
                name === 'nrw' ? 'NRW' : 'Target',
              ]}
            />
            <Line
              type="monotone"
              dataKey="nrw"
              stroke="hsl(0, 75%, 55%)"
              strokeWidth={2.5}
              dot={{ fill: 'hsl(0, 75%, 55%)', r: 3.5 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="target"
              stroke="hsl(152, 70%, 40%)"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex items-center justify-center gap-6 text-xs">
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-4 rounded bg-destructive" />
          <span className="text-muted-foreground">NRW %</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="h-0.5 w-4 rounded"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, hsl(152, 70%, 40%), hsl(152, 70%, 40%) 2px, transparent 2px, transparent 4px)',
            }}
          />
          <span className="text-muted-foreground">Target</span>
        </div>
      </div>
    </div>
  );
}
