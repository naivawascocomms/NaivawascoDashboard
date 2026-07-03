import React, { useEffect, useMemo, useState } from 'react';
import * as Location from 'expo-location';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '../../api/errors';
import {
  addIncidentComment,
  getIncidentAssignableProfiles,
  reportIncident,
  updateIncidentAssignee,
  updateIncidentStatus,
} from '../../api/incidentsApi';
import { AppButton } from '../../components/AppButton';
import { TextField } from '../../components/TextField';
import { queuePendingIncidentAction } from '../../storage/pendingIncidentActions';
import { colors } from '../../theme/colors';
import type {
  Incident,
  IncidentPayload,
  IncidentPriority,
  IncidentStatus,
  IncidentType,
  IncidentUserProfile,
} from '../../types/incidents';
import { incidentCategories } from '../../types/incidents';

type Props = {
  incidents: Incident[];
  isLoading: boolean;
  onRefresh: () => Promise<void>;
  onPendingChange: () => Promise<void>;
};

const initialForm: IncidentPayload = {
  type: 'distribution',
  category: '',
  description: '',
  location: '',
  priority: 'medium',
  assignedToProfileId: '',
  estimatedImpactM3: '',
  notes: '',
};

function apiErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Request failed. Check your connection and try again.';
}

function isRetryableIncidentError(error: unknown) {
  return !(error instanceof ApiError) || error.status >= 500;
}

function localId(prefix: string) {
  return `${Date.now()}-${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, value => {
    const random = Math.floor(Math.random() * 16);
    const digit = value === 'x' ? random : (random & 0x3) | 0x8;
    return digit.toString(16);
  });
}

function statusLabel(status: IncidentStatus) {
  if (status === 'in-progress') return 'In Progress';
  if (status === 'resolved') return 'Resolved';
  return 'Open';
}

function statusColor(status: IncidentStatus) {
  if (status === 'resolved') return colors.success;
  if (status === 'in-progress') return colors.warning;
  return colors.danger;
}

function priorityColor(priority: IncidentPriority) {
  if (priority === 'critical') return colors.danger;
  if (priority === 'high') return colors.warning;
  if (priority === 'medium') return colors.info;
  return colors.muted;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function IncidentsScreen({ incidents, isLoading, onRefresh, onPendingChange }: Props) {
  const [showReportForm, setShowReportForm] = useState(false);
  const [form, setForm] = useState<IncidentPayload>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<'type' | 'category' | 'priority' | 'assignedTo' | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | number | null>(null);
  const [assigneeDropdownIncidentId, setAssigneeDropdownIncidentId] = useState<string | number | null>(null);
  const [comment, setComment] = useState('');
  const [isActing, setIsActing] = useState(false);
  const [profiles, setProfiles] = useState<IncidentUserProfile[]>([]);
  const [profilesError, setProfilesError] = useState('');
  const [formAssigneeSearch, setFormAssigneeSearch] = useState('');
  const [cardAssigneeSearch, setCardAssigneeSearch] = useState('');

  const counts = useMemo(() => ({
    open: incidents.filter(item => item.status === 'open').length,
    inProgress: incidents.filter(item => item.status === 'in-progress').length,
    critical: incidents.filter(item => item.priority === 'critical').length,
  }), [incidents]);

  const categories = incidentCategories[form.type];
  const selectedAssignee = profiles.find(profile => profile.id === form.assignedToProfileId);

  useEffect(() => {
    let isMounted = true;
    getIncidentAssignableProfiles()
      .then(items => {
        if (!isMounted) return;
        setProfiles(items);
        setProfilesError('');
      })
      .catch(error => {
        if (!isMounted) return;
        setProfilesError(apiErrorMessage(error));
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const resetForm = () => {
    setForm(initialForm);
    setOpenDropdown(null);
    setFormAssigneeSearch('');
  };

  const handlePickCoordinates = async () => {
    try {
      setIsLocating(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        Alert.alert('Location permission needed', 'Allow location access to attach GPS coordinates to the incident.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const coords = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
      setForm(current => ({ ...current, location: coords }));
    } catch (error) {
      Alert.alert('Location unavailable', apiErrorMessage(error));
    } finally {
      setIsLocating(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!form.category || !form.description.trim() || !form.location.trim() || !form.assignedToProfileId) {
      Alert.alert('Incomplete report', 'Select a category, assigned user, coordinates, and enter the description.');
      return;
    }

    const payload = {
      ...form,
      mobileExternalId: form.mobileExternalId || uuid(),
    };
    try {
      setIsSubmitting(true);
      await reportIncident(payload);
      Alert.alert('Incident reported', 'The report has been sent.');
      resetForm();
      setShowReportForm(false);
      await onRefresh();
    } catch (error) {
      if (isRetryableIncidentError(error)) {
        await queuePendingIncidentAction({
          localId: localId('incident-report'),
          actionType: 'report',
          title: `Report: ${form.category}`,
          payload,
          createdAt: new Date().toISOString(),
          status: 'pending',
          retryable: true,
          error: apiErrorMessage(error),
        });
        Alert.alert('Saved offline', 'The incident report is queued and will sync automatically.');
        resetForm();
        setShowReportForm(false);
        await onPendingChange();
        return;
      }
      Alert.alert('Report failed', apiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatus = async (incident: Incident, status: IncidentStatus) => {
    if (incident.status === status) return;
    try {
      setIsActing(true);
      await updateIncidentStatus(incident.id, status);
      await onRefresh();
    } catch (error) {
      if (isRetryableIncidentError(error)) {
        await queuePendingIncidentAction({
          localId: localId('incident-status'),
          actionType: 'status',
          title: `${incident.category}: ${statusLabel(status)}`,
          incidentId: incident.id,
          payload: { status },
          createdAt: new Date().toISOString(),
          status: 'pending',
          retryable: true,
          error: apiErrorMessage(error),
        });
        Alert.alert('Saved offline', 'The status update is queued and will sync automatically.');
        await onPendingChange();
        return;
      }
      Alert.alert('Update failed', apiErrorMessage(error));
    } finally {
      setIsActing(false);
    }
  };

  const handleAddComment = async (incident: Incident) => {
    const value = comment.trim();
    if (!value) return;
    const mobileExternalId = uuid();
    try {
      setIsActing(true);
      await addIncidentComment(incident.id, value, mobileExternalId);
      setComment('');
      setSelectedIncidentId(null);
      await onRefresh();
    } catch (error) {
      if (isRetryableIncidentError(error)) {
        await queuePendingIncidentAction({
          localId: localId('incident-comment'),
          actionType: 'comment',
          title: `${incident.category}: comment`,
          incidentId: incident.id,
          payload: { comment: value, mobileExternalId },
          createdAt: new Date().toISOString(),
          status: 'pending',
          retryable: true,
          error: apiErrorMessage(error),
        });
        Alert.alert('Saved offline', 'The incident update is queued and will sync automatically.');
        setComment('');
        setSelectedIncidentId(null);
        await onPendingChange();
        return;
      }
      Alert.alert('Update failed', apiErrorMessage(error));
    } finally {
      setIsActing(false);
    }
  };

  const handleAssignIncident = async (incident: Incident, assignedToProfileId: string) => {
    if (incident.assigned_to === assignedToProfileId) {
      setAssigneeDropdownIncidentId(null);
      return;
    }
    try {
      setIsActing(true);
      await updateIncidentAssignee(incident.id, assignedToProfileId);
      setAssigneeDropdownIncidentId(null);
      setCardAssigneeSearch('');
      await onRefresh();
    } catch (error) {
      if (isRetryableIncidentError(error)) {
        const profile = profiles.find(item => item.id === assignedToProfileId);
        await queuePendingIncidentAction({
          localId: localId('incident-assign'),
          actionType: 'assign',
          title: `${incident.category}: assign to ${profile?.display_name || assignedToProfileId}`,
          incidentId: incident.id,
          payload: { assignedToProfileId },
          createdAt: new Date().toISOString(),
          status: 'pending',
          retryable: true,
          error: apiErrorMessage(error),
        });
        Alert.alert('Saved offline', 'The assignment update is queued and will sync automatically.');
        setAssigneeDropdownIncidentId(null);
        setCardAssigneeSearch('');
        await onPendingChange();
        return;
      }
      Alert.alert('Assignment failed', apiErrorMessage(error));
    } finally {
      setIsActing(false);
    }
  };

  return (
    <ScrollView
      style={styles.wrapper}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} />}
    >
      <View style={styles.actionBar}>
        <View>
          <Text style={styles.sectionTitle}>Assigned Incidents</Text>
          <Text style={styles.sectionSubtitle}>Only incidents assigned to you are shown.</Text>
        </View>
        <AppButton
          label={showReportForm ? 'Close' : 'Report'}
          onPress={() => setShowReportForm(value => !value)}
          variant={showReportForm ? 'secondary' : 'primary'}
          style={styles.reportButton}
        />
      </View>

      <View style={styles.summaryRow}>
        <MiniStat label="Open" value={counts.open} tone={colors.danger} />
        <MiniStat label="In Progress" value={counts.inProgress} tone={colors.warning} />
        <MiniStat label="Critical" value={counts.critical} tone={colors.danger} />
      </View>

      {showReportForm && (
        <View style={styles.formCard}>
          <Text style={styles.cardTitle}>Report Incident</Text>

          <Dropdown
            label="Type"
            value={form.type}
            displayValue={form.type === 'distribution' ? 'Distribution' : 'Production'}
            isOpen={openDropdown === 'type'}
            onToggle={() => setOpenDropdown(openDropdown === 'type' ? null : 'type')}
            options={[
              { label: 'Distribution', value: 'distribution' },
              { label: 'Production', value: 'production' },
            ]}
            onSelect={value => {
              setForm({ ...form, type: value as IncidentType, category: '' });
              setOpenDropdown(null);
            }}
          />

          <Dropdown
            label="Category"
            value={form.category}
            displayValue={form.category || 'Select category'}
            isOpen={openDropdown === 'category'}
            onToggle={() => setOpenDropdown(openDropdown === 'category' ? null : 'category')}
            options={categories.map(category => ({ label: category, value: category }))}
            onSelect={value => {
              setForm({ ...form, category: value });
              setOpenDropdown(null);
            }}
          />

          <Dropdown
            label="Priority"
            value={form.priority}
            displayValue={priorityDisplay(form.priority)}
            isOpen={openDropdown === 'priority'}
            onToggle={() => setOpenDropdown(openDropdown === 'priority' ? null : 'priority')}
            options={(['low', 'medium', 'high', 'critical'] as IncidentPriority[]).map(priority => ({
              label: priorityDisplay(priority),
              value: priority,
            }))}
            onSelect={value => {
              setForm({ ...form, priority: value as IncidentPriority });
              setOpenDropdown(null);
            }}
          />

          <ProfileDropdown
            label="Assigned To"
            value={form.assignedToProfileId}
            displayValue={
              profilesError
                ? 'Could not load users'
                : selectedAssignee?.display_name || 'Select user'
            }
            isOpen={openDropdown === 'assignedTo'}
            profiles={profiles}
            search={formAssigneeSearch}
            onSearch={setFormAssigneeSearch}
            onToggle={() => {
              const willOpen = openDropdown !== 'assignedTo';
              setOpenDropdown(willOpen ? 'assignedTo' : null);
              if (!willOpen) setFormAssigneeSearch('');
            }}
            onSelect={value => {
              setForm({ ...form, assignedToProfileId: value });
              setFormAssigneeSearch('');
              setOpenDropdown(null);
            }}
          />
          {!!profilesError && <Text style={styles.fieldError}>{profilesError}</Text>}

          <View style={styles.locationBlock}>
            <Text style={styles.fieldLabel}>Coordinates</Text>
            <View style={styles.locationCard}>
              <Text style={[styles.coordinateText, !form.location && styles.placeholderText]}>
                {form.location || 'No coordinates selected'}
              </Text>
              <AppButton
                label={form.location ? 'Update Coordinates' : 'Pick Coordinates'}
                onPress={() => void handlePickCoordinates()}
                loading={isLocating}
                variant="secondary"
                style={styles.locationButton}
              />
            </View>
          </View>

          <TextField label="Description" value={form.description} onChangeText={description => setForm({ ...form, description })} placeholder="Describe what happened" multiline autoCapitalize="sentences" />
          <TextField label="Estimated Impact m3" value={form.estimatedImpactM3 || ''} onChangeText={estimatedImpactM3 => setForm({ ...form, estimatedImpactM3 })} placeholder="Optional" keyboardType="decimal-pad" />
          <TextField label="Notes" value={form.notes || ''} onChangeText={notes => setForm({ ...form, notes })} placeholder="Optional" multiline autoCapitalize="sentences" />

          <View style={styles.formActions}>
            <AppButton label="Submit Report" onPress={handleSubmitReport} loading={isSubmitting} />
            <AppButton label="Clear" onPress={resetForm} variant="secondary" />
          </View>
        </View>
      )}

      <View style={styles.list}>
        {isLoading ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Loading incidents...</Text>
          </View>
        ) : incidents.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No assigned incidents</Text>
            <Text style={styles.emptyText}>Incidents assigned to you will appear here.</Text>
            <AppButton label="Refresh" onPress={onRefresh} variant="secondary" style={styles.refreshButton} />
          </View>
        ) : incidents.map(incident => (
          <IncidentCard
            key={incident.id}
            incident={incident}
            selected={selectedIncidentId === incident.id}
            profiles={profiles}
            comment={comment}
            isActing={isActing}
            assigneeDropdownOpen={assigneeDropdownIncidentId === incident.id}
            onSelect={() => {
              setSelectedIncidentId(selectedIncidentId === incident.id ? null : incident.id);
              setAssigneeDropdownIncidentId(null);
              setCardAssigneeSearch('');
              setComment('');
            }}
            onToggleAssignee={() => {
              const willOpen = assigneeDropdownIncidentId !== incident.id;
              setAssigneeDropdownIncidentId(willOpen ? incident.id : null);
              if (!willOpen) setCardAssigneeSearch('');
            }}
            assigneeSearch={cardAssigneeSearch}
            onAssigneeSearch={setCardAssigneeSearch}
            onAssign={profileId => handleAssignIncident(incident, profileId)}
            onCommentChange={setComment}
            onAddComment={() => handleAddComment(incident)}
            onStatus={status => handleStatus(incident, status)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function priorityDisplay(priority: IncidentPriority) {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={[styles.miniStatValue, { color: tone }]}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

function Dropdown({
  label,
  value,
  displayValue,
  isOpen,
  options,
  onToggle,
  onSelect,
}: {
  label: string;
  value: string;
  displayValue: string;
  isOpen: boolean;
  options: Array<{ label: string; value: string }>;
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.dropdownGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable onPress={onToggle} style={styles.dropdownButton}>
        <Text style={[styles.dropdownValue, !value && styles.placeholderText]}>{displayValue}</Text>
        <Text style={styles.dropdownChevron}>{isOpen ? '^' : 'v'}</Text>
      </Pressable>
      {isOpen && (
        <View style={styles.dropdownMenu}>
          {options.map(option => (
            <Pressable
              key={option.value}
              onPress={() => onSelect(option.value)}
              style={[styles.dropdownOption, option.value === value && styles.dropdownOptionSelected]}
            >
              <Text style={[styles.dropdownOptionText, option.value === value && styles.dropdownOptionTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function profileLabel(profile: IncidentUserProfile) {
  return `${profile.display_name}${profile.role ? ` - ${profile.role.replace(/_/g, ' ')}` : ''}`;
}

function ProfileDropdown({
  label,
  value,
  displayValue,
  isOpen,
  profiles,
  search,
  onSearch,
  onToggle,
  onSelect,
}: {
  label: string;
  value: string;
  displayValue: string;
  isOpen: boolean;
  profiles: IncidentUserProfile[];
  search: string;
  onSearch: (value: string) => void;
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const filteredProfiles = profiles
    .filter(profile => {
      if (!normalizedSearch) return true;
      return [
        profile.display_name,
        profile.username,
        profile.full_name || '',
        profile.role,
      ].some(value => value.toLowerCase().includes(normalizedSearch));
    })
    .slice(0, 8);

  return (
    <View style={styles.dropdownGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable onPress={onToggle} style={styles.dropdownButton}>
        <Text style={[styles.dropdownValue, !value && styles.placeholderText]}>{displayValue}</Text>
        <Text style={styles.dropdownChevron}>{isOpen ? '^' : 'v'}</Text>
      </Pressable>
      {isOpen && (
        <View style={styles.dropdownMenu}>
          <TextInput
            value={search}
            onChangeText={onSearch}
            placeholder="Search users"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.dropdownSearch}
          />
          {filteredProfiles.length === 0 ? (
            <View style={styles.dropdownEmpty}>
              <Text style={styles.dropdownEmptyText}>No matching users</Text>
            </View>
          ) : filteredProfiles.map(profile => (
            <Pressable
              key={profile.id}
              onPress={() => onSelect(profile.id)}
              style={[styles.dropdownOption, profile.id === value && styles.dropdownOptionSelected]}
            >
              <Text style={[styles.dropdownOptionText, profile.id === value && styles.dropdownOptionTextSelected]}>
                {profileLabel(profile)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function IncidentCard({
  incident,
  selected,
  profiles,
  comment,
  isActing,
  assigneeDropdownOpen,
  assigneeSearch,
  onSelect,
  onToggleAssignee,
  onAssigneeSearch,
  onAssign,
  onCommentChange,
  onAddComment,
  onStatus,
}: {
  incident: Incident;
  selected: boolean;
  profiles: IncidentUserProfile[];
  comment: string;
  isActing: boolean;
  assigneeDropdownOpen: boolean;
  assigneeSearch: string;
  onSelect: () => void;
  onToggleAssignee: () => void;
  onAssigneeSearch: (value: string) => void;
  onAssign: (profileId: string) => void;
  onCommentChange: (value: string) => void;
  onAddComment: () => void;
  onStatus: (status: IncidentStatus) => void;
}) {
  const asset = incident.zone_name || incident.production_site_name || incident.location;

  return (
    <View style={styles.incidentCard}>
      <View style={styles.incidentTop}>
        <View style={styles.incidentTitleBlock}>
          <Text style={styles.incidentCategory}>{incident.category}</Text>
          <Text style={styles.incidentMeta}>{asset}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: `${statusColor(incident.status)}18` }]}>
          <Text style={[styles.badgeText, { color: statusColor(incident.status) }]}>{statusLabel(incident.status)}</Text>
        </View>
      </View>

      <Text style={styles.description}>{incident.description}</Text>

      <View style={styles.detailRow}>
        <Text style={styles.detail}>Priority: <Text style={{ color: priorityColor(incident.priority), fontWeight: '900' }}>{incident.priority}</Text></Text>
        <Text style={styles.detail}>Assigned: {incident.assigned_to_name || 'Unassigned'}</Text>
        <Text style={styles.detail}>{formatDate(incident.reported_at)}</Text>
      </View>

      <View style={styles.statusActions}>
        <SmallButton label="Start" disabled={isActing || incident.status !== 'open'} onPress={() => onStatus('in-progress')} />
        <SmallButton label="Resolve" disabled={isActing || incident.status === 'resolved'} onPress={() => onStatus('resolved')} />
        <SmallButton label={selected ? 'Close' : `Updates (${incident.comment_count})`} onPress={onSelect} />
      </View>

      {selected && (
        <View style={styles.commentBox}>
          <ProfileDropdown
            label="Assigned To"
            value={incident.assigned_to}
            displayValue={incident.assigned_to_name || 'Unassigned'}
            isOpen={assigneeDropdownOpen}
            profiles={profiles}
            search={assigneeSearch}
            onSearch={onAssigneeSearch}
            onToggle={onToggleAssignee}
            onSelect={onAssign}
          />
          {incident.comments.slice(0, 2).map(item => (
            <View key={item.id} style={styles.commentItem}>
              <Text style={styles.commentText}>{item.comment}</Text>
              <Text style={styles.commentMeta}>{item.created_by_name || 'System'} - {formatDate(item.created_at)}</Text>
            </View>
          ))}
          <TextField label="Add update" value={comment} onChangeText={onCommentChange} placeholder="Action taken, site notes, materials needed" multiline autoCapitalize="sentences" />
          <AppButton label="Add Update" onPress={onAddComment} disabled={!comment.trim()} loading={isActing} />
        </View>
      )}
    </View>
  );
}

function SmallButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.smallButton, disabled && styles.disabledButton]}>
      <Text style={[styles.smallButtonText, disabled && styles.disabledButtonText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingBottom: 20,
  },
  actionBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  reportButton: {
    minWidth: 92,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  miniStat: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    padding: 10,
  },
  miniStatValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  miniStatLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  formCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 14,
    padding: 14,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  dropdownGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  fieldError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  dropdownButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  dropdownValue: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  dropdownChevron: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  dropdownMenu: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownSearch: {
    backgroundColor: colors.surfaceAlt,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  dropdownEmpty: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  dropdownEmptyText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  dropdownOption: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  dropdownOptionSelected: {
    backgroundColor: colors.surfaceAlt,
  },
  dropdownOptionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  dropdownOptionTextSelected: {
    color: colors.primary,
    fontWeight: '900',
  },
  placeholderText: {
    color: colors.muted,
  },
  locationBlock: {
    gap: 8,
  },
  locationCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  coordinateText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  locationButton: {
    width: '100%',
  },
  formActions: {
    gap: 8,
  },
  list: {
    gap: 10,
    paddingBottom: 10,
  },
  empty: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    padding: 22,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  emptyText: {
    color: colors.muted,
    marginTop: 6,
    textAlign: 'center',
  },
  refreshButton: {
    marginTop: 14,
    width: '100%',
  },
  incidentCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 11,
    padding: 14,
  },
  incidentTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  incidentTitleBlock: {
    flex: 1,
  },
  incidentCategory: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  incidentMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  description: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  detailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  detail: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  statusActions: {
    flexDirection: 'row',
    gap: 8,
  },
  smallButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
  },
  smallButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.45,
  },
  disabledButtonText: {
    color: colors.muted,
  },
  commentBox: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 10,
    paddingTop: 10,
  },
  commentItem: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    padding: 9,
  },
  commentText: {
    color: colors.text,
    fontSize: 13,
  },
  commentMeta: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
  },
});
