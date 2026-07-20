import { FormEvent, useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  useCreateProject,
  useCreateProjectMonthlyUpdate,
  useCreateProjectProgressItem,
  useUpdateProjectMonthlyUpdate,
} from '@/hooks/useProjects';
import type { Project, ProjectDashboardRow, ProjectHealth, ProjectStatus } from '@/types/projects';
import { healthLabels } from './shared';

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

interface UpdatesTabProps {
  projects: Project[];
  rows: ProjectDashboardRow[];
  activeReportId: number | undefined;
  defaultProjectId?: string;
  onProjectCreated: (projectId: string) => void;
}

export function UpdatesTab({
  projects,
  rows,
  activeReportId,
  defaultProjectId,
  onProjectCreated,
}: UpdatesTabProps) {
  const [updateForm, setUpdateForm] = useState<UpdateForm>(emptyUpdateForm);
  const [progressForm, setProgressForm] = useState({ title: '', completed: '', planned: '', unit: '', status: '' });
  const [newProject, setNewProject] = useState({ name: '', project_code: '', funding_source: '', budget_amount: '', location: '' });

  const createProject = useCreateProject();
  const createUpdate = useCreateProjectMonthlyUpdate();
  const updateMonthlyUpdate = useUpdateProjectMonthlyUpdate();
  const createProgressItem = useCreateProjectProgressItem();

  useEffect(() => {
    if (!updateForm.projectId && defaultProjectId) {
      setUpdateForm((current) => ({ ...current, projectId: defaultProjectId }));
    }
  }, [defaultProjectId, updateForm.projectId]);

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

  const selectedUpdateRow = rows.find((row) => String(row.project_id) === updateForm.projectId);

  const handleCreateProject = async (event: FormEvent) => {
    event.preventDefault();
    if (!newProject.name.trim()) return;
    try {
      const project = await createProject.mutateAsync({
        ...newProject,
        budget_amount: newProject.budget_amount || null,
      });
      onProjectCreated(String(project.id));
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

  return (
    <div className="space-y-6">
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
    </div>
  );
}
