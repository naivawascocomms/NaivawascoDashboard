import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { incidentService, type IncidentCreateInput, type IncidentListParams } from '@/services/incidentService';

const DEFAULT_STALE_TIME = 60 * 1000;

export const useIncidents = (params?: IncidentListParams) => {
  return useQuery({
    queryKey: ['incidents', params],
    queryFn: () => incidentService.getIncidents(params),
    staleTime: DEFAULT_STALE_TIME,
    refetchInterval: 60000,
    refetchOnWindowFocus: false,
  });
};

export const useIncidentSummary = (params?: IncidentListParams) => {
  return useQuery({
    queryKey: ['incident-summary', params],
    queryFn: () => incidentService.getSummary(params),
    staleTime: DEFAULT_STALE_TIME,
    refetchInterval: 60000,
    refetchOnWindowFocus: false,
  });
};

export const useIncidentUsers = (params?: { search?: string }) => {
  return useQuery({
    queryKey: ['incident-users', params],
    queryFn: () => incidentService.getUsers(params),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export const useCurrentIncidentUser = () => {
  return useQuery({
    queryKey: ['incident-current-user'],
    queryFn: incidentService.getCurrentUser,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

export const useCreateIncident = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: IncidentCreateInput) => incidentService.createIncident(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incident-summary'] });
    },
  });
};

export const useUpdateIncidentStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      status,
      comment,
      resolved_by,
      resolution_notes,
    }: {
      id: number;
      status: 'open' | 'in-progress' | 'resolved';
      comment?: string;
      resolved_by?: string;
      resolution_notes?: string;
    }) => incidentService.updateStatus(id, { status, comment, resolved_by, resolution_notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incident-summary'] });
    },
  });
};

export const useAddIncidentComment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, comment }: { id: number; comment: string }) => incidentService.addComment(id, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incident-summary'] });
    },
  });
};
