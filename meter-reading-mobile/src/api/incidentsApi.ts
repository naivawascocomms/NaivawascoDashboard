import { apiRequest, resultsFrom } from './client';
import type {
  Incident,
  IncidentComment,
  IncidentListResponse,
  IncidentPayload,
  IncidentStatus,
  IncidentUserProfile,
  PendingIncidentAction,
} from '../types/incidents';

type BackendIncident = {
  id: number;
  type?: 'production' | 'distribution';
  incident_type?: 'production' | 'distribution';
  category: string;
  description: string;
  location: string;
  production_site_name: string | null;
  zone_name: string | null;
  zone_region_name: string | null;
  reported_by: string;
  reported_at: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in-progress' | 'resolved';
  assigned_to_user: number | null;
  assigned_to_user_name: string | null;
  assigned_to: string;
  resolved_by: string;
  resolved_at: string | null;
  resolution_notes: string;
  estimated_impact_m3: string | number | null;
  comment_count: number;
  comments: BackendIncidentComment[];
};

type BackendIncidentComment = {
  id: number;
  incident: number;
  comment: string;
  status_from: string;
  status_to: string;
  created_by_name: string | null;
  created_at: string;
};

type BackendUserOption = {
  id: number;
  username: string;
  display_name: string;
  email: string;
};

function mapComment(comment: BackendIncidentComment): IncidentComment {
  return {
    id: comment.id,
    incident: comment.incident,
    comment: comment.comment,
    status_from: comment.status_from || '',
    status_to: comment.status_to || '',
    created_by_name: comment.created_by_name,
    created_at: comment.created_at,
  };
}

function mapIncident(incident: BackendIncident): Incident {
  const assignedTo = incident.assigned_to_user == null ? '' : String(incident.assigned_to_user);
  return {
    id: incident.id,
    type: incident.type || incident.incident_type || 'distribution',
    category: incident.category,
    description: incident.description,
    location: incident.location,
    production_site_name: incident.production_site_name,
    zone_name: incident.zone_name,
    zone_region_name: incident.zone_region_name,
    reported_by: incident.reported_by || '',
    reported_at: incident.reported_at,
    priority: incident.priority,
    status: incident.status,
    assigned_to: assignedTo,
    assigned_to_name: incident.assigned_to_user_name || incident.assigned_to || '',
    resolved_by: incident.resolved_by || '',
    resolved_at: incident.resolved_at,
    resolution_notes: incident.resolution_notes || '',
    estimated_impact_m3: incident.estimated_impact_m3 == null ? null : String(incident.estimated_impact_m3),
    comment_count: incident.comment_count || incident.comments?.length || 0,
    comments: (incident.comments || []).map(mapComment),
  };
}

export async function getIncidentAssignableProfiles() {
  const payload = await apiRequest<BackendUserOption[] | { results?: BackendUserOption[] }>('/incidents/users/');
  return resultsFrom(payload).map(user => ({
    id: String(user.id),
    username: user.username,
    full_name: user.display_name,
    display_name: user.display_name || user.username,
    role: '',
  })) satisfies IncidentUserProfile[];
}

export async function getAssignedIncidents() {
  const payload = await apiRequest<IncidentListResponse | BackendIncident[] | { results?: BackendIncident[] }>('/incidents/incidents/assigned_to_me/?active=true');
  const results = resultsFrom(payload as BackendIncident[] | { results?: BackendIncident[] }).map(mapIncident);
  return {
    count: typeof (payload as IncidentListResponse)?.count === 'number' ? (payload as IncidentListResponse).count : results.length,
    next: (payload as IncidentListResponse)?.next || null,
    previous: (payload as IncidentListResponse)?.previous || null,
    results,
  } satisfies IncidentListResponse;
}

export async function reportIncident(payload: IncidentPayload) {
  await apiRequest<BackendIncident>('/incidents/incidents/', {
    method: 'POST',
    body: {
      type: payload.type,
      incident_type: payload.type,
      category: payload.category,
      description: payload.description,
      location: payload.location,
      priority: payload.priority,
      assigned_to_user: payload.assignedToProfileId ? Number(payload.assignedToProfileId) : null,
      estimated_impact_m3: payload.estimatedImpactM3 ? payload.estimatedImpactM3 : null,
      mobile_external_id: payload.mobileExternalId || undefined,
      notes: payload.notes || '',
    },
  });
}

export async function updateIncidentStatus(id: string | number, status: IncidentStatus, comment?: string) {
  const data = await apiRequest<BackendIncident>(`/incidents/incidents/${id}/update_status/`, {
    method: 'POST',
    body: {
      status,
      comment: comment || '',
    },
  });
  return mapIncident(data);
}

export async function updateIncidentAssignee(id: string | number, assignedToProfileId: string) {
  await apiRequest<BackendIncident>(`/incidents/incidents/${id}/`, {
    method: 'PATCH',
    body: {
      assigned_to_user: Number(assignedToProfileId),
    },
  });
}

export async function addIncidentComment(id: string | number, comment: string, mobileExternalId?: string) {
  const data = await apiRequest<BackendIncidentComment>(`/incidents/incidents/${id}/add_comment/`, {
    method: 'POST',
    body: {
      comment,
      mobile_external_id: mobileExternalId || undefined,
    },
  });
  return mapComment(data);
}

export async function performPendingIncidentAction(action: PendingIncidentAction) {
  if (action.actionType === 'report') {
    await reportIncident(action.payload);
    return;
  }
  if (action.actionType === 'status') {
    await updateIncidentStatus(action.incidentId, action.payload.status, action.payload.comment);
    return;
  }
  if (action.actionType === 'comment') {
    await addIncidentComment(action.incidentId, action.payload.comment, action.payload.mobileExternalId);
    return;
  }
  await updateIncidentAssignee(action.incidentId, action.payload.assignedToProfileId);
}
