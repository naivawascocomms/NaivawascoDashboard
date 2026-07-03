import { apiRequest } from './client';
import type { MeterReading, ReadingPayload, ReadingTask, ReadingTaskResponse, UserProfile } from '../types/metering';

type BackendReadingTask = Omit<ReadingTask, 'initial_reading' | 'previous_reading_value' | 'today_reading'> & {
  initial_reading: string | number | null;
  previous_reading_value: string | number | null;
  today_reading: MeterReading | null;
};

type BackendReadingTaskResponse = {
  date: string;
  count: number;
  results: BackendReadingTask[];
};

function asDecimal(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '0.00';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : String(value);
}

function mapReading(reading: MeterReading | null): MeterReading | null {
  if (!reading) return null;
  return {
    ...reading,
    current_reading: asDecimal(reading.current_reading),
    previous_reading: reading.previous_reading == null ? null : asDecimal(reading.previous_reading),
    consumption: reading.consumption == null ? null : asDecimal(reading.consumption),
    meter_display_name: reading.meter_display_name || '',
    meter_label: reading.meter_label || reading.meter_number,
    notes: reading.notes || '',
  };
}

function mapTask(task: BackendReadingTask): ReadingTask {
  return {
    ...task,
    initial_reading: asDecimal(task.initial_reading),
    previous_reading_value: asDecimal(task.previous_reading_value),
    today_reading: mapReading(task.today_reading),
    status: task.status,
    display_name: task.display_name || '',
    scopes: task.scopes || [],
    assignment_ids: task.assignment_ids || [],
  };
}

export async function getMe() {
  return apiRequest<UserProfile>('/metering/user-profiles/me/');
}

export async function getTodayReadingTasks(date: string) {
  const response = await apiRequest<BackendReadingTaskResponse>(`/metering/meter-reading-assignments/today/?date=${encodeURIComponent(date)}`);
  return {
    ...response,
    results: (response.results || []).map(mapTask),
  } satisfies ReadingTaskResponse;
}

export async function submitReading(payload: ReadingPayload) {
  const endpoint = payload.meterType === 'WATER'
    ? '/metering/water-meter-readings/submit/'
    : '/metering/energy-meter-readings/submit/';
  const meterField = payload.meterType === 'WATER' ? 'water_meter' : 'energy_meter';

  const reading = await apiRequest<MeterReading>(endpoint, {
    method: 'POST',
    body: {
      [meterField]: payload.meterId,
      reading_date: payload.readingDate,
      reading_time: payload.readingTime,
      current_reading: payload.currentReading,
      reading_method: 'MANUAL',
      notes: payload.notes || '',
    },
  });

  return mapReading(reading);
}
