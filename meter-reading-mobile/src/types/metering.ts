export type MeterType = 'WATER' | 'ENERGY';
export type ReadingTaskStatus = 'missing' | 'submitted' | 'validated';

export type UserProfile = {
  id: number;
  role: string;
  role_display: string;
  phone_number: string;
  can_assign_readings: boolean;
  can_receive_reading_assignments: boolean;
  user: {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
    full_name: string;
    is_active: boolean;
  };
};

export type MeterReading = {
  id: number | string;
  water_meter?: number;
  energy_meter?: number;
  meter_number: string;
  meter_display_name: string;
  meter_label: string;
  submitted_by: number | null;
  submitted_by_username: string | null;
  reading_date: string;
  reading_time: string;
  current_reading: string;
  previous_reading: string | null;
  consumption: string | null;
  read_by: string;
  reading_method: string;
  is_validated: boolean;
  is_anomaly: boolean;
  notes: string;
};

export type ReadingScope = {
  scope_type: 'PRODUCTION_SITE' | 'ZONE';
  production_site_id: number | null;
  production_site_name: string | null;
  zone_id: number | null;
  zone_name: string | null;
};

export type ReadingTask = {
  meter_type: MeterType;
  meter_id: number;
  meter_number: string;
  meter_label: string;
  display_name: string;
  reading_date: string;
  initial_reading: string;
  previous_reading_date: string | null;
  previous_reading_value: string;
  today_reading: MeterReading | null;
  status: ReadingTaskStatus;
  assignment_ids: number[];
  scopes: ReadingScope[];
};

export type ReadingTaskResponse = {
  date: string;
  count: number;
  results: ReadingTask[];
};

export type ReadingPayload = {
  meterType: MeterType;
  meterId: number;
  readingDate: string;
  readingTime: string;
  currentReading: string;
  notes?: string;
};

export type PendingReading = ReadingPayload & {
  localId: string;
  meterLabel: string;
  createdAt: string;
  status: 'pending' | 'syncing' | 'failed';
  retryable?: boolean;
  error?: string;
};
