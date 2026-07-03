from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    FinanceMetricViewSet,
    FinanceMonthlyValueViewSet,
    FinanceReportViewSet,
    FinanceSectionViewSet,
)

app_name = 'finance'

router = DefaultRouter()
router.register(r'reports', FinanceReportViewSet, basename='financereport')
router.register(r'sections', FinanceSectionViewSet, basename='financesection')
router.register(r'metrics', FinanceMetricViewSet, basename='financemetric')
router.register(r'monthly-values', FinanceMonthlyValueViewSet, basename='financemonthlyvalue')

urlpatterns = [
    path('', include(router.urls)),
]
