# production/views.py

from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Avg, Q, Count, Min
from django.utils import timezone
from datetime import datetime, timedelta
from decimal import Decimal

from .models import (
    Region, ProductionSite, WaterSource, Meter, MeterReading,
    ProductionTarget, DailyProduction, MonthlyProduction, WaterQualityTest,
    CompanyMonthlySummary,
)
from .serializers import (
    RegionSerializer, ProductionSiteListSerializer, ProductionSiteDetailSerializer,
    WaterSourceSerializer, MeterSerializer, MeterReadingSerializer,
    MeterReadingCreateSerializer, ProductionTargetSerializer,
    DailyProductionSerializer, MonthlyProductionSerializer,
    MonthlyProductionSummarySerializer, WaterQualityTestSerializer,
    DashboardSummarySerializer, ProductionComparisonSerializer,
    CompanyMonthlySummarySerializer, MonthlyProductionFYSiteSummarySerializer,
)
from .utils import refresh_production_for_site_dates


class RegionViewSet(viewsets.ModelViewSet):
    """ViewSet for Region CRUD operations"""
    queryset = Region.objects.all()
    serializer_class = RegionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'code']
    ordering = ['name']
    
    @action(detail=True, methods=['get'])
    def production_sites(self, request, pk=None):
        """Get all production sites in this region"""
        region = self.get_object()
        sites = region.production_sites.filter(is_active=True)
        serializer = ProductionSiteListSerializer(sites, many=True)
        return Response(serializer.data)


class ProductionSiteViewSet(viewsets.ModelViewSet):
    """ViewSet for ProductionSite CRUD operations"""
    queryset = ProductionSite.objects.select_related('region').all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['region', 'site_type', 'is_active', 'has_solar']
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'code']
    ordering = ['name']
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ProductionSiteDetailSerializer
        return ProductionSiteListSerializer
    
    @action(detail=True, methods=['get'])
    def water_sources(self, request, pk=None):
        """Get all water sources for this production site"""
        site = self.get_object()
        sources = site.water_sources.filter(is_active=True)
        serializer = WaterSourceSerializer(sources, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def meters(self, request, pk=None):
        """Get all meters for this production site"""
        site = self.get_object()
        meters = site.meters.filter(is_active=True)
        serializer = MeterSerializer(meters, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def monthly_performance(self, request, pk=None):
        """Get monthly performance for this production site"""
        site = self.get_object()
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        
        queryset = site.monthly_production.all()
        if year:
            queryset = queryset.filter(year=year)
        if month:
            queryset = queryset.filter(month=month)
        
        serializer = MonthlyProductionSerializer(queryset, many=True)
        return Response(serializer.data)


class WaterSourceViewSet(viewsets.ModelViewSet):
    """ViewSet for WaterSource CRUD operations"""
    queryset = WaterSource.objects.select_related('production_site').all()
    serializer_class = WaterSourceSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['production_site', 'source_type', 'is_active']
    search_fields = ['name', 'code', 'production_site__name']
    ordering_fields = ['name', 'production_site']
    ordering = ['production_site', 'name']
    
    @action(detail=True, methods=['get'])
    def meters(self, request, pk=None):
        """Get all meters for this water source"""
        source = self.get_object()
        meters = source.meters.filter(is_active=True)
        serializer = MeterSerializer(meters, many=True)
        return Response(serializer.data)


class MeterViewSet(viewsets.ModelViewSet):
    """ViewSet for Meter CRUD operations"""
    queryset = Meter.objects.select_related('production_site', 'water_source').all()
    serializer_class = MeterSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['production_site', 'water_source', 'meter_type', 'is_active']
    search_fields = ['meter_number', 'production_site__name']
    ordering_fields = ['meter_number', 'production_site']
    ordering = ['production_site', 'meter_type']
    
    @action(detail=True, methods=['get'])
    def readings(self, request, pk=None):
        """Get readings for this meter"""
        meter = self.get_object()
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        queryset = meter.readings.all()
        if start_date:
            queryset = queryset.filter(reading_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(reading_date__lte=end_date)
        
        serializer = MeterReadingSerializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def latest_reading(self, request, pk=None):
        """Get the latest reading for this meter"""
        meter = self.get_object()
        reading = meter.readings.first()
        if reading:
            serializer = MeterReadingSerializer(reading)
            return Response(serializer.data)
        return Response(
            {'detail': 'No readings found for this meter'},
            status=status.HTTP_404_NOT_FOUND
        )


class MeterReadingViewSet(viewsets.ModelViewSet):
    """ViewSet for MeterReading CRUD operations"""
    queryset = MeterReading.objects.select_related('meter__production_site').all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        'meter', 'meter__production_site', 'reading_date',
        'is_validated', 'is_anomaly', 'reading_method'
    ]
    search_fields = ['meter__meter_number', 'meter__production_site__name']
    ordering_fields = ['reading_date', 'reading_time']
    ordering = ['-reading_date', '-reading_time']
    
    def get_serializer_class(self):
        if self.action == 'create':
            return MeterReadingCreateSerializer
        return MeterReadingSerializer
    
    @action(detail=False, methods=['post'])
    def bulk_create(self, request):
        """Create multiple meter readings at once"""
        serializer = MeterReadingCreateSerializer(data=request.data, many=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'])
    def validate_readings(self, request):
        """Validate multiple readings"""
        reading_ids = request.data.get('reading_ids', [])
        if not reading_ids:
            return Response(
                {'detail': 'reading_ids is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        readings = list(MeterReading.objects.filter(id__in=reading_ids).select_related('meter__production_site'))
        timestamp = timezone.now()
        affected = []
        for reading in readings:
            reading.is_validated = True
            reading.validated_by = request.user.username
            reading.validated_at = timestamp
            reading.save(update_fields=['is_validated', 'validated_by', 'validated_at', 'updated_at'])
            if reading.meter_id:
                affected.append((reading.meter.production_site_id, reading.reading_date))

        refresh_production_for_site_dates(affected)
        
        return Response({
            'detail': f'{len(readings)} readings validated successfully'
        })


class ProductionTargetViewSet(viewsets.ModelViewSet):
    """ViewSet for ProductionTarget CRUD operations"""
    queryset = ProductionTarget.objects.select_related('production_site').all()
    serializer_class = ProductionTargetSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['production_site', 'year', 'month']
    ordering_fields = ['year', 'month', 'production_site']
    ordering = ['-year', '-month', 'production_site']
    
    @action(detail=False, methods=['get'])
    def by_period(self, request):
        """Get targets for a specific period"""
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        
        if not year or not month:
            return Response(
                {'detail': 'year and month are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        targets = self.queryset.filter(year=year, month=month)
        serializer = self.get_serializer(targets, many=True)
        return Response(serializer.data)


class DailyProductionViewSet(viewsets.ModelViewSet):
    """ViewSet for DailyProduction CRUD operations"""
    queryset = DailyProduction.objects.select_related('production_site').all()
    serializer_class = DailyProductionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = [
        'production_site', 'production_date', 'is_validated', 'is_complete'
    ]
    ordering_fields = ['production_date', 'production_site']
    ordering = ['-production_date', 'production_site']
    
    @action(detail=False, methods=['get'])
    def by_date_range(self, request):
        """Get daily production for a date range"""
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        production_site = request.query_params.get('production_site')
        
        if not start_date or not end_date:
            return Response(
                {'detail': 'start_date and end_date are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        queryset = self.queryset.filter(
            production_date__gte=start_date,
            production_date__lte=end_date
        )
        
        if production_site:
            queryset = queryset.filter(production_site_id=production_site)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def validate_records(self, request):
        """Validate multiple daily production records"""
        record_ids = request.data.get('record_ids', [])
        if not record_ids:
            return Response(
                {'detail': 'record_ids is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        records = DailyProduction.objects.filter(id__in=record_ids)
        records.update(is_validated=True)
        
        return Response({
            'detail': f'{records.count()} records validated successfully'
        })


class MonthlyProductionViewSet(viewsets.ModelViewSet):
    """ViewSet for MonthlyProduction CRUD operations"""
    queryset = MonthlyProduction.objects.select_related(
        'production_site__region', 'target'
    ).all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = [
        'production_site', 'production_site__region', 'year', 'month', 'is_finalized'
    ]
    ordering_fields = ['year', 'month', 'production_site']
    ordering = ['-year', '-month', 'production_site']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return MonthlyProductionSummarySerializer
        return MonthlyProductionSerializer

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        records = self._supplement_monthly_records(queryset, request)

        page = self.paginate_queryset(records)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(records, many=True)
        return Response(serializer.data)

    def _supplement_monthly_records(self, queryset, request):
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        region = request.query_params.get('production_site__region')
        production_site = request.query_params.get('production_site')

        records = list(queryset.select_related('production_site__region', 'target'))
        if year is None or month is None:
            return records

        try:
            year = int(year)
            month = int(month)
        except ValueError:
            return records

        existing_by_site = {record.production_site_id: record for record in records}

        target_qs = ProductionTarget.objects.select_related('production_site__region').filter(
            year=year,
            month=month,
        )
        if region:
            target_qs = target_qs.filter(production_site__region_id=int(region))
        if production_site:
            target_qs = target_qs.filter(production_site_id=int(production_site))

        for target in target_qs:
            record = existing_by_site.get(target.production_site_id)
            if record is not None:
                if record.target_id is None:
                    record.target = target
                    record.target_id = target.id
                continue

            placeholder = MonthlyProduction(
                production_site=target.production_site,
                target=target,
                year=year,
                month=month,
                water_abstracted_m3=Decimal('0'),
                water_supplied_m3=Decimal('0'),
                water_received_m3=Decimal('0'),
                production_loss_m3=Decimal('0'),
                water_available_for_sale_m3=Decimal('0'),
                power_grid_kwh=Decimal('0'),
                power_solar_kwh=Decimal('0'),
                total_power_kwh=Decimal('0'),
                power_costs=Decimal('0'),
                repair_maintenance_costs=Decimal('0'),
                abstraction_fee=Decimal('0'),
                chemical_costs=Decimal('0'),
                total_direct_costs=Decimal('0'),
                is_finalized=False,
            )
            placeholder.id = -target.id
            existing_by_site[target.production_site_id] = placeholder
            records.append(placeholder)

        return sorted(
            records,
            key=lambda record: (
                -record.year,
                -record.month,
                record.production_site.name,
            ),
        )

    @action(detail=False, methods=['get'])
    def fy_site_totals(self, request):
        """Return one FY-aggregated record per production site."""
        fy_year = request.query_params.get('fy_year')
        region = request.query_params.get('region')
        production_site = request.query_params.get('production_site')

        if fy_year is None:
            return Response(
                {'detail': 'fy_year is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            fy_year = int(fy_year)
            base_qs = self.queryset.filter(
                Q(year=fy_year, month__gte=7) | Q(year=fy_year + 1, month__lte=6)
            )

            if region:
                base_qs = base_qs.filter(production_site__region_id=int(region))
            if production_site:
                base_qs = base_qs.filter(production_site_id=int(production_site))
        except ValueError:
            return Response(
                {'detail': 'fy_year, region, and production_site must be valid integers'},
                status=status.HTTP_400_BAD_REQUEST
            )

        grouped = base_qs.values(
            'production_site',
            'production_site__name',
            'production_site__code',
            'production_site__region__name',
        ).annotate(
            water_abstracted_m3=Sum('water_abstracted_m3'),
            water_supplied_m3=Sum('water_supplied_m3'),
            water_received_m3=Sum('water_received_m3'),
            production_loss_m3=Sum('production_loss_m3'),
            water_available_for_sale_m3=Sum('water_available_for_sale_m3'),
            power_grid_kwh=Sum('power_grid_kwh'),
            power_solar_kwh=Sum('power_solar_kwh'),
            total_power_kwh=Sum('total_power_kwh'),
            power_costs=Sum('power_costs'),
            repair_maintenance_costs=Sum('repair_maintenance_costs'),
            abstraction_fee=Sum('abstraction_fee'),
            chemical_costs=Sum('chemical_costs'),
            total_direct_costs=Sum('total_direct_costs'),
            is_finalized=Min('is_finalized'),
        ).order_by('production_site__name')

        target_qs = ProductionTarget.objects.filter(
            Q(year=fy_year, month__gte=7) | Q(year=fy_year + 1, month__lte=6)
        )
        if region:
            target_qs = target_qs.filter(production_site__region_id=int(region))
        if production_site:
            target_qs = target_qs.filter(production_site_id=int(production_site))

        targets_by_site = {
            row['production_site']: row
            for row in target_qs.values('production_site').annotate(
                water_abstraction_target_m3=Sum('water_abstraction_target_m3'),
                power_grid_target_kwh=Sum('power_grid_target_kwh'),
                power_solar_target_kwh=Sum('power_solar_target_kwh'),
            )
        }

        results = []
        for row in grouped:
            site_id = row['production_site']
            target_row = targets_by_site.get(site_id, {})

            total_water = row['water_abstracted_m3'] or 0
            total_loss = row['production_loss_m3'] or 0
            total_power = row['total_power_kwh'] or 0
            total_solar = row['power_solar_kwh'] or 0
            total_power_costs = row['power_costs'] or 0
            total_direct_costs = row['total_direct_costs'] or 0

            target_water = target_row.get('water_abstraction_target_m3') or 0
            target_grid = target_row.get('power_grid_target_kwh') or 0
            target_solar = target_row.get('power_solar_target_kwh') or 0
            target_total_power = target_grid + target_solar

            production_loss_percentage = (total_loss / total_water * 100) if total_water else 0
            solar_percentage = (total_solar / total_power * 100) if total_power else 0
            power_efficiency = (total_power / total_water) if total_water else None
            water_realization = (total_water / target_water * 100) if target_water else 0
            power_cost_per_m3 = (total_power_costs / total_water) if total_water else None
            power_cost_per_kwh = (total_power_costs / total_power) if total_power else None
            total_cost_per_m3 = (total_direct_costs / total_water) if total_water else None
            target_efficiency = (target_total_power / target_water) if target_water else None

            results.append({
                'id': site_id,
                'production_site': site_id,
                'production_site_name': row['production_site__name'],
                'production_site_code': row['production_site__code'],
                'region_name': row['production_site__region__name'],
                'year': fy_year,
                'month': None,
                'water_abstracted_m3': total_water,
                'water_supplied_m3': row['water_supplied_m3'] or 0,
                'water_received_m3': row['water_received_m3'] or 0,
                'production_loss_m3': total_loss,
                'water_available_for_sale_m3': row['water_available_for_sale_m3'] or 0,
                'production_loss_percentage': production_loss_percentage,
                'power_grid_kwh': row['power_grid_kwh'] or 0,
                'power_solar_kwh': total_solar,
                'total_power_kwh': total_power,
                'solar_percentage': solar_percentage,
                'power_efficiency_kwh_per_m3': power_efficiency,
                'power_costs': total_power_costs,
                'repair_maintenance_costs': row['repair_maintenance_costs'] or 0,
                'abstraction_fee': row['abstraction_fee'] or 0,
                'chemical_costs': row['chemical_costs'] or 0,
                'total_direct_costs': total_direct_costs,
                'power_cost_per_m3': power_cost_per_m3,
                'power_cost_per_kwh': power_cost_per_kwh,
                'total_cost_per_m3': total_cost_per_m3,
                'water_abstraction_realization_percent': water_realization,
                'is_finalized': bool(row['is_finalized']),
                'target_details': {
                    'water_abstraction_target_m3': target_water,
                    'power_efficiency_target_kwh_per_m3': target_efficiency,
                },
            })

        serializer = MonthlyProductionFYSiteSummarySerializer(results, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def dashboard_summary(self, request):
        """Get aggregated dashboard summary.

        Supports two filtering modes:
          - fy_year=<n>  — full financial year (Jul n – Jun n+1)
          - year + optional month — specific calendar period
        """
        fy_year = request.query_params.get('fy_year')
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        region = request.query_params.get('region')
        production_site = request.query_params.get('production_site')

        queryset = self.queryset
        fy_mode = False
        target_qs = ProductionTarget.objects.none()

        try:
            if fy_year is not None:
                fy_year = int(fy_year)
                fy_mode = True
                queryset = queryset.filter(
                    Q(year=fy_year, month__gte=7) | Q(year=fy_year + 1, month__lte=6)
                )
            else:
                if year is not None:
                    year = int(year)
                    queryset = queryset.filter(year=year)

                if month is not None:
                    month = int(month)
                    if month < 1 or month > 12:
                        return Response(
                            {'detail': 'month must be between 1 and 12'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    queryset = queryset.filter(month=month)

            if region:
                queryset = queryset.filter(production_site__region_id=int(region))

            if production_site:
                queryset = queryset.filter(production_site_id=int(production_site))

        except ValueError:
            return Response(
                {'detail': 'fy_year, year, month, region, and production_site must be valid integers'},
                status=status.HTTP_400_BAD_REQUEST
            )

        aggregated = queryset.aggregate(
            total_water_abstracted=Sum('water_abstracted_m3'),
            total_water_received=Sum('water_received_m3'),
            total_production_loss=Sum('production_loss_m3'),
            total_water_supplied=Sum('water_supplied_m3'),
            total_power_consumption=Sum('total_power_kwh'),
            total_solar_power=Sum('power_solar_kwh'),
            total_grid_power=Sum('power_grid_kwh'),
            total_costs=Sum('total_direct_costs'),
            total_power_costs=Sum('power_costs'),
            total_rm_costs=Sum('repair_maintenance_costs'),
            total_abstraction_fee=Sum('abstraction_fee'),
            total_chemical_costs=Sum('chemical_costs'),
            avg_efficiency=Avg('power_efficiency_kwh_per_m3'),
            avg_realization=Avg('water_abstraction_realization_percent'),
        )

        total_water = aggregated['total_water_abstracted'] or 0
        total_received = aggregated['total_water_received'] or 0
        total_loss = aggregated['total_production_loss'] or 0
        total_supplied = aggregated['total_water_supplied'] or 0
        total_power = aggregated['total_power_consumption'] or 0
        total_solar = aggregated['total_solar_power'] or 0
        total_grid = aggregated['total_grid_power'] or 0
        total_costs = aggregated['total_costs'] or 0

        loss_percentage = (total_loss / total_water * 100) if total_water else 0
        solar_percentage = (total_solar / total_power * 100) if total_power else 0
        avg_cost_per_m3 = (total_costs / total_water) if total_water else 0
        efficiency = (total_power / total_water) if total_water else 0

        # ── Aggregate targets for the same scope ────────────────────────
        if fy_mode:
            target_qs = ProductionTarget.objects.filter(
                Q(year=fy_year, month__gte=7) | Q(year=fy_year + 1, month__lte=6)
            )
        else:
            target_filters = {}
            if year is not None and month is not None:
                target_filters['year'] = year
                target_filters['month'] = month
            elif year is not None:
                target_filters['year'] = year
            target_qs = ProductionTarget.objects.filter(**target_filters)

        if region:
            target_qs = target_qs.filter(production_site__region_id=int(region))
        if production_site:
            target_qs = target_qs.filter(production_site_id=int(production_site))

        target_agg = target_qs.aggregate(
            target_water_abstracted=Sum('water_abstraction_target_m3'),
            target_water_supplied=Sum('water_supply_target_m3'),
            target_production_loss=Sum('production_loss_target_m3'),
            target_power_grid=Sum('power_grid_target_kwh'),
            target_power_solar=Sum('power_solar_target_kwh'),
        )

        t_water = target_agg['target_water_abstracted'] or 0
        t_supplied = target_agg['target_water_supplied'] or 0
        t_loss = target_agg['target_production_loss'] or 0
        t_grid = target_agg['target_power_grid'] or 0
        t_solar = target_agg['target_power_solar'] or 0
        t_power = t_grid + t_solar
        t_loss_pct = (t_loss / t_water * 100) if t_water else 0
        t_solar_pct = (t_solar / t_power * 100) if t_power else 0
        t_efficiency = (t_power / t_water) if t_water else 0
        site_ids = set(queryset.values_list('production_site_id', flat=True))
        site_ids.update(target_qs.values_list('production_site_id', flat=True))

        if fy_mode:
            period = f"FY {fy_year}/{str(fy_year + 1)[-2:]}"
        elif year is not None and month is not None:
            period = f"{year}-{month:02d}"
        elif year is not None:
            period = str(year)
        else:
            period = 'All periods'

        summary = {
            'period': period,
            'region': region or 'All regions',
            'production_site': production_site or 'All sites',
            'total_sites': len(site_ids),
            'active_sites': ProductionSite.objects.filter(
                id__in=site_ids,
                is_active=True,
            ).count(),
            # Actuals
            'total_water_abstracted': total_water,
            'total_water_received': total_received,
            'total_water_supplied': total_supplied,
            'total_production_loss': total_loss,
            'production_loss_percentage': loss_percentage,
            'total_power_consumption': total_power,
            'total_grid_power': total_grid,
            'total_solar_power': total_solar,
            'solar_power_percentage': solar_percentage,
            'average_power_efficiency': efficiency,
            'total_costs': total_costs,
            'total_power_costs': aggregated['total_power_costs'] or 0,
            'total_rm_costs': aggregated['total_rm_costs'] or 0,
            'total_abstraction_fee': aggregated['total_abstraction_fee'] or 0,
            'total_chemical_costs': aggregated['total_chemical_costs'] or 0,
            'average_cost_per_m3': avg_cost_per_m3,
            'target_realization_percentage': aggregated['avg_realization'] or 0,
            # Targets
            'target_water_abstracted': t_water,
            'target_water_supplied': t_supplied,
            'target_production_loss': t_loss,
            'target_production_loss_percentage': t_loss_pct,
            'target_power_consumption': t_power,
            'target_grid_power': t_grid,
            'target_solar_power': t_solar,
            'target_solar_percentage': t_solar_pct,
            'target_power_efficiency': t_efficiency,
        }

        return Response(summary)    
    
    @action(detail=False, methods=['get'])
    def target_comparison(self, request):
        """Compare actuals vs targets for a period"""
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        
        if not year or not month:
            return Response(
                {'detail': 'year and month are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        actuals = self.queryset.filter(
            year=year, 
            month=month,
            target__isnull=False
        ).select_related('target', 'production_site')
        
        comparisons = []
        for actual in actuals:
            target = actual.target
            comparison = {
                'production_site': actual.production_site.name,
                'year': actual.year,
                'month': actual.month,
                'water_target': target.water_abstraction_target_m3,
                'water_actual': actual.water_abstracted_m3,
                'water_variance': actual.water_abstracted_m3 - target.water_abstraction_target_m3,
                'water_realization': actual.water_abstraction_realization_percent or 0,
                'efficiency_target': target.power_efficiency_target_kwh_per_m3,
                'efficiency_actual': actual.power_efficiency_kwh_per_m3,
                'efficiency_variance': (
                    actual.power_efficiency_kwh_per_m3 - target.power_efficiency_target_kwh_per_m3
                ) if actual.power_efficiency_kwh_per_m3 and target.power_efficiency_target_kwh_per_m3 else 0,
                'loss_target_percent': target.production_loss_target_percent,
                'loss_actual_percent': actual.production_loss_percentage or 0
            }
            comparisons.append(comparison)
        
        serializer = ProductionComparisonSerializer(comparisons, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def finalize_records(self, request):
        """Finalize multiple monthly production records"""
        record_ids = request.data.get('record_ids', [])
        if not record_ids:
            return Response(
                {'detail': 'record_ids is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        records = MonthlyProduction.objects.filter(id__in=record_ids)
        records.update(
            is_finalized=True,
            finalized_by=request.user.username,
            finalized_at=timezone.now()
        )
        
        return Response({
            'detail': f'{records.count()} records finalized successfully'
        })
    
    @action(detail=True, methods=['get'])
    def comparison_with_previous(self, request, pk=None):
        """Compare this month with previous month"""
        current = self.get_object()
        
        # Get previous month
        if current.month == 1:
            prev_year = current.year - 1
            prev_month = 12
        else:
            prev_year = current.year
            prev_month = current.month - 1
        
        try:
            previous = MonthlyProduction.objects.get(
                production_site=current.production_site,
                year=prev_year,
                month=prev_month
            )
            
            comparison = {
                'current_period': f"{current.year}-{current.month:02d}",
                'previous_period': f"{prev_year}-{prev_month:02d}",
                'water_abstracted_change': current.water_abstracted_m3 - previous.water_abstracted_m3,
                'water_abstracted_change_percent': (
                    (current.water_abstracted_m3 - previous.water_abstracted_m3) / 
                    previous.water_abstracted_m3 * 100
                ) if previous.water_abstracted_m3 else 0,
                'power_consumption_change': current.total_power_kwh - previous.total_power_kwh,
                'efficiency_change': (
                    current.power_efficiency_kwh_per_m3 - previous.power_efficiency_kwh_per_m3
                ) if current.power_efficiency_kwh_per_m3 and previous.power_efficiency_kwh_per_m3 else 0,
                'cost_change': current.total_direct_costs - previous.total_direct_costs
            }
            
            return Response(comparison)
        except MonthlyProduction.DoesNotExist:
            return Response(
                {'detail': 'Previous month data not found'},
                status=status.HTTP_404_NOT_FOUND
            )


class WaterQualityTestViewSet(viewsets.ModelViewSet):
    """ViewSet for WaterQualityTest CRUD operations"""
    queryset = WaterQualityTest.objects.select_related('production_site').all()
    serializer_class = WaterQualityTestSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        'production_site', 'test_date', 'test_type',
        'test_location', 'is_compliant'
    ]
    search_fields = ['parameter_tested', 'production_site__name']
    ordering_fields = ['test_date', 'production_site']
    ordering = ['-test_date', 'production_site']

    @action(detail=False, methods=['get'])
    def compliance_summary(self, request):
        """Get compliance summary for a period"""
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        production_site = request.query_params.get('production_site')

        queryset = self.queryset

        if start_date:
            queryset = queryset.filter(test_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(test_date__lte=end_date)
        if production_site:
            queryset = queryset.filter(production_site_id=production_site)

        # Calculate compliance by type and location
        summary = {}
        for test_type in ['CHEMICAL', 'BIOLOGICAL']:
            for location in ['PRODUCTION', 'CONSUMER']:
                tests = queryset.filter(test_type=test_type, test_location=location)
                total = tests.count()
                compliant = tests.filter(is_compliant=True).count()

                key = f"{test_type.lower()}_{location.lower()}"
                summary[key] = {
                    'total_tests': total,
                    'compliant_tests': compliant,
                    'non_compliant_tests': total - compliant,
                    'compliance_percentage': (compliant / total * 100) if total else 100
                }

        return Response(summary)


class CompanyMonthlySummaryViewSet(viewsets.ModelViewSet):
    """ViewSet for CompanyMonthlySummary — company-level costs, quality, regional data"""
    queryset = CompanyMonthlySummary.objects.all()
    serializer_class = CompanyMonthlySummarySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['year', 'month', 'is_finalized']
    ordering_fields = ['year', 'month']
    ordering = ['-year', '-month']
