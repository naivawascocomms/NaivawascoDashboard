import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle,
  ClipboardCheck,
  Download,
  File,
  FileText,
  FolderOpen,
  HardHat,
  Loader2,
  Map,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Upload,
} from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  useCreateProject,
  useCreateProjectComment,
  useCreateProjectIssue,
  useCreateProjectMilestone,
  useCreateProjectMonthlyUpdate,
  useCreateProjectProgressItem,
  useCreateProjectReport,
  useCreateProjectSiteVisit,
  useProjectDashboard,
  useProjectReports,
  useProjects,
  useProjectWorkspace,
  useUpdateProject,
  useUpdateProjectMonthlyUpdate,
  useUploadProjectFile,
  useUploadProjectGeoFile,
} from '@/hooks/useProjects';
import { projectService } from '@/services/projectService';
import type { Project, ProjectDashboardRow, ProjectHealth, ProjectStatus, ProjectVisibility } from '@/types/projects';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const healthLabels: Record<ProjectHealth, string> = {
  on_track: 'On Track',
  delayed: 'Delayed',
  blocked: 'Blocked',
  completed: 'Completed',
  watch: 'Watch',
};

const statusLabels: Record<ProjectStatus, string> = {
  planned: 'Planned',
  ongoing: 'Ongoing',
  stalled: 'Stalled',
  completed: 'Completed',
  closed: 'Closed',
};

const healthColors: Record<string, string> = {
  on_track: '#16a34a',
  delayed: '#f59e0b',
  blocked: '#dc2626',
  completed: '#2563eb',
  watch: '#7c3aed',
};

const statusOrder: ProjectStatus[] = ['ongoing', 'planned', 'stalled', 'completed', 'closed'];

const projectControlAreas = [
  'Scope and components',
  'Schedule and milestones',
  'Cost and funding',
  'Quality and inspections',
  'Risk and issues',
  'Procurement and contracts',
  'Stakeholders and approvals',
  'Documents and drawings',
  'Site visits and evidence',
  'KML/KMZ geospatial records',
];

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return 0;
  return Number(value) || 0;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatCurrency(value: string | number | null | undefined) {
  const amount = toNumber(value);
  if (!amount) return '-';
  return `KES ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function healthBadgeClass(health: string) {
  if (health === 'on_track') return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25';
  if (health === 'completed') return 'bg-blue-500/10 text-blue-700 border-blue-500/25';
  if (health === 'delayed' || health === 'watch') return 'bg-amber-500/10 text-amber-700 border-amber-500/25';
  return 'bg-destructive/10 text-destructive border-destructive/25';
}

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

function ProjectStatusCard({
  project,
  active,
  onSelect,
}: {
  project: Project;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md border p-3 text-left transition ${
        active ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted/60'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{project.name}</div>
          <div className="truncate text-xs text-muted-foreground">{project.funding_source || project.location || project.project_type}</div>
        </div>
        <Badge variant="outline" className={healthBadgeClass(project.health)}>
          {healthLabels[project.health]}
        </Badge>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatCurrency(project.budget_amount)}</span>
        <span>{project.open_issue_count ?? 0} open issues</span>
      </div>
    </button>
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

type UpdateForm = {
  projectId: string;
  percent: string;
  health: ProjectHealth;
  status: ProjectStatus;
  previous: string;
  current: string;
  risks: string;
  nextActions: string;
};

const emptyUpdateForm: UpdateForm = {
  projectId: '',
  percent: '',
  health: 'on_track',
  status: 'ongoing',
  previous: '',
  current: '',
  risks: '',
  nextActions: '',
};

export default function ProjectsDashboard() {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(String(today.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(String(today.getMonth() + 1));
  const [selectedReportId, setSelectedReportId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [updateForm, setUpdateForm] = useState<UpdateForm>(emptyUpdateForm);
  const [progressForm, setProgressForm] = useState({ title: '', completed: '', planned: '', unit: '', status: '' });
  const [newReportDate, setNewReportDate] = useState(today.toISOString().slice(0, 10));
  const [newProject, setNewProject] = useState({ name: '', project_code: '', funding_source: '', budget_amount: '', location: '' });
  const [fileForm, setFileForm] = useState({ title: '', description: '', category: 'other', visibility: 'internal' as ProjectVisibility });
  const [geoForm, setGeoForm] = useState({ title: '', description: '', fileType: 'kml', visibility: 'internal' as ProjectVisibility });
  const [fileInput, setFileInput] = useState<File | null>(null);
  const [geoInput, setGeoInput] = useState<File | null>(null);
  const [comment, setComment] = useState('');
  const [issueForm, setIssueForm] = useState({ title: '', description: '', severity: 'medium', due_date: '' });
  const [projectStatusForm, setProjectStatusForm] = useState({
    status: 'ongoing' as ProjectStatus,
    health: 'on_track' as ProjectHealth,
    target_completion_date: '',
    notes: '',
  });
  const [milestoneForm, setMilestoneForm] = useState({
    title: '',
    description: '',
    target_date: '',
    percent_complete: '',
    status: 'not_started',
  });
  const [siteVisitForm, setSiteVisitForm] = useState({
    visit_date: today.toISOString().slice(0, 10),
    location: '',
    purpose: '',
    observations: '',
    actions_required: '',
    attendees: '',
  });

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
  const rows = dashboard?.rows ?? [];

  const selectedProject = projects.find((project) => String(project.id) === selectedProjectId) ?? projects[0];
  const workspaceQuery = useProjectWorkspace(selectedProject?.id);
  const workspace = workspaceQuery.data;

  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const createReport = useCreateProjectReport();
  const createUpdate = useCreateProjectMonthlyUpdate();
  const updateMonthlyUpdate = useUpdateProjectMonthlyUpdate();
  const createProgressItem = useCreateProjectProgressItem();
  const uploadFile = useUploadProjectFile();
  const uploadGeoFile = useUploadProjectGeoFile();
  const createComment = useCreateProjectComment();
  const createIssue = useCreateProjectIssue();
  const createMilestone = useCreateProjectMilestone();
  const createSiteVisit = useCreateProjectSiteVisit();

  useEffect(() => {
    if (!selectedReportId && reports[0]) setSelectedReportId(String(reports[0].id));
  }, [reports, selectedReportId]);

  useEffect(() => {
    if (!selectedProjectId && projects[0]) setSelectedProjectId(String(projects[0].id));
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (!updateForm.projectId && selectedProject) {
      setUpdateForm((current) => ({ ...current, projectId: String(selectedProject.id) }));
    }
  }, [selectedProject, updateForm.projectId]);

  useEffect(() => {
    if (!selectedProject) return;
    setProjectStatusForm({
      status: selectedProject.status,
      health: selectedProject.health,
      target_completion_date: selectedProject.target_completion_date || '',
      notes: selectedProject.notes || '',
    });
  }, [selectedProject]);

  useEffect(() => {
    if (!updateForm.projectId || !rows.length) return;
    const row = rows.find((item) => String(item.project_id) === updateForm.projectId);
    if (!row) return;
    setUpdateForm({
      projectId: String(row.project_id),
      percent: row.overall_percent_complete?.toString() ?? '',
      health: row.health,
      status: 'ongoing',
      previous: row.status_previous || '',
      current: row.status_current || '',
      risks: row.key_risks || '',
      nextActions: row.next_actions || '',
    });
  }, [rows, updateForm.projectId]);

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

  const selectedUpdateRow = rows.find((row) => String(row.project_id) === updateForm.projectId);
  const projectsByStatus = statusOrder.map((status) => ({
    status,
    projects: projects.filter((project) => project.status === status),
  }));

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

  const handleCreateProject = async (event: FormEvent) => {
    event.preventDefault();
    if (!newProject.name.trim()) return;
    try {
      const project = await createProject.mutateAsync({
        ...newProject,
        budget_amount: newProject.budget_amount || null,
      });
      setSelectedProjectId(String(project.id));
      setNewProject({ name: '', project_code: '', funding_source: '', budget_amount: '', location: '' });
      toast({ title: 'Project created.' });
    } catch {
      toast({ title: 'Project could not be created.', variant: 'destructive' });
    }
  };

  const handleSaveUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeReportId || !updateForm.projectId) {
      toast({ title: 'Select a report and project first.' });
      return;
    }

    const payload = {
      report: activeReportId,
      project: Number(updateForm.projectId),
      overall_percent_complete: updateForm.percent || null,
      health: updateForm.health,
      project_status_snapshot: updateForm.status,
      previous_status_text: updateForm.previous,
      current_status_text: updateForm.current,
      key_risks: updateForm.risks,
      next_actions: updateForm.nextActions,
      include_in_management: true,
    };

    try {
      if (selectedUpdateRow?.update_id) {
        await updateMonthlyUpdate.mutateAsync({ id: selectedUpdateRow.update_id, data: payload });
        toast({ title: 'Monthly update saved.' });
      } else {
        await createUpdate.mutateAsync(payload);
        toast({ title: 'Monthly update created.' });
      }
    } catch {
      toast({ title: 'Monthly update could not be saved.', variant: 'destructive' });
    }
  };

  const handleAddProgress = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedUpdateRow?.update_id || !progressForm.title.trim()) {
      toast({ title: 'Save the monthly update before adding progress items.' });
      return;
    }

    try {
      await createProgressItem.mutateAsync({
        monthly_update: selectedUpdateRow.update_id,
        title: progressForm.title,
        completed_quantity: progressForm.completed || null,
        planned_quantity: progressForm.planned || null,
        unit: progressForm.unit,
        status_text: progressForm.status,
        visibility: 'management',
      });
      setProgressForm({ title: '', completed: '', planned: '', unit: '', status: '' });
      toast({ title: 'Progress item added.' });
    } catch {
      toast({ title: 'Progress item could not be added.', variant: 'destructive' });
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

  const handleUploadFile = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProject?.id || !fileInput || !fileForm.title.trim()) return;
    try {
      await uploadFile.mutateAsync({
        project: selectedProject.id,
        title: fileForm.title,
        file: fileInput,
        file_category: fileForm.category,
        visibility: fileForm.visibility,
        description: fileForm.description,
      });
      setFileInput(null);
      setFileForm({ title: '', description: '', category: 'other', visibility: 'internal' });
      toast({ title: 'Project file uploaded.' });
    } catch {
      toast({ title: 'File upload failed.', variant: 'destructive' });
    }
  };

  const handleUpdateProjectStatus = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProject?.id) return;
    try {
      await updateProject.mutateAsync({
        id: selectedProject.id,
        data: {
          status: projectStatusForm.status,
          health: projectStatusForm.health,
          target_completion_date: projectStatusForm.target_completion_date || null,
          notes: projectStatusForm.notes,
        },
      });
      toast({ title: 'Project status updated.' });
    } catch {
      toast({ title: 'Project status could not be updated.', variant: 'destructive' });
    }
  };

  const handleUploadGeoFile = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProject?.id || !geoInput || !geoForm.title.trim()) return;
    try {
      await uploadGeoFile.mutateAsync({
        project: selectedProject.id,
        title: geoForm.title,
        file: geoInput,
        file_type: geoForm.fileType,
        visibility: geoForm.visibility,
        description: geoForm.description,
      });
      setGeoInput(null);
      setGeoForm({ title: '', description: '', fileType: 'kml', visibility: 'internal' });
      toast({ title: 'Geo file uploaded.' });
    } catch {
      toast({ title: 'Geo file upload failed.', variant: 'destructive' });
    }
  };

  const handleAddComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProject?.id || !comment.trim()) return;
    try {
      await createComment.mutateAsync({ project: selectedProject.id, comment, visibility: 'internal' });
      setComment('');
      toast({ title: 'Project comment added.' });
    } catch {
      toast({ title: 'Comment could not be added.', variant: 'destructive' });
    }
  };

  const handleAddIssue = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProject?.id || !issueForm.title.trim()) return;
    try {
      await createIssue.mutateAsync({
        project: selectedProject.id,
        title: issueForm.title,
        description: issueForm.description,
        severity: issueForm.severity as 'low' | 'medium' | 'high' | 'critical',
        due_date: issueForm.due_date || null,
        visibility: 'internal',
      });
      setIssueForm({ title: '', description: '', severity: 'medium', due_date: '' });
      toast({ title: 'Project issue added.' });
    } catch {
      toast({ title: 'Issue could not be added.', variant: 'destructive' });
    }
  };

  const handleAddMilestone = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProject?.id || !milestoneForm.title.trim()) return;
    try {
      await createMilestone.mutateAsync({
        project: selectedProject.id,
        title: milestoneForm.title,
        description: milestoneForm.description,
        target_date: milestoneForm.target_date || null,
        percent_complete: milestoneForm.percent_complete || null,
        status: milestoneForm.status as 'not_started' | 'in_progress' | 'done' | 'missed',
        visibility: 'management',
      });
      setMilestoneForm({ title: '', description: '', target_date: '', percent_complete: '', status: 'not_started' });
      toast({ title: 'Milestone added.' });
    } catch {
      toast({ title: 'Milestone could not be added.', variant: 'destructive' });
    }
  };

  const handleAddSiteVisit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProject?.id || !siteVisitForm.visit_date) return;
    try {
      await createSiteVisit.mutateAsync({
        project: selectedProject.id,
        visit_date: siteVisitForm.visit_date,
        location: siteVisitForm.location,
        purpose: siteVisitForm.purpose,
        observations: siteVisitForm.observations,
        actions_required: siteVisitForm.actions_required,
        attendees: siteVisitForm.attendees,
        visibility: 'internal',
      });
      setSiteVisitForm({
        visit_date: today.toISOString().slice(0, 10),
        location: '',
        purpose: '',
        observations: '',
        actions_required: '',
        attendees: '',
      });
      toast({ title: 'Site visit recorded.' });
    } catch {
      toast({ title: 'Site visit could not be recorded.', variant: 'destructive' });
    }
  };

  if (projectsQuery.isLoading || reportsQuery.isLoading) {
    return (
      <div className="container flex min-h-[420px] items-center justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-surface">
      <div className="container space-y-6 py-6 md:py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Projects</h2>
            <p className="text-sm text-muted-foreground">
              Project reporting, KPI updates, internal files, KML/KMZ evidence, comments, and meeting PDFs.
            </p>
          </div>
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
            <Button variant="outline" size="icon" onClick={() => dashboardQuery.refetch()}>
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

          <TabsContent value="management" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Reported Projects" value={dashboard?.summary.projects ?? 0} icon={HardHat} />
              <StatCard
                label="Average Completion"
                value={`${toNumber(dashboard?.summary.average_completion).toFixed(1)}%`}
                icon={CheckCircle}
              />
              <StatCard label="Portfolio Budget" value={formatCurrency(dashboard?.summary.total_budget)} icon={Shield} />
              <StatCard label="Active Records" value={projects.length} icon={FileText} />
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
          </TabsContent>

          <TabsContent value="updates" className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
              <Card className="border-border/50 bg-card/80">
                <CardHeader>
                  <CardTitle className="text-base">Create Project</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateProject} className="space-y-3">
                    <Input placeholder="Project name" value={newProject.name} onChange={(event) => setNewProject({ ...newProject, name: event.target.value })} />
                    <Input placeholder="Project code" value={newProject.project_code} onChange={(event) => setNewProject({ ...newProject, project_code: event.target.value })} />
                    <Input placeholder="Funding source" value={newProject.funding_source} onChange={(event) => setNewProject({ ...newProject, funding_source: event.target.value })} />
                    <Input placeholder="Budget amount" value={newProject.budget_amount} onChange={(event) => setNewProject({ ...newProject, budget_amount: event.target.value })} />
                    <Input placeholder="Location" value={newProject.location} onChange={(event) => setNewProject({ ...newProject, location: event.target.value })} />
                    <Button type="submit" disabled={createProject.isPending} className="w-full gap-2">
                      <Plus className="h-4 w-4" />
                      Add Project
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card/80">
                <CardHeader>
                  <CardTitle className="text-base">Monthly Project Update</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSaveUpdate} className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="space-y-2 md:col-span-2">
                        <Label>Project</Label>
                        <Select value={updateForm.projectId} onValueChange={(value) => setUpdateForm({ ...emptyUpdateForm, projectId: value })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select project" />
                          </SelectTrigger>
                          <SelectContent>
                            {projects.map((project) => (
                              <SelectItem key={project.id} value={String(project.id)}>
                                {project.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Completion %</Label>
                        <Input value={updateForm.percent} onChange={(event) => setUpdateForm({ ...updateForm, percent: event.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Health</Label>
                        <Select value={updateForm.health} onValueChange={(value: ProjectHealth) => setUpdateForm({ ...updateForm, health: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(healthLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Previous Status</Label>
                        <Textarea rows={6} value={updateForm.previous} onChange={(event) => setUpdateForm({ ...updateForm, previous: event.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Current Status</Label>
                        <Textarea rows={6} value={updateForm.current} onChange={(event) => setUpdateForm({ ...updateForm, current: event.target.value })} />
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Textarea placeholder="Key risks" value={updateForm.risks} onChange={(event) => setUpdateForm({ ...updateForm, risks: event.target.value })} />
                      <Textarea placeholder="Next actions" value={updateForm.nextActions} onChange={(event) => setUpdateForm({ ...updateForm, nextActions: event.target.value })} />
                    </div>
                    <Button type="submit" disabled={!activeReportId || createUpdate.isPending || updateMonthlyUpdate.isPending} className="gap-2">
                      <Save className="h-4 w-4" />
                      Save Monthly Update
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/50 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base">Add Component Progress KPI</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddProgress} className="grid gap-3 md:grid-cols-[1.2fr_0.5fr_0.5fr_0.4fr_1fr_auto]">
                  <Input placeholder="KPI title, e.g. Pipe laying" value={progressForm.title} onChange={(event) => setProgressForm({ ...progressForm, title: event.target.value })} />
                  <Input placeholder="Done" value={progressForm.completed} onChange={(event) => setProgressForm({ ...progressForm, completed: event.target.value })} />
                  <Input placeholder="Target" value={progressForm.planned} onChange={(event) => setProgressForm({ ...progressForm, planned: event.target.value })} />
                  <Input placeholder="Unit" value={progressForm.unit} onChange={(event) => setProgressForm({ ...progressForm, unit: event.target.value })} />
                  <Input placeholder="Status note" value={progressForm.status} onChange={(event) => setProgressForm({ ...progressForm, status: event.target.value })} />
                  <Button type="submit" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="workspace" className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
              <Card className="border-border/50 bg-card/80">
                <CardHeader>
                  <CardTitle className="text-base">Projects by Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {projectsByStatus.map((group) => (
                    <section key={group.status} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          {statusLabels[group.status]}
                        </h3>
                        <Badge variant="secondary">{group.projects.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {group.projects.map((project) => (
                          <ProjectStatusCard
                            key={project.id}
                            project={project}
                            active={selectedProject?.id === project.id}
                            onSelect={() => setSelectedProjectId(String(project.id))}
                          />
                        ))}
                        {!group.projects.length ? (
                          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                            No projects
                          </div>
                        ) : null}
                      </div>
                    </section>
                  ))}
                </CardContent>
              </Card>

              <div className="space-y-4">
                {selectedProject ? (
                  <Card className="border-border/50 bg-card/80">
                    <CardContent className="pt-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-xl font-bold">{selectedProject.name}</h3>
                            <Badge variant="outline" className={healthBadgeClass(selectedProject.health)}>
                              {healthLabels[selectedProject.health]}
                            </Badge>
                            <Badge variant="secondary">{statusLabels[selectedProject.status]}</Badge>
                          </div>
                          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                            {selectedProject.description || selectedProject.funding_source || 'Project workspace record'}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                            <span><strong>Budget:</strong> {formatCurrency(selectedProject.budget_amount)}</span>
                            <span><strong>Location:</strong> {selectedProject.location || '-'}</span>
                            <span><strong>Target:</strong> {formatDate(selectedProject.target_completion_date)}</span>
                            <span><strong>Issues:</strong> {selectedProject.open_issue_count ?? 0} open</span>
                          </div>
                        </div>
                        <Button variant="outline" onClick={() => workspaceQuery.refetch()} className="gap-2">
                          <RefreshCw className="h-4 w-4" />
                          Refresh
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                {workspaceQuery.isError ? (
                  <Card className="border-amber-500/30 bg-amber-500/5">
                    <CardContent className="flex items-center gap-3 pt-5">
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                      <p className="text-sm text-muted-foreground">
                        Workspace access is restricted to the projects team. Management report data remains available in the Management tab.
                      </p>
                    </CardContent>
                  </Card>
                ) : null}

                {workspace ? (
                  <Tabs defaultValue="overview" className="space-y-4">
                    <TabsList className="h-auto flex-wrap gap-1 p-1">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="documents">Documents</TabsTrigger>
                      <TabsTrigger value="geo">KML/KMZ</TabsTrigger>
                      <TabsTrigger value="milestones">Milestones</TabsTrigger>
                      <TabsTrigger value="visits">Site Visits</TabsTrigger>
                      <TabsTrigger value="issues">Issues</TabsTrigger>
                      <TabsTrigger value="comments">Comments</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">
                      <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
                        <Card className="border-border/50 bg-card/80">
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                              <ClipboardCheck className="h-4 w-4" />
                              Engineering Project Controls
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid gap-2 md:grid-cols-2">
                              {projectControlAreas.map((area) => (
                                <div key={area} className="rounded-md border bg-background p-3 text-sm">
                                  {area}
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="border-border/50 bg-card/80">
                          <CardHeader>
                            <CardTitle className="text-base">Update Project Status</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <form onSubmit={handleUpdateProjectStatus} className="space-y-3">
                              <div className="grid gap-3 md:grid-cols-2">
                                <Select value={projectStatusForm.status} onValueChange={(value: ProjectStatus) => setProjectStatusForm({ ...projectStatusForm, status: value })}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(statusLabels).map(([value, label]) => (
                                      <SelectItem key={value} value={value}>{label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Select value={projectStatusForm.health} onValueChange={(value: ProjectHealth) => setProjectStatusForm({ ...projectStatusForm, health: value })}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(healthLabels).map(([value, label]) => (
                                      <SelectItem key={value} value={value}>{label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Input type="date" value={projectStatusForm.target_completion_date} onChange={(event) => setProjectStatusForm({ ...projectStatusForm, target_completion_date: event.target.value })} />
                              <Textarea placeholder="Internal project notes" value={projectStatusForm.notes} onChange={(event) => setProjectStatusForm({ ...projectStatusForm, notes: event.target.value })} />
                              <Button type="submit" disabled={updateProject.isPending} className="gap-2">
                                <Save className="h-4 w-4" />
                                Save Status
                              </Button>
                            </form>
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>

                    <TabsContent value="documents" className="space-y-4">
                      <Card className="border-border/50 bg-card/80">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base">
                            <File className="h-4 w-4" />
                            Documents, Drawings, BOQs, Contracts, Photos
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <form onSubmit={handleUploadFile} className="space-y-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              <Input placeholder="Title" value={fileForm.title} onChange={(event) => setFileForm({ ...fileForm, title: event.target.value })} />
                              <Input type="file" onChange={(event) => setFileInput(event.target.files?.[0] ?? null)} />
                            </div>
                            <div className="grid gap-3 md:grid-cols-3">
                              <Select value={fileForm.category} onValueChange={(value) => setFileForm({ ...fileForm, category: value })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="contract">Contract</SelectItem>
                                  <SelectItem value="drawing">Drawing</SelectItem>
                                  <SelectItem value="boq">BOQ</SelectItem>
                                  <SelectItem value="photo">Photo</SelectItem>
                                  <SelectItem value="inspection">Inspection</SelectItem>
                                  <SelectItem value="report">Report</SelectItem>
                                  <SelectItem value="correspondence">Correspondence</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <Select value={fileForm.visibility} onValueChange={(value: ProjectVisibility) => setFileForm({ ...fileForm, visibility: value })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="internal">Internal</SelectItem>
                                  <SelectItem value="management">Management</SelectItem>
                                  <SelectItem value="report">Report</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button type="submit" disabled={uploadFile.isPending} className="gap-2">
                                <Upload className="h-4 w-4" />
                                Upload
                              </Button>
                            </div>
                            <Textarea placeholder="Description" value={fileForm.description} onChange={(event) => setFileForm({ ...fileForm, description: event.target.value })} />
                          </form>
                          <div className="grid gap-2">
                            {workspace.files.map((item) => (
                              <div key={item.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                                <div>
                                  <div className="font-medium">{item.title}</div>
                                  <div className="text-xs text-muted-foreground">{item.file_category} - {item.visibility} - {formatDate(item.uploaded_at)}</div>
                                </div>
                                <a href={item.file} target="_blank" rel="noreferrer" className="text-primary">Open</a>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="geo" className="space-y-4">
                      <Card className="border-border/50 bg-card/80">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Map className="h-4 w-4" />
                            KML/KMZ and Geospatial Evidence
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <form onSubmit={handleUploadGeoFile} className="space-y-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              <Input placeholder="Title" value={geoForm.title} onChange={(event) => setGeoForm({ ...geoForm, title: event.target.value })} />
                              <Input type="file" accept=".kml,.kmz,.geojson,.zip" onChange={(event) => setGeoInput(event.target.files?.[0] ?? null)} />
                            </div>
                            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                              <Select value={geoForm.fileType} onValueChange={(value) => setGeoForm({ ...geoForm, fileType: value })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="kml">KML</SelectItem>
                                  <SelectItem value="kmz">KMZ</SelectItem>
                                  <SelectItem value="geojson">GeoJSON</SelectItem>
                                  <SelectItem value="shapefile">Shapefile</SelectItem>
                                </SelectContent>
                              </Select>
                              <Select value={geoForm.visibility} onValueChange={(value: ProjectVisibility) => setGeoForm({ ...geoForm, visibility: value })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="internal">Internal</SelectItem>
                                  <SelectItem value="management">Management</SelectItem>
                                  <SelectItem value="report">Report</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button type="submit" disabled={uploadGeoFile.isPending} className="gap-2">
                                <Upload className="h-4 w-4" />
                                Upload
                              </Button>
                            </div>
                            <Textarea placeholder="Description" value={geoForm.description} onChange={(event) => setGeoForm({ ...geoForm, description: event.target.value })} />
                          </form>
                          <div className="grid gap-2">
                            {workspace.geo_files.map((item) => (
                              <div key={item.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                                <div>
                                  <div className="font-medium">{item.title}</div>
                                  <div className="text-xs text-muted-foreground">{item.file_type.toUpperCase()} - {item.visibility}</div>
                                </div>
                                <a href={item.file} target="_blank" rel="noreferrer" className="text-primary">Open</a>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="milestones" className="space-y-4">
                      <Card className="border-border/50 bg-card/80">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base">
                            <CalendarDays className="h-4 w-4" />
                            Schedule Milestones
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <form onSubmit={handleAddMilestone} className="grid gap-3 lg:grid-cols-[1fr_1fr_150px_130px_130px_auto]">
                            <Input placeholder="Milestone title" value={milestoneForm.title} onChange={(event) => setMilestoneForm({ ...milestoneForm, title: event.target.value })} />
                            <Input placeholder="Description" value={milestoneForm.description} onChange={(event) => setMilestoneForm({ ...milestoneForm, description: event.target.value })} />
                            <Input type="date" value={milestoneForm.target_date} onChange={(event) => setMilestoneForm({ ...milestoneForm, target_date: event.target.value })} />
                            <Input placeholder="% done" value={milestoneForm.percent_complete} onChange={(event) => setMilestoneForm({ ...milestoneForm, percent_complete: event.target.value })} />
                            <Select value={milestoneForm.status} onValueChange={(value) => setMilestoneForm({ ...milestoneForm, status: value })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="not_started">Not Started</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="done">Done</SelectItem>
                                <SelectItem value="missed">Missed</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button type="submit" disabled={createMilestone.isPending}>Add</Button>
                          </form>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Milestone</TableHead>
                                <TableHead>Target</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Progress</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {workspace.milestones.map((item) => (
                                <TableRow key={item.id}>
                                  <TableCell>
                                    <div className="font-medium">{item.title}</div>
                                    <div className="text-xs text-muted-foreground">{item.description}</div>
                                  </TableCell>
                                  <TableCell>{formatDate(item.target_date)}</TableCell>
                                  <TableCell><Badge variant="outline">{item.status}</Badge></TableCell>
                                  <TableCell className="w-[180px]">
                                    <Progress value={toNumber(item.percent_complete)} className="h-2" />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="visits" className="space-y-4">
                      <Card className="border-border/50 bg-card/80">
                        <CardHeader>
                          <CardTitle className="text-base">Site Visits and Inspection Notes</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <form onSubmit={handleAddSiteVisit} className="space-y-3">
                            <div className="grid gap-3 md:grid-cols-3">
                              <Input type="date" value={siteVisitForm.visit_date} onChange={(event) => setSiteVisitForm({ ...siteVisitForm, visit_date: event.target.value })} />
                              <Input placeholder="Location" value={siteVisitForm.location} onChange={(event) => setSiteVisitForm({ ...siteVisitForm, location: event.target.value })} />
                              <Input placeholder="Purpose" value={siteVisitForm.purpose} onChange={(event) => setSiteVisitForm({ ...siteVisitForm, purpose: event.target.value })} />
                            </div>
                            <Textarea placeholder="Observations" value={siteVisitForm.observations} onChange={(event) => setSiteVisitForm({ ...siteVisitForm, observations: event.target.value })} />
                            <Textarea placeholder="Actions required" value={siteVisitForm.actions_required} onChange={(event) => setSiteVisitForm({ ...siteVisitForm, actions_required: event.target.value })} />
                            <Input placeholder="Attendees" value={siteVisitForm.attendees} onChange={(event) => setSiteVisitForm({ ...siteVisitForm, attendees: event.target.value })} />
                            <Button type="submit" disabled={createSiteVisit.isPending} className="gap-2">
                              <Plus className="h-4 w-4" />
                              Record Visit
                            </Button>
                          </form>
                          <div className="grid gap-2">
                            {workspace.site_visits.map((item) => (
                              <div key={item.id} className="rounded-md border p-3 text-sm">
                                <div className="font-medium">{formatDate(item.visit_date)} - {item.location || 'Site visit'}</div>
                                <div className="text-xs text-muted-foreground">{item.purpose}</div>
                                <p className="mt-2">{item.observations}</p>
                                {item.actions_required ? <p className="mt-1 text-muted-foreground">Actions: {item.actions_required}</p> : null}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="issues" className="space-y-4">
                      <Card className="border-border/50 bg-card/80">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base">
                            <AlertCircle className="h-4 w-4" />
                            Risks, Issues, and Action Items
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <form onSubmit={handleAddIssue} className="space-y-3">
                            <Input placeholder="Issue title" value={issueForm.title} onChange={(event) => setIssueForm({ ...issueForm, title: event.target.value })} />
                            <Textarea placeholder="Description" value={issueForm.description} onChange={(event) => setIssueForm({ ...issueForm, description: event.target.value })} />
                            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                              <Select value={issueForm.severity} onValueChange={(value) => setIssueForm({ ...issueForm, severity: value })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="low">Low</SelectItem>
                                  <SelectItem value="medium">Medium</SelectItem>
                                  <SelectItem value="high">High</SelectItem>
                                  <SelectItem value="critical">Critical</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input type="date" value={issueForm.due_date} onChange={(event) => setIssueForm({ ...issueForm, due_date: event.target.value })} />
                              <Button type="submit" disabled={createIssue.isPending}>Add Issue</Button>
                            </div>
                          </form>
                          {workspace.issues.map((item) => (
                            <div key={item.id} className="rounded-md border p-3 text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-medium">{item.title}</div>
                                <div className="flex gap-2">
                                  <Badge variant="outline">{item.severity}</Badge>
                                  <Badge variant="secondary">{item.status}</Badge>
                                </div>
                              </div>
                              <p className="mt-1 text-muted-foreground">{item.description}</p>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="comments" className="space-y-4">
                      <Card className="border-border/50 bg-card/80">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base">
                            <MessageSquare className="h-4 w-4" />
                            Internal Comments
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <form onSubmit={handleAddComment} className="space-y-3">
                            <Textarea placeholder="Add internal project note" value={comment} onChange={(event) => setComment(event.target.value)} />
                            <Button type="submit" disabled={createComment.isPending} className="gap-2">
                              <Plus className="h-4 w-4" />
                              Add Comment
                            </Button>
                          </form>
                          {workspace.comments.map((item) => (
                            <div key={item.id} className="rounded-md border p-3 text-sm">
                              <div className="text-xs text-muted-foreground">{item.created_by_name || 'User'} - {formatDate(item.created_at)}</div>
                              <p className="mt-1">{item.comment}</p>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                ) : null}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
