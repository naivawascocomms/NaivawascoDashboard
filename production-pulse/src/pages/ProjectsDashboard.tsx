import { FormEvent, useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, FileText, FolderOpen, Loader2, Plus, RefreshCw, Save } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingState } from '@/components/layout/QueryState';
import { ManagementTab } from '@/components/projects/ManagementTab';
import { UpdatesTab } from '@/components/projects/UpdatesTab';
import { WorkspaceTab } from '@/components/projects/WorkspaceTab';
import { MONTHS, formatDate } from '@/components/projects/shared';
import { toast } from '@/hooks/use-toast';
import {
  useCreateProjectReport,
  useProjectDashboard,
  useProjectReports,
  useProjects,
} from '@/hooks/useProjects';
import { projectService } from '@/services/projectService';

export default function ProjectsDashboard() {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(String(today.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(String(today.getMonth() + 1));
  const [selectedReportId, setSelectedReportId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [newReportDate, setNewReportDate] = useState(today.toISOString().slice(0, 10));

  const reportParams = useMemo(
    () => ({
      year: Number(selectedYear),
      month: Number(selectedMonth),
      ordering: '-year,-month',
    }),
    [selectedMonth, selectedYear],
  );

  const projectsQuery = useProjects({ is_active: true, ordering: 'name' });
  const reportsQuery = useProjectReports(reportParams);
  const reports = reportsQuery.data?.results ?? [];
  const projects = projectsQuery.data?.results ?? [];
  const activeReport = reports.find((report) => String(report.id) === selectedReportId) ?? reports[0];
  const activeReportId = activeReport?.id;

  const dashboardQuery = useProjectDashboard(activeReportId);
  const dashboard = dashboardQuery.data;
  const rows = useMemo(() => dashboard?.rows ?? [], [dashboard]);

  const selectedProject = projects.find((project) => String(project.id) === selectedProjectId) ?? projects[0];

  const createReport = useCreateProjectReport();

  useEffect(() => {
    if (!selectedReportId && reports[0]) setSelectedReportId(String(reports[0].id));
  }, [reports, selectedReportId]);

  useEffect(() => {
    if (!selectedProjectId && projects[0]) setSelectedProjectId(String(projects[0].id));
  }, [projects, selectedProjectId]);

  const handleCreateReport = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const report = await createReport.mutateAsync({
        title: 'Projects Report',
        year: Number(selectedYear),
        month: Number(selectedMonth),
        current_status_date: newReportDate,
        previous_status_date: undefined,
        department: 'TECHNICAL DEPT',
        classification: 'INTERNAL',
      });
      setSelectedReportId(String(report.id));
      toast({ title: 'Project report created.' });
    } catch {
      toast({ title: 'Project report could not be created.', variant: 'destructive' });
    }
  };

  const handleDownload = async () => {
    if (!activeReport) return;
    setDownloading(true);
    try {
      const month = MONTHS.find((item) => item.value === activeReport.month)?.label || activeReport.month;
      await projectService.downloadReportPdf(activeReport.id, `Projects Report Monthly ${month} ${activeReport.year}.pdf`);
    } catch {
      toast({ title: 'PDF download failed.', variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  if (projectsQuery.isLoading || reportsQuery.isLoading) {
    return (
      <div className="container py-6 md:py-8">
        <LoadingState label="Loading projects…" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-surface">
      <div className="container space-y-6 py-6 md:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((month) => (
                  <SelectItem key={month.value} value={String(month.value)}>
                    {month.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input className="w-24" value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => dashboardQuery.refetch()}
              aria-label="Refresh data"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={handleDownload} disabled={!activeReport || downloading} className="gap-2">
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              PDF
            </Button>
          </div>
        </div>

        {!activeReport ? (
          <Card className="border-border/50 bg-card/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-primary" />
                Create Monthly Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateReport} className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label>Current status date</Label>
                  <Input type="date" value={newReportDate} onChange={(event) => setNewReportDate(event.target.value)} />
                </div>
                <Button type="submit" disabled={createReport.isPending} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Report
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {activeReport ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 bg-card/80 p-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{activeReport.status}</Badge>
                <span className="font-semibold">
                  {activeReport.title} - {MONTHS.find((month) => month.value === activeReport.month)?.label} {activeReport.year}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Current status date: {formatDate(activeReport.current_status_date)}
              </p>
            </div>
            <Select value={String(activeReport.id)} onValueChange={setSelectedReportId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reports.map((report) => (
                  <SelectItem key={report.id} value={String(report.id)}>
                    {report.title} - {report.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <Tabs defaultValue="management" className="space-y-6">
          <TabsList className="h-auto flex-wrap gap-1 p-1">
            <TabsTrigger value="management" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Management
            </TabsTrigger>
            <TabsTrigger value="updates" className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              KPI Updates
            </TabsTrigger>
            <TabsTrigger value="workspace" className="gap-1.5">
              <FolderOpen className="h-3.5 w-3.5" />
              Workspace
            </TabsTrigger>
          </TabsList>

          <TabsContent value="management">
            <ManagementTab dashboard={dashboard} activeProjectCount={projects.length} />
          </TabsContent>

          <TabsContent value="updates">
            <UpdatesTab
              projects={projects}
              rows={rows}
              activeReportId={activeReportId}
              defaultProjectId={selectedProject ? String(selectedProject.id) : undefined}
              onProjectCreated={setSelectedProjectId}
            />
          </TabsContent>

          <TabsContent value="workspace">
            <WorkspaceTab
              projects={projects}
              selectedProject={selectedProject}
              onSelectProject={setSelectedProjectId}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
