import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '../../api/errors';
import { getAssignedIncidents, performPendingIncidentAction } from '../../api/incidentsApi';
import { getTodayReadingTasks, submitReading } from '../../api/meteringApi';
import { useAuth } from '../../auth/AuthProvider';
import { AppButton } from '../../components/AppButton';
import { Screen } from '../../components/Screen';
import { getPendingIncidentActions, removePendingIncidentAction, savePendingIncidentActions } from '../../storage/pendingIncidentActions';
import { getPendingReadings, queuePendingReading, removePendingReading, savePendingReadings } from '../../storage/pendingReadings';
import { colors } from '../../theme/colors';
import type { Incident, PendingIncidentAction } from '../../types/incidents';
import type { PendingReading, ReadingPayload, ReadingTask } from '../../types/metering';
import { formatFriendlyDate, todayIso } from '../../utils/date';
import { IncidentsScreen } from './IncidentsScreen';
import { PendingSyncScreen } from './PendingSyncScreen';
import { ReadingForm } from './ReadingForm';
import { SettingsScreen } from './SettingsScreen';
import { TaskCard } from './TaskCard';

type MainScreen = 'home' | 'meterReading' | 'incidents' | 'sync' | 'settings';
type ReadingTab = 'pending' | 'submitted' | 'approved' | 'all';
type MeterTypeFilter = 'ALL' | 'WATER' | 'ENERGY';
type ScopeFilter = 'ALL' | 'PRODUCTION_SITE' | 'ZONE';

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (typeof error.payload === 'object' && error.payload !== null) {
      return JSON.stringify(error.payload);
    }
    return String(error.payload || `Request failed (${error.status})`);
  }
  return 'Network error. Reading saved for later sync.';
}

function isRetryableSyncError(error: unknown) {
  return !(error instanceof ApiError) || error.status >= 500;
}

export function MeterReadingApp() {
  const { profile } = useAuth();
  const [mainScreen, setMainScreen] = useState<MainScreen>('home');
  const [readingTab, setReadingTab] = useState<ReadingTab>('pending');
  const [meterTypeFilter, setMeterTypeFilter] = useState<MeterTypeFilter>('ALL');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [routeView, setRouteView] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ReadingTask | null>(null);
  const [tasks, setTasks] = useState<ReadingTask[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [pendingReadings, setPendingReadings] = useState<PendingReading[]>([]);
  const [pendingIncidentActions, setPendingIncidentActions] = useState<PendingIncidentAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const [readingDate, setReadingDate] = useState(todayIso());

  const pendingTasks = useMemo(() => tasks.filter(task => task.status === 'missing'), [tasks]);
  const submittedTasks = useMemo(() => tasks.filter(task => task.status === 'submitted'), [tasks]);
  const approvedReadings = useMemo(() => tasks.filter(task => task.status === 'validated'), [tasks]);
  const pendingSyncCount = pendingReadings.length + pendingIncidentActions.length;
  const submittedAndApprovedCount = submittedTasks.length + approvedReadings.length;

  const activeReadingTasks = useMemo(() => {
    const tabbedTasks = readingTab === 'pending'
      ? pendingTasks
      : readingTab === 'submitted'
        ? submittedTasks
        : readingTab === 'approved'
          ? approvedReadings
          : tasks;

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filtered = tabbedTasks.filter(task => {
      const matchesType = meterTypeFilter === 'ALL' || task.meter_type === meterTypeFilter;
      const matchesScope = scopeFilter === 'ALL' || task.scopes.some(scope => scope.scope_type === scopeFilter);
      const searchableText = [
        task.meter_number,
        task.meter_label,
        task.display_name,
        ...task.scopes.map(scope => scope.production_site_name || scope.zone_name || ''),
      ].join(' ').toLowerCase();
      return matchesType && matchesScope && (!normalizedSearch || searchableText.includes(normalizedSearch));
    });

    if (!routeView) return filtered;
    return [...filtered].sort((a, b) => {
      const aScope = a.scopes.map(scope => scope.production_site_name || scope.zone_name || '').join(' ');
      const bScope = b.scopes.map(scope => scope.production_site_name || scope.zone_name || '').join(' ');
      return `${aScope} ${a.meter_label}`.localeCompare(`${bScope} ${b.meter_label}`);
    });
  }, [
    approvedReadings,
    meterTypeFilter,
    pendingTasks,
    readingTab,
    routeView,
    scopeFilter,
    searchTerm,
    submittedTasks,
    tasks,
  ]);

  const loadPending = useCallback(async () => {
    const [nextReadings, nextIncidentActions] = await Promise.all([
      getPendingReadings(),
      getPendingIncidentActions(),
    ]);
    setPendingReadings(nextReadings);
    setPendingIncidentActions(nextIncidentActions);
  }, []);

  const loadTasks = useCallback(async () => {
    const response = await getTodayReadingTasks(readingDate);
    setTasks(response.results);
  }, [readingDate]);

  const loadIncidents = useCallback(async () => {
    const response = await getAssignedIncidents();
    setIncidents(response.results);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      await Promise.all([loadTasks(), loadPending(), loadIncidents()]);
    } catch (error) {
      Alert.alert('Could not load field work', errorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [loadIncidents, loadPending, loadTasks]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      void loadIncidents().catch(() => undefined);
    }, 15000);

    return () => {
      clearInterval(intervalId);
    };
  }, [loadIncidents]);

  const handleSubmit = async (payload: ReadingPayload) => {
    try {
      await submitReading(payload);
      Alert.alert('Saved', 'Reading submitted.');
      setSelectedTask(null);
      await refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status < 500) {
        Alert.alert('Reading not accepted', errorMessage(error));
        return;
      }

      const task = tasks.find(item => item.meter_type === payload.meterType && item.meter_id === payload.meterId);
      await queuePendingReading({
        ...payload,
        localId: `${Date.now()}-${payload.meterType}-${payload.meterId}`,
        meterLabel: task?.meter_label || `Meter ${payload.meterId}`,
        createdAt: new Date().toISOString(),
        status: 'pending',
        retryable: true,
        error: errorMessage(error),
      });
      Alert.alert('Saved offline', 'The reading is queued and can be synced later.');
      setSelectedTask(null);
      await loadPending();
    }
  };

  const syncPendingReadings = useCallback(async (options: { retryOnly?: boolean } = {}) => {
    const queue = await getPendingReadings();
    const syncQueue = options.retryOnly
      ? queue.filter(item => item.retryable !== false)
      : queue;
    if (!syncQueue.length) return { before: queue.length, after: queue.length };

    const failedById = new Map(queue.map(item => [item.localId, item]));
    for (const item of queue) {
      if (!syncQueue.some(candidate => candidate.localId === item.localId)) continue;
      try {
        await submitReading(item);
        await removePendingReading(item.localId);
        failedById.delete(item.localId);
      } catch (error) {
        failedById.set(item.localId, {
          ...item,
          status: 'failed',
          retryable: isRetryableSyncError(error),
          error: errorMessage(error),
        });
      }
    }

    const failed = Array.from(failedById.values());
    await savePendingReadings(failed);
    return { before: queue.length, after: failed.length };
  }, []);

  const syncPendingIncidentActions = useCallback(async (options: { retryOnly?: boolean } = {}) => {
    const queue = await getPendingIncidentActions();
    const syncQueue = options.retryOnly
      ? queue.filter(item => item.retryable !== false)
      : queue;
    if (!syncQueue.length) return { before: queue.length, after: queue.length };

    const failedById = new Map(queue.map(item => [item.localId, item]));
    for (const item of queue) {
      if (!syncQueue.some(candidate => candidate.localId === item.localId)) continue;
      try {
        await performPendingIncidentAction(item);
        await removePendingIncidentAction(item.localId);
        failedById.delete(item.localId);
      } catch (error) {
        failedById.set(item.localId, {
          ...item,
          status: 'failed',
          retryable: isRetryableSyncError(error),
          error: errorMessage(error),
        });
      }
    }

    const failed = Array.from(failedById.values());
    await savePendingIncidentActions(failed);
    return { before: queue.length, after: failed.length };
  }, []);

  const syncPending = useCallback(async (options: { silent?: boolean; retryOnly?: boolean } = {}) => {
    if (isSyncingRef.current) return;
    const [readingQueue, incidentQueue] = await Promise.all([
      getPendingReadings(),
      getPendingIncidentActions(),
    ]);
    const pendingCount = readingQueue.length + incidentQueue.length;
    if (!pendingCount) return;

    const retryableCount = options.retryOnly
      ? readingQueue.filter(item => item.retryable !== false).length + incidentQueue.filter(item => item.retryable !== false).length
      : pendingCount;
    if (!retryableCount) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    let remainingCount = pendingCount;
    let syncedAny = false;
    try {
      const [readingResult, incidentResult] = await Promise.all([
        syncPendingReadings({ retryOnly: options.retryOnly }),
        syncPendingIncidentActions({ retryOnly: options.retryOnly }),
      ]);

      remainingCount = readingResult.after + incidentResult.after;
      syncedAny = remainingCount !== pendingCount;
      await loadPending();
      if (syncedAny) {
        await Promise.all([loadTasks(), loadIncidents()]);
      }
    } finally {
      setIsSyncing(false);
      isSyncingRef.current = false;
      if (!options.silent) {
        Alert.alert('Sync complete', remainingCount ? `${remainingCount} item(s) still need attention.` : 'All pending items synced.');
      }
    }
  }, [loadIncidents, loadPending, loadTasks, syncPendingIncidentActions, syncPendingReadings]);

  useEffect(() => {
    const tryAutoSync = () => {
      void syncPending({ silent: true, retryOnly: true }).catch(() => undefined);
    };

    tryAutoSync();
    const intervalId = setInterval(tryAutoSync, 30000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') tryAutoSync();
    });

    return () => {
      clearInterval(intervalId);
      subscription.remove();
    };
  }, [syncPending]);

  if (selectedTask) {
    return <ReadingForm task={selectedTask} onCancel={() => setSelectedTask(null)} onSubmit={handleSubmit} />;
  }

  if (mainScreen === 'meterReading') {
    return (
      <View style={styles.appShell}>
        <View style={styles.mainPane}>
          <MeterReadingModule
            activeTab={readingTab}
            approvedCount={approvedReadings.length}
            filteredTasks={activeReadingTasks}
            isLoading={isLoading}
            meterTypeFilter={meterTypeFilter}
            onBack={() => setMainScreen('home')}
            onDateChange={setReadingDate}
            onFilterChange={setMeterTypeFilter}
            onRefresh={refresh}
            onScopeFilterChange={setScopeFilter}
            onSearchChange={setSearchTerm}
            onSelectTask={setSelectedTask}
            onTabChange={setReadingTab}
            onToggleRouteView={() => setRouteView(value => !value)}
            pendingCount={pendingTasks.length}
            readingDate={readingDate}
            routeView={routeView}
            scopeFilter={scopeFilter}
            searchTerm={searchTerm}
            submittedCount={submittedTasks.length}
            totalCount={tasks.length}
          />
        </View>
        <BottomNav activeScreen={mainScreen} pendingCount={pendingSyncCount} onChange={setMainScreen} />
      </View>
    );
  }

  if (mainScreen === 'incidents') {
    return (
      <View style={styles.appShell}>
        <View style={styles.mainPane}>
          <Screen scroll={false}>
            <ModuleHeader
              title="Incident Management"
              subtitle={`${incidents.length} assigned active incident${incidents.length === 1 ? '' : 's'}`}
              onBack={() => setMainScreen('home')}
            />
            <IncidentsScreen incidents={incidents} isLoading={isLoading} onRefresh={refresh} onPendingChange={loadPending} />
          </Screen>
        </View>
        <BottomNav activeScreen={mainScreen} pendingCount={pendingSyncCount} onChange={setMainScreen} />
      </View>
    );
  }

  if (mainScreen === 'sync') {
    return (
      <View style={styles.appShell}>
        <View style={styles.mainPane}>
          <PendingSyncScreen
            pendingReadings={pendingReadings}
            pendingIncidentActions={pendingIncidentActions}
            isSyncing={isSyncing}
            onSync={() => void syncPending()}
          />
        </View>
        <BottomNav activeScreen={mainScreen} pendingCount={pendingSyncCount} onChange={setMainScreen} />
      </View>
    );
  }

  if (mainScreen === 'settings') {
    return (
      <View style={styles.appShell}>
        <View style={styles.mainPane}>
          <SettingsScreen />
        </View>
        <BottomNav activeScreen={mainScreen} pendingCount={pendingSyncCount} onChange={setMainScreen} />
      </View>
    );
  }

  return (
    <View style={styles.appShell}>
      <View style={styles.mainPane}>
        <Screen>
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Hello, {profile?.user.first_name || profile?.user.username}</Text>
              <Text style={styles.title}>Field Home</Text>
              <Text style={styles.subtitle}>{formatFriendlyDate(readingDate)}</Text>
            </View>
            <View style={styles.countBox}>
              <Text style={styles.count}>{pendingSyncCount}</Text>
              <Text style={styles.countLabel}>unsynced</Text>
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <SummaryPill label="Pending readings" value={pendingTasks.length} tone={colors.warning} />
            <SummaryPill label="Assigned incidents" value={incidents.length} tone={colors.danger} />
            <SummaryPill label="Unsynced items" value={pendingSyncCount} tone={colors.info} />
            <SummaryPill label="Submitted/approved" value={submittedAndApprovedCount} tone={colors.success} />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Modules</Text>
            {isLoading ? <ActivityIndicator color={colors.primary} size="small" /> : null}
          </View>

          <View style={styles.menuGrid}>
            <MenuTile
              title="Meter Reading"
              detail={`${pendingTasks.length} pending, ${submittedAndApprovedCount} completed`}
              count={tasks.length}
              tone={colors.primary}
              onPress={() => setMainScreen('meterReading')}
            />
            <MenuTile
              title="Incident Management"
              detail={`${incidents.length} assigned active`}
              count={incidents.length}
              tone={colors.danger}
              onPress={() => setMainScreen('incidents')}
            />
            <MenuTile
              title="Sync Center"
              detail={pendingSyncCount ? `${pendingSyncCount} item(s) need upload` : 'All local items uploaded'}
              count={pendingSyncCount}
              tone={colors.info}
              onPress={() => setMainScreen('sync')}
            />
            <MenuTile
              title="Settings"
              detail={profile?.role_display || profile?.role || 'User profile'}
              tone={colors.muted}
              onPress={() => setMainScreen('settings')}
            />
          </View>
        </Screen>
      </View>
      <BottomNav activeScreen={mainScreen} pendingCount={pendingSyncCount} onChange={setMainScreen} />
    </View>
  );
}

function emptyTitle(tab: ReadingTab) {
  if (tab === 'pending') return 'No pending readings';
  if (tab === 'submitted') return 'No submitted readings';
  if (tab === 'all') return 'No matching readings';
  return 'No approved readings';
}

function emptyMessage(tab: ReadingTab) {
  if (tab === 'pending') return 'All assigned meters have been read, or no meters are assigned for this date.';
  if (tab === 'submitted') return 'Readings you submit will appear here until supervisor approval.';
  if (tab === 'all') return 'Adjust search, date, meter type, or scope filters.';
  return 'Validated readings will appear here after supervisor approval.';
}

function SummaryPill({ label, value, tone = colors.primary }: { label: string; value: number; tone?: string }) {
  return (
    <View style={styles.pill}>
      <Text style={[styles.pillValue, { color: tone }]}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

function MeterReadingModule({
  activeTab,
  approvedCount,
  filteredTasks,
  isLoading,
  meterTypeFilter,
  onBack,
  onDateChange,
  onFilterChange,
  onRefresh,
  onScopeFilterChange,
  onSearchChange,
  onSelectTask,
  onTabChange,
  onToggleRouteView,
  pendingCount,
  readingDate,
  routeView,
  scopeFilter,
  searchTerm,
  submittedCount,
  totalCount,
}: {
  activeTab: ReadingTab;
  approvedCount: number;
  filteredTasks: ReadingTask[];
  isLoading: boolean;
  meterTypeFilter: MeterTypeFilter;
  onBack: () => void;
  onDateChange: (value: string) => void;
  onFilterChange: (value: MeterTypeFilter) => void;
  onRefresh: () => Promise<void>;
  onScopeFilterChange: (value: ScopeFilter) => void;
  onSearchChange: (value: string) => void;
  onSelectTask: (task: ReadingTask) => void;
  onTabChange: (tab: ReadingTab) => void;
  onToggleRouteView: () => void;
  pendingCount: number;
  readingDate: string;
  routeView: boolean;
  scopeFilter: ScopeFilter;
  searchTerm: string;
  submittedCount: number;
  totalCount: number;
}) {
  return (
    <Screen scroll={false}>
      <ModuleHeader title="Meter Reading" subtitle={formatFriendlyDate(readingDate)} onBack={onBack} />

      <View style={styles.summaryRow}>
        <SummaryPill label="Pending" value={pendingCount} tone={colors.warning} />
        <SummaryPill label="Submitted" value={submittedCount} tone={colors.info} />
        <SummaryPill label="Approved" value={approvedCount} tone={colors.success} />
      </View>

      <View style={styles.controls}>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Reading date</Text>
          <TextInputBox value={readingDate} onChangeText={onDateChange} placeholder="YYYY-MM-DD" />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Search</Text>
          <TextInputBox value={searchTerm} onChangeText={onSearchChange} placeholder="Meter, site, or zone" />
        </View>
      </View>

      <SegmentedTabs
        activeTab={activeTab}
        counts={{
          pending: pendingCount,
          submitted: submittedCount,
          approved: approvedCount,
          all: totalCount,
        }}
        onChange={onTabChange}
      />

      <View style={styles.filterRow}>
        <FilterChip label="All meters" active={meterTypeFilter === 'ALL'} onPress={() => onFilterChange('ALL')} />
        <FilterChip label="Water" active={meterTypeFilter === 'WATER'} onPress={() => onFilterChange('WATER')} />
        <FilterChip label="Energy" active={meterTypeFilter === 'ENERGY'} onPress={() => onFilterChange('ENERGY')} />
      </View>

      <View style={styles.filterRow}>
        <FilterChip label="All scopes" active={scopeFilter === 'ALL'} onPress={() => onScopeFilterChange('ALL')} />
        <FilterChip label="Sites" active={scopeFilter === 'PRODUCTION_SITE'} onPress={() => onScopeFilterChange('PRODUCTION_SITE')} />
        <FilterChip label="Zones" active={scopeFilter === 'ZONE'} onPress={() => onScopeFilterChange('ZONE')} />
      </View>

      <View style={styles.moduleActions}>
        <AppButton label={routeView ? 'List View' : 'Route View'} onPress={onToggleRouteView} variant="secondary" style={styles.actionButton} />
        <PendingFeature label="QR Scan" />
        <PendingFeature label="Unable To Read" />
        <PendingFeature label="Photo/GPS" />
        <PendingFeature label="Offline Tasks" />
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} />}
        >
          {filteredTasks.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{emptyTitle(activeTab)}</Text>
              <Text style={styles.emptyText}>{emptyMessage(activeTab)}</Text>
              <AppButton label="Refresh" onPress={onRefresh} variant="secondary" style={styles.refreshButton} />
            </View>
          ) : filteredTasks.map((task, index) => (
            <View key={`${task.meter_type}-${task.meter_id}`} style={styles.taskRow}>
              {routeView ? (
                <View style={styles.routeMarker}>
                  <Text style={styles.routeMarkerText}>{index + 1}</Text>
                </View>
              ) : null}
              <View style={styles.taskCardWrap}>
                <TaskCard task={task} onPress={() => onSelectTask(task)} />
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

function ModuleHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return (
    <View style={styles.moduleHeader}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>Back</Text>
      </Pressable>
      <View style={styles.moduleTitleBlock}>
        <Text style={styles.moduleTitle}>{title}</Text>
        <Text style={styles.moduleSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function MenuTile({
  title,
  detail,
  count,
  tone,
  onPress,
}: {
  title: string;
  detail: string;
  count?: number;
  tone: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuTile, pressed && styles.pressed]}>
      <View style={styles.menuTileTop}>
        <Text style={styles.menuTitle}>{title}</Text>
        {typeof count === 'number' ? (
          <View style={[styles.menuCount, { backgroundColor: `${tone}18` }]}>
            <Text style={[styles.menuCountText, { color: tone }]}>{count}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.menuDetail}>{detail}</Text>
      <Text style={[styles.menuAction, { color: tone }]}>Open</Text>
    </Pressable>
  );
}

function SegmentedTabs({
  activeTab,
  counts,
  onChange,
}: {
  activeTab: ReadingTab;
  counts: Record<ReadingTab, number>;
  onChange: (tab: ReadingTab) => void;
}) {
  const tabs: Array<{ key: ReadingTab; label: string }> = [
    { key: 'pending', label: 'Pending' },
    { key: 'submitted', label: 'Submitted' },
    { key: 'approved', label: 'Approved' },
    { key: 'all', label: 'All/Search' },
  ];

  return (
    <View style={styles.homeTabs}>
      {tabs.map(tab => (
        <Pressable
          key={tab.key}
          onPress={() => onChange(tab.key)}
          style={[styles.homeTab, activeTab === tab.key && styles.activeHomeTab]}
        >
          <Text style={[styles.homeTabText, activeTab === tab.key && styles.activeHomeTabText]}>{tab.label}</Text>
          <Text style={[styles.homeTabCount, activeTab === tab.key && styles.activeHomeTabText]}>{counts[tab.key]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.filterChip, active && styles.activeFilterChip]}>
      <Text style={[styles.filterChipText, active && styles.activeFilterChipText]}>{label}</Text>
    </Pressable>
  );
}

function PendingFeature({ label }: { label: string }) {
  const handlePress = () => {
    Alert.alert('Pending setup', `${label} needs backend or native support before field use.`);
  };
  return (
    <Pressable onPress={handlePress} style={styles.pendingFeature}>
      <Text style={styles.pendingFeatureLabel}>{label}</Text>
      <Text style={styles.pendingFeatureBadge}>Pending</Text>
    </Pressable>
  );
}

function TextInputBox({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      autoCapitalize="none"
      autoCorrect={false}
      style={styles.textInput}
    />
  );
}

function BottomNav({ activeScreen, pendingCount, onChange }: { activeScreen: MainScreen; pendingCount: number; onChange: (tab: MainScreen) => void }) {
  const tabs: Array<{ key: MainScreen; label: string }> = [
    { key: 'home', label: 'Home' },
    { key: 'meterReading', label: 'Readings' },
    { key: 'incidents', label: 'Incidents' },
    { key: 'sync', label: pendingCount ? `Sync (${pendingCount})` : 'Sync' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <View style={styles.tabBar}>
      {tabs.map(tab => (
        <Pressable key={tab.key} onPress={() => onChange(tab.key)} style={[styles.tab, activeScreen === tab.key && styles.activeTab]}>
          <Text style={[styles.tabText, activeScreen === tab.key && styles.activeTabText]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  appShell: {
    backgroundColor: colors.background,
    flex: 1,
  },
  mainPane: {
    flex: 1,
  },
  pressed: {
    opacity: 0.75,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  greeting: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  title: {
    color: colors.text,
    fontSize: 27,
    fontWeight: '800',
    marginTop: 3,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 2,
  },
  countBox: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 76,
    padding: 10,
  },
  count: {
    color: colors.warning,
    fontSize: 22,
    fontWeight: '900',
  },
  countLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  menuGrid: {
    gap: 10,
  },
  menuTile: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    minHeight: 98,
    padding: 14,
  },
  menuTileTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  menuTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
  },
  menuCount: {
    alignItems: 'center',
    borderRadius: 999,
    minWidth: 34,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  menuCountText: {
    fontSize: 13,
    fontWeight: '900',
  },
  menuDetail: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  menuAction: {
    fontSize: 13,
    fontWeight: '900',
  },
  homeTabs: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 12,
    padding: 4,
  },
  homeTab: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    gap: 2,
    minHeight: 52,
    justifyContent: 'center',
  },
  activeHomeTab: {
    backgroundColor: colors.surfaceAlt,
  },
  homeTabText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  homeTabCount: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  activeHomeTabText: {
    color: colors.primary,
  },
  pill: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flexBasis: '48%',
    flexGrow: 1,
    padding: 10,
  },
  pillValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  pillLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  moduleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 40,
    minWidth: 64,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  moduleTitleBlock: {
    flex: 1,
  },
  moduleTitle: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '900',
  },
  moduleSubtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  controls: {
    gap: 10,
    marginBottom: 12,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  textInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  activeFilterChip: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.primary,
  },
  filterChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  activeFilterChipText: {
    color: colors.primary,
  },
  moduleActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  actionButton: {
    minHeight: 42,
    width: '48%',
  },
  pendingFeature: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 8,
    width: '48%',
  },
  pendingFeatureLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  pendingFeatureBadge: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  list: {
    gap: 10,
    paddingBottom: 20,
  },
  taskRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 8,
  },
  taskCardWrap: {
    flex: 1,
  },
  routeMarker: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 34,
    justifyContent: 'center',
  },
  routeMarkerText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  empty: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    padding: 24,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.muted,
    marginTop: 6,
    textAlign: 'center',
  },
  refreshButton: {
    marginTop: 16,
    width: '100%',
  },
  tabBar: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'android' ? 22 : 10,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    paddingVertical: 10,
  },
  activeTab: {
    backgroundColor: colors.surfaceAlt,
  },
  tabText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  activeTabText: {
    color: colors.primary,
  },
});
