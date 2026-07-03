from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class Incident(models.Model):
    class IncidentType(models.TextChoices):
        PRODUCTION = 'production', 'Production'
        DISTRIBUTION = 'distribution', 'Distribution'

    class Priority(models.TextChoices):
        LOW = 'low', 'Low'
        MEDIUM = 'medium', 'Medium'
        HIGH = 'high', 'High'
        CRITICAL = 'critical', 'Critical'

    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        IN_PROGRESS = 'in-progress', 'In Progress'
        RESOLVED = 'resolved', 'Resolved'

    incident_type = models.CharField(max_length=20, choices=IncidentType.choices)
    category = models.CharField(max_length=100)
    description = models.TextField()
    location = models.CharField(max_length=255)

    production_site = models.ForeignKey(
        'production.ProductionSite',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='incidents',
    )
    zone = models.ForeignKey(
        'distribution.Zone',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='incidents',
    )

    reported_by = models.CharField(max_length=150)
    reported_at = models.DateTimeField(default=timezone.now)
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)

    assigned_to_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_incidents',
    )
    assigned_to = models.CharField(max_length=150, blank=True)
    resolved_by = models.CharField(max_length=150, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True)
    estimated_impact_m3 = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    customer_notifications_sent = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    mobile_external_id = models.UUIDField(unique=True, null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_incidents',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_incidents',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-reported_at', '-created_at']
        indexes = [
            models.Index(fields=['incident_type', 'status']),
            models.Index(fields=['priority', 'status']),
            models.Index(fields=['reported_at']),
            models.Index(fields=['zone', 'status']),
            models.Index(fields=['production_site', 'status']),
        ]

    def __str__(self):
        return f"{self.get_incident_type_display()} - {self.category} - {self.status}"

    def clean(self):
        if self.incident_type == self.IncidentType.PRODUCTION and self.zone_id:
            raise ValidationError({'zone': 'Distribution zone can only be linked to distribution incidents.'})
        if self.incident_type == self.IncidentType.DISTRIBUTION and self.production_site_id:
            raise ValidationError({'production_site': 'Production site can only be linked to production incidents.'})
        if self.status == self.Status.RESOLVED and not self.resolved_at:
            self.resolved_at = timezone.now()
        if self.status != self.Status.RESOLVED:
            self.resolved_at = None

    def save(self, *args, **kwargs):
        if self.assigned_to_user_id:
            self.assigned_to = self.assigned_to_user.get_username()
        self.full_clean()
        super().save(*args, **kwargs)


class IncidentComment(models.Model):
    incident = models.ForeignKey(
        Incident,
        on_delete=models.CASCADE,
        related_name='comments',
    )
    comment = models.TextField()
    status_from = models.CharField(max_length=20, blank=True)
    status_to = models.CharField(max_length=20, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='incident_comments',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    mobile_external_id = models.UUIDField(unique=True, null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.incident_id} - {self.created_at:%Y-%m-%d %H:%M}"

