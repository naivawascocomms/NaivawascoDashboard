import { CheckCircle, FileText, HardHat, Shield } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ProjectDashboardPayload, ProjectHealth } from '@/types/projects';
import { formatCurrency, healthBadgeClass, healthColors, healthLabels, toNumber } from './shared';

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof HardHat }) {
  return (
    <Card className="border-border/50 bg-card/80">
      <CardContent className="flex items-center gap-3 pt-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-bold mono-value">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function CompletionTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { fullName: string; completion: number } }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="max-w-xs rounded-md border bg-popover p-2 text-sm shadow-md">
      <div className="font-medium">{item.fullName}</div>
      <div className="text-muted-foreground">{item.completion.toFixed(1)}% complete</div>
    </div>
  );
}

interface ManagementTabProps {
  dashboard: ProjectDashboardPayload | undefined;
  activeProjectCount: number;
}

export function ManagementTab({ dashboard, activeProjectCount }: ManagementTabProps) {
  const rows = dashboard?.rows ?? [];

  const completionData = rows
    .map((row) => ({
      name: row.project_code || `P${row.sn}`,
      fullName: row.project_name,
      completion: row.overall_percent_complete ?? 0,
    }))
    .sort((a, b) => b.completion - a.completion)
    .slice(0, 10);

  const healthData = Object.entries(dashboard?.summary.health_counts ?? {}).map(([name, value]) => ({
    name,
    label: healthLabels[name as ProjectHealth] || name,
    value,
  }));

  const movementData = rows.map((row) => {
    const previousProgress =
      row.progress_items.find((item) => item.percent_complete !== null && item.percent_complete !== undefined)?.percent_complete ??
      Math.max((row.overall_percent_complete ?? 0) - 5, 0);
    return {
      name: row.project_name.length > 18 ? `${row.project_name.slice(0, 18)}...` : row.project_name,
      previous: previousProgress,
      current: row.overall_percent_complete ?? 0,
    };
  }).slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Reported Projects" value={dashboard?.summary.projects ?? 0} icon={HardHat} />
        <StatCard
          label="Average Completion"
          value={`${toNumber(dashboard?.summary.average_completion).toFixed(1)}%`}
          icon={CheckCircle}
        />
        <StatCard label="Portfolio Budget" value={formatCurrency(dashboard?.summary.total_budget)} icon={Shield} />
        <StatCard label="Active Records" value={activeProjectCount} icon={FileText} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="border-border/50 bg-card/80">
          <CardHeader>
            <CardTitle className="text-base">Project Completion Overview</CardTitle>
          </CardHeader>
          <CardContent className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={completionData} layout="vertical" margin={{ left: 12, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 11 }} />
                <Tooltip content={<CompletionTooltip />} />
                <Bar dataKey="completion" radius={[0, 4, 4, 0]} fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/80">
          <CardHeader>
            <CardTitle className="text-base">Project Health</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={healthData} dataKey="value" nameKey="label" outerRadius={105} label>
                  {healthData.map((entry) => (
                    <Cell key={entry.name} fill={healthColors[entry.name] || '#64748b'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-[-12px] flex flex-wrap justify-center gap-3 text-xs">
              {healthData.map((entry) => (
                <span key={entry.name} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: healthColors[entry.name] || '#64748b' }} />
                  {entry.label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/80">
        <CardHeader>
          <CardTitle className="text-base">Previous vs Current Progress</CardTitle>
        </CardHeader>
        <CardContent className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={movementData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
              <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Progress']} />
              <Bar dataKey="previous" fill="#94a3b8" name="Previous" radius={[4, 4, 0, 0]} />
              <Bar dataKey="current" fill="hsl(var(--primary))" name="Current" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/80">
        <CardHeader>
          <CardTitle className="text-base">Monthly Report Table</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Completion</TableHead>
                <TableHead className="min-w-[260px]">Current Status</TableHead>
                <TableHead className="min-w-[220px]">Next Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.update_id}>
                  <TableCell>
                    <div className="font-medium">{row.project_name}</div>
                    <div className="text-xs text-muted-foreground">{row.funding_source || row.project_type}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={healthBadgeClass(row.health)}>
                      {healthLabels[row.health]}
                    </Badge>
                  </TableCell>
                  <TableCell className="min-w-[160px]">
                    <div className="flex items-center gap-2">
                      <Progress value={row.overall_percent_complete ?? 0} className="h-2" />
                      <span className="w-12 text-right text-xs mono-value">{(row.overall_percent_complete ?? 0).toFixed(0)}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.status_current || '-'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.next_actions || '-'}</TableCell>
                </TableRow>
              ))}
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No monthly project updates have been captured for this report.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
