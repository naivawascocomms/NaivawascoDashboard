import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { meteringService, type ManagedUserParams } from '@/services/meteringService';

type QueryOptions = {
  enabled?: boolean;
};

export const useMyMeteringProfile = () => {
  return useQuery({
    queryKey: ['metering-profile', 'me'],
    queryFn: () => meteringService.getMyProfile(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useManagedUsers = (params?: ManagedUserParams, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['managed-users', params],
    queryFn: () => meteringService.getManagedUsers(params),
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
  });
};

export const useCurrentManagedUser = (options?: QueryOptions) => {
  return useQuery({
    queryKey: ['managed-users', 'me'],
    queryFn: () => meteringService.getCurrentManagedUser(),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useCreateManagedUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: meteringService.createManagedUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-users'] });
      queryClient.invalidateQueries({ queryKey: ['metering-user-profiles'] });
    },
  });
};

export const useUpdateManagedUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: meteringService.updateManagedUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-users'] });
      queryClient.invalidateQueries({ queryKey: ['metering-user-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['metering-profile', 'me'] });
    },
  });
};

export const useDeactivateManagedUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: meteringService.deactivateManagedUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-users'] });
      queryClient.invalidateQueries({ queryKey: ['metering-user-profiles'] });
    },
  });
};

export const useSetManagedUserPassword = () => {
  return useMutation({
    mutationFn: meteringService.setManagedUserPassword,
  });
};

export const useUserProfiles = (params?: any, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['metering-user-profiles', params],
    queryFn: () => meteringService.getUserProfiles(params),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useWaterMeters = (params?: any, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['water-meters', params],
    queryFn: () => meteringService.getWaterMeters(params),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useMyMeterReadingAssignments = (params?: any) => {
  return useQuery({
    queryKey: ['meter-reading-assignments', 'mine', params],
    queryFn: () => meteringService.getMyMeterReadingAssignments(params),
    enabled: params !== undefined,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useMeterReadingAssignments = (params?: any, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['meter-reading-assignments', params],
    queryFn: () => meteringService.getMeterReadingAssignments(params),
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const usePendingMeterReadingApprovals = (params?: any, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['meter-reading-approvals', params],
    queryFn: () => meteringService.getPendingApprovals(params),
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useProductionWaterAssignments = (params?: any, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['production-water-meter-assignments', params],
    queryFn: () => meteringService.getProductionWaterAssignments(params),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useProductionEnergyAssignments = (params?: any, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['production-energy-meter-assignments', params],
    queryFn: () => meteringService.getProductionEnergyAssignments(params),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useDistributionWaterAssignments = (params?: any, options?: QueryOptions) => {
  return useQuery({
    queryKey: ['distribution-water-meter-assignments', params],
    queryFn: () => meteringService.getDistributionWaterAssignments(params),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

export const useCreateMeterReadingAssignment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: meteringService.createMeterReadingAssignment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meter-reading-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['meter-reading-assignments', 'mine'] });
    },
  });
};

export const useUpdateMeterReadingAssignment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: meteringService.updateMeterReadingAssignment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meter-reading-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['meter-reading-assignments', 'mine'] });
    },
  });
};

export const useApproveMeterReading = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: meteringService.approveReading,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meter-reading-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['meter-reading-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-production'] });
      queryClient.invalidateQueries({ queryKey: ['production-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['distribution-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-distribution'] });
    },
  });
};

export const useBulkApproveMeterReadings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: meteringService.bulkApproveReadings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meter-reading-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['meter-reading-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-production'] });
      queryClient.invalidateQueries({ queryKey: ['production-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['distribution-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-distribution'] });
    },
  });
};

export const useDelegateMeterReadingApproval = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: meteringService.delegateApproval,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meter-reading-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['meter-reading-assignments'] });
    },
  });
};

export const useBulkCreateWaterMeterReadings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: meteringService.bulkCreateWaterMeterReadings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meter-reading-assignments', 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-production'] });
      queryClient.invalidateQueries({ queryKey: ['production-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['distribution-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-distribution'] });
    },
  });
};

export const useBulkCreateEnergyMeterReadings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: meteringService.bulkCreateEnergyMeterReadings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meter-reading-assignments', 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['monthly-production'] });
      queryClient.invalidateQueries({ queryKey: ['production-dashboard'] });
    },
  });
};
