from django.contrib import admin

from .models import FinanceMetric, FinanceMonthlyValue, FinanceReport, FinanceSection


class FinanceSectionInline(admin.TabularInline):
    model = FinanceSection
    extra = 0


class FinanceMetricInline(admin.TabularInline):
    model = FinanceMetric
    extra = 0
    fields = ['code', 'label', 'unit', 'metric_kind', 'scope_type', 'scope_name', 'display_order']


@admin.register(FinanceReport)
class FinanceReportAdmin(admin.ModelAdmin):
    list_display = ['name', 'fiscal_year_label', 'current_snapshot_date', 'current_fiscal_month_index', 'is_active']
    list_filter = ['is_active', 'fiscal_year_start']
    search_fields = ['name', 'source_workbook']
    inlines = [FinanceSectionInline, FinanceMetricInline]


@admin.register(FinanceSection)
class FinanceSectionAdmin(admin.ModelAdmin):
    list_display = ['title', 'report', 'display_order']
    list_filter = ['report']
    search_fields = ['title']


@admin.register(FinanceMetric)
class FinanceMetricAdmin(admin.ModelAdmin):
    list_display = ['code', 'label', 'report', 'section', 'unit', 'metric_kind', 'scope_type', 'scope_name', 'display_order']
    list_filter = ['report', 'section', 'metric_kind', 'scope_type']
    search_fields = ['code', 'label', 'scope_name']


@admin.register(FinanceMonthlyValue)
class FinanceMonthlyValueAdmin(admin.ModelAdmin):
    list_display = ['metric', 'year', 'month', 'target_value_numeric', 'actual_value_numeric', 'actual_value_text']
    list_filter = ['year', 'month', 'metric__report']
    search_fields = ['metric__label', 'actual_value_text', 'target_value_text']
