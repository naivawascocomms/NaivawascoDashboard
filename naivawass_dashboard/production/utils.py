# production/utils.py

from django.db.models import Sum, Q, Min, Max
from django.utils import timezone
from datetime import datetime, timedelta
from decimal import Decimal
from .models import (
    ProductionSite, Meter, MeterReading, DailyProduction,
    MonthlyProduction, ProductionTarget, WaterQualityTest, CompanyMonthlySummary
)
from metering.models import (
    EnergyMeterReading,
    ProductionEnergyMeterAssignment,
    ProductionWaterMeterAssignment,
    WaterMeterReading,
)


def _has_material_monthly_actuals(record):
    if record is None:
        return False

    numeric_fields = (
        'water_abstracted_m3',
        'water_supplied_m3',
        'water_received_m3',
        'production_loss_m3',
        'water_available_for_sale_m3',
        'power_grid_kwh',
        'power_solar_kwh',
        'total_power_kwh',
        'power_costs',
        'repair_maintenance_costs',
        'abstraction_fee',
        'chemical_costs',
        'total_direct_costs',
    )
    for field_name in numeric_fields:
        if getattr(record, field_name, Decimal('0')) not in (None, Decimal('0')):
            return True

    count_fields = (
        'chemical_tests_production',
        'biological_tests_production',
        'chemical_tests_consumer',
        'biological_tests_consumer',
    )
    return any(getattr(record, field_name, 0) for field_name in count_fields)


def refresh_production_for_site_dates(site_dates):
    """
    Recalculate daily and monthly production for the affected site/date pairs.

    Args:
        site_dates: iterable of (production_site_id, reading_date) tuples
    """
    if not site_dates:
        return

    unique_pairs = {
        (site_id, reading_date)
        for site_id, reading_date in site_dates
        if site_id and reading_date
    }
    if not unique_pairs:
        return

    site_map = ProductionSite.objects.in_bulk({site_id for site_id, _ in unique_pairs})
    affected_months = set()
    removed_daily_months = set()

    for site_id, reading_date in unique_pairs:
        site = site_map.get(site_id)
        if not site:
            continue

        daily_prod = aggregate_daily_production(site, reading_date)
        if daily_prod is None:
            deleted_count, _ = DailyProduction.objects.filter(
                production_site=site,
                production_date=reading_date
            ).delete()
            if deleted_count:
                removed_daily_months.add((site_id, reading_date.year, reading_date.month))
        elif daily_prod.is_complete and not daily_prod.is_validated:
            daily_prod.is_validated = True
            daily_prod.save(update_fields=['is_validated', 'updated_at'])
        affected_months.add((site_id, reading_date.year, reading_date.month))

    for site_id, year, month in affected_months:
        site = site_map.get(site_id)
        if not site:
            continue

        daily_exists = DailyProduction.objects.filter(
            production_site=site,
            production_date__year=year,
            production_date__month=month,
            is_validated=True
        ).exists()

        if daily_exists:
            aggregate_monthly_production(site, year, month)
        else:
            existing_monthly = MonthlyProduction.objects.filter(
                production_site=site,
                year=year,
                month=month
            ).first()
            # Preserve imported/manual monthly records that do not have day-level
            # meter data behind them. Reading-driven months can still be rebuilt
            # explicitly once daily records exist again.
            if (
                existing_monthly and
                _has_material_monthly_actuals(existing_monthly) and
                (site_id, year, month) not in removed_daily_months
            ):
                continue
            MonthlyProduction.objects.filter(
                production_site=site,
                year=year,
                month=month
            ).delete()


def _region_bucket(region):
    value = ' '.join(filter(None, [getattr(region, 'code', ''), getattr(region, 'name', '')])).upper()
    if 'CENTRAL' in value:
        return 'central'
    if 'SOUTH' in value:
        return 'southern'
    if 'EAST' in value:
        return 'eastern'
    return None


def refresh_company_monthly_summary(year, month):
    """
    Roll up monthly production actuals into CompanyMonthlySummary.

    Regional cards and company actual costs are derived from MonthlyProduction.
    """
    records = MonthlyProduction.objects.filter(
        year=year,
        month=month
    ).select_related('production_site__region')

    summary, _ = CompanyMonthlySummary.objects.get_or_create(year=year, month=month)

    aggregated = records.aggregate(
        power_costs=Sum('power_costs'),
        repair_maintenance_costs=Sum('repair_maintenance_costs'),
        abstraction_fee=Sum('abstraction_fee'),
        chemical_costs=Sum('chemical_costs'),
    )

    summary.power_costs = aggregated['power_costs'] or Decimal('0')
    summary.repair_maintenance_costs = aggregated['repair_maintenance_costs'] or Decimal('0')
    summary.abstraction_fee = aggregated['abstraction_fee'] or Decimal('0')
    summary.chemical_costs = aggregated['chemical_costs'] or Decimal('0')

    month_start = datetime(year, month, 1).date()
    if month == 12:
        month_end = datetime(year + 1, 1, 1).date() - timedelta(days=1)
    else:
        month_end = datetime(year, month + 1, 1).date() - timedelta(days=1)

    regional = {
        'central': {
            'opening_date': None,
            'closing_date': None,
            'production_loss_m3': Decimal('0'),
            'available_for_sale_m3': Decimal('0'),
        },
        'southern': {
            'opening_date': None,
            'closing_date': None,
            'production_loss_m3': Decimal('0'),
            'available_for_sale_m3': Decimal('0'),
        },
        'eastern': {
            'opening_date': None,
            'closing_date': None,
            'production_loss_m3': Decimal('0'),
            'available_for_sale_m3': Decimal('0'),
        },
    }

    for record in records:
        bucket = _region_bucket(record.production_site.region)
        if not bucket:
            continue
        data = regional[bucket]
        data['opening_date'] = month_start
        data['closing_date'] = month_end
        data['production_loss_m3'] += record.production_loss_m3 or Decimal('0')
        data['available_for_sale_m3'] += record.water_available_for_sale_m3 or Decimal('0')

    summary.central_opening_date = regional['central']['opening_date']
    summary.central_closing_date = regional['central']['closing_date']
    summary.central_production_loss_m3 = regional['central']['production_loss_m3']
    summary.central_available_for_sale_m3 = regional['central']['available_for_sale_m3']

    summary.southern_opening_date = regional['southern']['opening_date']
    summary.southern_closing_date = regional['southern']['closing_date']
    summary.southern_production_loss_m3 = regional['southern']['production_loss_m3']
    summary.southern_available_for_sale_m3 = regional['southern']['available_for_sale_m3']

    summary.eastern_opening_date = regional['eastern']['opening_date']
    summary.eastern_closing_date = regional['eastern']['closing_date']
    summary.eastern_production_loss_m3 = regional['eastern']['production_loss_m3']
    summary.eastern_available_for_sale_m3 = regional['eastern']['available_for_sale_m3']

    summary.save()


def _active_assignments(queryset, reading_date):
    return queryset.filter(
        is_active=True,
    ).filter(
        Q(start_date__isnull=True) | Q(start_date__lte=reading_date)
    ).filter(
        Q(end_date__isnull=True) | Q(end_date__gte=reading_date)
    )


def recalculate_all_monthly_costs():
    """
    Re-save monthly production records so cost fields and company summaries
    pick up the currently active ProductionCostConfig.
    """
    for record in MonthlyProduction.objects.all().order_by('year', 'month', 'production_site_id'):
        record.save()


def aggregate_daily_production(production_site, date):
    """
    Aggregate meter readings into daily production record for a specific date.
    
    Args:
        production_site: ProductionSite instance
        date: Date to aggregate (datetime.date object)
    
    Returns:
        DailyProduction instance or None if no readings available
    """
    abstraction_assignments = _active_assignments(
        ProductionWaterMeterAssignment.objects.filter(
            production_site=production_site,
            assignment_role='ABSTRACTION',
        ).select_related('water_meter'),
        date,
    )
    supply_assignments = _active_assignments(
        ProductionWaterMeterAssignment.objects.filter(
            production_site=production_site,
            assignment_role='SUPPLY',
        ).select_related('water_meter'),
        date,
    )
    grid_assignments = _active_assignments(
        ProductionEnergyMeterAssignment.objects.filter(
            production_site=production_site,
            assignment_role='GRID',
        ).select_related('energy_meter'),
        date,
    )
    solar_assignments = _active_assignments(
        ProductionEnergyMeterAssignment.objects.filter(
            production_site=production_site,
            assignment_role='SOLAR',
        ).select_related('energy_meter'),
        date,
    )

    abstraction_meter_ids = list(abstraction_assignments.values_list('water_meter_id', flat=True).distinct())
    supply_meter_ids = list(supply_assignments.values_list('water_meter_id', flat=True).distinct())
    grid_meter_ids = list(grid_assignments.values_list('energy_meter_id', flat=True).distinct())
    solar_meter_ids = list(solar_assignments.values_list('energy_meter_id', flat=True).distinct())

    water_readings = WaterMeterReading.objects.filter(
        water_meter_id__in=abstraction_meter_ids,
        reading_date=date,
        is_validated=True,
    )
    supply_readings = WaterMeterReading.objects.filter(
        water_meter_id__in=supply_meter_ids,
        reading_date=date,
        is_validated=True,
    )
    grid_readings = EnergyMeterReading.objects.filter(
        energy_meter_id__in=grid_meter_ids,
        reading_date=date,
        is_validated=True,
    )
    solar_readings = EnergyMeterReading.objects.filter(
        energy_meter_id__in=solar_meter_ids,
        reading_date=date,
        is_validated=True,
    )

    water_abstracted = water_readings.aggregate(total=Sum('consumption'))['total'] or Decimal('0')
    power_grid = grid_readings.aggregate(total=Sum('consumption'))['total'] or Decimal('0')
    power_solar = solar_readings.aggregate(total=Sum('consumption'))['total'] or Decimal('0')
    water_supplied = supply_readings.aggregate(total=Sum('consumption'))['total'] or Decimal('0')

    if production_site.production_equals_supply:
        water_supplied = water_abstracted
        production_loss = Decimal('0')
    elif supply_meter_ids:
        production_loss = water_abstracted - water_supplied
        if production_loss < 0:
            production_loss = Decimal('0')
    else:
        production_loss = Decimal('0')
    
    # Check if we have complete data
    is_complete = (
        water_readings.values('water_meter_id').distinct().count() == len(abstraction_meter_ids) and
        grid_readings.values('energy_meter_id').distinct().count() == len(grid_meter_ids) and
        (solar_readings.values('energy_meter_id').distinct().count() == len(solar_meter_ids) if solar_meter_ids else True) and
        (
            True
            if production_site.production_equals_supply
            else (supply_readings.values('water_meter_id').distinct().count() == len(supply_meter_ids) if supply_meter_ids else True)
        )
    )
    
    if water_abstracted == 0:
        return None
    
    # Create or update daily production record
    daily_prod, created = DailyProduction.objects.update_or_create(
        production_site=production_site,
        production_date=date,
        defaults={
            'water_abstracted_m3': water_abstracted,
            'water_supplied_m3': water_supplied,
            'production_loss_m3': production_loss,
            'power_grid_kwh': power_grid,
            'power_solar_kwh': power_solar,
            'is_complete': is_complete
        }
    )
    
    return daily_prod


def aggregate_monthly_production(production_site, year, month):
    """
    Aggregate daily production into monthly production record.
    
    Args:
        production_site: ProductionSite instance
        year: Year (int)
        month: Month (int, 1-12)
    
    Returns:
        MonthlyProduction instance
    """
    # Get all daily production records for this month
    daily_records = DailyProduction.objects.filter(
        production_site=production_site,
        production_date__year=year,
        production_date__month=month,
        is_validated=True
    )
    
    # Aggregate values
    aggregated = daily_records.aggregate(
        water_abstracted=Sum('water_abstracted_m3'),
        water_supplied=Sum('water_supplied_m3'),
        water_received=Sum('water_received_m3'),
        production_loss=Sum('production_loss_m3'),
        power_grid=Sum('power_grid_kwh'),
        power_solar=Sum('power_solar_kwh'),
        start_date=Min('production_date'),
        closing_date=Max('production_date'),
    )
    
    # Get water quality test counts for this month
    start_date = datetime(year, month, 1).date()
    if month == 12:
        end_date = datetime(year + 1, 1, 1).date() - timedelta(days=1)
    else:
        end_date = datetime(year, month + 1, 1).date() - timedelta(days=1)
    
    quality_tests = WaterQualityTest.objects.filter(
        production_site=production_site,
        test_date__gte=start_date,
        test_date__lte=end_date
    )
    
    chemical_prod = quality_tests.filter(
        test_type='CHEMICAL',
        test_location='PRODUCTION'
    ).count()
    
    biological_prod = quality_tests.filter(
        test_type='BIOLOGICAL',
        test_location='PRODUCTION'
    ).count()
    
    chemical_consumer = quality_tests.filter(
        test_type='CHEMICAL',
        test_location='CONSUMER'
    ).count()
    
    biological_consumer = quality_tests.filter(
        test_type='BIOLOGICAL',
        test_location='CONSUMER'
    ).count()
    
    # Calculate compliance percentages
    def calculate_compliance(test_type, location):
        tests = quality_tests.filter(test_type=test_type, test_location=location)
        total = tests.count()
        if total == 0:
            return Decimal('100')
        compliant = tests.filter(is_compliant=True).count()
        return Decimal(compliant / total * 100)
    
    who_chem_prod = calculate_compliance('CHEMICAL', 'PRODUCTION')
    who_bio_prod = calculate_compliance('BIOLOGICAL', 'PRODUCTION')
    who_chem_consumer = calculate_compliance('CHEMICAL', 'CONSUMER')
    who_bio_consumer = calculate_compliance('BIOLOGICAL', 'CONSUMER')
    
    # Get or create target for comparison
    try:
        target = ProductionTarget.objects.get(
            production_site=production_site,
            year=year,
            month=month
        )
    except ProductionTarget.DoesNotExist:
        target = None
    
    # Create or update monthly production record
    monthly_prod, created = MonthlyProduction.objects.update_or_create(
        production_site=production_site,
        year=year,
        month=month,
        defaults={
            'water_abstracted_m3': aggregated['water_abstracted'] or Decimal('0'),
            'water_supplied_m3': aggregated['water_supplied'] or Decimal('0'),
            'water_received_m3': aggregated['water_received'] or Decimal('0'),
            'production_loss_m3': aggregated['production_loss'] or Decimal('0'),
            'power_grid_kwh': aggregated['power_grid'] or Decimal('0'),
            'power_solar_kwh': aggregated['power_solar'] or Decimal('0'),
            'chemical_tests_production': chemical_prod,
            'biological_tests_production': biological_prod,
            'chemical_tests_consumer': chemical_consumer,
            'biological_tests_consumer': biological_consumer,
            'who_compliance_chemical_production': who_chem_prod,
            'who_compliance_biological_production': who_bio_prod,
            'who_compliance_chemical_consumer': who_chem_consumer,
            'who_compliance_biological_consumer': who_bio_consumer,
            'target': target,
            'start_date': start_date,
            'closing_date': end_date
        }
    )
    
    return monthly_prod


def calculate_previous_reading(meter):
    """
    Get the most recent validated reading for a meter.
    
    Args:
        meter: Meter instance
    
    Returns:
        Decimal value of the last reading or initial_reading if no readings exist
    """
    assignment = None
    if meter.meter_type in {'WATER', 'SUPPLY'}:
        assignment = ProductionWaterMeterAssignment.objects.filter(
            legacy_production_meter_id=meter.id
        ).select_related('water_meter').first()
        if assignment:
            last_reading = assignment.water_meter.readings.filter(is_validated=True).first()
            if last_reading:
                return last_reading.current_reading
    else:
        assignment = ProductionEnergyMeterAssignment.objects.filter(
            legacy_production_meter_id=meter.id
        ).select_related('energy_meter').first()
        if assignment:
            last_reading = assignment.energy_meter.readings.filter(is_validated=True).first()
            if last_reading:
                return last_reading.current_reading

    last_reading = meter.readings.filter(is_validated=True).first()
    if last_reading:
        return last_reading.current_reading
    return meter.initial_reading


def detect_anomalous_readings(meter, threshold_percentage=50):
    """
    Detect anomalous meter readings based on consumption variance.
    
    Args:
        meter: Meter instance
        threshold_percentage: Percentage variance to flag as anomaly
    
    Returns:
        List of MeterReading instances flagged as anomalies
    """
    readings = meter.readings.filter(consumption__isnull=False).order_by('-reading_date')[:30]
    
    if readings.count() < 5:
        return []
    
    # Calculate average consumption
    consumptions = [reading.consumption for reading in readings]
    avg_consumption = sum(consumptions) / len(consumptions)
    
    if avg_consumption == 0:
        return []
    
    # Flag readings with high variance
    anomalies = []
    for reading in readings:
        variance_percent = abs(
            (reading.consumption - avg_consumption) / avg_consumption * 100
        )
        if variance_percent > threshold_percentage:
            if not reading.is_anomaly:
                reading.is_anomaly = True
                reading.save()
            anomalies.append(reading)
    
    return anomalies


def bulk_aggregate_daily_production(date):
    """
    Aggregate daily production for all active production sites for a specific date.
    
    Args:
        date: Date to aggregate (datetime.date object)
    
    Returns:
        Dictionary with results
    """
    sites = ProductionSite.objects.filter(is_active=True)
    results = {
        'successful': [],
        'failed': [],
        'no_data': []
    }
    
    for site in sites:
        try:
            daily_prod = aggregate_daily_production(site, date)
            if daily_prod:
                results['successful'].append(site.code)
            else:
                results['no_data'].append(site.code)
        except Exception as e:
            results['failed'].append({
                'site': site.code,
                'error': str(e)
            })
    
    return results


def bulk_aggregate_monthly_production(year, month):
    """
    Aggregate monthly production for all active production sites.
    
    Args:
        year: Year (int)
        month: Month (int, 1-12)
    
    Returns:
        Dictionary with results
    """
    sites = ProductionSite.objects.filter(is_active=True)
    results = {
        'successful': [],
        'failed': []
    }
    
    for site in sites:
        try:
            monthly_prod = aggregate_monthly_production(site, year, month)
            results['successful'].append(site.code)
        except Exception as e:
            results['failed'].append({
                'site': site.code,
                'error': str(e)
            })
    
    return results


def calculate_regional_summary(region, year, month):
    """
    Calculate aggregated production summary for a region.
    
    Args:
        region: Region instance
        year: Year (int)
        month: Month (int, 1-12)
    
    Returns:
        Dictionary with regional summary
    """
    sites = region.production_sites.filter(is_active=True)
    monthly_records = MonthlyProduction.objects.filter(
        production_site__in=sites,
        year=year,
        month=month
    )
    
    aggregated = monthly_records.aggregate(
        total_water_abstracted=Sum('water_abstracted_m3'),
        total_production_loss=Sum('production_loss_m3'),
        total_water_available=Sum('water_available_for_sale_m3'),
        total_power_grid=Sum('power_grid_kwh'),
        total_power_solar=Sum('power_solar_kwh'),
        total_power=Sum('total_power_kwh'),
        total_costs=Sum('total_direct_costs')
    )
    
    total_water = aggregated['total_water_abstracted'] or Decimal('0')
    total_power = aggregated['total_power'] or Decimal('0')
    total_solar = aggregated['total_power_solar'] or Decimal('0')
    
    return {
        'region': region.name,
        'period': f"{year}-{month:02d}",
        'number_of_sites': sites.count(),
        'water_abstracted_m3': total_water,
        'production_loss_m3': aggregated['total_production_loss'] or Decimal('0'),
        'production_loss_percent': (
            (aggregated['total_production_loss'] / total_water * 100)
            if total_water > 0 else Decimal('0')
        ),
        'water_available_for_sale_m3': aggregated['total_water_available'] or Decimal('0'),
        'power_consumption_kwh': total_power,
        'power_efficiency_kwh_per_m3': (
            total_power / total_water if total_water > 0 else Decimal('0')
        ),
        'solar_percentage': (
            total_solar / total_power * 100 if total_power > 0 else Decimal('0')
        ),
        'total_direct_costs': aggregated['total_costs'] or Decimal('0'),
        'cost_per_m3': (
            aggregated['total_costs'] / total_water
            if total_water > 0 else Decimal('0')
        )
    }


def compare_with_target(monthly_production):
    """
    Compare monthly production actuals with target and return variance.
    
    Args:
        monthly_production: MonthlyProduction instance
    
    Returns:
        Dictionary with comparison data
    """
    if not monthly_production.target:
        return {
            'has_target': False,
            'message': 'No target set for this period'
        }
    
    target = monthly_production.target
    
    return {
        'has_target': True,
        'water_abstraction': {
            'target': target.water_abstraction_target_m3,
            'actual': monthly_production.water_abstracted_m3,
            'variance': monthly_production.water_abstracted_m3 - target.water_abstraction_target_m3,
            'realization_percent': monthly_production.water_abstraction_realization_percent
        },
        'production_loss': {
            'target_m3': target.production_loss_target_m3,
            'actual_m3': monthly_production.production_loss_m3,
            'target_percent': target.production_loss_target_percent,
            'actual_percent': monthly_production.production_loss_percentage
        },
        'power_consumption': {
            'grid_target': target.power_grid_target_kwh,
            'grid_actual': monthly_production.power_grid_kwh,
            'solar_target': target.power_solar_target_kwh,
            'solar_actual': monthly_production.power_solar_kwh,
            'total_target': target.total_power_target_kwh,
            'total_actual': monthly_production.total_power_kwh
        },
        'efficiency': {
            'target': target.power_efficiency_target_kwh_per_m3,
            'actual': monthly_production.power_efficiency_kwh_per_m3,
            'variance': (
                monthly_production.power_efficiency_kwh_per_m3 - 
                target.power_efficiency_target_kwh_per_m3
            ) if monthly_production.power_efficiency_kwh_per_m3 and 
                 target.power_efficiency_target_kwh_per_m3 else None
        },
        'costs': {
            'power_cost_per_m3_target': target.power_cost_per_m3_target,
            'power_cost_per_m3_actual': monthly_production.power_cost_per_m3,
            'power_cost_per_kwh_target': target.power_cost_per_kwh_target,
            'power_cost_per_kwh_actual': monthly_production.power_cost_per_kwh
        }
    }


def generate_dashboard_data(year, month, region=None):
    """
    Generate comprehensive dashboard data for a specific period.
    
    Args:
        year: Year (int)
        month: Month (int, 1-12)
        region: Optional Region instance to filter by
    
    Returns:
        Dictionary with dashboard data
    """
    queryset = MonthlyProduction.objects.filter(year=year, month=month)
    
    if region:
        queryset = queryset.filter(production_site__region=region)
    
    # Site-level data
    site_data = []
    for record in queryset:
        site_data.append({
            'site_code': record.production_site.code,
            'site_name': record.production_site.name,
            'region': record.production_site.region.name,
            'water_abstracted': record.water_abstracted_m3,
            'production_loss': record.production_loss_m3,
            'production_loss_percent': record.production_loss_percentage,
            'power_consumption': record.total_power_kwh,
            'power_efficiency': record.power_efficiency_kwh_per_m3,
            'solar_percentage': record.solar_percentage,
            'total_costs': record.total_direct_costs,
            'cost_per_m3': record.total_cost_per_m3,
            'realization_percent': record.water_abstraction_realization_percent,
            'is_finalized': record.is_finalized
        })
    
    # Aggregated totals
    aggregated = queryset.aggregate(
        total_water=Sum('water_abstracted_m3'),
        total_loss=Sum('production_loss_m3'),
        total_power=Sum('total_power_kwh'),
        total_solar=Sum('power_solar_kwh'),
        total_costs=Sum('total_direct_costs')
    )
    
    total_water = aggregated['total_water'] or Decimal('0')
    total_power = aggregated['total_power'] or Decimal('0')
    
    summary = {
        'period': f"{year}-{month:02d}",
        'region': region.name if region else 'All Regions',
        'total_sites': queryset.count(),
        'total_water_abstracted': total_water,
        'total_production_loss': aggregated['total_loss'] or Decimal('0'),
        'production_loss_percentage': (
            (aggregated['total_loss'] / total_water * 100)
            if total_water > 0 else Decimal('0')
        ),
        'total_power_consumption': total_power,
        'solar_power_percentage': (
            (aggregated['total_solar'] / total_power * 100)
            if total_power > 0 else Decimal('0')
        ),
        'average_power_efficiency': (
            total_power / total_water if total_water > 0 else Decimal('0')
        ),
        'total_costs': aggregated['total_costs'] or Decimal('0'),
        'average_cost_per_m3': (
            aggregated['total_costs'] / total_water
            if total_water > 0 else Decimal('0')
        )
    }
    
    return {
        'summary': summary,
        'site_data': site_data
    }


def validate_meter_reading(meter, reading_date, current_reading):
    """
    Validate a meter reading before saving.
    
    Args:
        meter: Meter instance
        reading_date: Date of reading
        current_reading: Current meter reading value
    
    Returns:
        Dictionary with validation results
    """
    errors = []
    warnings = []
    
    # Check if reading is not less than initial reading
    if current_reading < meter.initial_reading:
        errors.append(
            f"Reading {current_reading} is less than initial reading {meter.initial_reading}"
        )
    
    # Check against previous reading
    previous = meter.readings.filter(
        reading_date__lt=reading_date
    ).first()
    
    if previous:
        if current_reading < previous.current_reading:
            errors.append(
                f"Reading {current_reading} is less than previous reading {previous.current_reading}"
            )
        
        # Check for unusual consumption
        consumption = current_reading - previous.current_reading
        days_diff = (reading_date - previous.reading_date).days
        
        if days_diff > 0:
            daily_consumption = consumption / days_diff
            
            # Get average daily consumption from last 30 days
            recent_readings = meter.readings.filter(
                consumption__isnull=False
            )[:30]
            
            if recent_readings.count() >= 5:
                avg_consumption = sum(
                    [r.consumption for r in recent_readings]
                ) / recent_readings.count()
                
                if abs(daily_consumption - avg_consumption) > avg_consumption * 0.5:
                    warnings.append(
                        f"Daily consumption {daily_consumption} varies significantly "
                        f"from average {avg_consumption}"
                    )
    
    # Check meter capacity
    if meter.capacity and current_reading > meter.capacity:
        errors.append(
            f"Reading {current_reading} exceeds meter capacity {meter.capacity}"
        )
    
    return {
        'is_valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings
    }
