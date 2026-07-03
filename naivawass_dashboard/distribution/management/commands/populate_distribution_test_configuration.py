from django.core.management.base import BaseCommand
from django.db import transaction

from distribution.models import DMA, DistributionMeter, Zone, ZoneSupplyConfiguration


DMA_BLUEPRINTS = {
    'CBD': [
        ('NEW-LINE', 'New Line'),
        ('CONSOLATA', 'Consolata'),
        ('LV-CONSOLATA', 'L/V to Consolata'),
        ('PRISONS-STAFF', 'Prisons Staff'),
        ('POLICE-LINE', 'Police Line'),
        ('GUEST-INN', 'Guest Inn'),
        ('SUBERICO-1', 'Suberico 1'),
        ('SUBERICO-2', 'Suberico 2'),
        ('CBD-FEED-A', 'CBD/CCCR Feed A'),
        ('CBD-FEED-B', 'CBD/CCCR Feed B'),
    ],
    'CCCR': [
        ('CCCR-DMA', 'CCCR DMA'),
    ],
    'LAKEVIEW': [
        ('DRYPORT', 'Dryport'),
        ('KARIMA', 'Karima'),
        ('GATHIMA', 'Gathima'),
        ('KIJABE', 'Kijabe'),
        ('MIRERA-KIU', 'Mirera Kiu'),
        ('MIRERA-1', 'Mirera 1'),
        ('KWA-MUHIA', 'Kwa Muhia'),
        ('DCK', 'DCK'),
        ('KCC', 'KCC'),
        ('MARARO', 'Mararo'),
    ],
    'KABATI': [
        ('KAG', 'KAG'),
        ('MAKABURINI', 'Makaburini'),
    ],
    'SITE': [
        ('LOWER-SITE', 'Lower Site'),
        ('UPPER-SITE', 'Upper Site'),
    ],
    'HOPEWELL': [
        ('HOPEWELL-MAIN', 'Hopewell Main'),
    ],
    'HELLSGATE': [
        ('HELLSGATE-MAIN', 'Hells Gate Main'),
    ],
    'MAIMAHIU': [
        ('MAIMAHIU-MAIN', 'Mai-Mahiu Main'),
    ],
    'KAYOLE': [
        ('KAYOLE-DMA', 'Kayole DMA'),
    ],
    'KINUNGI': [
        ('KINUNGI-MAIN', 'Kinungi Main'),
    ],
    'GONDI': [
        ('GONDI-MAIN', 'Gondi Main'),
    ],
    'NYONJORO': [
        ('NYONJORO-MAIN', 'Nyonjoro Main'),
    ],
    'IHINDU': [
        ('IHINDU-MAIN', 'Ihindu Main'),
    ],
    'LONGONOT': [
        ('LONGONOT-UPPER-ERERI', 'Longonot Upper Ereri'),
        ('LONGONOT-TANK', 'Longonot Tank'),
    ],
}


METER_TO_DMA = {
    'WATER WORKS GUEST INN UL1': ('CBD', 'GUEST-INN'),
    'WATER WORKS UL1': ('CBD', 'NEW-LINE'),
    'WATER WORKS SUBERICO 1 UL1': ('CBD', 'SUBERICO-1'),
    '23032800': ('CBD', 'SUBERICO-2'),
    '18W711094': ('CBD', 'POLICE-LINE'),
    '19W719888': ('CBD', 'CBD-FEED-A'),
    'CONSOLATA DMA UL1': ('CBD', 'CONSOLATA'),
    '12W722485': ('CBD', 'CBD-FEED-B'),
    '14W714174': ('LAKEVIEW', 'MIRERA-1'),
    '16W722433': ('SITE', 'UPPER-SITE'),
    'KCC DMA UL1': ('LAKEVIEW', 'KCC'),
    'MARARO UL1': ('LAKEVIEW', 'MARARO'),
    'MARARO UL2': ('LAKEVIEW', 'MARARO'),
    'DRY PORT UL1': ('LAKEVIEW', 'DRYPORT'),
    'DRYPORT UL1': ('LAKEVIEW', 'DRYPORT'),
    '8ZR18418032455': ('LAKEVIEW', 'DRYPORT'),
    'KARIMA UL1': ('LAKEVIEW', 'KARIMA'),
    'KARIMA UL2': ('LAKEVIEW', 'KARIMA'),
    'KARIMA UL3': ('LAKEVIEW', 'KARIMA'),
    'GATHIMA UL1': ('LAKEVIEW', 'GATHIMA'),
    'H220K000021': ('LAKEVIEW', 'GATHIMA'),
    'KIJABE UL1': ('LAKEVIEW', 'KIJABE'),
    'MIRERA KIU UL1': ('LAKEVIEW', 'MIRERA-KIU'),
    'KWA MUHIA UL1': ('LAKEVIEW', 'KWA-MUHIA'),
    'DCK UL3': ('LAKEVIEW', 'DCK'),
}


ZONE_CONFIGURATION = {
    'CBD': {
        'method': 'SUM_OF_DMA_METERS',
        'dma_codes': ['NEW-LINE', 'CONSOLATA', 'LV-CONSOLATA', 'PRISONS-STAFF', 'POLICE-LINE', 'GUEST-INN', 'SUBERICO-1', 'SUBERICO-2', 'CBD-FEED-A', 'CBD-FEED-B'],
        'description': (
            'Central Daily Volumes workbook shows CBD supplied through a mixed central network with New Line, '
            'Consolata-related lines, Prisons Staff, and CBD/CCCR feeder lines. This test configuration treats CBD '
            'as a composite zone built from those component DMAs/feeders.'
        ),
    },
    'CCCR': {
        'method': 'SUM_OF_DMA_METERS',
        'dma_codes': ['CCCR-DMA'],
        'description': 'CCCR is currently represented by its dedicated DMA meter path from the central network.',
    },
    'LAKEVIEW': {
        'method': 'SUM_OF_DMA_METERS',
        'dma_codes': ['DRYPORT', 'KARIMA', 'GATHIMA', 'KIJABE', 'MIRERA-KIU', 'MIRERA-1', 'KWA-MUHIA', 'DCK', 'KCC', 'MARARO'],
        'description': (
            'Lakeview is treated as a broad composite zone in this test setup, built from the Dryport/Karima/'
            'Gathima/Kijabe/Mirera/Kwa Muhia/DCK/KCC/Mararo meter cluster.'
        ),
    },
    'KABATI': {
        'method': 'SUM_OF_DMA_METERS',
        'dma_codes': ['KAG', 'MAKABURINI'],
        'description': 'Site Kabati daily report shows Kabati as the sum of KAG and Makaburini.',
    },
    'SITE': {
        'method': 'SUM_OF_DMA_METERS',
        'dma_codes': ['LOWER-SITE', 'UPPER-SITE'],
        'description': 'Site Kabati daily report shows Site as the sum of Lower Site and Upper Site.',
    },
    'HOPEWELL': {
        'method': 'SUM_OF_DMA_METERS',
        'dma_codes': ['HOPEWELL-MAIN'],
        'description': 'Hopewell is provisioned as a single operational sub-area pending confirmation of the final meter.',
    },
    'KIHOTO': {
        'method': 'ONE_METER',
        'primary_meter': 'KIHOTO KARAGITA UL1',
        'description': 'Kihoto is currently treated as a one-meter zone.',
    },
    'KAMERE': {
        'method': 'ONE_METER',
        'primary_meter': 'KAMERE UL1',
        'description': 'Kamere is currently treated as a one-meter zone.',
    },
    'HELLSGATE': {
        'method': 'SUM_OF_DMA_METERS',
        'dma_codes': ['HELLSGATE-MAIN'],
        'description': 'Hells Gate is provisioned as one operational sub-area pending confirmation of the exact field meter.',
    },
    'MAIMAHIU': {
        'method': 'SUM_OF_DMA_METERS',
        'dma_codes': ['MAIMAHIU-MAIN'],
        'description': 'Mai-Mahiu is provisioned as one operational sub-area pending confirmation of the exact field meter.',
    },
    'LONGONOT': {
        'method': 'SUM_OF_SELECTED_METERS',
        'component_meters': ['U21W1706618M', '8ZR18418032428'],
        'description': 'Longonot is currently configured from the tank inlet and Upper Ereri line together.',
    },
    'KAYOLE': {
        'method': 'SUM_OF_DMA_METERS',
        'dma_codes': ['KAYOLE-DMA'],
        'description': 'Kayole is currently configured from the DMA inlet pair serving the zone.',
    },
    'KINUNGI': {
        'method': 'SUM_OF_DMA_METERS',
        'dma_codes': ['KINUNGI-MAIN'],
        'description': 'Kinungi is provisioned as a single operational sub-area pending final meter confirmation.',
    },
    'GONDI': {
        'method': 'SUM_OF_DMA_METERS',
        'dma_codes': ['GONDI-MAIN'],
        'description': 'Gondi is provisioned as a single operational sub-area pending final meter confirmation.',
    },
    'NYONJORO': {
        'method': 'SUM_OF_DMA_METERS',
        'dma_codes': ['NYONJORO-MAIN'],
        'description': 'Nyonjoro is provisioned as a single operational sub-area pending final meter confirmation.',
    },
    'IHINDU': {
        'method': 'SUM_OF_DMA_METERS',
        'dma_codes': ['IHINDU-MAIN'],
        'description': 'Ihindu is provisioned as a single operational sub-area pending final meter confirmation.',
    },
}


class Command(BaseCommand):
    help = "Populate a broad best-effort distribution test configuration from the available workbook evidence."

    @transaction.atomic
    def handle(self, *args, **options):
        zone_map = {zone.code: zone for zone in Zone.objects.all()}
        dma_map = {}

        for zone_code, dmas in DMA_BLUEPRINTS.items():
            zone = zone_map.get(zone_code)
            if not zone:
                continue
            for dma_code, dma_name in dmas:
                dma, _ = DMA.objects.get_or_create(
                    code=dma_code,
                    defaults={
                        'zone': zone,
                        'name': dma_name,
                        'description': 'Best-effort test DMA created from distribution workbook evidence.',
                        'is_active': True,
                    }
                )
                if dma.zone_id != zone.id or dma.name != dma_name:
                    dma.zone = zone
                    dma.name = dma_name
                    dma.description = 'Best-effort test DMA created from distribution workbook evidence.'
                    dma.is_active = True
                    dma.save(update_fields=['zone', 'name', 'description', 'is_active', 'updated_at'])
                dma_map[(zone_code, dma_code)] = dma

        mapped_count = 0
        for meter_number, (zone_code, dma_code) in METER_TO_DMA.items():
            meter = DistributionMeter.objects.filter(meter_number=meter_number).first()
            zone = zone_map.get(zone_code)
            dma = dma_map.get((zone_code, dma_code))
            if not meter or not zone or not dma:
                continue
            meter.zone = zone
            meter.dma = dma
            meter.notes = f"{meter.notes} | Test mapping inferred from daily-volume workbooks.".strip(" |")
            meter.save(update_fields=['zone', 'dma', 'notes', 'updated_at'])
            mapped_count += 1

        created_configs = 0
        for zone_code, config_data in ZONE_CONFIGURATION.items():
            zone = zone_map.get(zone_code)
            if not zone:
                continue

            config, created = ZoneSupplyConfiguration.objects.get_or_create(zone=zone)
            created_configs += int(created)
            config.aggregation_method = config_data['method']
            config.infrastructure_description = config_data['description']
            config.calculation_notes = (
                'Best-effort test configuration inferred from Distribution Dashboard, Central Daily Volumes, '
                'and Site Kabati daily report workbooks. Review and amend in admin with distribution field staff.'
            )

            primary_meter_number = config_data.get('primary_meter')
            if primary_meter_number:
                config.primary_meter = DistributionMeter.objects.filter(meter_number=primary_meter_number).first()
            else:
                config.primary_meter = None

            config.save()

            config.component_dmas.clear()
            for dma_code in config_data.get('dma_codes', []):
                dma = dma_map.get((zone_code, dma_code))
                if dma:
                    config.component_dmas.add(dma)

            config.component_meters.clear()
            for meter_number in config_data.get('component_meters', []):
                meter = DistributionMeter.objects.filter(meter_number=meter_number, zone=zone).first()
                if meter:
                    config.component_meters.add(meter)

            if config_data['method'] == 'ONE_METER':
                zone.supply_aggregation_method = 'ZONE_METER'
            elif config_data['method'] == 'SUM_OF_DMA_METERS':
                zone.supply_aggregation_method = 'DMA_SUM'
            else:
                zone.supply_aggregation_method = 'UNSET'
            zone.save(update_fields=['supply_aggregation_method', 'updated_at'])

        self.stdout.write(self.style.SUCCESS(
            f"Distribution test configuration populated. Mapped {mapped_count} meters, "
            f"prepared {DMA.objects.count()} DMAs, and updated {len(ZONE_CONFIGURATION)} zone supply configurations."
        ))
