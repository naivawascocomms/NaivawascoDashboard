from calendar import month_name

from django.db import transaction
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.http import HttpResponse

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
    Visibility,
)
from .permissions import (
    ProjectVisibilityPermission,
    ProjectsTeamOnlyPermission,
    ProjectsTeamWritePermission,
    is_projects_team_user,
    visible_to_user,
)
from .serializers import (
    ProjectActivityLogSerializer,
    ProjectCommentSerializer,
    ProjectComponentSerializer,
    ProjectFileSerializer,
    ProjectGeoFileSerializer,
    ProjectIssueSerializer,
    ProjectKPIValueSerializer,
    ProjectKpiSerializer,
    ProjectMilestoneSerializer,
    ProjectMonthlyUpdateSerializer,
    ProjectProgressItemSerializer,
    ProjectReportSerializer,
    ProjectSerializer,
    ProjectSiteVisitSerializer,
)
from .services import build_meeting_report_payload, render_project_report_pdf


MANAGEMENT_VISIBILITIES = [Visibility.MANAGEMENT, Visibility.REPORT]


def previous_month(year, month):
    if month == 1:
        return year - 1, 12
    return year, month - 1


def create_activity(project, user, description, activity_type=ProjectActivityLog.ActivityType.UPDATED, report=None, monthly_update=None):
    ProjectActivityLog.objects.create(
        project=project,
        report=report,
        monthly_update=monthly_update,
        activity_type=activity_type,
        description=description,
        created_by=user if user.is_authenticated else None,
    )


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated, ProjectsTeamWritePermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['project_type', 'status', 'health', 'is_active']
    search_fields = ['name', 'project_code', 'funding_source', 'contractor', 'location']
    ordering_fields = ['name', 'status', 'health', 'target_completion_date', 'budget_amount', 'updated_at']
    ordering = ['name']

    def get_queryset(self):
        return (
            Project.objects
            .select_related('created_by', 'updated_by')
            .annotate(
                component_count=Count('components', distinct=True),
                file_count=Count('files', distinct=True),
                issue_count=Count('issues', distinct=True),
                open_issue_count=Count(
                    'issues',
                    filter=Q(issues__status__in=[ProjectIssue.Status.OPEN, ProjectIssue.Status.IN_PROGRESS]),
                    distinct=True,
                ),
            )
        )

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user, updated_by=self.request.user)
        create_activity(instance, self.request.user, 'Project created.', ProjectActivityLog.ActivityType.CREATED)

    def perform_update(self, serializer):
        instance = serializer.save(updated_by=self.request.user)
        create_activity(instance, self.request.user, 'Project updated.')

    @action(detail=False, methods=['get'])
    def summary(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        active = queryset.filter(is_active=True)
        data = {
            'total': queryset.count(),
            'active': active.count(),
            'total_budget': active.aggregate(total=Sum('budget_amount'))['total'] or 0,
            'average_completion': ProjectMonthlyUpdate.objects.filter(
                project__in=active,
                include_in_management=True,
            ).aggregate(value=Avg('overall_percent_complete'))['value'],
            'by_status': {
                item['status']: item['count']
                for item in active.values('status').annotate(count=Count('id')).order_by('status')
            },
            'by_health': {
                item['health']: item['count']
                for item in active.values('health').annotate(count=Count('id')).order_by('health')
            },
            'by_type': {
                item['project_type']: item['count']
                for item in active.values('project_type').annotate(count=Count('id')).order_by('project_type')
            },
        }
        return Response(data)

    @action(detail=True, methods=['get'])
    def workspace(self, request, pk=None):
        if not is_projects_team_user(request.user):
            return Response({'detail': 'Projects workspace access is restricted to the projects team.'}, status=status.HTTP_403_FORBIDDEN)
        project = self.get_object()
        payload = {
            'project': self.get_serializer(project).data,
            'components': ProjectComponentSerializer(project.components.all(), many=True, context={'request': request}).data,
            'kpis': ProjectKpiSerializer(project.kpis.all(), many=True, context={'request': request}).data,
            'files': ProjectFileSerializer(project.files.all()[:100], many=True, context={'request': request}).data,
            'geo_files': ProjectGeoFileSerializer(project.geo_files.all()[:100], many=True, context={'request': request}).data,
            'comments': ProjectCommentSerializer(project.comments.all()[:100], many=True, context={'request': request}).data,
            'issues': ProjectIssueSerializer(project.issues.all()[:100], many=True, context={'request': request}).data,
            'milestones': ProjectMilestoneSerializer(project.milestones.all(), many=True, context={'request': request}).data,
            'site_visits': ProjectSiteVisitSerializer(project.site_visits.all()[:100], many=True, context={'request': request}).data,
            'activity_logs': ProjectActivityLogSerializer(project.activity_logs.all()[:100], many=True, context={'request': request}).data,
        }
        return Response(payload)


class ProjectComponentViewSet(viewsets.ModelViewSet):
    queryset = ProjectComponent.objects.select_related('project').all()
    serializer_class = ProjectComponentSerializer
    permission_classes = [IsAuthenticated, ProjectsTeamWritePermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['project', 'status']
    search_fields = ['title', 'description', 'project__name']
    ordering = ['project', 'display_order', 'id']


class ProjectReportViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectReportSerializer
    permission_classes = [IsAuthenticated, ProjectsTeamWritePermission]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['year', 'month', 'status']
    search_fields = ['title', 'department', 'prepared_by_name']
    ordering_fields = ['year', 'month', 'status', 'current_status_date', 'updated_at']
    ordering = ['-year', '-month', 'title']

    def get_queryset(self):
        return (
            ProjectReport.objects
            .select_related('prepared_by', 'submitted_by', 'approved_by', 'created_by', 'updated_by')
            .annotate(
                update_count=Count('updates', distinct=True),
                active_project_count=Count('updates__project', filter=Q(updates__include_in_management=True), distinct=True),
                average_completion=Avg('updates__overall_percent_complete', filter=Q(updates__include_in_management=True)),
            )
        )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @action(detail=True, methods=['get'])
    def dashboard(self, request, pk=None):
        report = self.get_object()
        updates = (
            report.updates
            .filter(include_in_management=True)
            .select_related('project')
            .prefetch_related('progress_items', 'kpi_values__kpi')
        )
        data = {
            'report': self.get_serializer(report).data,
            'summary': {
                'projects': updates.count(),
                'average_completion': updates.aggregate(value=Avg('overall_percent_complete'))['value'],
                'total_budget': updates.aggregate(value=Sum('project__budget_amount'))['value'] or 0,
                'health_counts': {
                    item['health']: item['count']
                    for item in updates.values('health').annotate(count=Count('id')).order_by('health')
                },
                'status_counts': {
                    item['project_status_snapshot']: item['count']
                    for item in updates.values('project_status_snapshot').annotate(count=Count('id')).order_by('project_status_snapshot')
                },
                'type_counts': {
                    item['project__project_type']: item['count']
                    for item in updates.values('project__project_type').annotate(count=Count('id')).order_by('project__project_type')
                },
            },
            'rows': build_meeting_report_payload(report)['rows'],
        }
        return Response(data)

    @action(detail=True, methods=['get'], url_path='meeting-report')
    def meeting_report(self, request, pk=None):
        return Response(build_meeting_report_payload(self.get_object()))

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        report = self.get_object()
        pdf = render_project_report_pdf(report)
        filename = f'Projects Report Monthly {month_name[report.month]} {report.year}.pdf'
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        report = self.get_object()
        report.status = ProjectReport.Status.SUBMITTED
        report.submitted_by = request.user
        report.submitted_at = timezone.now()
        if not report.prepared_by:
            report.prepared_by = request.user
        if not report.prepared_by_name:
            report.prepared_by_name = request.user.get_username()
        if not report.prepared_at:
            report.prepared_at = timezone.now()
        report.updated_by = request.user
        report.save()
        for update in report.updates.select_related('project'):
            create_activity(update.project, request.user, f'{report} submitted.', ProjectActivityLog.ActivityType.REPORT_ACTION, report=report, monthly_update=update)
        return Response(self.get_serializer(report).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        report = self.get_object()
        report.status = ProjectReport.Status.APPROVED
        report.approved_by = request.user
        report.approved_at = timezone.now()
        report.updated_by = request.user
        report.save()
        for update in report.updates.select_related('project'):
            create_activity(update.project, request.user, f'{report} approved.', ProjectActivityLog.ActivityType.REPORT_ACTION, report=report, monthly_update=update)
        return Response(self.get_serializer(report).data)

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        report = self.get_object()
        report.status = ProjectReport.Status.PUBLISHED
        report.published_at = timezone.now()
        report.updated_by = request.user
        report.save()
        for update in report.updates.select_related('project'):
            create_activity(update.project, request.user, f'{report} published.', ProjectActivityLog.ActivityType.REPORT_ACTION, report=report, monthly_update=update)
        return Response(self.get_serializer(report).data)

    @action(detail=True, methods=['post'], url_path='copy-from-previous-month')
    def copy_from_previous_month(self, request, pk=None):
        report = self.get_object()
        prev_year, prev_month = previous_month(report.year, report.month)
        previous = ProjectReport.objects.filter(
            title=report.title,
            year=prev_year,
            month=prev_month,
        ).first()
        if previous is None:
            return Response(
                {'detail': f'No previous report found for {prev_year}-{prev_month:02d}.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        created_updates = 0
        with transaction.atomic():
            for old_update in previous.updates.select_related('project').prefetch_related('progress_items', 'kpi_values__kpi'):
                new_update, created = ProjectMonthlyUpdate.objects.get_or_create(
                    report=report,
                    project=old_update.project,
                    defaults={
                        'report_order': old_update.report_order,
                        'project_status_snapshot': old_update.project.status,
                        'health': old_update.health,
                        'overall_percent_complete': old_update.overall_percent_complete,
                        'previous_status_text': old_update.current_status_text,
                        'current_status_text': '',
                        'summary': '',
                        'key_risks': old_update.key_risks,
                        'next_actions': '',
                        'include_in_management': old_update.include_in_management,
                        'created_by': request.user,
                        'updated_by': request.user,
                    },
                )
                if created:
                    created_updates += 1
                    for item in old_update.progress_items.all():
                        ProjectProgressItem.objects.create(
                            monthly_update=new_update,
                            component=item.component,
                            title=item.title,
                            description='',
                            unit=item.unit,
                            planned_quantity=item.planned_quantity,
                            completed_quantity=item.completed_quantity,
                            percent_complete=item.percent_complete,
                            status_text='',
                            visibility=item.visibility,
                            display_order=item.display_order,
                        )
                    for value in old_update.kpi_values.all():
                        ProjectKPIValue.objects.get_or_create(
                            kpi=value.kpi,
                            report=report,
                            defaults={
                                'monthly_update': new_update,
                                'target_value_snapshot': value.target_value_snapshot,
                                'actual_value': value.actual_value,
                                'actual_text': value.actual_text,
                                'percent_complete': value.percent_complete,
                                'recorded_by': request.user,
                            },
                        )
                    create_activity(old_update.project, request.user, f'Copied monthly update from {previous}.', ProjectActivityLog.ActivityType.REPORT_ACTION, report=report, monthly_update=new_update)

        return Response({'created_updates': created_updates, 'source_report': previous.id})


class ProjectMonthlyUpdateViewSet(viewsets.ModelViewSet):
    queryset = (
        ProjectMonthlyUpdate.objects
        .select_related('report', 'project', 'created_by', 'updated_by')
        .prefetch_related('project__components', 'progress_items__component', 'kpi_values__kpi')
    )
    serializer_class = ProjectMonthlyUpdateSerializer
    permission_classes = [IsAuthenticated, ProjectsTeamWritePermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['report', 'project', 'health', 'project_status_snapshot', 'include_in_management']
    search_fields = ['project__name', 'summary', 'previous_status_text', 'current_status_text', 'key_risks']
    ordering_fields = ['report_order', 'overall_percent_complete', 'updated_at']
    ordering = ['report', 'report_order', 'id']

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user, updated_by=self.request.user)
        create_activity(instance.project, self.request.user, 'Monthly project update created.', ProjectActivityLog.ActivityType.CREATED, report=instance.report, monthly_update=instance)

    def perform_update(self, serializer):
        instance = serializer.save(updated_by=self.request.user)
        create_activity(instance.project, self.request.user, 'Monthly project update changed.', report=instance.report, monthly_update=instance)


class ProjectProgressItemViewSet(viewsets.ModelViewSet):
    queryset = ProjectProgressItem.objects.select_related('monthly_update__project', 'monthly_update__report', 'component').all()
    serializer_class = ProjectProgressItemSerializer
    permission_classes = [IsAuthenticated, ProjectsTeamWritePermission, ProjectVisibilityPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['monthly_update', 'component', 'visibility']
    search_fields = ['title', 'description', 'status_text']
    ordering = ['monthly_update', 'display_order', 'id']

    def get_queryset(self):
        return visible_to_user(super().get_queryset(), self.request.user)


class ProjectKPIViewSet(viewsets.ModelViewSet):
    queryset = ProjectKPI.objects.select_related('project', 'component').prefetch_related('values__report').all()
    serializer_class = ProjectKpiSerializer
    permission_classes = [IsAuthenticated, ProjectsTeamWritePermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['project', 'component', 'kpi_kind', 'is_active']
    search_fields = ['code', 'name', 'project__name']
    ordering = ['project', 'display_order', 'id']


class ProjectKPIValueViewSet(viewsets.ModelViewSet):
    queryset = ProjectKPIValue.objects.select_related('kpi__project', 'report', 'monthly_update', 'recorded_by').all()
    serializer_class = ProjectKPIValueSerializer
    permission_classes = [IsAuthenticated, ProjectsTeamWritePermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['kpi', 'kpi__project', 'report', 'monthly_update']
    search_fields = ['kpi__name', 'kpi__code', 'actual_text', 'notes']
    ordering = ['report', 'kpi__display_order', 'id']

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(recorded_by=self.request.user)


class ProjectFileViewSet(viewsets.ModelViewSet):
    queryset = ProjectFile.objects.select_related('project', 'report', 'monthly_update', 'uploaded_by').all()
    serializer_class = ProjectFileSerializer
    permission_classes = [IsAuthenticated, ProjectsTeamWritePermission, ProjectVisibilityPermission]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['project', 'report', 'monthly_update', 'file_category', 'visibility', 'is_current']
    search_fields = ['title', 'description', 'project__name']
    ordering = ['-uploaded_at']

    def get_queryset(self):
        return visible_to_user(super().get_queryset(), self.request.user)

    def perform_create(self, serializer):
        instance = serializer.save(uploaded_by=self.request.user)
        create_activity(instance.project, self.request.user, f'File uploaded: {instance.title}', ProjectActivityLog.ActivityType.FILE_UPLOAD, report=instance.report, monthly_update=instance.monthly_update)


class ProjectGeoFileViewSet(viewsets.ModelViewSet):
    queryset = ProjectGeoFile.objects.select_related('project', 'report', 'monthly_update', 'uploaded_by').all()
    serializer_class = ProjectGeoFileSerializer
    permission_classes = [IsAuthenticated, ProjectsTeamWritePermission, ProjectVisibilityPermission]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['project', 'report', 'monthly_update', 'file_type', 'visibility', 'is_current']
    search_fields = ['title', 'description', 'project__name']
    ordering = ['-uploaded_at']

    def get_queryset(self):
        return visible_to_user(super().get_queryset(), self.request.user)

    def perform_create(self, serializer):
        instance = serializer.save(uploaded_by=self.request.user)
        create_activity(instance.project, self.request.user, f'Geo file uploaded: {instance.title}', ProjectActivityLog.ActivityType.FILE_UPLOAD, report=instance.report, monthly_update=instance.monthly_update)


class ProjectCommentViewSet(viewsets.ModelViewSet):
    queryset = ProjectComment.objects.select_related('project', 'report', 'monthly_update', 'created_by').all()
    serializer_class = ProjectCommentSerializer
    permission_classes = [IsAuthenticated, ProjectsTeamWritePermission, ProjectVisibilityPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['project', 'report', 'monthly_update', 'visibility']
    search_fields = ['comment', 'project__name']
    ordering = ['-created_at']

    def get_queryset(self):
        return visible_to_user(super().get_queryset(), self.request.user)

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        create_activity(instance.project, self.request.user, 'Comment added.', ProjectActivityLog.ActivityType.COMMENT, report=instance.report, monthly_update=instance.monthly_update)


class ProjectIssueViewSet(viewsets.ModelViewSet):
    queryset = ProjectIssue.objects.select_related('project', 'report', 'monthly_update', 'owner_user', 'created_by', 'updated_by').all()
    serializer_class = ProjectIssueSerializer
    permission_classes = [IsAuthenticated, ProjectsTeamWritePermission, ProjectVisibilityPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['project', 'report', 'monthly_update', 'severity', 'status', 'visibility', 'owner_user']
    search_fields = ['title', 'description', 'owner_name', 'project__name']
    ordering = ['status', '-severity', 'due_date', '-created_at']

    def get_queryset(self):
        return visible_to_user(super().get_queryset(), self.request.user)

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user, updated_by=self.request.user)
        create_activity(instance.project, self.request.user, f'Issue created: {instance.title}', ProjectActivityLog.ActivityType.CREATED, report=instance.report, monthly_update=instance.monthly_update)

    def perform_update(self, serializer):
        instance = serializer.save(updated_by=self.request.user)
        create_activity(instance.project, self.request.user, f'Issue updated: {instance.title}', report=instance.report, monthly_update=instance.monthly_update)


class ProjectMilestoneViewSet(viewsets.ModelViewSet):
    queryset = ProjectMilestone.objects.select_related('project').all()
    serializer_class = ProjectMilestoneSerializer
    permission_classes = [IsAuthenticated, ProjectsTeamWritePermission, ProjectVisibilityPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['project', 'status', 'visibility']
    search_fields = ['title', 'description', 'project__name']
    ordering = ['project', 'display_order', 'target_date', 'id']

    def get_queryset(self):
        return visible_to_user(super().get_queryset(), self.request.user)


class ProjectSiteVisitViewSet(viewsets.ModelViewSet):
    queryset = ProjectSiteVisit.objects.select_related('project', 'report', 'visited_by', 'created_by', 'updated_by').all()
    serializer_class = ProjectSiteVisitSerializer
    permission_classes = [IsAuthenticated, ProjectsTeamWritePermission, ProjectVisibilityPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['project', 'report', 'visit_date', 'visibility']
    search_fields = ['project__name', 'location', 'purpose', 'observations', 'attendees']
    ordering = ['-visit_date', '-created_at']

    def get_queryset(self):
        return visible_to_user(super().get_queryset(), self.request.user)

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user, updated_by=self.request.user)
        create_activity(instance.project, self.request.user, 'Site visit added.', ProjectActivityLog.ActivityType.CREATED, report=instance.report)

    def perform_update(self, serializer):
        instance = serializer.save(updated_by=self.request.user)
        create_activity(instance.project, self.request.user, 'Site visit updated.', report=instance.report)


class ProjectActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ProjectActivityLog.objects.select_related('project', 'report', 'monthly_update', 'created_by').all()
    serializer_class = ProjectActivityLogSerializer
    permission_classes = [IsAuthenticated, ProjectsTeamOnlyPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['project', 'report', 'monthly_update', 'activity_type']
    search_fields = ['description', 'project__name']
    ordering = ['-created_at']
