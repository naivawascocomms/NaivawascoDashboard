from decimal import Decimal

from rest_framework import serializers

from .models import FinanceMetric, FinanceMonthlyValue, FinanceReport, FinanceSection


class FinanceReportSerializer(serializers.ModelSerializer):
    section_count = serializers.IntegerField(source='sections.count', read_only=True)
    metric_count = serializers.IntegerField(source='metrics.count', read_only=True)

    class Meta:
        model = FinanceReport
        fields = [
            'id',
            'name',
            'fiscal_year_start',
            'fiscal_year_label',
            'current_snapshot_date',
            'current_fiscal_month_index',
            'source_workbook',
            'notes',
            'is_active',
            'section_count',
            'metric_count',
        ]


class FinanceSectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = FinanceSection
        fields = ['id', 'report', 'title', 'display_order']


class FinanceMonthlyValueSerializer(serializers.ModelSerializer):
    class Meta:
        model = FinanceMonthlyValue
        fields = '__all__'


class FinanceMetricSerializer(serializers.ModelSerializer):
    section_title = serializers.CharField(source='section.title', read_only=True, allow_null=True)
    monthly_values = FinanceMonthlyValueSerializer(many=True, read_only=True)

    class Meta:
        model = FinanceMetric
        fields = [
            'id',
            'report',
            'section',
            'section_title',
            'code',
            'label',
            'unit',
            'metric_kind',
            'scope_type',
            'scope_name',
            'cumulative_behavior',
            'display_order',
            'workbook_sheet',
            'workbook_row',
            'is_total',
            'is_summary',
            'notes',
            'monthly_values',
        ]


def decimal_or_none(value):
    if value is None:
        return None
    return Decimal(value)
