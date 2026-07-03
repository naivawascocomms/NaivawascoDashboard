from django.contrib import admin

from .models import (
    ProductionZoneAllocationRule,
    WaterBalanceDashboardSettings,
    WaterBalanceModel,
    WaterBalanceNode,
    WaterBalanceNodeInput,
    WaterBalanceRule,
)


@admin.register(WaterBalanceDashboardSettings)
class WaterBalanceDashboardSettingsAdmin(admin.ModelAdmin):
    list_display = [
        'name',
        'historical_import_end_date',
        'balance_testing_start_date',
        'live_balance_start_date',
        'is_active',
    ]
    list_filter = ['is_active']
    search_fields = ['name', 'notes']


@admin.register(ProductionZoneAllocationRule)
class ProductionZoneAllocationRuleAdmin(admin.ModelAdmin):
    list_display = [
        'production_site',
        'zone',
        'rule_type',
        'method',
        'basis_value',
        'effective_start_date',
        'effective_end_date',
        'reason',
        'is_active',
    ]
    list_filter = [
        'rule_type',
        'method',
        'is_active',
        'production_site__region',
        'zone__region',
    ]
    search_fields = [
        'production_site__name',
        'production_site__code',
        'zone__name',
        'zone__code',
        'reason',
        'notes',
    ]
    autocomplete_fields = ['production_site', 'zone']
    ordering = [
        'zone__region__dashboard_order',
        'zone__dashboard_order',
        'zone__name',
        'rule_type',
        'priority',
        'production_site__name',
    ]


@admin.register(WaterBalanceNode)
class WaterBalanceNodeAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'node_type', 'production_site', 'is_active']
    list_filter = ['node_type', 'is_active']
    search_fields = ['name', 'code', 'production_site__name', 'production_site__code', 'notes']
    autocomplete_fields = ['production_site']


class WaterBalanceRuleInline(admin.TabularInline):
    model = WaterBalanceRule
    extra = 0
    autocomplete_fields = ['production_site', 'water_meter', 'mixing_node']
    fields = [
        'production_site',
        'route_name',
        'method',
        'basis_value',
        'water_meter',
        'mixing_node',
        'manual_volume_m3',
        'confidence',
        'priority',
        'is_active',
    ]


@admin.register(WaterBalanceModel)
class WaterBalanceModelAdmin(admin.ModelAdmin):
    list_display = ['name', 'zone', 'effective_start_date', 'effective_end_date', 'is_active']
    list_filter = ['is_active', 'zone__region']
    search_fields = ['name', 'zone__name', 'zone__code', 'notes']
    autocomplete_fields = ['zone']
    inlines = [WaterBalanceRuleInline]


@admin.register(WaterBalanceRule)
class WaterBalanceRuleAdmin(admin.ModelAdmin):
    list_display = [
        'balance_model',
        'production_site',
        'route_name',
        'method',
        'basis_value',
        'mixing_node',
        'confidence',
        'is_active',
    ]
    list_filter = ['method', 'confidence', 'is_active', 'balance_model__zone__region']
    search_fields = [
        'balance_model__name',
        'balance_model__zone__name',
        'balance_model__zone__code',
        'production_site__name',
        'production_site__code',
        'route_name',
        'notes',
    ]
    autocomplete_fields = ['balance_model', 'production_site', 'water_meter', 'mixing_node']


@admin.register(WaterBalanceNodeInput)
class WaterBalanceNodeInputAdmin(admin.ModelAdmin):
    list_display = ['node', 'production_site', 'input_method', 'water_meter', 'confidence', 'is_active']
    list_filter = ['input_method', 'confidence', 'is_active']
    search_fields = [
        'node__name',
        'node__code',
        'production_site__name',
        'production_site__code',
        'water_meter__display_name',
        'water_meter__meter_number',
        'notes',
    ]
    autocomplete_fields = ['node', 'production_site', 'water_meter']
