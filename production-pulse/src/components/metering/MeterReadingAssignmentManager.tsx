import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, Plus, Power, PowerOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useZones } from '@/hooks/useDistribution';
import {
  useCreateMeterReadingAssignment,
  useDistributionWaterAssignments,
  useMeterReadingAssignments,
  useProductionEnergyAssignments,
  useProductionWaterAssignments,
  useUpdateMeterReadingAssignment,
  useUserProfiles,
} from '@/hooks/useMetering';
import { useProductionSites } from '@/hooks/useProduction';
import { toast } from '@/hooks/use-toast';
import type { MeterReadingAssignment, UserProfile } from '@/types/api';

type ScopeType = 'PRODUCTION_SITE' | 'ZONE';
type MeterKind = 'WATER' | 'ENERGY';

type MeterOption = {
  value: string;
  kind: MeterKind;
  meterId: number;
  label: string;
  context: string;
};

type ScopeOption = {
  value: ScopeType;
  label: string;
};

const ASSIGNMENT_ORDERING = 'assignee__username,scope_type,production_site__name,zone__name';

function formatAssignee(profile: UserProfile) {
  return `${profile.user.full_name} (${profile.role.replaceAll('_', ' ')})`;
}

function assignmentArea(assignment: MeterReadingAssignment) {
  return assignment.scope_type === 'PRODUCTION_SITE'
    ? assignment.production_site_name || 'Production site'
    : assignment.zone_name || 'Zone';
}

function assignmentMeter(assignment: MeterReadingAssignment) {
  return assignment.water_meter_label || assignment.energy_meter_label || 'Meter';
}

export function MeterReadingAssignmentManager({
  profile,
  selectedDate,
}: {
  profile: UserProfile | undefined;
  selectedDate: string;
}) {
  const isAdmin = Boolean(profile?.user.is_staff || profile?.user.is_superuser);
  const scopeOptions = useMemo<ScopeOption[]>(() => {
    if (!profile?.can_assign_readings) {
      return [];
    }

    if (isAdmin) {
      return [
        { value: 'PRODUCTION_SITE', label: 'Production Site' },
        { value: 'ZONE', label: 'Distribution Zone' },
      ];
    }

    if (profile.role === 'PRODUCTION_SUPERVISOR') {
      return [{ value: 'PRODUCTION_SITE', label: 'Production Site' }];
    }

    if (profile.role === 'ZONAL_OFFICER') {
      return [{ value: 'ZONE', label: 'Distribution Zone' }];
    }

    return [];
  }, [isAdmin, profile]);

  const canManageAssignments = scopeOptions.length > 0;
  const [scopeType, setScopeType] = useState<ScopeType>('PRODUCTION_SITE');
  const [assigneeId, setAssigneeId] = useState('');
  const [productionSiteId, setProductionSiteId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [meterOptionValue, setMeterOptionValue] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    if (scopeOptions.length > 0 && !scopeOptions.some((option) => option.value === scopeType)) {
      setScopeType(scopeOptions[0].value);
      setProductionSiteId('');
      setZoneId('');
      setMeterOptionValue('');
    }
  }, [scopeOptions, scopeType]);

  useEffect(() => {
    setMeterOptionValue('');
  }, [productionSiteId, zoneId, scopeType]);

  const selectedProductionSiteId = productionSiteId ? Number(productionSiteId) : undefined;
  const selectedZoneId = zoneId ? Number(zoneId) : undefined;

  const { data: userProfilesData, isLoading: usersLoading } = useUserProfiles(
    { user__is_active: true, ordering: 'user__username' },
    { enabled: canManageAssignments },
  );
  const { data: sitesData } = useProductionSites({ is_active: true });
  const { data: zonesData } = useZones({ is_active: true });
  const { data: productionWaterAssignments, isLoading: productionWaterLoading } = useProductionWaterAssignments(
    { production_site: selectedProductionSiteId, is_active: true },
    { enabled: canManageAssignments && scopeType === 'PRODUCTION_SITE' && !!selectedProductionSiteId },
  );
  const { data: productionEnergyAssignments, isLoading: productionEnergyLoading } = useProductionEnergyAssignments(
    { production_site: selectedProductionSiteId, is_active: true },
    { enabled: canManageAssignments && scopeType === 'PRODUCTION_SITE' && !!selectedProductionSiteId },
  );
  const { data: distributionWaterAssignments, isLoading: distributionWaterLoading } = useDistributionWaterAssignments(
    { zone: selectedZoneId, is_active: true },
    { enabled: canManageAssignments && scopeType === 'ZONE' && !!selectedZoneId },
  );
  const {
    data: assignmentsData,
    isLoading: assignmentsLoading,
  } = useMeterReadingAssignments(
    { ordering: ASSIGNMENT_ORDERING, page_size: 500, reading_date: selectedDate },
    { enabled: canManageAssignments },
  );

  const createAssignment = useCreateMeterReadingAssignment();
  const updateAssignment = useUpdateMeterReadingAssignment();

  const assigneeProfiles = useMemo(
    () =>
      (userProfilesData?.results || []).filter(
        (userProfile) => userProfile.can_receive_reading_assignments && userProfile.user.is_active,
      ),
    [userProfilesData],
  );

  const meterOptions = useMemo(() => {
    const options = new Map<string, MeterOption>();

    if (scopeType === 'PRODUCTION_SITE') {
      (productionWaterAssignments?.results || []).forEach((assignment) => {
        const value = `WATER:${assignment.water_meter}`;
        if (!options.has(value)) {
          options.set(value, {
            value,
            kind: 'WATER',
            meterId: assignment.water_meter,
            label: assignment.meter_label,
            context: assignment.assignment_role.replaceAll('_', ' '),
          });
        }
      });

      (productionEnergyAssignments?.results || []).forEach((assignment) => {
        const value = `ENERGY:${assignment.energy_meter}`;
        if (!options.has(value)) {
          options.set(value, {
            value,
            kind: 'ENERGY',
            meterId: assignment.energy_meter,
            label: assignment.meter_label,
            context: assignment.assignment_role.replaceAll('_', ' '),
          });
        }
      });
    } else {
      (distributionWaterAssignments?.results || []).forEach((assignment) => {
        const value = `WATER:${assignment.water_meter}`;
        if (!options.has(value)) {
          options.set(value, {
            value,
            kind: 'WATER',
            meterId: assignment.water_meter,
            label: assignment.meter_label,
            context: assignment.assignment_role.replaceAll('_', ' '),
          });
        }
      });
    }

    return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [distributionWaterAssignments, productionEnergyAssignments, productionWaterAssignments, scopeType]);

  const mappedMetersLoading = productionWaterLoading || productionEnergyLoading || distributionWaterLoading;
  const selectedMeter = meterOptions.find((option) => option.value === meterOptionValue);
  const metersToAssign = selectedMeter ? [selectedMeter] : meterOptions;
  const allExistingAssignments = assignmentsData?.results || [];
  const openAssignments = allExistingAssignments.filter(
    (assignment) => assignment.reading_status === 'NOT_SUBMITTED' || assignment.reading_status === 'SUBMITTED',
  );
  const visibleAssignments = showInactive
    ? openAssignments
    : openAssignments.filter((assignment) => assignment.is_active);

  const resetForm = () => {
    setMeterOptionValue('');
    setNotes('');
    setStartDate('');
    setEndDate('');
  };

  const findExistingAssignment = (meter: MeterOption) => {
    return allExistingAssignments.find((assignment) => {
      const sameAssignee = assignment.assignee.id.toString() === assigneeId;
      const sameScope = assignment.scope_type === scopeType;
      const sameArea =
        scopeType === 'PRODUCTION_SITE'
          ? assignment.production_site === selectedProductionSiteId
          : assignment.zone === selectedZoneId;
      const sameMeter =
        meter.kind === 'WATER'
          ? assignment.water_meter === meter.meterId
          : assignment.energy_meter === meter.meterId;

      return sameAssignee && sameScope && sameArea && sameMeter;
    });
  };

  const handleCreateAssignment = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!assigneeId || metersToAssign.length === 0 || !startDate || !endDate) {
      toast({
        title: 'Missing assignment details',
        description: 'Choose a user, date range, and a site or zone with mapped meters before saving the assignment.',
        variant: 'destructive',
      });
      return;
    }

    if (scopeType === 'PRODUCTION_SITE' && !selectedProductionSiteId) {
      return;
    }

    if (scopeType === 'ZONE' && !selectedZoneId) {
      return;
    }

    try {
      let createdCount = 0;
      let reactivatedCount = 0;
      let unchangedCount = 0;

      for (const meter of metersToAssign) {
        const existingAssignment = findExistingAssignment(meter);

        if (existingAssignment?.is_active) {
          unchangedCount += 1;
          continue;
        }

        if (existingAssignment) {
          await updateAssignment.mutateAsync({
            id: existingAssignment.id,
            is_active: true,
            start_date: startDate || null,
            end_date: endDate || null,
            notes,
          });
          reactivatedCount += 1;
          continue;
        }

        await createAssignment.mutateAsync({
            assignee_id: Number(assigneeId),
            scope_type: scopeType,
            production_site: scopeType === 'PRODUCTION_SITE' ? selectedProductionSiteId : null,
            zone: scopeType === 'ZONE' ? selectedZoneId : null,
            water_meter: meter.kind === 'WATER' ? meter.meterId : null,
            energy_meter: meter.kind === 'ENERGY' ? meter.meterId : null,
            start_date: startDate || null,
            end_date: endDate || null,
            notes,
            is_active: true,
        });
        createdCount += 1;
      }

      toast({
        title: selectedMeter ? 'Meter reading assignment saved' : 'Meter reading assignments saved',
        description: selectedMeter
          ? `${selectedMeter.label} is now assigned for data entry.`
          : `${createdCount} created, ${reactivatedCount} reactivated, ${unchangedCount} already active.`,
      });
      resetForm();
    } catch {
      toast({
        title: 'Assignment failed',
        description: 'Review the user, scope and meter mapping, then try again.',
        variant: 'destructive',
      });
    }
  };

  const handleToggleAssignment = async (assignment: MeterReadingAssignment) => {
    try {
      await updateAssignment.mutateAsync({ id: assignment.id, is_active: !assignment.is_active });
      toast({
        title: assignment.is_active ? 'Assignment deactivated' : 'Assignment reactivated',
        description: `${assignmentMeter(assignment)} for ${assignment.assignee.full_name} was updated.`,
      });
    } catch {
      toast({
        title: 'Update failed',
        description: 'The assignment status could not be changed.',
        variant: 'destructive',
      });
    }
  };

  if (!canManageAssignments) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Meter Reading Assignments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateAssignment} className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Assignee</Label>
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger>
                    <SelectValue placeholder={usersLoading ? 'Loading users...' : 'Select user'} />
                  </SelectTrigger>
                  <SelectContent>
                    {assigneeProfiles.map((userProfile) => (
                      <SelectItem key={userProfile.user.id} value={userProfile.user.id.toString()}>
                        {formatAssignee(userProfile)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Assignment Scope</Label>
                <Select value={scopeType} onValueChange={(value) => setScopeType(value as ScopeType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {scopeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {scopeType === 'PRODUCTION_SITE' ? (
                <div className="space-y-2">
                  <Label>Production Site</Label>
                  <Select value={productionSiteId} onValueChange={setProductionSiteId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {(sitesData?.results || []).map((site) => (
                        <SelectItem key={site.id} value={site.id.toString()}>
                          {site.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Distribution Zone</Label>
                  <Select value={zoneId} onValueChange={setZoneId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select zone" />
                    </SelectTrigger>
                    <SelectContent>
                      {(zonesData?.results || []).map((zone) => (
                        <SelectItem key={zone.id} value={zone.id.toString()}>
                          {zone.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Mapped Meter</Label>
                <Select value={meterOptionValue} onValueChange={setMeterOptionValue}>
                  <SelectTrigger>
                    <SelectValue placeholder={mappedMetersLoading ? 'Loading meters...' : 'All mapped meters'} />
                  </SelectTrigger>
                  <SelectContent>
                    {meterOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label} - {option.context}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Leave blank to assign every mapped meter in the selected site or zone.
                </p>
                {meterOptionValue ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setMeterOptionValue('')}>
                    Use all mapped meters
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[180px_180px_1fr]">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input required type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                  placeholder="Optional assignment note"
                />
              </div>
            </div>

            <div className="flex items-center justify-end">
              <Button
                type="submit"
                disabled={
                  createAssignment.isPending ||
                  !assigneeId ||
                  mappedMetersLoading ||
                  metersToAssign.length === 0 ||
                  !startDate ||
                  !endDate ||
                  (scopeType === 'PRODUCTION_SITE' ? !productionSiteId : !zoneId)
                }
              >
                {createAssignment.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Assign Meter
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border/50">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base">Open Assignment History for {selectedDate}</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowInactive((current) => !current)}>
            {showInactive ? 'Show Active Only' : 'Include Inactive'}
          </Button>
        </CardHeader>
        <CardContent>
          {assignmentsLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Loading assignments...
            </div>
          ) : null}

          {!assignmentsLoading && visibleAssignments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No meter reading assignments found.
            </div>
          ) : null}

          {!assignmentsLoading && visibleAssignments.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-[760px] divide-y divide-border/60 rounded-lg border border-border/60">
                {visibleAssignments.map((assignment) => (
                  <div key={assignment.id} className="grid grid-cols-[1.5fr_1.25fr_1fr_120px_96px] items-center gap-4 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-foreground">{assignment.assignee.full_name}</p>
                      <p className="text-xs text-muted-foreground">{assignment.assignee.role_display}</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{assignmentMeter(assignment)}</p>
                      <p className="text-xs text-muted-foreground">{assignment.water_meter ? 'Water meter' : 'Energy meter'}</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{assignmentArea(assignment)}</p>
                      <p className="text-xs text-muted-foreground">{assignment.scope_type.replaceAll('_', ' ')}</p>
                    </div>
                    <div className="space-y-1">
                      <Badge variant={assignment.reading_status === 'SUBMITTED' ? 'secondary' : 'outline'}>
                        {assignment.reading_status === 'SUBMITTED' ? 'Submitted' : 'Not submitted'}
                      </Badge>
                      {!assignment.is_active ? (
                        <Badge variant="outline">Inactive</Badge>
                      ) : null}
                      {assignment.reading_current_value ? (
                        <p className="text-xs text-muted-foreground">{assignment.reading_current_value}</p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleAssignment(assignment)}
                      disabled={updateAssignment.isPending}
                      className="justify-start gap-2"
                    >
                      {assignment.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                      {assignment.is_active ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
