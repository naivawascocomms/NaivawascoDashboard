from django.core.management.base import BaseCommand
from production.models import Region, ProductionSite, WaterSource


class Command(BaseCommand):
    help = "Seed production regions, sites, and water sources"

    def handle(self, *args, **options):

        region, _ = Region.objects.get_or_create(
            code="CR",
            defaults={
                "name": "Central Region",
                "is_active": True,
            }
        )

        site, _ = ProductionSite.objects.get_or_create(
            code="DTI",
            defaults={
                "name": "DTI Production Site",
                "region": region,
                "site_type": "BOREHOLE",
                "has_solar": True,
                "is_active": True,
            }
        )

        WaterSource.objects.get_or_create(
            code="DTI-BH-01",
            defaults={
                "name": "Borehole 1",
                "production_site": site,
                "source_type": "BOREHOLE",
                "is_active": True,
            }
        )

        WaterSource.objects.get_or_create(
            code="DTI-BH-02",
            defaults={
                "name": "Borehole 2",
                "production_site": site,
                "source_type": "BOREHOLE",
                "is_active": True,
            }
        )

        self.stdout.write(self.style.SUCCESS(
            "Production structure created (Region → Site → WaterSources)"
        ))
