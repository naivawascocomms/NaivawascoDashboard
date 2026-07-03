from django.core.management.base import BaseCommand
from django.db import transaction

from distribution.models import DMA, DistributionMeter, Zone


DMA_DEFINITIONS = [
    {"zone_code": "CCCR", "code": "CCCR-DMA", "name": "CCCR DMA"},
    {"zone_code": "KABATI", "code": "KABATI-KAG", "name": "Kabati KAG"},
    {"zone_code": "KABATI", "code": "KABATI-MAKABURI", "name": "Kabati Makaburi"},
    {"zone_code": "KAYOLE", "code": "KAYOLE-DMA", "name": "Kayole DMA"},
    {"zone_code": "LONGONOT", "code": "LONGONOT-UPPER-ERERI", "name": "Longonot Upper Ereri"},
]


class Command(BaseCommand):
    help = "Apply the safe first-pass distribution meter mappings to canonical workbook zones."

    @transaction.atomic
    def handle(self, *args, **options):
        zone_map = {zone.code: zone for zone in Zone.objects.all()}

        created_dmas = {}
        for item in DMA_DEFINITIONS:
            zone = zone_map[item["zone_code"]]
            dma, _ = DMA.objects.get_or_create(
                code=item["code"],
                defaults={
                    "zone": zone,
                    "name": item["name"],
                    "description": "Phase 1 canonical DMA mapping from distribution workbook alignment.",
                    "is_active": True,
                },
            )
            if dma.zone_id != zone.id:
                dma.zone = zone
                dma.name = item["name"]
                dma.is_active = True
                dma.save(update_fields=["zone", "name", "is_active", "updated_at"])
            created_dmas[item["code"]] = dma

        mapped = 0

        def map_zone_meter(meter_number, zone_code, note_suffix):
            nonlocal mapped
            meter = DistributionMeter.objects.filter(meter_number=meter_number).first()
            if not meter:
                return
            zone = zone_map[zone_code]
            meter.zone = zone
            meter.dma = None
            meter.notes = f"{meter.notes} | {note_suffix}".strip(" |")
            meter.save(update_fields=["zone", "dma", "notes", "updated_at"])
            mapped += 1

        def map_dma_meter(meter_number, dma_code, note_suffix):
            nonlocal mapped
            meter = DistributionMeter.objects.filter(meter_number=meter_number).first()
            if not meter:
                return
            dma = created_dmas[dma_code]
            meter.zone = dma.zone
            meter.dma = dma
            meter.notes = f"{meter.notes} | {note_suffix}".strip(" |")
            meter.save(update_fields=["zone", "dma", "notes", "updated_at"])
            mapped += 1

        # Exact zone-name mappings.
        map_zone_meter("LOWER SITE UL1", "SITE", "Phase 1 mapped to SITE from exact meter name.")
        map_zone_meter("KIHOTO KARAGITA UL1", "KIHOTO", "Phase 1 mapped to KIHOTO from exact meter name.")
        map_zone_meter("KAMERE UL1", "KAMERE", "Phase 1 mapped to KAMERE from exact meter name.")

        # Safe DMA mappings carried forward from the legacy structure observed before the workbook sync.
        map_dma_meter("25016539", "CCCR-DMA", "Phase 1 mapped to CCCR DMA from legacy structure.")
        map_dma_meter("ZR18421933525", "KABATI-KAG", "Phase 1 mapped to Kabati KAG DMA from legacy structure.")
        map_dma_meter("ZR18421933522", "KABATI-MAKABURI", "Phase 1 mapped to Kabati Makaburi DMA from legacy structure.")
        map_dma_meter("KAYOLE UL1", "KAYOLE-DMA", "Phase 1 mapped to Kayole DMA from exact meter name.")
        map_dma_meter("KAYOLE UL2", "KAYOLE-DMA", "Phase 1 mapped to Kayole DMA from exact meter name.")
        map_dma_meter("8ZR18418032428", "LONGONOT-UPPER-ERERI", "Phase 1 mapped to Longonot Upper Ereri from legacy structure.")

        # Zone-level longonot inlet retained separately from the DMA.
        map_zone_meter("U21W1706618M", "LONGONOT", "Phase 1 mapped to LONGONOT from legacy Longonot Tank structure.")

        # Set aggregation methods only where the phase 1 mapping is sufficiently clear.
        zone_map["SITE"].supply_aggregation_method = "ZONE_METER"
        zone_map["SITE"].save(update_fields=["supply_aggregation_method", "updated_at"])

        zone_map["KIHOTO"].supply_aggregation_method = "ZONE_METER"
        zone_map["KIHOTO"].save(update_fields=["supply_aggregation_method", "updated_at"])

        zone_map["KAMERE"].supply_aggregation_method = "ZONE_METER"
        zone_map["KAMERE"].save(update_fields=["supply_aggregation_method", "updated_at"])

        zone_map["KAYOLE"].supply_aggregation_method = "DMA_SUM"
        zone_map["KAYOLE"].save(update_fields=["supply_aggregation_method", "updated_at"])

        self.stdout.write(self.style.SUCCESS(
            f"Phase 1 meter mapping applied. Mapped {mapped} meters and created/updated {len(created_dmas)} DMAs."
        ))
