from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from metering.sync import (
    remove_production_meter,
    remove_production_meter_reading,
    sync_production_meter,
    sync_production_meter_reading,
    sync_production_site_metering,
)

from .models import Meter, MeterReading, MonthlyProduction, ProductionSite
from .utils import refresh_company_monthly_summary, refresh_production_for_site_dates


def _raw_save(kwargs):
    return bool(kwargs.get('raw'))


def _refresh_for_instance(instance):
    if instance.meter_id and instance.reading_date:
        refresh_production_for_site_dates([
            (instance.meter.production_site_id, instance.reading_date)
        ])


@receiver(post_save, sender=Meter)
def sync_shared_meter_after_production_meter_save(sender, instance, **kwargs):
    if _raw_save(kwargs):
        return
    sync_production_meter(instance)


@receiver(post_delete, sender=Meter)
def remove_shared_assignment_after_production_meter_delete(sender, instance, **kwargs):
    remove_production_meter(instance)


@receiver(post_save, sender=ProductionSite)
def sync_shared_meter_assignments_after_site_save(sender, instance, **kwargs):
    if _raw_save(kwargs):
        return
    for meter in instance.meters.all():
        sync_production_meter(meter)
    sync_production_site_metering(instance)


@receiver(post_save, sender=MeterReading)
def refresh_production_after_meter_reading_save(sender, instance, **kwargs):
    if _raw_save(kwargs):
        return
    sync_production_meter_reading(instance)
    _refresh_for_instance(instance)


@receiver(post_delete, sender=MeterReading)
def refresh_production_after_meter_reading_delete(sender, instance, **kwargs):
    remove_production_meter_reading(instance)
    _refresh_for_instance(instance)


@receiver(post_save, sender=MonthlyProduction)
def refresh_company_summary_after_monthly_save(sender, instance, **kwargs):
    if _raw_save(kwargs):
        return
    refresh_company_monthly_summary(instance.year, instance.month)


@receiver(post_delete, sender=MonthlyProduction)
def refresh_company_summary_after_monthly_delete(sender, instance, **kwargs):
    refresh_company_monthly_summary(instance.year, instance.month)
