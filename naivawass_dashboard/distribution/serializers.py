# distribution/serializers.py

from datetime import date, timedelta

from rest_framework import serializers
from .models import (
    DistributionRegion, Zone, ZoneSupplyConfiguration, DMA, DistributionMeter, DistributionMeterReading,
    BillingCycle, ZoneBillingCycle, CustomerBillingData, DailyDistribution, MonthlyDistribution,
    RegionalDistribution, TransmissionLoss, GlobalNRWPerformance, CommercialDashboardReport,
    CommercialDashboardSection, CommercialDashboardKPI, CommercialDashboardMonthlyValue,
    CommercialDashboardSnapshot
)


class ZoneSupplyConfigurationSerializer(serializers.ModelSerializer):
    primary_meter_number = serializers.CharField(source='primary_meter.meter_number', read_only=True, allow_null=True)
    primary_water_meter_number = serializers.CharField(source='primary_water_meter.meter_number', read_only=True, allow_null=True)
    component_dma_codes = serializers.SerializerMethodField()
    component_meter_numbers = serializers.SerializerMethodField()
    component_water_meter_numbers = serializers.SerializerMethodField()

    class Meta:
        model = ZoneSupplyConfiguration
        fields = [
            'aggregation_method',
            'primary_meter', 'primary_meter_number',
            'primary_water_meter', 'primary_water_meter_number',
            'component_dmas', 'component_dma_codes',
            'component_meters', 'component_meter_numbers',
            'component_water_meters', 'component_water_meter_numbers',
            'infrastructure_description', 'calculation_notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_component_dma_codes(self, obj):
        return list(obj.component_dmas.values_list('code', flat=True))

    def get_component_meter_numbers(self, obj):
        return list(obj.component_meters.values_list('meter_number', flat=True))

    def get_component_water_meter_numbers(self, obj):
        return list(obj.component_water_meters.values_list('meter_number', flat=True))


class DistributionRegionSerializer(serializers.ModelSerializer):
    production_region_name = serializers.CharField(
        source='production_region.name',
        read_only=True,
        allow_null=True
    )
    zone_count = serializers.SerializerMethodField()
    
    class Meta:
        model = DistributionRegion
        fields = [
            'id', 'name', 'code', 'description', 'production_region',
            'production_region_name', 'default_billing_day', 'zone_count',
            'dashboard_order', 'dashboard_supply_kpi_code',
            'dashboard_billed_kpi_code', 'dashboard_nrw_m3_kpi_code',
            'dashboard_nrw_pct_kpi_code',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def get_zone_count(self, obj):
        return obj.zones.filter(is_active=True).count()


class DMASerializer(serializers.ModelSerializer):
    zone_name = serializers.CharField(source='zone.name', read_only=True)
    
    class Meta:
        model = DMA
        fields = [
            'id', 'zone', 'zone_name', 'name', 'code', 'description',
            'number_of_connections', 'average_pressure_bar',
            'expected_daily_consumption_m3', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class ZoneSerializer(serializers.ModelSerializer):
    region_name = serializers.CharField(source='region.name', read_only=True)
    dma_count = serializers.SerializerMethodField()
    dmas = DMASerializer(many=True, read_only=True)
    supply_configuration = ZoneSupplyConfigurationSerializer(read_only=True)
    
    class Meta:
        model = Zone
        fields = [
            'id', 'region', 'region_name', 'name', 'code', 'description',
            'dashboard_order', 'dashboard_supply_kpi_code',
            'dashboard_billed_kpi_code', 'dashboard_nrw_pct_kpi_code',
            'supply_aggregation_method', 'supply_configuration',
            'zone_type', 'estimated_population', 'number_of_connections',
            'area_km2', 'dma_count', 'dmas', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def get_dma_count(self, obj):
        return obj.dmas.filter(is_active=True).count()


class DistributionMeterSerializer(serializers.ModelSerializer):
    zone_name = serializers.CharField(source='zone.name', read_only=True, allow_null=True)
    dma_name = serializers.CharField(source='dma.name', read_only=True, allow_null=True)
    meter_location_display = serializers.CharField(
        source='get_meter_location_type_display',
        read_only=True
    )
    
    class Meta:
        model = DistributionMeter
        fields = [
            'id', 'meter_location_type', 'meter_location_display',
            'zone', 'zone_name', 'dma', 'dma_name', 'meter_number',
            'manufacturer', 'model', 'diameter_mm', 'is_active',
            'installation_date', 'last_calibration_date',
            'next_calibration_date', 'initial_reading', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class DistributionMeterReadingSerializer(serializers.ModelSerializer):
    meter_number = serializers.CharField(source='meter.meter_number', read_only=True)
    zone_name = serializers.CharField(source='meter.zone.name', read_only=True, allow_null=True)
    
    class Meta:
        model = DistributionMeterReading
        fields = [
            'id', 'meter', 'meter_number', 'zone_name', 'reading_date',
            'reading_time', 'current_reading', 'previous_reading',
            'volume_supplied', 'read_by', 'reading_method',
            'is_validated', 'is_anomaly', 'validated_by', 'validated_at',
            'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['volume_supplied', 'created_at', 'updated_at']


class BillingCycleSerializer(serializers.ModelSerializer):
    region_name = serializers.CharField(source='region.name', read_only=True)
    number_of_days = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = BillingCycle
        fields = [
            'id', 'region', 'region_name', 'year', 'month',
            'start_date', 'end_date', 'number_of_days',
            'billing_run_date', 'is_finalized', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class ZoneBillingCycleSerializer(serializers.ModelSerializer):
    zone_name = serializers.CharField(source='zone.name', read_only=True)
    zone_code = serializers.CharField(source='zone.code', read_only=True)
    region_name = serializers.CharField(source='zone.region.name', read_only=True)
    number_of_days = serializers.IntegerField(read_only=True)
    effective_closing_date = serializers.DateField(read_only=True)
    is_open = serializers.BooleanField(read_only=True)
    opening_date = serializers.DateField(required=False)
    closing_date = serializers.DateField(required=False, allow_null=True)

    class Meta:
        model = ZoneBillingCycle
        fields = [
            'id', 'zone', 'zone_name', 'zone_code', 'region_name',
            'year', 'month', 'opening_date', 'closing_date', 'effective_closing_date',
            'number_of_days', 'is_open',
            'is_finalized', 'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance is None and not attrs.get('opening_date'):
            zone = attrs.get('zone')
            year = attrs.get('year')
            month = attrs.get('month')
            previous_cycle = (
                ZoneBillingCycle.objects
                .filter(zone=zone, closing_date__isnull=False)
                .order_by('-closing_date', '-year', '-month')
                .first()
            )
            attrs['opening_date'] = (
                previous_cycle.closing_date + timedelta(days=1)
                if previous_cycle
                else date(year, month, 1)
            )
        return attrs


class CustomerBillingDataSerializer(serializers.ModelSerializer):
    zone_name = serializers.CharField(source='zone.name', read_only=True)
    billing_cycle_details = BillingCycleSerializer(source='billing_cycle', read_only=True)
    zone_billing_cycle_details = ZoneBillingCycleSerializer(source='zone_billing_cycle', read_only=True)
    
    class Meta:
        model = CustomerBillingData
        fields = [
            'id', 'zone', 'zone_name',
            'billing_cycle', 'billing_cycle_details',
            'zone_billing_cycle', 'zone_billing_cycle_details',
            'total_volume_billed_m3', 'number_of_bills_generated',
            'number_of_active_connections', 'total_revenue',
            'water_revenue', 'sewer_revenue', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class DailyDistributionSerializer(serializers.ModelSerializer):
    zone_name = serializers.CharField(source='zone.name', read_only=True)
    zone_code = serializers.CharField(source='zone.code', read_only=True)
    
    class Meta:
        model = DailyDistribution
        fields = [
            'id', 'zone', 'zone_name', 'zone_code', 'distribution_date',
            'volume_supplied_m3', 'volume_billed_m3', 'nrw_m3',
            'nrw_percentage', 'is_complete', 'is_validated', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['nrw_m3', 'nrw_percentage', 'created_at', 'updated_at']


class MonthlyDistributionSerializer(serializers.ModelSerializer):
    zone_name = serializers.CharField(source='zone.name', read_only=True)
    zone_code = serializers.CharField(source='zone.code', read_only=True)
    region_name = serializers.CharField(source='zone.region.name', read_only=True)
    billing_cycle_details = BillingCycleSerializer(source='billing_cycle', read_only=True)
    zone_billing_cycle_details = ZoneBillingCycleSerializer(source='zone_billing_cycle', read_only=True)
    
    class Meta:
        model = MonthlyDistribution
        fields = [
            'id', 'zone', 'zone_name', 'zone_code', 'region_name',
            'billing_cycle', 'billing_cycle_details',
            'zone_billing_cycle', 'zone_billing_cycle_details',
            'volume_supplied_m3', 'volume_billed_m3', 'nrw_m3', 'nrw_percentage',
            'nrw_target_percentage', 'volume_supplied_target_m3',
            'volume_supplied_realization_percent', 'nrw_realization_percent',
            'is_finalized', 'finalized_by', 'finalized_at',
            'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'nrw_m3', 'nrw_percentage', 'volume_supplied_realization_percent',
            'nrw_realization_percent', 'created_at', 'updated_at'
        ]


class RegionalDistributionSerializer(serializers.ModelSerializer):
    region_name = serializers.CharField(source='region.name', read_only=True)
    billing_cycle_details = BillingCycleSerializer(source='billing_cycle', read_only=True)
    
    class Meta:
        model = RegionalDistribution
        fields = [
            'id', 'region', 'region_name', 'billing_cycle', 'billing_cycle_details',
            'volume_supplied_m3', 'volume_billed_m3', 'nrw_m3', 'nrw_percentage',
            'nrw_target_percentage', 'amount_billed_water', 'amount_billed_sewer',
            'active_water_connections', 'active_sewer_connections',
            'is_finalized', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['nrw_m3', 'nrw_percentage', 'created_at', 'updated_at']


class TransmissionLossSerializer(serializers.ModelSerializer):
    billing_cycle_details = BillingCycleSerializer(source='billing_cycle', read_only=True)
    production_region_name = serializers.CharField(
        source='production_region.name',
        read_only=True,
        allow_null=True
    )
    
    class Meta:
        model = TransmissionLoss
        fields = [
            'id', 'billing_cycle', 'billing_cycle_details',
            'production_region', 'production_region_name',
            'water_available_from_production_m3',
            'water_available_to_distribution_m3',
            'transmission_loss_m3', 'transmission_loss_percentage',
            'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'transmission_loss_m3', 'transmission_loss_percentage',
            'created_at', 'updated_at'
        ]


class GlobalNRWPerformanceSerializer(serializers.ModelSerializer):
    billing_cycle_details = BillingCycleSerializer(source='billing_cycle', read_only=True)
    
    class Meta:
        model = GlobalNRWPerformance
        fields = [
            'id', 'billing_cycle', 'billing_cycle_details',
            'water_available_for_sale_m3', 'volume_billed_to_customers_m3',
            'global_nrw_m3', 'global_nrw_percentage',
            'transmission_loss_percentage', 'regional_nrw_percentage',
            'global_nrw_target_percentage',
            'active_water_connections', 'active_sewer_connections',
            'inactive_water_connections', 'inactive_sewer_connections',
            'total_connections', 'maintenance_repair_operational_cost',
            'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'global_nrw_m3', 'global_nrw_percentage',
            'created_at', 'updated_at'
        ]


class CommercialDashboardMonthlyValueSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommercialDashboardMonthlyValue
        fields = [
            'id', 'kpi', 'month',
            'target_value_numeric', 'target_value_text',
            'actual_value_numeric', 'actual_value_text',
            'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class CommercialDashboardSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommercialDashboardSnapshot
        fields = [
            'id', 'kpi', 'snapshot_year', 'snapshot_month',
            'monthly_target_numeric', 'monthly_target_text',
            'monthly_actual_numeric', 'monthly_actual_text',
            'monthly_realization_percent',
            'cumulative_target_numeric', 'cumulative_target_text',
            'cumulative_actual_numeric', 'cumulative_actual_text',
            'cumulative_realization_percent',
            'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class CommercialDashboardKPISerializer(serializers.ModelSerializer):
    region_name = serializers.CharField(source='region.name', read_only=True, allow_null=True)
    zone_name = serializers.CharField(source='zone.name', read_only=True, allow_null=True)
    monthly_values = CommercialDashboardMonthlyValueSerializer(many=True, read_only=True)
    snapshots = CommercialDashboardSnapshotSerializer(many=True, read_only=True)

    class Meta:
        model = CommercialDashboardKPI
        fields = [
            'id', 'report', 'section', 'label', 'unit', 'item_number',
            'subgroup_title', 'scope_type', 'region', 'region_name',
            'zone', 'zone_name', 'display_order', 'workbook_row',
            'is_total', 'is_summary', 'is_percentage',
            'notes', 'monthly_values', 'snapshots',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class CommercialDashboardSectionSerializer(serializers.ModelSerializer):
    kpis = CommercialDashboardKPISerializer(many=True, read_only=True)

    class Meta:
        model = CommercialDashboardSection
        fields = [
            'id', 'report', 'title', 'display_order', 'workbook_row',
            'kpis', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class CommercialDashboardReportSerializer(serializers.ModelSerializer):
    section_count = serializers.SerializerMethodField()
    kpi_count = serializers.SerializerMethodField()

    class Meta:
        model = CommercialDashboardReport
        fields = [
            'id', 'name', 'fiscal_year_start', 'fiscal_year_label',
            'current_snapshot_date', 'current_fiscal_month_index',
            'sewerage_percentage_of_water', 'source_workbook',
            'notes', 'is_active', 'section_count', 'kpi_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_section_count(self, obj):
        return obj.sections.count()

    def get_kpi_count(self, obj):
        return obj.kpis.count()
