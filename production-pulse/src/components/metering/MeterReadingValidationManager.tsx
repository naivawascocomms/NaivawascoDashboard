import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck, UserCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useApproveMeterReading,
  useBulkApproveMeterReadings,
  useDelegateMeterReadingApproval,
  usePendingMeterReadingApprovals,
  useUserProfiles,
} from '@/hooks/useMetering';
import { toast } from '@/hooks/use-toast';
import type { MeterReadingApprovalItem, UserProfile } from '@/types/api';

type ApprovalGroup = {
  key: string;
  label: string;
  assigneeId: number;
  assigneeName: string;
  scopeType: 'PRODUCTION_SITE' | 'ZONE';
  productionSite?: number;
  zone?: number;
  items: MeterReadingApprovalItem[];
};

function approvalArea(item: MeterReadingApprovalItem) {
  return item.scope_type === 'PRODUCTION_SITE'
    ? item.production_site_name || 'Production site'
    : item.zone_name || 'Zone';
}

function groupApprovals(items: MeterReadingApprovalItem[]) {
  const groups = new Map<string, ApprovalGroup>();

  items.forEach((item) => {
    const areaId = item.scope_type === 'PRODUCTION_SITE' ? item.production_site : item.zone;
    const key = `${item.assignee.id}:${item.scope_type}:${areaId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      return;
    }

    groups.set(key, {
      key,
      label: approvalArea(item),
      assigneeId: item.assignee.id,
      assigneeName: item.assignee.full_name,
      scopeType: item.scope_type,
      productionSite: item.production_site || undefined,
      zone: item.zone || undefined,
      items: [item],
    });
  });

  return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function MeterReadingValidationManager({
  profile,
  selectedDate,
}: {
  profile: UserProfile | undefined;
  selectedDate: string;
}) {
  const canValidate = Boolean(profile?.can_assign_readings);
  const [groupDelegateSelections, setGroupDelegateSelections] = useState<Record<string, string>>({});

  const { data: approvalsData, isLoading } = usePendingMeterReadingApprovals(
    { reading_date: selectedDate },
    { enabled: canValidate },
  );
  const { data: userProfilesData } = useUserProfiles(
    { user__is_active: true, ordering: 'user__username' },
    { enabled: canValidate },
  );
  const approveReading = useApproveMeterReading();
  const bulkApproveReadings = useBulkApproveMeterReadings();
  const delegateApproval = useDelegateMeterReadingApproval();

  const approvals = approvalsData?.results || [];
  const approvalGroups = useMemo(() => groupApprovals(approvals), [approvals]);
  const approverProfiles = useMemo(
    () =>
      (userProfilesData?.results || []).filter(
        (userProfile) => userProfile.can_assign_readings && userProfile.user.is_active,
      ),
    [userProfilesData],
  );

  const handleApproveReading = async (item: MeterReadingApprovalItem) => {
    try {
      await approveReading.mutateAsync({
        reading_type: item.reading_type,
        reading_id: item.reading_id,
      });
      toast({
        title: 'Reading approved',
        description: `${item.meter_label} for ${item.reading_date} was validated.`,
      });
    } catch {
      toast({
        title: 'Approval failed',
        description: 'The reading could not be approved.',
        variant: 'destructive',
      });
    }
  };

  const handleBulkApprove = async (group: ApprovalGroup) => {
    try {
      const response = await bulkApproveReadings.mutateAsync({
        reading_date: selectedDate,
        assignee: group.assigneeId,
        scope_type: group.scopeType,
        production_site: group.productionSite,
        zone: group.zone,
      });
      toast({
        title: 'Bulk approval complete',
        description: `${response.approved} readings were validated for ${group.label}.`,
      });
    } catch {
      toast({
        title: 'Bulk approval failed',
        description: 'The selected readings could not be approved.',
        variant: 'destructive',
      });
    }
  };

  const handleDelegateGroup = async (group: ApprovalGroup) => {
    const delegateId = groupDelegateSelections[group.key];
    if (!delegateId) {
      toast({
        title: 'Select a delegate',
        description: 'Choose an approval delegate before saving.',
        variant: 'destructive',
      });
      return;
    }

    const assignmentIds = Array.from(new Set(group.items.map((item) => item.assignment_id)));

    try {
      for (const assignmentId of assignmentIds) {
        await delegateApproval.mutateAsync({
          assignmentId,
          delegate_id: Number(delegateId),
        });
      }
      toast({
        title: 'Approval delegated',
        description: `${assignmentIds.length} assignments were delegated for ${group.label}.`,
      });
    } catch {
      toast({
        title: 'Delegation failed',
        description: 'The approval delegation could not be saved.',
        variant: 'destructive',
      });
    }
  };

  if (!canValidate) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card/80 border-border/50">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Readings Validation
          </CardTitle>
          <Badge variant="outline">{approvals.length} pending</Badge>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Loading readings for approval...
            </div>
          ) : null}

          {!isLoading && approvalGroups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              No submitted readings are pending validation for {selectedDate}.
            </div>
          ) : null}

          {!isLoading && approvalGroups.length > 0 ? (
            <div className="space-y-5">
              {approvalGroups.map((group) => (
                <div key={group.key} className="rounded-xl border border-border/60 bg-background/70">
                  <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-foreground">{group.label}</h3>
                        <Badge variant="secondary">{group.items.length} readings</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Assigned to {group.assigneeName} | {group.scopeType.replaceAll('_', ' ')}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Delegate Approval</Label>
                        <Select
                          value={groupDelegateSelections[group.key] || ''}
                          onValueChange={(value) =>
                            setGroupDelegateSelections((current) => ({ ...current, [group.key]: value }))
                          }
                        >
                          <SelectTrigger className="h-9 w-[220px]">
                            <SelectValue placeholder="Select delegate" />
                          </SelectTrigger>
                          <SelectContent>
                            {approverProfiles.map((userProfile) => (
                              <SelectItem key={userProfile.user.id} value={userProfile.user.id.toString()}>
                                {userProfile.user.full_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelegateGroup(group)}
                        disabled={delegateApproval.isPending}
                        className="gap-2"
                      >
                        <UserCheck className="w-4 h-4" />
                        Delegate
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleBulkApprove(group)}
                        disabled={bulkApproveReadings.isPending}
                        className="gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Approve Group
                      </Button>
                    </div>
                  </div>

                  <div className="divide-y divide-border/50">
                    {group.items.map((item) => (
                      <div
                        key={`${item.reading_type}-${item.reading_id}`}
                        className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[1.4fr_1fr_1fr_120px]"
                      >
                        <div>
                          <p className="font-medium text-foreground">{item.meter_label}</p>
                          <p className="text-xs text-muted-foreground">{item.meter_number} | {item.reading_type}</p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{Number(item.current_reading).toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">
                            Previous {item.previous_reading ? Number(item.previous_reading).toLocaleString() : '0'}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{item.read_by || item.submitted_by_username}</p>
                          <p className="text-xs text-muted-foreground">
                            Delegate {item.approval_delegate?.full_name || 'None'}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleApproveReading(item)}
                          disabled={approveReading.isPending}
                          className="gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Approve
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
