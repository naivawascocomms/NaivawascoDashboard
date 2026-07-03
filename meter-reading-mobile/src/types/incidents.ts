export type IncidentType = 'production' | 'distribution';
export type IncidentStatus = 'open' | 'in-progress' | 'resolved';
export type IncidentPriority = 'low' | 'medium' | 'high' | 'critical';

export type Incident = {
  id: number | string;
  type: IncidentType;
  category: string;
  description: string;
  location: string;
  production_site_name: string | null;
  zone_name: string | null;
  zone_region_name: string | null;
  reported_by: string;
  reported_at: string;
  priority: IncidentPriority;
  status: IncidentStatus;
  assigned_to: string;
  assigned_to_name: string;
  resolved_by: string;
  resolved_at: string | null;
  resolution_notes: string;
  estimated_impact_m3: string | null;
  comment_count: number;
  comments: IncidentComment[];
};

export type IncidentComment = {
  id: number | string;
  incident: number | string;
  comment: string;
  status_from: string;
  status_to: string;
  created_by_name: string | null;
  created_at: string;
};

export type IncidentListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: Incident[];
};

export type IncidentPayload = {
  type: IncidentType;
  category: string;
  description: string;
  location: string;
  priority: IncidentPriority;
  assignedToProfileId: string;
  estimatedImpactM3?: string;
  mobileExternalId?: string;
  notes?: string;
};

export type IncidentUserProfile = {
  id: string;
  username: string;
  full_name: string | null;
  display_name: string;
  role: string;
};

export type PendingIncidentAction =
  | {
    localId: string;
    actionType: 'report';
    title: string;
    payload: IncidentPayload;
    createdAt: string;
    status: 'pending' | 'syncing' | 'failed';
    retryable?: boolean;
    error?: string;
  }
  | {
    localId: string;
    actionType: 'status';
    title: string;
    incidentId: number | string;
    payload: {
      status: IncidentStatus;
      comment?: string;
    };
    createdAt: string;
    status: 'pending' | 'syncing' | 'failed';
    retryable?: boolean;
    error?: string;
  }
  | {
    localId: string;
    actionType: 'comment';
    title: string;
    incidentId: number | string;
    payload: {
      comment: string;
      mobileExternalId?: string;
    };
    createdAt: string;
    status: 'pending' | 'syncing' | 'failed';
    retryable?: boolean;
    error?: string;
  }
  | {
    localId: string;
    actionType: 'assign';
    title: string;
    incidentId: number | string;
    payload: {
      assignedToProfileId: string;
    };
    createdAt: string;
    status: 'pending' | 'syncing' | 'failed';
    retryable?: boolean;
    error?: string;
  };

export const incidentCategories: Record<IncidentType, string[]> = {
  production: [
    'Pump Failure',
    'Power Outage',
    'Treatment Issue',
    'Chemical Shortage',
    'Equipment Malfunction',
    'Water Quality Issue',
  ],
  distribution: [
    'Burst Pipe',
    'Leak',
    'Low Pressure',
    'No Water Supply',
    'Meter Fault',
    'Illegal Connection',
    'Valve Issue',
  ],
};
