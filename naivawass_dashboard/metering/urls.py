from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    DistributionWaterMeterAssignmentViewSet,
    EnergyMeterReadingViewSet,
    EnergyMeterViewSet,
    MeterReadingAssignmentViewSet,
    ProductionEnergyMeterAssignmentViewSet,
    ProductionWaterMeterAssignmentViewSet,
    UserProfileViewSet,
    WaterMeterReadingViewSet,
    WaterMeterViewSet,
)

app_name = 'metering'

router = DefaultRouter()
router.register(r'water-meters', WaterMeterViewSet, basename='watermeter')
router.register(r'energy-meters', EnergyMeterViewSet, basename='energymeter')
router.register(r'user-profiles', UserProfileViewSet, basename='userprofile')
router.register(r'water-meter-readings', WaterMeterReadingViewSet, basename='watermeterreading')
router.register(r'energy-meter-readings', EnergyMeterReadingViewSet, basename='energymeterreading')
router.register(r'meter-reading-assignments', MeterReadingAssignmentViewSet, basename='meterreadingassignment')
router.register(r'production-water-assignments', ProductionWaterMeterAssignmentViewSet, basename='productionwaterassignment')
router.register(r'production-energy-assignments', ProductionEnergyMeterAssignmentViewSet, basename='productionenergyassignment')
router.register(r'distribution-water-assignments', DistributionWaterMeterAssignmentViewSet, basename='distributionwaterassignment')

urlpatterns = [
    path('', include(router.urls)),
]
