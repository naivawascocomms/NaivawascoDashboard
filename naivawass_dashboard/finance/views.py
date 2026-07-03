from decimal import Decimal

from django.db.models import Prefetch
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import FinanceMetric, FinanceMonthlyValue, FinanceReport, FinanceSection
from .serializers import (
    FinanceMetricSerializer,
    FinanceMonthlyValueSerializer,
    FinanceReportSerializer,
    FinanceSectionSerializer,
)


MONTH_ORDER = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]
MONTH_LABELS = {
    1: 'Jan',
    2: 'Feb',
    3: 'Mar',
    4: 'Apr',
    5: 'May',
    6: 'Jun',
    7: 'Jul',
    8: 'Aug',
    9: 'Sep',
    10: 'Oct',
    11: 'Nov',
    12: 'Dec',
}


def fiscal_year_months(fy_year):
    return [(fy_year if month >= 7 else fy_year + 1, month) for month in MONTH_ORDER]


def as_number(value):
    if value in [None, '']:
        return None
    return float(value)


def value_payload(numeric, text=''):
    return {
        'raw': text if text else (str(numeric) if numeric is not None else None),
        'numeric': as_number(numeric),
    }


def percent(actual, target):
    if actual in [None, ''] or target in [None, '', Decimal('0'), 0]:
        return None
    try:
        return float((actual / target) * Decimal('100'))
    except Exception:
        return None


def value_for_period(metric, fy_year, selected_month):
    values = list(metric.monthly_values.all())
    selected_year = fy_year if selected_month >= 7 else fy_year + 1
    current = next((value for value in values if value.year == selected_year and value.month == selected_month), None)
    months_to_date = []
    for year, month in fiscal_year_months(fy_year):
        if (year, month) > (selected_year, selected_month):
            break
        item = next((value for value in values if value.year == year and value.month == month), None)
        if item:
            months_to_date.append(item)

    monthly_target = current.target_value_numeric if current else None
    monthly_actual = current.actual_value_numeric if current else None
    monthly_target_text = current.target_value_text if current else ''
    monthly_actual_text = current.actual_value_text if current else ''

    if metric.cumulative_behavior == 'LAST_VALUE':
        cumulative_target = next((item.target_value_numeric for item in reversed(months_to_date) if item.target_value_numeric is not None), None)
        cumulative_actual = next((item.actual_value_numeric for item in reversed(months_to_date) if item.actual_value_numeric is not None), None)
        cumulative_target_text = next((item.target_value_text for item in reversed(months_to_date) if item.target_value_text), '')
        cumulative_actual_text = next((item.actual_value_text for item in reversed(months_to_date) if item.actual_value_text), '')
    elif metric.cumulative_behavior == 'AVERAGE':
        target_items = [item.target_value_numeric for item in months_to_date if item.target_value_numeric is not None]
        actual_items = [item.actual_value_numeric for item in months_to_date if item.actual_value_numeric is not None]
        cumulative_target = sum(target_items) / len(target_items) if target_items else None
        cumulative_actual = sum(actual_items) / len(actual_items) if actual_items else None
        cumulative_target_text = ''
        cumulative_actual_text = ''
    else:
        cumulative_target = sum((item.target_value_numeric or Decimal('0')) for item in months_to_date)
        cumulative_actual = sum((item.actual_value_numeric or Decimal('0')) for item in months_to_date)
        cumulative_target_text = ''
        cumulative_actual_text = ''

    return {
        'monthly_target': value_payload(monthly_target, monthly_target_text),
        'monthly_actual': value_payload(monthly_actual, monthly_actual_text),
        'monthly_realization_percent': percent(monthly_actual, monthly_target),
        'cumulative_target': value_payload(cumulative_target, cumulative_target_text),
        'cumulative_actual': value_payload(cumulative_actual, cumulative_actual_text),
        'cumulative_realization_percent': percent(cumulative_actual, cumulative_target),
    }


def find_row(rows, *needles):
    normalized = [needle.lower() for needle in needles]
    for row in rows:
        label = row['label'].lower()
        if all(needle in label for needle in normalized):
            return row
    return None


def row_number(row, field):
    if not row:
        return 0
    value = row.get(field)
    if isinstance(value, dict):
        value = value.get('numeric')
    return value or 0


class FinanceReportViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FinanceReport.objects.all()
    serializer_class = FinanceReportSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'fiscal_year_start']
    search_fields = ['name', 'source_workbook']
    ordering = ['-fiscal_year_start', 'name']

    @action(detail=True, methods=['get'])
    def dashboard(self, request, pk=None):
        report = self.get_object()
        fy_year = int(request.query_params.get('fy_year') or report.fiscal_year_start)
        if request.query_params.get('month'):
            selected_month = int(request.query_params['month'])
        else:
            fiscal_index = max(1, min(12, report.current_fiscal_month_index or 9))
            selected_month = MONTH_ORDER[fiscal_index - 1]

        metrics = (
            report.metrics
            .select_related('section')
            .prefetch_related(
                Prefetch(
                    'monthly_values',
                    queryset=FinanceMonthlyValue.objects.filter(
                        year__in=[fy_year, fy_year + 1],
                    ),
                )
            )
            .order_by('display_order', 'id')
        )

        rows = []
        sections = []
        section_map = {}
        for metric in metrics:
            values = value_for_period(metric, fy_year, selected_month)
            row = {
                'id': metric.id,
                'code': metric.code,
                'label': metric.label,
                'unit': metric.unit,
                'metric_kind': metric.metric_kind,
                'scope_type': metric.scope_type,
                'scope_name': metric.scope_name,
                'is_total': metric.is_total,
                'is_summary': metric.is_summary,
                **values,
            }
            rows.append(row)
            section = metric.section
            if section and section.id not in section_map:
                section_map[section.id] = {
                    'id': section.id,
                    'title': section.title,
                    'display_order': section.display_order,
                    'rows': [],
                }
                sections.append(section_map[section.id])
            if section:
                section_map[section.id]['rows'].append(row)

        water_sales = find_row(rows, 'total water sales')
        sewer_sales = find_row(rows, 'total sewerage sales')
        total_billed = find_row(rows, 'total billed')
        total_collection = find_row(rows, 'total collection for the month')
        collection_efficiency = find_row(rows, 'collection efficiency - in %')
        disconnected_water = find_row(rows, 'disconnected-water')
        disconnected_sewer = find_row(rows, 'disconnected-sewer')
        receivables = find_row(rows, 'amount receivables')
        adjustments = find_row(rows, 'adjustment')

        billing = {
            'waterSales': {
                'monthly': row_number(water_sales, 'monthly_actual'),
                'cumulative': row_number(water_sales, 'cumulative_actual'),
                'target': row_number(water_sales, 'cumulative_target'),
                'percentRealized': row_number(water_sales, 'cumulative_realization_percent'),
            },
            'sewerageSales': {
                'monthly': row_number(sewer_sales, 'monthly_actual'),
                'cumulative': row_number(sewer_sales, 'cumulative_actual'),
                'target': row_number(sewer_sales, 'cumulative_target'),
                'percentRealized': row_number(sewer_sales, 'cumulative_realization_percent'),
            },
            'totalBilled': {
                'monthly': row_number(total_billed, 'monthly_actual'),
                'cumulative': row_number(total_billed, 'cumulative_actual'),
                'target': row_number(total_billed, 'cumulative_target'),
                'percentRealized': row_number(total_billed, 'cumulative_realization_percent'),
            },
        }

        for key, label in [
            ('bulkWater', 'bulk water'),
            ('sanitation', 'sanitation'),
            ('newConnectionsWater', 'new connection fee water'),
            ('newConnectionsSewer', 'new connection fee sewer'),
            ('reconnections', 'reconnection fee'),
            ('prepaidKiosk', 'prepaid kiosk'),
            ('miscIncome', 'misc income'),
            ('penalties', 'penalties'),
            ('companyExhauster', 'company exhauster'),
            ('customerExhauster', 'customer exhauster'),
        ]:
            row = find_row(rows, label)
            billing[key] = {
                'monthly': row_number(row, 'monthly_actual'),
                'cumulative': row_number(row, 'cumulative_actual'),
            }

        collections = {
            'totalCollection': {
                'monthly': row_number(total_collection, 'monthly_actual'),
                'cumulative': row_number(total_collection, 'cumulative_actual'),
                'target': row_number(total_collection, 'cumulative_target'),
                'percentRealized': row_number(total_collection, 'cumulative_realization_percent'),
            },
            'collectionEfficiency': {
                'monthly': row_number(collection_efficiency, 'monthly_actual') * 100,
                'cumulative': row_number(collection_efficiency, 'cumulative_actual') * 100,
                'target': row_number(collection_efficiency, 'monthly_target') * 100,
            },
            'disconnectedWater': {
                'monthly': row_number(disconnected_water, 'monthly_actual'),
                'cumulative': row_number(disconnected_water, 'cumulative_actual'),
            },
            'disconnectedSewer': {
                'monthly': row_number(disconnected_sewer, 'monthly_actual'),
                'cumulative': row_number(disconnected_sewer, 'cumulative_actual'),
            },
        }

        regional = []
        for region in ['Central', 'Southern', 'Eastern']:
            billed_water = find_row(rows, f'amount billed water-{region.lower()}')
            billed_sewer = find_row(rows, f'amount billed sewer-{region.lower()}')
            other_sales = next((row for row in rows if row['scope_name'].lower() == region.lower() and 'othersales' == row['label'].lower()), None)
            total_region = next((row for row in rows if row['scope_name'].lower() == region.lower() and 'amount billed water & sewer' in row['label'].lower()), None)
            collected = find_row(rows, f'amount collected-{region.lower()}')
            efficiency = find_row(rows, f'collection efficiency-{region.lower()}')
            regional.append({
                'region': region,
                'billedWater': {'monthly': row_number(billed_water, 'monthly_actual'), 'cumulative': row_number(billed_water, 'cumulative_actual')},
                'billedSewer': {'monthly': row_number(billed_sewer, 'monthly_actual'), 'cumulative': row_number(billed_sewer, 'cumulative_actual')},
                'otherSales': {'monthly': row_number(other_sales, 'monthly_actual'), 'cumulative': row_number(other_sales, 'cumulative_actual')},
                'totalBilled': {'monthly': row_number(total_region, 'monthly_actual'), 'cumulative': row_number(total_region, 'cumulative_actual')},
                'collected': {'monthly': row_number(collected, 'monthly_actual'), 'cumulative': row_number(collected, 'cumulative_actual')},
                'collectionEfficiency': {
                    'monthly': row_number(efficiency, 'monthly_actual') * 100,
                    'cumulative': row_number(efficiency, 'cumulative_actual') * 100,
                },
            })

        monthly_values = {
            (value.year, value.month, value.metric_id): value
            for value in FinanceMonthlyValue.objects.filter(
                metric__in=[metric.id for metric in metrics],
                year__in=[fy_year, fy_year + 1],
            )
        }
        trend = []
        total_billed_metric = total_billed['id'] if total_billed else None
        collection_metric = total_collection['id'] if total_collection else None
        efficiency_metric = collection_efficiency['id'] if collection_efficiency else None
        for year, month in fiscal_year_months(fy_year):
            billed_value = monthly_values.get((year, month, total_billed_metric)) if total_billed_metric else None
            collection_value = monthly_values.get((year, month, collection_metric)) if collection_metric else None
            efficiency_value = monthly_values.get((year, month, efficiency_metric)) if efficiency_metric else None
            trend.append({
                'month': MONTH_LABELS[month],
                'billed': as_number(billed_value.actual_value_numeric if billed_value else None) or 0,
                'collected': as_number(collection_value.actual_value_numeric if collection_value else None) or 0,
                'collectionEfficiency': (as_number(efficiency_value.actual_value_numeric if efficiency_value else None) or 0) * 100,
                'target': (as_number(efficiency_value.target_value_numeric if efficiency_value else None) or 0) * 100,
            })

        summary = {
            'currentYear': {
                'totalBilled': billing['totalBilled']['cumulative'],
                'totalCollected': collections['totalCollection']['cumulative'],
                'collectionEfficiency': collections['collectionEfficiency']['cumulative'],
            },
            'receivables': row_number(receivables, 'monthly_actual'),
            'adjustments': row_number(adjustments, 'monthly_actual'),
        }

        finance_kpis = [
            {
                'label': 'Total Billed',
                'value': billing['totalBilled']['monthly'],
                'unit': 'KES',
                'target': row_number(total_billed, 'monthly_target'),
                'percentRealized': row_number(total_billed, 'monthly_realization_percent'),
            },
            {
                'label': 'Total Collection',
                'value': collections['totalCollection']['monthly'],
                'unit': 'KES',
                'target': row_number(total_collection, 'monthly_target'),
                'percentRealized': row_number(total_collection, 'monthly_realization_percent'),
            },
            {
                'label': 'Collection Efficiency',
                'value': collections['collectionEfficiency']['monthly'],
                'unit': '%',
                'target': collections['collectionEfficiency']['target'],
                'percentRealized': row_number(collection_efficiency, 'monthly_realization_percent'),
            },
            {
                'label': 'Water Sales',
                'value': billing['waterSales']['monthly'],
                'unit': 'KES',
                'target': row_number(water_sales, 'monthly_target'),
                'percentRealized': row_number(water_sales, 'monthly_realization_percent'),
            },
        ]

        cumulative_kpis = [
            {
                'label': 'Cumulative Billed',
                'value': billing['totalBilled']['cumulative'],
                'unit': 'KES',
                'target': billing['totalBilled']['target'],
                'percentRealized': billing['totalBilled']['percentRealized'],
            },
            {
                'label': 'Cumulative Collection',
                'value': collections['totalCollection']['cumulative'],
                'unit': 'KES',
                'target': collections['totalCollection']['target'],
                'percentRealized': collections['totalCollection']['percentRealized'],
            },
            {
                'label': 'YTD Collection Efficiency',
                'value': collections['collectionEfficiency']['cumulative'],
                'unit': '%',
                'target': collections['collectionEfficiency']['target'],
                'percentRealized': row_number(collection_efficiency, 'cumulative_realization_percent'),
            },
            {
                'label': 'Cumulative Water Sales',
                'value': billing['waterSales']['cumulative'],
                'unit': 'KES',
                'target': billing['waterSales']['target'],
                'percentRealized': billing['waterSales']['percentRealized'],
            },
        ]

        return Response({
            'report': FinanceReportSerializer(report).data,
            'selected_month': selected_month,
            'selected_year': fy_year if selected_month >= 7 else fy_year + 1,
            'sections': sections,
            'rows': rows,
            'summary': summary,
            'finance_kpis': finance_kpis,
            'cumulative_finance_kpis': cumulative_kpis,
            'billing': billing,
            'collections': collections,
            'regional': regional,
            'trend': trend,
        })


class FinanceSectionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FinanceSection.objects.select_related('report').all()
    serializer_class = FinanceSectionSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['report']
    ordering = ['display_order']


class FinanceMetricViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FinanceMetric.objects.select_related('report', 'section').prefetch_related('monthly_values').all()
    serializer_class = FinanceMetricSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['report', 'section', 'metric_kind', 'scope_type', 'scope_name']
    search_fields = ['label', 'code']
    ordering = ['display_order']


class FinanceMonthlyValueViewSet(viewsets.ModelViewSet):
    queryset = FinanceMonthlyValue.objects.select_related('metric', 'metric__report').all()
    serializer_class = FinanceMonthlyValueSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['metric', 'metric__report', 'year', 'month', 'fiscal_month_index']
    ordering = ['year', 'month', 'metric__display_order']
