from django.contrib import admin

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


class ProjectComponentInline(admin.TabularInline):
    model = ProjectComponent
    extra = 0
    fields = ['title', 'unit', 'planned_quantity', 'status', 'target_completion_date', 'display_order']


class ProjectKPIInline(admin.TabularInline):
    model = ProjectKPI
    extra = 0
    fields = ['code', 'name', 'kpi_kind', 'unit', 'target_value', 'is_cumulative', 'display_order', 'is_active']


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ['name', 'project_code', 'project_type', 'status', 'health', 'budget_amount', 'target_completion_date', 'is_active']
    list_filter = ['project_type', 'status', 'health', 'is_active']
    search_fields = ['name', 'project_code', 'funding_source', 'contractor', 'location']
    inlines = [ProjectComponentInline, ProjectKPIInline]


@admin.register(ProjectComponent)
class ProjectComponentAdmin(admin.ModelAdmin):
    list_display = ['title', 'project', 'unit', 'planned_quantity', 'status', 'display_order']
    list_filter = ['status', 'project']
    search_fields = ['title', 'description', 'project__name']


class ProjectMonthlyUpdateInline(admin.TabularInline):
    model = ProjectMonthlyUpdate
    extra = 0
    fields = ['project', 'report_order', 'project_status_snapshot', 'health', 'overall_percent_complete', 'include_in_management']


@admin.register(ProjectReport)
class ProjectReportAdmin(admin.ModelAdmin):
    list_display = ['title', 'year', 'month', 'current_status_date', 'status', 'prepared_by_name']
    list_filter = ['status', 'year', 'month']
    search_fields = ['title', 'department', 'prepared_by_name']
    inlines = [ProjectMonthlyUpdateInline]


class ProjectProgressItemInline(admin.TabularInline):
    model = ProjectProgressItem
    extra = 0
    fields = ['title', 'component', 'completed_quantity', 'planned_quantity', 'unit', 'percent_complete', 'visibility', 'display_order']


class ProjectKPIValueInline(admin.TabularInline):
    model = ProjectKPIValue
    extra = 0
    fields = ['kpi', 'actual_value', 'actual_text', 'target_value_snapshot', 'percent_complete']


@admin.register(ProjectMonthlyUpdate)
class ProjectMonthlyUpdateAdmin(admin.ModelAdmin):
    list_display = ['project', 'report', 'report_order', 'project_status_snapshot', 'health', 'overall_percent_complete', 'include_in_management']
    list_filter = ['report', 'health', 'project_status_snapshot', 'include_in_management']
    search_fields = ['project__name', 'summary', 'previous_status_text', 'current_status_text']
    inlines = [ProjectProgressItemInline, ProjectKPIValueInline]


@admin.register(ProjectProgressItem)
class ProjectProgressItemAdmin(admin.ModelAdmin):
    list_display = ['title', 'monthly_update', 'component', 'completed_quantity', 'planned_quantity', 'unit', 'percent_complete', 'visibility']
    list_filter = ['visibility', 'component']
    search_fields = ['title', 'description', 'status_text']


@admin.register(ProjectKPI)
class ProjectKPIAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'project', 'component', 'kpi_kind', 'unit', 'target_value', 'is_active']
    list_filter = ['kpi_kind', 'is_active', 'project']
    search_fields = ['code', 'name', 'project__name']


@admin.register(ProjectKPIValue)
class ProjectKPIValueAdmin(admin.ModelAdmin):
    list_display = ['kpi', 'report', 'actual_value', 'actual_text', 'percent_complete']
    list_filter = ['report', 'kpi__project']
    search_fields = ['kpi__name', 'kpi__code', 'actual_text']


@admin.register(ProjectFile)
class ProjectFileAdmin(admin.ModelAdmin):
    list_display = ['title', 'project', 'file_category', 'visibility', 'is_current', 'uploaded_by', 'uploaded_at']
    list_filter = ['file_category', 'visibility', 'is_current']
    search_fields = ['title', 'description', 'project__name']


@admin.register(ProjectGeoFile)
class ProjectGeoFileAdmin(admin.ModelAdmin):
    list_display = ['title', 'project', 'file_type', 'visibility', 'is_current', 'uploaded_by', 'uploaded_at']
    list_filter = ['file_type', 'visibility', 'is_current']
    search_fields = ['title', 'description', 'project__name']


@admin.register(ProjectComment)
class ProjectCommentAdmin(admin.ModelAdmin):
    list_display = ['project', 'visibility', 'created_by', 'created_at']
    list_filter = ['visibility']
    search_fields = ['project__name', 'comment']


@admin.register(ProjectIssue)
class ProjectIssueAdmin(admin.ModelAdmin):
    list_display = ['title', 'project', 'severity', 'status', 'owner_name', 'due_date', 'visibility']
    list_filter = ['severity', 'status', 'visibility']
    search_fields = ['title', 'description', 'project__name', 'owner_name']


@admin.register(ProjectMilestone)
class ProjectMilestoneAdmin(admin.ModelAdmin):
    list_display = ['title', 'project', 'target_date', 'actual_date', 'status', 'percent_complete', 'visibility']
    list_filter = ['status', 'visibility']
    search_fields = ['title', 'description', 'project__name']


@admin.register(ProjectSiteVisit)
class ProjectSiteVisitAdmin(admin.ModelAdmin):
    list_display = ['project', 'visit_date', 'location', 'visited_by_name', 'visibility']
    list_filter = ['visibility', 'visit_date']
    search_fields = ['project__name', 'location', 'purpose', 'observations']


@admin.register(ProjectActivityLog)
class ProjectActivityLogAdmin(admin.ModelAdmin):
    list_display = ['project', 'activity_type', 'created_by', 'created_at']
    list_filter = ['activity_type']
    search_fields = ['project__name', 'description']
