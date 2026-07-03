export type IncidentType = 'production' | 'distribution';
export type IncidentStatus = 'open' | 'in-progress' | 'resolved';
export type IncidentPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Incident {
  id: number;
  type: IncidentType;
  incident_type?: IncidentType;
  category: string;
  description: string;
  location: string;
  production_site: number | null;
  production_site_name: string | null;
  zone: number | null;
  zone_name: string | null;
  zone_region_name: string | null;
  reported_by: string;
  reported_at: string;
  status: IncidentStatus;
  priority: IncidentPriority;
  assigned_to_user: number | null;
  assigned_to_user_name: string | null;
  assigned_to: string;
  resolved_by: string;
  resolved_at: string | null;
  resolution_notes: string;
  estimated_impact_m3: string | null;
  customer_notifications_sent: boolean;
  notes: string;
  comment_count: number;
  comments: IncidentComment[];
  created_at: string;
  updated_at: string;
}

export interface IncidentComment {
  id: number;
  incident: number;
  comment: string;
  status_from: string;
  status_to: string;
  created_by_name: string | null;
  created_at: string;
}

export interface IncidentSummary {
  total: number;
  open: number;
  in_progress: number;
  resolved: number;
  critical_open: number;
  overdue: number;
  production: number;
  distribution: number;
}

export interface IncidentUser {
  id: number;
  username: string;
  display_name: string;
  email: string;
}

export const incidentCategories = {
  production: ['Pump Failure', 'Power Outage', 'Treatment Issue', 'Chemical Shortage', 'Equipment Malfunction', 'Water Quality Issue'],
  distribution: ['Burst Pipe', 'Leak', 'Low Pressure', 'No Water Supply', 'Meter Fault', 'Illegal Connection', 'Valve Issue']
} satisfies Record<IncidentType, string[]>;
