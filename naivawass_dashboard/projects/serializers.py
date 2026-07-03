from rest_framework import serializers

from .models import (
    Project,
    ProjectActivityLog,
    ProjectComment,
    ProjectComponent,
    ProjectFile,
    ProjectGeoFile,
    ProjectIssue,
    ProjectKPI,
    ProjectKPIValue,
    ProjectMilestone,
    ProjectMonthlyUpdate,
    ProjectProgressItem,
    ProjectReport,
    ProjectSiteVisit,
)


class ProjectComponentSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)

    class Meta:
        model = ProjectComponent
        fields = [
            'id',
            'project',
            'project_name',
            'title',
            'description',
            'unit',
            'planned_quantity',
            'status',
            'target_completion_date',
            'display_order',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class ProjectSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, allow_null=True)
    updated_by_name = serializers.CharField(source='updated_by.username', read_only=True, allow_null=True)
    component_count = serializers.IntegerField(read_only=True)
    file_count = serializers.IntegerField(read_only=True)
    issue_count = serializers.IntegerField(read_only=True)
    open_issue_count = serializers.IntegerField(read_only=True)
    latest_report_month = serializers.CharField(read_only=True)

    class Meta:
        model = Project
        fields = [
            'id',
            'name',
            'project_code',
            'project_type',
            'description',
            'funding_source',
            'budget_amount',
            'contractor',
            'consultant',
            'location',
            'latitude',
            'longitude',
            'status',
            'health',
            'start_date',
            'target_completion_date',
            'actual_completion_date',
            'is_active',
            'notes',
            'component_count',
            'file_count',
            'issue_count',
            'open_issue_count',
            'latest_report_month',
            'created_by',
            'created_by_name',
            'updated_by',
            'updated_by_name',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'created_by',
            'created_by_name',
            'updated_by',
            'updated_by_name',
            'component_count',
            'file_count',
            'issue_count',
            'open_issue_count',
            'latest_report_month',
            'created_at',
            'updated_at',
        ]


class ProjectProgressItemSerializer(serializers.ModelSerializer):
    component_title = serializers.CharField(source='component.title', read_only=True, allow_null=True)
    project = serializers.IntegerField(source='monthly_update.project_id', read_only=True)
    report = serializers.IntegerField(source='monthly_update.report_id', read_only=True)

    class Meta:
        model = ProjectProgressItem
        fields = [
            'id',
            'monthly_update',
            'project',
            'report',
            'component',
            'component_title',
            'title',
            'description',
            'unit',
            'planned_quantity',
            'completed_quantity',
            'percent_complete',
            'status_text',
            'evidence_notes',
            'visibility',
            'display_order',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['project', 'report', 'created_at', 'updated_at']

    def validate(self, attrs):
        monthly_update = attrs.get('monthly_update') or getattr(self.instance, 'monthly_update', None)
        component = attrs.get('component') or getattr(self.instance, 'component', None)
        if monthly_update and component and component.project_id != monthly_update.project_id:
            raise serializers.ValidationError({'component': 'Component must belong to the same project as the monthly update.'})
        return attrs


class ProjectKPIValueSerializer(serializers.ModelSerializer):
    kpi_name = serializers.CharField(source='kpi.name', read_only=True)
    kpi_code = serializers.CharField(source='kpi.code', read_only=True)
    unit = serializers.CharField(source='kpi.unit', read_only=True)
    project = serializers.IntegerField(source='kpi.project_id', read_only=True)
    recorded_by_name = serializers.CharField(source='recorded_by.username', read_only=True, allow_null=True)

    class Meta:
        model = ProjectKPIValue
        fields = [
            'id',
            'kpi',
            'kpi_name',
            'kpi_code',
            'unit',
            'project',
            'report',
            'monthly_update',
            'target_value_snapshot',
            'actual_value',
            'actual_text',
            'percent_complete',
            'notes',
            'recorded_by',
            'recorded_by_name',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['recorded_by', 'recorded_by_name', 'project', 'created_at', 'updated_at']

    def validate(self, attrs):
        kpi = attrs.get('kpi') or getattr(self.instance, 'kpi', None)
        report = attrs.get('report') or getattr(self.instance, 'report', None)
        monthly_update = attrs.get('monthly_update') or getattr(self.instance, 'monthly_update', None)
        if monthly_update and report and monthly_update.report_id != report.id:
            raise serializers.ValidationError({'monthly_update': 'Monthly update must belong to the selected report.'})
        if monthly_update and kpi and monthly_update.project_id != kpi.project_id:
            raise serializers.ValidationError({'monthly_update': 'Monthly update must belong to the KPI project.'})
        return attrs


class ProjectMonthlyUpdateSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    project_code = serializers.CharField(source='project.project_code', read_only=True, allow_null=True)
    project_type = serializers.CharField(source='project.project_type', read_only=True)
    funding_source = serializers.CharField(source='project.funding_source', read_only=True)
    budget_amount = serializers.DecimalField(source='project.budget_amount', max_digits=18, decimal_places=2, read_only=True)
    components = ProjectComponentSerializer(source='project.components', many=True, read_only=True)
    progress_items = ProjectProgressItemSerializer(many=True, read_only=True)
    kpi_values = ProjectKPIValueSerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, allow_null=True)
    updated_by_name = serializers.CharField(source='updated_by.username', read_only=True, allow_null=True)

    class Meta:
        model = ProjectMonthlyUpdate
        fields = [
            'id',
            'report',
            'project',
            'project_name',
            'project_code',
            'project_type',
            'funding_source',
            'budget_amount',
            'components',
            'report_order',
            'project_status_snapshot',
            'health',
            'overall_percent_complete',
            'summary',
            'previous_status_text',
            'current_status_text',
            'key_risks',
            'next_actions',
            'internal_notes',
            'include_in_management',
            'progress_items',
            'kpi_values',
            'created_by',
            'created_by_name',
            'updated_by',
            'updated_by_name',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'created_by',
            'created_by_name',
            'updated_by',
            'updated_by_name',
            'components',
            'progress_items',
            'kpi_values',
            'created_at',
            'updated_at',
        ]


class ProjectReportSerializer(serializers.ModelSerializer):
    prepared_by_name_read = serializers.CharField(source='prepared_by.username', read_only=True, allow_null=True)
    submitted_by_name = serializers.CharField(source='submitted_by.username', read_only=True, allow_null=True)
    approved_by_name = serializers.CharField(source='approved_by.username', read_only=True, allow_null=True)
    update_count = serializers.IntegerField(read_only=True)
    active_project_count = serializers.IntegerField(read_only=True)
    average_completion = serializers.DecimalField(max_digits=7, decimal_places=2, read_only=True)

    class Meta:
        model = ProjectReport
        fields = [
            'id',
            'title',
            'year',
            'month',
            'department',
            'classification',
            'previous_status_date',
            'current_status_date',
            'status',
            'prepared_by',
            'prepared_by_name',
            'prepared_by_name_read',
            'prepared_at',
            'submitted_by',
            'submitted_by_name',
            'submitted_at',
            'approved_by',
            'approved_by_name',
            'approved_at',
            'published_at',
            'source_document',
            'executive_summary',
            'notes',
            'update_count',
            'active_project_count',
            'average_completion',
            'created_by',
            'updated_by',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'submitted_by',
            'submitted_by_name',
            'submitted_at',
            'approved_by',
            'approved_by_name',
            'approved_at',
            'published_at',
            'created_by',
            'updated_by',
            'created_at',
            'updated_at',
            'update_count',
            'active_project_count',
            'average_completion',
        ]


class ProjectKpiSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    component_title = serializers.CharField(source='component.title', read_only=True, allow_null=True)
    latest_value = serializers.SerializerMethodField()

    class Meta:
        model = ProjectKPI
        fields = [
            'id',
            'project',
            'project_name',
            'component',
            'component_title',
            'code',
            'name',
            'kpi_kind',
            'unit',
            'target_value',
            'is_cumulative',
            'display_order',
            'is_active',
            'notes',
            'latest_value',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['latest_value', 'created_at', 'updated_at']

    def get_latest_value(self, obj):
        value = obj.values.select_related('report').order_by('-report__year', '-report__month').first()
        if value is None:
            return None
        return {
            'report': value.report_id,
            'year': value.report.year,
            'month': value.report.month,
            'actual_value': value.actual_value,
            'actual_text': value.actual_text,
            'percent_complete': value.percent_complete,
        }

    def validate(self, attrs):
        project = attrs.get('project') or getattr(self.instance, 'project', None)
        component = attrs.get('component') or getattr(self.instance, 'component', None)
        if project and component and component.project_id != project.id:
            raise serializers.ValidationError({'component': 'Component must belong to the selected project.'})
        return attrs


class ProjectFileSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    uploaded_by_name = serializers.CharField(source='uploaded_by.username', read_only=True, allow_null=True)

    class Meta:
        model = ProjectFile
        fields = [
            'id',
            'project',
            'project_name',
            'report',
            'monthly_update',
            'title',
            'file',
            'file_category',
            'visibility',
            'version_label',
            'document_date',
            'description',
            'is_current',
            'uploaded_by',
            'uploaded_by_name',
            'uploaded_at',
        ]
        read_only_fields = ['uploaded_by', 'uploaded_by_name', 'uploaded_at']


class ProjectGeoFileSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    uploaded_by_name = serializers.CharField(source='uploaded_by.username', read_only=True, allow_null=True)

    class Meta:
        model = ProjectGeoFile
        fields = [
            'id',
            'project',
            'project_name',
            'report',
            'monthly_update',
            'title',
            'file',
            'file_type',
            'visibility',
            'coordinate_reference_system',
            'document_date',
            'description',
            'is_current',
            'uploaded_by',
            'uploaded_by_name',
            'uploaded_at',
        ]
        read_only_fields = ['uploaded_by', 'uploaded_by_name', 'uploaded_at']


class ProjectCommentSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, allow_null=True)

    class Meta:
        model = ProjectComment
        fields = [
            'id',
            'project',
            'project_name',
            'report',
            'monthly_update',
            'comment',
            'visibility',
            'created_by',
            'created_by_name',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_by', 'created_by_name', 'created_at', 'updated_at']


class ProjectIssueSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    owner_user_name = serializers.CharField(source='owner_user.username', read_only=True, allow_null=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, allow_null=True)
    updated_by_name = serializers.CharField(source='updated_by.username', read_only=True, allow_null=True)

    class Meta:
        model = ProjectIssue
        fields = [
            'id',
            'project',
            'project_name',
            'report',
            'monthly_update',
            'title',
            'description',
            'severity',
            'status',
            'owner_user',
            'owner_user_name',
            'owner_name',
            'due_date',
            'resolved_at',
            'resolution_notes',
            'visibility',
            'created_by',
            'created_by_name',
            'updated_by',
            'updated_by_name',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'resolved_at',
            'created_by',
            'created_by_name',
            'updated_by',
            'updated_by_name',
            'created_at',
            'updated_at',
        ]


class ProjectMilestoneSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)

    class Meta:
        model = ProjectMilestone
        fields = [
            'id',
            'project',
            'project_name',
            'title',
            'description',
            'target_date',
            'actual_date',
            'status',
            'percent_complete',
            'visibility',
            'display_order',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class ProjectSiteVisitSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    visited_by_user_name = serializers.CharField(source='visited_by.username', read_only=True, allow_null=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, allow_null=True)
    updated_by_name = serializers.CharField(source='updated_by.username', read_only=True, allow_null=True)

    class Meta:
        model = ProjectSiteVisit
        fields = [
            'id',
            'project',
            'project_name',
            'report',
            'visit_date',
            'location',
            'purpose',
            'observations',
            'actions_required',
            'attendees',
            'visited_by',
            'visited_by_user_name',
            'visited_by_name',
            'visibility',
            'created_by',
            'created_by_name',
            'updated_by',
            'updated_by_name',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'created_by',
            'created_by_name',
            'updated_by',
            'updated_by_name',
            'created_at',
            'updated_at',
        ]


class ProjectActivityLogSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source='project.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, allow_null=True)

    class Meta:
        model = ProjectActivityLog
        fields = [
            'id',
            'project',
            'project_name',
            'report',
            'monthly_update',
            'activity_type',
            'description',
            'created_by',
            'created_by_name',
            'created_at',
        ]
        read_only_fields = ['created_by', 'created_by_name', 'created_at']

