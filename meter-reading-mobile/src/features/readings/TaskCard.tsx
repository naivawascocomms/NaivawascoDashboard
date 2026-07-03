import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../theme/colors';
import type { ReadingTask } from '../../types/metering';

type Props = {
  task: ReadingTask;
  onPress: () => void;
};

function scopeLabel(task: ReadingTask) {
  const names = task.scopes
    .map(scope => scope.production_site_name || scope.zone_name)
    .filter(Boolean);
  return Array.from(new Set(names)).join(', ') || 'Assigned meter';
}

export function TaskCard({ task, onPress }: Props) {
  const statusColor = task.status === 'validated'
    ? colors.success
    : task.status === 'submitted'
      ? colors.info
      : colors.warning;
  const statusLabel = task.status === 'validated'
    ? 'Validated'
    : task.status === 'submitted'
      ? 'Submitted'
      : 'Missing';

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.meterLabel}>{task.meter_label}</Text>
          <Text style={styles.scope}>{scopeLabel(task)}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: `${statusColor}18` }]}>
          <Text style={[styles.badgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <View>
          <Text style={styles.metricLabel}>Previous</Text>
          <Text style={styles.metricValue}>{task.previous_reading_value}</Text>
        </View>
        <View>
          <Text style={styles.metricLabel}>Last Date</Text>
          <Text style={styles.metricValue}>{task.previous_reading_date || 'Initial'}</Text>
        </View>
        <View>
          <Text style={styles.metricLabel}>Today</Text>
          <Text style={styles.metricValue}>{task.today_reading?.current_reading || '-'}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 14,
    padding: 14,
  },
  pressed: {
    opacity: 0.75,
  },
  topRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  titleBlock: {
    flex: 1,
    gap: 4,
  },
  meterLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  scope: {
    color: colors.muted,
    fontSize: 13,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  metricValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 3,
  },
});
