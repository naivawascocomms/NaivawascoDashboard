from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from metering.sync import (
    remove_distribution_meter,
    remove_distribution_meter_reading,
    sync_distribution_meter,
    sync_distribution_meter_reading,
)

from .models import DistributionMeter, DistributionMeterReading
from .utils import refresh_distribution_for_water_meter_dates


def _raw_save(kwargs):
    return bool(kwargs.get('raw'))


def _refresh_for_instance(instance):
    if instance.meter_id and instance.reading_date:
        refresh_distribution_for_water_meter_dates([
            (instance.meter.meter_number, instance.reading_date)
        ])


@receiver(post_save, sender=DistributionMeter)
def sync_shared_meter_after_distribution_meter_save(sender, instance, **kwargs):
    if _raw_save(kwargs):
        return
    sync_distribution_meter(instance)


@receiver(post_delete, sender=DistributionMeter)
def remove_shared_assignment_after_distribution_meter_delete(sender, instance, **kwargs):
    remove_distribution_meter(instance)


@receiver(post_save, sender=DistributionMeterReading)
def refresh_distribution_after_meter_reading_save(sender, instance, **kwargs):
    if _raw_save(kwargs):
        return
    sync_distribution_meter_reading(instance)
    _refresh_for_instance(instance)


@receiver(post_delete, sender=DistributionMeterReading)
def refresh_distribution_after_meter_reading_delete(sender, instance, **kwargs):
    remove_distribution_meter_reading(instance)
    _refresh_for_instance(instance)
