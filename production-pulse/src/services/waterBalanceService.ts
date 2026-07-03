// src/services/waterBalanceService.ts
// Water balance API service

import { api } from './api';
import type {
  PaginatedResponse,
  ProductionZoneAllocationRule,
  SourceAllocationPayload,
  WaterBalanceConfidence,
  WaterBalanceModel,
  WaterBalanceNode,
  WaterBalanceNodeInput,
  WaterBalanceNodeInputMethod,
  WaterBalanceNodeType,
  WaterBalanceRule,
  WaterBalanceRuleMethod,
} from '@/types/api';

export type SourceAllocationParams = {
  start_date: string;
  end_date: string;
  zone?: number;
  production_site?: number;
};

export type CreateAllocationRulePayload = {
  production_site: number;
  zone: number;
  method: 'FIXED_WEIGHT' | 'FIXED_PERCENTAGE';
  rule_type: 'MONTHLY_STANDARD' | 'OPERATIONAL_EXCEPTION';
  basis_value: number;
  effective_start_date: string;
  effective_end_date?: string | null;
  priority?: number;
  is_active?: boolean;
  reason?: string;
  notes?: string;
};

export type ConfiguredSourceAttributionParams = SourceAllocationParams;

export type ZoneCycleSourceAttributionParams = {
  zone: number;
  year: number;
  month: number;
  production_site?: number;
};

export type WaterBalanceNodeParams = {
  node_type?: WaterBalanceNodeType;
  production_site?: number;
  is_active?: boolean;
  search?: string;
  ordering?: string;
};

export type WaterBalanceModelParams = {
  zone?: number;
  zone__region?: number;
  is_active?: boolean;
  search?: string;
  ordering?: string;
};

export type WaterBalanceRuleParams = {
  balance_model?: number;
  balance_model__zone?: number;
  production_site?: number;
  method?: WaterBalanceRuleMethod;
  confidence?: WaterBalanceConfidence;
  mixing_node?: number;
  is_active?: boolean;
  search?: string;
  ordering?: string;
};

export type WaterBalanceNodeInputParams = {
  node?: number;
  production_site?: number;
  input_method?: WaterBalanceNodeInputMethod;
  confidence?: WaterBalanceConfidence;
  is_active?: boolean;
  search?: string;
  ordering?: string;
};

export type CreateWaterBalanceNodePayload = {
  name: string;
  code: string;
  node_type: WaterBalanceNodeType;
  production_site?: number | null;
  is_active?: boolean;
  notes?: string;
};

export type CreateWaterBalanceModelPayload = {
  name: string;
  zone: number;
  effective_start_date: string;
  effective_end_date?: string | null;
  is_active?: boolean;
  notes?: string;
};

export type CreateWaterBalanceRulePayload = {
  balance_model: number;
  production_site: number;
  route_name?: string;
  method: WaterBalanceRuleMethod;
  basis_value?: number | null;
  water_meter?: number | null;
  mixing_node?: number | null;
  manual_volume_m3?: number | null;
  confidence?: WaterBalanceConfidence;
  priority?: number;
  is_active?: boolean;
  effective_start_date?: string | null;
  effective_end_date?: string | null;
  notes?: string;
};

export type CreateWaterBalanceNodeInputPayload = {
  node: number;
  production_site: number;
  input_method: WaterBalanceNodeInputMethod;
  water_meter?: number | null;
  confidence?: WaterBalanceConfidence;
  priority?: number;
  is_active?: boolean;
  effective_start_date?: string | null;
  effective_end_date?: string | null;
  notes?: string;
};

export type AllocationRulesParams = {
  production_site?: number;
  production_site__region?: number;
  zone?: number;
  zone__region?: number;
  method?: 'FIXED_WEIGHT' | 'FIXED_PERCENTAGE';
  rule_type?: 'MONTHLY_STANDARD' | 'OPERATIONAL_EXCEPTION';
  is_active?: boolean;
  ordering?: string;
};

export const waterBalanceService = {
  getAllocationRules: (params?: AllocationRulesParams) =>
    api.get<PaginatedResponse<ProductionZoneAllocationRule>>(
      '/water-balance/allocation-rules/',
      params,
    ),

  getSourceAllocations: (params: SourceAllocationParams) =>
    api.get<SourceAllocationPayload>(
      '/water-balance/allocation-rules/source-allocations/',
      params,
    ),

  getConfiguredSourceAttributions: (params: ConfiguredSourceAttributionParams) =>
    api.get<SourceAllocationPayload>(
      '/water-balance/models/source-attributions/',
      params,
    ),

  getZoneCycleSourceAttributions: (params: ZoneCycleSourceAttributionParams) =>
    api.get<SourceAllocationPayload>(
      '/water-balance/models/source-attributions-by-zone-cycle/',
      params,
    ),

  createAllocationRule: (data: CreateAllocationRulePayload) =>
    api.post<ProductionZoneAllocationRule>(
      '/water-balance/allocation-rules/',
      data,
    ),

  getNodes: (params?: WaterBalanceNodeParams) =>
    api.get<PaginatedResponse<WaterBalanceNode>>('/water-balance/nodes/', params),

  createNode: (data: CreateWaterBalanceNodePayload) =>
    api.post<WaterBalanceNode>('/water-balance/nodes/', data),

  updateNode: ({ id, ...data }: Partial<CreateWaterBalanceNodePayload> & { id: number }) =>
    api.patch<WaterBalanceNode>(`/water-balance/nodes/${id}/`, data),

  getModels: (params?: WaterBalanceModelParams) =>
    api.get<PaginatedResponse<WaterBalanceModel>>('/water-balance/models/', params),

  createModel: (data: CreateWaterBalanceModelPayload) =>
    api.post<WaterBalanceModel>('/water-balance/models/', data),

  updateModel: ({ id, ...data }: Partial<CreateWaterBalanceModelPayload> & { id: number }) =>
    api.patch<WaterBalanceModel>(`/water-balance/models/${id}/`, data),

  getRules: (params?: WaterBalanceRuleParams) =>
    api.get<PaginatedResponse<WaterBalanceRule>>('/water-balance/rules/', params),

  createRule: (data: CreateWaterBalanceRulePayload) =>
    api.post<WaterBalanceRule>('/water-balance/rules/', data),

  updateRule: ({ id, ...data }: Partial<CreateWaterBalanceRulePayload> & { id: number }) =>
    api.patch<WaterBalanceRule>(`/water-balance/rules/${id}/`, data),

  getNodeInputs: (params?: WaterBalanceNodeInputParams) =>
    api.get<PaginatedResponse<WaterBalanceNodeInput>>('/water-balance/node-inputs/', params),

  createNodeInput: (data: CreateWaterBalanceNodeInputPayload) =>
    api.post<WaterBalanceNodeInput>('/water-balance/node-inputs/', data),

  updateNodeInput: ({ id, ...data }: Partial<CreateWaterBalanceNodeInputPayload> & { id: number }) =>
    api.patch<WaterBalanceNodeInput>(`/water-balance/node-inputs/${id}/`, data),
};
