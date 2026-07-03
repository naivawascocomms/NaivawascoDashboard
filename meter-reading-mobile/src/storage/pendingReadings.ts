import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PendingReading } from '../types/metering';

const PENDING_READINGS_KEY = 'naivawasco.pendingReadings';

export async function getPendingReadings(): Promise<PendingReading[]> {
  const raw = await AsyncStorage.getItem(PENDING_READINGS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function savePendingReadings(readings: PendingReading[]) {
  await AsyncStorage.setItem(PENDING_READINGS_KEY, JSON.stringify(readings));
}

export async function queuePendingReading(reading: PendingReading) {
  const readings = await getPendingReadings();
  const withoutSameReading = readings.filter(
    item => !(item.meterType === reading.meterType && item.meterId === reading.meterId && item.readingDate === reading.readingDate),
  );
  await savePendingReadings([...withoutSameReading, reading]);
}

export async function removePendingReading(localId: string) {
  const readings = await getPendingReadings();
  await savePendingReadings(readings.filter(item => item.localId !== localId));
}
