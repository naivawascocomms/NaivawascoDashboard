import { FormEvent, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronsUpDown,
  Clock,
  Factory,
  GitBranch,
  Loader2,
  MapPin,
  MessageSquare,
  Plus,
  Search,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useZones } from '@/hooks/useDistribution';
import { useProductionSites } from '@/hooks/useProduction';
import {
  useAddIncidentComment,
  useCreateIncident,
  useCurrentIncidentUser,
  useIncidents,
  useIncidentSummary,
  useIncidentUsers,
  useUpdateIncidentStatus,
} from '@/hooks/useIncidents';
import { cn } from '@/lib/utils';
import type { Incident, IncidentPriority, IncidentStatus, IncidentType } from '@/types/incident';
import { incidentCategories } from '@/types/incident';

type FilterValue<T extends string> = T | 'all';

type IncidentForm = {
  type: IncidentType;
  category: string;
  description: string;
  location: string;
  priority: IncidentPriority;
  assigned_to_user: string;
  linked_asset: string;
  estimated_impact_m3: string;
};

const initialForm: IncidentForm = {
  type: 'distribution',
  category: '',
  description: '',
  location: '',
  priority: 'medium',
  assigned_to_user: 'none',
  linked_asset: 'none',
  estimated_impact_m3: '',
};

const statusLabels: Record<IncidentStatus, string> = {
  open: 'Open',
  'in-progress': 'In Progress',
  resolved: 'Resolved',
};

const priorityLabels: Record<IncidentPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function statusIcon(status: IncidentStatus) {
  if (status === 'resolved') return <CheckCircle className="h-4 w-4 text-success" />;
  if (status === 'in-progress') return <Clock className="h-4 w-4 text-warning" />;
  return <AlertCircle className="h-4 w-4 text-destructive" />;
}

function priorityClass(priority: IncidentPriority) {
  if (priority === 'critical') return 'bg-destructive text-destructive-foreground';
  if (priority === 'high') return 'bg-warning text-warning-foreground';
  if (priority === 'medium') return 'bg-accent text-accent-foreground';
  return 'bg-muted text-muted-foreground';
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'critical' | 'warning' | 'success';
}) {
  const toneClass =
    tone === 'critical'
      ? 'text-destructive'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'success'
          ? 'text-success'
          : 'text-foreground';

  return (
    <Card className="bg-card/70 border-border/50">
      <CardContent className="pt-4">
        <div className={`text-2xl font-bold mono-value ${toneClass}`}>{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

export default function IncidentReporting() {
  const [showForm, setShowForm] = useState(false);
  const [typeFilter, setTypeFilter] = useState<FilterValue<IncidentType>>('all');
  const [statusFilter, setStatusFilter] = useState<FilterValue<IncidentStatus>>('all');
  const [priorityFilter, setPriorityFilter] = useState<FilterValue<IncidentPriority>>('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<IncidentForm>(initialForm);
  const [commentIncidentId, setCommentIncidentId] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState('');

  const listParams = useMemo(
    () => ({
      ...(typeFilter !== 'all' ? { incident_type: typeFilter } : {}),
      ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      ...(priorityFilter !== 'all' ? { priority: priorityFilter } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      ordering: '-reported_at',
    }),
    [priorityFilter, search, statusFilter, typeFilter],
  );

  const incidentsQuery = useIncidents(listParams);
  const summaryQuery = useIncidentSummary(listParams);
  const zonesQuery = useZones({ is_active: true });
  const sitesQuery = useProductionSites({ is_active: true });
  const usersQuery = useIncidentUsers(assigneeSearch.trim() ? { search: assigneeSearch.trim() } : undefined);
  const currentUserQuery = useCurrentIncidentUser();
  const createIncident = useCreateIncident();
  const updateStatus = useUpdateIncidentStatus();
  const addComment = useAddIncidentComment();

  const incidents = incidentsQuery.data?.results ?? [];
  const summary = summaryQuery.data ?? {
    total: 0,
    open: 0,
    in_progress: 0,
    resolved: 0,
    critical_open: 0,
    overdue: 0,
    production: 0,
    distribution: 0,
  };

  const linkedOptions = form.type === 'distribution'
    ? (zonesQuery.data?.results ?? []).map((zone) => ({
        value: String(zone.id),
        label: `${zone.name} - ${zone.region_name}`,
      }))
    : (sitesQuery.data?.results ?? []).map((site) => ({
        value: String(site.id),
        label: site.name,
      }));

  const users = usersQuery.data?.results ?? [];
  const selectedAssignee = users.find((user) => String(user.id) === form.assigned_to_user);
  const reporterLabel = currentUserQuery.data?.display_name || currentUserQuery.data?.username || 'Current user';

  const resetForm = () => setForm(initialForm);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.category || !form.description || !form.location) {
      toast({ title: 'Complete the incident details before submitting.' });
      return;
    }

    const linkedId = form.linked_asset !== 'none' ? Number(form.linked_asset) : null;
    const assigneeId = form.assigned_to_user !== 'none' ? Number(form.assigned_to_user) : null;

    try {
      await createIncident.mutateAsync({
        type: form.type,
        category: form.category,
        description: form.description,
        location: form.location,
        priority: form.priority,
        assigned_to_user: assigneeId,
        production_site: form.type === 'production' ? linkedId : null,
        zone: form.type === 'distribution' ? linkedId : null,
        estimated_impact_m3: form.estimated_impact_m3 || null,
      });
      toast({ title: 'Incident reported.' });
      resetForm();
      setShowForm(false);
    } catch {
      toast({ title: 'Incident could not be saved.', variant: 'destructive' });
    }
  };

  const handleStatusChange = async (incident: Incident, status: IncidentStatus) => {
    if (incident.status === status) return;

    try {
      await updateStatus.mutateAsync({
        id: incident.id,
        status,
        comment: `Status changed to ${statusLabels[status]}.`,
      });
      toast({ title: 'Incident status updated.' });
    } catch {
      toast({ title: 'Status update failed.', variant: 'destructive' });
    }
  };

  const handleCommentSubmit = async (incidentId: number) => {
    const comment = commentDraft.trim();
    if (!comment) return;

    try {
      await addComment.mutateAsync({ id: incidentId, comment });
      setCommentDraft('');
      setCommentIncidentId(null);
      toast({ title: 'Incident update added.' });
    } catch {
      toast({ title: 'Update could not be added.', variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-surface">
      <div className="container py-6 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Incidents</h1>
          </div>
          <Button onClick={() => setShowForm((value) => !value)} className="gap-2 self-start md:self-auto">
            <Plus className="h-4 w-4" />
            Report Incident
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <StatTile label="Total" value={summary.total} />
          <StatTile label="Open" value={summary.open} tone="critical" />
          <StatTile label="In Progress" value={summary.in_progress} tone="warning" />
          <StatTile label="Resolved" value={summary.resolved} tone="success" />
          <StatTile label="Critical Open" value={summary.critical_open} tone="critical" />
          <StatTile label="Overdue" value={summary.overdue} tone="warning" />
        </div>

        {showForm && (
          <Card className="bg-card/80 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                New Incident
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={form.type}
                    onValueChange={(value: IncidentType) =>
                      setForm({ ...form, type: value, category: '', linked_asset: 'none' })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="distribution">Distribution</SelectItem>
                      <SelectItem value="production">Production</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(value) => setForm({ ...form, category: value })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {incidentCategories[form.type].map((category) => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{form.type === 'distribution' ? 'Zone' : 'Production Site'}</Label>
                  <Select
                    value={form.linked_asset}
                    onValueChange={(value) => setForm({ ...form, linked_asset: value })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not linked</SelectItem>
                      {linkedOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select
                    value={form.priority}
                    onValueChange={(value: IncidentPriority) => setForm({ ...form, priority: value })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input
                    value={form.location}
                    onChange={(event) => setForm({ ...form, location: event.target.value })}
                    placeholder="Main line, plant, estate, road"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Reported By</Label>
                  <Input
                    value={reporterLabel}
                    disabled
                    className="bg-muted/50"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Assigned To</Label>
                  <Popover open={assigneeOpen} onOpenChange={setAssigneeOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={assigneeOpen}
                        className="w-full justify-between"
                      >
                        <span className="truncate">
                          {selectedAssignee
                            ? selectedAssignee.display_name
                            : form.assigned_to_user === 'none'
                              ? 'Unassigned'
                              : 'Select user'}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          value={assigneeSearch}
                          onValueChange={setAssigneeSearch}
                          placeholder="Search users"
                        />
                        <CommandList>
                          <CommandEmpty>No users found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="none"
                              onSelect={() => {
                                setForm({ ...form, assigned_to_user: 'none' });
                                setAssigneeOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  form.assigned_to_user === 'none' ? 'opacity-100' : 'opacity-0',
                                )}
                              />
                              Unassigned
                            </CommandItem>
                            {users.map((user) => (
                              <CommandItem
                                key={user.id}
                                value={`${user.display_name} ${user.username} ${user.email}`}
                                onSelect={() => {
                                  setForm({ ...form, assigned_to_user: String(user.id) });
                                  setAssigneeOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    form.assigned_to_user === String(user.id) ? 'opacity-100' : 'opacity-0',
                                  )}
                                />
                                <div className="min-w-0">
                                  <div className="truncate">{user.display_name}</div>
                                  <div className="truncate text-xs text-muted-foreground">{user.username}</div>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Estimated Impact m3</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.estimated_impact_m3}
                    onChange={(event) => setForm({ ...form, estimated_impact_m3: event.target.value })}
                    placeholder="Optional"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Description</Label>
                  <Textarea
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                    placeholder="What happened, impact observed, and immediate action taken"
                  />
                </div>

                <div className="md:col-span-2 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      resetForm();
                      setShowForm(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createIncident.isPending}>
                    {createIncident.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/50 bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <SlidersHorizontal className="h-4 w-4" />
              <span className="text-sm">Filters:</span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="w-[220px] pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search incidents"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Select value={typeFilter} onValueChange={(value: FilterValue<IncidentType>) => setTypeFilter(value)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="distribution">Distribution</SelectItem>
                <SelectItem value="production">Production</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(value: FilterValue<IncidentStatus>) => setStatusFilter(value)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={(value: FilterValue<IncidentPriority>) => setPriorityFilter(value)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="bg-card/80 border-border/50">
          <CardHeader>
            <CardTitle>Incident Register</CardTitle>
          </CardHeader>
          <CardContent>
            {incidentsQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : incidents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No incidents match the current filters.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Incident</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Reported</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Updates</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incidents.map((incident) => (
                    <TableRow key={incident.id}>
                      <TableCell className="min-w-[260px]">
                        <div className="flex items-start gap-3">
                          {statusIcon(incident.status)}
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{incident.category}</span>
                              <Badge variant="outline" className="gap-1">
                                {incident.type === 'production' ? (
                                  <Factory className="h-3 w-3" />
                                ) : (
                                  <GitBranch className="h-3 w-3" />
                                )}
                                {incident.type}
                              </Badge>
                              <Badge className={priorityClass(incident.priority)}>
                                {priorityLabels[incident.priority]}
                              </Badge>
                            </div>
                            <p className="max-w-xl text-sm text-muted-foreground">{incident.description}</p>
                            {(incident.zone_name || incident.production_site_name) && (
                              <p className="text-xs text-muted-foreground">
                                {incident.zone_name || incident.production_site_name}
                                {incident.zone_region_name ? ` - ${incident.zone_region_name}` : ''}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          {incident.location}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{formatDateTime(incident.reported_at)}</div>
                        <div className="text-xs text-muted-foreground">{incident.reported_by}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                          {incident.assigned_to || 'Unassigned'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={incident.status}
                          onValueChange={(value: IncidentStatus) => handleStatusChange(incident, value)}
                          disabled={updateStatus.isPending}
                        >
                          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in-progress">In Progress</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="min-w-[220px] text-right">
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            onClick={() => {
                              setCommentIncidentId(commentIncidentId === incident.id ? null : incident.id);
                              setCommentDraft('');
                            }}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            {incident.comment_count}
                          </Button>
                        </div>
                        {commentIncidentId === incident.id && (
                          <div className="mt-3 space-y-2 text-left">
                            {incident.comments.slice(0, 2).map((comment) => (
                              <div key={comment.id} className="rounded-md bg-muted/40 p-2 text-xs">
                                <div>{comment.comment}</div>
                                <div className="mt-1 text-muted-foreground">
                                  {comment.created_by_name || 'System'} - {formatDateTime(comment.created_at)}
                                </div>
                              </div>
                            ))}
                            <Textarea
                              value={commentDraft}
                              onChange={(event) => setCommentDraft(event.target.value)}
                              placeholder="Add update"
                              className="min-h-20"
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setCommentIncidentId(null);
                                  setCommentDraft('');
                                }}
                              >
                                Close
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleCommentSubmit(incident.id)}
                                disabled={addComment.isPending || !commentDraft.trim()}
                              >
                                Add
                              </Button>
                            </div>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
