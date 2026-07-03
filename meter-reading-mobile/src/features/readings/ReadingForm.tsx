import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../../components/AppButton';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { colors } from '../../theme/colors';
import { currentTime } from '../../utils/date';
import type { ReadingPayload, ReadingTask } from '../../types/metering';

type Props = {
  task: ReadingTask;
  onCancel: () => void;
  onSubmit: (payload: ReadingPayload) => Promise<void>;
};

export function ReadingForm({ task, onCancel, onSubmit }: Props) {
  const [currentReading, setCurrentReading] = useState(task.today_reading?.current_reading || '');
  const [notes, setNotes] = useState(task.today_reading?.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const previousReading = Number(task.previous_reading_value || 0);
  const enteredReading = Number(currentReading || 0);

  const consumption = useMemo(() => {
    if (!currentReading || Number.isNaN(enteredReading)) return null;
    return enteredReading - previousReading;
  }, [currentReading, enteredReading, previousReading]);

  const handleSubmit = async () => {
    if (!currentReading.trim() || Number.isNaN(enteredReading)) {
      Alert.alert('Invalid reading', 'Enter a valid numeric meter reading.');
      return;
    }
    if (enteredReading < previousReading) {
      Alert.alert('Invalid reading', 'Current reading cannot be less than previous reading.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        meterType: task.meter_type,
        meterId: task.meter_id,
        readingDate: task.reading_date,
        readingTime: currentTime(),
        currentReading,
        notes,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{task.meter_label}</Text>
        <Text style={styles.subtitle}>{task.meter_type === 'WATER' ? 'Water meter' : 'Energy meter'} reading</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>{task.reading_date}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Previous reading</Text>
          <Text style={styles.value}>{task.previous_reading_value}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Estimated consumption</Text>
          <Text style={[styles.value, consumption != null && consumption < 0 && styles.danger]}>
            {consumption == null ? '-' : consumption.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </Text>
        </View>
      </View>

      <View style={styles.form}>
        <TextField
          label="Current reading"
          value={currentReading}
          onChangeText={setCurrentReading}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />
        <TextField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional field notes"
          multiline
          autoCapitalize="sentences"
        />
      </View>

      <View style={styles.actions}>
        <AppButton label="Submit Reading" onPress={handleSubmit} loading={isSubmitting} />
        <AppButton label="Cancel" onPress={onCancel} variant="secondary" />
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
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    color: colors.muted,
    fontSize: 14,
  },
  value: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  danger: {
    color: colors.danger,
  },
  form: {
    gap: 16,
    marginTop: 18,
  },
  actions: {
    gap: 10,
    marginTop: 22,
  },
});
