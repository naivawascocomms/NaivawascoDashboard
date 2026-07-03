from decimal import Decimal
import re

from django.core.exceptions import ValidationError

from .models import (
    DistributionWaterMeterAssignment,
    EnergyMeter,
    EnergyMeterReading,
    ProductionEnergyMeterAssignment,
    ProductionWaterMeterAssignment,
    WaterMeter,
    WaterMeterReading,
)

DERIVED_SUPPLY_NOTE = (
    'Derived from abstraction meter because the production site is configured '
    'to use the same physical meter for production and supply.'
)

WORKBOOK_LABEL_PATTERN = re.compile(r'label "([^"]+)"', re.IGNORECASE)
IMPORTED_NOTE_PREFIX_PATTERN = re.compile(r'^Imported from [^.]+\.\s*', re.IGNORECASE)
NOTE_LABEL_CLEANUP_PATTERNS = (
    re.compile(r'^Phase \d+ mapped to (.+?) from legacy structure\.?$', re.IGNORECASE),
    re.compile(r'^Phase \d+ mapped to (.+?) from exact meter name\.?$', re.IGNORECASE),
)
GENERIC_NOTE_LABEL_PHRASES = (
    'legacy zone/dma mapping cleared',
    'test mapping inferred',
    'canonical water meter',
    'canonical energy meter',
    'derived from abstraction meter',
    'treated as supply',
)


def _merge_notes(existing, new_note):
    existing = (existing or '').strip()
    new_note = (new_note or '').strip()
    if not new_note:
        return existing
    if not existing:
        return new_note
    if new_note in existing:
        return existing
    return f'{existing}\n{new_note}'


def _apply_meter_defaults(obj, defaults):
    update_fields = []
    for field, value in defaults.items():
        current = getattr(obj, field)
        if field == 'notes':
            merged = _merge_notes(current, value)
            if merged != current:
                setattr(obj, field, merged)
                update_fields.append(field)
            continue
        if field == 'is_active':
            if current != value:
                setattr(obj, field, value)
                update_fields.append(field)
            continue
        if current in (None, '', Decimal('0')) and value not in (None, ''):
            setattr(obj, field, value)
            update_fields.append(field)

    if update_fields:
        obj.save(update_fields=update_fields + ['updated_at'])
    return obj


def _normalize_meter_label(label):
    label = (label or '').strip()
    if not label:
        return ''
    label = label.replace('\u2014', '-').replace('\u2013', '-')
    label = re.sub(r'\s*-\s*', ' - ', label)
    label = re.sub(r'\s+', ' ', label).strip(' .|')
    for pattern in NOTE_LABEL_CLEANUP_PATTERNS:
        match = pattern.match(label)
        if match:
            label = match.group(1).strip()
            break
    if re.search(r'(?i)\bmeter$', label):
        label = re.sub(r'(?i)\bmeter$', '', label).strip(' ,.-')
        return f'{label} Meter'
    return f'{label} Meter'


def _clean_candidate_note_label(label):
    label = (label or '').strip()
    if not label:
        return ''

    lowered = label.lower()
    if any(phrase in lowered for phrase in GENERIC_NOTE_LABEL_PHRASES):
        return ''
    return _normalize_meter_label(label)


def _extract_label_from_notes(notes):
    notes = (notes or '').strip()
    if not notes:
        return ''

    match = WORKBOOK_LABEL_PATTERN.search(notes)
    if match:
        return _normalize_meter_label(match.group(1))

    stripped_notes = IMPORTED_NOTE_PREFIX_PATTERN.sub('', notes)
    for line in [part.strip() for part in stripped_notes.replace('\n', ' | ').split('|')]:
        candidate = _clean_candidate_note_label(line)
        if candidate:
            return candidate

    return ''


def _label_from_distribution_assignments(assignments):
    labels = {
        label
        for label in (_extract_label_from_notes(assignment.notes) for assignment in assignments)
        if label
    }
    if len(labels) == 1:
        return labels.pop()

    dma_labels = {
        _normalize_meter_label(assignment.dma.name)
        for assignment in assignments
        if assignment.dma_id
    }
    if len(dma_labels) == 1:
        return dma_labels.pop()

    zone_labels = {
        _normalize_meter_label(assignment.zone.name)
        for assignment in assignments
        if assignment.zone_id
    }
    if len(zone_labels) == 1:
        return zone_labels.pop()

    if len(assignments) == 1:
        assignment = assignments[0]
        if assignment.dma_id:
            return _normalize_meter_label(assignment.dma.name)
        if assignment.zone_id:
            return _normalize_meter_label(assignment.zone.name)

    return ''


def suggest_water_meter_display_name(water_meter):
    distribution_assignments = list(
        water_meter.distribution_assignments.select_related('zone', 'dma')
    )
    active_distribution = [assignment for assignment in distribution_assignments if assignment.is_active]
    inactive_distribution = [assignment for assignment in distribution_assignments if not assignment.is_active]

    distribution_label = _label_from_distribution_assignments(active_distribution)
    if distribution_label:
        return distribution_label

    historical_distribution_label = _label_from_distribution_assignments(inactive_distribution)
    if historical_distribution_label:
        return historical_distribution_label

    active_abstraction = list(
        water_meter.production_assignments.filter(
            is_active=True,
            assignment_role='ABSTRACTION',
            water_source__isnull=False,
        ).select_related('water_source')
    )
    source_names = {
        _normalize_meter_label(f'{assignment.water_source.name}')
        for assignment in active_abstraction
        if assignment.water_source_id
    }
    if len(source_names) == 1:
        return source_names.pop()

    active_supply = list(
        water_meter.production_assignments.filter(
            is_active=True,
            assignment_role='SUPPLY',
        ).select_related('production_site')
    )
    supply_labels = {
        label
        for label in (_extract_label_from_notes(assignment.notes or water_meter.notes) for assignment in active_supply)
        if label
    }
    if len(supply_labels) == 1:
        return supply_labels.pop()

    if len(active_supply) == 1:
        return _normalize_meter_label(f'{active_supply[0].production_site.name} Supply')

    note_label = _extract_label_from_notes(water_meter.notes)
    if note_label:
        return note_label

    return water_meter.display_name or water_meter.meter_number


def suggest_energy_meter_display_name(energy_meter):
    assignments = list(
        energy_meter.production_assignments.filter(is_active=True).select_related('production_site')
    )
    note_label = _extract_label_from_notes(energy_meter.notes)
    if note_label:
        return note_label
    if len(assignments) == 1:
        assignment = assignments[0]
        suffix = 'Solar Meter' if assignment.assignment_role == 'SOLAR' else 'Grid Meter'
        return f'{assignment.production_site.name} {suffix}'
    return energy_meter.display_name or energy_meter.meter_number


def refresh_water_meter_display_name(water_meter):
    display_name = suggest_water_meter_display_name(water_meter)
    if display_name != water_meter.display_name:
        water_meter.display_name = display_name
        water_meter.save(update_fields=['display_name', 'updated_at'])
    return water_meter


def refresh_energy_meter_display_name(energy_meter):
    display_name = suggest_energy_meter_display_name(energy_meter)
    if display_name != energy_meter.display_name:
        energy_meter.display_name = display_name
        energy_meter.save(update_fields=['display_name', 'updated_at'])
    return energy_meter


def sync_production_site_metering(site):
    abstraction_assignments = list(
        ProductionWaterMeterAssignment.objects.filter(
            production_site=site,
            assignment_role='ABSTRACTION',
        ).select_related('water_meter')
    )

    if site.production_equals_supply:
        abstraction_meter_ids = []
        for assignment in abstraction_assignments:
            abstraction_meter_ids.append(assignment.water_meter_id)
            ProductionWaterMeterAssignment.objects.update_or_create(
                water_meter=assignment.water_meter,
                production_site=site,
                water_source=None,
                assignment_role='SUPPLY',
                defaults={
                    'is_active': assignment.is_active,
                    'start_date': assignment.start_date,
                    'end_date': assignment.end_date,
                    'legacy_production_meter_id': None,
                    'notes': _merge_notes(assignment.notes, DERIVED_SUPPLY_NOTE),
                },
            )
            refresh_water_meter_display_name(assignment.water_meter)

        ProductionWaterMeterAssignment.objects.filter(
            production_site=site,
            assignment_role='SUPPLY',
        ).exclude(water_meter_id__in=abstraction_meter_ids).delete()
        return

    ProductionWaterMeterAssignment.objects.filter(
        production_site=site,
        assignment_role='SUPPLY',
        legacy_production_meter_id__isnull=True,
        notes__icontains='Derived from abstraction meter',
    ).delete()

    for assignment in abstraction_assignments:
        refresh_water_meter_display_name(assignment.water_meter)


def ensure_water_meter(
    *,
    meter_number,
    manufacturer='',
    model='',
    diameter_mm=None,
    capacity=None,
    is_active=True,
    installation_date=None,
    last_calibration_date=None,
    next_calibration_date=None,
    initial_reading=Decimal('0'),
    notes='',
):
    defaults = {
        'manufacturer': manufacturer or '',
        'model': model or '',
        'diameter_mm': diameter_mm,
        'capacity': capacity,
        'is_active': is_active,
        'installation_date': installation_date,
        'last_calibration_date': last_calibration_date,
        'next_calibration_date': next_calibration_date,
        'initial_reading': initial_reading or Decimal('0'),
        'notes': notes or '',
    }
    meter, created = WaterMeter.objects.get_or_create(meter_number=meter_number, defaults=defaults)
    if not created:
        meter = _apply_meter_defaults(meter, defaults)
    return meter


def ensure_energy_meter(
    *,
    meter_number,
    energy_kind,
    manufacturer='',
    model='',
    capacity=None,
    is_active=True,
    installation_date=None,
    last_calibration_date=None,
    next_calibration_date=None,
    initial_reading=Decimal('0'),
    notes='',
):
    defaults = {
        'energy_kind': energy_kind,
        'manufacturer': manufacturer or '',
        'model': model or '',
        'capacity': capacity,
        'is_active': is_active,
        'installation_date': installation_date,
        'last_calibration_date': last_calibration_date,
        'next_calibration_date': next_calibration_date,
        'initial_reading': initial_reading or Decimal('0'),
        'notes': notes or '',
    }
    meter, created = EnergyMeter.objects.get_or_create(meter_number=meter_number, defaults=defaults)
    if not created:
        if meter.energy_kind != energy_kind:
            raise ValidationError(f'Energy meter {meter_number} already exists with kind {meter.energy_kind}.')
        meter = _apply_meter_defaults(meter, defaults)
    return meter


def sync_production_meter(legacy_meter):
    note = f'Imported from production meter #{legacy_meter.id}. {legacy_meter.notes or ""}'.strip()

    if legacy_meter.meter_type in {'WATER', 'SUPPLY'}:
        water_meter = ensure_water_meter(
            meter_number=legacy_meter.meter_number,
            manufacturer=legacy_meter.manufacturer,
            model=legacy_meter.model,
            capacity=legacy_meter.capacity,
            is_active=legacy_meter.is_active,
            installation_date=legacy_meter.installation_date,
            last_calibration_date=legacy_meter.last_calibration_date,
            next_calibration_date=legacy_meter.next_calibration_date,
            initial_reading=legacy_meter.initial_reading,
            notes=note,
        )
        if legacy_meter.production_site.production_equals_supply and legacy_meter.meter_type == 'SUPPLY':
            ProductionWaterMeterAssignment.objects.filter(legacy_production_meter_id=legacy_meter.id).delete()
            sync_production_site_metering(legacy_meter.production_site)
            return None

        role = 'ABSTRACTION' if legacy_meter.meter_type == 'WATER' else 'SUPPLY'
        assignment, _ = ProductionWaterMeterAssignment.objects.update_or_create(
            legacy_production_meter_id=legacy_meter.id,
            defaults={
                'water_meter': water_meter,
                'production_site': legacy_meter.production_site,
                'water_source': legacy_meter.water_source if role == 'ABSTRACTION' else None,
                'assignment_role': role,
                'is_active': legacy_meter.is_active,
                'start_date': legacy_meter.installation_date,
                'notes': note,
            },
        )
        ProductionEnergyMeterAssignment.objects.filter(legacy_production_meter_id=legacy_meter.id).delete()
        refresh_water_meter_display_name(water_meter)
        sync_production_site_metering(legacy_meter.production_site)
        return assignment

    energy_kind = 'GRID' if legacy_meter.meter_type == 'POWER_GRID' else 'SOLAR'
    energy_meter = ensure_energy_meter(
        meter_number=legacy_meter.meter_number,
        energy_kind=energy_kind,
        manufacturer=legacy_meter.manufacturer,
        model=legacy_meter.model,
        capacity=legacy_meter.capacity,
        is_active=legacy_meter.is_active,
        installation_date=legacy_meter.installation_date,
        last_calibration_date=legacy_meter.last_calibration_date,
        next_calibration_date=legacy_meter.next_calibration_date,
        initial_reading=legacy_meter.initial_reading,
        notes=note,
    )
    assignment, _ = ProductionEnergyMeterAssignment.objects.update_or_create(
        legacy_production_meter_id=legacy_meter.id,
        defaults={
            'energy_meter': energy_meter,
            'production_site': legacy_meter.production_site,
            'assignment_role': energy_kind,
            'is_active': legacy_meter.is_active,
            'start_date': legacy_meter.installation_date,
            'notes': note,
        },
    )
    ProductionWaterMeterAssignment.objects.filter(legacy_production_meter_id=legacy_meter.id).delete()
    refresh_energy_meter_display_name(energy_meter)
    return assignment


def remove_production_meter(legacy_meter):
    water_assignments = list(ProductionWaterMeterAssignment.objects.filter(legacy_production_meter_id=legacy_meter.id))
    energy_assignments = list(ProductionEnergyMeterAssignment.objects.filter(legacy_production_meter_id=legacy_meter.id))
    ProductionWaterMeterAssignment.objects.filter(legacy_production_meter_id=legacy_meter.id).delete()
    ProductionEnergyMeterAssignment.objects.filter(legacy_production_meter_id=legacy_meter.id).delete()
    for assignment in water_assignments:
        refresh_water_meter_display_name(assignment.water_meter)
    for assignment in energy_assignments:
        refresh_energy_meter_display_name(assignment.energy_meter)
    sync_production_site_metering(legacy_meter.production_site)


def sync_distribution_meter(legacy_meter):
    note = f'Imported from distribution meter #{legacy_meter.id}. {legacy_meter.notes or ""}'.strip()
    water_meter = ensure_water_meter(
        meter_number=legacy_meter.meter_number,
        manufacturer=legacy_meter.manufacturer,
        model=legacy_meter.model,
        diameter_mm=legacy_meter.diameter_mm,
        is_active=legacy_meter.is_active,
        installation_date=legacy_meter.installation_date,
        last_calibration_date=legacy_meter.last_calibration_date,
        next_calibration_date=legacy_meter.next_calibration_date,
        initial_reading=legacy_meter.initial_reading,
        notes=note,
    )
    assignment, _ = DistributionWaterMeterAssignment.objects.update_or_create(
        legacy_distribution_meter_id=legacy_meter.id,
        defaults={
            'water_meter': water_meter,
            'zone': legacy_meter.zone or (legacy_meter.dma.zone if legacy_meter.dma_id else None),
            'dma': legacy_meter.dma,
            'assignment_role': legacy_meter.meter_location_type,
            'allocation_percentage': Decimal('100'),
            'is_active': legacy_meter.is_active,
            'start_date': legacy_meter.installation_date,
            'notes': note,
        },
    )
    refresh_water_meter_display_name(water_meter)
    return assignment


def remove_distribution_meter(legacy_meter):
    assignments = list(DistributionWaterMeterAssignment.objects.filter(legacy_distribution_meter_id=legacy_meter.id))
    DistributionWaterMeterAssignment.objects.filter(legacy_distribution_meter_id=legacy_meter.id).delete()
    for assignment in assignments:
        refresh_water_meter_display_name(assignment.water_meter)


def _merge_reading_fields(shared, *, current_reading, previous_reading, consumption, reading_time, read_by,
                          reading_method, is_validated, is_anomaly, validated_by, validated_at, notes):
    if shared.current_reading != current_reading:
        raise ValidationError('A shared reading already exists for this meter and date with a different current reading.')
    if shared.previous_reading != previous_reading:
        raise ValidationError('A shared reading already exists for this meter and date with a different previous reading.')
    if shared.consumption != consumption:
        raise ValidationError('A shared reading already exists for this meter and date with a different consumption.')

    update_fields = []
    merged_notes = _merge_notes(shared.notes, notes)
    if merged_notes != shared.notes:
        shared.notes = merged_notes
        update_fields.append('notes')
    if shared.reading_time != reading_time:
        shared.reading_time = reading_time
        update_fields.append('reading_time')
    if read_by and shared.read_by != read_by:
        shared.read_by = read_by
        update_fields.append('read_by')
    if shared.reading_method != reading_method:
        shared.reading_method = reading_method
        update_fields.append('reading_method')
    if shared.is_validated != (shared.is_validated or is_validated):
        shared.is_validated = shared.is_validated or is_validated
        update_fields.append('is_validated')
    if shared.is_anomaly != (shared.is_anomaly or is_anomaly):
        shared.is_anomaly = shared.is_anomaly or is_anomaly
        update_fields.append('is_anomaly')
    if validated_by and shared.validated_by != validated_by:
        shared.validated_by = validated_by
        update_fields.append('validated_by')
    if validated_at and shared.validated_at != validated_at:
        shared.validated_at = validated_at
        update_fields.append('validated_at')
    if update_fields:
        shared.save(update_fields=update_fields + ['updated_at'])
    return shared


def sync_production_meter_reading(legacy_reading):
    legacy_meter = legacy_reading.meter
    if legacy_meter is None:
        return None

    sync_production_meter(legacy_meter)

    if legacy_meter.meter_type in {'WATER', 'SUPPLY'}:
        assignment = ProductionWaterMeterAssignment.objects.get(legacy_production_meter_id=legacy_meter.id)
        shared, created = WaterMeterReading.objects.get_or_create(
            water_meter=assignment.water_meter,
            reading_date=legacy_reading.reading_date,
            defaults={
                'reading_time': legacy_reading.reading_time,
                'current_reading': legacy_reading.current_reading,
                'previous_reading': legacy_reading.previous_reading,
                'consumption': legacy_reading.consumption,
                'read_by': legacy_reading.read_by,
                'reading_method': legacy_reading.reading_method if legacy_reading.reading_method != 'AUTOMATED' else 'AUTOMATED',
                'is_validated': legacy_reading.is_validated,
                'is_anomaly': legacy_reading.is_anomaly,
                'validated_by': legacy_reading.validated_by,
                'validated_at': legacy_reading.validated_at,
                'legacy_production_meter_reading_id': legacy_reading.id,
                'notes': legacy_reading.notes,
            },
        )
        if not created:
            shared = _merge_reading_fields(
                shared,
                current_reading=legacy_reading.current_reading,
                previous_reading=legacy_reading.previous_reading,
                consumption=legacy_reading.consumption,
                reading_time=legacy_reading.reading_time,
                read_by=legacy_reading.read_by,
                reading_method=legacy_reading.reading_method,
                is_validated=legacy_reading.is_validated,
                is_anomaly=legacy_reading.is_anomaly,
                validated_by=legacy_reading.validated_by,
                validated_at=legacy_reading.validated_at,
                notes=legacy_reading.notes,
            )
            if shared.legacy_production_meter_reading_id in (None, legacy_reading.id):
                shared.legacy_production_meter_reading_id = legacy_reading.id
                shared.save(update_fields=['legacy_production_meter_reading_id', 'updated_at'])
        return shared

    assignment = ProductionEnergyMeterAssignment.objects.get(legacy_production_meter_id=legacy_meter.id)
    shared, created = EnergyMeterReading.objects.get_or_create(
        energy_meter=assignment.energy_meter,
        reading_date=legacy_reading.reading_date,
        defaults={
            'reading_time': legacy_reading.reading_time,
            'current_reading': legacy_reading.current_reading,
            'previous_reading': legacy_reading.previous_reading,
            'consumption': legacy_reading.consumption,
            'read_by': legacy_reading.read_by,
            'reading_method': legacy_reading.reading_method,
            'is_validated': legacy_reading.is_validated,
            'is_anomaly': legacy_reading.is_anomaly,
            'validated_by': legacy_reading.validated_by,
            'validated_at': legacy_reading.validated_at,
            'legacy_production_meter_reading_id': legacy_reading.id,
            'notes': legacy_reading.notes,
        },
    )
    if not created:
        shared = _merge_reading_fields(
            shared,
            current_reading=legacy_reading.current_reading,
            previous_reading=legacy_reading.previous_reading,
            consumption=legacy_reading.consumption,
            reading_time=legacy_reading.reading_time,
            read_by=legacy_reading.read_by,
            reading_method=legacy_reading.reading_method,
            is_validated=legacy_reading.is_validated,
            is_anomaly=legacy_reading.is_anomaly,
            validated_by=legacy_reading.validated_by,
            validated_at=legacy_reading.validated_at,
            notes=legacy_reading.notes,
        )
        if shared.legacy_production_meter_reading_id in (None, legacy_reading.id):
            shared.legacy_production_meter_reading_id = legacy_reading.id
            shared.save(update_fields=['legacy_production_meter_reading_id', 'updated_at'])
    return shared


def sync_distribution_meter_reading(legacy_reading):
    legacy_meter = legacy_reading.meter
    if legacy_meter is None:
        return None

    sync_distribution_meter(legacy_meter)
    assignment = DistributionWaterMeterAssignment.objects.get(legacy_distribution_meter_id=legacy_meter.id)
    shared, created = WaterMeterReading.objects.get_or_create(
        water_meter=assignment.water_meter,
        reading_date=legacy_reading.reading_date,
        defaults={
            'reading_time': legacy_reading.reading_time,
            'current_reading': legacy_reading.current_reading,
            'previous_reading': legacy_reading.previous_reading,
            'consumption': legacy_reading.volume_supplied,
            'read_by': legacy_reading.read_by,
            'reading_method': legacy_reading.reading_method,
            'is_validated': legacy_reading.is_validated,
            'is_anomaly': legacy_reading.is_anomaly,
            'validated_by': legacy_reading.validated_by,
            'validated_at': legacy_reading.validated_at,
            'legacy_distribution_meter_reading_id': legacy_reading.id,
            'notes': legacy_reading.notes,
        },
    )
    if not created:
        shared = _merge_reading_fields(
            shared,
            current_reading=legacy_reading.current_reading,
            previous_reading=legacy_reading.previous_reading,
            consumption=legacy_reading.volume_supplied,
            reading_time=legacy_reading.reading_time,
            read_by=legacy_reading.read_by,
            reading_method=legacy_reading.reading_method,
            is_validated=legacy_reading.is_validated,
            is_anomaly=legacy_reading.is_anomaly,
            validated_by=legacy_reading.validated_by,
            validated_at=legacy_reading.validated_at,
            notes=legacy_reading.notes,
        )
        if shared.legacy_distribution_meter_reading_id in (None, legacy_reading.id):
            shared.legacy_distribution_meter_reading_id = legacy_reading.id
            shared.save(update_fields=['legacy_distribution_meter_reading_id', 'updated_at'])
    return shared


def remove_production_meter_reading(legacy_reading):
    if legacy_reading.meter_id is None:
        return

    if legacy_reading.meter.meter_type in {'WATER', 'SUPPLY'}:
        shared = WaterMeterReading.objects.filter(
            legacy_production_meter_reading_id=legacy_reading.id
        ).first()
        if not shared:
            return
        if shared.legacy_distribution_meter_reading_id is None:
            shared.delete()
        else:
            shared.legacy_production_meter_reading_id = None
            shared.save(update_fields=['legacy_production_meter_reading_id', 'updated_at'])
        return

    shared = EnergyMeterReading.objects.filter(
        legacy_production_meter_reading_id=legacy_reading.id
    ).first()
    if shared:
        shared.delete()


def remove_distribution_meter_reading(legacy_reading):
    shared = WaterMeterReading.objects.filter(
        legacy_distribution_meter_reading_id=legacy_reading.id
    ).first()
    if not shared:
        return
    if shared.legacy_production_meter_reading_id is None:
        shared.delete()
    else:
        shared.legacy_distribution_meter_reading_id = None
        shared.save(update_fields=['legacy_distribution_meter_reading_id', 'updated_at'])
