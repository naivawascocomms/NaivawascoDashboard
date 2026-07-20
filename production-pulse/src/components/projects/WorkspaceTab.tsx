import { FormEvent, useEffect, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  ClipboardCheck,
  File,
  Map,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  Upload,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  useCreateProjectComment,
  useCreateProjectIssue,
  useCreateProjectMilestone,
  useCreateProjectSiteVisit,
  useProjectWorkspace,
  useUpdateProject,
  useUploadProjectFile,
  useUploadProjectGeoFile,
} from '@/hooks/useProjects';
import type { Project, ProjectHealth, ProjectStatus, ProjectVisibility } from '@/types/projects';
import { formatCurrency, formatDate, healthBadgeClass, healthLabels, statusLabels, statusOrder, toNumber } from './shared';

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

interface WorkspaceTabProps {
  projects: Project[];
  selectedProject: Project | undefined;
  onSelectProject: (projectId: string) => void;
}

export function WorkspaceTab({ projects, selectedProject, onSelectProject }: WorkspaceTabProps) {
  const today = new Date();
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

  const workspaceQuery = useProjectWorkspace(selectedProject?.id);
  const workspace = workspaceQuery.data;

  const updateProject = useUpdateProject();
  const uploadFile = useUploadProjectFile();
  const uploadGeoFile = useUploadProjectGeoFile();
  const createComment = useCreateProjectComment();
  const createIssue = useCreateProjectIssue();
  const createMilestone = useCreateProjectMilestone();
  const createSiteVisit = useCreateProjectSiteVisit();

  useEffect(() => {
    if (!selectedProject) return;
    setProjectStatusForm({
      status: selectedProject.status,
      health: selectedProject.health,
      target_completion_date: selectedProject.target_completion_date || '',
      notes: selectedProject.notes || '',
    });
  }, [selectedProject]);

  const projectsByStatus = statusOrder.map((status) => ({
    status,
    projects: projects.filter((project) => project.status === status),
  }));

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

  return (
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
                    onSelect={() => onSelectProject(String(project.id))}
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
  );
}
