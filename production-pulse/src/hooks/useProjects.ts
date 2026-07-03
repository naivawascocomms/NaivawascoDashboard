import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectService, type ProjectListParams, type ProjectMonthlyUpdateInput, type ProjectReportParams } from '@/services/projectService';
import type { Project, ProjectIssue, ProjectMilestone, ProjectProgressItem, ProjectReport, ProjectSiteVisit } from '@/types/projects';

const DEFAULT_STALE_TIME = 60 * 1000;

export const useProjects = (params?: ProjectListParams) =>
  useQuery({
    queryKey: ['projects', params],
    queryFn: () => projectService.getProjects(params),
    staleTime: DEFAULT_STALE_TIME,
    refetchOnWindowFocus: false,
  });

export const useProjectReports = (params?: ProjectReportParams) =>
  useQuery({
    queryKey: ['project-reports', params],
    queryFn: () => projectService.getReports(params),
    staleTime: DEFAULT_STALE_TIME,
    refetchOnWindowFocus: false,
  });

export const useProjectDashboard = (reportId?: number) =>
  useQuery({
    queryKey: ['project-dashboard', reportId],
    queryFn: () => projectService.getDashboard(reportId!),
    enabled: !!reportId,
    staleTime: DEFAULT_STALE_TIME,
    refetchInterval: 60000,
  });

export const useProjectWorkspace = (projectId?: number) =>
  useQuery({
    queryKey: ['project-workspace', projectId],
    queryFn: () => projectService.getWorkspace(projectId!),
    enabled: !!projectId,
    staleTime: DEFAULT_STALE_TIME,
    refetchOnWindowFocus: false,
    retry: false,
  });

export const useCreateProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Project>) => projectService.createProject(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
};

export const useUpdateProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Project> }) => projectService.updateProject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project-workspace'] });
      queryClient.invalidateQueries({ queryKey: ['project-dashboard'] });
    },
  });
};

export const useCreateProjectReport = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ProjectReport>) => projectService.createReport(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-reports'] }),
  });
};

export const useCreateProjectMonthlyUpdate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProjectMonthlyUpdateInput) => projectService.createMonthlyUpdate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['project-reports'] });
      queryClient.invalidateQueries({ queryKey: ['project-workspace'] });
    },
  });
};

export const useUpdateProjectMonthlyUpdate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => projectService.updateMonthlyUpdate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['project-workspace'] });
    },
  });
};

export const useCreateProjectProgressItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ProjectProgressItem> & { monthly_update: number }) => projectService.createProgressItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['project-workspace'] });
    },
  });
};

export const useUploadProjectFile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: projectService.uploadFile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-workspace'] }),
  });
};

export const useUploadProjectGeoFile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: projectService.uploadGeoFile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-workspace'] }),
  });
};

export const useCreateProjectComment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: projectService.createComment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-workspace'] }),
  });
};

export const useCreateProjectIssue = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ProjectIssue> & { project: number; title: string }) => projectService.createIssue(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-workspace'] }),
  });
};

export const useCreateProjectMilestone = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ProjectMilestone> & { project: number; title: string }) => projectService.createMilestone(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-workspace'] }),
  });
};

export const useCreateProjectSiteVisit = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ProjectSiteVisit> & { project: number; visit_date: string }) => projectService.createSiteVisit(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project-workspace'] }),
  });
};
