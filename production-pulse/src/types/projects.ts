export type ProjectStatus = 'planned' | 'ongoing' | 'stalled' | 'completed' | 'closed';
export type ProjectHealth = 'on_track' | 'delayed' | 'blocked' | 'completed' | 'watch';
export type ProjectVisibility = 'internal' | 'management' | 'report';

export interface Project {
  id: number;
  name: string;
  project_code?: string | null;
  project_type: string;
  description: string;
  funding_source: string;
  budget_amount?: string | number | null;
  contractor: string;
  consultant: string;
  location: string;
  status: ProjectStatus;
  health: ProjectHealth;
  start_date?: string | null;
  target_completion_date?: string | null;
  actual_completion_date?: string | null;
  is_active: boolean;
  notes: string;
  component_count?: number;
  file_count?: number;
  issue_count?: number;
  open_issue_count?: number;
}

export interface ProjectComponent {
  id: number;
  project: number;
  title: string;
  description: string;
  unit: string;
  planned_quantity?: string | number | null;
  status: string;
  target_completion_date?: string | null;
  display_order: number;
}

export interface ProjectReport {
  id: number;
  title: string;
  year: number;
  month: number;
  department: string;
  classification: string;
  previous_status_date?: string | null;
  current_status_date: string;
  status: 'draft' | 'submitted' | 'approved' | 'published' | 'archived';
  prepared_by_name: string;
  prepared_at?: string | null;
  executive_summary: string;
  update_count?: number;
  active_project_count?: number;
  average_completion?: string | number | null;
}

export interface ProjectProgressItem {
  id: number;
  monthly_update: number;
  component?: number | null;
  component_title?: string | null;
  title: string;
  description: string;
  unit: string;
  planned_quantity?: string | number | null;
  completed_quantity?: string | number | null;
  percent_complete?: string | number | null;
  status_text: string;
  visibility: ProjectVisibility;
  display_order: number;
}

export interface ProjectKpiValue {
  id: number;
  kpi: number;
  kpi_name: string;
  kpi_code: string;
  unit: string;
  report: number;
  monthly_update?: number | null;
  target_value_snapshot?: string | number | null;
  actual_value?: string | number | null;
  actual_text: string;
  percent_complete?: string | number | null;
  notes: string;
}

export interface ProjectMonthlyUpdate {
  id: number;
  report: number;
  project: number;
  project_name: string;
  project_code?: string | null;
  project_type: string;
  funding_source: string;
  budget_amount?: string | number | null;
  components?: ProjectComponent[];
  report_order: number;
  project_status_snapshot: ProjectStatus;
  health: ProjectHealth;
  overall_percent_complete?: string | number | null;
  summary: string;
  previous_status_text: string;
  current_status_text: string;
  key_risks: string;
  next_actions: string;
  internal_notes: string;
  include_in_management: boolean;
  progress_items?: ProjectProgressItem[];
  kpi_values?: ProjectKpiValue[];
}

export interface ProjectDashboardRow {
  sn: number;
  update_id: number;
  project_id: number;
  project_name: string;
  project_code?: string | null;
  project_type: string;
  funding_source: string;
  budget_amount?: number | null;
  main_components: Array<{
    id: number;
    title: string;
    description: string;
    unit: string;
    planned_quantity?: number | null;
  }>;
  status_previous: string;
  status_current: string;
  overall_percent_complete?: number | null;
  health: ProjectHealth;
  key_risks: string;
  next_actions: string;
  progress_items: Array<{
    id: number;
    component_id?: number | null;
    component_title: string;
    title: string;
    description: string;
    unit: string;
    planned_quantity?: number | null;
    completed_quantity?: number | null;
    percent_complete?: number | null;
    status_text: string;
  }>;
  kpis: Array<{
    id: number;
    code: string;
    name: string;
    unit: string;
    target_value?: number | null;
    actual_value?: number | null;
    actual_text: string;
    percent_complete?: number | null;
  }>;
}

export interface ProjectDashboardPayload {
  report: ProjectReport;
  summary: {
    projects: number;
    average_completion?: string | number | null;
    total_budget?: string | number | null;
    health_counts: Record<string, number>;
    status_counts: Record<string, number>;
    type_counts: Record<string, number>;
  };
  rows: ProjectDashboardRow[];
}

export interface ProjectWorkspacePayload {
  project: Project;
  components: ProjectComponent[];
  kpis: Array<{
    id: number;
    project: number;
    component?: number | null;
    code: string;
    name: string;
    kpi_kind: string;
    unit: string;
    target_value?: string | number | null;
    is_cumulative: boolean;
    is_active: boolean;
  }>;
  files: ProjectFile[];
  geo_files: ProjectGeoFile[];
  comments: ProjectComment[];
  issues: ProjectIssue[];
  milestones: ProjectMilestone[];
  site_visits: ProjectSiteVisit[];
  activity_logs: Array<Record<string, unknown>>;
}

export interface ProjectFile {
  id: number;
  project: number;
  title: string;
  file: string;
  file_category: string;
  visibility: ProjectVisibility;
  version_label: string;
  document_date?: string | null;
  description: string;
  uploaded_by_name?: string | null;
  uploaded_at: string;
}

export interface ProjectGeoFile {
  id: number;
  project: number;
  title: string;
  file: string;
  file_type: string;
  visibility: ProjectVisibility;
  coordinate_reference_system: string;
  document_date?: string | null;
  description: string;
  uploaded_by_name?: string | null;
  uploaded_at: string;
}

export interface ProjectComment {
  id: number;
  project: number;
  comment: string;
  visibility: ProjectVisibility;
  created_by_name?: string | null;
  created_at: string;
}

export interface ProjectIssue {
  id: number;
  project: number;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  owner_name: string;
  due_date?: string | null;
  visibility: ProjectVisibility;
}

export interface ProjectMilestone {
  id: number;
  project: number;
  title: string;
  description: string;
  target_date?: string | null;
  actual_date?: string | null;
  status: 'not_started' | 'in_progress' | 'done' | 'missed';
  percent_complete?: string | number | null;
  visibility: ProjectVisibility;
  display_order: number;
}

export interface ProjectSiteVisit {
  id: number;
  project: number;
  report?: number | null;
  visit_date: string;
  location: string;
  purpose: string;
  observations: string;
  actions_required: string;
  attendees: string;
  visited_by_name: string;
  visibility: ProjectVisibility;
}
