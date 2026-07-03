from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ProductionZoneAllocationRuleViewSet,
    WaterBalanceModelViewSet,
    WaterBalanceNodeInputViewSet,
    WaterBalanceNodeViewSet,
    WaterBalanceRuleViewSet,
)

app_name = 'water_balance'

router = DefaultRouter()
router.register(r'allocation-rules', ProductionZoneAllocationRuleViewSet, basename='allocation-rule')
router.register(r'nodes', WaterBalanceNodeViewSet, basename='water-balance-node')
router.register(r'models', WaterBalanceModelViewSet, basename='water-balance-model')
router.register(r'rules', WaterBalanceRuleViewSet, basename='water-balance-rule')
router.register(r'node-inputs', WaterBalanceNodeInputViewSet, basename='water-balance-node-input')

urlpatterns = [
    path('', include(router.urls)),
]
