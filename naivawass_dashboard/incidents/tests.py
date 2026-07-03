from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from distribution.models import DistributionRegion, Zone
from incidents.models import Incident, IncidentComment
from production.models import ProductionSite, Region


class IncidentApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username='incident-tester',
            password='secret123',
        )
        self.client.force_authenticate(self.user)
        self.assignee = get_user_model().objects.create_user(
            username='field-technician',
            password='secret123',
            first_name='Field',
            last_name='Technician',
        )

        self.production_region = Region.objects.create(code='CENTRAL', name='Central Production')
        self.production_site = ProductionSite.objects.create(
            name='Kabati Borehole',
            code='KAB',
            region=self.production_region,
            site_type='BOREHOLE',
        )
        self.distribution_region = DistributionRegion.objects.create(code='CENTRAL', name='Central')
        self.zone = Zone.objects.create(region=self.distribution_region, code='CBD', name='CBD')

    def test_create_distribution_incident_and_summary(self):
        response = self.client.post(
            '/api/incidents/incidents/',
            {
                'type': 'distribution',
                'category': 'Burst Pipe',
                'description': 'Major burst on CBD main line',
                'location': 'CBD Main Street',
                'priority': 'critical',
                'zone': self.zone.id,
                'assigned_to_user': self.assignee.id,
                'estimated_impact_m3': '125.50',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        incident = Incident.objects.get()
        self.assertEqual(incident.created_by, self.user)
        self.assertEqual(incident.reported_by, self.user.username)
        self.assertEqual(incident.assigned_to_user, self.assignee)
        self.assertEqual(incident.assigned_to, self.assignee.username)
        self.assertEqual(incident.incident_type, 'distribution')
        self.assertEqual(incident.estimated_impact_m3, Decimal('125.50'))

        summary = self.client.get('/api/incidents/incidents/summary/')
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(summary.data['total'], 1)
        self.assertEqual(summary.data['critical_open'], 1)
        self.assertEqual(summary.data['distribution'], 1)

    def test_status_update_resolves_incident_and_records_comment(self):
        incident = Incident.objects.create(
            incident_type='production',
            category='Pump Failure',
            description='Pump tripped',
            location='Kabati',
            production_site=self.production_site,
            reported_by='Operator',
            priority='high',
            created_by=self.user,
        )

        response = self.client.post(
            f'/api/incidents/incidents/{incident.id}/update_status/',
            {
                'status': 'resolved',
                'comment': 'Pump restarted after overload reset.',
                'resolution_notes': 'Electrical overload reset and monitored.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        incident.refresh_from_db()
        self.assertEqual(incident.status, 'resolved')
        self.assertEqual(incident.resolved_by, self.user.username)
        self.assertIsNotNone(incident.resolved_at)
        self.assertEqual(IncidentComment.objects.filter(incident=incident).count(), 1)

    def test_assigned_to_me_returns_only_user_assignments(self):
        mine = Incident.objects.create(
            incident_type='distribution',
            category='Leak',
            description='Assigned leak',
            location='CBD',
            zone=self.zone,
            reported_by='Control Room',
            priority='medium',
            assigned_to_user=self.user,
            created_by=self.user,
        )
        Incident.objects.create(
            incident_type='distribution',
            category='Burst Pipe',
            description='Other assignment',
            location='CBD',
            zone=self.zone,
            reported_by='Control Room',
            priority='medium',
            assigned_to_user=self.assignee,
            created_by=self.user,
        )

        response = self.client.get('/api/incidents/incidents/assigned_to_me/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], mine.id)

    def test_reject_cross_scope_links(self):
        response = self.client.post(
            '/api/incidents/incidents/',
            {
                'type': 'production',
                'category': 'Pump Failure',
                'description': 'Wrong scope link',
                'location': 'CBD',
                'priority': 'medium',
                'zone': self.zone.id,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)

    def test_users_endpoint_supports_me_and_search(self):
        response = self.client.get('/api/incidents/users/me/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['username'], self.user.username)

        response = self.client.get('/api/incidents/users/', {'search': 'field'})
        self.assertEqual(response.status_code, 200)
        usernames = [row['username'] for row in response.data['results']]
        self.assertIn(self.assignee.username, usernames)

# Create your tests here.
