# distribution/models.py

from calendar import monthrange
from datetime import date
from django.db import models
from django.db.models import Q
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.exceptions import ValidationError
from django.utils import timezone
from decimal import Decimal


class DistributionRegion(models.Model):
    """Distribution regions - can be linked to production regions"""
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)
    description = models.TextField(blank=True)
    dashboard_order = models.PositiveIntegerField(
        default=0,
        help_text="Display order in the distribution dashboard"
    )
    dashboard_supply_kpi_code = models.CharField(
        max_length=20,
        blank=True,
        help_text="Workbook KPI code for regional supplied volume"
    )
    dashboard_billed_kpi_code = models.CharField(
        max_length=20,
        blank=True,
        help_text="Workbook KPI code for regional billed volume"
    )
    dashboard_nrw_m3_kpi_code = models.CharField(
        max_length=20,
        blank=True,
        help_text="Workbook KPI code for regional NRW volume"
    )
    dashboard_nrw_pct_kpi_code = models.CharField(
        max_length=20,
        blank=True,
        help_text="Workbook KPI code for regional NRW percentage"
    )
    
    # Link to production region if applicable
    production_region = models.ForeignKey(
        'production.Region',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='distribution_regions',
        help_text="Linked production region"
    )
    
    # Billing cycle configuration
    default_billing_day = models.IntegerField(
        default=1,
        validators=[MinValueValidator(1), MaxValueValidator(31)],
        help_text="Default day of month for billing cycle"
    )
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['dashboard_order', 'name']
        verbose_name = 'Distribution Region'
        verbose_name_plural = 'Distribution Regions'

    def __str__(self):
        return self.name


class Zone(models.Model):
    """Distribution zones within a region (e.g., CBD, CCCR, Lakeview)"""
    SUPPLY_AGGREGATION_CHOICES = [
        ('UNSET', 'Not Configured'),
        ('ZONE_METER', 'Zone Master Meter'),
        ('DMA_SUM', 'Sum of DMA Inlets'),
    ]

    region = models.ForeignKey(
        DistributionRegion,
        on_delete=models.CASCADE,
        related_name='zones'
    )
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    dashboard_order = models.PositiveIntegerField(
        default=0,
        help_text="Display order in the distribution dashboard"
    )
    dashboard_supply_kpi_code = models.CharField(
        max_length=20,
        blank=True,
        help_text="Workbook KPI code for supplied volume"
    )
    dashboard_billed_kpi_code = models.CharField(
        max_length=20,
        blank=True,
        help_text="Workbook KPI code for billed volume"
    )
    dashboard_nrw_pct_kpi_code = models.CharField(
        max_length=20,
        blank=True,
        help_text="Workbook KPI code for NRW percentage"
    )
    supply_aggregation_method = models.CharField(
        max_length=20,
        choices=SUPPLY_AGGREGATION_CHOICES,
        default='UNSET',
        help_text="How this zone's official supplied volume should be calculated"
    )
    
    # Zone characteristics
    zone_type = models.CharField(
        max_length=50,
        choices=[
            ('URBAN', 'Urban'),
            ('PERI_URBAN', 'Peri-Urban'),
            ('RURAL', 'Rural'),
            ('COMMERCIAL', 'Commercial'),
            ('INDUSTRIAL', 'Industrial')
        ],
        default='URBAN'
    )
    
    # Population and customer data
    estimated_population = models.IntegerField(null=True, blank=True)
    number_of_connections = models.IntegerField(default=0)
    
    # Geographic data
    area_km2 = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Area in square kilometers"
    )
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['region__dashboard_order', 'dashboard_order', 'name']
        verbose_name = 'Distribution Zone'
        verbose_name_plural = 'Distribution Zones'

    def __str__(self):
        return f"{self.region.code} - {self.name}"


class ZoneSupplyConfiguration(models.Model):
    """User-managed configuration describing how zonal supply should be calculated."""
    AGGREGATION_METHOD_CHOICES = [
        ('ONE_METER', 'One Meter'),
        ('SUM_OF_DMA_METERS', 'Sum of DMA Meters'),
        ('SUM_OF_SELECTED_METERS', 'Sum of Selected Meters'),
        ('CUSTOM_ASSIGNMENTS', 'Custom Assignment Set'),
    ]

    zone = models.OneToOneField(
        Zone,
        on_delete=models.CASCADE,
        related_name='supply_configuration'
    )
    aggregation_method = models.CharField(
        max_length=30,
        choices=AGGREGATION_METHOD_CHOICES,
        default='ONE_METER'
    )
    primary_meter = models.ForeignKey(
        'DistributionMeter',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='primary_for_zone_supply_configs',
        help_text="Official zone supply meter when the zone is defined by one meter."
    )
    component_dmas = models.ManyToManyField(
        'DMA',
        blank=True,
        related_name='zone_supply_configurations',
        help_text="DMAs whose inlet meters should be summed for zonal supply."
    )
    component_meters = models.ManyToManyField(
        'DistributionMeter',
        blank=True,
        related_name='component_for_zone_supply_configs',
        help_text="Explicit meters to sum when the zone is composed from selected meters."
    )
    primary_water_meter = models.ForeignKey(
        'metering.WaterMeter',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='primary_for_zone_supply_configs',
        help_text="Official shared water meter for a one-meter zone.",
    )
    component_water_meters = models.ManyToManyField(
        'metering.WaterMeter',
        blank=True,
        related_name='component_for_zone_supply_configs',
        help_text="Shared water meters to sum when the zone is composed from selected meters.",
    )
    infrastructure_description = models.TextField(
        blank=True,
        help_text="Plain-language description of how the zone is supplied."
    )
    calculation_notes = models.TextField(
        blank=True,
        help_text="Additional calculation assumptions or exclusions."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Zone Supply Configuration'
        verbose_name_plural = 'Zone Supply Configurations'

    def __str__(self):
        return f"{self.zone.code} Supply Configuration"

    def clean(self):
        from django.core.exceptions import ValidationError

        errors = {}

        if self.aggregation_method == 'ONE_METER':
            if not self.primary_water_meter and not self.primary_meter:
                errors['primary_water_meter'] = 'Select the official shared water meter for a one-meter zone.'
            if self.pk and self.component_dmas.exists():
                errors['component_dmas'] = 'DMA components are only used for sum-of-DMA zones.'
            if self.pk and (self.component_meters.exists() or self.component_water_meters.exists()):
                errors['component_water_meters'] = 'Selected component meters are only used for sum-of-selected-meters zones.'

        if self.aggregation_method == 'SUM_OF_DMA_METERS':
            if self.primary_meter or self.primary_water_meter:
                errors['primary_water_meter'] = 'Primary meter must be empty when supply is defined by DMA totals.'
            if self.pk and (self.component_meters.exists() or self.component_water_meters.exists()):
                errors['component_water_meters'] = 'Selected component meters are not used for sum-of-DMA zones.'
            if self.pk and not self.component_dmas.exists():
                errors['component_dmas'] = 'Select at least one DMA to define zonal supply.'

        if self.aggregation_method == 'SUM_OF_SELECTED_METERS':
            if self.primary_meter or self.primary_water_meter:
                errors['primary_water_meter'] = 'Primary meter must be empty when supply is defined by selected meters.'
            if self.pk and self.component_dmas.exists():
                errors['component_dmas'] = 'DMA components are not used for sum-of-selected-meters zones.'
            if self.pk and not (self.component_meters.exists() or self.component_water_meters.exists()):
                errors['component_water_meters'] = 'Select at least one meter to define zonal supply.'

        if self.aggregation_method == 'CUSTOM_ASSIGNMENTS':
            if self.primary_meter or self.primary_water_meter:
                errors['primary_water_meter'] = 'Primary meter must be empty when supply is defined by custom assignments.'
            if self.pk and self.component_dmas.exists():
                errors['component_dmas'] = 'DMA components are not used for custom-assignment zones.'
            if self.pk and (self.component_meters.exists() or self.component_water_meters.exists()):
                errors['component_water_meters'] = 'Selected meters are not used for custom-assignment zones.'

        if self.pk:
            invalid_dmas = self.component_dmas.exclude(zone=self.zone)
            if invalid_dmas.exists():
                errors['component_dmas'] = 'All selected DMAs must belong to the same zone.'

        if errors:
            raise ValidationError(errors)


class DMA(models.Model):
    """District Metered Area - smallest monitoring unit"""
    zone = models.ForeignKey(
        Zone,
        on_delete=models.CASCADE,
        related_name='dmas'
    )
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    
    # DMA characteristics
    number_of_connections = models.IntegerField(default=0)
    average_pressure_bar = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True
    )
    
    # Expected consumption
    expected_daily_consumption_m3 = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['zone', 'name']
        verbose_name = 'DMA'
        verbose_name_plural = 'DMAs'

    def __str__(self):
        return f"{self.zone.code} - {self.name}"


class DistributionMeter(models.Model):
    """Meters for distribution network (zone/DMA inlet meters)"""
    METER_LOCATION_CHOICES = [
        ('ZONE_INLET', 'Zone Inlet'),
        ('DMA_INLET', 'DMA Inlet'),
        ('BULK_SUPPLY', 'Bulk Supply Point'),
        ('TRANSMISSION', 'Transmission Line'),
    ]
    
    meter_location_type = models.CharField(
        max_length=20,
        choices=METER_LOCATION_CHOICES
    )
    
    # Link to zone or DMA
    zone = models.ForeignKey(
        Zone,
        on_delete=models.CASCADE,
        related_name='meters',
        null=True,
        blank=True,
        help_text="For zone inlet meters"
    )
    dma = models.ForeignKey(
        DMA,
        on_delete=models.CASCADE,
        related_name='meters',
        null=True,
        blank=True,
        help_text="For DMA inlet meters"
    )
    
    meter_number = models.CharField(max_length=100, unique=True)
    
    # Meter specifications
    manufacturer = models.CharField(max_length=100, blank=True)
    model = models.CharField(max_length=100, blank=True)
    diameter_mm = models.IntegerField(
        null=True,
        blank=True,
        help_text="Meter diameter in millimeters"
    )
    
    # Meter status
    is_active = models.BooleanField(default=True)
    installation_date = models.DateField()
    last_calibration_date = models.DateField(null=True, blank=True)
    next_calibration_date = models.DateField(null=True, blank=True)
    
    # Initial reading
    initial_reading = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0
    )
    
    # Metadata
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['zone', 'meter_number']
        verbose_name = 'Distribution Meter'
        verbose_name_plural = 'Distribution Meters'

    def __str__(self):
        return f"{self.get_meter_location_type_display()} - {self.meter_number}"

    def clean(self):
        from django.core.exceptions import ValidationError
        # Zone/DMA inlet meters must be linked to a zone or DMA respectively
        if self.meter_location_type == 'ZONE_INLET' and not self.zone:
            raise ValidationError("Zone inlet meters must be linked to a zone")
        if self.meter_location_type == 'DMA_INLET' and not self.dma:
            raise ValidationError("DMA inlet meters must be linked to a DMA")


class DistributionMeterReading(models.Model):
    """Daily meter readings for distribution network"""
    meter = models.ForeignKey(
        DistributionMeter,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='readings'
    )
    reading_date = models.DateField()
    reading_time = models.TimeField(default=timezone.now)
    
    # Reading values
    current_reading = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )
    previous_reading = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True
    )
    volume_supplied = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Volume supplied (current - previous)"
    )
    
    # Reading details
    read_by = models.CharField(max_length=200, blank=True)
    reading_method = models.CharField(
        max_length=50,
        choices=[
            ('MANUAL', 'Manual Reading'),
            ('SCADA', 'SCADA/Automated'),
            ('ESTIMATED', 'Estimated')
        ],
        default='MANUAL'
    )
    
    # Validation
    is_validated = models.BooleanField(default=False)
    is_anomaly = models.BooleanField(default=False)
    validated_by = models.CharField(max_length=200, blank=True)
    validated_at = models.DateTimeField(null=True, blank=True)
    
    # Metadata
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-reading_date', '-reading_time']
        unique_together = [['meter', 'reading_date', 'reading_time']]
        indexes = [
            models.Index(fields=['meter', '-reading_date']),
            models.Index(fields=['reading_date']),
        ]
        verbose_name = 'Distribution Meter Reading'
        verbose_name_plural = 'Distribution Meter Readings'

    def __str__(self):
        return f"{self.meter.meter_number} - {self.reading_date}"

    def save(self, *args, **kwargs):
        # Calculate volume supplied
        if self.previous_reading is not None:
            self.volume_supplied = self.current_reading - self.previous_reading
        super().save(*args, **kwargs)


class BillingCycle(models.Model):
    """Billing cycle configuration for each region/period"""
    region = models.ForeignKey(
        DistributionRegion,
        on_delete=models.CASCADE,
        related_name='billing_cycles'
    )
    year = models.IntegerField()
    month = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])
    
    # Billing period dates
    start_date = models.DateField(help_text="Start of billing cycle")
    end_date = models.DateField(help_text="End of billing cycle (closing date)")
    
    # Billing metadata
    billing_run_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date when bills were generated"
    )
    is_finalized = models.BooleanField(default=False)
    
    # Metadata
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-year', '-month', 'region']
        unique_together = [['region', 'year', 'month']]
        verbose_name = 'Billing Cycle'
        verbose_name_plural = 'Billing Cycles'

    def __str__(self):
        return f"{self.region.code} - {self.year}-{self.month:02d} ({self.start_date} to {self.end_date})"

    @property
    def number_of_days(self):
        """Calculate number of days in billing cycle"""
        return (self.end_date - self.start_date).days + 1


class ZoneBillingCycle(models.Model):
    """Authoritative meter-reading cycle dates per zone and month."""
    zone = models.ForeignKey(
        Zone,
        on_delete=models.CASCADE,
        related_name='billing_cycles'
    )
    year = models.IntegerField()
    month = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])
    opening_date = models.DateField(help_text="Meter opening date for this zonal cycle")
    closing_date = models.DateField(
        null=True,
        blank=True,
        help_text="Meter closing date for this zonal cycle. Leave blank while the cycle is active/open."
    )
    is_finalized = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-year', '-month', 'zone']
        unique_together = [['zone', 'year', 'month']]
        indexes = [
            models.Index(fields=['year', 'month']),
            models.Index(fields=['zone', 'year', 'month']),
        ]
        verbose_name = 'Zone Billing Cycle'
        verbose_name_plural = 'Zone Billing Cycles'

    def __str__(self):
        closing_label = self.closing_date or 'open'
        return f"{self.zone.code} - {self.year}-{self.month:02d} ({self.opening_date} to {closing_label})"

    @property
    def number_of_days(self):
        if not self.opening_date:
            return 0
        return (self.effective_closing_date - self.opening_date).days + 1

    @property
    def effective_closing_date(self):
        return self.closing_date or timezone.localdate()

    @property
    def is_open(self):
        return self.closing_date is None

    def clean(self):
        if self.opening_date and self.closing_date and self.opening_date > self.closing_date:
            raise ValidationError({'closing_date': 'Closing date must be on or after opening date.'})

        if self.opening_date and self.closing_date and self.number_of_days > 62:
            raise ValidationError({'closing_date': 'Cycle length is too long. Keep zone cycles within 62 days.'})

        current_end = self.closing_date or date.max
        overlaps = ZoneBillingCycle.objects.filter(zone=self.zone).exclude(pk=self.pk).filter(
            opening_date__lte=current_end,
        ).filter(
            Q(closing_date__isnull=True) | Q(closing_date__gte=self.opening_date)
        )
        if overlaps.exists():
            overlap = overlaps.first()
            overlap_closing = overlap.closing_date or 'open'
            raise ValidationError({
                'opening_date': (
                    f'Overlaps with existing cycle {overlap.year}-{overlap.month:02d} '
                    f'({overlap.opening_date} to {overlap_closing}).'
                )
            })

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class CustomerBillingData(models.Model):
    """Aggregated customer billing data per zone for a billing cycle"""
    zone = models.ForeignKey(
        Zone,
        on_delete=models.CASCADE,
        related_name='billing_data'
    )
    billing_cycle = models.ForeignKey(
        BillingCycle,
        on_delete=models.CASCADE,
        related_name='zone_billing_data'
    )
    zone_billing_cycle = models.ForeignKey(
        ZoneBillingCycle,
        on_delete=models.CASCADE,
        related_name='customer_billing_data',
        null=True,
        blank=True
    )
    
    # Billing summary
    total_volume_billed_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        help_text="Total volume billed to customers"
    )
    number_of_bills_generated = models.IntegerField(default=0)
    number_of_active_connections = models.IntegerField(default=0)
    
    # Revenue data (optional)
    total_revenue = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        null=True,
        blank=True
    )
    water_revenue = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        null=True,
        blank=True
    )
    sewer_revenue = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        null=True,
        blank=True
    )
    
    # Metadata
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-billing_cycle__year', '-billing_cycle__month', 'zone']
        unique_together = [['zone', 'billing_cycle']]
        verbose_name = 'Customer Billing Data'
        verbose_name_plural = 'Customer Billing Data'

    def __str__(self):
        return f"{self.zone.code} - {self.billing_cycle}"

    def clean(self):
        if self.zone_billing_cycle and self.zone_billing_cycle.zone_id != self.zone_id:
            raise ValidationError({'zone_billing_cycle': 'Zone billing cycle must belong to the same zone.'})
        if self.zone_billing_cycle and self.billing_cycle:
            if (
                self.billing_cycle.region_id != self.zone.region_id or
                self.billing_cycle.year != self.zone_billing_cycle.year or
                self.billing_cycle.month != self.zone_billing_cycle.month
            ):
                raise ValidationError({'billing_cycle': 'Regional billing cycle must match the zone billing cycle month.'})

    def save(self, *args, **kwargs):
        if self.zone_billing_cycle:
            if self.zone_billing_cycle.closing_date is None and self.billing_cycle_id is None:
                raise ValidationError({
                    'zone_billing_cycle': 'Close the zone billing cycle before attaching customer billing data.'
                })
            cycle, _ = BillingCycle.objects.get_or_create(
                region=self.zone.region,
                year=self.zone_billing_cycle.year,
                month=self.zone_billing_cycle.month,
                defaults={
                    'start_date': self.zone_billing_cycle.opening_date,
                    'end_date': self.zone_billing_cycle.closing_date,
                }
            )
            self.billing_cycle = cycle
        self.full_clean()
        super().save(*args, **kwargs)


class DailyDistribution(models.Model):
    """Daily distribution data per zone"""
    zone = models.ForeignKey(
        Zone,
        on_delete=models.CASCADE,
        related_name='daily_distribution'
    )
    distribution_date = models.DateField()
    
    # Water volumes
    volume_supplied_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        help_text="Total volume supplied to zone (from meters)"
    )
    
    # Calculated automatically if billing data available
    volume_billed_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        null=True,
        blank=True,
        help_text="Volume billed to customers (if available daily)"
    )
    
    # NRW calculation
    nrw_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Non-Revenue Water (supplied - billed)"
    )
    nrw_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True
    )
    
    # Data quality
    is_complete = models.BooleanField(default=False)
    is_validated = models.BooleanField(default=False)
    
    # Metadata
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-distribution_date', 'zone']
        unique_together = [['zone', 'distribution_date']]
        indexes = [
            models.Index(fields=['zone', '-distribution_date']),
            models.Index(fields=['distribution_date']),
        ]
        verbose_name = 'Daily Distribution'
        verbose_name_plural = 'Daily Distribution'

    def __str__(self):
        return f"{self.zone.code} - {self.distribution_date}"

    def save(self, *args, **kwargs):
        # Calculate NRW if both supplied and billed are available
        if self.volume_billed_m3 is not None and self.volume_supplied_m3 > 0:
            self.nrw_m3 = self.volume_supplied_m3 - self.volume_billed_m3
            self.nrw_percentage = (self.nrw_m3 / self.volume_supplied_m3) * 100
        else:
            self.nrw_m3 = None
            self.nrw_percentage = None
        super().save(*args, **kwargs)


class MonthlyDistribution(models.Model):
    """Commercial distribution summary per zone based on zone billing cycle."""
    zone = models.ForeignKey(
        Zone,
        on_delete=models.CASCADE,
        related_name='monthly_distribution'
    )
    billing_cycle = models.ForeignKey(
        BillingCycle,
        on_delete=models.CASCADE,
        related_name='zone_distribution'
    )
    zone_billing_cycle = models.ForeignKey(
        ZoneBillingCycle,
        on_delete=models.CASCADE,
        related_name='commercial_distribution',
        null=True,
        blank=True
    )
    
    # Water volumes
    volume_supplied_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        help_text="Total volume supplied to zone during billing cycle"
    )
    volume_billed_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        help_text="Total volume billed to customers"
    )
    
    # NRW metrics
    nrw_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0
    )
    nrw_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True
    )
    
    # Performance targets
    nrw_target_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True
    )
    volume_supplied_target_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True
    )
    
    # Realization metrics
    volume_supplied_realization_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True
    )
    nrw_realization_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Performance vs NRW target"
    )
    
    # Status
    is_finalized = models.BooleanField(default=False)
    finalized_by = models.CharField(max_length=200, blank=True)
    finalized_at = models.DateTimeField(null=True, blank=True)
    
    # Metadata
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-billing_cycle__year', '-billing_cycle__month', 'zone']
        unique_together = [['zone', 'billing_cycle']]
        verbose_name = 'Monthly Distribution'
        verbose_name_plural = 'Monthly Distribution'

    def __str__(self):
        period = self.zone_billing_cycle or self.billing_cycle
        return f"{self.zone.code} - {period}"

    def save(self, *args, **kwargs):
        if self.zone_billing_cycle:
            if self.zone_billing_cycle.closing_date is None and self.billing_cycle_id is None:
                raise ValidationError({
                    'zone_billing_cycle': 'Close the zone billing cycle before creating a monthly distribution record.'
                })
            cycle, _ = BillingCycle.objects.get_or_create(
                region=self.zone.region,
                year=self.zone_billing_cycle.year,
                month=self.zone_billing_cycle.month,
                defaults={
                    'start_date': self.zone_billing_cycle.opening_date,
                    'end_date': self.zone_billing_cycle.closing_date,
                }
            )
            self.billing_cycle = cycle

        # Calculate NRW
        self.nrw_m3 = self.volume_supplied_m3 - self.volume_billed_m3
        if self.volume_supplied_m3 > 0:
            self.nrw_percentage = (self.nrw_m3 / self.volume_supplied_m3) * 100
        else:
            self.nrw_percentage = None
        
        # Calculate realization percentages
        if self.volume_supplied_target_m3:
            self.volume_supplied_realization_percent = (
                self.volume_supplied_m3 / self.volume_supplied_target_m3 * 100
            )
        else:
            self.volume_supplied_realization_percent = None
        
        if self.nrw_target_percentage and self.nrw_percentage:
            # For NRW, lower is better, so realization is inverted
            self.nrw_realization_percent = (
                self.nrw_target_percentage / self.nrw_percentage * 100
            )
        else:
            self.nrw_realization_percent = None
        
        super().save(*args, **kwargs)


class RegionalDistribution(models.Model):
    """Commercial regional summary for a billing-cycle envelope."""
    region = models.ForeignKey(
        DistributionRegion,
        on_delete=models.CASCADE,
        related_name='regional_distribution'
    )
    billing_cycle = models.ForeignKey(
        BillingCycle,
        on_delete=models.CASCADE,
        related_name='regional_summary'
    )
    
    # Regional totals
    volume_supplied_m3 = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    volume_billed_m3 = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    nrw_m3 = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    nrw_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    
    # Targets
    nrw_target_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True
    )
    amount_billed_water = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        null=True,
        blank=True
    )
    amount_billed_sewer = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        null=True,
        blank=True
    )
    active_water_connections = models.IntegerField(default=0)
    active_sewer_connections = models.IntegerField(default=0)
    
    # Status
    is_finalized = models.BooleanField(default=False)
    
    # Metadata
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-billing_cycle__year', '-billing_cycle__month', 'region']
        unique_together = [['region', 'billing_cycle']]
        verbose_name = 'Regional Distribution'
        verbose_name_plural = 'Regional Distribution'

    def __str__(self):
        return f"{self.region.code} - {self.billing_cycle}"

    def save(self, *args, **kwargs):
        # Calculate regional NRW
        self.nrw_m3 = self.volume_supplied_m3 - self.volume_billed_m3
        if self.volume_supplied_m3 > 0:
            self.nrw_percentage = (self.nrw_m3 / self.volume_supplied_m3) * 100
        else:
            self.nrw_percentage = None
        super().save(*args, **kwargs)


class TransmissionLoss(models.Model):
    """Track water loss between production and distribution"""
    billing_cycle = models.ForeignKey(
        BillingCycle,
        on_delete=models.CASCADE,
        related_name='transmission_losses'
    )
    
    # Link to production data
    production_region = models.ForeignKey(
        'production.Region',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transmission_losses'
    )
    
    # Volumes
    water_available_from_production_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        help_text="Water available for sale from production"
    )
    water_available_to_distribution_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        help_text="Water received at distribution network"
    )
    transmission_loss_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0
    )
    transmission_loss_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True
    )
    
    # Metadata
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-billing_cycle__year', '-billing_cycle__month']
        unique_together = [['billing_cycle', 'production_region']]
        verbose_name = 'Transmission Loss'
        verbose_name_plural = 'Transmission Losses'

    def __str__(self):
        return f"{self.billing_cycle} - Transmission Loss"

    def save(self, *args, **kwargs):
        # Calculate transmission loss
        self.transmission_loss_m3 = (
            self.water_available_from_production_m3 - 
            self.water_available_to_distribution_m3
        )
        if self.water_available_from_production_m3 > 0:
            self.transmission_loss_percentage = (
                self.transmission_loss_m3 / 
                self.water_available_from_production_m3 * 100
            )
        else:
            self.transmission_loss_percentage = None
        super().save(*args, **kwargs)


class GlobalNRWPerformance(models.Model):
    """Overall system NRW performance (production to customer)"""
    billing_cycle = models.ForeignKey(
        BillingCycle,
        on_delete=models.CASCADE,
        related_name='global_nrw'
    )
    
    # Overall system volumes
    water_available_for_sale_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        help_text="From production"
    )
    volume_billed_to_customers_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0
    )
    global_nrw_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0
    )
    global_nrw_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True
    )
    
    # Breakdown
    transmission_loss_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True
    )
    regional_nrw_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True
    )
    
    # Target
    global_nrw_target_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True
    )
    active_water_connections = models.IntegerField(default=0)
    active_sewer_connections = models.IntegerField(default=0)
    inactive_water_connections = models.IntegerField(default=0)
    inactive_sewer_connections = models.IntegerField(default=0)
    total_connections = models.IntegerField(default=0)
    maintenance_repair_operational_cost = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        null=True,
        blank=True
    )
    
    # Metadata
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-billing_cycle__year', '-billing_cycle__month']
        unique_together = [['billing_cycle']]
        verbose_name = 'Global NRW Performance'
        verbose_name_plural = 'Global NRW Performance'

    def __str__(self):
        return f"Global NRW - {self.billing_cycle}"

    def save(self, *args, **kwargs):
        # Calculate global NRW
        self.global_nrw_m3 = (
            self.water_available_for_sale_m3 - 
            self.volume_billed_to_customers_m3
        )
        if self.water_available_for_sale_m3 > 0:
            self.global_nrw_percentage = (
                self.global_nrw_m3 / 
                self.water_available_for_sale_m3 * 100
            )
        else:
            self.global_nrw_percentage = None
        super().save(*args, **kwargs)


class CommercialDashboardReport(models.Model):
    """Workbook-backed sales and customer-care dashboard for a financial year."""
    name = models.CharField(max_length=200, default='Sales & CC Dashboard')
    fiscal_year_start = models.IntegerField(
        help_text='Financial year start year. Example: 2025 for FY 2025-26.'
    )
    fiscal_year_label = models.CharField(max_length=20, unique=True)
    current_snapshot_date = models.DateField(null=True, blank=True)
    current_fiscal_month_index = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(12)],
        help_text='Jul=1 through Jun=12 position from the workbook General sheet.'
    )
    sewerage_percentage_of_water = models.DecimalField(
        max_digits=8,
        decimal_places=4,
        default=0,
        help_text='General workbook parameter used by the commercial dashboard.'
    )
    source_workbook = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-fiscal_year_start']
        verbose_name = 'Commercial Dashboard Report'
        verbose_name_plural = 'Commercial Dashboard Reports'

    def __str__(self):
        return f"{self.name} {self.fiscal_year_label}"


class CommercialDashboardSection(models.Model):
    """Top-level section from the sales dashboard layout."""
    report = models.ForeignKey(
        CommercialDashboardReport,
        on_delete=models.CASCADE,
        related_name='sections'
    )
    title = models.CharField(max_length=200)
    display_order = models.PositiveIntegerField(default=0)
    workbook_row = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order', 'id']
        unique_together = [['report', 'title']]
        verbose_name = 'Commercial Dashboard Section'
        verbose_name_plural = 'Commercial Dashboard Sections'

    def __str__(self):
        return f"{self.report.fiscal_year_label} - {self.title}"


class CommercialDashboardKPI(models.Model):
    """One dashboard line item, optionally mapped to a zone or region."""
    SCOPE_CHOICES = [
        ('GLOBAL', 'Global'),
        ('REGION', 'Region'),
        ('ZONE', 'Zone'),
        ('CUSTOM', 'Custom'),
    ]

    report = models.ForeignKey(
        CommercialDashboardReport,
        on_delete=models.CASCADE,
        related_name='kpis'
    )
    section = models.ForeignKey(
        CommercialDashboardSection,
        on_delete=models.CASCADE,
        related_name='kpis'
    )
    label = models.CharField(max_length=255)
    unit = models.CharField(max_length=50, blank=True)
    item_number = models.CharField(max_length=20, blank=True)
    subgroup_title = models.CharField(
        max_length=120,
        blank=True,
        help_text='Optional workbook subgroup header such as Eastern Region.'
    )
    scope_type = models.CharField(max_length=20, choices=SCOPE_CHOICES, default='GLOBAL')
    region = models.ForeignKey(
        DistributionRegion,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='commercial_kpis'
    )
    zone = models.ForeignKey(
        Zone,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='commercial_kpis'
    )
    display_order = models.PositiveIntegerField(default=0)
    workbook_row = models.PositiveIntegerField(null=True, blank=True)
    is_total = models.BooleanField(default=False)
    is_summary = models.BooleanField(default=False)
    is_percentage = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order', 'id']
        unique_together = [['report', 'display_order']]
        verbose_name = 'Commercial Dashboard KPI'
        verbose_name_plural = 'Commercial Dashboard KPIs'

    def __str__(self):
        return f"{self.report.fiscal_year_label} - {self.label}"


class CommercialDashboardMonthlyValue(models.Model):
    """Monthly target and actual values for a KPI within one FY report."""
    kpi = models.ForeignKey(
        CommercialDashboardKPI,
        on_delete=models.CASCADE,
        related_name='monthly_values'
    )
    month = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])
    target_value_numeric = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True
    )
    target_value_text = models.CharField(max_length=255, blank=True)
    actual_value_numeric = models.DecimalField(
        max_digits=18,
        decimal_places=4,
        null=True,
        blank=True
    )
    actual_value_text = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['month', 'kpi__display_order']
        unique_together = [['kpi', 'month']]
        verbose_name = 'Commercial Dashboard Monthly Value'
        verbose_name_plural = 'Commercial Dashboard Monthly Values'

    def __str__(self):
        return f"{self.kpi.label} - {self.month:02d}"


class CommercialDashboardSnapshot(models.Model):
    """Exact dashboard view imported for one snapshot month."""
    kpi = models.ForeignKey(
        CommercialDashboardKPI,
        on_delete=models.CASCADE,
        related_name='snapshots'
    )
    snapshot_year = models.IntegerField()
    snapshot_month = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])
    monthly_target_numeric = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    monthly_target_text = models.CharField(max_length=255, blank=True)
    monthly_actual_numeric = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    monthly_actual_text = models.CharField(max_length=255, blank=True)
    monthly_realization_percent = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    cumulative_target_numeric = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    cumulative_target_text = models.CharField(max_length=255, blank=True)
    cumulative_actual_numeric = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    cumulative_actual_text = models.CharField(max_length=255, blank=True)
    cumulative_realization_percent = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['snapshot_year', 'snapshot_month', 'kpi__display_order']
        unique_together = [['kpi', 'snapshot_year', 'snapshot_month']]
        verbose_name = 'Commercial Dashboard Snapshot'
        verbose_name_plural = 'Commercial Dashboard Snapshots'

    def __str__(self):
        return f"{self.kpi.label} snapshot {self.snapshot_year}-{self.snapshot_month:02d}"
