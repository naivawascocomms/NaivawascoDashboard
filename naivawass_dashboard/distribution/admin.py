# distribution/admin.py

from django.contrib import admin
from metering.models import DistributionWaterMeterAssignment
from .models import (
    DistributionRegion, Zone, ZoneSupplyConfiguration, DMA, DistributionMeter, DistributionMeterReading,
    BillingCycle, ZoneBillingCycle, CustomerBillingData, DailyDistribution, MonthlyDistribution,
    RegionalDistribution, TransmissionLoss, GlobalNRWPerformance,
    CommercialDashboardReport, CommercialDashboardSection, CommercialDashboardKPI,
    CommercialDashboardMonthlyValue, CommercialDashboardSnapshot
)


@admin.register(DistributionRegion)
class DistributionRegionAdmin(admin.ModelAdmin):
    list_display = [
        'dashboard_order', 'name', 'code', 'production_region',
        'dashboard_supply_kpi_code', 'zone_count', 'is_active'
    ]
    list_filter = ['is_active', 'production_region']
    search_fields = ['name', 'code']
    
    def zone_count(self, obj):
        return obj.zones.count()
    zone_count.short_description = 'Zones'


class ZoneInline(admin.TabularInline):
    model = Zone
    extra = 0
    fields = ['name', 'code', 'zone_type', 'number_of_connections', 'is_active']


class ZoneSupplyConfigurationInline(admin.StackedInline):
    model = ZoneSupplyConfiguration
    extra = 1
    max_num = 1
    autocomplete_fields = [
        'primary_meter', 'component_dmas', 'component_meters',
        'primary_water_meter', 'component_water_meters'
    ]
    fieldsets = (
        (
            'Supply Configuration',
            {
                'fields': (
                    'aggregation_method',
                    'primary_water_meter',
                    'component_dmas',
                    'component_water_meters',
                    'infrastructure_description',
                    'calculation_notes',
                )
            }
        ),
    )


class ZoneWaterMeterAssignmentInline(admin.TabularInline):
    model = DistributionWaterMeterAssignment
    fk_name = 'zone'
    extra = 0
    autocomplete_fields = ['water_meter']
    fields = ['assignment_role', 'water_meter', 'allocation_percentage', 'is_active', 'start_date']
    verbose_name = 'Shared Zone Water Meter Assignment'
    verbose_name_plural = 'Shared Zone Water Meter Assignments'


class DMAWaterMeterAssignmentInline(admin.TabularInline):
    model = DistributionWaterMeterAssignment
    fk_name = 'dma'
    extra = 0
    autocomplete_fields = ['water_meter', 'zone']
    fields = ['assignment_role', 'water_meter', 'zone', 'allocation_percentage', 'is_active', 'start_date']
    verbose_name = 'Shared DMA Water Meter Assignment'
    verbose_name_plural = 'Shared DMA Water Meter Assignments'


@admin.register(Zone)
class ZoneAdmin(admin.ModelAdmin):
    list_display = [
        'dashboard_order', 'code', 'name', 'region', 'zone_type',
        'supply_aggregation_method', 'number_of_connections', 'is_active'
    ]
    list_filter = ['region', 'zone_type', 'is_active']
    search_fields = ['name', 'code', 'region__name']
    inlines = [ZoneSupplyConfigurationInline, ZoneWaterMeterAssignmentInline]


@admin.register(DMA)
class DMAAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'zone', 'number_of_connections', 'is_active']
    list_filter = ['zone__region', 'zone', 'is_active']
    search_fields = ['name', 'code', 'zone__name']
    inlines = [DMAWaterMeterAssignmentInline]


@admin.register(DistributionMeter)
class DistributionMeterAdmin(admin.ModelAdmin):
    list_display = ['meter_number', 'meter_location_type', 'zone', 'dma', 'is_active']
    list_filter = ['meter_location_type', 'zone__region', 'is_active']
    search_fields = ['meter_number', 'zone__name', 'dma__name']
    readonly_fields = ['legacy_workflow_notice']
    fieldsets = (
        (
            'Legacy Distribution Meter',
            {
                'fields': (
                    'legacy_workflow_notice',
                    'meter_location_type', 'zone', 'dma', 'meter_number',
                    'manufacturer', 'model', 'diameter_mm', 'is_active',
                    'installation_date', 'last_calibration_date', 'next_calibration_date',
                    'initial_reading', 'notes'
                )
            },
        ),
    )

    def legacy_workflow_notice(self, obj):
        return 'Legacy compatibility record. Use shared water meter assignments on Zone or DMA admin pages for new setup.'
    legacy_workflow_notice.short_description = 'Workflow'


@admin.register(DistributionMeterReading)
class DistributionMeterReadingAdmin(admin.ModelAdmin):
    list_display = ['meter', 'reading_date', 'volume_supplied', 'is_validated', 'is_anomaly']
    list_filter = ['reading_date', 'is_validated', 'is_anomaly', 'meter__zone__region']
    search_fields = ['meter__meter_number']
    date_hierarchy = 'reading_date'


@admin.register(BillingCycle)
class BillingCycleAdmin(admin.ModelAdmin):
    list_display = ['region', 'year', 'month', 'start_date', 'end_date', 'number_of_days', 'is_finalized']
    list_filter = ['year', 'month', 'region', 'is_finalized']
    search_fields = ['region__name']
    
    def number_of_days(self, obj):
        return obj.number_of_days
    number_of_days.short_description = 'Days'


@admin.register(ZoneBillingCycle)
class ZoneBillingCycleAdmin(admin.ModelAdmin):
    list_display = ['zone', 'year', 'month', 'opening_date', 'closing_date', 'number_of_days', 'is_finalized']
    list_filter = ['year', 'month', 'zone__region', 'is_finalized']
    search_fields = ['zone__name', 'zone__code']

    def number_of_days(self, obj):
        return obj.number_of_days
    number_of_days.short_description = 'Days'


@admin.register(CustomerBillingData)
class CustomerBillingDataAdmin(admin.ModelAdmin):
    list_display = [
        'zone', 'zone_billing_cycle', 'billing_cycle', 'total_volume_billed_m3',
        'number_of_active_connections', 'number_of_bills_generated'
    ]
    list_filter = ['billing_cycle__year', 'billing_cycle__month', 'zone__region']
    search_fields = ['zone__name']


@admin.register(DailyDistribution)
class DailyDistributionAdmin(admin.ModelAdmin):
    list_display = [
        'zone', 'distribution_date', 'volume_supplied_m3',
        'volume_billed_m3', 'nrw_percentage', 'is_validated'
    ]
    list_filter = ['distribution_date', 'is_validated', 'zone__region']
    search_fields = ['zone__name']
    date_hierarchy = 'distribution_date'


@admin.register(MonthlyDistribution)
class MonthlyDistributionAdmin(admin.ModelAdmin):
    list_display = [
        'zone', 'zone_billing_cycle', 'billing_cycle', 'volume_supplied_m3',
        'volume_billed_m3', 'nrw_percentage', 'is_finalized'
    ]
    list_filter = [
        'billing_cycle__year', 'billing_cycle__month',
        'zone__region', 'is_finalized'
    ]
    search_fields = ['zone__name']


@admin.register(RegionalDistribution)
class RegionalDistributionAdmin(admin.ModelAdmin):
    list_display = [
        'region', 'billing_cycle', 'volume_supplied_m3',
        'volume_billed_m3', 'nrw_percentage', 'is_finalized'
    ]
    list_filter = ['billing_cycle__year', 'billing_cycle__month', 'region', 'is_finalized']
    search_fields = ['region__name']


@admin.register(TransmissionLoss)
class TransmissionLossAdmin(admin.ModelAdmin):
    list_display = [
        'billing_cycle', 'water_available_from_production_m3',
        'water_available_to_distribution_m3', 'transmission_loss_percentage'
    ]
    list_filter = ['billing_cycle__year', 'billing_cycle__month']


@admin.register(GlobalNRWPerformance)
class GlobalNRWPerformanceAdmin(admin.ModelAdmin):
    list_display = [
        'billing_cycle', 'water_available_for_sale_m3',
        'volume_billed_to_customers_m3', 'global_nrw_percentage',
        'transmission_loss_percentage', 'regional_nrw_percentage'
    ]
    list_filter = ['billing_cycle__year', 'billing_cycle__month']


class CommercialDashboardSectionInline(admin.TabularInline):
    model = CommercialDashboardSection
    extra = 0
    fields = ['display_order', 'title', 'workbook_row']


@admin.register(CommercialDashboardReport)
class CommercialDashboardReportAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'fiscal_year_label', 'current_snapshot_date',
        'current_fiscal_month_index', 'is_active'
    ]
    list_filter = ['is_active', 'fiscal_year_start']
    search_fields = ['name', 'fiscal_year_label', 'source_workbook']
    inlines = [CommercialDashboardSectionInline]


class CommercialDashboardMonthlyValueInline(admin.TabularInline):
    model = CommercialDashboardMonthlyValue
    extra = 0
    fields = [
        'month', 'target_value_numeric', 'target_value_text',
        'actual_value_numeric', 'actual_value_text'
    ]


class CommercialDashboardSnapshotInline(admin.TabularInline):
    model = CommercialDashboardSnapshot
    extra = 0
    fields = [
        'snapshot_year', 'snapshot_month',
        'monthly_target_numeric', 'monthly_actual_numeric',
        'cumulative_target_numeric', 'cumulative_actual_numeric'
    ]


@admin.register(CommercialDashboardKPI)
class CommercialDashboardKPIAdmin(admin.ModelAdmin):
    list_display = [
        'display_order', 'label', 'report', 'section', 'scope_type',
        'zone', 'region', 'unit', 'is_total'
    ]
    list_filter = ['report', 'section', 'scope_type', 'is_total', 'is_summary']
    search_fields = ['label', 'subgroup_title', 'unit']
    inlines = [CommercialDashboardMonthlyValueInline, CommercialDashboardSnapshotInline]


@admin.register(CommercialDashboardMonthlyValue)
class CommercialDashboardMonthlyValueAdmin(admin.ModelAdmin):
    list_display = ['kpi', 'month', 'target_value_numeric', 'actual_value_numeric']
    list_filter = ['month', 'kpi__report']
    search_fields = ['kpi__label']


@admin.register(CommercialDashboardSnapshot)
class CommercialDashboardSnapshotAdmin(admin.ModelAdmin):
    list_display = [
        'kpi', 'snapshot_year', 'snapshot_month',
        'monthly_target_numeric', 'monthly_actual_numeric',
        'cumulative_target_numeric', 'cumulative_actual_numeric'
    ]
    list_filter = ['snapshot_year', 'snapshot_month', 'kpi__report']
    search_fields = ['kpi__label']
