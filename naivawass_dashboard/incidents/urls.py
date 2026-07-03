from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import IncidentCommentViewSet, IncidentUserViewSet, IncidentViewSet

app_name = 'incidents'

router = DefaultRouter()
router.register(r'incidents', IncidentViewSet, basename='incident')
router.register(r'comments', IncidentCommentViewSet, basename='incidentcomment')
router.register(r'users', IncidentUserViewSet, basename='incidentuser')

urlpatterns = [
    path('', include(router.urls)),
]
