import os
import json
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import psycopg
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from psycopg.rows import dict_row

from incidents.models import Incident, IncidentComment
from metering.mobile_supabase import suspend_mobile_sync, upsert_incident, upsert_incident_comment
from metering.models import (
    EnergyMeter,
    EnergyMeterReading,
    MeterReadingAssignment,
    UserProfile,
    WaterMeter,
    WaterMeterReading,
)
from production.models import ProductionSite
from distribution.models import Zone


User = get_user_model()


class Command(BaseCommand):
    help = 'Push reference data to the mobile Supabase project and pull submitted mobile readings/incidents into Django.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--database-url',
            default=os.environ.get('MOBILE_SUPABASE_DATABASE_URL', ''),
            help='Postgres connection string for the separate mobile Supabase project.',
        )
        parser.add_argument('--push-reference-data', action='store_true')
        parser.add_argument('--pull-submissions', action='store_true')
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument(
            '--loop',
            action='store_true',
            help='Keep syncing on an interval. Use this for local production deployments.',
        )
        parser.add_argument(
            '--interval',
            type=int,
            default=15,
            help='Seconds between sync runs when --loop is used.',
        )
        parser.add_argument(
            '--create-missing-auth-users',
            action='store_true',
            help='Create missing Supabase Auth users for active Django metering profiles before pushing profiles.',
        )
        parser.add_argument(
            '--default-mobile-password',
            default=os.environ.get('MOBILE_SUPABASE_DEFAULT_PASSWORD', ''),
            help='Temporary password used with --create-missing-auth-users.',
        )
        parser.add_argument(
            '--supabase-url',
            default=os.environ.get('MOBILE_SUPABASE_URL', ''),
            help='Mobile Supabase project URL, required when creating Auth users.',
        )
        parser.add_argument(
            '--service-role-key',
            default=os.environ.get('MOBILE_SUPABASE_SERVICE_ROLE_KEY', ''),
            help='Mobile Supabase service-role key, required when creating Auth users.',
        )

    def handle(self, *args, **options):
        database_url = options['database_url'].strip()
        if not database_url:
            raise CommandError('MOBILE_SUPABASE_DATABASE_URL or --database-url is required.')
        if not (options['push_reference_data'] or options['pull_submissions']):
            raise CommandError('Choose --push-reference-data, --pull-submissions, or both.')

        if options['loop']:
            self.stdout.write(self.style.SUCCESS(
                f"Mobile Supabase sync loop started. Interval: {options['interval']} seconds."
            ))
            while True:
                try:
                    self.sync_once(database_url, options)
                except CommandError as exc:
                    self.stderr.write(self.style.WARNING(f'Mobile Supabase sync failed: {exc}'))
                time.sleep(max(options['interval'], 5))
        else:
            self.sync_once(database_url, options)

    def sync_once(self, database_url, options):
        try:
            with psycopg.connect(database_url, row_factory=dict_row) as conn:
                with conn.cursor() as cursor:
                    if options['push_reference_data']:
                        self.push_reference_data(
                            cursor,
                            dry_run=options['dry_run'],
                            create_missing_auth_users=options['create_missing_auth_users'],
                            default_mobile_password=options['default_mobile_password'],
                            supabase_url=options['supabase_url'],
                            service_role_key=options['service_role_key'],
                        )
                    if options['pull_submissions']:
                        self.pull_submissions(cursor, dry_run=options['dry_run'])

                if options['dry_run']:
                    conn.rollback()
                else:
                    conn.commit()
        except psycopg.OperationalError as exc:
            raise CommandError(
                'Could not connect to the mobile Supabase database. If you are using '
                'Supabase Cloud from an IPv4-only network, use the Supabase connection '
                'pooler URL for MOBILE_SUPABASE_DATABASE_URL instead of the direct '
                f'db.<project-ref>.supabase.co URL. Original error: {exc}'
            ) from exc

    def push_reference_data(
        self,
        cursor,
        dry_run=False,
        create_missing_auth_users=False,
        default_mobile_password='',
        supabase_url='',
        service_role_key='',
    ):
        profile_count = self.push_profiles(
            cursor,
            create_missing_auth_users=create_missing_auth_users,
            default_mobile_password=default_mobile_password,
            supabase_url=supabase_url,
            service_role_key=service_role_key,
        )
        meter_count = self.push_meters(cursor)
        assignment_count = self.push_assignments(cursor)
        incident_count = self.push_incidents(cursor)
        comment_count = self.push_incident_comments(cursor)
        suffix = ' (dry run)' if dry_run else ''
        self.stdout.write(self.style.SUCCESS(
            f'Pushed {profile_count} profiles, {meter_count} meters, {assignment_count} assignments, '
            f'{incident_count} incidents, {comment_count} incident comments{suffix}.'
        ))

    def push_profiles(
        self,
        cursor,
        create_missing_auth_users=False,
        default_mobile_password='',
        supabase_url='',
        service_role_key='',
    ):
        count = 0
        profiles = UserProfile.objects.select_related('user').filter(user__is_active=True)
        for profile in profiles:
            user = profile.user
            if create_missing_auth_users:
                if not default_mobile_password:
                    raise CommandError('--default-mobile-password or MOBILE_SUPABASE_DEFAULT_PASSWORD is required.')
                if not supabase_url or not service_role_key:
                    raise CommandError(
                        '--supabase-url and --service-role-key, or MOBILE_SUPABASE_URL and '
                        'MOBILE_SUPABASE_SERVICE_ROLE_KEY, are required to create Auth users.'
                    )
                self.ensure_auth_user(user, default_mobile_password, supabase_url, service_role_key)

            cursor.execute(self.auth_user_select_sql(), [user.email or '', user.email or '', user.username])
            auth_user = cursor.fetchone()
            if not auth_user:
                self.stdout.write(self.style.WARNING(
                    f'Skipped {user.username}: create matching Supabase Auth user first.'
                ))
                continue

            cursor.execute(
                """
                insert into public.profiles (
                    id, django_user_id, username, full_name, role, phone_number, is_active
                )
                values (%s, %s, %s, %s, %s, %s, %s)
                on conflict (id) do update set
                    django_user_id = excluded.django_user_id,
                    username = excluded.username,
                    full_name = excluded.full_name,
                    role = excluded.role,
                    phone_number = excluded.phone_number,
                    is_active = excluded.is_active
                """,
                [
                    auth_user['id'],
                    user.id,
                    user.username,
                    user.get_full_name() or user.username,
                    profile.role,
                    profile.phone_number,
                    user.is_active,
                ],
            )
            count += 1
        return count

    def auth_user_select_sql(self):
        return """
            select id
            from auth.users
            where (%s <> '' and lower(email) = lower(%s))
               or raw_user_meta_data->>'username' = %s
            order by created_at
            limit 1
        """

    def ensure_auth_user(self, user, default_mobile_password, supabase_url, service_role_key):
        email = user.email or f'{user.username}@naivawasco.local'
        full_name = user.get_full_name() or user.username
        base_url = supabase_url.rstrip('/')
        payload = json.dumps({
            'email': email,
            'password': default_mobile_password,
            'email_confirm': True,
            'user_metadata': {
                'username': user.username,
                'full_name': full_name,
            },
        }).encode('utf-8')
        headers = {
            'apikey': service_role_key,
            'Authorization': f'Bearer {service_role_key}',
            'Content-Type': 'application/json',
        }

        request = Request(
            f'{base_url}/auth/v1/admin/users',
            data=payload,
            headers=headers,
            method='POST',
        )
        try:
            with urlopen(request, timeout=30):
                return
        except HTTPError as exc:
            body = exc.read().decode('utf-8', errors='replace')
            if exc.code != 422 and 'already' not in body.lower():
                raise CommandError(f'Could not create mobile Auth user {email}: {exc.code} {body}') from exc

        patch_payload = json.dumps({
            'password': default_mobile_password,
            'email_confirm': True,
            'user_metadata': {
                'username': user.username,
                'full_name': full_name,
            },
        }).encode('utf-8')
        patch_request = Request(
            f'{base_url}/auth/v1/admin/users?email={email}',
            data=patch_payload,
            headers=headers,
            method='PUT',
        )
        try:
            with urlopen(patch_request, timeout=30):
                return
        except HTTPError:
            # Existing users are acceptable; the profile sync below maps by email/username.
            return

    def push_meters(self, cursor):
        count = 0
        for meter_type, queryset in [
            ('WATER', WaterMeter.objects.all()),
            ('ENERGY', EnergyMeter.objects.all()),
        ]:
            for meter in queryset:
                cursor.execute(
                    """
                    insert into public.meters (
                        django_meter_id, meter_type, meter_number, display_name,
                        initial_reading, is_active
                    )
                    values (%s, %s, %s, %s, %s, %s)
                    on conflict (meter_type, django_meter_id) do update set
                        meter_number = excluded.meter_number,
                        display_name = excluded.display_name,
                        initial_reading = excluded.initial_reading,
                        is_active = excluded.is_active
                    """,
                    [
                        meter.id,
                        meter_type,
                        meter.meter_number,
                        meter.display_name,
                        meter.initial_reading,
                        meter.is_active,
                    ],
                )
                count += 1
        return count

    def push_assignments(self, cursor):
        count = 0
        assignments = MeterReadingAssignment.objects.select_related(
            'assignee', 'production_site', 'zone', 'water_meter', 'energy_meter'
        ).filter(is_active=True)

        for assignment in assignments:
            meter_type = 'WATER' if assignment.water_meter_id else 'ENERGY'
            django_meter_id = assignment.water_meter_id or assignment.energy_meter_id
            cursor.execute(
                """
                insert into public.reading_assignments (
                    django_assignment_id, assignee_id, meter_id, scope_type,
                    production_site_id, production_site_name, zone_id, zone_name,
                    start_date, end_date, is_active, notes
                )
                select
                    %s, profile.id, meter.id, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s
                from public.profiles profile
                join public.meters meter
                  on meter.meter_type = %s
                 and meter.django_meter_id = %s
                where profile.django_user_id = %s
                on conflict (django_assignment_id) do update set
                    assignee_id = excluded.assignee_id,
                    meter_id = excluded.meter_id,
                    scope_type = excluded.scope_type,
                    production_site_id = excluded.production_site_id,
                    production_site_name = excluded.production_site_name,
                    zone_id = excluded.zone_id,
                    zone_name = excluded.zone_name,
                    start_date = excluded.start_date,
                    end_date = excluded.end_date,
                    is_active = excluded.is_active,
                    notes = excluded.notes
                """,
                [
                    assignment.id,
                    assignment.scope_type,
                    assignment.production_site_id,
                    assignment.production_site.name if assignment.production_site_id else None,
                    assignment.zone_id,
                    assignment.zone.name if assignment.zone_id else None,
                    assignment.start_date,
                    assignment.end_date,
                    assignment.is_active,
                    assignment.notes,
                    meter_type,
                    django_meter_id,
                    assignment.assignee_id,
                ],
            )
            if cursor.rowcount:
                count += 1
        return count

    def push_incidents(self, cursor):
        count = 0
        incidents = Incident.objects.select_related(
            'production_site',
            'zone__region',
            'assigned_to_user',
            'created_by',
            'updated_by',
        ).exclude(status=Incident.Status.RESOLVED)
        for incident in incidents:
            upsert_incident(cursor, incident)
            count += 1
        return count

    def push_incident_comments(self, cursor):
        count = 0
        comments = IncidentComment.objects.select_related(
            'incident__production_site',
            'incident__zone__region',
            'incident__assigned_to_user',
            'incident__created_by',
            'incident__updated_by',
            'created_by',
        ).filter(incident__status__in=[Incident.Status.OPEN, Incident.Status.IN_PROGRESS])
        for comment in comments:
            upsert_incident_comment(cursor, comment)
            count += 1
        return count

    def pull_submissions(self, cursor, dry_run=False):
        with suspend_mobile_sync():
            with transaction.atomic():
                readings = self.pull_meter_readings(cursor, dry_run=dry_run)
                incidents = self.pull_incidents(cursor, dry_run=dry_run)
                comments = self.pull_incident_comments(cursor, dry_run=dry_run)
                if dry_run:
                    transaction.set_rollback(True)

        suffix = ' (dry run)' if dry_run else ''
        self.stdout.write(self.style.SUCCESS(
            f'Pulled {readings} readings, {incidents} incidents, {comments} comments{suffix}.'
        ))

    def pull_meter_readings(self, cursor, dry_run=False):
        cursor.execute(
            """
            select
                reading.*,
                meter.django_meter_id,
                profile.django_user_id,
                profile.username,
                profile.full_name
            from public.meter_readings reading
            join public.meters meter on meter.id = reading.meter_id
            left join public.profiles profile on profile.id = reading.assignee_id
            where reading.synced_at is null
            order by reading.created_at
            """
        )
        count = 0
        for row in cursor.fetchall():
            user = User.objects.filter(id=row['django_user_id']).first() if row['django_user_id'] else None
            read_by = row['full_name'] or row['username'] or (user.get_username() if user else '')
            model = WaterMeterReading if row['meter_type'] == 'WATER' else EnergyMeterReading
            meter_model = WaterMeter if row['meter_type'] == 'WATER' else EnergyMeter
            meter_field = 'water_meter' if row['meter_type'] == 'WATER' else 'energy_meter'
            meter = meter_model.objects.filter(id=row['django_meter_id']).first()
            if meter is None:
                self.stdout.write(self.style.WARNING(
                    f"Skipped mobile reading {row['id']}: Django meter was not found."
                ))
                continue

            existing = model.objects.filter(mobile_external_id=row['id']).first()
            if existing is None:
                existing = model.objects.filter(**{meter_field: meter, 'reading_date': row['reading_date']}).first()
            if existing and existing.is_validated:
                django_id = existing.id
            else:
                defaults = {
                    meter_field: meter,
                    'submitted_by': user,
                    'reading_date': row['reading_date'],
                    'reading_time': row['reading_time'],
                    'current_reading': row['current_reading'],
                    'previous_reading': row['previous_reading'],
                    'read_by': read_by,
                    'reading_method': row['reading_method'],
                    'notes': row['notes'] or '',
                    'mobile_external_id': row['id'],
                }
                if existing:
                    for key, value in defaults.items():
                        setattr(existing, key, value)
                    existing.save()
                    obj = existing
                else:
                    obj = model.objects.create(**defaults)
                django_id = obj.id
                count += 1

            if not dry_run:
                cursor.execute(
                    'update public.meter_readings set synced_at = now(), django_reading_id = %s where id = %s',
                    [django_id, row['id']],
                )
        return count

    def pull_incidents(self, cursor, dry_run=False):
        cursor.execute(
            """
            select
                incident.*,
                reporter.django_user_id as reporter_django_user_id,
                assignee.django_user_id as assignee_django_user_id
            from public.incidents incident
            left join public.profiles reporter on reporter.id = incident.reported_by
            left join public.profiles assignee on assignee.id = incident.assigned_to
            where incident.synced_at is null
            order by incident.created_at
            """
        )
        count = 0
        for row in cursor.fetchall():
            created_by = User.objects.filter(id=row['reporter_django_user_id']).first() if row['reporter_django_user_id'] else None
            assigned_to = User.objects.filter(id=row['assignee_django_user_id']).first() if row['assignee_django_user_id'] else None
            production_site = ProductionSite.objects.filter(id=row['production_site_id']).first() if row['production_site_id'] else None
            zone = Zone.objects.filter(id=row['zone_id']).first() if row['zone_id'] else None
            defaults = {
                'incident_type': row['incident_type'],
                'category': row['category'],
                'description': row['description'],
                'location': row['location'],
                'production_site': production_site,
                'zone': zone,
                'reported_by': row['reported_by_name'] or (created_by.get_username() if created_by else 'mobile'),
                'reported_at': row['reported_at'],
                'priority': row['priority'],
                'status': row['status'],
                'assigned_to_user': assigned_to,
                'resolved_by': row['resolved_by_name'] or '',
                'resolved_at': row['resolved_at'],
                'resolution_notes': row['resolution_notes'] or '',
                'estimated_impact_m3': row['estimated_impact_m3'],
                'notes': row['notes'] or '',
                'created_by': created_by,
                'updated_by': created_by,
            }

            obj = None
            if row['django_incident_id']:
                obj = Incident.objects.filter(id=row['django_incident_id']).first()
            if obj is None:
                obj = Incident.objects.filter(mobile_external_id=row['id']).first()

            if obj:
                for key, value in defaults.items():
                    setattr(obj, key, value)
                obj.mobile_external_id = row['id']
                obj.save()
                created = False
            else:
                obj = Incident.objects.create(mobile_external_id=row['id'], **defaults)
                created = True
            count += int(created)
            if not dry_run:
                cursor.execute(
                    'update public.incidents set synced_at = now(), django_incident_id = %s where id = %s',
                    [obj.id, row['id']],
                )
        return count

    def pull_incident_comments(self, cursor, dry_run=False):
        cursor.execute(
            """
            select
                comment.*,
                profile.django_user_id,
                incident.django_incident_id
            from public.incident_comments comment
            join public.incidents incident on incident.id = comment.incident_id
            left join public.profiles profile on profile.id = comment.created_by
            where comment.synced_at is null
            order by comment.created_at
            """
        )
        count = 0
        for row in cursor.fetchall():
            incident = Incident.objects.filter(id=row['django_incident_id']).first() if row['django_incident_id'] else None
            if incident is None:
                self.stdout.write(self.style.WARNING(
                    f"Skipped mobile comment {row['id']}: synced Django incident was not found."
                ))
                continue
            created_by = User.objects.filter(id=row['django_user_id']).first() if row['django_user_id'] else None
            defaults = {
                'incident': incident,
                'comment': row['comment'],
                'status_from': row['status_from'] or '',
                'status_to': row['status_to'] or '',
                'created_by': created_by,
            }
            obj = None
            if row['django_comment_id']:
                obj = IncidentComment.objects.filter(id=row['django_comment_id']).first()
            if obj is None:
                obj = IncidentComment.objects.filter(mobile_external_id=row['id']).first()
            if obj:
                for key, value in defaults.items():
                    setattr(obj, key, value)
                obj.mobile_external_id = row['id']
                obj.save()
                created = False
            else:
                obj = IncidentComment.objects.create(mobile_external_id=row['id'], **defaults)
                created = True
            count += int(created)
            if not dry_run:
                cursor.execute(
                    'update public.incident_comments set synced_at = now(), django_comment_id = %s where id = %s',
                    [obj.id, row['id']],
                )
        return count
