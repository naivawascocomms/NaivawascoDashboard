"""
Import bulk meter data from the Bulk Meters.xlsb survey file.

Clears all existing production WATER meters, distribution meters, zones,
DMAs, and distribution regions (readings are preserved via SET_NULL), then
imports new records.  The three canonical regions (Southern / Eastern /
Central) are shared across production and distribution — distribution
regions are created as thin wrappers linked to the matching production
Region via the production_region FK.

Usage:
    python manage.py import_bulk_meters
    python manage.py import_bulk_meters --excel-file /path/to/Bulk Meters.xlsb
    python manage.py import_bulk_meters --dry-run
"""

import re
import os
from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from production.models import ProductionSite, WaterSource, Meter, Region
from distribution.models import (
    DistributionMeter, DistributionRegion, Zone, DMA,
)


# ---------------------------------------------------------------------------
# The three canonical regions — codes must match production.Region codes
# ---------------------------------------------------------------------------
CANONICAL_REGIONS = [
    # (production Region code, display name, description)
    ('SOUTH',   'Southern', 'DCK, WWS, Naivasha town, Longonot, Mai Mahiu'),
    ('EAST',    'Eastern',  'Karati, NIP, Nyonjoro, Kinungi'),
    ('CENTRAL', 'Central',  'DTI, AIC, Police Line'),
]

# ---------------------------------------------------------------------------
# Production site mapping: normalised location keywords → site code
# ---------------------------------------------------------------------------
LOCATION_TO_SITE = [
    # More specific patterns first
    (['KARATI', 'NIP'],    'NIP'),
    (['POLICE', 'LINE'],   'POLICE_LINE'),
    (['AIC'],              'AIC'),
    (['GATHIMA'],          'GATHIMA'),
    (['NYONJORO'],         'NYONJORO'),
    (['DTI'],              'DTI'),
    (['DCK'],              'DCK'),
    (['KARATI'],           'KARATI'),
    (['WATER WORKS'],      'WWS'),
    (['WWS'],              'WWS'),
    (['HOPEWELL'],         'KARATI'),
]

# ---------------------------------------------------------------------------
# Distribution location → region code mapping (Southern is the default)
# ---------------------------------------------------------------------------
LOCATION_TO_DIST_REGION = [
    # Eastern: Karati-area distribution + Gathima
    (['KCC'],      'EAST'),
    (['GATHIMA'],  'EAST'),
    # Central: DTI system and its served areas
    (['DTI'],          'CENTRAL'),
    (['DRY PORT'],     'CENTRAL'),
    (['DRYPORT'],      'CENTRAL'),
    (['KARIMA'],       'CENTRAL'),
    # Default → Southern (Naivasha town, Longonot, DCK corridor)
]

# Fallback site details for production sites not yet in the DB
EXTRA_SITES = {
    'GATHIMA': dict(name='Gathima', region_code='EAST', site_type='BOREHOLE', has_solar=False),
}

# Strings that mean "serial not readable"
_NOT_READABLE = {
    'NOT CLEAR', 'NOT VISIBLE', 'UNACCESSIBLE', 'NOT ACCESSIBLE',
    'UNKNOWN', 'CURRENTLY NOT VISIBLE', 'NOT VISIBLE ', 'N/A', '',
}

_EXCEL_EPOCH = date(1899, 12, 30)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalise(text):
    """Upper-case, replace non-alphanumeric with space, collapse runs."""
    if not text:
        return ''
    return re.sub(r' +', ' ', re.sub(r'[^A-Z0-9 ]', ' ', str(text).upper())).strip()


def _excel_to_date(serial):
    if not serial or not isinstance(serial, (int, float)):
        return date(2026, 1, 12)
    return _EXCEL_EPOCH + timedelta(days=int(serial))


def _parse_diameter(size_str):
    if not size_str:
        return None
    match = re.search(r'(\d+(?:\.\d+)?)', str(size_str))
    return int(float(match.group(1))) if match else None


def _clean_serial(serial_val):
    """Return a clean serial string, or None if unreadable."""
    if serial_val is None:
        return None
    s = str(serial_val).strip()
    if re.match(r'^\d+\.0$', s):   # pyxlsb returns numerics as float
        s = s[:-2]
    return s if s.upper().strip() not in _NOT_READABLE else None


def _parse_reading(val):
    if val is None:
        return 0
    s = str(val).strip().upper()
    if s in _NOT_READABLE or not re.search(r'\d', s):
        return 0
    match = re.search(r'[\d.]+', s)
    return float(match.group()) if match else 0


def _site_code_for_location(location_norm):
    for keywords, code in LOCATION_TO_SITE:
        if all(kw in location_norm for kw in keywords):
            return code
    return None


def _region_code_for_dist_location(location_norm):
    for keywords, code in LOCATION_TO_DIST_REGION:
        if all(kw in location_norm for kw in keywords):
            return code
    return 'SOUTH'   # default


def _infer_dist_location_type(meter_type_str, location_norm):
    if meter_type_str == 'DMA Meter':
        return 'DMA_INLET'
    if meter_type_str == 'Zonal Meter':
        return 'ZONE_INLET'
    if 'DMA' in location_norm:
        return 'DMA_INLET'
    return 'BULK_SUPPLY'


# ---------------------------------------------------------------------------
# Command
# ---------------------------------------------------------------------------

class Command(BaseCommand):
    help = 'Clear water meters and import from Bulk Meters.xlsb survey file'

    def add_arguments(self, parser):
        parser.add_argument(
            '--excel-file',
            default=None,
            help='Path to Bulk Meters.xlsb (defaults to ../Bulk Meters.xlsb relative to manage.py)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Parse and report without writing to database',
        )

    def handle(self, *args, **options):
        excel_path = options['excel_file']
        if not excel_path:
            base = os.path.dirname(os.path.abspath('manage.py'))
            excel_path = os.path.join(base, '..', 'Bulk Meters.xlsb')
        excel_path = os.path.normpath(excel_path)

        if not os.path.exists(excel_path):
            raise CommandError(f'Excel file not found: {excel_path}')

        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no database changes will be made'))

        rows = self._read_excel(excel_path)
        self.stdout.write(f'Read {len(rows)} meter rows from Excel')

        if not dry_run:
            with transaction.atomic():
                self._clear_distribution_structure()
                self._ensure_dist_regions()
                self._clear_production_water_meters()
                self._import_rows(rows)
        else:
            self._import_rows(rows, dry_run=True)

    # ------------------------------------------------------------------
    # Setup / teardown
    # ------------------------------------------------------------------

    def _clear_distribution_structure(self):
        """Delete all DistributionMeters, DMAs, Zones, DistributionRegions.
        MeterReadings are preserved because their FK is SET_NULL."""
        m, _ = DistributionMeter.objects.all().delete()
        d, _ = DMA.objects.all().delete()
        z, _ = Zone.objects.all().delete()
        r, _ = DistributionRegion.objects.all().delete()
        self.stdout.write(
            f'  Cleared distribution: {r} region(s), {z} zone(s), {d} DMA(s), {m} meter(s)'
        )

    def _ensure_dist_regions(self):
        """Create the three canonical DistributionRegions linked to their
        matching production Region, creating the production Region if absent."""
        for prod_code, name, desc in CANONICAL_REGIONS:
            prod_region, _ = Region.objects.get_or_create(
                code=prod_code,
                defaults={'name': name, 'description': desc},
            )
            dist_region, created = DistributionRegion.objects.get_or_create(
                code=prod_code,
                defaults={
                    'name': name,
                    'description': desc,
                    'production_region': prod_region,
                },
            )
            if created:
                self.stdout.write(f'  [+] DistributionRegion: {name}')
            else:
                # Ensure the FK link is set on pre-existing records
                if dist_region.production_region != prod_region:
                    dist_region.production_region = prod_region
                    dist_region.save(update_fields=['production_region'])

    def _clear_production_water_meters(self):
        n, _ = Meter.objects.filter(meter_type='WATER').delete()
        self.stdout.write(f'  Deleted {n} production WATER meter(s)')

    # ------------------------------------------------------------------
    # Excel reader
    # ------------------------------------------------------------------

    def _read_excel(self, path):
        try:
            import pyxlsb
        except ImportError:
            raise CommandError('pyxlsb is required: pip install pyxlsb')

        rows = []
        with pyxlsb.open_workbook(path) as wb:
            sheet_name = wb.sheets[0]
            with wb.get_sheet(sheet_name) as sheet:
                all_rows = list(sheet.rows())
                for row in all_rows[1:]:   # skip header
                    vals = [c.v for c in row]

                    def get(i, _vals=vals):
                        return _vals[i] if i < len(_vals) else None

                    # Current column layout (trimmed file):
                    # 0=lat  1=lon  2=method  3=admin_region  4=accuracy  5=altitude
                    # 6=meter_type  7=location  8=manufacturer  9=size
                    # 10=serial  11=reading  12=picture
                    rows.append({
                        'meter_type':   str(get(6) or '').strip(),
                        'location':     str(get(7) or '').strip(),
                        'manufacturer': str(get(8) or '').strip(),
                        'size':         get(9),
                        'serial':       get(10),
                        'reading':      get(11),
                    })
        return rows

    # ------------------------------------------------------------------
    # Main import loop
    # ------------------------------------------------------------------

    def _import_rows(self, rows, dry_run=False):
        prod_created = dist_created = skipped = 0
        site_cache = {}
        source_cache = {}
        zone_cache = {}
        dma_cache = {}
        dist_region_cache = {}   # region_code → DistributionRegion
        ul_counters = {}         # normalised location key → next UL counter

        # Survey date used as installation_date placeholder
        install_date = date(2026, 1, 12)

        for row in rows:
            meter_type   = row['meter_type']
            location     = row['location']
            loc_norm     = _normalise(location)
            manufacturer = row['manufacturer'].strip()
            diameter     = _parse_diameter(row['size'])
            reading      = _parse_reading(row['reading'])

            # Meter number: strict serial or location-based UL label
            clean = _clean_serial(row['serial'])
            if clean:
                serial = clean
            else:
                ul_key = loc_norm or 'UNKNOWN'
                ul_counters[ul_key] = ul_counters.get(ul_key, 0) + 1
                serial = f'{ul_key} UL{ul_counters[ul_key]}'

            # ---- Production meter ----------------------------------------
            if meter_type == 'Production Meter':
                site_code = _site_code_for_location(loc_norm)
                if not site_code:
                    self.stderr.write(
                        f'  [!] Cannot map to site: "{location}" ({response_code}) — skipped'
                    )
                    skipped += 1
                    continue

                if not dry_run:
                    site   = self._get_or_create_site(site_code, site_cache)
                    source = self._get_or_create_source(site, source_cache)
                    size_note = f'Size: {row["size"]}' if row['size'] else ''
                    notes = ' | '.join(filter(None, [location, size_note]))
                    Meter.objects.create(
                        meter_type='WATER',
                        meter_number=serial,
                        production_site=site,
                        water_source=source,
                        manufacturer=manufacturer,
                        model='',
                        installation_date=install_date,
                        initial_reading=reading,
                        notes=notes,
                        is_active=True,
                    )


                region_code = {
                    'NIP': 'SOUTH', 'POLICE_LINE': 'CENTRAL', 'AIC': 'CENTRAL',
                    'GATHIMA': 'EAST', 'NYONJORO': 'EAST', 'DTI': 'CENTRAL',
                    'DCK': 'SOUTH', 'KARATI': 'EAST', 'WWS': 'SOUTH',
                }.get(site_code, '?')
                self.stdout.write(
                    f'  [+] Production WATER: {serial} @ {site_code} [{region_code}] ({location})'
                )
                prod_created += 1

            # ---- Distribution meter --------------------------------------
            elif meter_type in ('Distribution Meter', 'DMA Meter', 'Zonal Meter'):
                loc_type    = _infer_dist_location_type(meter_type, loc_norm)
                region_code = _region_code_for_dist_location(loc_norm)

                if not dry_run:
                    dist_region = self._get_dist_region(region_code, dist_region_cache)
                    zone = None
                    dma  = None

                    if loc_type in ('ZONE_INLET', 'DMA_INLET'):
                        zone = self._get_or_create_zone(
                            location, dist_region, zone_cache
                        )
                    if loc_type == 'DMA_INLET':
                        dma = self._get_or_create_dma(location, zone, dma_cache)

                    DistributionMeter.objects.create(
                        meter_location_type=loc_type,
                        meter_number=serial,
                        zone=zone,
                        dma=dma,
                        manufacturer=manufacturer,
                        model='',
                        diameter_mm=diameter,
                        installation_date=install_date,
                        initial_reading=reading,
                        notes=location,
                        is_active=True,
                    )

                self.stdout.write(
                    f'  [+] Distribution ({loc_type}) [{region_code}]: {serial} @ {location}'
                )
                dist_created += 1

            else:
                self.stderr.write(
                    f'  [?] Unknown meter type "{meter_type}" ({response_code}) — skipped'
                )
                skipped += 1

        self.stdout.write(self.style.SUCCESS(
            f'\nDone. Production: {prod_created} | Distribution: {dist_created} | Skipped: {skipped}'
        ))

    # ------------------------------------------------------------------
    # Lookup / create helpers
    # ------------------------------------------------------------------

    def _get_or_create_site(self, site_code, cache):
        if site_code in cache:
            return cache[site_code]
        try:
            site = ProductionSite.objects.get(code=site_code)
        except ProductionSite.DoesNotExist:
            extra = EXTRA_SITES.get(site_code)
            if not extra:
                raise CommandError(
                    f'ProductionSite "{site_code}" not found. Run seed_reference_data first.'
                )
            region = Region.objects.filter(code=extra['region_code']).first()
            if not region:
                region, _ = Region.objects.get_or_create(
                    code=extra['region_code'],
                    defaults={'name': extra['region_code'].title()},
                )
            site, _ = ProductionSite.objects.get_or_create(
                code=site_code,
                defaults={
                    'name': extra['name'],
                    'region': region,
                    'site_type': extra['site_type'],
                    'has_solar': extra['has_solar'],
                },
            )
            self.stdout.write(f'    [+] Created ProductionSite: {site_code}')
        cache[site_code] = site
        return site

    def _get_or_create_source(self, site, cache):
        if site.pk in cache:
            return cache[site.pk]
        source, created = WaterSource.objects.get_or_create(
            production_site=site,
            code='BH-MAIN',
            defaults={'name': f'{site.name} Main Source', 'source_type': 'BOREHOLE'},
        )
        if created:
            self.stdout.write(f'    [+] Created WaterSource: {site.code}/BH-MAIN')
        cache[site.pk] = source
        return source

    def _get_dist_region(self, region_code, cache):
        if region_code in cache:
            return cache[region_code]
        region = DistributionRegion.objects.get(code=region_code)
        cache[region_code] = region
        return region

    def _get_or_create_zone(self, location, dist_region, cache):
        zone_name = location.strip()
        code = re.sub(r'[^A-Z0-9]', '-', _normalise(zone_name))[:50].strip('-') or 'UNKNOWN'
        if code in cache:
            return cache[code]
        zone, created = Zone.objects.get_or_create(
            code=code,
            defaults={'name': zone_name[:200], 'region': dist_region, 'zone_type': 'URBAN'},
        )
        if created:
            self.stdout.write(f'    [+] Zone: {code} [{dist_region.code}]')
        cache[code] = zone
        return zone

    def _get_or_create_dma(self, location, zone, cache):
        dma_name = location.strip()
        code = ('DMA-' + re.sub(r'[^A-Z0-9]', '-', _normalise(dma_name))[:44]).strip('-')
        if code in cache:
            return cache[code]
        dma, created = DMA.objects.get_or_create(
            code=code,
            defaults={'name': dma_name[:200], 'zone': zone},
        )
        if created:
            self.stdout.write(f'    [+] DMA: {code}')
        cache[code] = dma
        return dma
