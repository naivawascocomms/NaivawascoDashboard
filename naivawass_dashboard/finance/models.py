from decimal import Decimal

from django.db import models


class FinanceReport(models.Model):
    name = models.CharField(max_length=200)
    fiscal_year_start = models.PositiveIntegerField()
    fiscal_year_label = models.CharField(max_length=20, blank=True)
    current_snapshot_date = models.DateField(null=True, blank=True)
    current_fiscal_month_index = models.PositiveSmallIntegerField(null=True, blank=True)
    source_workbook = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-fiscal_year_start', 'name']
        unique_together = [('name', 'fiscal_year_start')]

    def save(self, *args, **kwargs):
        if not self.fiscal_year_label:
            self.fiscal_year_label = f'{self.fiscal_year_start}/{str(self.fiscal_year_start + 1)[-2:]}'
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.name} {self.fiscal_year_label}'


class FinanceSection(models.Model):
    report = models.ForeignKey(FinanceReport, on_delete=models.CASCADE, related_name='sections')
    title = models.CharField(max_length=255)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['display_order', 'id']
        unique_together = [('report', 'title')]

    def __str__(self):
        return self.title


class FinanceMetric(models.Model):
    METRIC_KIND_CHOICES = [
        ('MONEY', 'Money'),
        ('PERCENTAGE', 'Percentage'),
        ('COUNT', 'Count'),
        ('DATE', 'Date'),
        ('TEXT', 'Text'),
    ]
    SCOPE_CHOICES = [
        ('GLOBAL', 'Global'),
        ('REGION', 'Region'),
        ('CUSTOM', 'Custom'),
    ]
    CUMULATIVE_CHOICES = [
        ('SUM', 'Sum'),
        ('AVERAGE', 'Average'),
        ('LAST_VALUE', 'Last Value'),
    ]

    report = models.ForeignKey(FinanceReport, on_delete=models.CASCADE, related_name='metrics')
    section = models.ForeignKey(FinanceSection, on_delete=models.SET_NULL, related_name='metrics', null=True, blank=True)
    code = models.CharField(max_length=50)
    label = models.CharField(max_length=255)
    unit = models.CharField(max_length=50, blank=True)
    metric_kind = models.CharField(max_length=20, choices=METRIC_KIND_CHOICES, default='MONEY')
    scope_type = models.CharField(max_length=20, choices=SCOPE_CHOICES, default='GLOBAL')
    scope_name = models.CharField(max_length=100, blank=True)
    cumulative_behavior = models.CharField(max_length=20, choices=CUMULATIVE_CHOICES, default='SUM')
    display_order = models.PositiveIntegerField(default=0)
    workbook_sheet = models.CharField(max_length=100, blank=True)
    workbook_row = models.PositiveIntegerField(null=True, blank=True)
    is_total = models.BooleanField(default=False)
    is_summary = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['display_order', 'id']
        unique_together = [('report', 'code')]

    def __str__(self):
        return self.label


class FinanceMonthlyValue(models.Model):
    metric = models.ForeignKey(FinanceMetric, on_delete=models.CASCADE, related_name='monthly_values')
    year = models.PositiveIntegerField()
    month = models.PositiveSmallIntegerField()
    fiscal_month_index = models.PositiveSmallIntegerField()
    target_value_numeric = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    target_value_text = models.CharField(max_length=100, blank=True)
    actual_value_numeric = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    actual_value_text = models.CharField(max_length=100, blank=True)
    previous_year_actual_numeric = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    previous_year_actual_text = models.CharField(max_length=100, blank=True)
    source_row = models.PositiveIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['year', 'month', 'metric__display_order']
        unique_together = [('metric', 'year', 'month')]
        indexes = [
            models.Index(fields=['year', 'month']),
            models.Index(fields=['fiscal_month_index']),
        ]

    @property
    def target_decimal(self):
        return self.target_value_numeric or Decimal('0')

    @property
    def actual_decimal(self):
        return self.actual_value_numeric or Decimal('0')

    def __str__(self):
        return f'{self.metric.label} {self.year}-{self.month:02d}'
