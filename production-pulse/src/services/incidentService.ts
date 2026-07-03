import { api } from './api';
import type {
  Incident,
  IncidentPriority,
  IncidentStatus,
  IncidentSummary,
  IncidentType,
  IncidentUser,
} from '@/types/incident';
import type { PaginatedResponse } from '@/types/api';

export type IncidentListParams = {
  incident_type?: IncidentType;
  status?: IncidentStatus;
  priority?: IncidentPriority;
  zone?: number;
  production_site?: number;
  search?: string;
  active?: boolean;
  ordering?: string;
};

export type IncidentCreateInput = {
  type: IncidentType;
  category: string;
  description: string;
  location: string;
  priority: IncidentPriority;
  assigned_to_user?: number | null;
  production_site?: number | null;
  zone?: number | null;
  estimated_impact_m3?: number | string | null;
  customer_notifications_sent?: boolean;
  notes?: string;
};

export type IncidentUpdateInput = Partial<IncidentCreateInput> & {
  status?: IncidentStatus;
  resolution_notes?: string;
  resolved_by?: string;
};

export const incidentService = {
  getIncidents: (params?: IncidentListParams) =>
    api.get<PaginatedResponse<Incident>>('/incidents/incidents/', params),

  getSummary: (params?: IncidentListParams) =>
    api.get<IncidentSummary>('/incidents/incidents/summary/', params),

  createIncident: (data: IncidentCreateInput) =>
    api.post<Incident>('/incidents/incidents/', data),

  updateIncident: (id: number, data: IncidentUpdateInput) =>
    api.patch<Incident>(`/incidents/incidents/${id}/`, data),

  getUsers: (params?: { search?: string }) =>
    api.get<PaginatedResponse<IncidentUser>>('/incidents/users/', params),

  getCurrentUser: () =>
    api.get<IncidentUser>('/incidents/users/me/'),

  updateStatus: (
    id: number,
    data: {
      status: IncidentStatus;
      comment?: string;
      resolved_by?: string;
      resolution_notes?: string;
    },
  ) => api.post<Incident>(`/incidents/incidents/${id}/update_status/`, data),

  addComment: (id: number, comment: string) =>
    api.post(`/incidents/incidents/${id}/add_comment/`, { comment }),
};
