import calendar
import hashlib
from collections import defaultdict
from datetime import date, time, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from distribution.models import (
    DailyDistribution,
    MonthlyDistribution,
    Zone,
)
from distribution.utils import refresh_distribution_for_zone_dates, resolve_zone_meter_inputs
from metering.models import (
    EnergyMeter,
    EnergyMeterReading,
    ProductionEnergyMeterAssignment,
    ProductionWaterMeterAssignment,
    WaterMeter,
    WaterMeterReading,
)
from production.models import (
    DailyProduction,
    MonthlyProduction,
    ProductionTarget,
)
from production.utils import refresh_production_for_site_dates


def q2(value):
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def stable_variation(*parts):
    raw = "|".join(str(part) for part in parts)
    digest = hashlib.sha256(raw.encode()).hexdigest()
    return (int(digest[:8], 16) % 700) / 10000  # 0.0000 .. 0.0699


def month_weights(day_count, entity_code, year, month):
    base_cycle = [
        Decimal("0.96"),
        Decimal("1.01"),
        Decimal("1.04"),
        Decimal("0.98"),
        Decimal("1.03"),
        Decimal("0.97"),
        Decimal("1.01"),
    ]
    weights = []
    for idx in range(day_count):
        wobble = Decimal(str(stable_variation(entity_code, year, month, idx))) - Decimal("0.035")
        weights.append(base_cycle[idx % len(base_cycle)] + wobble)
    total = sum(weights)
    return [weight / total for weight in weights]


def normalized_weights(items, seed_key):
    count = len(items)
    if count == 0:
        return []
    if count == 1:
        return [Decimal("1")]
    raw = [Decimal(str(count - index)) for index in range(count)]
    if seed_key == "WWS:SUPPLY" and count >= 5:
        raw = [
            Decimal("0.35"),
            Decimal("0.24"),
            Decimal("0.16"),
            Decimal("0.10"),
            Decimal("0.08"),
            Decimal("0.07"),
        ][:count]
    total = sum(raw)
    return [value / total for value in raw]


def latest_historical_production_month(site, year, month):
    return (
        MonthlyProduction.objects.filter(production_site=site)
        .filter(Q(year__lt=year) | Q(year=year, month__lt=month))
        .order_by("-year", "-month")
        .first()
    )


def latest_historical_distribution_month(zone, year, month):
    return (
        MonthlyDistribution.objects.filter(zone=zone)
        .filter(
            Q(billing_cycle__year__lt=year)
            | Q(billing_cycle__year=year, billing_cycle__month__lt=month)
        )
        .select_related("billing_cycle")
        .order_by("-billing_cycle__year", "-billing_cycle__month")
        .first()
    )


class Command(BaseCommand):
    help = (
        "Seed shared canonical water and energy meter readings for a date range, "
        "then rebuild production and commercial distribution from those readings."
    )

    def add_arguments(self, parser):
        parser.add_argument("--start-date", required=True, help="Start date in YYYY-MM-DD format")
        parser.add_argument("--end-date", required=True, help="End date in YYYY-MM-DD format")
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete existing shared readings and reading-driven derived records in range first",
        )

    def handle(self, *args, **options):
        start_date = date.fromisoformat(options["start_date"])
        end_date = date.fromisoformat(options["end_date"])
        reset = options["reset"]
        if end_date < start_date:
            raise ValueError("end-date must be on or after start-date")

        production_site_map = self._build_production_site_map(start_date, end_date)
        zone_input_map = self._build_zone_input_map(start_date)

        water_daily_by_meter = defaultdict(dict)
        energy_daily_by_meter = defaultdict(dict)

        seeded_site_ids = set()
        for site in production_site_map.values():
            seeded_site_ids.add(site["site"].id)
            self._seed_production_site_range(
                site_data=site,
                start_date=start_date,
                end_date=end_date,
                water_daily_by_meter=water_daily_by_meter,
                energy_daily_by_meter=energy_daily_by_meter,
            )

        zone_month_targets = self._build_zone_month_targets(zone_input_map, start_date, end_date)
        self._seed_distribution_only_meters(
            zone_input_map=zone_input_map,
            zone_month_targets=zone_month_targets,
            start_date=start_date,
            end_date=end_date,
            production_seeded_water_meter_ids=set(water_daily_by_meter.keys()),
            water_daily_by_meter=water_daily_by_meter,
        )

        water_meter_ids = sorted(water_daily_by_meter.keys())
        energy_meter_ids = sorted(energy_daily_by_meter.keys())
        zone_ids = sorted(zone_input_map.keys())
        touched_months = {
            (current.year, current.month)
            for current in self._date_range(start_date, end_date)
        }

        with transaction.atomic():
            if reset:
                self._reset_range(
                    start_date=start_date,
                    end_date=end_date,
                    water_meter_ids=water_meter_ids,
                    energy_meter_ids=energy_meter_ids,
                    site_ids=sorted(seeded_site_ids),
                    zone_ids=zone_ids,
                    touched_months=touched_months,
                )
            else:
                self._ensure_no_duplicates(
                    start_date=start_date,
                    end_date=end_date,
                    water_meter_ids=water_meter_ids,
                    energy_meter_ids=energy_meter_ids,
                )

            created_water = self._bulk_create_water_readings(start_date, water_daily_by_meter)
            created_energy = self._bulk_create_energy_readings(start_date, energy_daily_by_meter)

            production_dates = {
                (site_id, current_date)
                for site_id in seeded_site_ids
                for current_date in self._date_range(start_date, end_date)
            }
            refresh_production_for_site_dates(production_dates)

            zone_dates = {
                (zone_id, current_date)
                for zone_id in zone_ids
                for current_date in self._date_range(start_date, end_date)
            }
            refresh_distribution_for_zone_dates(zone_dates)

        skipped_zones = sorted(
            zone_data["zone"].code for zone_data in zone_input_map.values() if zone_data["input_count"] == 0
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {created_water} water readings and {created_energy} energy readings "
                f"from {start_date} to {end_date}."
            )
        )
        if skipped_zones:
            self.stdout.write(
                self.style.WARNING(
                    "Zones still lacking any resolved shared input meters and therefore skipped: "
                    + ", ".join(skipped_zones)
                )
            )

    def _build_production_site_map(self, start_date, end_date):
        active_water_assignments = (
            ProductionWaterMeterAssignment.objects.select_related("production_site", "water_meter")
            .filter(is_active=True)
            .filter(Q(start_date__isnull=True) | Q(start_date__lte=end_date))
            .filter(Q(end_date__isnull=True) | Q(end_date__gte=start_date))
        )
        active_energy_assignments = (
            ProductionEnergyMeterAssignment.objects.select_related("production_site", "energy_meter")
            .filter(is_active=True)
            .filter(Q(start_date__isnull=True) | Q(start_date__lte=end_date))
            .filter(Q(end_date__isnull=True) | Q(end_date__gte=start_date))
        )

        site_map = {}
        for assignment in active_water_assignments:
            site_id = assignment.production_site_id
            site_entry = site_map.setdefault(
                site_id,
                {
                    "site": assignment.production_site,
                    "abstraction_meters": [],
                    "supply_meters": [],
                    "grid_meters": [],
                    "solar_meters": [],
                },
            )
            target_list = (
                site_entry["abstraction_meters"]
                if assignment.assignment_role == "ABSTRACTION"
                else site_entry["supply_meters"]
            )
            if assignment.water_meter not in target_list:
                target_list.append(assignment.water_meter)

        for assignment in active_energy_assignments:
            site_id = assignment.production_site_id
            site_entry = site_map.setdefault(
                site_id,
                {
                    "site": assignment.production_site,
                    "abstraction_meters": [],
                    "supply_meters": [],
                    "grid_meters": [],
                    "solar_meters": [],
                },
            )
            target_list = (
                site_entry["grid_meters"]
                if assignment.assignment_role == "GRID"
                else site_entry["solar_meters"]
            )
            if assignment.energy_meter not in target_list:
                target_list.append(assignment.energy_meter)

        return {
            site_id: data
            for site_id, data in site_map.items()
            if data["abstraction_meters"] or data["grid_meters"] or data["solar_meters"]
        }

    def _build_zone_input_map(self, reading_date):
        zone_map = {}
        for zone in Zone.objects.select_related("region").filter(is_active=True):
            inputs = resolve_zone_meter_inputs(zone, reading_date)
            zone_map[zone.id] = {
                "zone": zone,
                "inputs": inputs,
                "input_count": len(inputs),
            }
        return zone_map

    def _seed_production_site_range(
        self,
        site_data,
        start_date,
        end_date,
        water_daily_by_meter,
        energy_daily_by_meter,
    ):
        site = site_data["site"]
        abstraction_meters = site_data["abstraction_meters"]
        supply_meters = [] if site.production_equals_supply else site_data["supply_meters"]
        grid_meters = site_data["grid_meters"]
        solar_meters = site_data["solar_meters"]

        for year, month, month_start, month_end in self._month_spans(start_date, end_date):
            span_start = max(start_date, month_start)
            span_end = min(end_date, month_end)
            span_days = (span_end - span_start).days + 1
            total_days_in_month = calendar.monthrange(year, month)[1]
            totals = self._build_production_month_totals(
                site=site,
                year=year,
                month=month,
                total_days_in_month=total_days_in_month,
                span_days=span_days,
                abstraction_count=len(abstraction_meters),
                supply_count=len(supply_meters),
                grid_count=len(grid_meters),
                solar_count=len(solar_meters),
            )

            day_weights = month_weights(span_days, site.code, year, month)
            daily_role_totals = {
                key: [q2(totals[key] * weight) for weight in day_weights]
                for key in ("water", "supply", "grid", "solar")
            }
            for key, values in daily_role_totals.items():
                if values:
                    values[-1] += totals[key] - sum(values)

            self._distribute_daily_meter_totals(
                meters=abstraction_meters,
                seed_key=f"{site.code}:ABSTRACTION",
                daily_totals=daily_role_totals["water"],
                span_start=span_start,
                storage=water_daily_by_meter,
            )
            self._distribute_daily_meter_totals(
                meters=supply_meters,
                seed_key=f"{site.code}:SUPPLY",
                daily_totals=daily_role_totals["supply"],
                span_start=span_start,
                storage=water_daily_by_meter,
            )
            self._distribute_daily_meter_totals(
                meters=grid_meters,
                seed_key=f"{site.code}:GRID",
                daily_totals=daily_role_totals["grid"],
                span_start=span_start,
                storage=energy_daily_by_meter,
            )
            self._distribute_daily_meter_totals(
                meters=solar_meters,
                seed_key=f"{site.code}:SOLAR",
                daily_totals=daily_role_totals["solar"],
                span_start=span_start,
                storage=energy_daily_by_meter,
            )

    def _build_production_month_totals(
        self,
        site,
        year,
        month,
        total_days_in_month,
        span_days,
        abstraction_count,
        supply_count,
        grid_count,
        solar_count,
    ):
        target = ProductionTarget.objects.filter(
            production_site=site,
            year=year,
            month=month,
        ).first()
        historical = latest_historical_production_month(site, year, month)

        target_water = target.water_abstraction_target_m3 if target else Decimal("0")
        historical_water = historical.water_abstracted_m3 if historical else Decimal("0")
        full_water = self._blend_quantity(
            entity_code=site.code,
            year=year,
            month=month,
            target_value=target_water,
            historical_value=historical_water,
            fallback=Decimal(str(max(abstraction_count, 1) * 750)),
        )

        target_supply = target.water_supply_target_m3 if target else Decimal("0")
        historical_supply = Decimal("0")
        if historical:
            historical_supply = historical.water_supplied_m3 or historical.water_available_for_sale_m3

        if site.code == "WWS":
            full_supply = max(full_water * Decimal("1.18"), historical_supply, full_water + Decimal("350"))
        elif site.production_equals_supply:
            full_supply = full_water
        else:
            full_supply = self._blend_quantity(
                entity_code=f"{site.code}:SUPPLY",
                year=year,
                month=month,
                target_value=target_supply,
                historical_value=historical_supply,
                fallback=full_water * Decimal("0.95"),
            )
            if full_supply > full_water:
                full_supply = full_water

        target_grid = target.power_grid_target_kwh if target else Decimal("0")
        target_solar = target.power_solar_target_kwh if target else Decimal("0")
        historical_grid = historical.power_grid_kwh if historical else Decimal("0")
        historical_solar = historical.power_solar_kwh if historical else Decimal("0")

        full_grid = self._blend_quantity(
            entity_code=f"{site.code}:GRID",
            year=year,
            month=month,
            target_value=target_grid,
            historical_value=historical_grid,
            fallback=full_water * Decimal("0.48") if grid_count else Decimal("0"),
        )
        full_solar = self._blend_quantity(
            entity_code=f"{site.code}:SOLAR",
            year=year,
            month=month,
            target_value=target_solar,
            historical_value=historical_solar,
            fallback=full_water * Decimal("0.12") if solar_count else Decimal("0"),
        )

        if grid_count == 0:
            full_grid = Decimal("0")
        if solar_count == 0:
            full_solar = Decimal("0")

        scale = Decimal(span_days) / Decimal(total_days_in_month)
        return {
            "water": q2(full_water * scale),
            "supply": q2(full_supply * scale),
            "grid": q2(full_grid * scale),
            "solar": q2(full_solar * scale),
        }

    def _blend_quantity(self, entity_code, year, month, target_value, historical_value, fallback):
        if target_value and historical_value:
            base = (target_value * Decimal("0.58")) + (historical_value * Decimal("0.42"))
        elif target_value:
            base = target_value
        elif historical_value:
            base = historical_value
        else:
            base = fallback
        variation = Decimal("0.95") + Decimal(str(stable_variation(entity_code, year, month)))
        return q2(base * variation)

    def _distribute_daily_meter_totals(self, meters, seed_key, daily_totals, span_start, storage):
        if not meters:
            return
        weights = normalized_weights(meters, seed_key)
        for meter, meter_weight in zip(meters, weights):
            meter_values = [q2(day_total * meter_weight) for day_total in daily_totals]
            if meter_values:
                meter_values[-1] += q2(sum(daily_totals) * meter_weight) - sum(meter_values)
            for offset, consumption in enumerate(meter_values):
                storage[meter.id][span_start + timedelta(days=offset)] = q2(consumption)

    def _build_zone_month_targets(self, zone_input_map, start_date, end_date):
        zone_targets = {}
        for year, month, _month_start, _month_end in self._month_spans(start_date, end_date):
            for zone_id, zone_data in zone_input_map.items():
                zone = zone_data["zone"]
                historical = latest_historical_distribution_month(zone, year, month)
                input_count = max(zone_data["input_count"], 1)
                base = historical.volume_supplied_m3 if historical else Decimal(str(input_count * 900))
                variation = Decimal("0.96") + Decimal(str(stable_variation(zone.code, year, month)))
                zone_targets[(zone_id, year, month)] = q2(base * variation)
        return zone_targets

    def _seed_distribution_only_meters(
        self,
        zone_input_map,
        zone_month_targets,
        start_date,
        end_date,
        production_seeded_water_meter_ids,
        water_daily_by_meter,
    ):
        for year, month, month_start, month_end in self._month_spans(start_date, end_date):
            span_start = max(start_date, month_start)
            span_end = min(end_date, month_end)
            span_days = (span_end - span_start).days + 1
            day_weights_by_zone = {
                zone_id: month_weights(span_days, zone_data["zone"].code, year, month)
                for zone_id, zone_data in zone_input_map.items()
            }

            month_total_by_meter = defaultdict(Decimal)
            for meter_id, day_values in water_daily_by_meter.items():
                month_total_by_meter[meter_id] = sum(
                    value
                    for reading_date, value in day_values.items()
                    if reading_date.year == year and reading_date.month == month
                )

            meter_zone_links = defaultdict(list)
            home_zone_by_meter = {}
            zone_home_meters = defaultdict(list)
            zone_outbound_cross_zone = defaultdict(int)

            for zone_id, zone_data in zone_input_map.items():
                for item in zone_data["inputs"]:
                    meter_id = item["water_meter"].id
                    allocation = Decimal(item["allocation_percentage"])
                    meter_zone_links[meter_id].append((zone_id, allocation))

            for meter_id, links in meter_zone_links.items():
                if meter_id in production_seeded_water_meter_ids:
                    continue
                positive_links = [link for link in links if link[1] > 0]
                if positive_links:
                    chosen = max(positive_links, key=lambda link: (link[1], -link[0]))
                else:
                    chosen = max(links, key=lambda link: (abs(link[1]), -link[0]))
                home_zone = chosen[0]
                home_zone_by_meter[meter_id] = home_zone
                zone_home_meters[home_zone].append((meter_id, chosen[1]))
                zone_outbound_cross_zone[home_zone] += sum(
                    1 for linked_zone_id, _allocation in links if linked_zone_id != home_zone
                )

            ordered_zone_ids = sorted(
                zone_input_map.keys(),
                key=lambda zone_id: (
                    -zone_outbound_cross_zone.get(zone_id, 0),
                    zone_input_map[zone_id]["zone"].region.dashboard_order,
                    zone_input_map[zone_id]["zone"].dashboard_order,
                    zone_input_map[zone_id]["zone"].code,
                ),
            )

            unknown_month_total_by_meter = {}
            for zone_id in ordered_zone_ids:
                home_meters = zone_home_meters.get(zone_id, [])
                if not home_meters:
                    continue

                target_total = zone_month_targets[(zone_id, year, month)]
                fixed_contribution = Decimal("0")
                external_contribution = Decimal("0")

                for item in zone_input_map[zone_id]["inputs"]:
                    meter_id = item["water_meter"].id
                    allocation_factor = Decimal(item["allocation_percentage"]) / Decimal("100")
                    meter_total = month_total_by_meter.get(meter_id, Decimal("0"))
                    if meter_id in unknown_month_total_by_meter:
                        external_contribution += meter_total * allocation_factor
                    elif meter_id in production_seeded_water_meter_ids:
                        fixed_contribution += meter_total * allocation_factor

                residual_total = target_total - fixed_contribution - external_contribution
                if residual_total < 0:
                    residual_total = Decimal("0")

                zone_alloc_total = sum(abs(allocation) for _meter_id, allocation in home_meters) or Decimal("1")
                running_total = Decimal("0")
                for index, (meter_id, allocation) in enumerate(home_meters):
                    if index == len(home_meters) - 1:
                        meter_total = residual_total - running_total
                    else:
                        meter_total = q2(residual_total * (abs(allocation) / zone_alloc_total))
                        running_total += meter_total
                    unknown_month_total_by_meter[meter_id] = q2(meter_total)
                    month_total_by_meter[meter_id] = q2(meter_total)

            for meter_id, month_total in unknown_month_total_by_meter.items():
                home_zone_id = home_zone_by_meter[meter_id]
                weights = day_weights_by_zone[home_zone_id]
                daily_values = [q2(month_total * weight) for weight in weights]
                if daily_values:
                    daily_values[-1] += month_total - sum(daily_values)
                for offset, consumption in enumerate(daily_values):
                    water_daily_by_meter[meter_id][span_start + timedelta(days=offset)] = q2(consumption)

    def _reset_range(
        self,
        start_date,
        end_date,
        water_meter_ids,
        energy_meter_ids,
        site_ids,
        zone_ids,
        touched_months,
    ):
        if water_meter_ids:
            WaterMeterReading.objects.filter(
                water_meter_id__in=water_meter_ids,
                reading_date__range=(start_date, end_date),
            ).delete()
        if energy_meter_ids:
            EnergyMeterReading.objects.filter(
                energy_meter_id__in=energy_meter_ids,
                reading_date__range=(start_date, end_date),
            ).delete()

        if site_ids:
            DailyProduction.objects.filter(
                production_site_id__in=site_ids,
                production_date__range=(start_date, end_date),
            ).delete()
            for year, month in touched_months:
                MonthlyProduction.objects.filter(
                    production_site_id__in=site_ids,
                    year=year,
                    month=month,
                ).delete()

        if zone_ids:
            DailyDistribution.objects.filter(
                zone_id__in=zone_ids,
                distribution_date__range=(start_date, end_date),
            ).delete()

    def _ensure_no_duplicates(self, start_date, end_date, water_meter_ids, energy_meter_ids):
        water_exists = False
        energy_exists = False
        if water_meter_ids:
            water_exists = WaterMeterReading.objects.filter(
                water_meter_id__in=water_meter_ids,
                reading_date__range=(start_date, end_date),
            ).exists()
        if energy_meter_ids:
            energy_exists = EnergyMeterReading.objects.filter(
                energy_meter_id__in=energy_meter_ids,
                reading_date__range=(start_date, end_date),
            ).exists()
        if water_exists or energy_exists:
            raise ValueError("Existing shared readings found in range. Re-run with --reset to replace them.")

    def _bulk_create_water_readings(self, start_date, water_daily_by_meter):
        readings = []
        created_at = timezone.now()
        meters = WaterMeter.objects.in_bulk(water_daily_by_meter.keys())
        for meter_id, day_values in water_daily_by_meter.items():
            meter = meters[meter_id]
            previous = self._previous_water_reading(meter, start_date)
            for reading_date in sorted(day_values.keys()):
                consumption = q2(day_values[reading_date])
                current = q2(previous + consumption)
                readings.append(
                    WaterMeterReading(
                        water_meter=meter,
                        reading_date=reading_date,
                        reading_time=time(8, 0),
                        current_reading=current,
                        previous_reading=previous,
                        consumption=consumption,
                        read_by="SYSTEM_SHARED_HISTORY_SEED",
                        reading_method="ESTIMATED",
                        is_validated=True,
                        validated_by="SYSTEM_SHARED_HISTORY_SEED",
                        validated_at=created_at,
                        notes="Pseudo shared water reading seeded for production and commercial distribution testing.",
                    )
                )
                previous = current
        WaterMeterReading.objects.bulk_create(readings, batch_size=500)
        return len(readings)

    def _bulk_create_energy_readings(self, start_date, energy_daily_by_meter):
        readings = []
        created_at = timezone.now()
        meters = EnergyMeter.objects.in_bulk(energy_daily_by_meter.keys())
        for meter_id, day_values in energy_daily_by_meter.items():
            meter = meters[meter_id]
            previous = self._previous_energy_reading(meter, start_date)
            for reading_date in sorted(day_values.keys()):
                consumption = q2(day_values[reading_date])
                current = q2(previous + consumption)
                readings.append(
                    EnergyMeterReading(
                        energy_meter=meter,
                        reading_date=reading_date,
                        reading_time=time(8, 0),
                        current_reading=current,
                        previous_reading=previous,
                        consumption=consumption,
                        read_by="SYSTEM_SHARED_HISTORY_SEED",
                        reading_method="ESTIMATED",
                        is_validated=True,
                        validated_by="SYSTEM_SHARED_HISTORY_SEED",
                        validated_at=created_at,
                        notes="Pseudo shared energy reading seeded for production testing.",
                    )
                )
                previous = current
        EnergyMeterReading.objects.bulk_create(readings, batch_size=500)
        return len(readings)

    def _previous_water_reading(self, meter, start_date):
        previous = (
            WaterMeterReading.objects.filter(water_meter=meter, reading_date__lt=start_date)
            .order_by("-reading_date", "-reading_time")
            .first()
        )
        return previous.current_reading if previous else meter.initial_reading

    def _previous_energy_reading(self, meter, start_date):
        previous = (
            EnergyMeterReading.objects.filter(energy_meter=meter, reading_date__lt=start_date)
            .order_by("-reading_date", "-reading_time")
            .first()
        )
        return previous.current_reading if previous else meter.initial_reading

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
