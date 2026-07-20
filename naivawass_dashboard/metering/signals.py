from django.contrib.auth import get_user_model
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .models import (
    DistributionWaterMeterAssignment,
    EnergyMeter,
    EnergyMeterReading,
    MeterReadingAssignment,
    ProductionEnergyMeterAssignment,
    ProductionWaterMeterAssignment,
    UserProfile,
    WaterMeter,
    WaterMeterReading,
)
from .sync import refresh_energy_meter_display_name, refresh_water_meter_display_name


User = get_user_model()


def _raw_save(kwargs):
    return bool(kwargs.get('raw'))


def _refresh_production(site_dates):
    if not site_dates:
        return

    from production.utils import refresh_production_for_site_dates

    refresh_production_for_site_dates(site_dates)


def _refresh_distribution(zone_dates=None, meter_number_dates=None):
    if zone_dates:
        from distribution.utils import refresh_distribution_for_zone_dates

        refresh_distribution_for_zone_dates(zone_dates)
    elif meter_number_dates:
        from distribution.utils import refresh_distribution_for_water_meter_dates

        refresh_distribution_for_water_meter_dates(meter_number_dates)


def _water_meter_reading_dates(water_meter_id):
    if not water_meter_id:
        return []
    return list(
        WaterMeterReading.objects.filter(water_meter_id=water_meter_id)
        .values_list('reading_date', flat=True)
        .distinct()
    )


def _energy_meter_reading_dates(energy_meter_id):
    if not energy_meter_id:
        return []
    return list(
        EnergyMeterReading.objects.filter(energy_meter_id=energy_meter_id)
        .values_list('reading_date', flat=True)
        .distinct()
    )


def _production_dates_for_water_assignment(assignment, reading_dates=None):
    if assignment is None or not assignment.production_site_id:
        return set()
    reading_dates = reading_dates if reading_dates is not None else _water_meter_reading_dates(assignment.water_meter_id)
    return {
        (assignment.production_site_id, reading_date)
        for reading_date in reading_dates
        if reading_date
    }


def _production_dates_for_energy_assignment(assignment, reading_dates=None):
    if assignment is None or not assignment.production_site_id:
        return set()
    reading_dates = reading_dates if reading_dates is not None else _energy_meter_reading_dates(assignment.energy_meter_id)
    return {
        (assignment.production_site_id, reading_date)
        for reading_date in reading_dates
        if reading_date
    }


def _distribution_dates_for_assignment(assignment, reading_dates=None):
    if assignment is None:
        return set()

    zone_ids = {zone_id for zone_id in [assignment.zone_id, getattr(assignment.dma, 'zone_id', None)] if zone_id}
    if not zone_ids:
        return set()

    reading_dates = reading_dates if reading_dates is not None else _water_meter_reading_dates(assignment.water_meter_id)
    return {
        (zone_id, reading_date)
        for zone_id in zone_ids
        for reading_date in reading_dates
        if reading_date
    }


@receiver(post_save, sender=User)
def ensure_user_profile(sender, instance, created, **kwargs):
    if _raw_save(kwargs):
        return
    if not created:
        return
    if instance.is_staff or instance.is_superuser:
        default_role = 'PRODUCTION_SUPERVISOR'
    else:
        default_role = 'PUMP_OPERATOR'
    UserProfile.objects.get_or_create(user=instance, defaults={'role': default_role})


@receiver(pre_save, sender=ProductionWaterMeterAssignment)
def cache_previous_production_water_assignment(sender, instance, **kwargs):
    if _raw_save(kwargs):
        return
    instance._previous_state = None
    if instance.pk:
        instance._previous_state = sender.objects.select_related('water_meter', 'production_site', 'water_source').filter(pk=instance.pk).first()


@receiver(pre_save, sender=ProductionEnergyMeterAssignment)
def cache_previous_production_energy_assignment(sender, instance, **kwargs):
    if _raw_save(kwargs):
        return
    instance._previous_state = None
    if instance.pk:
        instance._previous_state = sender.objects.select_related('energy_meter', 'production_site').filter(pk=instance.pk).first()


@receiver(pre_save, sender=DistributionWaterMeterAssignment)
def cache_previous_distribution_water_assignment(sender, instance, **kwargs):
    if _raw_save(kwargs):
        return
    instance._previous_state = None
    if instance.pk:
        instance._previous_state = sender.objects.select_related('water_meter', 'zone', 'dma').filter(pk=instance.pk).first()


@receiver(post_save, sender=ProductionWaterMeterAssignment)
@receiver(post_delete, sender=ProductionWaterMeterAssignment)
def refresh_production_water_meter_label(sender, instance, **kwargs):
    if _raw_save(kwargs):
        return
    refresh_water_meter_display_name(instance.water_meter)
    previous = getattr(instance, '_previous_state', None)
    site_dates = set()
    site_dates.update(_production_dates_for_water_assignment(previous))
    site_dates.update(_production_dates_for_water_assignment(instance))
    _refresh_production(site_dates)


@receiver(post_save, sender=DistributionWaterMeterAssignment)
@receiver(post_delete, sender=DistributionWaterMeterAssignment)
def refresh_distribution_water_meter_label(sender, instance, **kwargs):
    if _raw_save(kwargs):
        return
    refresh_water_meter_display_name(instance.water_meter)
    previous = getattr(instance, '_previous_state', None)
    zone_dates = set()
    zone_dates.update(_distribution_dates_for_assignment(previous))
    zone_dates.update(_distribution_dates_for_assignment(instance))
    _refresh_distribution(zone_dates=zone_dates)


@receiver(post_save, sender=MeterReadingAssignment)
@receiver(post_delete, sender=MeterReadingAssignment)
def refresh_related_meter_labels_for_reading_assignment(sender, instance, **kwargs):
    if _raw_save(kwargs):
        return
    if instance.water_meter_id:
        refresh_water_meter_display_name(instance.water_meter)
    if instance.energy_meter_id:
        refresh_energy_meter_display_name(instance.energy_meter)


@receiver(post_save, sender=ProductionEnergyMeterAssignment)
@receiver(post_delete, sender=ProductionEnergyMeterAssignment)
def refresh_production_energy_meter_label(sender, instance, **kwargs):
    if _raw_save(kwargs):
        return
    refresh_energy_meter_display_name(instance.energy_meter)
    previous = getattr(instance, '_previous_state', None)
    site_dates = set()
    site_dates.update(_production_dates_for_energy_assignment(previous))
    site_dates.update(_production_dates_for_energy_assignment(instance))
    _refresh_production(site_dates)


@receiver(post_save, sender=WaterMeterReading)
@receiver(post_delete, sender=WaterMeterReading)
def refresh_derived_records_after_water_meter_reading_change(sender, instance, **kwargs):
    if _raw_save(kwargs):
        return
    if not instance.water_meter_id or not instance.reading_date:
        return

    site_dates = set(
        ProductionWaterMeterAssignment.objects.filter(water_meter_id=instance.water_meter_id)
        .values_list('production_site_id', flat=True)
    )
    _refresh_production({
        (site_id, instance.reading_date)
        for site_id in site_dates
        if site_id
    })
    meter_number = WaterMeter.objects.filter(pk=instance.water_meter_id).values_list('meter_number', flat=True).first()
    if meter_number:
        _refresh_distribution(meter_number_dates=[(meter_number, instance.reading_date)])


@receiver(post_save, sender=EnergyMeterReading)
@receiver(post_delete, sender=EnergyMeterReading)
def refresh_derived_records_after_energy_meter_reading_change(sender, instance, **kwargs):
    if _raw_save(kwargs):
        return
    if not instance.energy_meter_id or not instance.reading_date:
        return

    site_ids = ProductionEnergyMeterAssignment.objects.filter(
        energy_meter_id=instance.energy_meter_id
    ).values_list('production_site_id', flat=True)
    _refresh_production({
        (site_id, instance.reading_date)
        for site_id in site_ids
        if site_id
    })
