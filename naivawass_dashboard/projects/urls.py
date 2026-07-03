from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ProjectActivityLogViewSet,
    ProjectCommentViewSet,
    ProjectComponentViewSet,
    ProjectFileViewSet,
    ProjectGeoFileViewSet,
    ProjectIssueViewSet,
    ProjectKPIValueViewSet,
    ProjectKPIViewSet,
    ProjectMilestoneViewSet,
    ProjectMonthlyUpdateViewSet,
    ProjectProgressItemViewSet,
    ProjectReportViewSet,
    ProjectSiteVisitViewSet,
    ProjectViewSet,
)


app_name = 'projects'

router = DefaultRouter()
router.register(r'projects', ProjectViewSet, basename='project')
router.register(r'components', ProjectComponentViewSet, basename='projectcomponent')
router.register(r'reports', ProjectReportViewSet, basename='projectreport')
router.register(r'monthly-updates', ProjectMonthlyUpdateViewSet, basename='projectmonthlyupdate')
router.register(r'progress-items', ProjectProgressItemViewSet, basename='projectprogressitem')
router.register(r'kpis', ProjectKPIViewSet, basename='projectkpi')
router.register(r'kpi-values', ProjectKPIValueViewSet, basename='projectkpivalue')
router.register(r'files', ProjectFileViewSet, basename='projectfile')
router.register(r'geo-files', ProjectGeoFileViewSet, basename='projectgeofile')
router.register(r'comments', ProjectCommentViewSet, basename='projectcomment')
router.register(r'issues', ProjectIssueViewSet, basename='projectissue')
router.register(r'milestones', ProjectMilestoneViewSet, basename='projectmilestone')
router.register(r'site-visits', ProjectSiteVisitViewSet, basename='projectsitevisit')
router.register(r'activity-logs', ProjectActivityLogViewSet, basename='projectactivitylog')

urlpatterns = [
    path('', include(router.urls)),
]
