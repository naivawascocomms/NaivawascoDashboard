from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


class Visibility(models.TextChoices):
    INTERNAL = 'internal', 'Projects team only'
    MANAGEMENT = 'management', 'Management detail'
    REPORT = 'report', 'Monthly report'


class Project(models.Model):
    class ProjectType(models.TextChoices):
        WATER_SUPPLY = 'water_supply', 'Water Supply'
        SEWER = 'sewer', 'Sewer'
        SOLAR = 'solar', 'Solar'
        SANITATION = 'sanitation', 'Sanitation'
        CIVIL_WORKS = 'civil_works', 'Civil Works'
        MIXED = 'mixed', 'Mixed'
        OTHER = 'other', 'Other'

    class Status(models.TextChoices):
        PLANNED = 'planned', 'Planned'
        ONGOING = 'ongoing', 'Ongoing'
        STALLED = 'stalled', 'Stalled'
        COMPLETED = 'completed', 'Completed'
        CLOSED = 'closed', 'Closed'

    class Health(models.TextChoices):
        ON_TRACK = 'on_track', 'On Track'
        DELAYED = 'delayed', 'Delayed'
        BLOCKED = 'blocked', 'Blocked'
        COMPLETED = 'completed', 'Completed'
        WATCH = 'watch', 'Watch'

    name = models.CharField(max_length=255)
    project_code = models.CharField(max_length=50, unique=True, null=True, blank=True)
    project_type = models.CharField(max_length=30, choices=ProjectType.choices, default=ProjectType.WATER_SUPPLY)
    description = models.TextField(blank=True)
    funding_source = models.CharField(max_length=255, blank=True)
    budget_amount = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    contractor = models.CharField(max_length=255, blank=True)
    consultant = models.CharField(max_length=255, blank=True)
    location = models.CharField(max_length=255, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.ONGOING)
    health = models.CharField(max_length=30, choices=Health.choices, default=Health.ON_TRACK)
    start_date = models.DateField(null=True, blank=True)
    target_completion_date = models.DateField(null=True, blank=True)
    actual_completion_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_projects',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_projects',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['status', 'health']),
            models.Index(fields=['project_type', 'is_active']),
            models.Index(fields=['target_completion_date']),
        ]

    def __str__(self):
        return self.name


class ProjectComponent(models.Model):
    class Status(models.TextChoices):
        NOT_STARTED = 'not_started', 'Not Started'
        IN_PROGRESS = 'in_progress', 'In Progress'
        COMPLETED = 'completed', 'Completed'
        BLOCKED = 'blocked', 'Blocked'

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='components')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    unit = models.CharField(max_length=40, blank=True)
    planned_quantity = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.IN_PROGRESS)
    target_completion_date = models.DateField(null=True, blank=True)
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['project', 'display_order', 'id']
        unique_together = [('project', 'title')]

    def __str__(self):
        return f'{self.project} - {self.title}'


class ProjectReport(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        SUBMITTED = 'submitted', 'Submitted'
        APPROVED = 'approved', 'Approved'
        PUBLISHED = 'published', 'Published'
        ARCHIVED = 'archived', 'Archived'

    title = models.CharField(max_length=255, default='Projects Report')
    year = models.PositiveIntegerField()
    month = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])
    department = models.CharField(max_length=150, default='TECHNICAL DEPT')
    classification = models.CharField(max_length=80, default='INTERNAL')
    previous_status_date = models.DateField(null=True, blank=True)
    current_status_date = models.DateField()
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.DRAFT)
    prepared_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='prepared_project_reports',
    )
    prepared_by_name = models.CharField(max_length=150, blank=True)
    prepared_at = models.DateTimeField(null=True, blank=True)
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='submitted_project_reports',
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_project_reports',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    source_document = models.FileField(upload_to='projects/source-reports/%Y/%m/', blank=True)
    executive_summary = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_project_reports',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_project_reports',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-year', '-month', 'title']
        unique_together = [('year', 'month', 'title')]
        indexes = [
            models.Index(fields=['year', 'month']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f'{self.title}: {self.year}-{self.month:02d}'

    def save(self, *args, **kwargs):
        if self.prepared_by and not self.prepared_by_name:
            self.prepared_by_name = self.prepared_by.get_username()
        super().save(*args, **kwargs)


class ProjectMonthlyUpdate(models.Model):
    report = models.ForeignKey(ProjectReport, on_delete=models.CASCADE, related_name='updates')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='monthly_updates')
    report_order = models.PositiveIntegerField(default=0)
    project_status_snapshot = models.CharField(
        max_length=30,
        choices=Project.Status.choices,
        default=Project.Status.ONGOING,
    )
    health = models.CharField(max_length=30, choices=Project.Health.choices, default=Project.Health.ON_TRACK)
    overall_percent_complete = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    summary = models.TextField(blank=True)
    previous_status_text = models.TextField(blank=True)
    current_status_text = models.TextField(blank=True)
    key_risks = models.TextField(blank=True)
    next_actions = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True)
    include_in_management = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_project_updates',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_project_updates',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['report', 'report_order', 'id']
        unique_together = [('report', 'project')]
        indexes = [
            models.Index(fields=['report', 'include_in_management']),
            models.Index(fields=['health']),
        ]

    def __str__(self):
        return f'{self.project} - {self.report}'


class ProjectProgressItem(models.Model):
    monthly_update = models.ForeignKey(ProjectMonthlyUpdate, on_delete=models.CASCADE, related_name='progress_items')
    component = models.ForeignKey(
        ProjectComponent,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='progress_items',
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    unit = models.CharField(max_length=40, blank=True)
    planned_quantity = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    completed_quantity = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    percent_complete = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    status_text = models.CharField(max_length=255, blank=True)
    evidence_notes = models.TextField(blank=True)
    visibility = models.CharField(max_length=30, choices=Visibility.choices, default=Visibility.MANAGEMENT)
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['monthly_update', 'display_order', 'id']

    def save(self, *args, **kwargs):
        if self.percent_complete is None and self.planned_quantity not in (None, Decimal('0')) and self.completed_quantity is not None:
            self.percent_complete = min((self.completed_quantity / self.planned_quantity) * Decimal('100'), Decimal('100'))
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class ProjectKPI(models.Model):
    class KPIKind(models.TextChoices):
        QUANTITY = 'quantity', 'Quantity'
        PERCENTAGE = 'percentage', 'Percentage'
        MONEY = 'money', 'Money'
        COUNT = 'count', 'Count'
        DATE = 'date', 'Date'
        TEXT = 'text', 'Text'

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='kpis')
    component = models.ForeignKey(ProjectComponent, on_delete=models.SET_NULL, null=True, blank=True, related_name='kpis')
    code = models.CharField(max_length=80)
    name = models.CharField(max_length=255)
    kpi_kind = models.CharField(max_length=30, choices=KPIKind.choices, default=KPIKind.QUANTITY)
    unit = models.CharField(max_length=40, blank=True)
    target_value = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    is_cumulative = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['project', 'display_order', 'id']
        unique_together = [('project', 'code')]

    def __str__(self):
        return f'{self.project} - {self.name}'


class ProjectKPIValue(models.Model):
    kpi = models.ForeignKey(ProjectKPI, on_delete=models.CASCADE, related_name='values')
    report = models.ForeignKey(ProjectReport, on_delete=models.CASCADE, related_name='kpi_values')
    monthly_update = models.ForeignKey(
        ProjectMonthlyUpdate,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='kpi_values',
    )
    target_value_snapshot = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    actual_value = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    actual_text = models.CharField(max_length=255, blank=True)
    percent_complete = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_project_kpi_values',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['report', 'kpi__display_order', 'id']
        unique_together = [('kpi', 'report')]
        indexes = [
            models.Index(fields=['report']),
        ]

    def save(self, *args, **kwargs):
        if self.target_value_snapshot is None:
            self.target_value_snapshot = self.kpi.target_value
        if self.percent_complete is None and self.target_value_snapshot not in (None, Decimal('0')) and self.actual_value is not None:
            self.percent_complete = min((self.actual_value / self.target_value_snapshot) * Decimal('100'), Decimal('100'))
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.kpi} - {self.report}'


class ProjectFile(models.Model):
    class Category(models.TextChoices):
        CONTRACT = 'contract', 'Contract'
        DRAWING = 'drawing', 'Drawing'
        BOQ = 'boq', 'BOQ'
        PHOTO = 'photo', 'Photo'
        INSPECTION = 'inspection', 'Inspection'
        REPORT = 'report', 'Report'
        CORRESPONDENCE = 'correspondence', 'Correspondence'
        OTHER = 'other', 'Other'

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='files')
    report = models.ForeignKey(ProjectReport, on_delete=models.SET_NULL, null=True, blank=True, related_name='files')
    monthly_update = models.ForeignKey(ProjectMonthlyUpdate, on_delete=models.SET_NULL, null=True, blank=True, related_name='files')
    title = models.CharField(max_length=255)
    file = models.FileField(upload_to='projects/files/%Y/%m/')
    file_category = models.CharField(max_length=30, choices=Category.choices, default=Category.OTHER)
    visibility = models.CharField(max_length=30, choices=Visibility.choices, default=Visibility.INTERNAL)
    version_label = models.CharField(max_length=50, blank=True)
    document_date = models.DateField(null=True, blank=True)
    description = models.TextField(blank=True)
    is_current = models.BooleanField(default=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_project_files',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at']
        indexes = [
            models.Index(fields=['project', 'visibility']),
            models.Index(fields=['file_category']),
        ]

    def __str__(self):
        return self.title


class ProjectGeoFile(models.Model):
    class GeoFileType(models.TextChoices):
        KML = 'kml', 'KML'
        KMZ = 'kmz', 'KMZ'
        GEOJSON = 'geojson', 'GeoJSON'
        SHAPEFILE = 'shapefile', 'Shapefile'
        OTHER = 'other', 'Other'

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='geo_files')
    report = models.ForeignKey(ProjectReport, on_delete=models.SET_NULL, null=True, blank=True, related_name='geo_files')
    monthly_update = models.ForeignKey(ProjectMonthlyUpdate, on_delete=models.SET_NULL, null=True, blank=True, related_name='geo_files')
    title = models.CharField(max_length=255)
    file = models.FileField(upload_to='projects/geo/%Y/%m/')
    file_type = models.CharField(max_length=30, choices=GeoFileType.choices, default=GeoFileType.KML)
    visibility = models.CharField(max_length=30, choices=Visibility.choices, default=Visibility.INTERNAL)
    coordinate_reference_system = models.CharField(max_length=80, default='WGS84')
    document_date = models.DateField(null=True, blank=True)
    description = models.TextField(blank=True)
    is_current = models.BooleanField(default=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_project_geo_files',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at']
        indexes = [
            models.Index(fields=['project', 'visibility']),
            models.Index(fields=['file_type']),
        ]

    def __str__(self):
        return self.title


class ProjectComment(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='comments')
    report = models.ForeignKey(ProjectReport, on_delete=models.SET_NULL, null=True, blank=True, related_name='comments')
    monthly_update = models.ForeignKey(ProjectMonthlyUpdate, on_delete=models.SET_NULL, null=True, blank=True, related_name='comments')
    comment = models.TextField()
    visibility = models.CharField(max_length=30, choices=Visibility.choices, default=Visibility.INTERNAL)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='project_comments')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['project', 'visibility']),
        ]

    def __str__(self):
        return f'{self.project} - {self.created_at:%Y-%m-%d %H:%M}'


class ProjectIssue(models.Model):
    class Severity(models.TextChoices):
        LOW = 'low', 'Low'
        MEDIUM = 'medium', 'Medium'
        HIGH = 'high', 'High'
        CRITICAL = 'critical', 'Critical'

    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        IN_PROGRESS = 'in_progress', 'In Progress'
        RESOLVED = 'resolved', 'Resolved'
        CLOSED = 'closed', 'Closed'

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='issues')
    report = models.ForeignKey(ProjectReport, on_delete=models.SET_NULL, null=True, blank=True, related_name='issues')
    monthly_update = models.ForeignKey(ProjectMonthlyUpdate, on_delete=models.SET_NULL, null=True, blank=True, related_name='issues')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    severity = models.CharField(max_length=30, choices=Severity.choices, default=Severity.MEDIUM)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.OPEN)
    owner_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='owned_project_issues')
    owner_name = models.CharField(max_length=150, blank=True)
    due_date = models.DateField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True)
    visibility = models.CharField(max_length=30, choices=Visibility.choices, default=Visibility.INTERNAL)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_project_issues')
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='updated_project_issues')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['status', '-severity', 'due_date', '-created_at']
        indexes = [
            models.Index(fields=['project', 'status']),
            models.Index(fields=['severity', 'status']),
        ]

    def save(self, *args, **kwargs):
        if self.owner_user and not self.owner_name:
            self.owner_name = self.owner_user.get_username()
        if self.status in {self.Status.RESOLVED, self.Status.CLOSED} and not self.resolved_at:
            self.resolved_at = timezone.now()
        if self.status not in {self.Status.RESOLVED, self.Status.CLOSED}:
            self.resolved_at = None
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class ProjectMilestone(models.Model):
    class Status(models.TextChoices):
        NOT_STARTED = 'not_started', 'Not Started'
        IN_PROGRESS = 'in_progress', 'In Progress'
        DONE = 'done', 'Done'
        MISSED = 'missed', 'Missed'

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='milestones')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    target_date = models.DateField(null=True, blank=True)
    actual_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.NOT_STARTED)
    percent_complete = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    visibility = models.CharField(max_length=30, choices=Visibility.choices, default=Visibility.MANAGEMENT)
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['project', 'display_order', 'target_date', 'id']

    def __str__(self):
        return self.title


class ProjectSiteVisit(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='site_visits')
    report = models.ForeignKey(ProjectReport, on_delete=models.SET_NULL, null=True, blank=True, related_name='site_visits')
    visit_date = models.DateField()
    location = models.CharField(max_length=255, blank=True)
    purpose = models.CharField(max_length=255, blank=True)
    observations = models.TextField(blank=True)
    actions_required = models.TextField(blank=True)
    attendees = models.TextField(blank=True)
    visited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='project_site_visits')
    visited_by_name = models.CharField(max_length=150, blank=True)
    visibility = models.CharField(max_length=30, choices=Visibility.choices, default=Visibility.INTERNAL)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_project_site_visits')
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='updated_project_site_visits')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-visit_date', '-created_at']
        indexes = [
            models.Index(fields=['project', 'visit_date']),
        ]

    def save(self, *args, **kwargs):
        if self.visited_by and not self.visited_by_name:
            self.visited_by_name = self.visited_by.get_username()
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.project} - {self.visit_date}'


class ProjectActivityLog(models.Model):
    class ActivityType(models.TextChoices):
        CREATED = 'created', 'Created'
        UPDATED = 'updated', 'Updated'
        STATUS_CHANGE = 'status_change', 'Status Change'
        COMMENT = 'comment', 'Comment'
        FILE_UPLOAD = 'file_upload', 'File Upload'
        REPORT_ACTION = 'report_action', 'Report Action'

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='activity_logs')
    report = models.ForeignKey(ProjectReport, on_delete=models.SET_NULL, null=True, blank=True, related_name='activity_logs')
    monthly_update = models.ForeignKey(ProjectMonthlyUpdate, on_delete=models.SET_NULL, null=True, blank=True, related_name='activity_logs')
    activity_type = models.CharField(max_length=30, choices=ActivityType.choices)
    description = models.TextField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='project_activity_logs')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['project', 'activity_type']),
        ]

    def __str__(self):
        return f'{self.project} - {self.activity_type}'
