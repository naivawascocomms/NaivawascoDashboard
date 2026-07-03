from django.core.management.base import BaseCommand
from decimal import Decimal
from datetime import date, timedelta

from production.models import ProductionSite, Meter, MeterReading


class Command(BaseCommand):
    help = "Seed pseudo daily meter readings for analysis/testing"

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, required=True)
        parser.add_argument("--month", type=int, required=True)
        parser.add_argument("--days", type=int, default=7)
        parser.add_argument("--reset", action="store_true")

    def handle(self, *args, **options):
        year = options["year"]
        month = options["month"]
        days = options["days"]
        reset = options["reset"]

        self.stdout.write(self.style.SUCCESS("Seeding pseudo meter readings…"))

        start_date = date(year, month, 1)
        end_date = start_date + timedelta(days=days - 1)

        if reset:
            deleted, _ = MeterReading.objects.filter(
                reading_date__range=(start_date, end_date)
            ).delete()
            self.stdout.write(
                self.style.WARNING(f"Deleted {deleted} existing readings in range")
            )

        for site in ProductionSite.objects.filter(is_active=True):

            water_meter = site.meters.filter(meter_type="WATER").first()
            grid_meter = site.meters.filter(meter_type="POWER_GRID").first()
            solar_meter = site.meters.filter(meter_type="POWER_SOLAR").first()

            if not water_meter or not grid_meter:
                continue

            # Pseudo baselines (intentionally obvious fake values)
            water_value = Decimal("100000")
            grid_value = Decimal("50000")
            solar_value = Decimal("30000") if solar_meter else None

            # Daily abstraction estimate
            daily_water = Decimal("1500") if site.has_solar else Decimal("1100")

            for i in range(days):
                reading_date = start_date + timedelta(days=i)

                # Small day-to-day variation
                variation = Decimal("0.95") + (Decimal(i % 3) * Decimal("0.025"))
                water_today = daily_water * variation

                efficiency = Decimal("0.75") if site.has_solar else Decimal("0.95")
                total_power_today = water_today * efficiency

                if site.has_solar:
                    solar_today = total_power_today * Decimal("0.4")
                    grid_today = total_power_today - solar_today
                else:
                    solar_today = Decimal("0")
                    grid_today = total_power_today

                # Water meter reading
                MeterReading.objects.update_or_create(
                    meter=water_meter,
                    reading_date=reading_date,
                    defaults={
                        "previous_reading": water_value,
                        "current_reading": water_value + water_today,
                        "read_by": "SYSTEM_PSEUDO",
                        "reading_method": "ESTIMATED",
                    }
                )
                water_value += water_today

                # Grid power reading
                MeterReading.objects.update_or_create(
                    meter=grid_meter,
                    reading_date=reading_date,
                    defaults={
                        "previous_reading": grid_value,
                        "current_reading": grid_value + grid_today,
                        "read_by": "SYSTEM_PSEUDO",
                        "reading_method": "ESTIMATED",
                    }
                )
                grid_value += grid_today

                # Solar power reading
                if solar_meter:
                    MeterReading.objects.update_or_create(
                        meter=solar_meter,
                        reading_date=reading_date,
                        defaults={
                            "previous_reading": solar_value,
                            "current_reading": solar_value + solar_today,
                            "read_by": "SYSTEM_PSEUDO",
                            "reading_method": "ESTIMATED",
                        }
                    )
                    solar_value += solar_today

        self.stdout.write(
            self.style.SUCCESS("✔ Pseudo meter readings seeded successfully")
        )
