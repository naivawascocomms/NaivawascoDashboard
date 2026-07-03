from django.core.management.base import BaseCommand
from decimal import Decimal
from datetime import date
import calendar

from production.models import (
    Region, ProductionSite, WaterSource, Meter,
    MonthlyProduction, ProductionTarget
)


class Command(BaseCommand):
    help = "Seed real monthly production data with targets"

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, required=True)
        parser.add_argument("--months", type=int, default=12)

    def handle(self, *args, **options):
        year = options["year"]
        months = options["months"]

        self.stdout.write(self.style.SUCCESS("Seeding real production data…"))

        region, _ = Region.objects.get_or_create(
            name="Naivasha Region",
            code="NVS"
        )

        sites_config = [
            ("DTI Production Site", True, 52000),
            ("Waterworks Production Site", True, 68000),
            ("A.I.C Production Site", True, 41000),
            ("Karati Production Site", True, 47000),
            ("Mai Mahiu Production Site", True, 56000),
            ("Kinungi Production Site", True, 60000),
            ("Ngondi", True, 38000),
            ("DCK Production Site", False, 45000),
            ("Policeline Production Site", False, 30000),
        ]

        sites = {}

        for name, has_solar, base_volume in sites_config:
            site, _ = ProductionSite.objects.get_or_create(
                name=name,
                code=name.upper().replace(" ", "_"),
                region=region,
                defaults={
                    "has_solar": has_solar,
                    "site_type": "BOREHOLE",
                }
            )

            source, _ = WaterSource.objects.get_or_create(
                production_site=site,
                code="BH-01",
                defaults={"name": "Main Borehole"}
            )

            Meter.objects.get_or_create(
                production_site=site,
                water_source=source,
                meter_type="WATER",
                meter_number=f"{site.code}-WM",
                defaults={"installation_date": date(year, 1, 1)}
            )

            Meter.objects.get_or_create(
                production_site=site,
                meter_type="POWER_GRID",
                meter_number=f"{site.code}-GRID",
                defaults={"installation_date": date(year, 1, 1)}
            )

            if has_solar:
                Meter.objects.get_or_create(
                    production_site=site,
                    meter_type="POWER_SOLAR",
                    meter_number=f"{site.code}-SOLAR",
                    defaults={"installation_date": date(year, 1, 1)}
                )

            sites[site] = base_volume

        for month in range(1, months + 1):
            for site, base_volume in sites.items():

                days = calendar.monthrange(year, month)[1]

                water_abstracted = Decimal(base_volume)
                loss_m3 = water_abstracted * Decimal("0.06")
                net_water = water_abstracted - loss_m3

                efficiency = Decimal("0.75") if site.has_solar else Decimal("0.95")
                total_power = water_abstracted * efficiency

                if site.has_solar:
                    solar_kwh = total_power * Decimal("0.40")
                    grid_kwh = total_power - solar_kwh
                else:
                    solar_kwh = Decimal("0")
                    grid_kwh = total_power

                monthly, _ = MonthlyProduction.objects.update_or_create(
                    production_site=site,
                    year=year,
                    month=month,
                    defaults={
                        "water_abstracted_m3": water_abstracted,
                        "production_loss_m3": loss_m3,
                        "power_grid_kwh": grid_kwh,
                        "power_solar_kwh": solar_kwh,
                    }
                )

                target_multiplier = Decimal("1.03")

                ProductionTarget.objects.update_or_create(
                    production_site=site,
                    year=year,
                    month=month,
                    defaults={
                        "water_abstraction_target_m3": water_abstracted * target_multiplier,
                        "production_loss_target_m3": loss_m3 * Decimal("0.9"),
                        "power_grid_target_kwh": grid_kwh * target_multiplier,
                        "power_solar_target_kwh": solar_kwh * target_multiplier,
                        "power_efficiency_target_kwh_per_m3": efficiency * Decimal("0.98"),
                        "production_loss_target_percent": Decimal("5.5"),
                    }
                )

        self.stdout.write(self.style.SUCCESS("✔ Production data and targets seeded successfully"))
