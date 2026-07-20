// src/types/api.ts
// TypeScript types matching Django models

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// Production Types
export interface ProductionSite {
  id: number;
  name: string;
  code: string;
  region: number;
  region_name: string;
  site_type: 'BOREHOLE' | 'SURFACE' | 'TREATMENT' | 'MIXED';
  has_solar: boolean;
  solar_capacity_kwh: string | null;
  is_active: boolean;
  water_source_count: number;
  active_meter_count: number;
}

export interface WaterSource {
  id: number;
  production_site: number;
  production_site_name: string;
  name: string;
  code: string;
  source_type: 'BOREHOLE' | 'WELL' | 'SPRING' | 'SURFACE';
  depth_meters: string | null;
  yield_m3_per_hour: string | null;
  is_active: boolean;
  meter_count: number;
}

export interface ProductionMeter {
  id: number;
  production_site: number;
  production_site_name: string;
  water_source: number | null;
  water_source_name: string | null;
  meter_type: 'WATER' | 'POWER_GRID' | 'POWER_SOLAR' | 'SUPPLY';
  meter_type_display: string;
  meter_number: string;
  manufacturer: string;
  model: string;
  capacity: string | null;
  is_active: boolean;
  installation_date: string;
  last_calibration_date: string | null;
  next_calibration_date: string | null;
  initial_reading: string;
  last_reading_date: string | null;
  notes: string;
}

export interface MeterReading {
  id: number;
  meter: number;
  meter_number: string;
  production_site_name: string;
  reading_date: string;
  reading_time: string;
  current_reading: string;
  previous_reading: string | null;
  consumption: string | null;
  read_by: string;
  reading_method: 'MANUAL' | 'AUTOMATED' | 'ESTIMATED';
  is_validated: boolean;
  is_anomaly: boolean;
}

export interface WaterMeter {
  id: number;
  meter_number: string;
  display_name: string;
  display_label: string;
  manufacturer: string;
  model: string;
  diameter_mm: number | null;
  capacity: string | null;
  operational_status:
    | 'WORKING'
    | 'FAULTY'
    | 'OVER_REGISTERING'
    | 'NOT_REGISTERING'
    | 'NOT_FUNCTIONAL'
    | 'ESTIMATED'
    | 'UNKNOWN';
  operational_status_notes: string;
  is_active: boolean;
  installation_date: string;
  last_calibration_date: string | null;
  next_calibration_date: string | null;
  initial_reading: string;
  last_reading_date: string | null;
  last_reading_value: string | null;
  notes: string;
}

export interface EnergyMeter {
  id: number;
  meter_number: string;
  display_name: string;
  display_label: string;
  energy_kind: 'GRID' | 'SOLAR';
  manufacturer: string;
  model: string;
  capacity: string | null;
  is_active: boolean;
  installation_date: string;
  last_calibration_date: string | null;
  next_calibration_date: string | null;
  initial_reading: string;
  last_reading_date: string | null;
  last_reading_value: string | null;
  notes: string;
}

export interface ProductionWaterMeterAssignment {
  id: number;
  water_meter: number;
  meter_number: string;
  meter_display_name: string;
  meter_label: string;
  production_site: number;
  production_site_name: string;
  water_source: number | null;
  water_source_name: string | null;
  assignment_role: 'ABSTRACTION' | 'SUPPLY';
  initial_reading: string;
  last_reading_date: string | null;
  last_reading_value: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string;
}

export interface ProductionEnergyMeterAssignment {
  id: number;
  energy_meter: number;
  meter_number: string;
  meter_display_name: string;
  meter_label: string;
  production_site: number;
  production_site_name: string;
  assignment_role: 'GRID' | 'SOLAR';
  initial_reading: string;
  last_reading_date: string | null;
  last_reading_value: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string;
}

export interface DistributionWaterMeterAssignment {
  id: number;
  water_meter: number;
  meter_number: string;
  meter_display_name: string;
  meter_label: string;
  zone: number | null;
  zone_name: string | null;
  dma: number | null;
  dma_name: string | null;
  assignment_role: 'ZONE_INLET' | 'DMA_INLET' | 'BULK_SUPPLY' | 'TRANSMISSION';
  allocation_percentage: string;
  initial_reading: string;
  last_reading_date: string | null;
  last_reading_value: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string;
}

export interface UserSummary {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  role: 'PRODUCTION_SUPERVISOR' | 'PUMP_OPERATOR' | 'ZONAL_OFFICER' | 'PLUMBER';
  role_display: string;
}

export interface UserProfile {
  id: number;
  user: UserSummary;
  role: 'PRODUCTION_SUPERVISOR' | 'PUMP_OPERATOR' | 'ZONAL_OFFICER' | 'PLUMBER';
  phone_number: string;
  notes: string;
  can_assign_readings: boolean;
  can_receive_reading_assignments: boolean;
  created_at: string;
  updated_at: string;
}

export type MeteringUserRole = 'PRODUCTION_SUPERVISOR' | 'PUMP_OPERATOR' | 'ZONAL_OFFICER' | 'PLUMBER';

export interface ManagedUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  last_login: string | null;
  date_joined: string;
  profile: UserProfile | null;
}

export interface ManagedUserPayload {
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  is_active?: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
  password?: string;
  role?: MeteringUserRole;
  phone_number?: string;
  profile_notes?: string;
}

export interface MeterReadingAssignment {
  id: number;
  assignee: UserSummary;
  assigned_by: UserSummary;
  approval_delegate: UserSummary | null;
  scope_type: 'PRODUCTION_SITE' | 'ZONE';
  production_site: number | null;
  production_site_name: string | null;
  zone: number | null;
  zone_name: string | null;
  water_meter: number | null;
  water_meter_label: string | null;
  water_meter_number: string | null;
  energy_meter: number | null;
  energy_meter_label: string | null;
  energy_meter_number: string | null;
  last_reading_date: string | null;
  last_reading_value: string | null;
  initial_reading: string | null;
  reading_date: string;
  reading_status: 'NOT_SUBMITTED' | 'SUBMITTED' | 'VALIDATED';
  reading_id: number | null;
  reading_current_value: string | null;
  reading_is_validated: boolean;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ApprovalUserSummary {
  id: number;
  username: string;
  full_name: string;
}

export interface MeterReadingApprovalItem {
  assignment_id: number;
  reading_type: 'WATER' | 'ENERGY';
  reading_id: number;
  reading_date: string;
  reading_time: string;
  current_reading: string;
  previous_reading: string | null;
  consumption: string | null;
  meter_id: number;
  meter_number: string;
  meter_label: string;
  assignee: ApprovalUserSummary;
  assigned_by: ApprovalUserSummary;
  approval_delegate: ApprovalUserSummary | null;
  scope_type: 'PRODUCTION_SITE' | 'ZONE';
  production_site: number | null;
  production_site_name: string | null;
  zone: number | null;
  zone_name: string | null;
  submitted_by_username: string;
  read_by: string;
  notes: string;
}

export interface MeterReadingApprovalResponse {
  count: number;
  results: MeterReadingApprovalItem[];
}

export interface WaterMeterReading {
  id: number;
  water_meter: number;
  meter_number: string;
  meter_display_name: string;
  meter_label: string;
  reading_date: string;
  reading_time: string;
  current_reading: string;
  previous_reading: string | null;
  consumption: string | null;
  read_by: string;
  reading_method: 'MANUAL' | 'AUTOMATED' | 'SCADA' | 'ESTIMATED';
  is_validated: boolean;
  is_anomaly: boolean;
}

export interface EnergyMeterReading {
  id: number;
  energy_meter: number;
  meter_number: string;
  meter_display_name: string;
  meter_label: string;
  reading_date: string;
  reading_time: string;
  current_reading: string;
  previous_reading: string | null;
  consumption: string | null;
  read_by: string;
  reading_method: 'MANUAL' | 'AUTOMATED' | 'SCADA' | 'ESTIMATED';
  is_validated: boolean;
  is_anomaly: boolean;
}

export interface MonthlyProduction {
  id: number;
  production_site: number;
  production_site_name: string;
  production_site_code: string;
  region_name: string;
  year: number;
  month: number;
  start_date: string | null;
  closing_date: string | null;
  water_abstracted_m3: string;
  water_supplied_m3: string;
  water_received_m3: string;
  production_loss_m3: string;
  water_available_for_sale_m3: string;
  power_grid_kwh: string;
  power_solar_kwh: string;
  total_power_kwh: string;
  power_efficiency_kwh_per_m3: string | null;
  solar_percentage: string | null;
  production_loss_percentage: string | null;
  power_costs: string;
  repair_maintenance_costs: string;
  abstraction_fee: string;
  chemical_costs: string;
  total_direct_costs: string;
  power_cost_per_m3: string | null;
  power_cost_per_kwh: string | null;
  total_cost_per_m3: string | null;
  is_finalized: boolean;
  target_details?: ProductionTarget;
  water_abstraction_realization_percent: string | null;
}

export interface FySiteProductionSummary {
  id: number;
  production_site: number;
  production_site_name: string;
  production_site_code: string;
  region_name: string;
  year: number;
  month: number | null;
  water_abstracted_m3: string;
  water_supplied_m3: string;
  water_received_m3: string;
  production_loss_m3: string;
  water_available_for_sale_m3: string;
  production_loss_percentage: string;
  power_grid_kwh: string;
  power_solar_kwh: string;
  total_power_kwh: string;
  power_efficiency_kwh_per_m3: string | null;
  solar_percentage: string;
  power_costs: string;
  repair_maintenance_costs: string;
  abstraction_fee: string;
  chemical_costs: string;
  total_direct_costs: string;
  power_cost_per_m3: string | null;
  power_cost_per_kwh: string | null;
  total_cost_per_m3: string | null;
  water_abstraction_realization_percent: string;
  is_finalized: boolean;
  target_details?: {
    water_abstraction_target_m3: string;
    power_efficiency_target_kwh_per_m3: string | null;
  };
}

export interface ProductionTarget {
  id: number;
  production_site: number;
  production_site_name: string;
  year: number;
  month: number;
  water_abstraction_target_m3: string;
  water_supply_target_m3: string;
  production_loss_target_m3: string;
  production_loss_target_percent: string;
  power_grid_target_kwh: string;
  power_solar_target_kwh: string;
  total_power_target_kwh: string;
  solar_percentage_target: string;
  power_efficiency_target_kwh_per_m3: string | null;
  power_cost_per_m3_target: string | null;
  power_cost_per_kwh_target: string | null;
}

export interface DashboardSummary {
  period: string;
  data_source?: 'HISTORICAL_IMPORT' | 'MOCK_BALANCE_TEST' | 'BALANCE_MODEL' | 'MIXED';
  region: string;
  production_site: string;
  total_sites: number;
  active_sites: number;
  // Actuals
  total_water_abstracted: string;
  total_water_supplied: string;
  total_production_loss: string;
  production_loss_percentage: string;
  total_power_consumption: string;
  total_grid_power: string;
  total_solar_power: string;
  solar_power_percentage: string;
  average_power_efficiency: string;
  total_costs: string;
  total_power_costs: string;
  total_rm_costs: string;
  total_abstraction_fee: string;
  total_chemical_costs: string;
  average_cost_per_m3: string;
  target_realization_percentage: string;
  // Targets
  target_water_abstracted: string;
  target_water_supplied: string;
  target_production_loss: string;
  target_production_loss_percentage: string;
  target_power_consumption: string;
  target_grid_power: string;
  target_solar_power: string;
  target_solar_percentage: string;
  target_power_efficiency: string;
}

export interface CompanyMonthlySummary {
  id: number;
  year: number;
  month: number;
  // Cost targets
  target_power_costs: string;
  target_repair_maintenance_costs: string;
  target_abstraction_fee: string;
  target_chemical_costs: string;
  target_total_direct_costs: string;
  target_power_cost_per_m3: string | null;
  target_power_cost_per_kwh: string | null;
  target_total_cost_per_m3: string | null;
  // Cost actuals
  power_costs: string;
  repair_maintenance_costs: string;
  abstraction_fee: string;
  chemical_costs: string;
  total_direct_costs: string;
  power_cost_per_m3: string | null;
  power_cost_per_kwh: string | null;
  total_cost_per_m3: string | null;
  // Regional billing dates
  central_opening_date: string | null;
  central_closing_date: string | null;
  central_production_loss_m3: string;
  central_available_for_sale_m3: string;
  southern_opening_date: string | null;
  southern_closing_date: string | null;
  southern_production_loss_m3: string;
  southern_available_for_sale_m3: string;
  eastern_opening_date: string | null;
  eastern_closing_date: string | null;
  eastern_production_loss_m3: string;
  eastern_available_for_sale_m3: string;
  // Water quality targets
  target_chemical_tests_production: number;
  target_biological_tests_production: number;
  target_chemical_tests_consumer: number;
  target_biological_tests_consumer: number;
  // Water quality actuals
  chemical_tests_production: number;
  biological_tests_production: number;
  chemical_tests_consumer: number;
  biological_tests_consumer: number;
  // WHO compliance
  who_compliance_chemical_production: string;
  who_compliance_biological_production: string;
  who_compliance_chemical_consumer: string;
  who_compliance_biological_consumer: string;
  is_finalized: boolean;
}

// Distribution Types
export interface Zone {
  id: number;
  region: number;
  region_name: string;
  name: string;
  code: string;
  zone_type: 'URBAN' | 'PERI_URBAN' | 'RURAL' | 'COMMERCIAL' | 'INDUSTRIAL';
  number_of_connections: number;
  is_active: boolean;
  dma_count: number;
}

export interface BillingCycle {
  id: number;
  region: number;
  region_name: string;
  year: number;
  month: number;
  start_date: string;
  end_date: string;
  number_of_days: number;
  is_finalized: boolean;
}

export interface ZoneBillingCycle {
  id: number;
  zone: number;
  zone_name: string;
  zone_code: string;
  region_name: string;
  year: number;
  month: number;
  opening_date: string;
  closing_date: string | null;
  effective_closing_date?: string;
  number_of_days: number;
  is_open?: boolean;
  is_finalized: boolean;
}

export interface CustomerBillingData {
  id: number;
  zone: number;
  zone_name: string;
  billing_cycle: number;
  billing_cycle_details: BillingCycle;
  zone_billing_cycle: number | null;
  zone_billing_cycle_details: ZoneBillingCycle | null;
  total_volume_billed_m3: string;
  number_of_bills_generated: number;
  number_of_active_connections: number;
  total_revenue: string | null;
  water_revenue: string | null;
  sewer_revenue: string | null;
  notes: string;
}

export interface MonthlyDistribution {
  id: number;
  zone: number;
  zone_name: string;
  zone_code: string;
  region_name: string;
  billing_cycle: number;
  billing_cycle_details: BillingCycle;
  zone_billing_cycle: number | null;
  zone_billing_cycle_details: ZoneBillingCycle | null;
  volume_supplied_m3: string;
  volume_billed_m3: string;
  nrw_m3: string;
  nrw_percentage: string | null;
  nrw_target_percentage: string | null;
  volume_supplied_target_m3: string | null;
  volume_supplied_realization_percent: string | null;
  nrw_realization_percent: string | null;
  is_finalized: boolean;
  data_source?: 'HISTORICAL_IMPORT' | 'MOCK_BALANCE_TEST' | 'BALANCE_MODEL' | 'MIXED';
}

export interface RegionalDistribution {
  id: number;
  region: number;
  region_name: string;
  billing_cycle: number;
  billing_cycle_details: BillingCycle;
  volume_supplied_m3: string;
  volume_billed_m3: string;
  nrw_m3: string;
  nrw_percentage: string | null;
  nrw_target_percentage: string | null;
  amount_billed_water: string | null;
  amount_billed_sewer: string | null;
  active_water_connections: number;
  active_sewer_connections: number;
  is_finalized: boolean;
}

export interface GlobalNRWPerformance {
  id: number;
  billing_cycle: number;
  billing_cycle_details: BillingCycle;
  water_available_for_sale_m3: string;
  volume_billed_to_customers_m3: string;
  global_nrw_m3: string;
  global_nrw_percentage: string | null;
  transmission_loss_percentage: string | null;
  regional_nrw_percentage: string | null;
  global_nrw_target_percentage: string | null;
  active_water_connections: number;
  active_sewer_connections: number;
  inactive_water_connections: number;
  inactive_sewer_connections: number;
  total_connections: number;
  maintenance_repair_operational_cost: string | null;
  data_source?: 'HISTORICAL_IMPORT' | 'MOCK_BALANCE_TEST' | 'BALANCE_MODEL' | 'MIXED';
}

export interface CommercialDashboardReport {
  id: number;
  name: string;
  fiscal_year_start: number;
  fiscal_year_label: string;
  current_snapshot_date: string | null;
  current_fiscal_month_index: number | null;
  sewerage_percentage_of_water: string;
  source_workbook: string;
  notes: string;
  is_active: boolean;
  section_count: number;
  kpi_count: number;
}

export interface CommercialDashboardValuePair {
  raw: string | null;
  numeric: string | number | null;
}

export interface CommercialDashboardRow {
  id: number;
  label: string;
  unit: string;
  item_number: string;
  subgroup_title: string;
  scope_type: 'GLOBAL' | 'REGION' | 'ZONE' | 'CUSTOM';
  scope_name: string | null;
  region_id: number | null;
  zone_id: number | null;
  is_total: boolean;
  is_summary: boolean;
  is_percentage: boolean;
  monthly_target: CommercialDashboardValuePair;
  monthly_actual: CommercialDashboardValuePair;
  monthly_realization_percent: string | number | null;
  cumulative_target: CommercialDashboardValuePair;
  cumulative_actual: CommercialDashboardValuePair;
  cumulative_realization_percent: string | number | null;
  has_imported_snapshot: boolean;
}

export interface CommercialDashboardSectionPayload {
  id: number;
  title: string;
  display_order: number;
  rows: CommercialDashboardRow[];
}

export interface CommercialDashboardPayload {
  report: CommercialDashboardReport;
  selected_month: number;
  selected_year: number;
  selected_fy_months: number[];
  sections: CommercialDashboardSectionPayload[];
}

export interface CommercialDashboardMonthlyValueRecord {
  id: number;
  kpi: number;
  month: number;
  target_value_numeric: string | null;
  target_value_text: string;
  actual_value_numeric: string | null;
  actual_value_text: string;
  notes: string;
}

export interface CommercialDashboardSnapshotRecord {
  id: number;
  kpi: number;
  snapshot_year: number;
  snapshot_month: number;
  monthly_target_numeric: string | null;
  monthly_target_text: string;
  monthly_actual_numeric: string | null;
  monthly_actual_text: string;
  monthly_realization_percent: string | null;
  cumulative_target_numeric: string | null;
  cumulative_target_text: string;
  cumulative_actual_numeric: string | null;
  cumulative_actual_text: string;
  cumulative_realization_percent: string | null;
  notes: string;
}

export interface CommercialDashboardKpiRecord {
  id: number;
  report: number;
  section: number;
  label: string;
  unit: string;
  item_number: string;
  subgroup_title: string;
  scope_type: 'GLOBAL' | 'REGION' | 'ZONE' | 'CUSTOM';
  region: number | null;
  region_name: string | null;
  zone: number | null;
  zone_name: string | null;
  display_order: number;
  workbook_row: number | null;
  is_total: boolean;
  is_summary: boolean;
  is_percentage: boolean;
  notes: string;
  monthly_values: CommercialDashboardMonthlyValueRecord[];
  snapshots: CommercialDashboardSnapshotRecord[];
}

export interface WaterQualityTest {
  id: number;
  production_site: number;
  production_site_name: string;
  test_date: string;
  test_type: 'CHEMICAL' | 'BIOLOGICAL' | 'PHYSICAL';
  test_location: 'PRODUCTION' | 'CONSUMER';
  parameter_tested: string;
  test_result: string;
  unit_of_measure: string;
  who_standard: string | null;
  is_compliant: boolean;
  tested_by: string;
  lab_reference: string;
  notes: string;
}

export interface DistributionDashboard {
  summary: {
    total_supplied: string;
    total_billed: string;
    total_nrw: string;
    avg_nrw_percent: string;
  };
  zone_count: number;
  zones: MonthlyDistribution[];
  data_source?: 'HISTORICAL_IMPORT' | 'MOCK_BALANCE_TEST' | 'BALANCE_MODEL' | 'MIXED';
}

export interface DistributionFyTrendPoint {
  month: string;
  period?: string;
  waterSupplied: number;
  waterBilled: number;
  nrwPercentage: number;
  transmissionLoss: number;
  target: number;
  dataSource?: 'HISTORICAL_IMPORT' | 'MOCK_BALANCE_TEST' | 'BALANCE_MODEL' | 'MIXED';
}

export interface DailyAnalysisVolumeItem {
  id: number;
  name: string;
  code: string;
  volume: number;
  collection?: number;
}

export interface DailyAnalysisRegion {
  region_id: number | null;
  region: string;
  production_region_id: number | null;
  production_sites: DailyAnalysisVolumeItem[];
  zones: DailyAnalysisVolumeItem[];
  total_production: number;
  total_supply: number;
  total_collection: number;
  gap: number;
  gap_percentage: number;
}

export interface DailyAnalysisTrend {
  date: string;
  production: number;
  supply: number;
  gap: number;
}

export interface DailyAnalysisSummary {
  total_production: number;
  total_supply: number;
  total_collection: number;
  gap: number;
  gap_percentage: number;
  total_regions: number;
  total_sites: number;
  total_zones: number;
  days: number;
}

export interface DailyAnalysisPayload {
  available_start_date: string;
  available_end_date: string;
  start_date: string;
  end_date: string;
  summary: DailyAnalysisSummary;
  regions: DailyAnalysisRegion[];
  trends: DailyAnalysisTrend[];
}

export interface ProductionZoneAllocationRule {
  id: number;
  production_site: number;
  production_site_name: string;
  production_site_code: string;
  production_region_name: string;
  zone: number;
  zone_name: string;
  zone_code: string;
  distribution_region_name: string;
  method: 'FIXED_WEIGHT' | 'FIXED_PERCENTAGE';
  method_display: string;
  rule_type: 'MONTHLY_STANDARD' | 'OPERATIONAL_EXCEPTION';
  rule_type_display: string;
  basis_value: string;
  effective_start_date: string;
  effective_end_date: string | null;
  priority: number;
  is_active: boolean;
  reason: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface SourceAllocationRow {
  date: string;
  zone_id: number;
  zone_name: string;
  zone_code: string;
  distribution_region_id: number;
  distribution_region_name: string;
  production_site_id: number;
  production_site_name: string;
  production_site_code: string;
  production_region_id: number;
  production_region_name: string;
  rule_id: number;
  balance_model_id?: number;
  balance_model_name?: string;
  route_name?: string;
  method: 'FIXED_WEIGHT' | 'FIXED_PERCENTAGE' | 'METERED_VOLUME' | 'MIXING_NODE_SHARE' | 'MANUAL_OVERRIDE';
  confidence?: 'MEASURED' | 'MEASURED_ALLOCATED' | 'ESTIMATED' | 'MANUAL';
  rule_type?: 'MONTHLY_STANDARD' | 'OPERATIONAL_EXCEPTION';
  reason?: string;
  basis?: number;
  basis_total?: number;
  allocation_percentage: number;
  zone_supply_m3: number;
  allocated_volume_m3: number;
  node_id?: number;
  node_name?: string;
  node_input_method?: 'SITE_PRODUCTION' | 'METERED_TRANSFER' | 'RESIDUAL';
  node_input_volume_m3?: number;
  notes?: string;
}

export interface SourceAllocationZoneSource {
  production_site_name: string;
  allocated_volume_m3: number;
}

export interface SourceAllocationZoneSummary {
  zone_id: number;
  zone_name: string;
  zone_code: string;
  distribution_region_name: string;
  zone_supply_m3: number;
  allocated_volume_m3: number;
  sources: SourceAllocationZoneSource[];
}

export interface SourceAllocationSiteZone {
  zone_name: string;
  allocated_volume_m3: number;
}

export interface SourceAllocationSiteSummary {
  production_site_id: number;
  production_site_name: string;
  production_site_code: string;
  production_region_name: string;
  allocated_volume_m3: number;
  zones: SourceAllocationSiteZone[];
}

export interface SourceAllocationWarning {
  date: string;
  zone_id: number;
  zone_name: string;
  message: string;
}

export interface SourceAllocationPayload {
  start_date: string;
  end_date: string;
  year?: number;
  month?: number;
  zone_billing_cycle_id?: number;
  opening_date?: string;
  closing_date?: string;
  total_zone_supply_m3: number;
  total_allocated_volume_m3: number;
  rows: SourceAllocationRow[];
  zones: SourceAllocationZoneSummary[];
  production_sites: SourceAllocationSiteSummary[];
  warnings: SourceAllocationWarning[];
}

export type WaterBalanceNodeType = 'PRODUCTION_SITE' | 'MIXING_NODE' | 'INTERMEDIARY';
export type WaterBalanceRuleMethod =
  | 'FIXED_WEIGHT'
  | 'FIXED_PERCENTAGE'
  | 'METERED_VOLUME'
  | 'MIXING_NODE_SHARE'
  | 'MANUAL_OVERRIDE';
export type WaterBalanceConfidence = 'MEASURED' | 'MEASURED_ALLOCATED' | 'ESTIMATED' | 'MANUAL';
export type WaterBalanceNodeInputMethod = 'SITE_PRODUCTION' | 'METERED_TRANSFER' | 'RESIDUAL';

export interface WaterBalanceNode {
  id: number;
  name: string;
  code: string;
  node_type: WaterBalanceNodeType;
  node_type_display: string;
  production_site: number | null;
  production_site_name: string | null;
  production_site_code: string | null;
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface WaterBalanceModel {
  id: number;
  name: string;
  zone: number;
  zone_name: string;
  zone_code: string;
  distribution_region_name: string;
  effective_start_date: string;
  effective_end_date: string | null;
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface WaterBalanceRule {
  id: number;
  balance_model: number;
  balance_model_name: string;
  zone_name: string;
  zone_code: string;
  production_site: number;
  production_site_name: string;
  production_site_code: string;
  route_name: string;
  method: WaterBalanceRuleMethod;
  method_display: string;
  basis_value: string | null;
  water_meter: number | null;
  water_meter_name: string | null;
  mixing_node: number | null;
  mixing_node_name: string | null;
  manual_volume_m3: string | null;
  confidence: WaterBalanceConfidence;
  confidence_display: string;
  priority: number;
  is_active: boolean;
  effective_start_date: string | null;
  effective_end_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface WaterBalanceNodeInput {
  id: number;
  node: number;
  node_name: string;
  production_site: number;
  production_site_name: string;
  production_site_code: string;
  input_method: WaterBalanceNodeInputMethod;
  input_method_display: string;
  water_meter: number | null;
  water_meter_name: string | null;
  confidence: WaterBalanceConfidence;
  confidence_display: string;
  priority: number;
  is_active: boolean;
  effective_start_date: string | null;
  effective_end_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}
