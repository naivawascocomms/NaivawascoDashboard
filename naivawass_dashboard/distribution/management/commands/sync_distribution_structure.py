from django.core.management.base import BaseCommand
from django.db import transaction

from distribution.models import DMA, DistributionMeter, DistributionRegion, Zone
from production.models import Region


REGION_MAP = [
    {
        "code": "CENTRAL",
        "name": "Central",
        "production_region_code": "CENTRAL",
        "dashboard_order": 1,
        "dashboard_supply_kpi_code": "RA",
        "dashboard_billed_kpi_code": "RA2",
        "dashboard_nrw_m3_kpi_code": "RA3",
        "dashboard_nrw_pct_kpi_code": "RA4",
        "description": "Central distribution region from the dashboard workbook.",
    },
    {
        "code": "SOUTH",
        "name": "Southern",
        "production_region_code": "SOUTH",
        "dashboard_order": 2,
        "dashboard_supply_kpi_code": "RA6 (B)",
        "dashboard_billed_kpi_code": "RB2",
        "dashboard_nrw_m3_kpi_code": "RB3 (2)",
        "dashboard_nrw_pct_kpi_code": "RB4",
        "description": "Southern distribution region from the dashboard workbook.",
    },
    {
        "code": "EAST",
        "name": "Eastern",
        "production_region_code": "EAST",
        "dashboard_order": 3,
        "dashboard_supply_kpi_code": "RA6 (B) (2)",
        "dashboard_billed_kpi_code": "RB2 (3)",
        "dashboard_nrw_m3_kpi_code": "RB3 (3)",
        "dashboard_nrw_pct_kpi_code": "RB4 (2)",
        "description": "Eastern distribution region from the dashboard workbook.",
    },
]


ZONE_MAP = [
    {"region_code": "CENTRAL", "code": "CBD", "name": "CBD", "dashboard_order": 1, "supply": "101", "billed": "108", "nrw_pct": "122"},
    {"region_code": "CENTRAL", "code": "CCCR", "name": "CCCR", "dashboard_order": 2, "supply": "102", "billed": "109", "nrw_pct": "123"},
    {"region_code": "CENTRAL", "code": "LAKEVIEW", "name": "Lakeview", "dashboard_order": 3, "supply": "104", "billed": "111", "nrw_pct": "125"},
    {"region_code": "CENTRAL", "code": "KABATI", "name": "Kabati", "dashboard_order": 4, "supply": "103", "billed": "110", "nrw_pct": "124"},
    {"region_code": "CENTRAL", "code": "SITE", "name": "Site and Services", "dashboard_order": 5, "supply": "105", "billed": "112", "nrw_pct": "126"},
    {"region_code": "CENTRAL", "code": "HOPEWELL", "name": "Hopewell", "dashboard_order": 6, "supply": "105B", "billed": "112B", "nrw_pct": "126B"},
    {"region_code": "CENTRAL", "code": "KIHOTO", "name": "Kihoto", "dashboard_order": 7, "supply": "103 (2)", "billed": "110 (2)", "nrw_pct": "124 (2)"},
    {"region_code": "SOUTH", "code": "KAMERE", "name": "Kamere", "dashboard_order": 8, "supply": "106", "billed": "113", "nrw_pct": "127"},
    {"region_code": "SOUTH", "code": "HELLSGATE", "name": "Hells Gate", "dashboard_order": 9, "supply": "103 (3)", "billed": "110 (3)", "nrw_pct": "124 (3)"},
    {"region_code": "SOUTH", "code": "MAIMAHIU", "name": "Mai-Mahiu", "dashboard_order": 10, "supply": "103 (5)", "billed": "110 (5)", "nrw_pct": "124 (5)"},
    {"region_code": "SOUTH", "code": "LONGONOT", "name": "Longonot", "dashboard_order": 11, "supply": "103 (7)", "billed": "110 (7)", "nrw_pct": "124 (7)"},
    {"region_code": "EAST", "code": "KAYOLE", "name": "Kayole", "dashboard_order": 12, "supply": "103 (4)", "billed": "110 (4)", "nrw_pct": "124 (4)"},
    {"region_code": "EAST", "code": "KINUNGI", "name": "Kinungi", "dashboard_order": 13, "supply": "Y", "billed": "z", "nrw_pct": "K"},
    {"region_code": "EAST", "code": "GONDI", "name": "Gondi", "dashboard_order": 14, "supply": "Y (2)", "billed": "z (2)", "nrw_pct": "K (2)"},
    {"region_code": "EAST", "code": "NYONJORO", "name": "Nyonjoro", "dashboard_order": 15, "supply": "Y (3)", "billed": "z (3)", "nrw_pct": "K (3)"},
    {"region_code": "EAST", "code": "IHINDU", "name": "Ihindu", "dashboard_order": 16, "supply": "103 (6)", "billed": "110 (6)", "nrw_pct": "124 (6)"},
]


class Command(BaseCommand):
    help = "Reset distribution regions/zones to the workbook structure while preserving unmapped meters."

    @transaction.atomic
    def handle(self, *args, **options):
        detached_meters = DistributionMeter.objects.exclude(zone__isnull=True, dma__isnull=True)
        detached_count = detached_meters.count()
        detached_meters.update(zone=None, dma=None, notes="Legacy zone/DMA mapping cleared during workbook structure sync.")

        DMA.objects.all().delete()
        Zone.objects.all().delete()
        DistributionRegion.objects.all().delete()

        production_regions = {
            region.code: region
            for region in Region.objects.filter(code__in=[item["production_region_code"] for item in REGION_MAP])
        }

        region_objects = {}
        for item in REGION_MAP:
            region = DistributionRegion.objects.create(
                code=item["code"],
                name=item["name"],
                description=item["description"],
                production_region=production_regions.get(item["production_region_code"]),
                dashboard_order=item["dashboard_order"],
                dashboard_supply_kpi_code=item["dashboard_supply_kpi_code"],
                dashboard_billed_kpi_code=item["dashboard_billed_kpi_code"],
                dashboard_nrw_m3_kpi_code=item["dashboard_nrw_m3_kpi_code"],
                dashboard_nrw_pct_kpi_code=item["dashboard_nrw_pct_kpi_code"],
                default_billing_day=1,
                is_active=True,
            )
            region_objects[item["code"]] = region

        for item in ZONE_MAP:
            Zone.objects.create(
                region=region_objects[item["region_code"]],
                code=item["code"],
                name=item["name"],
                description="Dashboard workbook zone structure.",
                dashboard_order=item["dashboard_order"],
                dashboard_supply_kpi_code=item["supply"],
                dashboard_billed_kpi_code=item["billed"],
                dashboard_nrw_pct_kpi_code=item["nrw_pct"],
                supply_aggregation_method="UNSET",
                zone_type="URBAN",
                is_active=True,
            )

        self.stdout.write(self.style.SUCCESS(
            f"Distribution structure synced: {len(REGION_MAP)} regions, {len(ZONE_MAP)} zones. "
            f"Detached {detached_count} legacy meter mappings for later zone-by-zone remapping."
        ))
