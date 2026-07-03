import { api, apiClient } from './api';
import type { PaginatedResponse } from '@/types/api';
import type {
  Project,
  ProjectComment,
  ProjectDashboardPayload,
  ProjectFile,
  ProjectGeoFile,
  ProjectIssue,
  ProjectMilestone,
  ProjectMonthlyUpdate,
  ProjectProgressItem,
  ProjectReport,
  ProjectSiteVisit,
  ProjectWorkspacePayload,
} from '@/types/projects';

export type ProjectListParams = {
  is_active?: boolean;
  status?: string;
  health?: string;
  project_type?: string;
  search?: string;
  ordering?: string;
};

export type ProjectReportParams = {
  year?: number;
  month?: number;
  status?: string;
  ordering?: string;
};

export type ProjectMonthlyUpdateInput = Partial<ProjectMonthlyUpdate> & {
  report: number;
  project: number;
};

const formHeaders = { headers: { 'Content-Type': 'multipart/form-data' } };

export const projectService = {
  getProjects: (params?: ProjectListParams) =>
    api.get<PaginatedResponse<Project>>('/projects/projects/', params),

  getProjectSummary: (params?: ProjectListParams) =>
    api.get<Record<string, unknown>>('/projects/projects/summary/', params),

  createProject: (data: Partial<Project>) =>
    api.post<Project>('/projects/projects/', data),

  updateProject: (id: number, data: Partial<Project>) =>
    api.patch<Project>(`/projects/projects/${id}/`, data),

  getWorkspace: (projectId: number) =>
    api.get<ProjectWorkspacePayload>(`/projects/projects/${projectId}/workspace/`),

  getReports: (params?: ProjectReportParams) =>
    api.get<PaginatedResponse<ProjectReport>>('/projects/reports/', params),

  createReport: (data: Partial<ProjectReport>) =>
    api.post<ProjectReport>('/projects/reports/', data),

  getDashboard: (reportId: number) =>
    api.get<ProjectDashboardPayload>(`/projects/reports/${reportId}/dashboard/`),

  submitReport: (reportId: number) =>
    api.post<ProjectReport>(`/projects/reports/${reportId}/submit/`),

  approveReport: (reportId: number) =>
    api.post<ProjectReport>(`/projects/reports/${reportId}/approve/`),

  publishReport: (reportId: number) =>
    api.post<ProjectReport>(`/projects/reports/${reportId}/publish/`),

  copyFromPreviousMonth: (reportId: number) =>
    api.post<{ created_updates: number; source_report: number }>(`/projects/reports/${reportId}/copy-from-previous-month/`),

  downloadReportPdf: async (reportId: number, filename: string) => {
    const response = await apiClient.get<Blob>(`/projects/reports/${reportId}/pdf/`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  createMonthlyUpdate: (data: ProjectMonthlyUpdateInput) =>
    api.post<ProjectMonthlyUpdate>('/projects/monthly-updates/', data),

  updateMonthlyUpdate: (id: number, data: Partial<ProjectMonthlyUpdate>) =>
    api.patch<ProjectMonthlyUpdate>(`/projects/monthly-updates/${id}/`, data),

  createProgressItem: (data: Partial<ProjectProgressItem> & { monthly_update: number }) =>
    api.post<ProjectProgressItem>('/projects/progress-items/', data),

  createKpiValue: (data: Record<string, unknown>) =>
    api.post('/projects/kpi-values/', data),

  uploadFile: async (data: {
    project: number;
    title: string;
    file: File;
    file_category?: string;
    visibility?: string;
    description?: string;
  }) => {
    const formData = new FormData();
    formData.append('project', String(data.project));
    formData.append('title', data.title);
    formData.append('file', data.file);
    formData.append('file_category', data.file_category || 'other');
    formData.append('visibility', data.visibility || 'internal');
    formData.append('description', data.description || '');
    const response = await apiClient.post<ProjectFile>('/projects/files/', formData, formHeaders);
    return response.data;
  },

  uploadGeoFile: async (data: {
    project: number;
    title: string;
    file: File;
    file_type?: string;
    visibility?: string;
    description?: string;
  }) => {
    const formData = new FormData();
    formData.append('project', String(data.project));
    formData.append('title', data.title);
    formData.append('file', data.file);
    formData.append('file_type', data.file_type || 'kml');
    formData.append('visibility', data.visibility || 'internal');
    formData.append('description', data.description || '');
    const response = await apiClient.post<ProjectGeoFile>('/projects/geo-files/', formData, formHeaders);
    return response.data;
  },

  createComment: (data: { project: number; comment: string; visibility?: string }) =>
    api.post<ProjectComment>('/projects/comments/', data),

  createIssue: (data: Partial<ProjectIssue> & { project: number; title: string }) =>
    api.post<ProjectIssue>('/projects/issues/', data),

  createMilestone: (data: Partial<ProjectMilestone> & { project: number; title: string }) =>
    api.post<ProjectMilestone>('/projects/milestones/', data),

  createSiteVisit: (data: Partial<ProjectSiteVisit> & { project: number; visit_date: string }) =>
    api.post<ProjectSiteVisit>('/projects/site-visits/', data),
};
