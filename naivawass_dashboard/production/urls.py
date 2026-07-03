# production/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    RegionViewSet, ProductionSiteViewSet, WaterSourceViewSet,
    MeterViewSet, MeterReadingViewSet, ProductionTargetViewSet,
    DailyProductionViewSet, MonthlyProductionViewSet, WaterQualityTestViewSet,
    CompanyMonthlySummaryViewSet,
)

app_name = 'production'

router = DefaultRouter()
router.register(r'regions', RegionViewSet, basename='region')
router.register(r'production-sites', ProductionSiteViewSet, basename='productionsite')
router.register(r'water-sources', WaterSourceViewSet, basename='watersource')
router.register(r'meters', MeterViewSet, basename='meter')
router.register(r'meter-readings', MeterReadingViewSet, basename='meterreading')
router.register(r'production-targets', ProductionTargetViewSet, basename='productiontarget')
router.register(r'daily-production', DailyProductionViewSet, basename='dailyproduction')
router.register(r'monthly-production', MonthlyProductionViewSet, basename='monthlyproduction')
router.register(r'water-quality-tests', WaterQualityTestViewSet, basename='waterqualitytest')
router.register(r'company-summary', CompanyMonthlySummaryViewSet, basename='companymonthlysummary')

urlpatterns = [
    path('', include(router.urls)),
]