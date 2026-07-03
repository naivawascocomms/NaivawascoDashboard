# distribution/utils.py

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Max, Min, Q, Sum

from .models import (
    BillingCycle,
    CustomerBillingData,
    DailyDistribution,
    DistributionMeter,
    DistributionMeterReading,
    GlobalNRWPerformance,
    MonthlyDistribution,
    RegionalDistribution,
    TransmissionLoss,
    Zone,
    ZoneBillingCycle,
    ZoneSupplyConfiguration,
)
from metering.models import DistributionWaterMeterAssignment, WaterMeter, WaterMeterReading
from production.models import DailyProduction, MonthlyProduction


def get_month_bounds(year, month):
    month_start = date(year, month, 1)
    month_end = date(year, month, monthrange(year, month)[1])
    return month_start, month_end


def _active_distribution_assignments(queryset, reading_date):
    return queryset.filter(
        is_active=True,
    ).filter(
        Q(start_date__isnull=True) | Q(start_date__lte=reading_date)
    ).filter(
        Q(end_date__isnull=True) | Q(end_date__gte=reading_date)
    )


def ensure_billing_cycle_for_zone_cycle(zone_cycle):
    if zone_cycle.closing_date is None:
        return None
    cycle, _ = BillingCycle.objects.get_or_create(
        region=zone_cycle.zone.region,
        year=zone_cycle.year,
        month=zone_cycle.month,
        defaults={
            'start_date': zone_cycle.opening_date,
            'end_date': zone_cycle.closing_date,
        }
    )
    return cycle


def get_zone_cycle_dates(zone, year, month, fallback_cycle=None):
    """Resolve commercial zone-cycle dates, falling back to regional envelope dates."""
    zone_cycle = ZoneBillingCycle.objects.filter(
        zone=zone,
        year=year,
        month=month,
    ).first()
    if zone_cycle:
        return zone_cycle.opening_date, zone_cycle.effective_closing_date, zone_cycle
    if fallback_cycle:
        return fallback_cycle.start_date, fallback_cycle.end_date, None
    return None, None, None


def _assignments_for_zone(zone, reading_date, dmas=None):
    queryset = DistributionWaterMeterAssignment.objects.select_related('dma', 'zone', 'water_meter')
    queryset = _active_distribution_assignments(queryset, reading_date)
    if dmas is not None:
        return list(queryset.filter(dma__in=dmas))
    return list(queryset.filter(Q(zone=zone) | Q(dma__zone=zone)))


def resolve_zone_meter_inputs(zone, reading_date):
    """Resolve the shared water meters that define supply for a zone on a given day."""
    try:
        config = zone.supply_configuration
    except ZoneSupplyConfiguration.DoesNotExist:
        config = None

    inputs = []
    seen = set()

    def add_meter(meter, allocation_percentage=Decimal('100')):
        if meter is None:
            return
        key = (meter.id, str(allocation_percentage))
        if key in seen:
            return
        seen.add(key)
        inputs.append({
            'water_meter': meter,
            'allocation_percentage': Decimal(allocation_percentage),
        })

    if config:
        if config.aggregation_method == 'ONE_METER':
            add_meter(config.primary_water_meter)
            if not inputs and config.primary_meter_id:
                legacy_assignment = DistributionWaterMeterAssignment.objects.filter(
                    legacy_distribution_meter_id=config.primary_meter_id
                ).select_related('water_meter').first()
                add_meter(legacy_assignment.water_meter if legacy_assignment else None)
        elif config.aggregation_method == 'SUM_OF_SELECTED_METERS':
            for meter in config.component_water_meters.all():
                add_meter(meter)
            if not inputs and config.component_meters.exists():
                for assignment in DistributionWaterMeterAssignment.objects.filter(
                    legacy_distribution_meter_id__in=config.component_meters.values_list('id', flat=True)
                ).select_related('water_meter'):
                    add_meter(assignment.water_meter)
        elif config.aggregation_method == 'SUM_OF_DMA_METERS':
            assignments = _assignments_for_zone(zone, reading_date, dmas=config.component_dmas.all())
            for assignment in assignments:
                add_meter(assignment.water_meter, assignment.allocation_percentage)
        elif config.aggregation_method == 'CUSTOM_ASSIGNMENTS':
            assignments = _assignments_for_zone(zone, reading_date)
            for assignment in assignments:
                add_meter(assignment.water_meter, assignment.allocation_percentage)

    if not inputs:
        assignments = _assignments_for_zone(zone, reading_date)
        for assignment in assignments:
            add_meter(assignment.water_meter, assignment.allocation_percentage)

    return inputs


def get_impacted_zones_for_water_meter(water_meter):
    zone_ids = set(
        DistributionWaterMeterAssignment.objects.filter(
            water_meter=water_meter,
            is_active=True,
        ).values_list('zone_id', flat=True)
    )
    zone_ids.update(
        DistributionWaterMeterAssignment.objects.filter(
            water_meter=water_meter,
            is_active=True,
            dma__isnull=False,
        ).values_list('dma__zone_id', flat=True)
    )
    zone_ids.update(
        ZoneSupplyConfiguration.objects.filter(primary_water_meter=water_meter).values_list('zone_id', flat=True)
    )
    zone_ids.update(
        ZoneSupplyConfiguration.objects.filter(component_water_meters=water_meter).values_list('zone_id', flat=True)
    )
    return {zone_id for zone_id in zone_ids if zone_id}


def aggregate_daily_distribution(zone, reading_date):
    """Aggregate validated meter readings into a daily distribution record."""
    meter_inputs = resolve_zone_meter_inputs(zone, reading_date)
    meter_ids = [item['water_meter'].id for item in meter_inputs]
    readings = WaterMeterReading.objects.filter(
        water_meter_id__in=meter_ids,
        reading_date=reading_date,
        is_validated=True,
    )

    reading_map = {reading.water_meter_id: reading for reading in readings}
    volume_supplied = Decimal('0')
    for item in meter_inputs:
        reading = reading_map.get(item['water_meter'].id)
        if not reading or reading.consumption is None:
            continue
        volume_supplied += reading.consumption * (item['allocation_percentage'] / Decimal('100'))
    if volume_supplied == 0:
        return None

    is_complete = all(reading_map.get(item['water_meter'].id) is not None for item in meter_inputs)
    daily_dist, _ = DailyDistribution.objects.update_or_create(
        zone=zone,
        distribution_date=reading_date,
        defaults={
            'volume_supplied_m3': volume_supplied,
            'is_complete': is_complete,
        }
    )
    return daily_dist


def refresh_distribution_for_zone_dates(zone_dates):
    """Recalculate daily and commercial distribution summaries for affected zones."""
    if not zone_dates:
        return

    unique_pairs = {(zone_id, reading_date) for zone_id, reading_date in zone_dates if zone_id and reading_date}
    if not unique_pairs:
        return

    zone_map = Zone.objects.select_related('region').in_bulk({zone_id for zone_id, _ in unique_pairs})
    affected_periods = set()
    for zone_id, reading_date in unique_pairs:
        zone = zone_map.get(zone_id)
        if zone is None:
            continue

        daily_dist = aggregate_daily_distribution(zone, reading_date)
        if daily_dist is None:
            DailyDistribution.objects.filter(zone=zone, distribution_date=reading_date).delete()
        elif daily_dist.is_complete and not daily_dist.is_validated:
            daily_dist.is_validated = True
            daily_dist.save(update_fields=['is_validated', 'updated_at'])

        affected_periods.add((zone.region_id, zone_id, reading_date.year, reading_date.month))

    touched_regions = set()
    for region_id, zone_id, year, month in affected_periods:
        zone = zone_map.get(zone_id)
        if zone is None:
            continue

        zone_cycle = ZoneBillingCycle.objects.filter(zone=zone, year=year, month=month).first()
        billing_cycle = BillingCycle.objects.filter(region=zone.region, year=year, month=month).first()
        if zone_cycle or billing_cycle:
            aggregate_monthly_distribution(zone, billing_cycle=billing_cycle, zone_billing_cycle=zone_cycle)

        touched_regions.add((region_id, year, month))

    for region_id, year, month in touched_regions:
        region = zone_map[next(zone_id for rid, zone_id, y, m in affected_periods if rid == region_id and y == year and m == month)].region
        billing_cycle = BillingCycle.objects.filter(region=region, year=year, month=month).first()
        if billing_cycle:
            aggregate_regional_distribution(region, billing_cycle)
            calculate_transmission_loss(billing_cycle)
            calculate_global_nrw(billing_cycle)


def refresh_distribution_for_water_meter_dates(meter_number_dates):
    """Resolve impacted zones for shared water meters and refresh them."""
    if not meter_number_dates:
        return

    zone_dates = set()
    for meter_number, reading_date in meter_number_dates:
        if not meter_number or not reading_date:
            continue
        water_meter = WaterMeter.objects.filter(meter_number=meter_number).first()
        if not water_meter:
            continue
        for zone_id in get_impacted_zones_for_water_meter(water_meter):
            zone_dates.add((zone_id, reading_date))

    refresh_distribution_for_zone_dates(zone_dates)


def aggregate_monthly_distribution(zone, billing_cycle=None, zone_billing_cycle=None):
    """Aggregate commercial supply and billed volume for a zone cycle."""
    if zone_billing_cycle is None and billing_cycle is not None:
        zone_billing_cycle = ZoneBillingCycle.objects.filter(
            zone=zone,
            year=billing_cycle.year,
            month=billing_cycle.month,
        ).first()
    if zone_billing_cycle is not None and billing_cycle is None:
        billing_cycle = ensure_billing_cycle_for_zone_cycle(zone_billing_cycle)
    if billing_cycle is None:
        return None

    start_date, end_date, resolved_zone_cycle = get_zone_cycle_dates(
        zone=zone,
        year=billing_cycle.year,
        month=billing_cycle.month,
        fallback_cycle=billing_cycle,
    )
    if not start_date or not end_date:
        return None

    daily_records = DailyDistribution.objects.filter(
        zone=zone,
        distribution_date__gte=start_date,
        distribution_date__lte=end_date,
        is_validated=True,
    )
    volume_supplied = daily_records.aggregate(total=Sum('volume_supplied_m3'))['total'] or Decimal('0')

    billing_data = None
    if resolved_zone_cycle is not None:
        billing_data = CustomerBillingData.objects.filter(
            zone=zone,
            zone_billing_cycle=resolved_zone_cycle,
        ).first()
    if billing_data is None:
        billing_data = CustomerBillingData.objects.filter(
            zone=zone,
            billing_cycle=billing_cycle,
        ).first()
    volume_billed = billing_data.total_volume_billed_m3 if billing_data else Decimal('0')

    monthly_record, _ = MonthlyDistribution.objects.update_or_create(
        zone=zone,
        billing_cycle=billing_cycle,
        defaults={
            'zone_billing_cycle': resolved_zone_cycle,
            'volume_supplied_m3': volume_supplied,
            'volume_billed_m3': volume_billed,
            'notes': (
                f'Commercial aggregation for {start_date} to {end_date}.'
                if resolved_zone_cycle else
                f'Commercial aggregation using regional fallback window {start_date} to {end_date}.'
            ),
        }
    )
    return monthly_record


def aggregate_regional_distribution(region, billing_cycle):
    """Aggregate commercial zone-cycle summaries to the region envelope."""
    monthly_records = MonthlyDistribution.objects.filter(
        zone__region=region,
        billing_cycle=billing_cycle,
    )
    aggregated = monthly_records.aggregate(
        volume_supplied=Sum('volume_supplied_m3'),
        volume_billed=Sum('volume_billed_m3'),
    )
    billing_totals = CustomerBillingData.objects.filter(
        zone__region=region,
        billing_cycle=billing_cycle,
    ).aggregate(
        amount_billed_water=Sum('water_revenue'),
        amount_billed_sewer=Sum('sewer_revenue'),
        active_water_connections=Sum('number_of_active_connections'),
    )

    regional_record, _ = RegionalDistribution.objects.update_or_create(
        region=region,
        billing_cycle=billing_cycle,
        defaults={
            'volume_supplied_m3': aggregated['volume_supplied'] or Decimal('0'),
            'volume_billed_m3': aggregated['volume_billed'] or Decimal('0'),
            'amount_billed_water': billing_totals['amount_billed_water'] or Decimal('0'),
            'amount_billed_sewer': billing_totals['amount_billed_sewer'] or Decimal('0'),
            'active_water_connections': billing_totals['active_water_connections'] or 0,
        }
    )
    return regional_record


def calculate_transmission_loss(billing_cycle):
    """Commercial-cycle reconciliation bridge between production and zone-cycle billing windows."""
    production_data = MonthlyProduction.objects.filter(
        start_date__lte=billing_cycle.end_date,
        closing_date__gte=billing_cycle.start_date,
    ).aggregate(total_available=Sum('water_available_for_sale_m3'))
    water_from_production = production_data['total_available'] or Decimal('0')
    if water_from_production == 0:
        return None

    regional_data = RegionalDistribution.objects.filter(
        billing_cycle=billing_cycle
    ).aggregate(total_supplied=Sum('volume_supplied_m3'))
    water_to_distribution = regional_data['total_supplied'] or Decimal('0')

    trans_loss, _ = TransmissionLoss.objects.update_or_create(
        billing_cycle=billing_cycle,
        defaults={
            'water_available_from_production_m3': water_from_production,
            'water_available_to_distribution_m3': water_to_distribution,
            'notes': 'Commercial-cycle transmission bridge using the regional billing envelope.',
        }
    )
    return trans_loss


def calculate_global_nrw(billing_cycle):
    """Commercial overall NRW for a billing month keyed by zone-cycle close month."""
    production_data = MonthlyProduction.objects.filter(
        year=billing_cycle.year,
        month=billing_cycle.month,
    ).aggregate(total_available=Sum('water_available_for_sale_m3'))
    water_available = production_data['total_available'] or Decimal('0')

    billing_data = CustomerBillingData.objects.filter(
        billing_cycle=billing_cycle
    ).aggregate(total_billed=Sum('total_volume_billed_m3'))
    volume_billed = billing_data['total_billed'] or Decimal('0')

    try:
        trans_loss = TransmissionLoss.objects.get(billing_cycle=billing_cycle)
        transmission_loss_pct = trans_loss.transmission_loss_percentage
    except TransmissionLoss.DoesNotExist:
        transmission_loss_pct = None

    regional_data = RegionalDistribution.objects.filter(
        billing_cycle=billing_cycle
    ).aggregate(
        avg_nrw=Sum('nrw_m3'),
        total_supplied=Sum('volume_supplied_m3'),
    )

    if regional_data['total_supplied'] and regional_data['total_supplied'] > 0:
        regional_nrw_pct = (
            regional_data['avg_nrw'] / regional_data['total_supplied'] * 100
        )
    else:
        regional_nrw_pct = None

    global_nrw, _ = GlobalNRWPerformance.objects.update_or_create(
        billing_cycle=billing_cycle,
        defaults={
            'water_available_for_sale_m3': water_available,
            'volume_billed_to_customers_m3': volume_billed,
            'transmission_loss_percentage': transmission_loss_pct,
            'regional_nrw_percentage': regional_nrw_pct,
            'notes': 'Commercial NRW calculated from zone-cycle billing rolled up to billing month.',
        }
    )
    return global_nrw


def bulk_aggregate_monthly_distribution(billing_cycle):
    """Aggregate commercial monthly distribution for all active zones in a region envelope."""
    zones = billing_cycle.region.zones.filter(is_active=True)
    results = {'successful': [], 'failed': []}
    for zone in zones:
        try:
            aggregate_monthly_distribution(zone, billing_cycle=billing_cycle)
            results['successful'].append(zone.code)
        except Exception as exc:
            results['failed'].append({
                'zone': zone.code,
                'error': str(exc),
            })
    return results


def refresh_commercial_summaries_for_billing_cycle(billing_cycle):
    """Rebuild commercial zone, regional, transmission, and global summaries for a cycle."""
    results = bulk_aggregate_monthly_distribution(billing_cycle)
    aggregate_regional_distribution(billing_cycle.region, billing_cycle)
    calculate_transmission_loss(billing_cycle)
    calculate_global_nrw(billing_cycle)
    return results


def sync_regional_billing_cycles_from_zone_cycles(year, month, region=None):
    """Sync regional billing envelopes from the min/max dates of zone cycles for a month."""
    zone_cycles = ZoneBillingCycle.objects.filter(
        year=year,
        month=month,
        zone__is_active=True,
        closing_date__isnull=False,
    )
    if region is not None:
        zone_cycles = zone_cycles.filter(zone__region=region)

    updates = []
    for region_id in zone_cycles.values_list('zone__region_id', flat=True).distinct():
        regional_cycles = zone_cycles.filter(zone__region_id=region_id)
        aggregated = regional_cycles.aggregate(
            start_date=Min('opening_date'),
            end_date=Max('closing_date'),
        )
        if aggregated['start_date'] is None or aggregated['end_date'] is None:
            continue

        region_obj = Zone.objects.filter(region_id=region_id).select_related('region').first().region
        cycle, _ = BillingCycle.objects.update_or_create(
            region=region_obj,
            year=year,
            month=month,
            defaults={
                'start_date': aggregated['start_date'],
                'end_date': aggregated['end_date'],
                'is_finalized': regional_cycles.filter(is_finalized=True).exists(),
                'notes': 'Derived from zone-level billing cycle dates.',
            }
        )
        updates.append(cycle.id)
    return updates


def calculate_cycle_aligned_production_reconciliation(year, month, region=None):
    """Diagnostic reconciliation between calendar production and commercial zone cycles."""
    zone_cycle_qs = ZoneBillingCycle.objects.filter(year=year, month=month)
    if region is not None:
        zone_cycle_qs = zone_cycle_qs.filter(zone__region=region)
    zone_cycles = list(zone_cycle_qs.select_related('zone'))
    if not zone_cycles:
        return {
            'year': year,
            'month': month,
            'zone_count': 0,
            'weighted_production_available_for_sale_m3': Decimal('0'),
            'distribution_supplied_m3': Decimal('0'),
            'distribution_billed_m3': Decimal('0'),
            'supply_gap_m3': Decimal('0'),
            'billable_gap_m3': Decimal('0'),
        }

    total_zones = Decimal(len(zone_cycles))
    min_open = min(zc.opening_date for zc in zone_cycles)
    max_close = max(zc.effective_closing_date for zc in zone_cycles)

    production_by_day = {
        row['production_date']: (row['total'] or Decimal('0'))
        for row in DailyProduction.objects.filter(
            production_date__gte=min_open,
            production_date__lte=max_close,
        ).values('production_date').annotate(total=Sum('water_available_for_sale_m3'))
    }

    weighted_production = Decimal('0')
    current_day = min_open
    while current_day <= max_close:
        active_zone_count = sum(
            1 for zc in zone_cycles if zc.opening_date <= current_day <= zc.effective_closing_date
        )
        if active_zone_count:
            weight = Decimal(active_zone_count) / total_zones
            weighted_production += production_by_day.get(current_day, Decimal('0')) * weight
        current_day += timedelta(days=1)

    monthly_qs = MonthlyDistribution.objects.filter(
        billing_cycle__year=year,
        billing_cycle__month=month,
    )
    if region is not None:
        monthly_qs = monthly_qs.filter(zone__region=region)
    dist_totals = monthly_qs.aggregate(
        supplied=Sum('volume_supplied_m3'),
        billed=Sum('volume_billed_m3'),
    )

    dist_supplied = dist_totals['supplied'] or Decimal('0')
    dist_billed = dist_totals['billed'] or Decimal('0')
    return {
        'year': year,
        'month': month,
        'zone_count': int(total_zones),
        'window_start': min_open,
        'window_end': max_close,
        'weighted_production_available_for_sale_m3': weighted_production,
        'distribution_supplied_m3': dist_supplied,
        'distribution_billed_m3': dist_billed,
        'supply_gap_m3': weighted_production - dist_supplied,
        'billable_gap_m3': weighted_production - dist_billed,
    }


def generate_distribution_dashboard(billing_cycle, region=None):
    """Generate commercial distribution dashboard data for a billing envelope."""
    zones = region.zones.filter(is_active=True) if region else Zone.objects.filter(is_active=True)
    monthly_records = MonthlyDistribution.objects.filter(
        zone__in=zones,
        billing_cycle=billing_cycle,
    ).select_related('zone__region', 'zone_billing_cycle')

    zone_data = []
    for record in monthly_records:
        zone_data.append({
            'zone_code': record.zone.code,
            'zone_name': record.zone.name,
            'region': record.zone.region.name,
            'volume_supplied': record.volume_supplied_m3,
            'volume_billed': record.volume_billed_m3,
            'nrw_m3': record.nrw_m3,
            'nrw_percentage': record.nrw_percentage,
            'nrw_target': record.nrw_target_percentage,
            'volume_supplied_realization': record.volume_supplied_realization_percent,
            'is_finalized': record.is_finalized,
        })

    regional_summaries = []
    for region_obj in zones.values('region').distinct():
        region_records = monthly_records.filter(zone__region_id=region_obj['region'])
        aggregated = region_records.aggregate(
            total_supplied=Sum('volume_supplied_m3'),
            total_billed=Sum('volume_billed_m3'),
            total_nrw=Sum('nrw_m3'),
        )
        total_supplied = aggregated['total_supplied'] or Decimal('0')
        nrw_pct = (
            aggregated['total_nrw'] / total_supplied * 100
            if total_supplied > 0 else Decimal('0')
        )
        regional_summaries.append({
            'region': region_obj['region'],
            'volume_supplied': total_supplied,
            'volume_billed': aggregated['total_billed'] or Decimal('0'),
            'nrw_percentage': nrw_pct,
            'zone_count': region_records.count(),
        })

    overall = monthly_records.aggregate(
        total_supplied=Sum('volume_supplied_m3'),
        total_billed=Sum('volume_billed_m3'),
        total_nrw=Sum('nrw_m3'),
    )
    total_supplied = overall['total_supplied'] or Decimal('0')
    overall_nrw_pct = (
        overall['total_nrw'] / total_supplied * 100
        if total_supplied > 0 else Decimal('0')
    )

    try:
        global_nrw = GlobalNRWPerformance.objects.get(billing_cycle=billing_cycle)
        global_data = {
            'water_available': global_nrw.water_available_for_sale_m3,
            'volume_billed': global_nrw.volume_billed_to_customers_m3,
            'global_nrw_percentage': global_nrw.global_nrw_percentage,
            'transmission_loss_percentage': global_nrw.transmission_loss_percentage,
        }
    except GlobalNRWPerformance.DoesNotExist:
        global_data = None

    return {
        'billing_cycle': {
            'year': billing_cycle.year,
            'month': billing_cycle.month,
            'start_date': billing_cycle.start_date,
            'end_date': billing_cycle.end_date,
            'days': billing_cycle.number_of_days,
        },
        'summary': {
            'total_zones': monthly_records.count(),
            'volume_supplied': total_supplied,
            'volume_billed': overall['total_billed'] or Decimal('0'),
            'nrw_m3': overall['total_nrw'] or Decimal('0'),
            'nrw_percentage': overall_nrw_pct,
        },
        'global_nrw': global_data,
        'regional_summaries': regional_summaries,
        'zone_data': zone_data,
    }
