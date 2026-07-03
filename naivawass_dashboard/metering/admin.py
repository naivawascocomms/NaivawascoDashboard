from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone

from .models import (
    DistributionWaterMeterAssignment,
    EnergyMeter,
    EnergyMeterReading,
    MeterReadingAssignment,
    ProductionEnergyMeterAssignment,
    ProductionWaterMeterAssignment,
    UserProfile,
    WaterMeter,
    WaterMeterReading,
)


class WaterMeterReadingInline(admin.TabularInline):
    model = WaterMeterReading
    extra = 0
    fields = ['reading_date', 'current_reading', 'consumption', 'is_validated', 'is_anomaly']
    readonly_fields = ['consumption']
    ordering = ['-reading_date']


class EnergyMeterReadingInline(admin.TabularInline):
    model = EnergyMeterReading
    extra = 0
    fields = ['reading_date', 'current_reading', 'consumption', 'is_validated', 'is_anomaly']
    readonly_fields = ['consumption']
    ordering = ['-reading_date']


class ProductionWaterMeterAssignmentInline(admin.TabularInline):
    model = ProductionWaterMeterAssignment
    extra = 0
    autocomplete_fields = ['production_site', 'water_source']
    fields = ['production_site', 'water_source', 'assignment_role', 'is_active', 'start_date', 'end_date']


class ProductionEnergyMeterAssignmentInline(admin.TabularInline):
    model = ProductionEnergyMeterAssignment
    extra = 0
    autocomplete_fields = ['production_site']
    fields = ['production_site', 'assignment_role', 'is_active', 'start_date', 'end_date']


class DistributionWaterMeterAssignmentInline(admin.TabularInline):
    model = DistributionWaterMeterAssignment
    extra = 0
    autocomplete_fields = ['zone', 'dma']
    fields = ['zone', 'dma', 'assignment_role', 'allocation_percentage', 'is_active', 'start_date', 'end_date']


@admin.register(WaterMeter)
class WaterMeterAdmin(admin.ModelAdmin):
    list_display = [
        'display_name',
        'meter_number',
        'diameter_mm',
        'operational_status',
        'is_active',
        'last_reading_date',
        'production_assignment_count',
        'distribution_assignment_count',
    ]
    list_filter = ['operational_status', 'is_active']
    search_fields = ['display_name', 'meter_number', 'manufacturer', 'model', 'operational_status_notes', 'notes']
    readonly_fields = ['last_reading_date', 'last_reading_value', 'created_at', 'updated_at']
    inlines = [ProductionWaterMeterAssignmentInline, DistributionWaterMeterAssignmentInline, WaterMeterReadingInline]

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related('readings', 'production_assignments', 'distribution_assignments')

    def last_reading_date(self, obj):
        reading = obj.readings.order_by('-reading_date', '-reading_time').first()
        return reading.reading_date if reading else '-'
    last_reading_date.short_description = 'Last Reading Date'

    def last_reading_value(self, obj):
        reading = obj.readings.order_by('-reading_date', '-reading_time').first()
        return reading.current_reading if reading else '-'
    last_reading_value.short_description = 'Last Reading Value'

    def production_assignment_count(self, obj):
        return obj.production_assignments.count()
    production_assignment_count.short_description = 'Production Uses'

    def distribution_assignment_count(self, obj):
        return obj.distribution_assignments.count()
    distribution_assignment_count.short_description = 'Distribution Uses'


@admin.register(EnergyMeter)
class EnergyMeterAdmin(admin.ModelAdmin):
    list_display = [
        'display_name',
        'meter_number',
        'energy_kind',
        'is_active',
        'last_reading_date',
        'production_assignment_count',
    ]
    list_filter = ['energy_kind', 'is_active']
    search_fields = ['display_name', 'meter_number', 'manufacturer', 'model']
    readonly_fields = ['last_reading_date', 'last_reading_value', 'created_at', 'updated_at']
    inlines = [ProductionEnergyMeterAssignmentInline, EnergyMeterReadingInline]

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related('readings', 'production_assignments')

    def last_reading_date(self, obj):
        reading = obj.readings.order_by('-reading_date', '-reading_time').first()
        return reading.reading_date if reading else '-'
    last_reading_date.short_description = 'Last Reading Date'

    def last_reading_value(self, obj):
        reading = obj.readings.order_by('-reading_date', '-reading_time').first()
        return reading.current_reading if reading else '-'
    last_reading_value.short_description = 'Last Reading Value'

    def production_assignment_count(self, obj):
        return obj.production_assignments.count()
    production_assignment_count.short_description = 'Production Uses'


@admin.register(WaterMeterReading)
class WaterMeterReadingAdmin(admin.ModelAdmin):
    list_display = [
        'water_meter',
        'reading_date',
        'current_reading',
        'consumption',
        'validation_status',
        'anomaly_status',
    ]
    list_filter = ['reading_date', 'is_validated', 'is_anomaly', 'reading_method']
    search_fields = ['water_meter__display_name', 'water_meter__meter_number', 'read_by']
    autocomplete_fields = ['water_meter']
    readonly_fields = ['previous_reading', 'consumption', 'created_at', 'updated_at']
    date_hierarchy = 'reading_date'
    actions = ['validate_readings', 'flag_as_anomaly', 'unflag_anomaly']

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('water_meter')

    def validation_status(self, obj):
        color = 'green' if obj.is_validated else 'orange'
        label = 'Validated' if obj.is_validated else 'Pending'
        return format_html('<span style="color: {};">{}</span>', color, label)
    validation_status.short_description = 'Status'

    def anomaly_status(self, obj):
        if obj.is_anomaly:
            return format_html('<span style="color: red;">Anomaly</span>')
        return '-'
    anomaly_status.short_description = 'Anomaly'

    def validate_readings(self, request, queryset):
        timestamp = timezone.now()
        updated = 0
        for reading in queryset.select_related('water_meter'):
            reading.is_validated = True
            reading.validated_by = request.user.username
            reading.validated_at = timestamp
            reading.save(update_fields=['is_validated', 'validated_by', 'validated_at', 'updated_at'])
            updated += 1
        self.message_user(request, f'{updated} water meter readings validated successfully.')

    def flag_as_anomaly(self, request, queryset):
        updated = queryset.update(is_anomaly=True)
        self.message_user(request, f'{updated} water meter readings flagged as anomalies.')

    def unflag_anomaly(self, request, queryset):
        updated = queryset.update(is_anomaly=False)
        self.message_user(request, f'{updated} water meter readings unflagged.')


@admin.register(EnergyMeterReading)
class EnergyMeterReadingAdmin(admin.ModelAdmin):
    list_display = [
        'energy_meter',
        'reading_date',
        'current_reading',
        'consumption',
        'validation_status',
        'anomaly_status',
    ]
    list_filter = ['energy_meter__energy_kind', 'reading_date', 'is_validated', 'is_anomaly', 'reading_method']
    search_fields = ['energy_meter__display_name', 'energy_meter__meter_number', 'read_by']
    autocomplete_fields = ['energy_meter']
    readonly_fields = ['previous_reading', 'consumption', 'created_at', 'updated_at']
    date_hierarchy = 'reading_date'
    actions = ['validate_readings', 'flag_as_anomaly', 'unflag_anomaly']

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('energy_meter')

    def validation_status(self, obj):
        color = 'green' if obj.is_validated else 'orange'
        label = 'Validated' if obj.is_validated else 'Pending'
        return format_html('<span style="color: {};">{}</span>', color, label)
    validation_status.short_description = 'Status'

    def anomaly_status(self, obj):
        if obj.is_anomaly:
            return format_html('<span style="color: red;">Anomaly</span>')
        return '-'
    anomaly_status.short_description = 'Anomaly'

    def validate_readings(self, request, queryset):
        timestamp = timezone.now()
        updated = 0
        for reading in queryset.select_related('energy_meter'):
            reading.is_validated = True
            reading.validated_by = request.user.username
            reading.validated_at = timestamp
            reading.save(update_fields=['is_validated', 'validated_by', 'validated_at', 'updated_at'])
            updated += 1
        self.message_user(request, f'{updated} energy meter readings validated successfully.')

    def flag_as_anomaly(self, request, queryset):
        updated = queryset.update(is_anomaly=True)
        self.message_user(request, f'{updated} energy meter readings flagged as anomalies.')

    def unflag_anomaly(self, request, queryset):
        updated = queryset.update(is_anomaly=False)
        self.message_user(request, f'{updated} energy meter readings unflagged.')


@admin.register(ProductionWaterMeterAssignment)
class ProductionWaterMeterAssignmentAdmin(admin.ModelAdmin):
    list_display = [
        'production_site',
        'assignment_role',
        'water_meter',
        'water_source',
        'is_active',
        'start_date',
        'end_date',
    ]
    list_filter = ['assignment_role', 'production_site__region', 'is_active']
    search_fields = ['production_site__name', 'water_meter__display_name', 'water_meter__meter_number', 'water_source__name']
    autocomplete_fields = ['water_meter', 'production_site', 'water_source']


@admin.register(ProductionEnergyMeterAssignment)
class ProductionEnergyMeterAssignmentAdmin(admin.ModelAdmin):
    list_display = ['production_site', 'assignment_role', 'energy_meter', 'is_active', 'start_date', 'end_date']
    list_filter = ['assignment_role', 'production_site__region', 'is_active']
    search_fields = ['production_site__name', 'energy_meter__display_name', 'energy_meter__meter_number']
    autocomplete_fields = ['energy_meter', 'production_site']


@admin.register(DistributionWaterMeterAssignment)
class DistributionWaterMeterAssignmentAdmin(admin.ModelAdmin):
    list_display = [
        'water_meter',
        'assignment_role',
        'zone',
        'dma',
        'allocation_percentage',
        'is_active',
        'start_date',
        'end_date',
    ]
    list_filter = ['assignment_role', 'zone__region', 'is_active']
    search_fields = ['water_meter__display_name', 'water_meter__meter_number', 'zone__name', 'dma__name']
    autocomplete_fields = ['water_meter', 'zone', 'dma']


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'role', 'phone_number', 'created_at']
    list_filter = ['role', 'user__is_active']
    search_fields = ['user__username', 'user__first_name', 'user__last_name', 'phone_number']
    autocomplete_fields = ['user']


@admin.register(MeterReadingAssignment)
class MeterReadingAssignmentAdmin(admin.ModelAdmin):
    list_display = [
        'assignee',
        'assigned_by',
        'approval_delegate',
        'scope_type',
        'production_site',
        'zone',
        'water_meter',
        'energy_meter',
        'is_active',
        'start_date',
        'end_date',
    ]
    list_filter = ['scope_type', 'is_active', 'production_site__region', 'zone__region']
    search_fields = [
        'assignee__username',
        'assigned_by__username',
        'approval_delegate__username',
        'production_site__name',
        'zone__name',
        'water_meter__meter_number',
        'energy_meter__meter_number',
    ]
    autocomplete_fields = ['assignee', 'assigned_by', 'approval_delegate', 'production_site', 'zone', 'water_meter', 'energy_meter']
