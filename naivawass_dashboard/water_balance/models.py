from datetime import date

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class WaterBalanceDashboardSettings(models.Model):
    """Controls which dashboard source is authoritative by date range."""

    name = models.CharField(max_length=100, default='default', unique=True)
    historical_import_end_date = models.DateField(
        default=date(2026, 3, 31),
        help_text='Periods ending on or before this date use imported dashboard figures.',
    )
    balance_testing_start_date = models.DateField(
        default=date(2026, 4, 1),
        help_text='Date from which balance-model output may be used for test/mock dashboard periods.',
    )
    live_balance_start_date = models.DateField(
        default=date(2026, 6, 1),
        help_text='Date from which balance-model output is considered live operational dashboard data.',
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_active', 'name']
        verbose_name = 'Water Balance Dashboard Settings'
        verbose_name_plural = 'Water Balance Dashboard Settings'

    def __str__(self):
        return self.name

    @classmethod
    def get_active(cls):
        settings = cls.objects.filter(is_active=True).order_by('id').first()
        if settings:
            return settings
        return cls(
            historical_import_end_date=date(2026, 3, 31),
            balance_testing_start_date=date(2026, 4, 1),
            live_balance_start_date=date(2026, 6, 1),
        )


class ProductionZoneAllocationRule(models.Model):
    """Reporting-only rule for attributing known zone supply to production sites.

    This model does not participate in meter readings or official production/zone
    supply calculations. It only explains the source mix for already-calculated
    zone supply volumes.
    """

    class Method(models.TextChoices):
        FIXED_WEIGHT = 'FIXED_WEIGHT', 'Fixed Weight'
        FIXED_PERCENTAGE = 'FIXED_PERCENTAGE', 'Fixed Percentage'

    class RuleType(models.TextChoices):
        MONTHLY_STANDARD = 'MONTHLY_STANDARD', 'Monthly Standard'
        OPERATIONAL_EXCEPTION = 'OPERATIONAL_EXCEPTION', 'Operational Exception'

    production_site = models.ForeignKey(
        'production.ProductionSite',
        on_delete=models.CASCADE,
        related_name='zone_allocation_rules',
    )
    zone = models.ForeignKey(
        'distribution.Zone',
        on_delete=models.CASCADE,
        related_name='production_allocation_rules',
    )
    method = models.CharField(
        max_length=30,
        choices=Method.choices,
        default=Method.FIXED_WEIGHT,
        help_text=(
            'Both methods are normalized per zone/day. If percentage values sum '
            'to 100 for a zone, the configured percentages are applied exactly.'
        ),
    )
    rule_type = models.CharField(
        max_length=30,
        choices=RuleType.choices,
        default=RuleType.MONTHLY_STANDARD,
        help_text='Monthly standards are used by default; operational exceptions override standards for matching dates.',
    )
    basis_value = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        validators=[MinValueValidator(0.0001)],
        help_text='Weight or percentage basis used in proportional allocation.',
    )
    effective_start_date = models.DateField()
    effective_end_date = models.DateField(null=True, blank=True)
    priority = models.PositiveIntegerField(
        default=0,
        help_text='Reserved for future balance/manual methods. Lower values are evaluated first.',
    )
    is_active = models.BooleanField(default=True)
    reason = models.CharField(
        max_length=100,
        blank=True,
        help_text='Reason for an operational exception, such as offtake, shutdown, burst, or valve operation.',
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = [
            'zone__region__dashboard_order',
            'zone__dashboard_order',
            'zone__name',
            'rule_type',
            'priority',
            'production_site__name',
        ]
        indexes = [
            models.Index(fields=['zone', 'is_active']),
            models.Index(fields=['zone', 'rule_type', 'is_active']),
            models.Index(fields=['production_site', 'is_active']),
            models.Index(fields=['effective_start_date', 'effective_end_date']),
        ]
        verbose_name = 'Production Zone Allocation Rule'
        verbose_name_plural = 'Production Zone Allocation Rules'

    def __str__(self):
        return f'{self.production_site} -> {self.zone} ({self.basis_value})'

    def clean(self):
        errors = {}
        if self.effective_end_date and self.effective_start_date > self.effective_end_date:
            errors['effective_end_date'] = 'End date cannot be before start date.'

        if self.method == self.Method.FIXED_PERCENTAGE and self.basis_value > 100:
            errors['basis_value'] = 'Fixed percentage basis cannot exceed 100.'

        if self.rule_type == self.RuleType.OPERATIONAL_EXCEPTION and not self.reason.strip():
            errors['reason'] = 'Operational exceptions require a reason.'

        if self.is_active and self.production_site_id and self.zone_id and self.effective_start_date:
            overlap_qs = ProductionZoneAllocationRule.objects.filter(
                production_site_id=self.production_site_id,
                zone_id=self.zone_id,
                rule_type=self.rule_type,
                is_active=True,
                effective_start_date__lte=self.effective_end_date or date.max,
            ).filter(
                models.Q(effective_end_date__isnull=True) |
                models.Q(effective_end_date__gte=self.effective_start_date)
            )
            if self.pk:
                overlap_qs = overlap_qs.exclude(pk=self.pk)
            if overlap_qs.exists():
                errors['production_site'] = (
                    'An active rule with this type for this production site and zone already overlaps this date range.'
                )

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class WaterBalanceNode(models.Model):
    """A configurable point in the water network used for source attribution."""

    class NodeType(models.TextChoices):
        PRODUCTION_SITE = 'PRODUCTION_SITE', 'Production Site'
        MIXING_NODE = 'MIXING_NODE', 'Mixing Node'
        INTERMEDIARY = 'INTERMEDIARY', 'Intermediary'

    name = models.CharField(max_length=200)
    code = models.CharField(max_length=50, unique=True)
    node_type = models.CharField(max_length=30, choices=NodeType.choices, default=NodeType.MIXING_NODE)
    production_site = models.ForeignKey(
        'production.ProductionSite',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='water_balance_nodes',
        help_text='Link when this node represents a production site such as Water Works.',
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['node_type', 'is_active']),
        ]
        verbose_name = 'Water Balance Node'
        verbose_name_plural = 'Water Balance Nodes'

    def __str__(self):
        return f'{self.name} ({self.code})'


class WaterBalanceModel(models.Model):
    """Effective-dated balance configuration for one distribution zone."""

    name = models.CharField(max_length=200)
    zone = models.ForeignKey(
        'distribution.Zone',
        on_delete=models.CASCADE,
        related_name='water_balance_models',
    )
    effective_start_date = models.DateField()
    effective_end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = [
            'zone__region__dashboard_order',
            'zone__dashboard_order',
            'zone__name',
            '-effective_start_date',
            'name',
        ]
        indexes = [
            models.Index(fields=['zone', 'is_active']),
            models.Index(fields=['effective_start_date', 'effective_end_date']),
        ]
        verbose_name = 'Water Balance Model'
        verbose_name_plural = 'Water Balance Models'

    def __str__(self):
        return f'{self.zone} - {self.name}'

    def clean(self):
        errors = {}
        if self.effective_end_date and self.effective_start_date > self.effective_end_date:
            errors['effective_end_date'] = 'End date cannot be before start date.'

        if self.is_active and self.zone_id and self.effective_start_date:
            overlap_qs = WaterBalanceModel.objects.filter(
                zone_id=self.zone_id,
                is_active=True,
                effective_start_date__lte=self.effective_end_date or date.max,
            ).filter(
                models.Q(effective_end_date__isnull=True) |
                models.Q(effective_end_date__gte=self.effective_start_date)
            )
            if self.pk:
                overlap_qs = overlap_qs.exclude(pk=self.pk)
            if overlap_qs.exists():
                errors['zone'] = 'An active water balance model for this zone overlaps this date range.'

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class WaterBalanceRule(models.Model):
    """One source-attribution rule inside a zone water balance model."""

    class Method(models.TextChoices):
        FIXED_WEIGHT = 'FIXED_WEIGHT', 'Fixed Weight'
        FIXED_PERCENTAGE = 'FIXED_PERCENTAGE', 'Fixed Percentage'
        METERED_VOLUME = 'METERED_VOLUME', 'Metered Volume'
        MIXING_NODE_SHARE = 'MIXING_NODE_SHARE', 'Mixing Node Share'
        MANUAL_OVERRIDE = 'MANUAL_OVERRIDE', 'Manual Override'

    class Confidence(models.TextChoices):
        MEASURED = 'MEASURED', 'Measured'
        MEASURED_ALLOCATED = 'MEASURED_ALLOCATED', 'Measured/Allocated'
        ESTIMATED = 'ESTIMATED', 'Estimated'
        MANUAL = 'MANUAL', 'Manual'

    balance_model = models.ForeignKey(
        WaterBalanceModel,
        on_delete=models.CASCADE,
        related_name='rules',
    )
    production_site = models.ForeignKey(
        'production.ProductionSite',
        on_delete=models.CASCADE,
        related_name='water_balance_rules',
    )
    route_name = models.CharField(
        max_length=200,
        blank=True,
        help_text='Route label, for example Karati via Water Works.',
    )
    method = models.CharField(max_length=30, choices=Method.choices)
    basis_value = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text='Percentage, fixed weight, or fallback basis depending on method.',
    )
    water_meter = models.ForeignKey(
        'metering.WaterMeter',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='water_balance_rules',
        help_text='Meter used when method is metered volume.',
    )
    mixing_node = models.ForeignKey(
        WaterBalanceNode,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='output_rules',
        help_text='Mixing node used when method is mixing node share.',
    )
    manual_volume_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
    )
    confidence = models.CharField(max_length=30, choices=Confidence.choices, default=Confidence.MEASURED_ALLOCATED)
    priority = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    effective_start_date = models.DateField(null=True, blank=True)
    effective_end_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['balance_model', 'priority', 'production_site__name', 'route_name']
        indexes = [
            models.Index(fields=['balance_model', 'is_active']),
            models.Index(fields=['method', 'is_active']),
            models.Index(fields=['mixing_node', 'is_active']),
            models.Index(fields=['effective_start_date', 'effective_end_date']),
        ]
        verbose_name = 'Water Balance Rule'
        verbose_name_plural = 'Water Balance Rules'

    def __str__(self):
        route = f' via {self.route_name}' if self.route_name else ''
        return f'{self.balance_model.zone} - {self.production_site}{route}'

    def clean(self):
        errors = {}
        if self.effective_end_date and self.effective_start_date and self.effective_start_date > self.effective_end_date:
            errors['effective_end_date'] = 'End date cannot be before start date.'

        if self.method in {self.Method.FIXED_WEIGHT, self.Method.FIXED_PERCENTAGE} and self.basis_value is None:
            errors['basis_value'] = 'Basis value is required for fixed allocation methods.'

        if self.method == self.Method.FIXED_PERCENTAGE and self.basis_value is not None and self.basis_value > 100:
            errors['basis_value'] = 'Fixed percentage basis cannot exceed 100.'

        if self.method == self.Method.METERED_VOLUME and not self.water_meter_id:
            errors['water_meter'] = 'Select a water meter for metered-volume rules.'

        if self.method == self.Method.MIXING_NODE_SHARE and not self.mixing_node_id:
            errors['mixing_node'] = 'Select a mixing node for mixing-node-share rules.'

        if self.method == self.Method.MANUAL_OVERRIDE and self.manual_volume_m3 is None:
            errors['manual_volume_m3'] = 'Manual volume is required for manual-override rules.'

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class WaterBalanceNodeInput(models.Model):
    """Configured input into a mixing/intermediary node."""

    class InputMethod(models.TextChoices):
        SITE_PRODUCTION = 'SITE_PRODUCTION', 'Site Production'
        METERED_TRANSFER = 'METERED_TRANSFER', 'Metered Transfer'
        RESIDUAL = 'RESIDUAL', 'Residual'

    node = models.ForeignKey(WaterBalanceNode, on_delete=models.CASCADE, related_name='inputs')
    production_site = models.ForeignKey(
        'production.ProductionSite',
        on_delete=models.CASCADE,
        related_name='water_balance_node_inputs',
    )
    input_method = models.CharField(max_length=30, choices=InputMethod.choices)
    water_meter = models.ForeignKey(
        'metering.WaterMeter',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='water_balance_node_inputs',
    )
    confidence = models.CharField(
        max_length=30,
        choices=WaterBalanceRule.Confidence.choices,
        default=WaterBalanceRule.Confidence.MEASURED,
    )
    priority = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    effective_start_date = models.DateField(null=True, blank=True)
    effective_end_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['node__name', 'priority', 'production_site__name']
        indexes = [
            models.Index(fields=['node', 'is_active']),
            models.Index(fields=['input_method', 'is_active']),
            models.Index(fields=['effective_start_date', 'effective_end_date']),
        ]
        verbose_name = 'Water Balance Node Input'
        verbose_name_plural = 'Water Balance Node Inputs'

    def __str__(self):
        return f'{self.node} <- {self.production_site} ({self.input_method})'

    def clean(self):
        errors = {}
        if self.effective_end_date and self.effective_start_date and self.effective_start_date > self.effective_end_date:
            errors['effective_end_date'] = 'End date cannot be before start date.'
        if self.input_method == self.InputMethod.METERED_TRANSFER and not self.water_meter_id:
            errors['water_meter'] = 'Select a water meter for metered-transfer inputs.'
        if self.input_method == self.InputMethod.SITE_PRODUCTION and self.water_meter_id:
            errors['water_meter'] = 'Site-production inputs use DailyProduction and should not select a water meter.'
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
