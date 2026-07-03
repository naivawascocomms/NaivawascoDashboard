from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APITestCase

from distribution.models import DMA, DistributionRegion, Zone
from production.models import ProductionSite, Region

from .models import (
    DistributionWaterMeterAssignment,
    MeterReadingAssignment,
    ProductionWaterMeterAssignment,
    WaterMeter,
    WaterMeterReading,
)
from .sync import refresh_water_meter_display_name
from .workbook_names import build_workbook_annotation, split_meter_name_and_notes

User = get_user_model()


class WaterMeterDisplayNameTests(TestCase):
    def setUp(self):
        self.region = DistributionRegion.objects.create(name='Central', code='CENT')
        self.zone = Zone.objects.create(region=self.region, name='CBD', code='CBD')
        self.dma = DMA.objects.create(zone=self.zone, name='CBD/CCCR Feed B', code='CBD-CCCR-B')

    def test_refresh_uses_inactive_distribution_history_for_serial_meter(self):
        meter = WaterMeter.objects.create(
            meter_number='12W722485',
            installation_date=date(2024, 1, 1),
        )
        DistributionWaterMeterAssignment.objects.create(
            water_meter=meter,
            zone=self.zone,
            dma=self.dma,
            assignment_role='DMA_INLET',
            is_active=False,
            notes='Imported from distribution meter #84. CBD-CCCR | Test mapping inferred from daily-volume workbooks.',
        )

        refresh_water_meter_display_name(meter)
        meter.refresh_from_db()

        self.assertEqual(meter.display_name, 'CBD - CCCR Meter')

    def test_assignment_save_signal_refreshes_display_name(self):
        meter = WaterMeter.objects.create(
            meter_number='23032800',
            installation_date=date(2024, 1, 1),
        )

        DistributionWaterMeterAssignment.objects.create(
            water_meter=meter,
            zone=self.zone,
            dma=self.dma,
            assignment_role='DMA_INLET',
            is_active=False,
            notes='Imported from distribution meter #76. SUBERICO 2 | Test mapping inferred from daily-volume workbooks.',
        )

        meter.refresh_from_db()
        self.assertEqual(meter.display_name, 'SUBERICO 2 Meter')


class WorkbookMeterNameParsingTests(TestCase):
    def test_split_meter_name_and_notes_strips_parenthetical_annotations(self):
        clean_name, notes = split_meter_name_and_notes(
            'KARATI - HOPEWELL METER (Shared with Distr - Hopewell Zone)'
        )

        self.assertEqual(clean_name, 'KARATI - HOPEWELL METER')
        self.assertEqual(notes, ['Shared with Distr - Hopewell Zone'])

    def test_build_workbook_annotation_merges_multiple_annotations(self):
        annotation = build_workbook_annotation(['Ngujiri', 'Meter over registering'])

        self.assertEqual(
            annotation,
            'Workbook annotations: Ngujiri; Meter over registering.'
        )


class MeterReadingAccessControlTests(APITestCase):
    def setUp(self):
        self.production_region = Region.objects.create(name='Production Central', code='PCENT')
        self.production_site = ProductionSite.objects.create(
            name='DTI Borehole',
            code='DTI',
            region=self.production_region,
        )
        self.distribution_region = DistributionRegion.objects.create(name='Central', code='CENT')
        self.zone = Zone.objects.create(region=self.distribution_region, name='CBD', code='CBD')

        self.water_meter = WaterMeter.objects.create(
            meter_number='WM-001',
            installation_date=date(2024, 1, 1),
        )

        ProductionWaterMeterAssignment.objects.create(
            water_meter=self.water_meter,
            production_site=self.production_site,
            assignment_role='SUPPLY',
            is_active=True,
        )
        DistributionWaterMeterAssignment.objects.create(
            water_meter=self.water_meter,
            zone=self.zone,
            assignment_role='ZONE_INLET',
            is_active=True,
        )

        self.supervisor = User.objects.create_user(username='supervisor', password='pass1234')
        self.operator = User.objects.create_user(username='operator', password='pass1234')
        self.officer = User.objects.create_user(username='officer', password='pass1234')
        self.plumber = User.objects.create_user(username='plumber', password='pass1234')
        self.admin = User.objects.create_superuser(username='admin', password='pass1234')

        self.supervisor.metering_profile.role = 'PRODUCTION_SUPERVISOR'
        self.supervisor.metering_profile.save(update_fields=['role', 'updated_at'])
        self.operator.metering_profile.role = 'PUMP_OPERATOR'
        self.operator.metering_profile.save(update_fields=['role', 'updated_at'])
        self.officer.metering_profile.role = 'ZONAL_OFFICER'
        self.officer.metering_profile.save(update_fields=['role', 'updated_at'])
        self.plumber.metering_profile.role = 'PLUMBER'
        self.plumber.metering_profile.save(update_fields=['role', 'updated_at'])

    def test_unassigned_user_cannot_submit_water_meter_reading(self):
        self.client.force_authenticate(user=self.operator)

        response = self.client.post(
            '/api/metering/water-meter-readings/',
            {
                'water_meter': self.water_meter.id,
                'reading_date': '2026-04-27',
                'reading_time': '08:00:00',
                'current_reading': '125.00',
                'reading_method': 'MANUAL',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('not assigned', str(response.data).lower())

    def test_assigned_user_can_submit_water_meter_reading(self):
        MeterReadingAssignment.objects.create(
            assignee=self.operator,
            assigned_by=self.supervisor,
            scope_type='PRODUCTION_SITE',
            production_site=self.production_site,
            water_meter=self.water_meter,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
        )
        self.client.force_authenticate(user=self.operator)

        response = self.client.post(
            '/api/metering/water-meter-readings/',
            {
                'water_meter': self.water_meter.id,
                'reading_date': '2026-04-27',
                'reading_time': '08:00:00',
                'current_reading': '125.00',
                'reading_method': 'MANUAL',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['read_by'], 'operator')
        self.assertEqual(response.data['submitted_by'], self.operator.id)

    def test_today_endpoint_returns_mobile_reading_tasks(self):
        WaterMeterReading.objects.create(
            water_meter=self.water_meter,
            reading_date=date(2026, 4, 26),
            current_reading=Decimal('100.00'),
            previous_reading=Decimal('50.00'),
        )
        MeterReadingAssignment.objects.create(
            assignee=self.operator,
            assigned_by=self.supervisor,
            scope_type='PRODUCTION_SITE',
            production_site=self.production_site,
            water_meter=self.water_meter,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
        )
        self.client.force_authenticate(user=self.operator)

        response = self.client.get(
            '/api/metering/meter-reading-assignments/today/',
            {'date': '2026-04-27'},
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['count'], 1)
        task = response.data['results'][0]
        self.assertEqual(task['meter_type'], 'WATER')
        self.assertEqual(task['meter_id'], self.water_meter.id)
        self.assertEqual(task['previous_reading_value'], Decimal('100.00'))
        self.assertEqual(task['status'], 'missing')
        self.assertEqual(task['scopes'][0]['production_site_name'], 'DTI Borehole')

    def test_submit_endpoint_is_idempotent_for_unvalidated_readings(self):
        MeterReadingAssignment.objects.create(
            assignee=self.operator,
            assigned_by=self.supervisor,
            scope_type='PRODUCTION_SITE',
            production_site=self.production_site,
            water_meter=self.water_meter,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
        )
        self.client.force_authenticate(user=self.operator)

        first_response = self.client.post(
            '/api/metering/water-meter-readings/submit/',
            {
                'water_meter': self.water_meter.id,
                'reading_date': '2026-04-27',
                'reading_time': '08:00:00',
                'current_reading': '125.00',
                'reading_method': 'MANUAL',
            },
            format='json',
        )
        retry_response = self.client.post(
            '/api/metering/water-meter-readings/submit/',
            {
                'water_meter': self.water_meter.id,
                'reading_date': '2026-04-27',
                'reading_time': '08:05:00',
                'current_reading': '126.00',
                'reading_method': 'MANUAL',
            },
            format='json',
        )

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(retry_response.status_code, 200)
        self.assertEqual(WaterMeterReading.objects.filter(water_meter=self.water_meter, reading_date=date(2026, 4, 27)).count(), 1)
        reading = WaterMeterReading.objects.get(water_meter=self.water_meter, reading_date=date(2026, 4, 27))
        self.assertEqual(reading.current_reading, 126)
        self.assertEqual(reading.submitted_by, self.operator)

    def test_bulk_create_enforces_assignment_context(self):
        self.client.force_authenticate(user=self.operator)

        response = self.client.post(
            '/api/metering/water-meter-readings/bulk_create/',
            [
                {
                    'water_meter': self.water_meter.id,
                    'reading_date': '2026-04-27',
                    'reading_time': '08:00:00',
                    'current_reading': '125.00',
                    'reading_method': 'MANUAL',
                },
            ],
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('not assigned', str(response.data).lower())

    def test_validated_reading_cannot_be_changed_by_mobile_submit(self):
        MeterReadingAssignment.objects.create(
            assignee=self.operator,
            assigned_by=self.supervisor,
            scope_type='PRODUCTION_SITE',
            production_site=self.production_site,
            water_meter=self.water_meter,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
        )
        WaterMeterReading.objects.create(
            water_meter=self.water_meter,
            reading_date=date(2026, 4, 27),
            current_reading=Decimal('125.00'),
            previous_reading=Decimal('0.00'),
            is_validated=True,
        )
        self.client.force_authenticate(user=self.operator)

        response = self.client.post(
            '/api/metering/water-meter-readings/submit/',
            {
                'water_meter': self.water_meter.id,
                'reading_date': '2026-04-27',
                'reading_time': '08:05:00',
                'current_reading': '126.00',
                'reading_method': 'MANUAL',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('validated', str(response.data).lower())

    def test_production_supervisor_can_assign_by_production_site(self):
        self.client.force_authenticate(user=self.supervisor)

        response = self.client.post(
            '/api/metering/meter-reading-assignments/',
            {
                'assignee_id': self.operator.id,
                'scope_type': 'PRODUCTION_SITE',
                'production_site': self.production_site.id,
                'water_meter': self.water_meter.id,
                'start_date': '2026-04-01',
                'end_date': '2026-04-30',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['assigned_by']['username'], 'supervisor')

    def test_assignment_requires_start_and_end_dates(self):
        self.client.force_authenticate(user=self.supervisor)

        response = self.client.post(
            '/api/metering/meter-reading-assignments/',
            {
                'assignee_id': self.operator.id,
                'scope_type': 'PRODUCTION_SITE',
                'production_site': self.production_site.id,
                'water_meter': self.water_meter.id,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('start_date', response.data)
        self.assertIn('end_date', response.data)

    def test_admin_profile_can_assign_readings(self):
        self.admin.metering_profile.role = 'PUMP_OPERATOR'
        self.admin.metering_profile.save(update_fields=['role', 'updated_at'])
        self.client.force_authenticate(user=self.admin)

        response = self.client.get('/api/metering/user-profiles/me/')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['can_assign_readings'])
        self.assertTrue(response.data['user']['is_superuser'])

    def test_assigner_can_partially_update_assignment_status(self):
        assignment = MeterReadingAssignment.objects.create(
            assignee=self.operator,
            assigned_by=self.supervisor,
            scope_type='PRODUCTION_SITE',
            production_site=self.production_site,
            water_meter=self.water_meter,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
        )
        self.client.force_authenticate(user=self.supervisor)

        response = self.client.patch(
            f'/api/metering/meter-reading-assignments/{assignment.id}/',
            {'is_active': False},
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data['is_active'])

    def test_assignment_list_includes_selected_date_reading_status(self):
        assignment = MeterReadingAssignment.objects.create(
            assignee=self.operator,
            assigned_by=self.supervisor,
            scope_type='PRODUCTION_SITE',
            production_site=self.production_site,
            water_meter=self.water_meter,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
        )
        self.client.force_authenticate(user=self.supervisor)

        missing_response = self.client.get(
            '/api/metering/meter-reading-assignments/',
            {'reading_date': '2026-04-27'},
        )

        self.assertEqual(missing_response.status_code, 200)
        missing_record = next(item for item in missing_response.data['results'] if item['id'] == assignment.id)
        self.assertEqual(missing_record['reading_status'], 'NOT_SUBMITTED')
        self.assertIsNone(missing_record['reading_id'])

        reading = WaterMeterReading.objects.create(
            water_meter=self.water_meter,
            reading_date=date(2026, 4, 27),
            current_reading=Decimal('125.00'),
            previous_reading=Decimal('0.00'),
        )

        submitted_response = self.client.get(
            '/api/metering/meter-reading-assignments/',
            {'reading_date': '2026-04-27'},
        )

        submitted_record = next(item for item in submitted_response.data['results'] if item['id'] == assignment.id)
        self.assertEqual(submitted_record['reading_status'], 'SUBMITTED')
        self.assertEqual(submitted_record['reading_id'], reading.id)
        self.assertFalse(submitted_record['reading_is_validated'])

        reading.is_validated = True
        reading.save(update_fields=['is_validated', 'updated_at'])

        validated_response = self.client.get(
            '/api/metering/meter-reading-assignments/',
            {'reading_date': '2026-04-27'},
        )

        validated_record = next(item for item in validated_response.data['results'] if item['id'] == assignment.id)
        self.assertEqual(validated_record['reading_status'], 'VALIDATED')
        self.assertTrue(validated_record['reading_is_validated'])

    def test_assignment_list_includes_future_assignments_in_date_range(self):
        assignment = MeterReadingAssignment.objects.create(
            assignee=self.operator,
            assigned_by=self.supervisor,
            scope_type='PRODUCTION_SITE',
            production_site=self.production_site,
            water_meter=self.water_meter,
            start_date=date(2999, 1, 1),
            end_date=date(2999, 1, 31),
        )
        self.client.force_authenticate(user=self.supervisor)

        response = self.client.get(
            '/api/metering/meter-reading-assignments/',
            {'reading_date': '2999-01-01'},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], assignment.id)
        self.assertEqual(response.data['results'][0]['reading_status'], 'NOT_SUBMITTED')

    def test_assigner_can_list_and_approve_pending_reading(self):
        assignment = MeterReadingAssignment.objects.create(
            assignee=self.operator,
            assigned_by=self.supervisor,
            scope_type='PRODUCTION_SITE',
            production_site=self.production_site,
            water_meter=self.water_meter,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
        )
        reading = WaterMeterReading.objects.create(
            water_meter=self.water_meter,
            submitted_by=self.operator,
            reading_date=date(2026, 4, 27),
            current_reading=Decimal('125.00'),
            previous_reading=Decimal('0.00'),
        )
        self.client.force_authenticate(user=self.supervisor)

        list_response = self.client.get(
            '/api/metering/meter-reading-assignments/pending_approvals/',
            {'reading_date': '2026-04-27'},
        )

        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.data['count'], 1)
        self.assertEqual(list_response.data['results'][0]['assignment_id'], assignment.id)

        approve_response = self.client.post(
            '/api/metering/meter-reading-assignments/approve_reading/',
            {'reading_type': 'WATER', 'reading_id': reading.id},
            format='json',
        )

        self.assertEqual(approve_response.status_code, 200)
        reading.refresh_from_db()
        self.assertTrue(reading.is_validated)
        self.assertEqual(reading.validated_by, 'supervisor')

    def test_assigner_can_delegate_reading_approval(self):
        assignment = MeterReadingAssignment.objects.create(
            assignee=self.operator,
            assigned_by=self.supervisor,
            scope_type='PRODUCTION_SITE',
            production_site=self.production_site,
            water_meter=self.water_meter,
            start_date=date(2026, 4, 1),
            end_date=date(2026, 4, 30),
        )
        WaterMeterReading.objects.create(
            water_meter=self.water_meter,
            submitted_by=self.operator,
            reading_date=date(2026, 4, 27),
            current_reading=Decimal('125.00'),
            previous_reading=Decimal('0.00'),
        )
        self.client.force_authenticate(user=self.supervisor)

        delegate_response = self.client.post(
            f'/api/metering/meter-reading-assignments/{assignment.id}/delegate_approval/',
            {'delegate_id': self.officer.id},
            format='json',
        )

        self.assertEqual(delegate_response.status_code, 200)
        self.assertEqual(delegate_response.data['approval_delegate']['username'], 'officer')

        self.client.force_authenticate(user=self.officer)
        pending_response = self.client.get(
            '/api/metering/meter-reading-assignments/pending_approvals/',
            {'reading_date': '2026-04-27'},
        )

        self.assertEqual(pending_response.status_code, 200)
        self.assertEqual(pending_response.data['count'], 1)

    def test_assigner_can_bulk_approve_site_readings(self):
        second_meter = WaterMeter.objects.create(
            meter_number='WM-002',
            installation_date=date(2024, 1, 1),
        )
        ProductionWaterMeterAssignment.objects.create(
            water_meter=second_meter,
            production_site=self.production_site,
            assignment_role='SUPPLY',
            is_active=True,
        )
        for meter in [self.water_meter, second_meter]:
            MeterReadingAssignment.objects.create(
                assignee=self.operator,
                assigned_by=self.supervisor,
                scope_type='PRODUCTION_SITE',
                production_site=self.production_site,
                water_meter=meter,
                start_date=date(2026, 4, 1),
                end_date=date(2026, 4, 30),
            )
            WaterMeterReading.objects.create(
                water_meter=meter,
                submitted_by=self.operator,
                reading_date=date(2026, 4, 27),
                current_reading=Decimal('125.00'),
                previous_reading=Decimal('0.00'),
            )
        self.client.force_authenticate(user=self.supervisor)

        response = self.client.post(
            '/api/metering/meter-reading-assignments/bulk_approve/',
            {
                'reading_date': '2026-04-27',
                'assignee': self.operator.id,
                'scope_type': 'PRODUCTION_SITE',
                'production_site': self.production_site.id,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['approved'], 2)
        self.assertEqual(
            WaterMeterReading.objects.filter(reading_date=date(2026, 4, 27), is_validated=True).count(),
            2,
        )

    def test_zonal_officer_cannot_assign_zone_scope_energy_meter(self):
        from .models import EnergyMeter

        energy_meter = EnergyMeter.objects.create(
            meter_number='EM-001',
            energy_kind='GRID',
            installation_date=date(2024, 1, 1),
        )
        self.client.force_authenticate(user=self.officer)

        response = self.client.post(
            '/api/metering/meter-reading-assignments/',
            {
                'assignee_id': self.plumber.id,
                'scope_type': 'ZONE',
                'zone': self.zone.id,
                'energy_meter': energy_meter.id,
                'start_date': '2026-04-01',
                'end_date': '2026-04-30',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('energy meter', str(response.data).lower())
