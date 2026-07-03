# distribution/views.py

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db.models import Sum, Avg, Q, Min, Max
from django.utils import timezone
from django.utils.dateparse import parse_date
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
    DistributionRegion, Zone, DMA, DistributionMeter, DistributionMeterReading,
    BillingCycle, ZoneBillingCycle, CustomerBillingData, DailyDistribution, MonthlyDistribution,
    RegionalDistribution, TransmissionLoss, GlobalNRWPerformance,
    CommercialDashboardReport, CommercialDashboardSection, CommercialDashboardKPI,
    CommercialDashboardMonthlyValue, CommercialDashboardSnapshot
)
from .serializers import (
    DistributionRegionSerializer, ZoneSerializer, DMASerializer,
    DistributionMeterSerializer, DistributionMeterReadingSerializer,
    BillingCycleSerializer, ZoneBillingCycleSerializer, CustomerBillingDataSerializer,
    DailyDistributionSerializer, MonthlyDistributionSerializer,
    RegionalDistributionSerializer, TransmissionLossSerializer,
    GlobalNRWPerformanceSerializer, CommercialDashboardReportSerializer,
    CommercialDashboardSectionSerializer, CommercialDashboardKPISerializer,
    CommercialDashboardMonthlyValueSerializer, CommercialDashboardSnapshotSerializer
)
from .utils import (
    sync_regional_billing_cycles_from_zone_cycles,
    calculate_cycle_aligned_production_reconciliation,
    aggregate_monthly_distribution,
    aggregate_regional_distribution,
    calculate_transmission_loss,
    calculate_global_nrw,
    refresh_commercial_summaries_for_billing_cycle,
)
from production.models import DailyProduction, ProductionSite


FY_MONTH_ORDER = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]


def _serialize_value_pair(numeric_value, text_value):
    raw = text_value or (str(numeric_value) if numeric_value is not None else None)
    return {
        'raw': raw,
        'numeric': numeric_value,
    }


def _safe_realization(actual_numeric, target_numeric):
    if actual_numeric is None or target_numeric in (None, Decimal('0')):
        return None
    return actual_numeric / target_numeric * Decimal('100')


def _selected_fy_months(month):
    if month not in FY_MONTH_ORDER:
        return []
    return FY_MONTH_ORDER[:FY_MONTH_ORDER.index(month) + 1]


def _accumulate_numeric(records, target_attr, actual_attr):
    target_total = Decimal('0')
    actual_total = Decimal('0')
    has_target = False
    has_actual = False

    for record in records:
        target_value = getattr(record, target_attr)
        actual_value = getattr(record, actual_attr)
        if target_value is not None:
            target_total += target_value
            has_target = True
        if actual_value is not None:
            actual_total += actual_value
            has_actual = True

    return (
        target_total if has_target else None,
        actual_total if has_actual else None,
    )


def _decimal_to_float(value):
    if value is None:
        return 0.0
    return float(value)


def _iter_dates(start_date, end_date):
    current = start_date
    while current <= end_date:
        yield current
        current += timedelta(days=1)


class DistributionRegionViewSet(viewsets.ModelViewSet):
    queryset = DistributionRegion.objects.all()
    serializer_class = DistributionRegionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'code']
    ordering = ['name']
    
    @action(detail=True, methods=['get'])
    def zones(self, request, pk=None):
        """Get all zones in this region"""
        region = self.get_object()
        zones = region.zones.filter(is_active=True)
        serializer = ZoneSerializer(zones, many=True)
        return Response(serializer.data)


class ZoneViewSet(viewsets.ModelViewSet):
    queryset = Zone.objects.select_related('region').all()
    serializer_class = ZoneSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['region', 'zone_type', 'is_active']
    search_fields = ['name', 'code']
    ordering = ['region', 'name']
    
    @action(detail=True, methods=['get'])
    def performance(self, request, pk=None):
        """Get performance data for zone"""
        zone = self.get_object()
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        
        queryset = zone.monthly_distribution.all()
        if year:
            queryset = queryset.filter(billing_cycle__year=year)
        if month:
            queryset = queryset.filter(billing_cycle__month=month)
        
        serializer = MonthlyDistributionSerializer(queryset, many=True)
        return Response(serializer.data)


class DMAViewSet(viewsets.ModelViewSet):
    queryset = DMA.objects.select_related('zone__region').all()
    serializer_class = DMASerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['zone', 'zone__region', 'is_active']
    search_fields = ['name', 'code']


class DistributionMeterViewSet(viewsets.ModelViewSet):
    queryset = DistributionMeter.objects.select_related('zone', 'dma').all()
    serializer_class = DistributionMeterSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['meter_location_type', 'zone', 'dma', 'is_active']
    search_fields = ['meter_number']


class DistributionMeterReadingViewSet(viewsets.ModelViewSet):
    queryset = DistributionMeterReading.objects.select_related('meter__zone').all()
    serializer_class = DistributionMeterReadingSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['meter', 'reading_date', 'is_validated', 'is_anomaly']
    ordering = ['-reading_date']


class BillingCycleViewSet(viewsets.ModelViewSet):
    queryset = BillingCycle.objects.select_related('region').all()
    serializer_class = BillingCycleSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['region', 'year', 'month', 'is_finalized']
    ordering = ['-year', '-month', 'region']

    def perform_create(self, serializer):
        instance = serializer.save()
        refresh_commercial_summaries_for_billing_cycle(instance)

    def perform_update(self, serializer):
        instance = serializer.save()
        refresh_commercial_summaries_for_billing_cycle(instance)
    
    @action(detail=False, methods=['get'])
    def current_cycle(self, request):
        """Get current billing cycle for a region"""
        region_id = request.query_params.get('region')
        if not region_id:
            return Response(
                {'detail': 'region parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        today = timezone.localdate()
        cycle = self.queryset.filter(
            region_id=region_id,
            start_date__lte=today,
            end_date__gte=today,
        ).first()
        if cycle is None:
            cycle = self.queryset.filter(region_id=region_id).first()
        if cycle:
            serializer = self.get_serializer(cycle)
            return Response(serializer.data)
        return Response(
            {'detail': 'No billing cycle found'},
            status=status.HTTP_404_NOT_FOUND
        )


class ZoneBillingCycleViewSet(viewsets.ModelViewSet):
    queryset = ZoneBillingCycle.objects.select_related('zone__region').all()
    serializer_class = ZoneBillingCycleSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['zone', 'zone__region', 'year', 'month', 'is_finalized']
    ordering = ['-year', '-month', 'zone']

    def perform_create(self, serializer):
        instance = serializer.save()
        cycle_ids = sync_regional_billing_cycles_from_zone_cycles(
            year=instance.year,
            month=instance.month,
            region=instance.zone.region,
        )
        for cycle in BillingCycle.objects.filter(id__in=cycle_ids):
            refresh_commercial_summaries_for_billing_cycle(cycle)

    def perform_update(self, serializer):
        instance = serializer.save()
        cycle_ids = sync_regional_billing_cycles_from_zone_cycles(
            year=instance.year,
            month=instance.month,
            region=instance.zone.region,
        )
        for cycle in BillingCycle.objects.filter(id__in=cycle_ids):
            refresh_commercial_summaries_for_billing_cycle(cycle)

    def perform_destroy(self, instance):
        year = instance.year
        month = instance.month
        region = instance.zone.region
        super().perform_destroy(instance)
        cycle_ids = sync_regional_billing_cycles_from_zone_cycles(year=year, month=month, region=region)
        for cycle in BillingCycle.objects.filter(id__in=cycle_ids):
            refresh_commercial_summaries_for_billing_cycle(cycle)

    @action(detail=False, methods=['post'])
    def sync_regional(self, request):
        year = request.data.get('year')
        month = request.data.get('month')
        region_id = request.data.get('region')
        if not year or not month:
            return Response({'detail': 'year and month are required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            year = int(year)
            month = int(month)
            region = DistributionRegion.objects.get(pk=int(region_id)) if region_id else None
        except (ValueError, DistributionRegion.DoesNotExist):
            return Response({'detail': 'Invalid year/month/region'}, status=status.HTTP_400_BAD_REQUEST)
        updated_ids = sync_regional_billing_cycles_from_zone_cycles(year=year, month=month, region=region)
        return Response({'updated_billing_cycles': len(updated_ids), 'ids': updated_ids})

    @action(detail=False, methods=['post'])
    def recalculate_month(self, request):
        year = request.data.get('year')
        month = request.data.get('month')
        region_id = request.data.get('region')
        if not year or not month:
            return Response({'detail': 'year and month are required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            year = int(year)
            month = int(month)
            region = DistributionRegion.objects.get(pk=int(region_id)) if region_id else None
        except (ValueError, DistributionRegion.DoesNotExist):
            return Response({'detail': 'Invalid year/month/region'}, status=status.HTTP_400_BAD_REQUEST)

        sync_regional_billing_cycles_from_zone_cycles(year=year, month=month, region=region)

        zone_cycles = ZoneBillingCycle.objects.filter(year=year, month=month).select_related('zone__region')
        if region is not None:
            zone_cycles = zone_cycles.filter(zone__region=region)

        zone_updated = 0
        touched_regions = set()
        for zc in zone_cycles:
            billing_cycle = BillingCycle.objects.filter(
                region=zc.zone.region,
                year=year,
                month=month,
            ).first()
            if not billing_cycle:
                continue
            aggregate_monthly_distribution(zc.zone, billing_cycle)
            touched_regions.add(zc.zone.region_id)
            zone_updated += 1

        regional_updated = 0
        for region_id_value in touched_regions:
            billing_cycle = BillingCycle.objects.filter(region_id=region_id_value, year=year, month=month).first()
            if not billing_cycle:
                continue
            aggregate_regional_distribution(billing_cycle.region, billing_cycle)
            calculate_transmission_loss(billing_cycle)
            calculate_global_nrw(billing_cycle)
            regional_updated += 1

        return Response({
            'year': year,
            'month': month,
            'zones_recalculated': zone_updated,
            'regions_recalculated': regional_updated,
        })

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        zone_cycle = self.get_object()
        closing_date_value = request.data.get('closing_date')
        if not closing_date_value:
            return Response({'detail': 'closing_date is required'}, status=status.HTTP_400_BAD_REQUEST)

        closing_date = parse_date(closing_date_value)
        if closing_date is None:
            return Response({'detail': 'closing_date must be a valid date'}, status=status.HTTP_400_BAD_REQUEST)

        zone_cycle.closing_date = closing_date
        zone_cycle.is_finalized = True
        zone_cycle.save(update_fields=['closing_date', 'is_finalized', 'updated_at'])

        cycle_ids = sync_regional_billing_cycles_from_zone_cycles(
            year=zone_cycle.year,
            month=zone_cycle.month,
            region=zone_cycle.zone.region,
        )
        for cycle in BillingCycle.objects.filter(id__in=cycle_ids):
            refresh_commercial_summaries_for_billing_cycle(cycle)

        next_year = zone_cycle.year + 1 if zone_cycle.month == 12 else zone_cycle.year
        next_month = 1 if zone_cycle.month == 12 else zone_cycle.month + 1
        next_cycle, created = ZoneBillingCycle.objects.get_or_create(
            zone=zone_cycle.zone,
            year=next_year,
            month=next_month,
            defaults={
                'opening_date': closing_date + timedelta(days=1),
                'notes': f'Auto-opened after closing {zone_cycle.year}-{zone_cycle.month:02d}.',
            },
        )

        return Response({
            'closed_cycle': self.get_serializer(zone_cycle).data,
            'next_cycle': self.get_serializer(next_cycle).data,
            'next_cycle_created': created,
            'updated_billing_cycles': len(cycle_ids),
        })


class CustomerBillingDataViewSet(viewsets.ModelViewSet):
    queryset = CustomerBillingData.objects.select_related('zone', 'billing_cycle', 'zone_billing_cycle').all()
    serializer_class = CustomerBillingDataSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = [
        'zone', 'zone__region', 'billing_cycle', 'billing_cycle__year', 'billing_cycle__month',
        'zone_billing_cycle', 'zone_billing_cycle__year', 'zone_billing_cycle__month'
    ]

    def perform_create(self, serializer):
        instance = serializer.save()
        refresh_commercial_summaries_for_billing_cycle(instance.billing_cycle)

    def perform_update(self, serializer):
        instance = serializer.save()
        refresh_commercial_summaries_for_billing_cycle(instance.billing_cycle)

    def perform_destroy(self, instance):
        billing_cycle = instance.billing_cycle
        super().perform_destroy(instance)
        refresh_commercial_summaries_for_billing_cycle(billing_cycle)


class DailyDistributionViewSet(viewsets.ModelViewSet):
    queryset = DailyDistribution.objects.select_related('zone').all()
    serializer_class = DailyDistributionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['zone', 'distribution_date', 'is_validated']
    ordering = ['-distribution_date']

    @action(detail=False, methods=['get'])
    def analysis(self, request):
        start_param = request.query_params.get('start_date')
        end_param = request.query_params.get('end_date')

        validated_production = DailyProduction.objects.filter(is_validated=True)
        validated_distribution = self.queryset.filter(is_validated=True)

        production_bounds = validated_production.aggregate(
            min_date=Min('production_date'),
            max_date=Max('production_date'),
        )
        distribution_bounds = validated_distribution.aggregate(
            min_date=Min('distribution_date'),
            max_date=Max('distribution_date'),
        )

        available_start_candidates = [
            date_value
            for date_value in [
                production_bounds['min_date'],
                distribution_bounds['min_date'],
            ]
            if date_value is not None
        ]
        available_end_candidates = [
            date_value
            for date_value in [
                production_bounds['max_date'],
                distribution_bounds['max_date'],
            ]
            if date_value is not None
        ]

        today = timezone.localdate()
        available_start_date = min(available_start_candidates) if available_start_candidates else today
        available_end_date = max(available_end_candidates) if available_end_candidates else today

        if start_param:
            start_date = parse_date(start_param)
            if start_date is None:
                return Response({'detail': 'start_date must be a valid date'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            start_date = available_end_date.replace(day=1)
            if start_date < available_start_date:
                start_date = available_start_date

        if end_param:
            end_date = parse_date(end_param)
            if end_date is None:
                return Response({'detail': 'end_date must be a valid date'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            end_date = available_end_date

        if start_date > end_date:
            return Response(
                {'detail': 'start_date cannot be after end_date'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        production_range_qs = validated_production.filter(
            production_date__gte=start_date,
            production_date__lte=end_date,
        )
        distribution_range_qs = validated_distribution.filter(
            distribution_date__gte=start_date,
            distribution_date__lte=end_date,
        )

        production_by_site = {
            row['production_site_id']: _decimal_to_float(row['total_volume'])
            for row in production_range_qs.values('production_site_id').annotate(
                total_volume=Sum('water_available_for_sale_m3')
            )
        }
        supply_by_zone = {
            row['zone_id']: _decimal_to_float(row['total_volume'])
            for row in distribution_range_qs.values('zone_id').annotate(
                total_volume=Sum('volume_supplied_m3')
            )
        }

        collection_by_zone = defaultdict(float)
        billing_rows = (
            CustomerBillingData.objects
            .select_related('billing_cycle', 'zone_billing_cycle')
            .filter(
                Q(
                    zone_billing_cycle__opening_date__lte=end_date,
                ) & (
                    Q(zone_billing_cycle__closing_date__isnull=True) |
                    Q(zone_billing_cycle__closing_date__gte=start_date)
                ) |
                Q(zone_billing_cycle__isnull=True, billing_cycle__start_date__lte=end_date, billing_cycle__end_date__gte=start_date)
            )
        )
        for billing in billing_rows:
            cycle_start = (
                billing.zone_billing_cycle.opening_date
                if billing.zone_billing_cycle_id
                else billing.billing_cycle.start_date
            )
            cycle_end = (
                billing.zone_billing_cycle.effective_closing_date
                if billing.zone_billing_cycle_id
                else billing.billing_cycle.end_date
            )
            overlap_start = max(cycle_start, start_date)
            overlap_end = min(cycle_end, end_date)
            if overlap_start > overlap_end:
                continue

            cycle_days = (cycle_end - cycle_start).days + 1
            overlap_days = (overlap_end - overlap_start).days + 1
            revenue = billing.total_revenue
            if revenue is None or revenue == 0:
                revenue = (billing.water_revenue or Decimal('0')) + (billing.sewer_revenue or Decimal('0'))
            if cycle_days > 0:
                collection_by_zone[billing.zone_id] += _decimal_to_float(revenue) * overlap_days / cycle_days

        daily_production_totals = {
            row['production_date']: _decimal_to_float(row['total_volume'])
            for row in production_range_qs.values('production_date').annotate(
                total_volume=Sum('water_available_for_sale_m3')
            )
        }
        daily_supply_totals = {
            row['distribution_date']: _decimal_to_float(row['total_volume'])
            for row in distribution_range_qs.values('distribution_date').annotate(
                total_volume=Sum('volume_supplied_m3')
            )
        }

        active_sites = list(
            ProductionSite.objects.filter(is_active=True)
            .select_related('region')
            .order_by('region__name', 'name')
        )
        active_zones = list(
            Zone.objects.filter(is_active=True)
            .select_related('region')
            .order_by('region__dashboard_order', 'dashboard_order', 'name')
        )
        active_distribution_regions = list(
            DistributionRegion.objects.filter(is_active=True)
            .select_related('production_region')
            .order_by('dashboard_order', 'name')
        )

        sites_by_production_region = defaultdict(list)
        production_region_names = {}
        for site in active_sites:
            volume = production_by_site.get(site.id, 0.0)
            sites_by_production_region[site.region_id].append({
                'id': site.id,
                'name': site.name,
                'code': site.code,
                'volume': volume,
            })
            production_region_names[site.region_id] = site.region.name

        zones_by_distribution_region = defaultdict(list)
        for zone in active_zones:
            collection = collection_by_zone.get(zone.id, 0.0)
            zones_by_distribution_region[zone.region_id].append({
                'id': zone.id,
                'name': zone.name,
                'code': zone.code,
                'volume': supply_by_zone.get(zone.id, 0.0),
                'collection': collection,
            })

        regions = []
        mapped_production_region_ids = set()

        for region in active_distribution_regions:
            mapped_sites = []
            if region.production_region_id:
                mapped_production_region_ids.add(region.production_region_id)
                mapped_sites = sites_by_production_region.get(region.production_region_id, [])
            mapped_zones = zones_by_distribution_region.get(region.id, [])
            total_production = sum(item['volume'] for item in mapped_sites)
            total_supply = sum(item['volume'] for item in mapped_zones)
            total_collection = sum(item['collection'] for item in mapped_zones)
            gap = total_production - total_supply
            gap_percentage = (gap / total_production * 100) if total_production else 0.0

            regions.append({
                'region_id': region.id,
                'region': region.name,
                'production_region_id': region.production_region_id,
                'production_sites': mapped_sites,
                'zones': mapped_zones,
                'total_production': total_production,
                'total_supply': total_supply,
                'total_collection': total_collection,
                'gap': gap,
                'gap_percentage': gap_percentage,
            })

        for production_region_id, mapped_sites in sorted(
            sites_by_production_region.items(),
            key=lambda item: production_region_names.get(item[0], ''),
        ):
            if production_region_id in mapped_production_region_ids:
                continue

            total_production = sum(item['volume'] for item in mapped_sites)
            regions.append({
                'region_id': None,
                'region': production_region_names.get(production_region_id, 'Unmapped Production Region'),
                'production_region_id': production_region_id,
                'production_sites': mapped_sites,
                'zones': [],
                'total_production': total_production,
                'total_supply': 0.0,
                'total_collection': 0.0,
                'gap': total_production,
                'gap_percentage': 100.0 if total_production else 0.0,
            })

        trends = []
        for current_date in _iter_dates(start_date, end_date):
            production_total = daily_production_totals.get(current_date, 0.0)
            supply_total = daily_supply_totals.get(current_date, 0.0)
            trends.append({
                'date': current_date.isoformat(),
                'production': production_total,
                'supply': supply_total,
                'gap': production_total - supply_total,
            })

        total_production = sum(point['production'] for point in trends)
        total_supply = sum(point['supply'] for point in trends)
        total_collection = sum(region['total_collection'] for region in regions)
        gap = total_production - total_supply
        gap_percentage = (gap / total_production * 100) if total_production else 0.0

        return Response({
            'available_start_date': available_start_date.isoformat(),
            'available_end_date': available_end_date.isoformat(),
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'summary': {
                'total_production': total_production,
                'total_supply': total_supply,
                'total_collection': total_collection,
                'gap': gap,
                'gap_percentage': gap_percentage,
                'total_regions': len(regions),
                'total_sites': len(active_sites),
                'total_zones': len(active_zones),
                'days': len(trends),
            },
            'regions': regions,
            'trends': trends,
        })


class MonthlyDistributionViewSet(viewsets.ModelViewSet):
    queryset = MonthlyDistribution.objects.select_related(
        'zone__region', 'billing_cycle', 'zone_billing_cycle'
    ).all()
    serializer_class = MonthlyDistributionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = [
        'zone', 'zone__region', 'billing_cycle__year',
        'billing_cycle__month', 'zone_billing_cycle__year',
        'zone_billing_cycle__month', 'is_finalized'
    ]
    ordering = ['-billing_cycle__year', '-billing_cycle__month', 'zone']
    
    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """Get distribution dashboard data"""
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        region = request.query_params.get('region')
        
        queryset = self.queryset
        
        if year and month:
            queryset = queryset.filter(
                billing_cycle__year=year,
                billing_cycle__month=month
            )
        if region:
            queryset = queryset.filter(zone__region_id=region)
        
        # Aggregate data
        aggregated = queryset.aggregate(
            total_supplied=Sum('volume_supplied_m3'),
            total_billed=Sum('volume_billed_m3'),
            total_nrw=Sum('nrw_m3'),
        )
        total_supplied = aggregated['total_supplied'] or Decimal('0')
        total_nrw = aggregated['total_nrw'] or Decimal('0')
        aggregated['avg_nrw_percent'] = (
            total_nrw / total_supplied * Decimal('100')
            if total_supplied > 0 else Decimal('0')
        )
        
        return Response({
            'summary': aggregated,
            'zone_count': queryset.count(),
            'zones': MonthlyDistributionSerializer(queryset, many=True).data
        })

    @action(detail=False, methods=['get'])
    def fy_trend(self, request):
        """Return trend points aggregated by month (not paginated).

        Modes:
          - mode=fy (default): FY window Jul..selected-month for fy_year.
          - mode=rolling_12: rolling 12-month window ending at anchor_year/anchor_month.
        """
        fy_year = request.query_params.get('fy_year')
        up_to_month = request.query_params.get('up_to_month')
        mode = (request.query_params.get('mode') or 'fy').strip().lower()
        anchor_year = request.query_params.get('anchor_year')
        anchor_month = request.query_params.get('anchor_month')
        region = request.query_params.get('region')

        if mode == 'fy' and fy_year is None:
            return Response({'detail': 'fy_year is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            fy_year = int(fy_year) if fy_year is not None else None
            up_to_month = int(up_to_month) if up_to_month is not None else 6
            anchor_year = int(anchor_year) if anchor_year is not None else None
            anchor_month = int(anchor_month) if anchor_month is not None else None
            if up_to_month < 1 or up_to_month > 12:
                raise ValueError
            if anchor_month is not None and (anchor_month < 1 or anchor_month > 12):
                raise ValueError
            region_id = int(region) if region is not None else None
        except ValueError:
            return Response(
                {'detail': 'Invalid fy_year/up_to_month/anchor_year/anchor_month/region values'},
                status=status.HTTP_400_BAD_REQUEST
            )

        month_labels = {
            7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec',
            1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun',
        }

        periods = []
        query_filter = Q()
        if mode == 'rolling_12':
            if anchor_year is None or anchor_month is None:
                return Response(
                    {'detail': 'anchor_year and anchor_month are required for rolling_12 mode'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            def add_months(y, m, delta):
                total = y * 12 + (m - 1) + delta
                return total // 12, (total % 12) + 1

            for delta in range(-11, 1):
                y, m = add_months(anchor_year, anchor_month, delta)
                periods.append((y, m, month_labels[m], f"{y}-{m:02d}"))
                query_filter |= Q(billing_cycle__year=y, billing_cycle__month=m)
        else:
            fy_month_order = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]
            end_index = fy_month_order.index(up_to_month) if up_to_month in fy_month_order else len(fy_month_order) - 1
            visible_months = fy_month_order[:end_index + 1]
            for m in visible_months:
                y = fy_year if m >= 7 else fy_year + 1
                periods.append((y, m, month_labels[m], f"{y}-{m:02d}"))
            query_filter = (
                Q(billing_cycle__year=fy_year, billing_cycle__month__gte=7) |
                Q(billing_cycle__year=fy_year + 1, billing_cycle__month__lte=6)
            )

        monthly_qs = self.queryset.filter(query_filter)
        if region_id is not None:
            monthly_qs = monthly_qs.filter(zone__region_id=region_id)

        monthly_agg = monthly_qs.values('billing_cycle__year', 'billing_cycle__month').annotate(
            supplied=Sum('volume_supplied_m3'),
            billed=Sum('volume_billed_m3'),
            avg_target=Avg('nrw_target_percentage'),
        )
        month_map = {(row['billing_cycle__year'], row['billing_cycle__month']): row for row in monthly_agg}

        global_qs = GlobalNRWPerformance.objects.filter(query_filter)
        if region_id is not None:
            global_qs = global_qs.filter(billing_cycle__region_id=region_id)
        global_map = {(row['billing_cycle__year'], row['billing_cycle__month']): row for row in global_qs.values(
            'billing_cycle__year',
            'billing_cycle__month',
            'transmission_loss_percentage',
            'global_nrw_target_percentage',
        )}

        points = []
        for year_val, month, label, period_key in periods:
            row = month_map.get((year_val, month))
            if not row:
                row = {'supplied': 0, 'billed': 0, 'avg_target': None}
            supplied = row['supplied'] or 0
            billed = row['billed'] or 0
            nrw_volume = supplied - billed
            nrw_percentage = (nrw_volume / supplied * 100) if supplied else 0

            g_row = global_map.get((year_val, month)) or {}
            target = (
                g_row.get('global_nrw_target_percentage')
                or row['avg_target']
                or 22
            )
            transmission = g_row.get('transmission_loss_percentage') or 0

            points.append({
                'month': label,
                'period': period_key,
                'waterSupplied': supplied,
                'waterBilled': billed,
                'nrwPercentage': nrw_percentage,
                'transmissionLoss': transmission,
                'target': target,
            })

        return Response(points)

    @action(detail=False, methods=['get'])
    def reconciliation(self, request):
        """Cycle-aligned reconciliation bridge between production and distribution."""
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        region_id = request.query_params.get('region')
        if not year or not month:
            return Response({'detail': 'year and month are required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            year = int(year)
            month = int(month)
            region = DistributionRegion.objects.get(pk=int(region_id)) if region_id else None
        except (ValueError, DistributionRegion.DoesNotExist):
            return Response({'detail': 'Invalid year/month/region'}, status=status.HTTP_400_BAD_REQUEST)
        data = calculate_cycle_aligned_production_reconciliation(year=year, month=month, region=region)
        return Response(data)


class RegionalDistributionViewSet(viewsets.ModelViewSet):
    queryset = RegionalDistribution.objects.select_related(
        'region', 'billing_cycle'
    ).all()
    serializer_class = RegionalDistributionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = [
        'region', 'billing_cycle__year', 'billing_cycle__month', 'is_finalized'
    ]


class TransmissionLossViewSet(viewsets.ModelViewSet):
    queryset = TransmissionLoss.objects.select_related('billing_cycle').all()
    serializer_class = TransmissionLossSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['billing_cycle__year', 'billing_cycle__month']


class GlobalNRWPerformanceViewSet(viewsets.ModelViewSet):
    queryset = GlobalNRWPerformance.objects.select_related('billing_cycle').all()
    serializer_class = GlobalNRWPerformanceSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['billing_cycle__year', 'billing_cycle__month']


class CommercialDashboardReportViewSet(viewsets.ModelViewSet):
    queryset = CommercialDashboardReport.objects.all()
    serializer_class = CommercialDashboardReportSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['fiscal_year_start', 'is_active']
    ordering = ['-fiscal_year_start']

    @action(detail=True, methods=['get'])
    def dashboard(self, request, pk=None):
        report = self.get_object()
        selected_month = request.query_params.get('month')
        if selected_month is None:
            if report.current_snapshot_date:
                selected_month = report.current_snapshot_date.month
            else:
                selected_month = timezone.localdate().month
        try:
            selected_month = int(selected_month)
        except ValueError:
            return Response({'detail': 'month must be a valid integer'}, status=status.HTTP_400_BAD_REQUEST)
        if selected_month < 1 or selected_month > 12:
            return Response({'detail': 'month must be between 1 and 12'}, status=status.HTTP_400_BAD_REQUEST)

        selected_year = report.fiscal_year_start if selected_month >= 7 else report.fiscal_year_start + 1
        selected_months = _selected_fy_months(selected_month)

        sections = report.sections.prefetch_related(
            'kpis__zone',
            'kpis__region',
            'kpis__monthly_values',
            'kpis__snapshots',
        ).order_by('display_order')

        section_payload = []
        for section in sections:
            row_payload = []
            for kpi in section.kpis.all().order_by('display_order'):
                monthly_by_month = {value.month: value for value in kpi.monthly_values.all()}
                selected_value = monthly_by_month.get(selected_month)
                snapshot = next(
                    (
                        item for item in kpi.snapshots.all()
                        if item.snapshot_year == selected_year and item.snapshot_month == selected_month
                    ),
                    None,
                )

                if snapshot is not None:
                    monthly_target = _serialize_value_pair(snapshot.monthly_target_numeric, snapshot.monthly_target_text)
                    monthly_actual = _serialize_value_pair(snapshot.monthly_actual_numeric, snapshot.monthly_actual_text)
                    cumulative_target = _serialize_value_pair(snapshot.cumulative_target_numeric, snapshot.cumulative_target_text)
                    cumulative_actual = _serialize_value_pair(snapshot.cumulative_actual_numeric, snapshot.cumulative_actual_text)
                    monthly_realization = snapshot.monthly_realization_percent
                    cumulative_realization = snapshot.cumulative_realization_percent
                else:
                    month_records = [
                        monthly_by_month[month]
                        for month in selected_months
                        if month in monthly_by_month
                    ]
                    cumulative_target_numeric, cumulative_actual_numeric = _accumulate_numeric(
                        month_records,
                        'target_value_numeric',
                        'actual_value_numeric',
                    )
                    monthly_target = _serialize_value_pair(
                        getattr(selected_value, 'target_value_numeric', None),
                        getattr(selected_value, 'target_value_text', ''),
                    )
                    monthly_actual = _serialize_value_pair(
                        getattr(selected_value, 'actual_value_numeric', None),
                        getattr(selected_value, 'actual_value_text', ''),
                    )
                    cumulative_target = _serialize_value_pair(cumulative_target_numeric, '')
                    cumulative_actual = _serialize_value_pair(cumulative_actual_numeric, '')
                    monthly_realization = _safe_realization(
                        getattr(selected_value, 'actual_value_numeric', None),
                        getattr(selected_value, 'target_value_numeric', None),
                    )
                    cumulative_realization = _safe_realization(
                        cumulative_actual_numeric,
                        cumulative_target_numeric,
                    )

                row_payload.append({
                    'id': kpi.id,
                    'label': kpi.label,
                    'unit': kpi.unit,
                    'item_number': kpi.item_number,
                    'subgroup_title': kpi.subgroup_title,
                    'scope_type': kpi.scope_type,
                    'scope_name': kpi.zone.name if kpi.zone_id else (kpi.region.name if kpi.region_id else None),
                    'region_id': kpi.region_id,
                    'zone_id': kpi.zone_id,
                    'is_total': kpi.is_total,
                    'is_summary': kpi.is_summary,
                    'is_percentage': kpi.is_percentage,
                    'monthly_target': monthly_target,
                    'monthly_actual': monthly_actual,
                    'monthly_realization_percent': monthly_realization,
                    'cumulative_target': cumulative_target,
                    'cumulative_actual': cumulative_actual,
                    'cumulative_realization_percent': cumulative_realization,
                    'has_imported_snapshot': snapshot is not None,
                })

            section_payload.append({
                'id': section.id,
                'title': section.title,
                'display_order': section.display_order,
                'rows': row_payload,
            })

        return Response({
            'report': CommercialDashboardReportSerializer(report).data,
            'selected_month': selected_month,
            'selected_year': selected_year,
            'selected_fy_months': selected_months,
            'sections': section_payload,
        })


class CommercialDashboardSectionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CommercialDashboardSection.objects.select_related('report').all()
    serializer_class = CommercialDashboardSectionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['report']


class CommercialDashboardKPIViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CommercialDashboardKPI.objects.select_related('report', 'section', 'region', 'zone').all()
    serializer_class = CommercialDashboardKPISerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['report', 'section', 'scope_type', 'region', 'zone', 'is_total', 'is_summary']
    search_fields = ['label', 'unit', 'subgroup_title']
    ordering = ['display_order']


class CommercialDashboardMonthlyValueViewSet(viewsets.ModelViewSet):
    queryset = CommercialDashboardMonthlyValue.objects.select_related('kpi__report', 'kpi__section').all()
    serializer_class = CommercialDashboardMonthlyValueSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['kpi', 'kpi__report', 'month']
    ordering = ['month', 'kpi']


class CommercialDashboardSnapshotViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CommercialDashboardSnapshot.objects.select_related('kpi__report', 'kpi__section').all()
    serializer_class = CommercialDashboardSnapshotSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['kpi', 'kpi__report', 'snapshot_year', 'snapshot_month']
    ordering = ['snapshot_year', 'snapshot_month', 'kpi']
