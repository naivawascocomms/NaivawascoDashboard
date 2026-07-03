from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.exceptions import ValidationError
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
    ProductionZoneAllocationRule,
    WaterBalanceModel,
    WaterBalanceNode,
    WaterBalanceNodeInput,
    WaterBalanceRule,
)


def _parse_optional_int(query_params, name):
    value = query_params.get(name)
    if value in (None, ''):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError({name: 'Must be an integer.'})


def _parse_dashboard_params(request, require_month=False):
    params = {
        'year': _parse_optional_int(request.query_params, 'year'),
        'month': _parse_optional_int(request.query_params, 'month'),
        'fy_year': _parse_optional_int(request.query_params, 'fy_year'),
        'up_to_month': _parse_optional_int(request.query_params, 'up_to_month'),
        'anchor_year': _parse_optional_int(request.query_params, 'anchor_year'),
        'anchor_month': _parse_optional_int(request.query_params, 'anchor_month'),
        'region': _parse_optional_int(request.query_params, 'region'),
        'zone': _parse_optional_int(request.query_params, 'zone'),
        'production_site': _parse_optional_int(request.query_params, 'production_site'),
    }
    if require_month and (params['year'] is None or params['month'] is None):
        raise ValidationError({'detail': 'year and month are required.'})
    if params['month'] is not None and not 1 <= params['month'] <= 12:
        raise ValidationError({'month': 'Must be between 1 and 12.'})
    if params['up_to_month'] is not None and not 1 <= params['up_to_month'] <= 12:
        raise ValidationError({'up_to_month': 'Must be between 1 and 12.'})
    if params['anchor_month'] is not None and not 1 <= params['anchor_month'] <= 12:
        raise ValidationError({'anchor_month': 'Must be between 1 and 12.'})
    return params
from .serializers import (
    ConfiguredSourceAllocationQuerySerializer,
    ProductionZoneAllocationRuleSerializer,
    SourceAllocationQuerySerializer,
    WaterBalanceModelSerializer,
    WaterBalanceNodeInputSerializer,
    WaterBalanceNodeSerializer,
    WaterBalanceRuleSerializer,
    ZoneCycleSourceAllocationQuerySerializer,
)
from .services import (
    calculate_configured_source_attributions,
    calculate_configured_source_attributions_for_zone_cycle,
    calculate_source_allocations,
    distribution_dashboard_from_balance,
    distribution_fy_trend_from_balance,
    distribution_zone_summaries_from_balance,
    global_nrw_from_balance,
    production_dashboard_from_balance,
)


class ProductionZoneAllocationRuleViewSet(viewsets.ModelViewSet):
    queryset = ProductionZoneAllocationRule.objects.select_related(
        'production_site',
        'production_site__region',
        'zone',
        'zone__region',
    ).all()
    serializer_class = ProductionZoneAllocationRuleSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        'production_site',
        'production_site__region',
        'zone',
        'zone__region',
        'method',
        'rule_type',
        'is_active',
    ]
    search_fields = [
        'production_site__name',
        'production_site__code',
        'zone__name',
        'zone__code',
        'reason',
        'notes',
    ]
    ordering_fields = [
        'effective_start_date',
        'effective_end_date',
        'basis_value',
        'priority',
        'updated_at',
    ]

    @action(detail=False, methods=['get'], url_path='source-allocations')
    def source_allocations(self, request):
        serializer = SourceAllocationQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        params = serializer.validated_data
        data = calculate_source_allocations(
            start_date=params['start_date'],
            end_date=params['end_date'],
            zone_id=params.get('zone'),
            production_site_id=params.get('production_site'),
        )
        return Response(data)


class WaterBalanceNodeViewSet(viewsets.ModelViewSet):
    queryset = WaterBalanceNode.objects.select_related('production_site').all()
    serializer_class = WaterBalanceNodeSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['node_type', 'production_site', 'is_active']
    search_fields = ['name', 'code', 'production_site__name', 'production_site__code', 'notes']
    ordering_fields = ['name', 'code', 'node_type', 'updated_at']


class WaterBalanceModelViewSet(viewsets.ModelViewSet):
    queryset = WaterBalanceModel.objects.select_related('zone', 'zone__region').all()
    serializer_class = WaterBalanceModelSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['zone', 'zone__region', 'is_active']
    search_fields = ['name', 'zone__name', 'zone__code', 'notes']
    ordering_fields = ['effective_start_date', 'effective_end_date', 'updated_at']

    @action(detail=False, methods=['get'], url_path='source-attributions')
    def source_attributions(self, request):
        serializer = ConfiguredSourceAllocationQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        params = serializer.validated_data
        data = calculate_configured_source_attributions(
            start_date=params['start_date'],
            end_date=params['end_date'],
            zone_id=params.get('zone'),
            production_site_id=params.get('production_site'),
        )
        return Response(data)

    @action(detail=False, methods=['get'], url_path='source-attributions-by-zone-cycle')
    def source_attributions_by_zone_cycle(self, request):
        serializer = ZoneCycleSourceAllocationQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        params = serializer.validated_data
        data = calculate_configured_source_attributions_for_zone_cycle(
            year=params['year'],
            month=params['month'],
            zone_id=params['zone'],
            production_site_id=params.get('production_site'),
        )
        return Response(data)

    @action(detail=False, methods=['get'], url_path='production-dashboard')
    def production_dashboard(self, request):
        params = _parse_dashboard_params(request)
        data = production_dashboard_from_balance(
            year=params.get('year'),
            month=params.get('month'),
            fy_year=params.get('fy_year'),
            region_id=params.get('region'),
            production_site_id=params.get('production_site'),
        )
        return Response(data)

    @action(detail=False, methods=['get'], url_path='distribution-zone-summaries')
    def distribution_zone_summaries(self, request):
        params = _parse_dashboard_params(request, require_month=True)
        rows = distribution_zone_summaries_from_balance(
            year=params['year'],
            month=params['month'],
            zone_id=params.get('zone'),
            region_id=params.get('region'),
        )
        return Response({
            'count': len(rows),
            'next': None,
            'previous': None,
            'results': rows,
        })

    @action(detail=False, methods=['get'], url_path='distribution-dashboard')
    def distribution_dashboard(self, request):
        params = _parse_dashboard_params(request, require_month=True)
        data = distribution_dashboard_from_balance(
            year=params['year'],
            month=params['month'],
            zone_id=params.get('zone'),
            region_id=params.get('region'),
        )
        return Response(data)

    @action(detail=False, methods=['get'], url_path='global-nrw')
    def global_nrw(self, request):
        params = _parse_dashboard_params(request, require_month=True)
        data = global_nrw_from_balance(
            year=params['year'],
            month=params['month'],
            region_id=params.get('region'),
        )
        return Response(data)

    @action(detail=False, methods=['get'], url_path='distribution-fy-trend')
    def distribution_fy_trend(self, request):
        mode = (request.query_params.get('mode') or 'fy').strip().lower()
        params = _parse_dashboard_params(request, require_month=False)
        if mode == 'rolling_12' and (params.get('anchor_year') is None or params.get('anchor_month') is None):
            raise ValidationError({'detail': 'anchor_year and anchor_month are required for rolling_12 mode.'})
        if mode != 'rolling_12' and params.get('fy_year') is None:
            raise ValidationError({'detail': 'fy_year is required.'})
        data = distribution_fy_trend_from_balance(
            mode=mode,
            fy_year=params.get('fy_year'),
            up_to_month=params.get('up_to_month') or 6,
            anchor_year=params.get('anchor_year'),
            anchor_month=params.get('anchor_month'),
            region_id=params.get('region'),
        )
        return Response(data)


class WaterBalanceRuleViewSet(viewsets.ModelViewSet):
    queryset = WaterBalanceRule.objects.select_related(
        'balance_model',
        'balance_model__zone',
        'balance_model__zone__region',
        'production_site',
        'water_meter',
        'mixing_node',
    ).all()
    serializer_class = WaterBalanceRuleSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        'balance_model',
        'balance_model__zone',
        'production_site',
        'method',
        'confidence',
        'mixing_node',
        'is_active',
    ]
    search_fields = [
        'balance_model__name',
        'balance_model__zone__name',
        'balance_model__zone__code',
        'production_site__name',
        'production_site__code',
        'route_name',
        'notes',
    ]
    ordering_fields = ['priority', 'effective_start_date', 'effective_end_date', 'updated_at']


class WaterBalanceNodeInputViewSet(viewsets.ModelViewSet):
    queryset = WaterBalanceNodeInput.objects.select_related(
        'node',
        'production_site',
        'water_meter',
    ).all()
    serializer_class = WaterBalanceNodeInputSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['node', 'production_site', 'input_method', 'confidence', 'is_active']
    search_fields = [
        'node__name',
        'node__code',
        'production_site__name',
        'production_site__code',
        'water_meter__display_name',
        'water_meter__meter_number',
        'notes',
    ]
    ordering_fields = ['priority', 'effective_start_date', 'effective_end_date', 'updated_at']
