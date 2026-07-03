import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/AppButton';
import { Screen } from '../../components/Screen';
import { colors } from '../../theme/colors';
import type { PendingIncidentAction } from '../../types/incidents';
import type { PendingReading } from '../../types/metering';

type Props = {
  pendingReadings: PendingReading[];
  pendingIncidentActions: PendingIncidentAction[];
  isSyncing: boolean;
  onSync: () => void;
};

function actionLabel(action: PendingIncidentAction) {
  if (action.actionType === 'report') return 'Incident report';
  if (action.actionType === 'status') return 'Status update';
  if (action.actionType === 'comment') return 'Incident comment';
  return 'Assignment update';
}

export function PendingSyncScreen({ pendingReadings, pendingIncidentActions, isSyncing, onSync }: Props) {
  const totalPending = pendingReadings.length + pendingIncidentActions.length;
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Pending Sync</Text>
        <Text style={styles.subtitle}>{totalPending} item{totalPending === 1 ? '' : 's'} waiting to upload. The app retries automatically while open.</Text>
      </View>

      <AppButton label="Sync Pending Items" onPress={onSync} loading={isSyncing} disabled={!totalPending} />

      <View style={styles.list}>
        {totalPending === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing pending</Text>
            <Text style={styles.emptyText}>Failed submissions will appear here and can be retried.</Text>
          </View>
        ) : (
          <>
            {pendingReadings.map(item => (
              <View key={item.localId} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.meter}>{item.meterLabel}</Text>
                  <Text style={styles.status}>{item.status}</Text>
                </View>
                <Text style={styles.detail}>{item.readingDate} at {item.readingTime}</Text>
                <Text style={styles.value}>Reading: {item.currentReading}</Text>
                {item.error ? <Text style={styles.error}>{item.error}</Text> : null}
                {item.retryable === false ? <Text style={styles.error}>Needs correction before it can sync.</Text> : null}
              </View>
            ))}
            {pendingIncidentActions.map(item => (
              <View key={item.localId} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.meter}>{item.title}</Text>
                  <Text style={styles.status}>{item.status}</Text>
                </View>
                <Text style={styles.detail}>{actionLabel(item)}</Text>
                <Text style={styles.value}>{new Date(item.createdAt).toLocaleString()}</Text>
                {item.error ? <Text style={styles.error}>{item.error}</Text> : null}
                {item.retryable === false ? <Text style={styles.error}>Needs correction before it can sync.</Text> : null}
              </View>
            ))}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 4,
    marginBottom: 16,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
  },
  list: {
    gap: 10,
    marginTop: 16,
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
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  meter: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  status: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  detail: {
    color: colors.muted,
    fontSize: 13,
  },
  value: {
    color: colors.text,
    fontWeight: '700',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
});
