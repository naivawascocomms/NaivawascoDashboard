# production/models.py

from calendar import monthrange
from datetime import date
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
from decimal import Decimal


class Region(models.Model):
    """Geographic regions for production sites"""
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class ProductionCostConfig(models.Model):
    """User-editable production cost configuration used for automated cost rollups."""
    name = models.CharField(max_length=100, default='Default Production Cost Config')
    grid_power_cost_per_kwh = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Tariff applied to grid power consumption."
    )
    solar_power_cost_per_kwh = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Tariff applied to solar power consumption."
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_active', '-updated_at']
        verbose_name = 'Production Cost Configuration'
        verbose_name_plural = 'Production Cost Configurations'

    def __str__(self):
        return self.name

    @classmethod
    def get_active(cls):
        return cls.objects.filter(is_active=True).order_by('-updated_at', '-id').first()


class ProductionSite(models.Model):
    """Water production sites"""
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=50, unique=True)
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name='production_sites')
    
    # Site characteristics
    site_type = models.CharField(
        max_length=50,
        choices=[
            ('BOREHOLE', 'Borehole'),
            ('SURFACE', 'Surface Water'),
            ('TREATMENT', 'Treatment Plant'),
            ('MIXED', 'Mixed Source')
        ],
        default='BOREHOLE'
    )
    production_equals_supply = models.BooleanField(
        default=False,
        help_text=(
            "Enable when the same production or borehole meter reading should also be treated "
            "as the site's supply volume."
        ),
    )
    
    # Solar power configuration
    has_solar = models.BooleanField(default=False)
    solar_capacity_kwh = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="Solar power generation capacity"
    )
    
    # Operational status
    is_active = models.BooleanField(default=True)
    commissioned_date = models.DateField(null=True, blank=True)
    
    # Location
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    
    # Metadata
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['region', 'is_active']),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"


class WaterSource(models.Model):
    """Individual water sources (boreholes) at a production site"""
    production_site = models.ForeignKey(
        ProductionSite, 
        on_delete=models.CASCADE, 
        related_name='water_sources'
    )
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=50)
    
    source_type = models.CharField(
        max_length=50,
        choices=[
            ('BOREHOLE', 'Borehole'),
            ('WELL', 'Well'),
            ('SPRING', 'Spring'),
            ('SURFACE', 'Surface Water Intake')
        ],
        default='BOREHOLE'
    )
    
    # Borehole specifications
    depth_meters = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True
    )
    yield_m3_per_hour = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="Expected yield in cubic meters per hour"
    )
    
    # Status
    is_active = models.BooleanField(default=True)
    commissioned_date = models.DateField(null=True, blank=True)
    last_maintenance_date = models.DateField(null=True, blank=True)
    
    # Metadata
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['production_site', 'name']
        unique_together = [['production_site', 'code']]
        indexes = [
            models.Index(fields=['production_site', 'is_active']),
        ]

    def __str__(self):
        return f"{self.production_site.code} - {self.name}"


class Meter(models.Model):
    """Water and power meters"""
    METER_TYPE_CHOICES = [
        ('WATER', 'Water Meter'),
        ('POWER_GRID', 'Grid Power Meter'),
        ('POWER_SOLAR', 'Solar Power Meter'),
        ('SUPPLY', 'Supply/Output Meter'),
    ]
    
    water_source = models.ForeignKey(
        WaterSource, 
        on_delete=models.CASCADE, 
        related_name='meters',
        null=True,
        blank=True,
        help_text="For water meters - link to specific water source"
    )
    production_site = models.ForeignKey(
        ProductionSite,
        on_delete=models.CASCADE,
        related_name='meters',
        help_text="For power meters - link to production site"
    )
    
    meter_type = models.CharField(max_length=20, choices=METER_TYPE_CHOICES)
    meter_number = models.CharField(max_length=100, unique=True)
    
    # Meter specifications
    manufacturer = models.CharField(max_length=100, blank=True)
    model = models.CharField(max_length=100, blank=True)
    capacity = models.DecimalField(
        max_digits=15, 
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Maximum reading capacity"
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
        default=0,
        help_text="Initial meter reading at installation"
    )
    
    # Metadata
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['production_site', 'meter_type', 'meter_number']
        indexes = [
            models.Index(fields=['meter_number']),
            models.Index(fields=['production_site', 'meter_type', 'is_active']),
        ]

    def __str__(self):
        return f"{self.get_meter_type_display()} - {self.meter_number}"

    def clean(self):
        from django.core.exceptions import ValidationError
        # Water meters must have a water source
        if self.meter_type == 'WATER' and not self.water_source:
            raise ValidationError("Water meters must be linked to a water source")
        # Power and supply meters should not have a water source
        if self.meter_type in ['POWER_GRID', 'POWER_SOLAR', 'SUPPLY'] and self.water_source:
            raise ValidationError("Power/supply meters should not be linked to a water source")


class MeterReading(models.Model):
    """Individual meter readings"""
    meter = models.ForeignKey(Meter, on_delete=models.SET_NULL, null=True, blank=True, related_name='readings')
    reading_date = models.DateField()
    reading_time = models.TimeField(default=timezone.now)
    
    # Reading value
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
    consumption = models.DecimalField(
        max_digits=15, 
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Calculated consumption (current - previous)"
    )
    
    # Reading details
    read_by = models.CharField(max_length=200, blank=True)
    reading_method = models.CharField(
        max_length=50,
        choices=[
            ('MANUAL', 'Manual Reading'),
            ('AUTOMATED', 'Automated/SCADA'),
            ('ESTIMATED', 'Estimated')
        ],
        default='MANUAL'
    )
    
    # Quality flags
    is_validated = models.BooleanField(default=False)
    is_anomaly = models.BooleanField(
        default=False,
        help_text="Flag for unusual readings"
    )
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
            models.Index(fields=['is_validated', 'is_anomaly']),
        ]

    def __str__(self):
        return f"{self.meter.meter_number} - {self.reading_date}"

    def save(self, *args, **kwargs):
        # Calculate consumption if previous reading is available
        if self.previous_reading is not None:
            self.consumption = self.current_reading - self.previous_reading
        super().save(*args, **kwargs)


class ProductionTarget(models.Model):
    """Monthly production targets for each site"""
    production_site = models.ForeignKey(
        ProductionSite, 
        on_delete=models.CASCADE, 
        related_name='targets'
    )
    year = models.IntegerField()
    month = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])
    
    # Water production targets
    water_abstraction_target_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )
    water_supply_target_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Target water volume supplied (abstracted minus production loss)"
    )
    production_loss_target_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    production_loss_target_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    
    # Power consumption targets
    power_grid_target_kwh = models.DecimalField(
        max_digits=15, 
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    power_solar_target_kwh = models.DecimalField(
        max_digits=15, 
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)]
    )
    
    # Efficiency targets
    power_efficiency_target_kwh_per_m3 = models.DecimalField(
        max_digits=10, 
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Target power consumption per cubic meter"
    )
    
    # Cost targets
    power_cost_per_m3_target = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        null=True,
        blank=True
    )
    power_cost_per_kwh_target = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        null=True,
        blank=True
    )
    
    # Water quality targets
    chemical_tests_target = models.IntegerField(default=0)
    biological_tests_target = models.IntegerField(default=0)
    consumer_chemical_tests_target = models.IntegerField(default=0)
    consumer_biological_tests_target = models.IntegerField(default=0)
    
    # Metadata
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-year', '-month', 'production_site']
        unique_together = [['production_site', 'year', 'month']]
        indexes = [
            models.Index(fields=['production_site', 'year', 'month']),
            models.Index(fields=['year', 'month']),
        ]

    def __str__(self):
        return f"{self.production_site.code} - {self.year}-{self.month:02d}"

    def save(self, *args, **kwargs):
        # Auto-compute water supply target
        self.water_supply_target_m3 = self.water_abstraction_target_m3 - self.production_loss_target_m3
        # Auto-compute production loss percentage
        if self.water_abstraction_target_m3 > 0:
            self.production_loss_target_percent = (
                self.production_loss_target_m3 / self.water_abstraction_target_m3
            ) * 100
        # Auto-compute efficiency target
        total_power = self.power_grid_target_kwh + self.power_solar_target_kwh
        if self.water_abstraction_target_m3 > 0 and total_power > 0:
            self.power_efficiency_target_kwh_per_m3 = (
                total_power / self.water_abstraction_target_m3
            )
        super().save(*args, **kwargs)

    @property
    def total_power_target_kwh(self):
        return self.power_grid_target_kwh + self.power_solar_target_kwh

    @property
    def solar_percentage_target(self):
        total = self.total_power_target_kwh
        if total > 0:
            return (self.power_solar_target_kwh / total) * 100
        return 0


class DailyProduction(models.Model):
    """Daily production actuals aggregated from meter readings"""
    production_site = models.ForeignKey(
        ProductionSite, 
        on_delete=models.CASCADE, 
        related_name='daily_production'
    )
    production_date = models.DateField()
    
    # Water production
    water_abstracted_m3 = models.DecimalField(
        max_digits=15, 
        decimal_places=2,
        default=0,
        help_text="Total water abstracted from all sources"
    )
    water_supplied_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        help_text="Total water supplied from site output meters"
    )
    water_received_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        help_text="Water received from another production site; derived for Water Works"
    )
    production_loss_m3 = models.DecimalField(
        max_digits=15, 
        decimal_places=2,
        default=0,
        help_text="Water lost during production/treatment"
    )
    water_available_for_sale_m3 = models.DecimalField(
        max_digits=15, 
        decimal_places=2,
        default=0,
        help_text="Water abstracted minus production loss"
    )
    
    # Power consumption
    power_grid_kwh = models.DecimalField(
        max_digits=15, 
        decimal_places=2,
        default=0
    )
    power_solar_kwh = models.DecimalField(
        max_digits=15, 
        decimal_places=2,
        default=0
    )
    total_power_kwh = models.DecimalField(
        max_digits=15, 
        decimal_places=2,
        default=0
    )
    
    # Calculated KPIs
    power_efficiency_kwh_per_m3 = models.DecimalField(
        max_digits=10, 
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Total power / water abstracted"
    )
    solar_percentage = models.DecimalField(
        max_digits=5, 
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Percentage of power from solar"
    )
    production_loss_percentage = models.DecimalField(
        max_digits=5, 
        decimal_places=2,
        null=True,
        blank=True
    )
    
    # Data quality
    is_complete = models.BooleanField(
        default=False,
        help_text="All meter readings captured for this day"
    )
    is_validated = models.BooleanField(default=False)
    
    # Metadata
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-production_date', 'production_site']
        unique_together = [['production_site', 'production_date']]
        indexes = [
            models.Index(fields=['production_site', '-production_date']),
            models.Index(fields=['production_date']),
            models.Index(fields=['is_validated']),
        ]
        verbose_name_plural = "Daily production records"

    def __str__(self):
        return f"{self.production_site.code} - {self.production_date}"

    def save(self, *args, **kwargs):
        update_fields = kwargs.get('update_fields')

        if self.production_site_id and self.production_site.production_equals_supply:
            self.water_supplied_m3 = self.water_abstracted_m3
            self.production_loss_m3 = Decimal('0')

        # Calculate derived fields
        if self.production_site_id and self.production_site.code == 'WWS':
            derived_received = self.water_supplied_m3 - self.water_abstracted_m3
            self.water_received_m3 = derived_received if derived_received > 0 else Decimal('0')
        elif self.water_received_m3 is None:
            self.water_received_m3 = Decimal('0')

        if self.water_supplied_m3 and self.water_supplied_m3 > 0:
            self.water_available_for_sale_m3 = self.water_supplied_m3
        else:
            self.water_available_for_sale_m3 = (
                self.water_abstracted_m3 + self.water_received_m3 - self.production_loss_m3
            )
        self.total_power_kwh = self.power_grid_kwh + self.power_solar_kwh

        total_water_input = self.water_abstracted_m3 + self.water_received_m3
        if total_water_input > 0:
            self.power_efficiency_kwh_per_m3 = self.total_power_kwh / total_water_input
            self.production_loss_percentage = (self.production_loss_m3 / total_water_input) * 100
        else:
            self.power_efficiency_kwh_per_m3 = None
            self.production_loss_percentage = None
        
        if self.total_power_kwh > 0:
            self.solar_percentage = (self.power_solar_kwh / self.total_power_kwh) * 100
        else:
            self.solar_percentage = None

        if update_fields is not None:
            kwargs['update_fields'] = set(update_fields) | {
                'water_received_m3',
                'water_available_for_sale_m3',
                'total_power_kwh',
                'power_efficiency_kwh_per_m3',
                'production_loss_percentage',
                'solar_percentage',
            }
        
        super().save(*args, **kwargs)


class MonthlyProduction(models.Model):
    """Monthly production summary and KPIs"""
    production_site = models.ForeignKey(
        ProductionSite, 
        on_delete=models.CASCADE, 
        related_name='monthly_production'
    )
    year = models.IntegerField()
    month = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])
    
    # Calendar month boundaries (derived from year/month)
    start_date = models.DateField(
        null=True,
        blank=True,
        help_text="Calendar month start date for this period"
    )
    closing_date = models.DateField(
        null=True, 
        blank=True,
        help_text="Calendar month end date for this period"
    )
    
    # Water production actuals
    water_abstracted_m3 = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    water_supplied_m3 = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    water_received_m3 = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        help_text="Water received from another production site; derived for Water Works"
    )
    production_loss_m3 = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    water_available_for_sale_m3 = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    # Power consumption actuals
    power_grid_kwh = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    power_solar_kwh = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_power_kwh = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    # Efficiency KPIs
    power_efficiency_kwh_per_m3 = models.DecimalField(
        max_digits=10, 
        decimal_places=4,
        null=True,
        blank=True
    )
    solar_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    production_loss_percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    
    # Cost actuals
    power_costs = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    repair_maintenance_costs = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    abstraction_fee = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    chemical_costs = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_direct_costs = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    # Cost per unit
    power_cost_per_m3 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    power_cost_per_kwh = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    total_cost_per_m3 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    
    # Water quality actuals
    chemical_tests_production = models.IntegerField(default=0)
    biological_tests_production = models.IntegerField(default=0)
    chemical_tests_consumer = models.IntegerField(default=0)
    biological_tests_consumer = models.IntegerField(default=0)
    
    # Compliance percentages
    who_compliance_chemical_production = models.DecimalField(
        max_digits=5, 
        decimal_places=2,
        default=100,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    who_compliance_biological_production = models.DecimalField(
        max_digits=5, 
        decimal_places=2,
        default=100,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    who_compliance_chemical_consumer = models.DecimalField(
        max_digits=5, 
        decimal_places=2,
        default=100,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    who_compliance_biological_consumer = models.DecimalField(
        max_digits=5, 
        decimal_places=2,
        default=100,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    
    # Performance vs target
    target = models.ForeignKey(
        ProductionTarget,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='actuals'
    )
    water_abstraction_realization_percent = models.DecimalField(
        max_digits=5, 
        decimal_places=2,
        null=True,
        blank=True
    )
    
    # Status
    is_finalized = models.BooleanField(
        default=False,
        help_text="Month is closed and figures are final"
    )
    finalized_by = models.CharField(max_length=200, blank=True)
    finalized_at = models.DateTimeField(null=True, blank=True)
    
    # Metadata
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-year', '-month', 'production_site']
        unique_together = [['production_site', 'year', 'month']]
        indexes = [
            models.Index(fields=['production_site', 'year', 'month']),
            models.Index(fields=['year', 'month']),
            models.Index(fields=['is_finalized']),
        ]
        verbose_name_plural = "Monthly production records"

    def __str__(self):
        return f"{self.production_site.code} - {self.year}-{self.month:02d}"

    def save(self, *args, **kwargs):
        update_fields = kwargs.get('update_fields')
        month_end = date(self.year, self.month, monthrange(self.year, self.month)[1])
        self.start_date = date(self.year, self.month, 1)
        self.closing_date = month_end

        if self.production_site_id and self.production_site.production_equals_supply:
            self.water_supplied_m3 = self.water_abstracted_m3
            self.production_loss_m3 = Decimal('0')

        # Calculate derived fields
        if self.production_site_id and self.production_site.code == 'WWS':
            derived_received = self.water_supplied_m3 - self.water_abstracted_m3
            self.water_received_m3 = derived_received if derived_received > 0 else Decimal('0')
        elif self.water_received_m3 is None:
            self.water_received_m3 = Decimal('0')

        if self.water_supplied_m3 and self.water_supplied_m3 > 0:
            self.water_available_for_sale_m3 = self.water_supplied_m3
        else:
            self.water_available_for_sale_m3 = (
                self.water_abstracted_m3 + self.water_received_m3 - self.production_loss_m3
            )
        self.total_power_kwh = self.power_grid_kwh + self.power_solar_kwh
        self.total_direct_costs = (
            self.power_costs + 
            self.repair_maintenance_costs + 
            self.abstraction_fee + 
            self.chemical_costs
        )

        total_water_input = self.water_abstracted_m3 + self.water_received_m3
        active_cost_config = ProductionCostConfig.get_active()
        grid_rate = active_cost_config.grid_power_cost_per_kwh if active_cost_config else Decimal('0')
        solar_rate = active_cost_config.solar_power_cost_per_kwh if active_cost_config else Decimal('0')
        self.power_costs = (
            self.power_grid_kwh * grid_rate +
            self.power_solar_kwh * solar_rate
        )
        if total_water_input > 0:
            self.power_efficiency_kwh_per_m3 = self.total_power_kwh / total_water_input
            self.production_loss_percentage = (self.production_loss_m3 / total_water_input) * 100
            self.power_cost_per_m3 = self.power_costs / total_water_input
            self.total_cost_per_m3 = self.total_direct_costs / total_water_input
        else:
            self.power_efficiency_kwh_per_m3 = None
            self.production_loss_percentage = None
            self.power_cost_per_m3 = None
            self.total_cost_per_m3 = None
        
        if self.total_power_kwh > 0:
            self.solar_percentage = (self.power_solar_kwh / self.total_power_kwh) * 100
            self.power_cost_per_kwh = self.power_costs / self.total_power_kwh
        else:
            self.solar_percentage = None
            self.power_cost_per_kwh = None
        
        # Calculate realization percentage if target exists
        if self.target and self.target.water_abstraction_target_m3 > 0:
            self.water_abstraction_realization_percent = (
                self.water_abstracted_m3 / self.target.water_abstraction_target_m3
            ) * 100
        elif not self.target:
            self.water_abstraction_realization_percent = None

        if update_fields is not None:
            kwargs['update_fields'] = set(update_fields) | {
                'water_received_m3',
                'start_date',
                'closing_date',
                'water_available_for_sale_m3',
                'total_power_kwh',
                'power_costs',
                'total_direct_costs',
                'power_efficiency_kwh_per_m3',
                'production_loss_percentage',
                'power_cost_per_m3',
                'power_cost_per_kwh',
                'total_cost_per_m3',
                'solar_percentage',
                'water_abstraction_realization_percent',
            }
        
        super().save(*args, **kwargs)


class WaterQualityTest(models.Model):
    """Water quality test results"""
    TEST_TYPE_CHOICES = [
        ('CHEMICAL', 'Chemical'),
        ('BIOLOGICAL', 'Biological'),
        ('PHYSICAL', 'Physical'),
    ]
    
    TEST_LOCATION_CHOICES = [
        ('PRODUCTION', 'Production Point'),
        ('CONSUMER', 'Consumer Point'),
    ]
    
    production_site = models.ForeignKey(
        ProductionSite, 
        on_delete=models.CASCADE, 
        related_name='quality_tests'
    )
    test_date = models.DateField()
    test_type = models.CharField(max_length=20, choices=TEST_TYPE_CHOICES)
    test_location = models.CharField(max_length=20, choices=TEST_LOCATION_CHOICES)
    
    # Test details
    parameter_tested = models.CharField(max_length=200)
    test_result = models.DecimalField(max_digits=15, decimal_places=4)
    unit_of_measure = models.CharField(max_length=50)
    who_standard = models.DecimalField(
        max_digits=15, 
        decimal_places=4,
        null=True,
        blank=True,
        help_text="WHO standard limit for this parameter"
    )
    
    # Compliance
    is_compliant = models.BooleanField(
        default=True,
        help_text="Meets WHO standards"
    )
    
    # Testing details
    tested_by = models.CharField(max_length=200, blank=True)
    lab_reference = models.CharField(max_length=100, blank=True)
    
    # Metadata
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-test_date', 'production_site']
        indexes = [
            models.Index(fields=['production_site', '-test_date']),
            models.Index(fields=['test_date', 'test_type', 'test_location']),
            models.Index(fields=['is_compliant']),
        ]

    def __str__(self):
        return f"{self.production_site.code} - {self.parameter_tested} - {self.test_date}"


class CompanyMonthlySummary(models.Model):
    """Company-level monthly production summary — costs, water quality, and regional billing dates.

    Per-site production data lives in MonthlyProduction; this model captures
    data that only exists at the company/aggregate level in the utility's
    dashboard (sections 17–20 of the Excel reporting workbook).
    """
    year = models.IntegerField()
    month = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])

    # ── Section 19: Cost targets (budget) ────────────────────────────
    target_power_costs = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    target_repair_maintenance_costs = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    target_abstraction_fee = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    target_chemical_costs = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    target_total_direct_costs = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    target_power_cost_per_m3 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    target_power_cost_per_kwh = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    target_total_cost_per_m3 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # ── Section 19: Cost actuals ─────────────────────────────────────
    power_costs = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    repair_maintenance_costs = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    abstraction_fee = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    chemical_costs = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_direct_costs = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    power_cost_per_m3 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    power_cost_per_kwh = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    total_cost_per_m3 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # ── Section 17: Regional billing period dates ────────────────────
    central_opening_date = models.DateField(null=True, blank=True)
    central_closing_date = models.DateField(null=True, blank=True)
    central_production_loss_m3 = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    central_available_for_sale_m3 = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    southern_opening_date = models.DateField(null=True, blank=True)
    southern_closing_date = models.DateField(null=True, blank=True)
    southern_production_loss_m3 = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    southern_available_for_sale_m3 = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    eastern_opening_date = models.DateField(null=True, blank=True)
    eastern_closing_date = models.DateField(null=True, blank=True)
    eastern_production_loss_m3 = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    eastern_available_for_sale_m3 = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    # ── Section 20: Water quality targets (budget) ───────────────────
    target_chemical_tests_production = models.IntegerField(default=0)
    target_biological_tests_production = models.IntegerField(default=0)
    target_chemical_tests_consumer = models.IntegerField(default=0)
    target_biological_tests_consumer = models.IntegerField(default=0)

    # ── Section 20: Water quality actuals ────────────────────────────
    chemical_tests_production = models.IntegerField(default=0)
    biological_tests_production = models.IntegerField(default=0)
    chemical_tests_consumer = models.IntegerField(default=0)
    biological_tests_consumer = models.IntegerField(default=0)

    # ── Section 20: WHO compliance (%) ───────────────────────────────
    who_compliance_chemical_production = models.DecimalField(
        max_digits=5, decimal_places=2, default=100,
        validators=[MinValueValidator(0)]
    )
    who_compliance_biological_production = models.DecimalField(
        max_digits=5, decimal_places=2, default=100,
        validators=[MinValueValidator(0)]
    )
    who_compliance_chemical_consumer = models.DecimalField(
        max_digits=5, decimal_places=2, default=100,
        validators=[MinValueValidator(0)]
    )
    who_compliance_biological_consumer = models.DecimalField(
        max_digits=5, decimal_places=2, default=100,
        validators=[MinValueValidator(0)]
    )

    # ── Metadata ─────────────────────────────────────────────────────
    is_finalized = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-year', '-month']
        unique_together = [['year', 'month']]
        indexes = [
            models.Index(fields=['year', 'month']),
        ]
        verbose_name = "Company monthly summary"
        verbose_name_plural = "Company monthly summaries"

    def __str__(self):
        return f"Company Summary {self.year}-{self.month:02d}"

    def save(self, *args, **kwargs):
        self.target_total_direct_costs = (
            self.target_power_costs + self.target_repair_maintenance_costs
            + self.target_abstraction_fee + self.target_chemical_costs
        )
        self.total_direct_costs = (
            self.power_costs + self.repair_maintenance_costs
            + self.abstraction_fee + self.chemical_costs
        )
        super().save(*args, **kwargs)
