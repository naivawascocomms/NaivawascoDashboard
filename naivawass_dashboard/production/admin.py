from django.contrib import admin
from django.utils.html import format_html
from django.utils.safestring import mark_safe
from django.db.models import Sum, Count
from django.urls import reverse
from metering.models import (
    ProductionEnergyMeterAssignment,
    ProductionWaterMeterAssignment,
)
from .models import (
    Region, ProductionCostConfig, ProductionSite, WaterSource, Meter, MeterReading,
    ProductionTarget, DailyProduction, MonthlyProduction, WaterQualityTest
)
from .utils import refresh_production_for_site_dates


# -------------------------
# Region
# -------------------------
@admin.register(Region)
class RegionAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'is_active', 'site_count', 'created_at']
    list_filter = ['is_active']
    search_fields = ['name', 'code']
    readonly_fields = ['created_at', 'updated_at']

    def site_count(self, obj):
        return obj.production_sites.count()
    site_count.short_description = 'Production Sites'


@admin.register(ProductionCostConfig)
class ProductionCostConfigAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'grid_power_cost_per_kwh', 'solar_power_cost_per_kwh',
        'is_active', 'updated_at'
    ]
    list_filter = ['is_active']
    search_fields = ['name']
    readonly_fields = ['created_at', 'updated_at']
    fields = [
        'name', 'grid_power_cost_per_kwh', 'solar_power_cost_per_kwh',
        'is_active', 'notes', 'created_at', 'updated_at'
    ]

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if obj.is_active:
            ProductionCostConfig.objects.exclude(pk=obj.pk).update(is_active=False)


# -------------------------
# Inlines
# -------------------------
class MeterInline(admin.TabularInline):
    model = Meter
    extra = 0
    fields = ['meter_type', 'meter_number', 'is_active', 'installation_date']


class BaseFilteredMeterInline(admin.TabularInline):
    model = Meter
    extra = 0
    allowed_meter_types = []

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        return queryset.filter(meter_type__in=self.allowed_meter_types)

    def formfield_for_choice_field(self, db_field, request, **kwargs):
        if db_field.name == 'meter_type':
            kwargs['choices'] = [
                choice for choice in db_field.choices
                if choice[0] in self.allowed_meter_types
            ]
        return super().formfield_for_choice_field(db_field, request, **kwargs)


class ProductionMeterInline(BaseFilteredMeterInline):
    fields = ['water_source', 'meter_type', 'meter_number', 'is_active', 'installation_date']
    verbose_name = 'Production Meter'
    verbose_name_plural = 'Production Meters'
    allowed_meter_types = ['WATER']
    autocomplete_fields = ['water_source']


class SupplyMeterInline(BaseFilteredMeterInline):
    fields = ['meter_type', 'meter_number', 'is_active', 'installation_date']
    verbose_name = 'Supply Meter'
    verbose_name_plural = 'Supply Meters'
    allowed_meter_types = ['SUPPLY']


class EnergyMeterInline(BaseFilteredMeterInline):
    fields = ['meter_type', 'meter_number', 'is_active', 'installation_date']
    verbose_name = 'Energy Meter'
    verbose_name_plural = 'Energy Meters'
    allowed_meter_types = ['POWER_GRID', 'POWER_SOLAR']


class ProductionWaterMeterAssignmentInline(admin.TabularInline):
    model = ProductionWaterMeterAssignment
    extra = 0
    autocomplete_fields = ['water_meter', 'water_source']
    fields = ['assignment_role', 'water_meter', 'water_source', 'is_active', 'start_date']
    verbose_name = 'Shared Water Meter Assignment'
    verbose_name_plural = 'Shared Water Meter Assignments'


class ProductionEnergyMeterAssignmentInline(admin.TabularInline):
    model = ProductionEnergyMeterAssignment
    extra = 0
    autocomplete_fields = ['energy_meter']
    fields = ['assignment_role', 'energy_meter', 'is_active', 'start_date']
    verbose_name = 'Shared Energy Meter Assignment'
    verbose_name_plural = 'Shared Energy Meter Assignments'


# -------------------------
# Production Site
# -------------------------
@admin.register(ProductionSite)
class ProductionSiteAdmin(admin.ModelAdmin):
    list_display = [
        'code', 'name', 'region', 'site_type', 'production_equals_supply', 'has_solar',
        'is_active', 'source_count', 'meter_count'
    ]
    list_filter = ['region', 'site_type', 'production_equals_supply', 'is_active', 'has_solar']
    search_fields = ['name', 'code']
    readonly_fields = ['shared_meter_workflow_notice', 'water_sources_reference', 'created_at', 'updated_at']
    fieldsets = (
        (
            'General Site Information',
            {
                'fields': (
                    'name', 'code', 'region', 'site_type',
                    'production_equals_supply', 'has_solar', 'solar_capacity_kwh', 'is_active',
                    'shared_meter_workflow_notice',
                    'commissioned_date', 'latitude', 'longitude',
                    'notes', 'created_at', 'updated_at',
                )
            },
        ),
        (
            'Water Sources',
            {
                'fields': ('water_sources_reference',),
                'description': 'Water sources are managed as separate WaterSource records and referenced here.',
            },
        ),
    )
    inlines = [ProductionWaterMeterAssignmentInline, ProductionEnergyMeterAssignmentInline]

    def source_count(self, obj):
        count = obj.water_sources.count()
        return format_html(
            '<span style="color: {};">{}</span>',
            'green' if count > 0 else 'red',
            count
        )
    source_count.short_description = 'Water Sources'

    def meter_count(self, obj):
        return obj.water_meter_assignments.count() + obj.energy_meter_assignments.count()
    meter_count.short_description = 'Meters'

    def shared_meter_workflow_notice(self, obj):
        return (
            'Use the shared meter assignment inlines below for new meter mapping. '
            'Legacy production meters remain available for historical compatibility only.'
        )
    shared_meter_workflow_notice.short_description = 'Metering Workflow'

    def water_sources_reference(self, obj):
        if not obj.pk:
            return 'Save the production site first, then attach existing WaterSource records to it.'

        water_sources = obj.water_sources.all().order_by('name')
        if not water_sources.exists():
            add_url = reverse('admin:production_watersource_add')
            return format_html(
                'No water sources linked. <a href="{}">Create a WaterSource</a> and assign this site.',
                add_url
            )

        links = []
        for source in water_sources:
            change_url = reverse('admin:production_watersource_change', args=[source.pk])
            links.append(
                format_html(
                    '<a href="{}">{} ({})</a>',
                    change_url,
                    source.name,
                    source.code,
                )
            )

        return mark_safe('<br>'.join(str(link) for link in links))
    water_sources_reference.short_description = 'Linked Water Sources'


# -------------------------
# Water Source
# -------------------------
@admin.register(WaterSource)
class WaterSourceAdmin(admin.ModelAdmin):
    list_display = [
        'code', 'name', 'production_site', 'source_type',
        'depth_meters', 'is_active', 'meter_count'
    ]
    list_filter = ['production_site__region', 'production_site', 'source_type', 'is_active']
    search_fields = ['name', 'code', 'production_site__name']
    readonly_fields = ['created_at', 'updated_at']
    autocomplete_fields = ['production_site']

    def meter_count(self, obj):
        return obj.meter_assignments.count()
    meter_count.short_description = 'Meters'


# -------------------------
# Meter Reading Inline
# -------------------------
class MeterReadingInline(admin.TabularInline):
    model = MeterReading
    extra = 0
    fields = ['reading_date', 'current_reading', 'consumption', 'is_validated', 'is_anomaly']
    readonly_fields = ['consumption']
    ordering = ['-reading_date']


# -------------------------
# Meter
# -------------------------
@admin.register(Meter)
class MeterAdmin(admin.ModelAdmin):
    list_display = [
        'meter_number', 'meter_type', 'production_site',
        'water_source', 'is_active', 'reading_count', 'last_reading_date'
    ]
    list_filter = ['meter_type', 'is_active', 'production_site__region', 'production_site']
    search_fields = ['meter_number', 'production_site__name', 'water_source__name']
    readonly_fields = ['legacy_workflow_notice', 'created_at', 'updated_at']
    inlines = [MeterReadingInline]
    fieldsets = (
        (
            'Legacy Production Meter',
            {
                'fields': (
                    'legacy_workflow_notice',
                    'production_site', 'water_source', 'meter_type', 'meter_number',
                    'manufacturer', 'model', 'capacity', 'is_active',
                    'installation_date', 'last_calibration_date', 'next_calibration_date',
                    'initial_reading', 'notes', 'created_at', 'updated_at'
                )
            },
        ),
    )

    def reading_count(self, obj):
        return obj.readings.count()
    reading_count.short_description = 'Readings'

    def last_reading_date(self, obj):
        last = obj.readings.first()
        return last.reading_date if last else '-'
    last_reading_date.short_description = 'Last Reading'

    def legacy_workflow_notice(self, obj):
        return mark_safe(
            'Legacy compatibility record. For new setup, map shared water/energy meters on the Production Site admin page.'
        )
    legacy_workflow_notice.short_description = 'Workflow'


# -------------------------
# Meter Reading
# -------------------------
@admin.register(MeterReading)
class MeterReadingAdmin(admin.ModelAdmin):
    list_display = [
        'meter', 'reading_date', 'reading_time',
        'current_reading', 'consumption',
        'reading_method', 'validation_status', 'anomaly_flag'
    ]
    list_filter = [
        'reading_date', 'is_validated', 'is_anomaly',
        'reading_method', 'meter__production_site', 'meter__meter_type'
    ]
    search_fields = ['meter__meter_number', 'meter__production_site__name']
    readonly_fields = ['consumption', 'created_at', 'updated_at']
    date_hierarchy = 'reading_date'

    actions = ['validate_readings', 'flag_as_anomaly', 'unflag_anomaly']

    def validation_status(self, obj):
        if obj.is_validated:
            return format_html('<span style="color: {};">{}</span>', 'green', '✓ Validated')
        return format_html('<span style="color: {};">{}</span>', 'orange', 'Pending')
    validation_status.short_description = 'Status'

    def anomaly_flag(self, obj):
        if obj.is_anomaly:
            return format_html('<span style="color: {};">{}</span>', 'red', '⚠ Anomaly')
        return '-'
    anomaly_flag.short_description = 'Anomaly'

    def validate_readings(self, request, queryset):
        from django.utils import timezone
        timestamp = timezone.now()
        affected = []
        updated = 0
        for reading in queryset.select_related('meter__production_site'):
            reading.is_validated = True
            reading.validated_by = request.user.username
            reading.validated_at = timestamp
            reading.save(update_fields=['is_validated', 'validated_by', 'validated_at', 'updated_at'])
            if reading.meter_id:
                affected.append((reading.meter.production_site_id, reading.reading_date))
            updated += 1

        refresh_production_for_site_dates(affected)
        self.message_user(request, f'{updated} readings validated successfully.')

    def flag_as_anomaly(self, request, queryset):
        updated = queryset.update(is_anomaly=True)
        self.message_user(request, f'{updated} readings flagged as anomalies.')

    def unflag_anomaly(self, request, queryset):
        updated = queryset.update(is_anomaly=False)
        self.message_user(request, f'{updated} readings unflagged.')


# -------------------------
# Production Target
# -------------------------
@admin.register(ProductionTarget)
class ProductionTargetAdmin(admin.ModelAdmin):
    list_display = [
        'production_site', 'year', 'month',
        'water_abstraction_target_m3', 'total_power_target',
        'power_efficiency_target_kwh_per_m3'
    ]
    list_filter = ['year', 'month', 'production_site__region', 'production_site']
    search_fields = ['production_site__name', 'production_site__code']
    readonly_fields = ['created_at', 'updated_at']

    def total_power_target(self, obj):
        return f"{obj.total_power_target_kwh:,.2f} kWh"
    total_power_target.short_description = 'Total Power Target'


# -------------------------
# Daily Production
# -------------------------
@admin.register(DailyProduction)
class DailyProductionAdmin(admin.ModelAdmin):
    list_display = [
        'production_site', 'production_date', 'water_abstracted_m3',
        'water_supplied_m3', 'water_received_m3',
        'total_power_kwh', 'power_efficiency_kwh_per_m3',
        'validation_status'
    ]
    list_filter = [
        'production_date', 'is_validated', 'is_complete',
        'production_site__region', 'production_site'
    ]
    search_fields = ['production_site__name', 'production_site__code']
    readonly_fields = [
        'water_supplied_m3', 'water_received_m3', 'water_available_for_sale_m3', 'total_power_kwh',
        'power_efficiency_kwh_per_m3', 'solar_percentage',
        'production_loss_percentage', 'created_at', 'updated_at'
    ]
    date_hierarchy = 'production_date'

    def validation_status(self, obj):
        if obj.is_validated:
            return format_html('<span style="color: {};">{}</span>', 'green', '✓ Validated')
        if obj.is_complete:
            return format_html('<span style="color: {};">{}</span>', 'blue', 'Complete')
        return format_html('<span style="color: {};">{}</span>', 'orange', 'Incomplete')
    validation_status.short_description = 'Status'


# -------------------------
# Monthly Production
# -------------------------
@admin.register(MonthlyProduction)
class MonthlyProductionAdmin(admin.ModelAdmin):
    list_display = [
        'production_site', 'year', 'month', 'water_abstracted_m3',
        'water_supplied_m3', 'water_received_m3',
        'total_power_kwh', 'total_direct_costs',
        'realization_percent', 'finalization_status'
    ]
    list_filter = ['year', 'month', 'is_finalized', 'production_site__region']
    search_fields = ['production_site__name', 'production_site__code']
    readonly_fields = [
        'water_supplied_m3', 'water_received_m3', 'water_available_for_sale_m3', 'total_power_kwh',
        'power_efficiency_kwh_per_m3', 'solar_percentage',
        'production_loss_percentage', 'total_direct_costs',
        'power_cost_per_m3', 'power_cost_per_kwh',
        'total_cost_per_m3', 'water_abstraction_realization_percent',
        'created_at', 'updated_at'
    ]

    def realization_percent(self, obj):
        if obj.water_abstraction_realization_percent is not None:
            value = obj.water_abstraction_realization_percent
            color = 'green' if value >= 100 else 'orange' if value >= 80 else 'red'
            return format_html('<span style="color: {};">{:.1f}%</span>', color, value)
        return '-'
    realization_percent.short_description = 'Realization %'

    def finalization_status(self, obj):
        if obj.is_finalized:
            return format_html('<span style="color: {};">{}</span>', 'green', '✓ Finalized')
        return format_html('<span style="color: {};">{}</span>', 'orange', 'Draft')
    finalization_status.short_description = 'Status'


# -------------------------
# Water Quality Test
# -------------------------
@admin.register(WaterQualityTest)
class WaterQualityTestAdmin(admin.ModelAdmin):
    list_display = [
        'production_site', 'test_date', 'test_type',
        'test_location', 'parameter_tested',
        'test_result', 'compliance_status'
    ]
    list_filter = [
        'test_date', 'test_type', 'test_location',
        'is_compliant', 'production_site__region'
    ]
    search_fields = ['production_site__name', 'parameter_tested']
    readonly_fields = ['created_at', 'updated_at']
    date_hierarchy = 'test_date'

    def compliance_status(self, obj):
        if obj.is_compliant:
            return format_html('<span style="color: {};">{}</span>', 'green', '✓ Compliant')
        return format_html('<span style="color: {};">{}</span>', 'red', '✗ Non-Compliant')
    compliance_status.short_description = 'Compliance'
