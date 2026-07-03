# distribution/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DistributionRegionViewSet, ZoneViewSet, DMAViewSet,
    DistributionMeterViewSet, DistributionMeterReadingViewSet,
    BillingCycleViewSet, ZoneBillingCycleViewSet, CustomerBillingDataViewSet,
    DailyDistributionViewSet, MonthlyDistributionViewSet,
    RegionalDistributionViewSet, TransmissionLossViewSet,
    GlobalNRWPerformanceViewSet, CommercialDashboardReportViewSet,
    CommercialDashboardSectionViewSet, CommercialDashboardKPIViewSet,
    CommercialDashboardMonthlyValueViewSet, CommercialDashboardSnapshotViewSet
)

app_name = 'distribution'

router = DefaultRouter()
router.register(r'regions', DistributionRegionViewSet, basename='region')
router.register(r'zones', ZoneViewSet, basename='zone')
router.register(r'dmas', DMAViewSet, basename='dma')
router.register(r'meters', DistributionMeterViewSet, basename='meter')
router.register(r'meter-readings', DistributionMeterReadingViewSet, basename='meterreading')
router.register(r'billing-cycles', BillingCycleViewSet, basename='billingcycle')
router.register(r'zone-billing-cycles', ZoneBillingCycleViewSet, basename='zonebillingcycle')
router.register(r'customer-billing', CustomerBillingDataViewSet, basename='customerbilling')
router.register(r'daily-distribution', DailyDistributionViewSet, basename='dailydistribution')
router.register(r'monthly-distribution', MonthlyDistributionViewSet, basename='monthlydistribution')
router.register(r'regional-distribution', RegionalDistributionViewSet, basename='regionaldistribution')
router.register(r'transmission-loss', TransmissionLossViewSet, basename='transmissionloss')
router.register(r'global-nrw', GlobalNRWPerformanceViewSet, basename='globalnrw')
router.register(r'commercial-dashboard-reports', CommercialDashboardReportViewSet, basename='commercialdashboardreport')
router.register(r'commercial-dashboard-sections', CommercialDashboardSectionViewSet, basename='commercialdashboardsection')
router.register(r'commercial-dashboard-kpis', CommercialDashboardKPIViewSet, basename='commercialdashboardkpi')
router.register(r'commercial-dashboard-monthly-values', CommercialDashboardMonthlyValueViewSet, basename='commercialdashboardmonthlyvalue')
router.register(r'commercial-dashboard-snapshots', CommercialDashboardSnapshotViewSet, basename='commercialdashboardsnapshot')

urlpatterns = [
    path('', include(router.urls)),
]
