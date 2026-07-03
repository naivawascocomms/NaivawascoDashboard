"""
Seed reference data for production module.

Creates Regions, ProductionSites, WaterSources (one per site), and
supply/output Meters matching the meter names in the Excel data sheets.

Safe to re-run — uses get_or_create throughout.
"""
from datetime import date
from django.core.management.base import BaseCommand
from production.models import Region, ProductionSite, WaterSource, Meter


REGIONS = [
    # (code, name, description)
    ('SOUTH',   'Southern',   'DCK, WWS, Mai Mahiu, Ngondi, NIP'),
    ('EAST',    'Eastern',    'Karati, Kinungi BH, Nyonjoro, Karati PP'),
    ('CENTRAL', 'Central BL', 'AIC, DTI, Police Line'),
]

# (code, name, region_code, site_type, has_solar)
SITES = [
    # Southern
    ('DCK',        'DCK',        'SOUTH',   'BOREHOLE',  False),
    ('WWS',        'WWS',        'SOUTH',   'MIXED',     False),
    ('MAI_MAHIU',  'Mai Mahiu',  'SOUTH',   'MIXED',     True),
    ('NGONDI',     'Ngondi',     'SOUTH',   'BOREHOLE',  True),
    ('NIP',        'NIP',        'SOUTH',   'MIXED',     False),
    # Eastern
    ('KARATI',     'Karati',     'EAST',    'TREATMENT', False),
    ('KINUNGI_BH', 'Kinungi BH', 'EAST',    'BOREHOLE',  False),
    ('NYONJORO',   'Nyonjoro',   'EAST',    'BOREHOLE',  True),
    ('KARATI_PP',  'Karati PP',  'EAST',    'TREATMENT', False),
    # Central BL
    ('AIC',        'AIC',        'CENTRAL', 'BOREHOLE',  False),
    ('DTI',        'DTI',        'CENTRAL', 'MIXED',     True),
    ('POLICE_LINE','Police Line','CENTRAL', 'BOREHOLE',  False),
]

# Supply/output meters from the Excel Supply sheet.
# (meter_number, display_name, site_code)
# meter_number must match what import_production_excel uses as lookup key.
SUPPLY_METERS = [
    ('DTI-HIGH-LIFT',      'DTI High Lift Meter',  'DTI'),
    ('AIC-SUPPLY',         'AIC Supply Meter',     'AIC'),
    ('POLICE-LINE-SUPPLY', 'Police Line Supply',   'POLICE_LINE'),
    ('WWS-SUPPLY',         'WWS Supply Meter',     'WWS'),
    ('KCC-SUPPLY',         'KCC Supply',           'DTI'),
    ('BULK-SUPPLY',        'Bulk Supply',          'DTI'),
    ('KEROCHE-SUPPLY',     'Keroche Supply',       'DTI'),
    ('STAFF-SUPPLY',       'Staff Supply',         'DTI'),
    ('HOPEWELL-SUPPLY',    'Hopewell Supply',      'DTI'),
    ('KARATI-SUPPLY',      'Karati Supply Meter',  'KARATI'),
    ('WWS-6IN-MIRERA',     "WWS 6'' Mirera",       'WWS'),
    ('WWS-4IN-SUB',        "WWS 4'' Sub",          'WWS'),
    ('KWS-SUPPLY',         'KWS Supply',           'WWS'),
    ('OFFICE-SUPPLY',      'Office Supply',        'WWS'),
    ('GUEST-INN-SUPPLY',   'Guest Inn Supply',     'WWS'),
    ('NEW-LINE-SUPPLY',    'New Line Supply',      'WWS'),
    ('WWS-KAYOLE',         'WWS Kayole Supply',    'WWS'),
    ('DCK-SUPPLY',         'DCK Supply Meter',     'DCK'),
]

# Date used as installation_date placeholder for all historical meters
INSTALL_DATE = date(2023, 12, 1)


class Command(BaseCommand):
    help = 'Seed Regions, ProductionSites, WaterSources and Supply Meters from Excel reference data'

    def handle(self, *args, **options):
        self._seed_regions()
        region_map = {r.code: r for r in Region.objects.all()}

        self._seed_sites(region_map)
        site_map = {s.code: s for s in ProductionSite.objects.all()}

        self._seed_water_sources(site_map)
        self._seed_supply_meters(site_map)

        self.stdout.write(self.style.SUCCESS('Reference data seeded successfully.'))

    # ------------------------------------------------------------------

    def _seed_regions(self):
        for code, name, desc in REGIONS:
            obj, created = Region.objects.get_or_create(
                code=code,
                defaults={'name': name, 'description': desc},
            )
            if created:
                self.stdout.write(f'  [+] Region: {name}')
            else:
                self.stdout.write(f'  [=] Region exists: {name}')

    def _seed_sites(self, region_map):
        for code, name, region_code, site_type, has_solar in SITES:
            region = region_map.get(region_code)
            if not region:
                self.stderr.write(f'  [!] Region {region_code} not found, skipping site {name}')
                continue
            obj, created = ProductionSite.objects.get_or_create(
                code=code,
                defaults={
                    'name': name,
                    'region': region,
                    'site_type': site_type,
                    'has_solar': has_solar,
                },
            )
            if created:
                self.stdout.write(f'  [+] Site: {name}')
            else:
                self.stdout.write(f'  [=] Site exists: {name}')

    def _seed_water_sources(self, site_map):
        """One generic water source per site — required FK for WATER-type meters."""
        for code, name, *_ in SITES:
            site = site_map.get(code)
            if not site:
                continue
            obj, created = WaterSource.objects.get_or_create(
                production_site=site,
                code='BH-MAIN',
                defaults={'name': f'{name} Main Source', 'source_type': 'BOREHOLE'},
            )
            if created:
                self.stdout.write(f'  [+] WaterSource: {site.code}/BH-MAIN')

    def _seed_supply_meters(self, site_map):
        for meter_number, display_name, site_code in SUPPLY_METERS:
            site = site_map.get(site_code)
            if not site:
                self.stderr.write(f'  [!] Site {site_code} not found, skipping meter {meter_number}')
                continue
            obj, created = Meter.objects.get_or_create(
                meter_number=meter_number,
                defaults={
                    'production_site': site,
                    'meter_type': 'SUPPLY',
                    'installation_date': INSTALL_DATE,
                    'notes': display_name,
                },
            )
            if created:
                self.stdout.write(f'  [+] Meter: {meter_number} ({site_code})')
            else:
                self.stdout.write(f'  [=] Meter exists: {meter_number}')
