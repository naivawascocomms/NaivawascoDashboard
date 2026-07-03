from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from distribution.models import DailyDistribution, DistributionRegion, Zone, ZoneBillingCycle
from production.models import DailyProduction, ProductionSite, Region

from .models import (
    ProductionZoneAllocationRule,
    WaterBalanceModel,
    WaterBalanceNode,
    WaterBalanceNodeInput,
    WaterBalanceRule,
)
from .services import (
    calculate_configured_source_attributions,
    calculate_configured_source_attributions_for_zone_cycle,
    calculate_source_allocations,
)


class ProductionZoneAllocationTests(TestCase):
    def setUp(self):
        self.production_region = Region.objects.create(name='Production Region', code='PR')
        self.distribution_region = DistributionRegion.objects.create(name='Distribution Region', code='DR')
        self.site_a = ProductionSite.objects.create(
            name='Site A',
            code='SITE-A',
            region=self.production_region,
        )
        self.site_b = ProductionSite.objects.create(
            name='Site B',
            code='SITE-B',
            region=self.production_region,
        )
        self.zone = Zone.objects.create(
            name='Zone One',
            code='ZONE-ONE',
            region=self.distribution_region,
        )
        DailyDistribution.objects.create(
            zone=self.zone,
            distribution_date=date(2026, 5, 1),
            volume_supplied_m3=Decimal('1000.00'),
            is_validated=True,
        )

    def test_allocates_zone_supply_proportionally_by_basis(self):
        ProductionZoneAllocationRule.objects.create(
            production_site=self.site_a,
            zone=self.zone,
            basis_value=Decimal('40'),
            effective_start_date=date(2026, 1, 1),
        )
        ProductionZoneAllocationRule.objects.create(
            production_site=self.site_b,
            zone=self.zone,
            basis_value=Decimal('60'),
            effective_start_date=date(2026, 1, 1),
        )

        result = calculate_source_allocations(date(2026, 5, 1), date(2026, 5, 1), zone_id=self.zone.id)
        allocations = {
            row['production_site_code']: row['allocated_volume_m3']
            for row in result['rows']
        }

        self.assertEqual(result['total_zone_supply_m3'], 1000.0)
        self.assertEqual(result['total_allocated_volume_m3'], 1000.0)
        self.assertEqual(allocations['SITE-A'], 400.0)
        self.assertEqual(allocations['SITE-B'], 600.0)

    def test_rejects_overlapping_active_rule_for_same_site_and_zone(self):
        ProductionZoneAllocationRule.objects.create(
            production_site=self.site_a,
            zone=self.zone,
            basis_value=Decimal('100'),
            effective_start_date=date(2026, 1, 1),
            effective_end_date=date(2026, 5, 31),
        )

        with self.assertRaises(ValidationError):
            ProductionZoneAllocationRule.objects.create(
                production_site=self.site_a,
                zone=self.zone,
                basis_value=Decimal('80'),
                effective_start_date=date(2026, 5, 1),
            )

    def test_operational_exception_overrides_monthly_standard_for_matching_date(self):
        site_c = ProductionSite.objects.create(
            name='Site C',
            code='SITE-C',
            region=self.production_region,
        )
        ProductionZoneAllocationRule.objects.create(
            production_site=self.site_a,
            zone=self.zone,
            basis_value=Decimal('60'),
            effective_start_date=date(2026, 5, 1),
            effective_end_date=date(2026, 5, 31),
        )
        ProductionZoneAllocationRule.objects.create(
            production_site=self.site_b,
            zone=self.zone,
            basis_value=Decimal('40'),
            effective_start_date=date(2026, 5, 1),
            effective_end_date=date(2026, 5, 31),
        )
        ProductionZoneAllocationRule.objects.create(
            production_site=self.site_a,
            zone=self.zone,
            rule_type=ProductionZoneAllocationRule.RuleType.OPERATIONAL_EXCEPTION,
            basis_value=Decimal('50'),
            effective_start_date=date(2026, 5, 1),
            effective_end_date=date(2026, 5, 1),
            reason='Temporary offtake',
        )
        ProductionZoneAllocationRule.objects.create(
            production_site=site_c,
            zone=self.zone,
            rule_type=ProductionZoneAllocationRule.RuleType.OPERATIONAL_EXCEPTION,
            basis_value=Decimal('50'),
            effective_start_date=date(2026, 5, 1),
            effective_end_date=date(2026, 5, 1),
            reason='Temporary offtake',
        )

        result = calculate_source_allocations(date(2026, 5, 1), date(2026, 5, 1), zone_id=self.zone.id)
        allocations = {
            row['production_site_code']: row['allocated_volume_m3']
            for row in result['rows']
        }

        self.assertEqual(set(allocations.keys()), {'SITE-A', 'SITE-C'})
        self.assertEqual(allocations['SITE-A'], 500.0)
        self.assertEqual(allocations['SITE-C'], 500.0)
        self.assertTrue(all(row['rule_type'] == 'OPERATIONAL_EXCEPTION' for row in result['rows']))

    def test_rejects_operational_exception_without_reason(self):
        with self.assertRaises(ValidationError):
            ProductionZoneAllocationRule.objects.create(
                production_site=self.site_a,
                zone=self.zone,
                rule_type=ProductionZoneAllocationRule.RuleType.OPERATIONAL_EXCEPTION,
                basis_value=Decimal('100'),
                effective_start_date=date(2026, 5, 1),
                effective_end_date=date(2026, 5, 1),
            )


class KaratiWaterWorksAllocationTests(TestCase):
    def setUp(self):
        production_region = Region.objects.create(name='Production Region', code='PR-KWW')
        central_region = DistributionRegion.objects.create(name='Central Region', code='CENTRAL')
        eastern_region = DistributionRegion.objects.create(name='Eastern Region', code='EASTERN')

        self.karati = ProductionSite.objects.create(
            name='Karati',
            code='KARATI',
            region=production_region,
        )
        self.water_works = ProductionSite.objects.create(
            name='Water Works',
            code='WATER-WORKS',
            region=production_region,
        )
        self.upper_kws = ProductionSite.objects.create(
            name='Upper KWS',
            code='UPPER-KWS',
            region=production_region,
        )

        self.hopewell = Zone.objects.create(
            name='Hopewell',
            code='HOPEWELL',
            region=central_region,
        )
        self.kabati = Zone.objects.create(
            name='Kabati',
            code='KABATI',
            region=central_region,
        )
        self.kayole = Zone.objects.create(
            name='Kayole',
            code='KAYOLE',
            region=eastern_region,
        )
        self.lakeview = Zone.objects.create(
            name='Lakeview',
            code='LAKEVIEW',
            region=eastern_region,
        )

    def create_daily_supply(self, zone, volume, supply_date=date(2026, 5, 1)):
        return DailyDistribution.objects.create(
            zone=zone,
            distribution_date=supply_date,
            volume_supplied_m3=Decimal(volume),
            is_validated=True,
        )

    def create_standard_rule(self, site, zone, basis=Decimal('100')):
        return ProductionZoneAllocationRule.objects.create(
            production_site=site,
            zone=zone,
            basis_value=basis,
            effective_start_date=date(2026, 1, 1),
        )

    def test_karati_allocations_treat_intermediary_sites_as_paths_not_sources(self):
        self.create_daily_supply(self.hopewell, '100.00')
        self.create_daily_supply(self.kayole, '700.00')
        self.create_daily_supply(self.lakeview, '300.00')

        self.create_standard_rule(self.karati, self.hopewell)
        self.create_standard_rule(self.karati, self.kayole)
        self.create_standard_rule(self.karati, self.lakeview)

        result = calculate_source_allocations(date(2026, 5, 1), date(2026, 5, 1))
        allocations = {
            (row['zone_code'], row['production_site_code']): row['allocated_volume_m3']
            for row in result['rows']
        }

        self.assertEqual(result['total_zone_supply_m3'], 1100.0)
        self.assertEqual(result['total_allocated_volume_m3'], 1100.0)
        self.assertEqual(allocations[('HOPEWELL', 'KARATI')], 100.0)
        self.assertEqual(allocations[('KAYOLE', 'KARATI')], 700.0)
        self.assertEqual(allocations[('LAKEVIEW', 'KARATI')], 300.0)
        self.assertNotIn(('KAYOLE', 'UPPER-KWS'), allocations)
        self.assertNotIn(('LAKEVIEW', 'WATER-WORKS'), allocations)

    def test_kabati_offtake_is_exception_only_and_does_not_change_standard_days(self):
        self.create_daily_supply(self.hopewell, '100.00')
        self.create_daily_supply(self.kayole, '700.00')
        self.create_daily_supply(self.kabati, '50.00')

        self.create_standard_rule(self.karati, self.hopewell)
        self.create_standard_rule(self.karati, self.kayole)
        ProductionZoneAllocationRule.objects.create(
            production_site=self.karati,
            zone=self.kabati,
            rule_type=ProductionZoneAllocationRule.RuleType.OPERATIONAL_EXCEPTION,
            basis_value=Decimal('100'),
            effective_start_date=date(2026, 5, 1),
            effective_end_date=date(2026, 5, 1),
            reason='Emergency offtake',
        )

        emergency_day = calculate_source_allocations(date(2026, 5, 1), date(2026, 5, 1))
        allocations = {
            (row['zone_code'], row['production_site_code']): row['allocated_volume_m3']
            for row in emergency_day['rows']
        }

        self.assertEqual(allocations[('KABATI', 'KARATI')], 50.0)
        self.assertEqual(emergency_day['total_allocated_volume_m3'], 850.0)

        self.create_daily_supply(self.kabati, '50.00', supply_date=date(2026, 5, 2))
        standard_day = calculate_source_allocations(date(2026, 5, 2), date(2026, 5, 2))

        self.assertEqual(standard_day['rows'], [])
        self.assertEqual(standard_day['total_zone_supply_m3'], 50.0)
        self.assertEqual(standard_day['total_allocated_volume_m3'], 0)
        self.assertEqual(standard_day['warnings'][0]['zone_name'], 'Kabati')


class ConfiguredWaterBalanceModelTests(TestCase):
    def setUp(self):
        production_region = Region.objects.create(name='Production Region', code='PR-CFG')
        eastern_region = DistributionRegion.objects.create(name='Eastern Region', code='EAST-CFG')

        self.karati = ProductionSite.objects.create(
            name='Karati',
            code='KARATI-CFG',
            region=production_region,
        )
        self.water_works = ProductionSite.objects.create(
            name='Water Works',
            code='WWS-CFG',
            region=production_region,
        )
        self.lakeview = Zone.objects.create(
            name='Lakeview',
            code='LAKEVIEW-CFG',
            region=eastern_region,
        )
        self.kayole = Zone.objects.create(
            name='Kayole',
            code='KAYOLE-CFG',
            region=eastern_region,
        )
        self.water_works_node = WaterBalanceNode.objects.create(
            name='Water Works Pool',
            code='WWS-POOL',
            node_type=WaterBalanceNode.NodeType.MIXING_NODE,
            production_site=self.water_works,
        )
        WaterBalanceNodeInput.objects.create(
            node=self.water_works_node,
            production_site=self.water_works,
            input_method=WaterBalanceNodeInput.InputMethod.SITE_PRODUCTION,
            confidence=WaterBalanceRule.Confidence.MEASURED,
        )
        WaterBalanceNodeInput.objects.create(
            node=self.water_works_node,
            production_site=self.karati,
            input_method=WaterBalanceNodeInput.InputMethod.RESIDUAL,
            confidence=WaterBalanceRule.Confidence.ESTIMATED,
        )

    def create_mix_model(self, zone):
        model = WaterBalanceModel.objects.create(
            name=f'{zone.name} standard balance',
            zone=zone,
            effective_start_date=date(2026, 1, 1),
        )
        WaterBalanceRule.objects.create(
            balance_model=model,
            production_site=self.water_works,
            route_name='Water Works own boreholes',
            method=WaterBalanceRule.Method.MIXING_NODE_SHARE,
            mixing_node=self.water_works_node,
            confidence=WaterBalanceRule.Confidence.MEASURED_ALLOCATED,
            priority=10,
        )
        WaterBalanceRule.objects.create(
            balance_model=model,
            production_site=self.karati,
            route_name='Karati via Water Works',
            method=WaterBalanceRule.Method.MIXING_NODE_SHARE,
            mixing_node=self.water_works_node,
            confidence=WaterBalanceRule.Confidence.ESTIMATED,
            priority=20,
        )
        return model

    def test_residual_mixing_node_allocates_lakeview_by_total_water_works_output(self):
        DailyProduction.objects.create(
            production_site=self.water_works,
            production_date=date(2026, 5, 1),
            water_abstracted_m3=Decimal('600.00'),
            water_supplied_m3=Decimal('600.00'),
            is_validated=True,
        )
        DailyDistribution.objects.create(
            zone=self.lakeview,
            distribution_date=date(2026, 5, 1),
            volume_supplied_m3=Decimal('300.00'),
            is_validated=True,
        )
        DailyDistribution.objects.create(
            zone=self.kayole,
            distribution_date=date(2026, 5, 1),
            volume_supplied_m3=Decimal('700.00'),
            is_validated=True,
        )
        self.create_mix_model(self.lakeview)
        self.create_mix_model(self.kayole)

        result = calculate_configured_source_attributions(date(2026, 5, 1), date(2026, 5, 1), zone_id=self.lakeview.id)
        allocations = {
            row['production_site_code']: row
            for row in result['rows']
        }

        self.assertEqual(result['total_zone_supply_m3'], 300.0)
        self.assertEqual(result['total_allocated_volume_m3'], 300.0)
        self.assertEqual(allocations['WWS-CFG']['allocated_volume_m3'], 180.0)
        self.assertEqual(allocations['KARATI-CFG']['allocated_volume_m3'], 120.0)
        self.assertEqual(allocations['KARATI-CFG']['confidence'], 'ESTIMATED')
        self.assertEqual(allocations['KARATI-CFG']['node_input_method'], 'RESIDUAL')

    def test_zone_cycle_source_attribution_uses_opening_and_closing_dates(self):
        self.create_mix_model(self.lakeview)
        self.create_mix_model(self.kayole)
        ZoneBillingCycle.objects.create(
            zone=self.lakeview,
            year=2026,
            month=5,
            opening_date=date(2026, 5, 2),
            closing_date=date(2026, 5, 3),
        )
        for day, lakeview_supply, water_works_own, kayole_supply in [
            (1, '999.00', '999.00', '0.00'),
            (2, '300.00', '600.00', '700.00'),
            (3, '200.00', '500.00', '500.00'),
        ]:
            DailyProduction.objects.create(
                production_site=self.water_works,
                production_date=date(2026, 5, day),
                water_abstracted_m3=Decimal(water_works_own),
                water_supplied_m3=Decimal(water_works_own),
                is_validated=True,
            )
            DailyDistribution.objects.create(
                zone=self.lakeview,
                distribution_date=date(2026, 5, day),
                volume_supplied_m3=Decimal(lakeview_supply),
                is_validated=True,
            )
            if Decimal(kayole_supply) > 0:
                DailyDistribution.objects.create(
                    zone=self.kayole,
                    distribution_date=date(2026, 5, day),
                    volume_supplied_m3=Decimal(kayole_supply),
                    is_validated=True,
                )

        result = calculate_configured_source_attributions_for_zone_cycle(
            year=2026,
            month=5,
            zone_id=self.lakeview.id,
        )

        self.assertEqual(result['opening_date'], '2026-05-02')
        self.assertEqual(result['closing_date'], '2026-05-03')
        self.assertEqual(result['total_zone_supply_m3'], 500.0)
        self.assertEqual(result['total_allocated_volume_m3'], 500.0)
        self.assertEqual({row['date'] for row in result['rows']}, {'2026-05-02', '2026-05-03'})
