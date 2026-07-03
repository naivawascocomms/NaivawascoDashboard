import { format, parseISO } from 'date-fns';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DailyAnalysisTrend } from '@/types/api';

interface DailyTrendChartProps {
  data: DailyAnalysisTrend[];
  className?: string;
}

export function DailyTrendChart({ data, className }: DailyTrendChartProps) {
  const chartData = data.map((item) => ({
    ...item,
    date: format(parseISO(item.date), 'dd MMM'),
  }));
  const isSingleDay = chartData.length === 1;
  const singleDayChartData = isSingleDay
    ? [
        { metric: 'Production', value: chartData[0].production, fill: 'hsl(var(--primary))' },
        { metric: 'Supply', value: chartData[0].supply, fill: 'hsl(var(--accent))' },
        { metric: 'Gap', value: chartData[0].gap, fill: 'hsl(var(--destructive))' },
      ]
    : [];

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          {isSingleDay ? 'Single-Day Production vs Supply' : 'Daily Production vs Supply'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          {isSingleDay ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={singleDayChartData} barCategoryGap={32}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="metric"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value: number) => [value.toLocaleString(), 'Volume']}
                  labelFormatter={() => chartData[0].date}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="value" name="Volume" radius={[8, 8, 0, 0]}>
                  {singleDayChartData.map((entry) => (
                    <Cell key={entry.metric} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value: number, name: string) => [
                    value.toLocaleString(),
                    name.charAt(0).toUpperCase() + name.slice(1),
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="production"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 4, fill: 'hsl(var(--primary))' }}
                  name="Production"
                />
                <Line
                  type="monotone"
                  dataKey="supply"
                  stroke="hsl(var(--accent))"
                  strokeWidth={2}
                  dot={{ r: 4, fill: 'hsl(var(--accent))' }}
                  name="Supply"
                />
                <Line
                  type="monotone"
                  dataKey="gap"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  dot={{ r: 4, fill: 'hsl(var(--destructive))' }}
                  name="Gap"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
