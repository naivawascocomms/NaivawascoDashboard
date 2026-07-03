import re

from django.db import migrations, models


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


def normalize_meter_label(label):
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


def clean_candidate_note_label(label):
    label = (label or '').strip()
    if not label:
        return ''

    lowered = label.lower()
    if any(phrase in lowered for phrase in GENERIC_NOTE_LABEL_PHRASES):
        return ''
    return normalize_meter_label(label)


def extract_label_from_notes(notes):
    notes = (notes or '').strip()
    if not notes:
        return ''

    match = WORKBOOK_LABEL_PATTERN.search(notes)
    if match:
        return normalize_meter_label(match.group(1))

    stripped_notes = IMPORTED_NOTE_PREFIX_PATTERN.sub('', notes)
    for line in [part.strip() for part in stripped_notes.replace('\n', ' | ').split('|')]:
        candidate = clean_candidate_note_label(line)
        if candidate:
            return candidate

    return ''


def label_from_distribution_assignments(assignments):
    labels = {
        label
        for label in (extract_label_from_notes(assignment.notes) for assignment in assignments)
        if label
    }
    if len(labels) == 1:
        return labels.pop()

    dma_labels = {
        normalize_meter_label(assignment.dma.name)
        for assignment in assignments
        if assignment.dma_id
    }
    if len(dma_labels) == 1:
        return dma_labels.pop()

    zone_labels = {
        normalize_meter_label(assignment.zone.name)
        for assignment in assignments
        if assignment.zone_id
    }
    if len(zone_labels) == 1:
        return zone_labels.pop()

    if len(assignments) == 1:
        assignment = assignments[0]
        if assignment.dma_id:
            return normalize_meter_label(assignment.dma.name)
        if assignment.zone_id:
            return normalize_meter_label(assignment.zone.name)

    return ''


def suggest_water_display_name(water_meter, production_assignments, distribution_assignments):
    active_distribution = [assignment for assignment in distribution_assignments if assignment.is_active]
    inactive_distribution = [assignment for assignment in distribution_assignments if not assignment.is_active]

    distribution_label = label_from_distribution_assignments(active_distribution)
    if distribution_label:
        return distribution_label

    historical_distribution_label = label_from_distribution_assignments(inactive_distribution)
    if historical_distribution_label:
        return historical_distribution_label

    source_names = {
        normalize_meter_label(assignment.water_source.name)
        for assignment in production_assignments
        if assignment.assignment_role == 'ABSTRACTION' and assignment.water_source_id
    }
    if len(source_names) == 1:
        return source_names.pop()

    supply_labels = {
        label
        for label in (
            extract_label_from_notes(assignment.notes or water_meter.notes)
            for assignment in production_assignments
            if assignment.assignment_role == 'SUPPLY'
        )
        if label
    }
    if len(supply_labels) == 1:
        return supply_labels.pop()

    supply_assignments = [assignment for assignment in production_assignments if assignment.assignment_role == 'SUPPLY']
    if len(supply_assignments) == 1:
        return normalize_meter_label(f'{supply_assignments[0].production_site.name} Supply')

    note_label = extract_label_from_notes(water_meter.notes)
    if note_label:
        return note_label

    return water_meter.meter_number


def suggest_energy_display_name(energy_meter, assignments):
    note_label = extract_label_from_notes(energy_meter.notes)
    if note_label:
        return note_label
    if len(assignments) == 1:
        assignment = assignments[0]
        suffix = 'Solar Meter' if assignment.assignment_role == 'SOLAR' else 'Grid Meter'
        return f'{assignment.production_site.name} {suffix}'
    return energy_meter.meter_number


def forwards(apps, schema_editor):
    WaterMeter = apps.get_model('metering', 'WaterMeter')
    EnergyMeter = apps.get_model('metering', 'EnergyMeter')
    ProductionWaterMeterAssignment = apps.get_model('metering', 'ProductionWaterMeterAssignment')
    ProductionEnergyMeterAssignment = apps.get_model('metering', 'ProductionEnergyMeterAssignment')
    DistributionWaterMeterAssignment = apps.get_model('metering', 'DistributionWaterMeterAssignment')

    for water_meter in WaterMeter.objects.all():
        production_assignments = list(
            ProductionWaterMeterAssignment.objects.filter(
                water_meter_id=water_meter.id,
                is_active=True,
            ).select_related('water_source', 'production_site')
        )
        distribution_assignments = list(
            DistributionWaterMeterAssignment.objects.filter(
                water_meter_id=water_meter.id,
                is_active=True,
            ).select_related('zone', 'dma')
        )
        water_meter.display_name = suggest_water_display_name(
            water_meter,
            production_assignments,
            distribution_assignments,
        )
        water_meter.save(update_fields=['display_name', 'updated_at'])

    for energy_meter in EnergyMeter.objects.all():
        assignments = list(
            ProductionEnergyMeterAssignment.objects.filter(
                energy_meter_id=energy_meter.id,
                is_active=True,
            ).select_related('production_site')
        )
        energy_meter.display_name = suggest_energy_display_name(energy_meter, assignments)
        energy_meter.save(update_fields=['display_name', 'updated_at'])


class Migration(migrations.Migration):

    dependencies = [
        ('metering', '0002_alter_distributionwatermeterassignment_allocation_percentage'),
    ]

    operations = [
        migrations.AddField(
            model_name='energymeter',
            name='display_name',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='watermeter',
            name='display_name',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
