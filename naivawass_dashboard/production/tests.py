from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from metering.models import (
    EnergyMeter,
    EnergyMeterReading,
    ProductionEnergyMeterAssignment,
    ProductionWaterMeterAssignment,
    WaterMeter,
    WaterMeterReading,
)

from .models import (
    CompanyMonthlySummary,
    DailyProduction,
    Meter,
    MeterReading,
    MonthlyProduction,
    ProductionCostConfig,
    ProductionSite,
    ProductionTarget,
    Region,
    WaterQualityTest,
    WaterSource,
)
from .utils import aggregate_daily_production, aggregate_monthly_production, refresh_production_for_site_dates


class WaterWorksBalanceTests(TestCase):
    def setUp(self):
        self.region = Region.objects.create(name='Eastern', code='EAST')
        self.wws = ProductionSite.objects.create(
            name='Water Works',
            code='WWS',
            region=self.region,
            site_type='MIXED',
            has_solar=True,
        )
        self.dck = ProductionSite.objects.create(
            name='DCK',
            code='DCK',
            region=self.region,
            site_type='BOREHOLE',
        )

    def test_water_works_receipt_is_derived_from_supply_minus_abstraction(self):
        record = DailyProduction.objects.create(
            production_site=self.wws,
            production_date=date(2026, 4, 1),
            water_abstracted_m3=Decimal('100'),
            water_supplied_m3=Decimal('160'),
            production_loss_m3=Decimal('0'),
            power_grid_kwh=Decimal('40'),
        )

        record.refresh_from_db()
        self.assertEqual(record.water_received_m3, Decimal('60'))
        self.assertEqual(record.water_available_for_sale_m3, Decimal('160'))
        self.assertEqual(record.power_efficiency_kwh_per_m3, Decimal('0.2500'))

    def test_non_water_works_site_does_not_derive_received_water(self):
        record = DailyProduction.objects.create(
            production_site=self.dck,
            production_date=date(2026, 4, 1),
            water_abstracted_m3=Decimal('100'),
            water_supplied_m3=Decimal('95'),
            production_loss_m3=Decimal('5'),
            power_grid_kwh=Decimal('40'),
        )

        record.refresh_from_db()
        self.assertEqual(record.water_received_m3, Decimal('0'))
        self.assertEqual(record.water_available_for_sale_m3, Decimal('95'))
        self.assertEqual(record.production_loss_percentage, Decimal('5.00'))

    def test_monthly_water_works_save_uses_same_balance_rule(self):
        record = MonthlyProduction.objects.create(
            production_site=self.wws,
            year=2026,
            month=4,
            water_abstracted_m3=Decimal('3000'),
            water_supplied_m3=Decimal('3900'),
            production_loss_m3=Decimal('0'),
            power_grid_kwh=Decimal('900'),
        )

        record.refresh_from_db()
        self.assertEqual(record.water_received_m3, Decimal('900'))
        self.assertEqual(record.water_available_for_sale_m3, Decimal('3900'))
        self.assertEqual(record.power_efficiency_kwh_per_m3, Decimal('0.2308'))

    def test_flagged_site_forces_supply_to_match_production_on_manual_records(self):
        self.dck.production_equals_supply = True
        self.dck.save(update_fields=['production_equals_supply'])

        daily = DailyProduction.objects.create(
            production_site=self.dck,
            production_date=date(2026, 4, 2),
            water_abstracted_m3=Decimal('88'),
            water_supplied_m3=Decimal('70'),
            production_loss_m3=Decimal('18'),
            power_grid_kwh=Decimal('20'),
        )
        monthly = MonthlyProduction.objects.create(
            production_site=self.dck,
            year=2026,
            month=4,
            water_abstracted_m3=Decimal('880'),
            water_supplied_m3=Decimal('700'),
            production_loss_m3=Decimal('180'),
            power_grid_kwh=Decimal('200'),
        )

        daily.refresh_from_db()
        monthly.refresh_from_db()

        self.assertEqual(daily.water_supplied_m3, Decimal('88'))
        self.assertEqual(daily.production_loss_m3, Decimal('0'))
        self.assertEqual(monthly.water_supplied_m3, Decimal('880'))
        self.assertEqual(monthly.production_loss_m3, Decimal('0'))


class AggregateDailyProductionTests(TestCase):
    def setUp(self):
        self.region = Region.objects.create(name='Eastern', code='EAST')
        self.site = ProductionSite.objects.create(
            name='Water Works',
            code='WWS',
            region=self.region,
            site_type='MIXED',
            has_solar=True,
        )
        self.source_1 = WaterSource.objects.create(
            production_site=self.site,
            name='Borehole 1',
            code='BH1',
            source_type='BOREHOLE',
        )
        self.source_2 = WaterSource.objects.create(
            production_site=self.site,
            name='Borehole 2',
            code='BH2',
            source_type='BOREHOLE',
        )
        self.water_meter_1 = Meter.objects.create(
            production_site=self.site,
            water_source=self.source_1,
            meter_type='WATER',
            meter_number='WWS-BH1',
            installation_date=date(2026, 1, 1),
        )
        self.water_meter_2 = Meter.objects.create(
            production_site=self.site,
            water_source=self.source_2,
            meter_type='WATER',
            meter_number='WWS-BH2',
            installation_date=date(2026, 1, 1),
        )
        self.grid_meter = Meter.objects.create(
            production_site=self.site,
            meter_type='POWER_GRID',
            meter_number='WWS-GRID',
            installation_date=date(2026, 1, 1),
        )
        self.solar_meter = Meter.objects.create(
            production_site=self.site,
            meter_type='POWER_SOLAR',
            meter_number='WWS-SOLAR',
            installation_date=date(2026, 1, 1),
        )
        self.supply_meter_1 = Meter.objects.create(
            production_site=self.site,
            meter_type='SUPPLY',
            meter_number='WWS-S1',
            installation_date=date(2026, 1, 1),
        )
        self.supply_meter_2 = Meter.objects.create(
            production_site=self.site,
            meter_type='SUPPLY',
            meter_number='WWS-S2',
            installation_date=date(2026, 1, 1),
        )

    def test_aggregate_daily_production_populates_supply_and_received(self):
        reading_date = date(2026, 4, 2)
        readings = [
            (self.water_meter_1, Decimal('50')),
            (self.water_meter_2, Decimal('70')),
            (self.grid_meter, Decimal('30')),
            (self.solar_meter, Decimal('10')),
            (self.supply_meter_1, Decimal('80')),
            (self.supply_meter_2, Decimal('70')),
        ]

        for meter, consumption in readings:
            MeterReading.objects.create(
                meter=meter,
                reading_date=reading_date,
                current_reading=consumption,
                previous_reading=Decimal('0'),
                consumption=consumption,
                is_validated=True,
            )

        daily = aggregate_daily_production(self.site, reading_date)
        daily.refresh_from_db()

        self.assertIsNotNone(daily)
        self.assertEqual(daily.water_abstracted_m3, Decimal('120'))
        self.assertEqual(daily.water_supplied_m3, Decimal('150'))
        self.assertEqual(daily.water_received_m3, Decimal('30'))
        self.assertEqual(daily.total_power_kwh, Decimal('40'))
        self.assertTrue(daily.is_complete)

    def test_aggregate_daily_production_uses_water_meters_as_supply_when_flagged(self):
        direct_site = ProductionSite.objects.create(
            name='Direct Supply Borehole',
            code='DSB',
            region=self.region,
            site_type='BOREHOLE',
            production_equals_supply=True,
        )
        direct_source = WaterSource.objects.create(
            production_site=direct_site,
            name='DSB Borehole 1',
            code='BH1',
            source_type='BOREHOLE',
        )
        direct_water_meter = Meter.objects.create(
            production_site=direct_site,
            water_source=direct_source,
            meter_type='WATER',
            meter_number='DSB-BH1',
            installation_date=date(2026, 1, 1),
        )
        direct_grid_meter = Meter.objects.create(
            production_site=direct_site,
            meter_type='POWER_GRID',
            meter_number='DSB-GRID',
            installation_date=date(2026, 1, 1),
        )

        reading_date = date(2026, 4, 3)
        MeterReading.objects.create(
            meter=direct_water_meter,
            reading_date=reading_date,
            current_reading=Decimal('95'),
            previous_reading=Decimal('0'),
            consumption=Decimal('95'),
            is_validated=True,
        )
        MeterReading.objects.create(
            meter=direct_grid_meter,
            reading_date=reading_date,
            current_reading=Decimal('33'),
            previous_reading=Decimal('0'),
            consumption=Decimal('33'),
            is_validated=True,
        )

        daily = aggregate_daily_production(direct_site, reading_date)
        daily.refresh_from_db()
        monthly = aggregate_monthly_production(direct_site, 2026, 4)
        monthly.refresh_from_db()

        self.assertEqual(daily.water_abstracted_m3, Decimal('95'))
        self.assertEqual(daily.water_supplied_m3, Decimal('95'))
        self.assertEqual(daily.production_loss_m3, Decimal('0'))
        self.assertTrue(daily.is_complete)
        self.assertEqual(monthly.water_abstracted_m3, Decimal('95'))
        self.assertEqual(monthly.water_supplied_m3, Decimal('95'))
        self.assertEqual(monthly.production_loss_m3, Decimal('0'))


class SharedSupplyAssignmentTests(TestCase):
    def setUp(self):
        self.region = Region.objects.create(name='Eastern', code='EAST')
        self.site = ProductionSite.objects.create(
            name='Karati Police Post',
            code='KARATIPP',
            region=self.region,
            site_type='BOREHOLE',
            production_equals_supply=False,
        )
        self.source = WaterSource.objects.create(
            production_site=self.site,
            name='Karati Police Post Borehole 1',
            code='BH1',
            source_type='BOREHOLE',
        )
        self.water_meter = Meter.objects.create(
            production_site=self.site,
            water_source=self.source,
            meter_type='WATER',
            meter_number='KARATIPP-BH1-WATER',
            installation_date=date(2026, 1, 1),
        )
        self.supply_meter = Meter.objects.create(
            production_site=self.site,
            meter_type='SUPPLY',
            meter_number='KARATIPP-BH1-SUPPLY',
            installation_date=date(2026, 1, 1),
        )

    def test_site_flag_collapses_shared_assignments_to_one_physical_meter(self):
        assignments = ProductionWaterMeterAssignment.objects.filter(production_site=self.site).order_by('assignment_role')
        self.assertEqual(
            list(assignments.values_list('assignment_role', 'water_meter__meter_number')),
            [('ABSTRACTION', 'KARATIPP-BH1-WATER'), ('SUPPLY', 'KARATIPP-BH1-SUPPLY')],
        )

        self.site.production_equals_supply = True
        self.site.save(update_fields=['production_equals_supply'])

        assignments = ProductionWaterMeterAssignment.objects.filter(production_site=self.site).order_by('assignment_role')
        self.assertEqual(
            list(assignments.values_list('assignment_role', 'water_meter__meter_number')),
            [('ABSTRACTION', 'KARATIPP-BH1-WATER'), ('SUPPLY', 'KARATIPP-BH1-WATER')],
        )
        self.assertFalse(
            ProductionWaterMeterAssignment.objects.filter(
                production_site=self.site,
                water_meter__meter_number='KARATIPP-BH1-SUPPLY',
            ).exists()
        )


class MeterReadingAutomationTests(TestCase):
    def setUp(self):
        self.region = Region.objects.create(name='Southern', code='SOUTH')
        ProductionCostConfig.objects.create(
            name='Default test config',
            grid_power_cost_per_kwh=Decimal('10'),
            solar_power_cost_per_kwh=Decimal('2'),
            is_active=True,
        )
        self.site = ProductionSite.objects.create(
            name='DCK',
            code='DCK',
            region=self.region,
            site_type='BOREHOLE',
        )
        self.source = WaterSource.objects.create(
            production_site=self.site,
            name='DCK Borehole 1',
            code='BH1',
            source_type='BOREHOLE',
        )
        self.water_meter = Meter.objects.create(
            production_site=self.site,
            water_source=self.source,
            meter_type='WATER',
            meter_number='DCK-BH1-WATER',
            installation_date=date(2026, 1, 1),
        )
        self.grid_meter = Meter.objects.create(
            production_site=self.site,
            meter_type='POWER_GRID',
            meter_number='DCK-BH1-GRID',
            installation_date=date(2026, 1, 1),
        )
        self.supply_meter = Meter.objects.create(
            production_site=self.site,
            meter_type='SUPPLY',
            meter_number='DCK-BH1-SUPPLY',
            installation_date=date(2026, 1, 1),
        )

    def test_validated_meter_readings_automatically_create_daily_and_monthly_production(self):
        reading_date = date(2026, 4, 15)
        MeterReading.objects.create(
            meter=self.water_meter,
            reading_date=reading_date,
            current_reading=Decimal('110'),
            previous_reading=Decimal('0'),
            consumption=Decimal('110'),
            is_validated=True,
        )
        MeterReading.objects.create(
            meter=self.grid_meter,
            reading_date=reading_date,
            current_reading=Decimal('55'),
            previous_reading=Decimal('0'),
            consumption=Decimal('55'),
            is_validated=True,
        )
        MeterReading.objects.create(
            meter=self.supply_meter,
            reading_date=reading_date,
            current_reading=Decimal('100'),
            previous_reading=Decimal('0'),
            consumption=Decimal('100'),
            is_validated=True,
        )

        daily = DailyProduction.objects.get(
            production_site=self.site,
            production_date=reading_date,
        )
        self.assertEqual(daily.water_abstracted_m3, Decimal('110'))
        self.assertEqual(daily.water_supplied_m3, Decimal('100'))
        self.assertEqual(daily.total_power_kwh, Decimal('55'))
        self.assertTrue(daily.is_validated)

        monthly = MonthlyProduction.objects.get(
            production_site=self.site,
            year=2026,
            month=4,
        )
        self.assertEqual(monthly.water_abstracted_m3, Decimal('110'))
        self.assertEqual(monthly.water_supplied_m3, Decimal('100'))
        self.assertEqual(monthly.power_costs, Decimal('550.00'))

        company = CompanyMonthlySummary.objects.get(year=2026, month=4)
        self.assertEqual(company.power_costs, Decimal('550.00'))
        self.assertEqual(company.southern_available_for_sale_m3, Decimal('100.00'))
        self.assertEqual(company.southern_closing_date, date(2026, 4, 30))


class SharedMeterAutomationTests(TestCase):
    def setUp(self):
        self.region = Region.objects.create(name='Central', code='CENTRAL')
        ProductionCostConfig.objects.create(
            name='Shared metering config',
            grid_power_cost_per_kwh=Decimal('12'),
            solar_power_cost_per_kwh=Decimal('3'),
            is_active=True,
        )
        self.site = ProductionSite.objects.create(
            name='Kabati',
            code='KAB',
            region=self.region,
            site_type='BOREHOLE',
        )
        self.source = WaterSource.objects.create(
            production_site=self.site,
            name='Kabati BH1',
            code='KBH1',
            source_type='BOREHOLE',
        )
        self.abstraction_meter = WaterMeter.objects.create(
            meter_number='KAB-ABS-1',
            display_name='Kabati Abstraction',
            installation_date=date(2026, 1, 1),
            initial_reading=Decimal('1000'),
        )
        self.supply_meter = WaterMeter.objects.create(
            meter_number='KAB-SUP-1',
            display_name='Kabati Supply',
            installation_date=date(2026, 1, 1),
            initial_reading=Decimal('800'),
        )
        self.supply_meter_2 = WaterMeter.objects.create(
            meter_number='KAB-SUP-2',
            display_name='Kabati Supply 2',
            installation_date=date(2026, 1, 1),
            initial_reading=Decimal('700'),
        )
        self.grid_meter = EnergyMeter.objects.create(
            meter_number='KAB-GRID-1',
            display_name='Kabati Grid',
            energy_kind='GRID',
            installation_date=date(2026, 1, 1),
            initial_reading=Decimal('500'),
        )
        self.abstraction_assignment = ProductionWaterMeterAssignment.objects.create(
            water_meter=self.abstraction_meter,
            production_site=self.site,
            water_source=self.source,
            assignment_role='ABSTRACTION',
        )
        self.supply_assignment = ProductionWaterMeterAssignment.objects.create(
            water_meter=self.supply_meter,
            production_site=self.site,
            assignment_role='SUPPLY',
        )
        ProductionEnergyMeterAssignment.objects.create(
            energy_meter=self.grid_meter,
            production_site=self.site,
            assignment_role='GRID',
        )

    def test_validated_shared_readings_automatically_create_daily_and_monthly_production(self):
        reading_date = date(2026, 5, 2)
        WaterMeterReading.objects.create(
            water_meter=self.abstraction_meter,
            reading_date=reading_date,
            current_reading=Decimal('1120'),
            previous_reading=Decimal('1000'),
            consumption=Decimal('120'),
            is_validated=True,
        )
        WaterMeterReading.objects.create(
            water_meter=self.supply_meter,
            reading_date=reading_date,
            current_reading=Decimal('910'),
            previous_reading=Decimal('800'),
            consumption=Decimal('110'),
            is_validated=True,
        )
        EnergyMeterReading.objects.create(
            energy_meter=self.grid_meter,
            reading_date=reading_date,
            current_reading=Decimal('560'),
            previous_reading=Decimal('500'),
            consumption=Decimal('60'),
            is_validated=True,
        )

        daily = DailyProduction.objects.get(production_site=self.site, production_date=reading_date)
        monthly = MonthlyProduction.objects.get(production_site=self.site, year=2026, month=5)

        self.assertEqual(daily.water_abstracted_m3, Decimal('120'))
        self.assertEqual(daily.water_supplied_m3, Decimal('110'))
        self.assertEqual(daily.production_loss_m3, Decimal('10'))
        self.assertEqual(daily.total_power_kwh, Decimal('60'))
        self.assertTrue(daily.is_validated)

        self.assertEqual(monthly.water_abstracted_m3, Decimal('120'))
        self.assertEqual(monthly.water_supplied_m3, Decimal('110'))
        self.assertEqual(monthly.power_grid_kwh, Decimal('60'))
        self.assertEqual(monthly.power_costs, Decimal('720.00'))

    def test_marking_shared_readings_validated_later_builds_daily_record(self):
        reading_date = date(2026, 5, 3)
        abstraction = WaterMeterReading.objects.create(
            water_meter=self.abstraction_meter,
            reading_date=reading_date,
            current_reading=Decimal('1180'),
            previous_reading=Decimal('1120'),
            consumption=Decimal('60'),
            is_validated=False,
        )
        supply = WaterMeterReading.objects.create(
            water_meter=self.supply_meter,
            reading_date=reading_date,
            current_reading=Decimal('965'),
            previous_reading=Decimal('910'),
            consumption=Decimal('55'),
            is_validated=False,
        )
        grid = EnergyMeterReading.objects.create(
            energy_meter=self.grid_meter,
            reading_date=reading_date,
            current_reading=Decimal('590'),
            previous_reading=Decimal('560'),
            consumption=Decimal('30'),
            is_validated=False,
        )

        self.assertFalse(DailyProduction.objects.filter(production_site=self.site, production_date=reading_date).exists())

        abstraction.is_validated = True
        abstraction.save(update_fields=['is_validated', 'updated_at'])
        supply.is_validated = True
        supply.save(update_fields=['is_validated', 'updated_at'])
        grid.is_validated = True
        grid.save(update_fields=['is_validated', 'updated_at'])

        daily = DailyProduction.objects.get(production_site=self.site, production_date=reading_date)
        self.assertEqual(daily.water_abstracted_m3, Decimal('60'))
        self.assertEqual(daily.water_supplied_m3, Decimal('55'))
        self.assertEqual(daily.total_power_kwh, Decimal('30'))
        self.assertTrue(daily.is_validated)

    def test_reassigning_supply_meter_recalculates_existing_daily_record(self):
        reading_date = date(2026, 5, 4)
        WaterMeterReading.objects.create(
            water_meter=self.abstraction_meter,
            reading_date=reading_date,
            current_reading=Decimal('1300'),
            previous_reading=Decimal('1180'),
            consumption=Decimal('120'),
            is_validated=True,
        )
        WaterMeterReading.objects.create(
            water_meter=self.supply_meter,
            reading_date=reading_date,
            current_reading=Decimal('1065'),
            previous_reading=Decimal('965'),
            consumption=Decimal('100'),
            is_validated=True,
        )
        WaterMeterReading.objects.create(
            water_meter=self.supply_meter_2,
            reading_date=reading_date,
            current_reading=Decimal('815'),
            previous_reading=Decimal('700'),
            consumption=Decimal('115'),
            is_validated=True,
        )
        EnergyMeterReading.objects.create(
            energy_meter=self.grid_meter,
            reading_date=reading_date,
            current_reading=Decimal('650'),
            previous_reading=Decimal('590'),
            consumption=Decimal('60'),
            is_validated=True,
        )

        daily = DailyProduction.objects.get(production_site=self.site, production_date=reading_date)
        self.assertEqual(daily.water_supplied_m3, Decimal('100'))

        self.supply_assignment.water_meter = self.supply_meter_2
        self.supply_assignment.save(update_fields=['water_meter', 'updated_at'])

        daily.refresh_from_db()
        self.assertEqual(daily.water_supplied_m3, Decimal('115'))
        self.assertEqual(daily.production_loss_m3, Decimal('5'))


class ProductionWorkflowApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username='production-tester',
            password='secret123',
        )
        self.client.force_authenticate(self.user)

        self.region = Region.objects.create(name='Central', code='CENTRAL')
        ProductionCostConfig.objects.create(
            name='Workflow config',
            grid_power_cost_per_kwh=Decimal('12'),
            solar_power_cost_per_kwh=Decimal('3'),
            is_active=True,
        )
        self.site = ProductionSite.objects.create(
            name='Kabati',
            code='KAB',
            region=self.region,
            site_type='BOREHOLE',
            has_solar=True,
        )
        self.source = WaterSource.objects.create(
            production_site=self.site,
            name='Kabati BH1',
            code='KBH1',
            source_type='BOREHOLE',
        )
        self.water_meter = Meter.objects.create(
            production_site=self.site,
            water_source=self.source,
            meter_type='WATER',
            meter_number='KAB-WATER-1',
            installation_date=date(2026, 1, 1),
            initial_reading=Decimal('1000'),
        )
        self.grid_meter = Meter.objects.create(
            production_site=self.site,
            meter_type='POWER_GRID',
            meter_number='KAB-GRID-1',
            installation_date=date(2026, 1, 1),
            initial_reading=Decimal('500'),
        )
        self.solar_meter = Meter.objects.create(
            production_site=self.site,
            meter_type='POWER_SOLAR',
            meter_number='KAB-SOLAR-1',
            installation_date=date(2026, 1, 1),
            initial_reading=Decimal('200'),
        )
        self.supply_meter = Meter.objects.create(
            production_site=self.site,
            meter_type='SUPPLY',
            meter_number='KAB-SUPPLY-1',
            installation_date=date(2026, 1, 1),
            initial_reading=Decimal('800'),
        )

    def test_validate_readings_endpoint_creates_daily_and_monthly_records(self):
        reading_date = date(2026, 5, 10)
        readings = [
            MeterReading.objects.create(
                meter=self.water_meter,
                reading_date=reading_date,
                current_reading=Decimal('1120'),
                previous_reading=Decimal('1000'),
                consumption=Decimal('120'),
                is_validated=False,
            ),
            MeterReading.objects.create(
                meter=self.grid_meter,
                reading_date=reading_date,
                current_reading=Decimal('560'),
                previous_reading=Decimal('500'),
                consumption=Decimal('60'),
                is_validated=False,
            ),
            MeterReading.objects.create(
                meter=self.solar_meter,
                reading_date=reading_date,
                current_reading=Decimal('225'),
                previous_reading=Decimal('200'),
                consumption=Decimal('25'),
                is_validated=False,
            ),
            MeterReading.objects.create(
                meter=self.supply_meter,
                reading_date=reading_date,
                current_reading=Decimal('910'),
                previous_reading=Decimal('800'),
                consumption=Decimal('110'),
                is_validated=False,
            ),
        ]

        self.assertFalse(DailyProduction.objects.filter(production_site=self.site, production_date=reading_date).exists())

        response = self.client.post(
            '/api/production/meter-readings/validate_readings/',
            {'reading_ids': [reading.id for reading in readings]},
            format='json',
        )

        self.assertEqual(response.status_code, 200)

        daily = DailyProduction.objects.get(production_site=self.site, production_date=reading_date)
        monthly = MonthlyProduction.objects.get(production_site=self.site, year=2026, month=5)
        company = CompanyMonthlySummary.objects.get(year=2026, month=5)

        self.assertTrue(daily.is_complete)
        self.assertTrue(daily.is_validated)
        self.assertEqual(daily.water_abstracted_m3, Decimal('120'))
        self.assertEqual(daily.water_supplied_m3, Decimal('110'))
        self.assertEqual(daily.production_loss_m3, Decimal('10'))
        self.assertEqual(daily.total_power_kwh, Decimal('85'))

        self.assertEqual(monthly.water_abstracted_m3, Decimal('120'))
        self.assertEqual(monthly.water_supplied_m3, Decimal('110'))
        self.assertEqual(monthly.power_grid_kwh, Decimal('60'))
        self.assertEqual(monthly.power_solar_kwh, Decimal('25'))
        self.assertEqual(monthly.power_costs, Decimal('795.00'))
        self.assertEqual(company.central_available_for_sale_m3, Decimal('110.00'))

    def test_incomplete_meter_set_does_not_validate_daily_or_create_monthly(self):
        reading_date = date(2026, 5, 11)
        MeterReading.objects.create(
            meter=self.water_meter,
            reading_date=reading_date,
            current_reading=Decimal('1240'),
            previous_reading=Decimal('1120'),
            consumption=Decimal('120'),
            is_validated=True,
        )
        MeterReading.objects.create(
            meter=self.grid_meter,
            reading_date=reading_date,
            current_reading=Decimal('620'),
            previous_reading=Decimal('560'),
            consumption=Decimal('60'),
            is_validated=True,
        )
        MeterReading.objects.create(
            meter=self.supply_meter,
            reading_date=reading_date,
            current_reading=Decimal('1020'),
            previous_reading=Decimal('910'),
            consumption=Decimal('110'),
            is_validated=True,
        )

        daily = DailyProduction.objects.get(production_site=self.site, production_date=reading_date)
        self.assertFalse(daily.is_complete)
        self.assertFalse(daily.is_validated)
        self.assertFalse(MonthlyProduction.objects.filter(production_site=self.site, year=2026, month=5).exists())

    def test_create_serializer_uses_last_validated_reading_and_rejects_negative_consumption(self):
        first_date = date(2026, 5, 1)
        MeterReading.objects.create(
            meter=self.water_meter,
            reading_date=first_date,
            current_reading=Decimal('1100'),
            previous_reading=Decimal('1000'),
            consumption=Decimal('100'),
            is_validated=True,
        )

        response = self.client.post(
            '/api/production/meter-readings/',
            {
                'meter': self.water_meter.id,
                'reading_date': '2026-05-02',
                'reading_time': '08:00:00',
                'current_reading': '1150',
                'read_by': 'tester',
                'reading_method': 'MANUAL',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)

        created = MeterReading.objects.get(meter=self.water_meter, reading_date=date(2026, 5, 2))
        self.assertEqual(created.previous_reading, Decimal('1100'))
        self.assertEqual(created.consumption, Decimal('50'))

        invalid_response = self.client.post(
            '/api/production/meter-readings/',
            {
                'meter': self.water_meter.id,
                'reading_date': '2026-05-03',
                'reading_time': '08:00:00',
                'current_reading': '1090',
                'read_by': 'tester',
                'reading_method': 'MANUAL',
            },
            format='json',
        )
        self.assertEqual(invalid_response.status_code, 400)
        self.assertIn('Current reading cannot be less than previous reading', str(invalid_response.data))

    def test_removing_validated_readings_refreshes_monthly_totals_and_deletes_empty_month(self):
        day_one = date(2026, 5, 12)
        day_two = date(2026, 5, 13)

        for reading_date, water, grid, solar, supply in [
            (day_one, Decimal('120'), Decimal('60'), Decimal('20'), Decimal('110')),
            (day_two, Decimal('100'), Decimal('50'), Decimal('10'), Decimal('95')),
        ]:
            MeterReading.objects.create(
                meter=self.water_meter,
                reading_date=reading_date,
                current_reading=Decimal('0') + water,
                previous_reading=Decimal('0'),
                consumption=water,
                is_validated=True,
            )
            MeterReading.objects.create(
                meter=self.grid_meter,
                reading_date=reading_date,
                current_reading=Decimal('0') + grid,
                previous_reading=Decimal('0'),
                consumption=grid,
                is_validated=True,
            )
            MeterReading.objects.create(
                meter=self.solar_meter,
                reading_date=reading_date,
                current_reading=Decimal('0') + solar,
                previous_reading=Decimal('0'),
                consumption=solar,
                is_validated=True,
            )
            MeterReading.objects.create(
                meter=self.supply_meter,
                reading_date=reading_date,
                current_reading=Decimal('0') + supply,
                previous_reading=Decimal('0'),
                consumption=supply,
                is_validated=True,
            )

        monthly = MonthlyProduction.objects.get(production_site=self.site, year=2026, month=5)
        self.assertEqual(monthly.water_abstracted_m3, Decimal('220'))
        self.assertEqual(monthly.water_supplied_m3, Decimal('205'))

        MeterReading.objects.filter(reading_date=day_two).delete()

        monthly.refresh_from_db()
        self.assertEqual(monthly.water_abstracted_m3, Decimal('120'))
        self.assertEqual(monthly.water_supplied_m3, Decimal('110'))

        MeterReading.objects.filter(reading_date=day_one).delete()

        self.assertFalse(DailyProduction.objects.filter(production_site=self.site, production_date=day_one).exists())
        self.assertFalse(MonthlyProduction.objects.filter(production_site=self.site, year=2026, month=5).exists())


class MonthlyProductionRollupTests(TestCase):
    def setUp(self):
        self.region = Region.objects.create(name='Eastern', code='EAST')
        ProductionCostConfig.objects.create(
            name='Monthly rollup config',
            grid_power_cost_per_kwh=Decimal('10'),
            solar_power_cost_per_kwh=Decimal('5'),
            is_active=True,
        )
        self.site = ProductionSite.objects.create(
            name='Water Works',
            code='WWS',
            region=self.region,
            site_type='MIXED',
            has_solar=True,
        )
        self.target = ProductionTarget.objects.create(
            production_site=self.site,
            year=2026,
            month=4,
            water_abstraction_target_m3=Decimal('400'),
            production_loss_target_m3=Decimal('20'),
            power_grid_target_kwh=Decimal('140'),
            power_solar_target_kwh=Decimal('60'),
        )

    def test_monthly_rollup_includes_multiple_days_targets_quality_and_company_summary(self):
        DailyProduction.objects.create(
            production_site=self.site,
            production_date=date(2026, 4, 1),
            water_abstracted_m3=Decimal('100'),
            water_supplied_m3=Decimal('130'),
            production_loss_m3=Decimal('0'),
            power_grid_kwh=Decimal('40'),
            power_solar_kwh=Decimal('10'),
            is_complete=True,
            is_validated=True,
        )
        DailyProduction.objects.create(
            production_site=self.site,
            production_date=date(2026, 4, 2),
            water_abstracted_m3=Decimal('120'),
            water_supplied_m3=Decimal('150'),
            production_loss_m3=Decimal('0'),
            power_grid_kwh=Decimal('50'),
            power_solar_kwh=Decimal('20'),
            is_complete=True,
            is_validated=True,
        )

        WaterQualityTest.objects.create(
            production_site=self.site,
            test_date=date(2026, 4, 3),
            test_type='CHEMICAL',
            test_location='PRODUCTION',
            parameter_tested='Chlorine',
            test_result=Decimal('0.2'),
            unit_of_measure='mg/L',
            is_compliant=True,
        )
        WaterQualityTest.objects.create(
            production_site=self.site,
            test_date=date(2026, 4, 4),
            test_type='BIOLOGICAL',
            test_location='CONSUMER',
            parameter_tested='E.Coli',
            test_result=Decimal('1'),
            unit_of_measure='cfu',
            is_compliant=False,
        )

        monthly_record = aggregate_monthly_production(self.site, 2026, 4)
        monthly_record.refresh_from_db()

        self.assertEqual(monthly_record.target_id, self.target.id)
        self.assertEqual(monthly_record.start_date, date(2026, 4, 1))
        self.assertEqual(monthly_record.closing_date, date(2026, 4, 30))
        self.assertEqual(monthly_record.water_abstracted_m3, Decimal('220'))
        self.assertEqual(monthly_record.water_supplied_m3, Decimal('280'))
        self.assertEqual(monthly_record.water_received_m3, Decimal('60'))
        self.assertEqual(monthly_record.power_costs, Decimal('1050.00'))
        self.assertEqual(monthly_record.chemical_tests_production, 1)
        self.assertEqual(monthly_record.biological_tests_consumer, 1)
        self.assertEqual(monthly_record.who_compliance_chemical_production, Decimal('100'))
        self.assertEqual(monthly_record.who_compliance_biological_consumer, Decimal('0'))
        self.assertEqual(monthly_record.water_abstraction_realization_percent, Decimal('55.00'))

        company = CompanyMonthlySummary.objects.get(year=2026, month=4)
        self.assertEqual(company.power_costs, Decimal('1050.00'))
        self.assertEqual(company.eastern_available_for_sale_m3, Decimal('280.00'))
        self.assertEqual(company.eastern_opening_date, date(2026, 4, 1))
        self.assertEqual(company.eastern_closing_date, date(2026, 4, 30))


class ImportedMonthlyProductionPreservationTests(TestCase):
    def setUp(self):
        self.region = Region.objects.create(name='Eastern', code='EAST')
        self.site = ProductionSite.objects.create(
            name='Imported Site',
            code='IMP',
            region=self.region,
            site_type='BOREHOLE',
        )
        self.target = ProductionTarget.objects.create(
            production_site=self.site,
            year=2026,
            month=3,
            water_abstraction_target_m3=Decimal('900'),
            production_loss_target_m3=Decimal('50'),
            power_grid_target_kwh=Decimal('300'),
            power_solar_target_kwh=Decimal('0'),
        )
        self.monthly = MonthlyProduction.objects.create(
            production_site=self.site,
            target=self.target,
            year=2026,
            month=3,
            water_abstracted_m3=Decimal('750'),
            water_supplied_m3=Decimal('700'),
            production_loss_m3=Decimal('50'),
            power_grid_kwh=Decimal('250'),
            power_costs=Decimal('1234'),
            total_direct_costs=Decimal('1500'),
            is_finalized=False,
        )

    def test_refresh_preserves_imported_month_without_daily_records(self):
        refresh_production_for_site_dates([
            (self.site.id, date(2026, 3, 15)),
        ])

        preserved = MonthlyProduction.objects.get(
            production_site=self.site,
            year=2026,
            month=3,
        )
        self.assertEqual(preserved.id, self.monthly.id)
        self.assertEqual(preserved.water_abstracted_m3, Decimal('750.00'))
        self.assertEqual(preserved.water_supplied_m3, Decimal('700.00'))


class ProductionReportingApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username='reporting-tester',
            password='secret123',
        )
        self.client.force_authenticate(self.user)

        self.central = Region.objects.create(name='Central', code='CENTRAL')
        self.eastern = Region.objects.create(name='Eastern', code='EAST')
        ProductionCostConfig.objects.create(
            name='Reporting config',
            grid_power_cost_per_kwh=Decimal('10'),
            solar_power_cost_per_kwh=Decimal('5'),
            is_active=True,
        )

        self.central_site = ProductionSite.objects.create(
            name='Kabati',
            code='KAB',
            region=self.central,
            site_type='BOREHOLE',
        )
        self.eastern_site = ProductionSite.objects.create(
            name='Water Works',
            code='WWS',
            region=self.eastern,
            site_type='MIXED',
            has_solar=True,
        )

        self.central_target_jul = ProductionTarget.objects.create(
            production_site=self.central_site,
            year=2025,
            month=7,
            water_abstraction_target_m3=Decimal('180'),
            production_loss_target_m3=Decimal('20'),
            power_grid_target_kwh=Decimal('72'),
            power_solar_target_kwh=Decimal('18'),
        )
        self.eastern_target_jul = ProductionTarget.objects.create(
            production_site=self.eastern_site,
            year=2025,
            month=7,
            water_abstraction_target_m3=Decimal('260'),
            production_loss_target_m3=Decimal('10'),
            power_grid_target_kwh=Decimal('90'),
            power_solar_target_kwh=Decimal('30'),
        )
        self.central_target_aug = ProductionTarget.objects.create(
            production_site=self.central_site,
            year=2025,
            month=8,
            water_abstraction_target_m3=Decimal('200'),
            production_loss_target_m3=Decimal('20'),
            power_grid_target_kwh=Decimal('80'),
            power_solar_target_kwh=Decimal('20'),
        )

        self.central_jul = MonthlyProduction.objects.create(
            production_site=self.central_site,
            year=2025,
            month=7,
            start_date=date(2025, 7, 1),
            closing_date=date(2025, 7, 31),
            water_abstracted_m3=Decimal('200'),
            water_supplied_m3=Decimal('180'),
            production_loss_m3=Decimal('20'),
            power_grid_kwh=Decimal('80'),
            power_solar_kwh=Decimal('20'),
            target=self.central_target_jul,
            is_finalized=True,
        )
        self.eastern_jul = MonthlyProduction.objects.create(
            production_site=self.eastern_site,
            year=2025,
            month=7,
            start_date=date(2025, 7, 1),
            closing_date=date(2025, 7, 31),
            water_abstracted_m3=Decimal('250'),
            water_supplied_m3=Decimal('300'),
            production_loss_m3=Decimal('0'),
            power_grid_kwh=Decimal('90'),
            power_solar_kwh=Decimal('30'),
            target=self.eastern_target_jul,
            is_finalized=True,
        )
        self.central_aug = MonthlyProduction.objects.create(
            production_site=self.central_site,
            year=2025,
            month=8,
            start_date=date(2025, 8, 1),
            closing_date=date(2025, 8, 31),
            water_abstracted_m3=Decimal('150'),
            water_supplied_m3=Decimal('140'),
            production_loss_m3=Decimal('10'),
            power_grid_kwh=Decimal('60'),
            power_solar_kwh=Decimal('10'),
            target=self.central_target_aug,
            is_finalized=True,
        )

    def test_dashboard_summary_returns_expected_month_aggregates(self):
        response = self.client.get(
            '/api/production/monthly-production/dashboard_summary/',
            {'year': 2025, 'month': 7},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data['total_water_abstracted']), Decimal('450'))
        self.assertEqual(Decimal(response.data['total_water_supplied']), Decimal('480'))
        self.assertEqual(Decimal(response.data['total_water_received']), Decimal('50'))
        self.assertEqual(Decimal(response.data['total_production_loss']), Decimal('20'))
        self.assertEqual(Decimal(response.data['total_power_consumption']), Decimal('220'))
        self.assertEqual(Decimal(response.data['target_water_abstracted']), Decimal('440'))
        self.assertEqual(Decimal(response.data['target_water_supplied']), Decimal('410'))
        self.assertEqual(Decimal(response.data['target_power_consumption']), Decimal('210'))
        self.assertEqual(Decimal(response.data['average_power_efficiency']), Decimal('0.4888888888888888888888888889'))
        self.assertEqual(Decimal(response.data['target_realization_percentage']), Decimal('103.632478632479'))
        self.assertEqual(response.data['total_sites'], 2)
        self.assertEqual(response.data['active_sites'], 2)

    def test_dashboard_summary_filters_by_site(self):
        response = self.client.get(
            '/api/production/monthly-production/dashboard_summary/',
            {'year': 2025, 'month': 7, 'production_site': self.central_site.id},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Decimal(response.data['total_water_abstracted']), Decimal('200'))
        self.assertEqual(Decimal(response.data['target_water_abstracted']), Decimal('180'))
        self.assertEqual(response.data['total_sites'], 1)
        self.assertEqual(response.data['active_sites'], 1)

    def test_monthly_list_includes_target_only_sites_for_selected_month(self):
        eastern_target_aug = ProductionTarget.objects.create(
            production_site=self.eastern_site,
            year=2025,
            month=8,
            water_abstraction_target_m3=Decimal('300'),
            production_loss_target_m3=Decimal('15'),
            power_grid_target_kwh=Decimal('100'),
            power_solar_target_kwh=Decimal('25'),
        )

        response = self.client.get(
            '/api/production/monthly-production/',
            {'year': 2025, 'month': 8},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 2)

        rows_by_site = {
            row['production_site_code']: row
            for row in response.data['results']
        }

        self.assertIn('KAB', rows_by_site)
        self.assertIn('WWS', rows_by_site)
        self.assertEqual(Decimal(rows_by_site['KAB']['water_abstracted_m3']), Decimal('150.00'))
        self.assertEqual(Decimal(rows_by_site['WWS']['water_abstracted_m3']), Decimal('0.00'))
        self.assertEqual(rows_by_site['WWS']['target_details']['id'], eastern_target_aug.id)
        self.assertEqual(
            Decimal(rows_by_site['WWS']['target_details']['water_abstraction_target_m3']),
            Decimal('300.00'),
        )

    def test_dashboard_summary_counts_target_only_sites_for_selected_month(self):
        ProductionTarget.objects.create(
            production_site=self.eastern_site,
            year=2025,
            month=8,
            water_abstraction_target_m3=Decimal('300'),
            production_loss_target_m3=Decimal('15'),
            power_grid_target_kwh=Decimal('100'),
            power_solar_target_kwh=Decimal('25'),
        )

        response = self.client.get(
            '/api/production/monthly-production/dashboard_summary/',
            {'year': 2025, 'month': 8},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_sites'], 2)
        self.assertEqual(response.data['active_sites'], 2)
        self.assertEqual(Decimal(response.data['total_water_abstracted']), Decimal('150'))
        self.assertEqual(Decimal(response.data['target_water_abstracted']), Decimal('500'))

    def test_fy_site_totals_returns_aggregated_site_row(self):
        response = self.client.get(
            '/api/production/monthly-production/fy_site_totals/',
            {'fy_year': 2025, 'production_site': self.central_site.id},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        row = response.data[0]
        self.assertEqual(Decimal(row['water_abstracted_m3']), Decimal('350.00'))
        self.assertEqual(Decimal(row['water_supplied_m3']), Decimal('320.00'))
        self.assertEqual(Decimal(row['power_grid_kwh']), Decimal('140.00'))
        self.assertEqual(Decimal(row['power_solar_kwh']), Decimal('30.00'))
        self.assertEqual(Decimal(row['target_details']['water_abstraction_target_m3']), Decimal('380'))

    def test_dashboard_summary_supports_fy_mode(self):
        response = self.client.get(
            '/api/production/monthly-production/dashboard_summary/',
            {'fy_year': 2025},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['period'], 'FY 2025/26')
        self.assertEqual(Decimal(response.data['total_water_abstracted']), Decimal('600'))
        self.assertEqual(Decimal(response.data['target_water_abstracted']), Decimal('640'))
        self.assertEqual(Decimal(response.data['target_power_consumption']), Decimal('310'))

    def test_target_comparison_returns_site_level_variances(self):
        response = self.client.get(
            '/api/production/monthly-production/target_comparison/',
            {'year': 2025, 'month': 7},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)

        kabati = next(row for row in response.data if row['production_site'] == 'Kabati')
        water_works = next(row for row in response.data if row['production_site'] == 'Water Works')

        self.assertEqual(Decimal(kabati['water_target']), Decimal('180.00'))
        self.assertEqual(Decimal(kabati['water_actual']), Decimal('200.00'))
        self.assertEqual(Decimal(kabati['water_variance']), Decimal('20.00'))
        self.assertEqual(Decimal(kabati['water_realization']), Decimal('111.11'))

        self.assertEqual(Decimal(water_works['water_target']), Decimal('260.00'))
        self.assertEqual(Decimal(water_works['water_actual']), Decimal('250.00'))
        self.assertEqual(Decimal(water_works['water_variance']), Decimal('-10.00'))
        self.assertEqual(Decimal(water_works['loss_target_percent']), Decimal('3.85'))

    def test_target_comparison_requires_year_and_month(self):
        response = self.client.get('/api/production/monthly-production/target_comparison/', {'year': 2025})
        self.assertEqual(response.status_code, 400)
