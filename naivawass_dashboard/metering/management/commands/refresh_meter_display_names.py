from django.core.management.base import BaseCommand

from metering.models import EnergyMeter, WaterMeter
from metering.sync import refresh_energy_meter_display_name, refresh_water_meter_display_name


class Command(BaseCommand):
    help = 'Recompute shared meter display names from the latest assignment and note context.'

    def handle(self, *args, **options):
        water_updated = 0
        energy_updated = 0

        for water_meter in WaterMeter.objects.all().order_by('meter_number'):
            previous = water_meter.display_name
            refresh_water_meter_display_name(water_meter)
            water_meter.refresh_from_db(fields=['display_name'])
            if water_meter.display_name != previous:
                water_updated += 1

        for energy_meter in EnergyMeter.objects.all().order_by('meter_number'):
            previous = energy_meter.display_name
            refresh_energy_meter_display_name(energy_meter)
            energy_meter.refresh_from_db(fields=['display_name'])
            if energy_meter.display_name != previous:
                energy_updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Refreshed shared meter display names. Updated {water_updated} water meters and '
                f'{energy_updated} energy meters.'
            )
        )
