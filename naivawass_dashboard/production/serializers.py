# production/serializers.py
from rest_framework import serializers
from .models import (
    Region, ProductionSite, WaterSource, Meter, MeterReading,
    ProductionTarget, DailyProduction, MonthlyProduction, WaterQualityTest,
    CompanyMonthlySummary,
)
from .utils import calculate_previous_reading


class RegionSerializer(serializers.ModelSerializer):
    production_site_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Region
        fields = [
            'id', 'name', 'code', 'description', 'is_active',
            'production_site_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def get_production_site_count(self, obj):
        return obj.production_sites.filter(is_active=True).count()


class WaterSourceSerializer(serializers.ModelSerializer):
    production_site_name = serializers.CharField(source='production_site.name', read_only=True)
    meter_count = serializers.SerializerMethodField()
    
    class Meta:
        model = WaterSource
        fields = [
            'id', 'production_site', 'production_site_name', 'name', 'code',
            'source_type', 'depth_meters', 'yield_m3_per_hour', 'is_active',
            'commissioned_date', 'last_maintenance_date', 'meter_count',
            'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def get_meter_count(self, obj):
        return obj.meters.filter(is_active=True).count()


class ProductionSiteListSerializer(serializers.ModelSerializer):
    region_name = serializers.CharField(source='region.name', read_only=True)
    water_source_count = serializers.SerializerMethodField()
    active_meter_count = serializers.SerializerMethodField()
    
    class Meta:
        model = ProductionSite
        fields = [
            'id', 'name', 'code', 'region', 'region_name', 'site_type',
            'production_equals_supply', 'has_solar', 'is_active',
            'water_source_count', 'active_meter_count'
        ]
    
    def get_water_source_count(self, obj):
        return obj.water_sources.filter(is_active=True).count()
    
    def get_active_meter_count(self, obj):
        return obj.meters.filter(is_active=True).count()


class ProductionSiteDetailSerializer(serializers.ModelSerializer):
    region_name = serializers.CharField(source='region.name', read_only=True)
    water_sources = WaterSourceSerializer(many=True, read_only=True)
    
    class Meta:
        model = ProductionSite
        fields = [
            'id', 'name', 'code', 'region', 'region_name', 'site_type',
            'production_equals_supply', 'has_solar', 'solar_capacity_kwh',
            'is_active', 'commissioned_date', 'latitude', 'longitude',
            'water_sources', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class MeterSerializer(serializers.ModelSerializer):
    production_site_name = serializers.CharField(source='production_site.name', read_only=True)
    water_source_name = serializers.CharField(source='water_source.name', read_only=True, allow_null=True)
    meter_type_display = serializers.CharField(source='get_meter_type_display', read_only=True)
    last_reading_date = serializers.SerializerMethodField()
    
    class Meta:
        model = Meter
        fields = [
            'id', 'production_site', 'production_site_name',
            'water_source', 'water_source_name', 'meter_type',
            'meter_type_display', 'meter_number', 'manufacturer',
            'model', 'capacity', 'is_active', 'installation_date',
            'last_calibration_date', 'next_calibration_date',
            'initial_reading', 'last_reading_date', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def get_last_reading_date(self, obj):
        last_reading = obj.readings.first()
        return last_reading.reading_date if last_reading else None


class MeterReadingSerializer(serializers.ModelSerializer):
    meter_number = serializers.CharField(source='meter.meter_number', read_only=True)
    production_site_name = serializers.CharField(
        source='meter.production_site.name',
        read_only=True
    )
    reading_method_display = serializers.CharField(
        source='get_reading_method_display',
        read_only=True
    )
    
    class Meta:
        model = MeterReading
        fields = [
            'id', 'meter', 'meter_number', 'production_site_name',
            'reading_date', 'reading_time', 'current_reading',
            'previous_reading', 'consumption', 'read_by',
            'reading_method', 'reading_method_display', 'is_validated',
            'is_anomaly', 'validated_by', 'validated_at', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['consumption', 'created_at', 'updated_at']


class MeterReadingCreateSerializer(serializers.ModelSerializer):
    """Simplified serializer for creating meter readings"""
    class Meta:
        model = MeterReading
        fields = [
            'meter', 'reading_date', 'reading_time', 'current_reading',
            'read_by', 'reading_method', 'notes'
        ]
    
    def validate(self, data):
        # Get the previous reading for this meter
        meter = data['meter']
        previous_reading = calculate_previous_reading(meter)
        data['previous_reading'] = previous_reading

        # Check for negative consumption
        if data['current_reading'] < previous_reading:
            raise serializers.ValidationError(
                "Current reading cannot be less than previous reading"
            )
        
        return data


class ProductionTargetSerializer(serializers.ModelSerializer):
    production_site_name = serializers.CharField(source='production_site.name', read_only=True)
    total_power_target_kwh = serializers.DecimalField(
        max_digits=15,
        decimal_places=2,
        read_only=True
    )
    solar_percentage_target = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        read_only=True
    )
    
    class Meta:
        model = ProductionTarget
        fields = [
            'id', 'production_site', 'production_site_name', 'year', 'month',
            'water_abstraction_target_m3', 'production_loss_target_m3',
            'production_loss_target_percent', 'power_grid_target_kwh',
            'power_solar_target_kwh', 'total_power_target_kwh',
            'solar_percentage_target', 'power_efficiency_target_kwh_per_m3',
            'power_cost_per_m3_target', 'power_cost_per_kwh_target',
            'chemical_tests_target', 'biological_tests_target',
            'consumer_chemical_tests_target', 'consumer_biological_tests_target',
            'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class DailyProductionSerializer(serializers.ModelSerializer):
    production_site_name = serializers.CharField(source='production_site.name', read_only=True)
    production_site_code = serializers.CharField(source='production_site.code', read_only=True)
    
    class Meta:
        model = DailyProduction
        fields = [
            'id', 'production_site', 'production_site_name', 'production_site_code',
            'production_date', 'water_abstracted_m3', 'water_supplied_m3',
            'water_received_m3', 'production_loss_m3',
            'water_available_for_sale_m3', 'power_grid_kwh', 'power_solar_kwh',
            'total_power_kwh', 'power_efficiency_kwh_per_m3', 'solar_percentage',
            'production_loss_percentage', 'is_complete', 'is_validated',
            'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'water_available_for_sale_m3', 'total_power_kwh',
            'power_efficiency_kwh_per_m3', 'solar_percentage',
            'production_loss_percentage', 'created_at', 'updated_at'
        ]


class MonthlyProductionSerializer(serializers.ModelSerializer):
    production_site_name = serializers.CharField(source='production_site.name', read_only=True)
    production_site_code = serializers.CharField(source='production_site.code', read_only=True)
    region_name = serializers.CharField(source='production_site.region.name', read_only=True)
    target_details = ProductionTargetSerializer(source='target', read_only=True)
    
    class Meta:
        model = MonthlyProduction
        fields = [
            'id', 'production_site', 'production_site_name', 'production_site_code',
            'region_name', 'year', 'month', 'closing_date',
            # Water production
            'water_abstracted_m3', 'water_supplied_m3', 'water_received_m3',
            'production_loss_m3', 'water_available_for_sale_m3',
            # Power consumption
            'power_grid_kwh', 'power_solar_kwh', 'total_power_kwh',
            # Efficiency KPIs
            'power_efficiency_kwh_per_m3', 'solar_percentage', 'production_loss_percentage',
            # Costs
            'power_costs', 'repair_maintenance_costs', 'abstraction_fee',
            'chemical_costs', 'total_direct_costs',
            # Cost per unit
            'power_cost_per_m3', 'power_cost_per_kwh', 'total_cost_per_m3',
            # Water quality
            'chemical_tests_production', 'biological_tests_production',
            'chemical_tests_consumer', 'biological_tests_consumer',
            # WHO compliance
            'who_compliance_chemical_production', 'who_compliance_biological_production',
            'who_compliance_chemical_consumer', 'who_compliance_biological_consumer',
            # Target comparison
            'target', 'target_details', 'water_abstraction_realization_percent',
            # Status
            'is_finalized', 'finalized_by', 'finalized_at',
            'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'water_available_for_sale_m3', 'total_power_kwh',
            'power_efficiency_kwh_per_m3', 'solar_percentage',
            'production_loss_percentage', 'total_direct_costs',
            'power_cost_per_m3', 'power_cost_per_kwh', 'total_cost_per_m3',
            'water_abstraction_realization_percent', 'created_at', 'updated_at'
        ]


class MonthlyProductionSummarySerializer(serializers.ModelSerializer):
    """Dashboard list serializer — includes all fields needed by the production dashboard."""
    production_site_name = serializers.CharField(source='production_site.name', read_only=True)
    production_site_code = serializers.CharField(source='production_site.code', read_only=True)
    region_name = serializers.CharField(source='production_site.region.name', read_only=True)
    target_details = ProductionTargetSerializer(source='target', read_only=True)

    class Meta:
        model = MonthlyProduction
        fields = [
            'id', 'production_site', 'production_site_name', 'production_site_code',
            'region_name', 'year', 'month', 'closing_date',
            # Water
            'water_abstracted_m3', 'water_supplied_m3', 'water_received_m3',
            'production_loss_m3', 'water_available_for_sale_m3',
            'production_loss_percentage',
            # Power
            'power_grid_kwh', 'power_solar_kwh', 'total_power_kwh',
            'power_efficiency_kwh_per_m3', 'solar_percentage',
            # Costs
            'power_costs', 'repair_maintenance_costs', 'abstraction_fee',
            'chemical_costs', 'total_direct_costs',
            'power_cost_per_m3', 'power_cost_per_kwh', 'total_cost_per_m3',
            # Target comparison
            'target', 'target_details', 'water_abstraction_realization_percent',
            # Status
            'is_finalized',
        ]


class MonthlyProductionFYSiteSummarySerializer(serializers.Serializer):
    """FY aggregated monthly-production row per site (one row per site)."""
    id = serializers.IntegerField()
    production_site = serializers.IntegerField()
    production_site_name = serializers.CharField()
    production_site_code = serializers.CharField()
    region_name = serializers.CharField()
    year = serializers.IntegerField()
    month = serializers.IntegerField(allow_null=True)

    water_abstracted_m3 = serializers.DecimalField(max_digits=15, decimal_places=2)
    water_supplied_m3 = serializers.DecimalField(max_digits=15, decimal_places=2)
    water_received_m3 = serializers.DecimalField(max_digits=15, decimal_places=2)
    production_loss_m3 = serializers.DecimalField(max_digits=15, decimal_places=2)
    water_available_for_sale_m3 = serializers.DecimalField(max_digits=15, decimal_places=2)
    production_loss_percentage = serializers.DecimalField(max_digits=7, decimal_places=2)

    power_grid_kwh = serializers.DecimalField(max_digits=15, decimal_places=2)
    power_solar_kwh = serializers.DecimalField(max_digits=15, decimal_places=2)
    total_power_kwh = serializers.DecimalField(max_digits=15, decimal_places=2)
    solar_percentage = serializers.DecimalField(max_digits=7, decimal_places=2)
    power_efficiency_kwh_per_m3 = serializers.DecimalField(max_digits=10, decimal_places=4, allow_null=True)

    power_costs = serializers.DecimalField(max_digits=15, decimal_places=2)
    repair_maintenance_costs = serializers.DecimalField(max_digits=15, decimal_places=2)
    abstraction_fee = serializers.DecimalField(max_digits=15, decimal_places=2)
    chemical_costs = serializers.DecimalField(max_digits=15, decimal_places=2)
    total_direct_costs = serializers.DecimalField(max_digits=15, decimal_places=2)
    power_cost_per_m3 = serializers.DecimalField(max_digits=10, decimal_places=4, allow_null=True)
    power_cost_per_kwh = serializers.DecimalField(max_digits=10, decimal_places=4, allow_null=True)
    total_cost_per_m3 = serializers.DecimalField(max_digits=10, decimal_places=4, allow_null=True)

    water_abstraction_realization_percent = serializers.DecimalField(max_digits=7, decimal_places=2)
    is_finalized = serializers.BooleanField()
    target_details = serializers.DictField()


class WaterQualityTestSerializer(serializers.ModelSerializer):
    production_site_name = serializers.CharField(source='production_site.name', read_only=True)
    test_type_display = serializers.CharField(source='get_test_type_display', read_only=True)
    test_location_display = serializers.CharField(
        source='get_test_location_display',
        read_only=True
    )
    
    class Meta:
        model = WaterQualityTest
        fields = [
            'id', 'production_site', 'production_site_name', 'test_date',
            'test_type', 'test_type_display', 'test_location',
            'test_location_display', 'parameter_tested', 'test_result',
            'unit_of_measure', 'who_standard', 'is_compliant',
            'tested_by', 'lab_reference', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class CompanyMonthlySummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanyMonthlySummary
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class DashboardSummarySerializer(serializers.Serializer):
    """Serializer for dashboard summary data"""
    period = serializers.CharField()
    region = serializers.CharField()
    total_sites = serializers.IntegerField()
    active_sites = serializers.IntegerField()
    total_water_abstracted = serializers.DecimalField(max_digits=15, decimal_places=2)
    total_production_loss = serializers.DecimalField(max_digits=15, decimal_places=2)
    production_loss_percentage = serializers.DecimalField(max_digits=5, decimal_places=2)
    total_power_consumption = serializers.DecimalField(max_digits=15, decimal_places=2)
    solar_power_percentage = serializers.DecimalField(max_digits=5, decimal_places=2)
    average_power_efficiency = serializers.DecimalField(max_digits=10, decimal_places=4)
    total_costs = serializers.DecimalField(max_digits=15, decimal_places=2)
    average_cost_per_m3 = serializers.DecimalField(max_digits=10, decimal_places=2)
    target_realization_percentage = serializers.DecimalField(max_digits=5, decimal_places=2)


class ProductionComparisonSerializer(serializers.Serializer):
    """Serializer for comparing actuals vs targets"""
    production_site = serializers.CharField()
    year = serializers.IntegerField()
    month = serializers.IntegerField()
    
    # Water abstraction
    water_target = serializers.DecimalField(max_digits=15, decimal_places=2)
    water_actual = serializers.DecimalField(max_digits=15, decimal_places=2)
    water_variance = serializers.DecimalField(max_digits=15, decimal_places=2)
    water_realization = serializers.DecimalField(max_digits=5, decimal_places=2)
    
    # Power efficiency
    efficiency_target = serializers.DecimalField(max_digits=10, decimal_places=4)
    efficiency_actual = serializers.DecimalField(max_digits=10, decimal_places=4)
    efficiency_variance = serializers.DecimalField(max_digits=10, decimal_places=4)
    
    # Production loss
    loss_target_percent = serializers.DecimalField(max_digits=5, decimal_places=2)
    loss_actual_percent = serializers.DecimalField(max_digits=5, decimal_places=2)
