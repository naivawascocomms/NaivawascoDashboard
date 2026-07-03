import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { ZonePerformance } from '@/types/dashboard';

interface NRWChartProps {
  data: ZonePerformance[];
}

export function NRWChart({ data }: NRWChartProps) {
  const sortedData = [...data].sort((a, b) => b.nrwPercentage - a.nrwPercentage).slice(0, 8);

  const getBarColor = (nrw: number) => {
    if (nrw <= 15) return 'hsl(152, 70%, 40%)';
    if (nrw <= 25) return 'hsl(38, 95%, 50%)';
    return 'hsl(0, 75%, 55%)';
  };

  return (
    <div className="chart-container animate-slide-up" style={{ animationDelay: '250ms' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-warning" />
          NRW by Zone
        </h3>
        <span className="text-xs text-muted-foreground">Top 8 zones</span>
      </div>
      
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={sortedData} 
            layout="vertical"
            margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(210, 20%, 88%)" horizontal={true} vertical={false} />
            <XAxis 
              type="number"
              domain={[0, 50]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(215, 15%, 50%)', fontSize: 12 }}
              tickFormatter={(val) => `${val}%`}
            />
            <YAxis 
              type="category"
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(215, 15%, 50%)', fontSize: 11 }}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(0, 0%, 100%)',
                border: '1px solid hsl(210, 20%, 88%)',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              }}
              formatter={(value: number) => [`${value}%`, 'NRW']}
            />
            <ReferenceLine x={22} stroke="hsl(205, 85%, 40%)" strokeDasharray="5 5" label={{ value: 'Target 22%', fill: 'hsl(205, 85%, 40%)', fontSize: 10, position: 'top' }} />
            <Bar 
              dataKey="nrwPercentage" 
              radius={[0, 4, 4, 0]}
              maxBarSize={24}
            >
              {sortedData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.nrwPercentage)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
