import calendar
import hashlib
from collections import defaultdict
from datetime import date, time, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q

from production.models import (
    DailyProduction,
    Meter,
    MeterReading,
    MonthlyProduction,
    ProductionSite,
    ProductionTarget,
)
from production.utils import refresh_production_for_site_dates


def q2(value):
    return Decimal(value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def stable_variation(*parts):
    raw = '|'.join(str(p) for p in parts)
    digest = hashlib.sha256(raw.encode()).hexdigest()
    return (int(digest[:8], 16) % 700) / 10000  # 0.0000 .. 0.0699


def month_weights(day_count, site_code, year, month):
    base_cycle = [Decimal('0.96'), Decimal('1.01'), Decimal('1.04'), Decimal('0.98'), Decimal('1.03'), Decimal('0.97'), Decimal('1.01')]
    weights = []
    for idx in range(day_count):
        wobble = Decimal(str(stable_variation(site_code, year, month, idx))) - Decimal('0.035')
        weights.append(base_cycle[idx % len(base_cycle)] + wobble)
    total = sum(weights)
    return [w / total for w in weights]


def normalized_meter_weights(meters, site_code, meter_type):
    count = len(meters)
    if count == 0:
        return []

    if site_code == 'WWS' and meter_type == 'SUPPLY':
        raw = [Decimal('0.35'), Decimal('0.24'), Decimal('0.16'), Decimal('0.08'), Decimal('0.10'), Decimal('0.07')]
    elif site_code == 'WWS' and meter_type in {'POWER_GRID', 'POWER_SOLAR'}:
        raw = [Decimal('0.35'), Decimal('0.30'), Decimal('0.35')]
    elif count == 1:
        raw = [Decimal('1')]
    else:
        raw = [Decimal(str(count - i)) for i in range(count)]

    raw = raw[:count]
    total = sum(raw)
    return [r / total for r in raw]


def latest_historical_month(site, year, month):
    return MonthlyProduction.objects.filter(
        production_site=site
    ).filter(
        Q(year__lt=year) | Q(year=year, month__lt=month)
    ).order_by('-year', '-month').first()


class Command(BaseCommand):
    help = 'Seed pseudo historical meter readings for a date range using targets and historical monthly data.'

    def add_arguments(self, parser):
        parser.add_argument('--start-date', required=True, help='Start date in YYYY-MM-DD format')
        parser.add_argument('--end-date', required=True, help='End date in YYYY-MM-DD format')
        parser.add_argument('--reset', action='store_true', help='Delete existing readings/daily/monthly records in range first')

    def handle(self, *args, **options):
        start_date = date.fromisoformat(options['start_date'])
        end_date = date.fromisoformat(options['end_date'])
        reset = options['reset']
        if end_date < start_date:
            raise ValueError('end-date must be on or after start-date')

        active_sites = list(
            ProductionSite.objects.filter(is_active=True).order_by('code')
        )
        site_codes = [site.code for site in active_sites]

        with transaction.atomic():
            if reset:
                MeterReading.objects.filter(
                    meter__production_site__code__in=site_codes,
                    reading_date__range=(start_date, end_date),
                ).delete()
                DailyProduction.objects.filter(
                    production_site__code__in=site_codes,
                    production_date__range=(start_date, end_date),
                ).delete()
                month_filters = {
                    (current.year, current.month)
                    for current in self._date_range(start_date, end_date)
                }
                for year, month in month_filters:
                    MonthlyProduction.objects.filter(
                        production_site__code__in=site_codes,
                        year=year,
                        month=month,
                    ).delete()

            created_readings = []
            affected_pairs = set()

            for site in active_sites:
                meters_by_type = defaultdict(list)
                for meter in site.meters.filter(is_active=True).order_by('meter_type', 'meter_number'):
                    meters_by_type[meter.meter_type].append(meter)

                if not meters_by_type['WATER']:
                    continue

                for year, month, month_start, month_end in self._month_spans(start_date, end_date):
                    span_start = max(start_date, month_start)
                    span_end = min(end_date, month_end)
                    span_days = (span_end - span_start).days + 1
                    total_days_in_month = calendar.monthrange(year, month)[1]

                    totals = self._build_month_totals(
                        site,
                        year,
                        month,
                        total_days_in_month,
                        span_days,
                        meters_by_type,
                    )

                    day_weights = month_weights(span_days, site.code, year, month)
                    daily_totals = {
                        key: [q2(totals[key] * weight) for weight in day_weights]
                        for key in ['water', 'supply', 'grid', 'solar']
                    }
                    for key in daily_totals:
                        if daily_totals[key]:
                            diff = totals[key] - sum(daily_totals[key])
                            daily_totals[key][-1] += diff

                    base_offsets = self._meter_base_offsets(site, year, month, meters_by_type)

                    for meter_type, meters in meters_by_type.items():
                        weights = normalized_meter_weights(meters, site.code, meter_type)
                        total_key = {
                            'WATER': 'water',
                            'SUPPLY': 'supply',
                            'POWER_GRID': 'grid',
                            'POWER_SOLAR': 'solar',
                        }.get(meter_type)
                        if not total_key:
                            continue

                        for meter, meter_weight in zip(meters, weights):
                            previous = base_offsets[meter.meter_number]
                            meter.initial_reading = previous
                            meter.save(update_fields=['initial_reading'])

                            day_values = [q2(day_total * meter_weight) for day_total in daily_totals[total_key]]
                            if day_values:
                                diff = totals[total_key] * meter_weight - sum(day_values)
                                day_values[-1] += diff

                            for offset, consumption in enumerate(day_values):
                                reading_date = span_start + timedelta(days=offset)
                                current = previous + consumption
                                created_readings.append(MeterReading(
                                    meter=meter,
                                    reading_date=reading_date,
                                    reading_time=time(8, 0),
                                    current_reading=q2(current),
                                    previous_reading=q2(previous),
                                    consumption=q2(consumption),
                                    read_by='SYSTEM_HISTORY_SEED',
                                    reading_method='ESTIMATED',
                                    is_validated=True,
                                    validated_by='SYSTEM_HISTORY_SEED',
                                    notes='Pseudo historical reading seeded from monthly targets and historical production.',
                                ))
                                affected_pairs.add((site.id, reading_date))
                                previous = current

            MeterReading.objects.bulk_create(created_readings, batch_size=500)
            refresh_production_for_site_dates(affected_pairs)

        self.stdout.write(self.style.SUCCESS(
            f'Seeded {len(created_readings)} meter readings from {start_date} to {end_date}.'
        ))

    def _date_range(self, start_date, end_date):
        current = start_date
        while current <= end_date:
            yield current
            current += timedelta(days=1)

    def _month_spans(self, start_date, end_date):
        current = date(start_date.year, start_date.month, 1)
        while current <= end_date:
            last_day = calendar.monthrange(current.year, current.month)[1]
            month_end = date(current.year, current.month, last_day)
            yield current.year, current.month, current, month_end
            if current.month == 12:
                current = date(current.year + 1, 1, 1)
            else:
                current = date(current.year, current.month + 1, 1)

    def _build_month_totals(self, site, year, month, total_days_in_month, span_days, meters_by_type):
        target = ProductionTarget.objects.filter(
            production_site=site,
            year=year,
            month=month,
        ).first()
        historical = latest_historical_month(site, year, month)

        water_count = len(meters_by_type['WATER'])
        supply_count = len(meters_by_type['SUPPLY'])
        grid_count = len(meters_by_type['POWER_GRID'])
        solar_count = len(meters_by_type['POWER_SOLAR'])

        target_water = target.water_abstraction_target_m3 if target else Decimal('0')
        hist_water = historical.water_abstracted_m3 if historical else Decimal('0')
        full_water = self._blend_quantity(site.code, year, month, target_water, hist_water, Decimal(str(max(water_count, 1) * 800)))

        target_supply = target.water_supply_target_m3 if target else Decimal('0')
        hist_supply = Decimal('0')
        if historical:
            hist_supply = historical.water_supplied_m3 or historical.water_available_for_sale_m3

        if site.code == 'WWS':
            full_supply = max(full_water * Decimal('1.20'), hist_supply, full_water + Decimal('400'))
        elif water_count == 1 and supply_count == 1:
            full_supply = full_water
        else:
            full_supply = self._blend_quantity(site.code, year, month, target_supply, hist_supply, full_water * Decimal('0.97'))
            if full_supply > full_water:
                full_supply = full_water

        target_grid = target.power_grid_target_kwh if target else Decimal('0')
        target_solar = target.power_solar_target_kwh if target else Decimal('0')
        hist_grid = historical.power_grid_kwh if historical else Decimal('0')
        hist_solar = historical.power_solar_kwh if historical else Decimal('0')

        full_grid = self._blend_quantity(site.code, year, month, target_grid, hist_grid, full_water * Decimal('0.55') if grid_count else Decimal('0'))
        full_solar = self._blend_quantity(site.code, year, month, target_solar, hist_solar, full_water * Decimal('0.18') if solar_count else Decimal('0'))

        if grid_count == 0:
            full_grid = Decimal('0')
        if solar_count == 0:
            full_solar = Decimal('0')

        scale = Decimal(span_days) / Decimal(total_days_in_month)
        return {
            'water': q2(full_water * scale),
            'supply': q2(full_supply * scale),
            'grid': q2(full_grid * scale),
            'solar': q2(full_solar * scale),
        }

    def _blend_quantity(self, site_code, year, month, target_value, historical_value, fallback):
        if target_value and historical_value:
            base = (target_value * Decimal('0.55')) + (historical_value * Decimal('0.45'))
        elif target_value:
            base = target_value
        elif historical_value:
            base = historical_value
        else:
            base = fallback

        variation = Decimal('0.94') + Decimal(str(stable_variation(site_code, year, month)))
        return q2(base * variation)

    def _meter_base_offsets(self, site, year, month, meters_by_type):
        bases = {}
        for meter_type, meters in meters_by_type.items():
            for index, meter in enumerate(meters, start=1):
                seed = 5000 + (year * 17) + (month * 31) + (index * 211)
                if meter_type == 'SUPPLY':
                    seed += 8000
                elif meter_type == 'POWER_GRID':
                    seed += 12000
                elif meter_type == 'POWER_SOLAR':
                    seed += 16000
                bases[meter.meter_number] = Decimal(str(seed))
        return bases
