from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import FinanceMetric, FinanceMonthlyValue, FinanceReport, FinanceSection


class FinanceDashboardApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='finance-user', password='pass')
        self.client.force_authenticate(self.user)
        self.report = FinanceReport.objects.create(
            name='Finance Dashboard',
            fiscal_year_start=2025,
            current_fiscal_month_index=9,
            source_workbook='test.xlsx',
        )
        section = FinanceSection.objects.create(
            report=self.report,
            title='Billing Dashboard - Summary',
            display_order=1,
        )
        self.metric = FinanceMetric.objects.create(
            report=self.report,
            section=section,
            code='total_billed',
            label='Total billed (Ksh)',
            unit='Ksh',
            metric_kind='MONEY',
            cumulative_behavior='SUM',
            display_order=19,
            is_total=True,
            is_summary=True,
        )
        for fiscal_index, month in enumerate([7, 8, 9, 10, 11, 12, 1, 2, 3], start=1):
            year = 2025 if month >= 7 else 2026
            FinanceMonthlyValue.objects.create(
                metric=self.metric,
                year=year,
                month=month,
                fiscal_month_index=fiscal_index,
                target_value_numeric=Decimal('100.00'),
                actual_value_numeric=Decimal('80.00') if month != 3 else Decimal('120.00'),
            )

    def test_dashboard_uses_current_fiscal_month_as_calendar_month(self):
        response = self.client.get(f'/api/finance/reports/{self.report.id}/dashboard/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['selected_month'], 3)
        self.assertEqual(response.data['selected_year'], 2026)
        self.assertEqual(response.data['billing']['totalBilled']['monthly'], 120)
        self.assertEqual(response.data['billing']['totalBilled']['cumulative'], 760)
