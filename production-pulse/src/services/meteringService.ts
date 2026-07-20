import { api } from './api';
import type {
  EnergyMeterReading,
  MeterReadingApprovalResponse,
  MeterReadingAssignment,
  ManagedUser,
  ManagedUserPayload,
  PaginatedResponse,
  DistributionWaterMeterAssignment,
  ProductionEnergyMeterAssignment,
  ProductionWaterMeterAssignment,
  UserProfile,
  WaterMeter,
  WaterMeterReading,
} from '@/types/api';

export type MeterReadingAssignmentPayload = {
  assignee_id: number;
  scope_type: 'PRODUCTION_SITE' | 'ZONE';
  production_site?: number | null;
  zone?: number | null;
  water_meter?: number | null;
  energy_meter?: number | null;
  is_active?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string;
};

export type PendingApprovalParams = {
  reading_date?: string;
  assignee?: number;
  scope_type?: 'PRODUCTION_SITE' | 'ZONE';
  production_site?: number;
  zone?: number;
};

export type ManagedUserParams = {
  is_active?: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
  metering_profile__role?: string;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
};

export const meteringService = {
  getMyProfile: () =>
    api.get<UserProfile>('/metering/user-profiles/me/'),

  getManagedUsers: (params?: ManagedUserParams) =>
    api.get<PaginatedResponse<ManagedUser>>('/metering/users/', params),

  getCurrentManagedUser: () =>
    api.get<ManagedUser>('/metering/users/me/'),

  createManagedUser: (payload: ManagedUserPayload) =>
    api.post<ManagedUser>('/metering/users/', payload),

  updateManagedUser: ({ id, ...payload }: Partial<ManagedUserPayload> & { id: number }) =>
    api.patch<ManagedUser>(`/metering/users/${id}/`, payload),

  deactivateManagedUser: (id: number) =>
    api.delete<ManagedUser>(`/metering/users/${id}/`),

  setManagedUserPassword: ({ id, password }: { id: number; password: string }) =>
    api.post<{ detail: string }>(`/metering/users/${id}/set_password/`, { password }),

  getWaterMeters: (params?: {
    is_active?: boolean;
    search?: string;
    ordering?: string;
  }) =>
    api.get<PaginatedResponse<WaterMeter>>('/metering/water-meters/', params),

  getUserProfiles: (params?: {
    role?: 'PRODUCTION_SUPERVISOR' | 'PUMP_OPERATOR' | 'ZONAL_OFFICER' | 'PLUMBER';
    user__is_active?: boolean;
    search?: string;
    ordering?: string;
  }) =>
    api.get<PaginatedResponse<UserProfile>>('/metering/user-profiles/', params),

  getMyMeterReadingAssignments: (params?: {
    scope_type?: 'PRODUCTION_SITE' | 'ZONE';
    production_site?: number;
    zone?: number;
    is_active?: boolean;
  }) =>
    api.get<MeterReadingAssignment[]>('/metering/meter-reading-assignments/mine/', params),

  getMeterReadingAssignments: (params?: {
    assignee?: number;
    scope_type?: 'PRODUCTION_SITE' | 'ZONE';
    production_site?: number;
    zone?: number;
    is_active?: boolean;
    ordering?: string;
    page_size?: number;
    reading_date?: string;
  }) =>
    api.get<PaginatedResponse<MeterReadingAssignment>>('/metering/meter-reading-assignments/', params),

  createMeterReadingAssignment: (assignment: MeterReadingAssignmentPayload) =>
    api.post<MeterReadingAssignment>('/metering/meter-reading-assignments/', assignment),

  updateMeterReadingAssignment: ({ id, ...assignment }: Partial<MeterReadingAssignmentPayload> & { id: number }) =>
    api.patch<MeterReadingAssignment>(`/metering/meter-reading-assignments/${id}/`, assignment),

  getPendingApprovals: (params?: PendingApprovalParams) =>
    api.get<MeterReadingApprovalResponse>('/metering/meter-reading-assignments/pending_approvals/', params),

  approveReading: (data: { reading_type: 'WATER' | 'ENERGY'; reading_id: number }) =>
    api.post<{ approved: number }>('/metering/meter-reading-assignments/approve_reading/', data),

  bulkApproveReadings: (data: PendingApprovalParams) =>
    api.post<{ approved: number; count: number }>('/metering/meter-reading-assignments/bulk_approve/', data),

  delegateApproval: ({ assignmentId, delegate_id }: { assignmentId: number; delegate_id: number | null }) =>
    api.post<MeterReadingAssignment>(
      `/metering/meter-reading-assignments/${assignmentId}/delegate_approval/`,
      { delegate_id },
    ),

  getProductionWaterAssignments: (params?: {
    production_site?: number;
    production_site__region?: number;
    assignment_role?: 'ABSTRACTION' | 'SUPPLY';
    is_active?: boolean;
  }) =>
    api.get<PaginatedResponse<ProductionWaterMeterAssignment>>('/metering/production-water-assignments/', params),

  getProductionEnergyAssignments: (params?: {
    production_site?: number;
    production_site__region?: number;
    assignment_role?: 'GRID' | 'SOLAR';
    is_active?: boolean;
  }) =>
    api.get<PaginatedResponse<ProductionEnergyMeterAssignment>>('/metering/production-energy-assignments/', params),

  getDistributionWaterAssignments: (params?: {
    zone?: number;
    zone__region?: number;
    dma?: number;
    assignment_role?: 'ZONE_INLET' | 'DMA_INLET' | 'BULK_SUPPLY' | 'TRANSMISSION';
    is_active?: boolean;
  }) =>
    api.get<PaginatedResponse<DistributionWaterMeterAssignment>>('/metering/distribution-water-assignments/', params),

  bulkCreateWaterMeterReadings: (readings: Array<{
    water_meter: number;
    reading_date: string;
    current_reading: number;
    reading_method?: string;
    notes?: string;
  }>) =>
    api.post<WaterMeterReading[]>('/metering/water-meter-readings/bulk_create/', readings),

  bulkCreateEnergyMeterReadings: (readings: Array<{
    energy_meter: number;
    reading_date: string;
    current_reading: number;
    reading_method?: string;
    notes?: string;
  }>) =>
    api.post<EnergyMeterReading[]>('/metering/energy-meter-readings/bulk_create/', readings),
};
