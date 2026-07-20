from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from distribution.models import Zone
from metering.models import WaterMeter
from production.models import ProductionSite
from water_balance.models import WaterBalanceModel, WaterBalanceRule


DTI_SITE_CODE = 'DTI'

DTI_RULES = [
    {
        'zone_code': 'KABATI',
        'zone_name': 'Kabati',
        'route_name': 'DTI Kabati meter',
        'meter_number': 'KABATI-KAG-METER',
        'priority': 1,
    },
    {
        'zone_code': 'KABATI',
        'zone_name': 'Kabati',
        'route_name': 'DTI Makaburi meter',
        'meter_number': 'KABATI-MAKABURI-METER',
        'priority': 2,
    },
    {
        'zone_code': 'SITE',
        'zone_name': 'Site and Services',
        'route_name': 'DTI Upper Site meter',
        'meter_number': 'UPPER-SITE-METER',
        'priority': 1,
    },
    {
        'zone_code': 'CONSOLATA',
        'zone_name': 'Consolata',
        'route_name': 'DTI Consolata meter',
        'meter_number': 'CONSOLATA-METER',
        'priority': 1,
    },
]


class Command(BaseCommand):
    help = (
        'Configure DTI-to-zone water-balance rules for Kabati, Site and Services, '
        'and Consolata using confirmed feeder meters.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print the changes that would be made without writing to the database.',
        )
        parser.add_argument(
            '--deactivate-old',
            action='store_true',
            help='Deactivate old fixed DTI rules instead of deleting them.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        deactivate_old = options['deactivate_old']

        dti = self._get_dti_site()
        planned = self._build_plan(dti)

        self.stdout.write('DTI water-balance rule configuration')
        self.stdout.write(f'Production site: {dti.code} - {dti.name}')
        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run only: no database changes will be written.'))

        if dry_run:
            self._print_plan(planned, deactivate_old=deactivate_old)
            return

        with transaction.atomic():
            self._apply_plan(planned, deactivate_old=deactivate_old)

        self.stdout.write(self.style.SUCCESS('DTI balance rules configured successfully.'))
        self._print_current_rules(dti)

    def _get_dti_site(self):
        try:
            return ProductionSite.objects.get(code=DTI_SITE_CODE)
        except ProductionSite.DoesNotExist as exc:
            raise CommandError(f'Production site with code {DTI_SITE_CODE!r} was not found.') from exc

    def _build_plan(self, dti):
        plan = []
        for item in DTI_RULES:
            zone = self._get_zone(item)
            balance_model = self._get_active_model(zone)
            meter = self._get_meter(item)
            plan.append({
                **item,
                'production_site': dti,
                'zone': zone,
                'balance_model': balance_model,
                'water_meter': meter,
            })
        return plan

    def _get_zone(self, item):
        qs = Zone.objects.filter(code=item['zone_code'])
        if not qs.exists():
            qs = Zone.objects.filter(name=item['zone_name'])
        try:
            return qs.get()
        except Zone.DoesNotExist as exc:
            raise CommandError(
                f"Zone {item['zone_code']!r} / {item['zone_name']!r} was not found."
            ) from exc
        except Zone.MultipleObjectsReturned as exc:
            raise CommandError(
                f"Zone lookup for {item['zone_code']!r} / {item['zone_name']!r} returned multiple rows."
            ) from exc

    def _get_active_model(self, zone):
        try:
            return WaterBalanceModel.objects.get(zone=zone, is_active=True)
        except WaterBalanceModel.DoesNotExist as exc:
            raise CommandError(f'No active water-balance model was found for zone {zone.name}.') from exc
        except WaterBalanceModel.MultipleObjectsReturned as exc:
            raise CommandError(f'Multiple active water-balance models were found for zone {zone.name}.') from exc

    def _get_meter(self, item):
        try:
            return WaterMeter.objects.get(meter_number=item['meter_number'])
        except WaterMeter.DoesNotExist as exc:
            raise CommandError(f"Water meter {item['meter_number']!r} was not found.") from exc

    def _old_fixed_rules(self, balance_model, production_site):
        return WaterBalanceRule.objects.filter(
            balance_model=balance_model,
            production_site=production_site,
            route_name='Direct DTI supply',
        ).exclude(method=WaterBalanceRule.Method.METERED_VOLUME)

    def _existing_metered_rules(self, balance_model, production_site):
        return WaterBalanceRule.objects.filter(
            balance_model=balance_model,
            production_site=production_site,
            method=WaterBalanceRule.Method.METERED_VOLUME,
        )

    def _apply_plan(self, planned, deactivate_old):
        touched_models = {
            (item['balance_model'].id, item['production_site'].id): item
            for item in planned
        }

        for item in touched_models.values():
            old_rules = self._old_fixed_rules(item['balance_model'], item['production_site'])
            if deactivate_old:
                old_rules.update(is_active=False)
            else:
                old_rules.delete()

            configured_meter_ids = {
                plan_item['water_meter'].id
                for plan_item in planned
                if plan_item['balance_model'].id == item['balance_model'].id
                and plan_item['production_site'].id == item['production_site'].id
            }
            self._existing_metered_rules(
                item['balance_model'],
                item['production_site'],
            ).exclude(water_meter_id__in=configured_meter_ids).delete()

        for item in planned:
            rule, _created = WaterBalanceRule.objects.update_or_create(
                balance_model=item['balance_model'],
                production_site=item['production_site'],
                method=WaterBalanceRule.Method.METERED_VOLUME,
                water_meter=item['water_meter'],
                defaults={
                    'route_name': item['route_name'],
                    'basis_value': None,
                    'mixing_node': None,
                    'manual_volume_m3': None,
                    'confidence': WaterBalanceRule.Confidence.MEASURED,
                    'priority': item['priority'],
                    'is_active': True,
                    'notes': 'Configured from confirmed DTI feeder meter mapping for zone supply.',
                },
            )
            rule.full_clean()

    def _print_plan(self, planned, deactivate_old):
        grouped = {}
        for item in planned:
            grouped.setdefault(item['balance_model'], []).append(item)

        for balance_model, items in grouped.items():
            zone = balance_model.zone
            old_count = self._old_fixed_rules(balance_model, items[0]['production_site']).count()
            action = 'deactivate' if deactivate_old else 'delete'
            self.stdout.write(f'- {zone.name}: {action} {old_count} old fixed DTI rule(s)')
            for item in items:
                meter = item['water_meter']
                self.stdout.write(
                    f"  create/update METERED_VOLUME: {item['route_name']} -> "
                    f'{meter.display_name or meter.meter_number} ({meter.meter_number})'
                )

    def _print_current_rules(self, dti):
        rules = (
            WaterBalanceRule.objects
            .select_related('balance_model__zone', 'water_meter')
            .filter(
                production_site=dti,
                balance_model__zone__code__in={item['zone_code'] for item in DTI_RULES},
            )
            .order_by('balance_model__zone__name', 'priority', 'route_name')
        )
        for rule in rules:
            meter = rule.water_meter
            meter_label = f'{meter.display_name} ({meter.meter_number})' if meter else 'no meter'
            self.stdout.write(
                f'- {rule.balance_model.zone.name}: {rule.method} | '
                f'{rule.route_name} | {meter_label} | active={rule.is_active}'
            )
