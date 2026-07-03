import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

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

type HomeTab = 'pendingTasks' | 'submittedTasks' | 'approvedReadings' | 'incidents';
type MainTab = 'home' | 'sync' | 'settings';

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
  const [mainTab, setMainTab] = useState<MainTab>('home');
  const [homeTab, setHomeTab] = useState<HomeTab>('pendingTasks');
  const [selectedTask, setSelectedTask] = useState<ReadingTask | null>(null);
  const [tasks, setTasks] = useState<ReadingTask[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [pendingReadings, setPendingReadings] = useState<PendingReading[]>([]);
  const [pendingIncidentActions, setPendingIncidentActions] = useState<PendingIncidentAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const readingDate = todayIso();

  const pendingTasks = useMemo(() => tasks.filter(task => task.status === 'missing'), [tasks]);
  const submittedTasks = useMemo(() => tasks.filter(task => task.status === 'submitted'), [tasks]);
  const approvedReadings = useMemo(() => tasks.filter(task => task.status === 'validated'), [tasks]);
  const activeHomeTasks = homeTab === 'pendingTasks'
    ? pendingTasks
    : homeTab === 'submittedTasks'
      ? submittedTasks
      : homeTab === 'approvedReadings'
        ? approvedReadings
        : [];

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

  if (mainTab === 'sync') {
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
        <BottomNav activeTab={mainTab} pendingCount={pendingReadings.length + pendingIncidentActions.length} onChange={setMainTab} />
      </View>
    );
  }

  if (mainTab === 'settings') {
    return (
      <View style={styles.appShell}>
        <View style={styles.mainPane}>
          <SettingsScreen />
        </View>
        <BottomNav activeTab={mainTab} pendingCount={pendingReadings.length + pendingIncidentActions.length} onChange={setMainTab} />
      </View>
    );
  }

  return (
    <View style={styles.appShell}>
      <View style={styles.mainPane}>
        <Screen scroll={false}>
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Hello, {profile?.user.first_name || profile?.user.username}</Text>
              <Text style={styles.title}>Field Dashboard</Text>
              <Text style={styles.subtitle}>{formatFriendlyDate(readingDate)}</Text>
            </View>
            <View style={styles.countBox}>
              <Text style={styles.count}>{pendingTasks.length}</Text>
              <Text style={styles.countLabel}>pending</Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <SummaryPill label="Pending" value={pendingTasks.length} />
            <SummaryPill label="Submitted" value={submittedTasks.length} />
            <SummaryPill label="Approved" value={approvedReadings.length} />
          </View>

          <HomeTabs activeTab={homeTab} onChange={setHomeTab} counts={{
            pendingTasks: pendingTasks.length,
            submittedTasks: submittedTasks.length,
            approvedReadings: approvedReadings.length,
            incidents: incidents.length,
          }} />

          {isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : homeTab === 'incidents' ? (
            <IncidentsScreen incidents={incidents} isLoading={isLoading} onRefresh={refresh} onPendingChange={loadPending} />
          ) : (
            <ScrollView
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} />}
            >
              {activeHomeTasks.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>{emptyTitle(homeTab)}</Text>
                  <Text style={styles.emptyText}>{emptyMessage(homeTab)}</Text>
                  <AppButton label="Refresh" onPress={refresh} variant="secondary" style={styles.refreshButton} />
                </View>
              ) : activeHomeTasks.map(task => (
                <TaskCard key={`${task.meter_type}-${task.meter_id}`} task={task} onPress={() => setSelectedTask(task)} />
              ))}
            </ScrollView>
          )}
        </Screen>
      </View>
      <BottomNav activeTab={mainTab} pendingCount={pendingReadings.length + pendingIncidentActions.length} onChange={setMainTab} />
    </View>
  );
}

function emptyTitle(tab: HomeTab) {
  if (tab === 'pendingTasks') return 'No pending readings';
  if (tab === 'submittedTasks') return 'No submitted readings';
  return 'No approved readings';
}

function emptyMessage(tab: HomeTab) {
  if (tab === 'pendingTasks') return 'All assigned meters have been read, or no meters are assigned for today.';
  if (tab === 'submittedTasks') return 'Readings you submit today will appear here until they are validated.';
  return 'Validated readings will appear here after supervisor approval.';
}

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillValue}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

function HomeTabs({
  activeTab,
  onChange,
  counts,
}: {
  activeTab: HomeTab;
  onChange: (tab: HomeTab) => void;
  counts: Record<HomeTab, number>;
}) {
  const tabs: Array<{ key: HomeTab; label: string }> = [
    { key: 'pendingTasks', label: 'Pending' },
    { key: 'submittedTasks', label: 'Submitted' },
    { key: 'approvedReadings', label: 'Approved' },
    { key: 'incidents', label: 'Incidents' },
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

function BottomNav({ activeTab, pendingCount, onChange }: { activeTab: MainTab; pendingCount: number; onChange: (tab: MainTab) => void }) {
  const tabs: Array<{ key: MainTab; label: string }> = [
    { key: 'home', label: 'Home' },
    { key: 'sync', label: pendingCount ? `Sync (${pendingCount})` : 'Sync' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <View style={styles.tabBar}>
      {tabs.map(tab => (
        <Pressable key={tab.key} onPress={() => onChange(tab.key)} style={[styles.tab, activeTab === tab.key && styles.activeTab]}>
          <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>{tab.label}</Text>
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
    flex: 1,
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
  list: {
    gap: 10,
    paddingBottom: 20,
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
