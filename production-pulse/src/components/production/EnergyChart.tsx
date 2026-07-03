import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Line,
} from 'recharts';
import { Sun, Zap } from 'lucide-react';
import { MonthlyProductionTrend } from '@/types/production';

interface EnergyChartProps {
  data: MonthlyProductionTrend[];
}

export function EnergyChart({ data }: EnergyChartProps) {
  const chartData = data.map(d => ({
    month: d.month,
    solar: d.solarEnergy / 1000,
    grid: d.gridEnergy / 1000,
    cost: d.energyCost / 1000000,
  }));

  return (
    <div className="chart-container animate-slide-up" style={{ animationDelay: '200ms' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Zap className="w-5 h-5 text-warning" />
          Energy Consumption & Solar Generation
        </h3>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <Sun className="w-3 h-3 text-amber-500" />
            <span className="text-muted-foreground">Solar</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-primary" />
            <span className="text-muted-foreground">Grid</span>
          </div>
        </div>
      </div>
      
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
              yAxisId="energy"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(215, 15%, 50%)', fontSize: 12 }}
              tickFormatter={(val) => `${val}K`}
              label={{ value: 'kWh (000s)', angle: -90, position: 'insideLeft', style: { fill: 'hsl(215, 15%, 50%)', fontSize: 10 } }}
            />
            <YAxis 
              yAxisId="cost"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(215, 15%, 50%)', fontSize: 12 }}
              tickFormatter={(val) => `${val}M`}
              label={{ value: 'Cost (KES M)', angle: 90, position: 'insideRight', style: { fill: 'hsl(215, 15%, 50%)', fontSize: 10 } }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(0, 0%, 100%)',
                border: '1px solid hsl(210, 20%, 88%)',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              }}
              formatter={(value: number, name: string) => {
                if (name === 'cost') return [`KES ${value.toFixed(2)}M`, 'Energy Cost'];
                return [`${value.toFixed(1)}K kWh`, name === 'solar' ? 'Solar' : 'Grid'];
              }}
            />
            <Bar yAxisId="energy" dataKey="grid" stackId="energy" fill="hsl(205, 85%, 40%)" radius={[0, 0, 0, 0]} />
            <Bar yAxisId="energy" dataKey="solar" stackId="energy" fill="hsl(45, 93%, 47%)" radius={[4, 4, 0, 0]} />
            <Line yAxisId="cost" type="monotone" dataKey="cost" stroke="hsl(0, 75%, 55%)" strokeWidth={2} dot={{ fill: 'hsl(0, 75%, 55%)', r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
