from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from .constants import ASSIGNER_ROLES, READING_SCOPE_CHOICES, READER_ROLES, USER_ROLE_CHOICES


READING_METHOD_CHOICES = [
    ('MANUAL', 'Manual Reading'),
    ('AUTOMATED', 'Automated'),
    ('SCADA', 'SCADA/Automated'),
    ('ESTIMATED', 'Estimated'),
]


class WaterMeter(models.Model):
    """Canonical physical water meter shared across production and distribution."""

    OPERATIONAL_STATUS_CHOICES = [
        ('WORKING', 'Working'),
        ('FAULTY', 'Faulty'),
        ('OVER_REGISTERING', 'Over Registering'),
        ('NOT_REGISTERING', 'Not Registering'),
        ('NOT_FUNCTIONAL', 'Not Functional'),
        ('ESTIMATED', 'Estimated Readings Used'),
        ('UNKNOWN', 'Unknown'),
    ]

    meter_number = models.CharField(max_length=100, unique=True)
    display_name = models.CharField(max_length=200, blank=True)
    manufacturer = models.CharField(max_length=100, blank=True)
    model = models.CharField(max_length=100, blank=True)
    diameter_mm = models.IntegerField(null=True, blank=True)
    capacity = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Maximum reading capacity where available.',
    )
    operational_status = models.CharField(
        max_length=30,
        choices=OPERATIONAL_STATUS_CHOICES,
        default='WORKING',
        help_text='Inventory condition only. Balance calculations still use configured meter readings.',
    )
    operational_status_notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    installation_date = models.DateField()
    last_calibration_date = models.DateField(null=True, blank=True)
    next_calibration_date = models.DateField(null=True, blank=True)
    initial_reading = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['meter_number']
        verbose_name = 'Water Meter'
        verbose_name_plural = 'Water Meters'

    @property
    def display_label(self):
        if self.display_name:
            return f'{self.display_name} ({self.meter_number})'
        return self.meter_number

    def __str__(self):
        return self.display_label


class EnergyMeter(models.Model):
    """Canonical physical energy meter used for production power measurements."""

    ENERGY_KIND_CHOICES = [
        ('GRID', 'Grid Power'),
        ('SOLAR', 'Solar Power'),
    ]

    meter_number = models.CharField(max_length=100, unique=True)
    display_name = models.CharField(max_length=200, blank=True)
    energy_kind = models.CharField(max_length=20, choices=ENERGY_KIND_CHOICES)
    manufacturer = models.CharField(max_length=100, blank=True)
    model = models.CharField(max_length=100, blank=True)
    capacity = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Maximum reading capacity where available.',
    )
    is_active = models.BooleanField(default=True)
    installation_date = models.DateField()
    last_calibration_date = models.DateField(null=True, blank=True)
    next_calibration_date = models.DateField(null=True, blank=True)
    initial_reading = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['meter_number']
        verbose_name = 'Energy Meter'
        verbose_name_plural = 'Energy Meters'

    @property
    def display_label(self):
        if self.display_name:
            return f'{self.display_name} ({self.meter_number})'
        return self.meter_number

    def __str__(self):
        return self.display_label


class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='metering_profile',
    )
    role = models.CharField(max_length=30, choices=USER_ROLE_CHOICES)
    phone_number = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['user__username']
        verbose_name = 'User Profile'
        verbose_name_plural = 'User Profiles'

    def __str__(self):
        return f'{self.user.username} - {self.get_role_display()}'

    @property
    def can_assign_readings(self):
        return self.user.is_staff or self.user.is_superuser or self.role in ASSIGNER_ROLES

    @property
    def can_receive_reading_assignments(self):
        return self.role in READER_ROLES


class WaterMeterReading(models.Model):
    """Canonical once-per-day water meter reading."""

    water_meter = models.ForeignKey(WaterMeter, on_delete=models.CASCADE, related_name='readings')
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='submitted_water_meter_readings',
        null=True,
        blank=True,
    )
    reading_date = models.DateField()
    reading_time = models.TimeField(default=timezone.now)
    current_reading = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    previous_reading = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    consumption = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    read_by = models.CharField(max_length=200, blank=True)
    reading_method = models.CharField(max_length=50, choices=READING_METHOD_CHOICES, default='MANUAL')
    is_validated = models.BooleanField(default=False)
    is_anomaly = models.BooleanField(default=False)
    validated_by = models.CharField(max_length=200, blank=True)
    validated_at = models.DateTimeField(null=True, blank=True)
    legacy_production_meter_reading_id = models.PositiveIntegerField(unique=True, null=True, blank=True)
    legacy_distribution_meter_reading_id = models.PositiveIntegerField(unique=True, null=True, blank=True)
    mobile_external_id = models.UUIDField(unique=True, null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-reading_date', '-reading_time', 'water_meter__meter_number']
        unique_together = [['water_meter', 'reading_date']]
        indexes = [
            models.Index(fields=['water_meter', '-reading_date']),
            models.Index(fields=['reading_date']),
        ]
        verbose_name = 'Water Meter Reading'
        verbose_name_plural = 'Water Meter Readings'

    def __str__(self):
        return f'{self.water_meter.meter_number} - {self.reading_date}'

    def save(self, *args, **kwargs):
        if self.previous_reading is not None:
            self.consumption = self.current_reading - self.previous_reading
        super().save(*args, **kwargs)


class EnergyMeterReading(models.Model):
    """Canonical once-per-day energy meter reading."""

    energy_meter = models.ForeignKey(EnergyMeter, on_delete=models.CASCADE, related_name='readings')
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='submitted_energy_meter_readings',
        null=True,
        blank=True,
    )
    reading_date = models.DateField()
    reading_time = models.TimeField(default=timezone.now)
    current_reading = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    previous_reading = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    consumption = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    read_by = models.CharField(max_length=200, blank=True)
    reading_method = models.CharField(max_length=50, choices=READING_METHOD_CHOICES, default='MANUAL')
    is_validated = models.BooleanField(default=False)
    is_anomaly = models.BooleanField(default=False)
    validated_by = models.CharField(max_length=200, blank=True)
    validated_at = models.DateTimeField(null=True, blank=True)
    legacy_production_meter_reading_id = models.PositiveIntegerField(unique=True, null=True, blank=True)
    mobile_external_id = models.UUIDField(unique=True, null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-reading_date', '-reading_time', 'energy_meter__meter_number']
        unique_together = [['energy_meter', 'reading_date']]
        indexes = [
            models.Index(fields=['energy_meter', '-reading_date']),
            models.Index(fields=['reading_date']),
        ]
        verbose_name = 'Energy Meter Reading'
        verbose_name_plural = 'Energy Meter Readings'

    def __str__(self):
        return f'{self.energy_meter.meter_number} - {self.reading_date}'

    def save(self, *args, **kwargs):
        if self.previous_reading is not None:
            self.consumption = self.current_reading - self.previous_reading
        super().save(*args, **kwargs)


class ProductionWaterMeterAssignment(models.Model):
    """Shared water meter assignments to production sites and sources."""

    ROLE_CHOICES = [
        ('ABSTRACTION', 'Production / Abstraction'),
        ('SUPPLY', 'Supply / Output'),
    ]

    water_meter = models.ForeignKey(WaterMeter, on_delete=models.CASCADE, related_name='production_assignments')
    production_site = models.ForeignKey(
        'production.ProductionSite',
        on_delete=models.CASCADE,
        related_name='water_meter_assignments',
    )
    water_source = models.ForeignKey(
        'production.WaterSource',
        on_delete=models.SET_NULL,
        related_name='meter_assignments',
        null=True,
        blank=True,
    )
    assignment_role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    is_active = models.BooleanField(default=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    legacy_production_meter_id = models.PositiveIntegerField(unique=True, null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['production_site__name', 'assignment_role', 'water_meter__meter_number']
        unique_together = [['water_meter', 'production_site', 'water_source', 'assignment_role']]
        verbose_name = 'Production Water Meter Assignment'
        verbose_name_plural = 'Production Water Meter Assignments'

    def __str__(self):
        return f'{self.production_site.code} - {self.assignment_role} - {self.water_meter.meter_number}'


class ProductionEnergyMeterAssignment(models.Model):
    """Shared energy meter assignments to production sites."""

    ROLE_CHOICES = [
        ('GRID', 'Grid Power'),
        ('SOLAR', 'Solar Power'),
    ]

    energy_meter = models.ForeignKey(EnergyMeter, on_delete=models.CASCADE, related_name='production_assignments')
    production_site = models.ForeignKey(
        'production.ProductionSite',
        on_delete=models.CASCADE,
        related_name='energy_meter_assignments',
    )
    assignment_role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    is_active = models.BooleanField(default=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    legacy_production_meter_id = models.PositiveIntegerField(unique=True, null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['production_site__name', 'assignment_role', 'energy_meter__meter_number']
        unique_together = [['energy_meter', 'production_site', 'assignment_role']]
        verbose_name = 'Production Energy Meter Assignment'
        verbose_name_plural = 'Production Energy Meter Assignments'

    def __str__(self):
        return f'{self.production_site.code} - {self.assignment_role} - {self.energy_meter.meter_number}'


class DistributionWaterMeterAssignment(models.Model):
    """Shared water meter assignments into the distribution network."""

    ROLE_CHOICES = [
        ('ZONE_INLET', 'Zone Inlet'),
        ('DMA_INLET', 'DMA Inlet'),
        ('BULK_SUPPLY', 'Bulk Supply Point'),
        ('TRANSMISSION', 'Transmission Line'),
    ]

    water_meter = models.ForeignKey(WaterMeter, on_delete=models.CASCADE, related_name='distribution_assignments')
    zone = models.ForeignKey(
        'distribution.Zone',
        on_delete=models.CASCADE,
        related_name='water_meter_assignments',
        null=True,
        blank=True,
    )
    dma = models.ForeignKey(
        'distribution.DMA',
        on_delete=models.CASCADE,
        related_name='water_meter_assignments',
        null=True,
        blank=True,
    )
    assignment_role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    allocation_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=100,
        validators=[MinValueValidator(-100), MaxValueValidator(100)],
        help_text='Signed contribution factor when one physical meter is shared or subtracted from a zone total.',
    )
    is_active = models.BooleanField(default=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    legacy_distribution_meter_id = models.PositiveIntegerField(unique=True, null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['zone__name', 'dma__name', 'water_meter__meter_number']
        verbose_name = 'Distribution Water Meter Assignment'
        verbose_name_plural = 'Distribution Water Meter Assignments'

    def __str__(self):
        location = self.dma.code if self.dma_id else (self.zone.code if self.zone_id else 'UNASSIGNED')
        return f'{location} - {self.assignment_role} - {self.water_meter.meter_number}'

    def clean(self):
        errors = {}

        if self.assignment_role == 'DMA_INLET' and not self.dma_id:
            errors['dma'] = 'DMA inlet assignments must reference a DMA.'
        if self.assignment_role in {'ZONE_INLET', 'BULK_SUPPLY', 'TRANSMISSION'} and not (self.zone_id or self.dma_id):
            errors['zone'] = 'This assignment must reference a zone or a DMA.'
        if self.dma_id and self.zone_id and self.dma.zone_id != self.zone_id:
            errors['dma'] = 'DMA must belong to the selected zone.'

        if errors:
            raise ValidationError(errors)

    @property
    def resolved_zone_id(self):
        if self.zone_id:
            return self.zone_id
        if self.dma_id:
            return self.dma.zone_id
        return None


class MeterReadingAssignment(models.Model):
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='meter_reading_assignments',
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='meter_reading_assignments_created',
    )
    approval_delegate = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='meter_reading_approval_delegations',
        null=True,
        blank=True,
    )
    scope_type = models.CharField(max_length=20, choices=READING_SCOPE_CHOICES)
    production_site = models.ForeignKey(
        'production.ProductionSite',
        on_delete=models.CASCADE,
        related_name='meter_reading_assignments',
        null=True,
        blank=True,
    )
    zone = models.ForeignKey(
        'distribution.Zone',
        on_delete=models.CASCADE,
        related_name='meter_reading_assignments',
        null=True,
        blank=True,
    )
    water_meter = models.ForeignKey(
        WaterMeter,
        on_delete=models.CASCADE,
        related_name='meter_reading_assignments',
        null=True,
        blank=True,
    )
    energy_meter = models.ForeignKey(
        EnergyMeter,
        on_delete=models.CASCADE,
        related_name='meter_reading_assignments',
        null=True,
        blank=True,
    )
    is_active = models.BooleanField(default=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['assignee__username', 'scope_type', 'production_site__name', 'zone__name']
        indexes = [
            models.Index(fields=['assignee', 'is_active']),
            models.Index(fields=['scope_type', 'is_active']),
            models.Index(fields=['water_meter', 'is_active']),
            models.Index(fields=['energy_meter', 'is_active']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['assignee', 'production_site', 'water_meter'],
                condition=models.Q(scope_type='PRODUCTION_SITE', water_meter__isnull=False),
                name='unique_user_production_water_reading_assignment',
            ),
            models.UniqueConstraint(
                fields=['assignee', 'production_site', 'energy_meter'],
                condition=models.Q(scope_type='PRODUCTION_SITE', energy_meter__isnull=False),
                name='unique_user_production_energy_reading_assignment',
            ),
            models.UniqueConstraint(
                fields=['assignee', 'zone', 'water_meter'],
                condition=models.Q(scope_type='ZONE', water_meter__isnull=False),
                name='unique_user_zone_water_reading_assignment',
            ),
        ]
        verbose_name = 'Meter Reading Assignment'
        verbose_name_plural = 'Meter Reading Assignments'

    def __str__(self):
        if self.scope_type == 'PRODUCTION_SITE' and self.production_site_id:
            area = self.production_site.name
        elif self.zone_id:
            area = self.zone.name
        else:
            area = 'Unassigned Area'
        meter = self.water_meter or self.energy_meter
        return f'{self.assignee.username} - {area} - {meter}'

    def clean(self):
        errors = {}

        if not self.assignee_id:
            errors['assignee'] = 'An assignee is required.'
        if not self.assigned_by_id:
            errors['assigned_by'] = 'An assigning user is required.'

        assignee_profile = getattr(self.assignee, 'metering_profile', None) if self.assignee_id else None
        assigner_profile = getattr(self.assigned_by, 'metering_profile', None) if self.assigned_by_id else None
        delegate_profile = getattr(self.approval_delegate, 'metering_profile', None) if self.approval_delegate_id else None

        if self.assignee_id and assignee_profile is None:
            errors['assignee'] = 'The assignee must have a user profile with a meter-reading role.'
        elif assignee_profile and assignee_profile.role not in READER_ROLES:
            errors['assignee'] = 'Only Pump Operators and Plumbers can receive meter-reading assignments.'

        if self.assigned_by_id and not (self.assigned_by.is_staff or self.assigned_by.is_superuser):
            if assigner_profile is None:
                errors['assigned_by'] = 'The assigning user must have a user profile with a supervisor role.'
            elif assigner_profile.role not in ASSIGNER_ROLES:
                errors['assigned_by'] = 'Only Production Supervisors and Zonal Officers can assign meter readings.'

        if self.approval_delegate_id and not (self.approval_delegate.is_staff or self.approval_delegate.is_superuser):
            if delegate_profile is None:
                errors['approval_delegate'] = 'The approval delegate must have a user profile with a supervisor role.'
            elif delegate_profile.role not in ASSIGNER_ROLES:
                errors['approval_delegate'] = 'Only admins, Production Supervisors and Zonal Officers can approve delegated readings.'

        if bool(self.water_meter_id) == bool(self.energy_meter_id):
            errors['water_meter'] = 'Select exactly one meter for a reading assignment.'

        if self.start_date and self.end_date and self.end_date < self.start_date:
            errors['end_date'] = 'End date cannot be earlier than start date.'
        if not self.start_date:
            errors['start_date'] = 'Start date is required for meter-reading assignments.'
        if not self.end_date:
            errors['end_date'] = 'End date is required for meter-reading assignments.'

        if self.scope_type == 'PRODUCTION_SITE':
            if not self.production_site_id or self.zone_id:
                errors['production_site'] = 'Production-site assignments must reference only a production site.'

            if assigner_profile and assigner_profile.role == 'ZONAL_OFFICER':
                errors['scope_type'] = 'Zonal Officers can only assign meters by zone.'

            if self.water_meter_id and self.production_site_id:
                exists = ProductionWaterMeterAssignment.objects.filter(
                    water_meter_id=self.water_meter_id,
                    production_site_id=self.production_site_id,
                    is_active=True,
                ).exists()
                if not exists:
                    errors['water_meter'] = 'Selected water meter is not actively mapped to this production site.'

            if self.energy_meter_id and self.production_site_id:
                exists = ProductionEnergyMeterAssignment.objects.filter(
                    energy_meter_id=self.energy_meter_id,
                    production_site_id=self.production_site_id,
                    is_active=True,
                ).exists()
                if not exists:
                    errors['energy_meter'] = 'Selected energy meter is not actively mapped to this production site.'

        if self.scope_type == 'ZONE':
            if not self.zone_id or self.production_site_id:
                errors['zone'] = 'Zone assignments must reference only a zone.'

            if assigner_profile and assigner_profile.role == 'PRODUCTION_SUPERVISOR':
                errors['scope_type'] = 'Production Supervisors can only assign meters by production site.'

            if self.energy_meter_id:
                errors['energy_meter'] = 'Energy meters cannot be assigned by zone.'

            if self.water_meter_id and self.zone_id:
                exists = DistributionWaterMeterAssignment.objects.filter(
                    water_meter_id=self.water_meter_id,
                    is_active=True,
                ).filter(
                    models.Q(zone_id=self.zone_id) | models.Q(dma__zone_id=self.zone_id)
                ).exists()
                if not exists:
                    errors['water_meter'] = 'Selected water meter is not actively mapped to this zone.'

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
