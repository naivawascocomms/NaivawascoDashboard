import logging
import os
from contextlib import contextmanager
from contextvars import ContextVar

import psycopg
from psycopg.rows import dict_row

from .models import EnergyMeter, MeterReadingAssignment, UserProfile, WaterMeter


logger = logging.getLogger(__name__)
_sync_suspended = ContextVar('mobile_supabase_sync_suspended', default=False)


def mobile_database_url():
    return os.environ.get('MOBILE_SUPABASE_DATABASE_URL', '').strip()


def mobile_sync_enabled():
    return bool(mobile_database_url()) and not _sync_suspended.get()


@contextmanager
def suspend_mobile_sync():
    token = _sync_suspended.set(True)
    try:
        yield
    finally:
        _sync_suspended.reset(token)


@contextmanager
def mobile_connection():
    database_url = mobile_database_url()
    if not database_url:
        raise RuntimeError('MOBILE_SUPABASE_DATABASE_URL is not configured.')
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        yield conn


def run_best_effort(label, callback):
    if not mobile_sync_enabled():
        return False
    try:
        with mobile_connection() as conn:
            with conn.cursor() as cursor:
                callback(cursor)
            conn.commit()
        return True
    except Exception:
        logger.exception('Mobile Supabase sync failed: %s', label)
        return False


def upsert_profile(cursor, profile: UserProfile):
    user = profile.user
    cursor.execute(
        """
        select id
        from auth.users
        where (%s <> '' and lower(email) = lower(%s))
           or raw_user_meta_data->>'username' = %s
        order by created_at
        limit 1
        """,
        [user.email or '', user.email or '', user.username],
    )
    auth_user = cursor.fetchone()
    if not auth_user:
        raise RuntimeError(
            f'Create a matching Supabase Auth user for Django user {user.username} before syncing assignments.'
        )

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


def mobile_profile_id_for_user(cursor, user):
    if user is None:
        return None

    profile = getattr(user, 'metering_profile', None)
    if profile is None:
        raise RuntimeError(f'User {user} does not have a metering profile.')

    upsert_profile(cursor, profile)
    cursor.execute(
        'select id from public.profiles where django_user_id = %s',
        [user.id],
    )
    row = cursor.fetchone()
    if not row:
        raise RuntimeError(f'Mobile profile was not found for Django user {user}.')
    return row['id']


def upsert_meter(cursor, meter, meter_type):
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


def upsert_assignment(cursor, assignment: MeterReadingAssignment):
    profile = getattr(assignment.assignee, 'metering_profile', None)
    if profile is None:
        raise RuntimeError(f'Assignee {assignment.assignee} does not have a metering profile.')
    upsert_profile(cursor, profile)

    if assignment.water_meter_id:
        meter_type = 'WATER'
        meter = assignment.water_meter
    else:
        meter_type = 'ENERGY'
        meter = assignment.energy_meter
    upsert_meter(cursor, meter, meter_type)

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
            meter.id,
            assignment.assignee_id,
        ],
    )


def deactivate_assignment(cursor, assignment_id):
    cursor.execute(
        """
        update public.reading_assignments
        set is_active = false, updated_at = now()
        where django_assignment_id = %s
        """,
        [assignment_id],
    )


def upsert_incident(cursor, incident):
    reporter_user = incident.created_by or incident.assigned_to_user or incident.updated_by
    reporter_profile_id = mobile_profile_id_for_user(cursor, reporter_user)
    assigned_profile_id = mobile_profile_id_for_user(cursor, incident.assigned_to_user)
    resolved_profile_id = None
    if incident.updated_by and incident.status == 'resolved':
        resolved_profile_id = mobile_profile_id_for_user(cursor, incident.updated_by)

    conflict_clause = (
        'on conflict (id) do update set'
        if incident.mobile_external_id
        else 'on conflict (django_incident_id) where django_incident_id is not null do update set'
    )
    cursor.execute(
        f"""
        insert into public.incidents (
            id, django_incident_id, incident_type, category, description, location,
            production_site_id, production_site_name, zone_id, zone_name, zone_region_name,
            reported_by, reported_by_name, assigned_to, assigned_to_name, reported_at,
            priority, status, resolved_by, resolved_by_name, resolved_at,
            resolution_notes, estimated_impact_m3, notes, synced_at
        )
        values (
            coalesce(%s, gen_random_uuid()), %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s, now()
        )
        {conflict_clause}
            django_incident_id = excluded.django_incident_id,
            incident_type = excluded.incident_type,
            category = excluded.category,
            description = excluded.description,
            location = excluded.location,
            production_site_id = excluded.production_site_id,
            production_site_name = excluded.production_site_name,
            zone_id = excluded.zone_id,
            zone_name = excluded.zone_name,
            zone_region_name = excluded.zone_region_name,
            reported_by = excluded.reported_by,
            reported_by_name = excluded.reported_by_name,
            assigned_to = excluded.assigned_to,
            assigned_to_name = excluded.assigned_to_name,
            reported_at = excluded.reported_at,
            priority = excluded.priority,
            status = excluded.status,
            resolved_by = excluded.resolved_by,
            resolved_by_name = excluded.resolved_by_name,
            resolved_at = excluded.resolved_at,
            resolution_notes = excluded.resolution_notes,
            estimated_impact_m3 = excluded.estimated_impact_m3,
            notes = excluded.notes,
            synced_at = now()
        returning id
        """,
        [
            incident.mobile_external_id,
            incident.id,
            incident.incident_type,
            incident.category,
            incident.description,
            incident.location,
            incident.production_site_id,
            incident.production_site.name if incident.production_site_id else None,
            incident.zone_id,
            incident.zone.name if incident.zone_id else None,
            incident.zone.region.name if incident.zone_id and incident.zone.region_id else None,
            reporter_profile_id,
            incident.reported_by or (reporter_user.get_username() if reporter_user else 'Django'),
            assigned_profile_id,
            incident.assigned_to_user.get_full_name() or incident.assigned_to_user.get_username()
            if incident.assigned_to_user_id else incident.assigned_to or None,
            incident.reported_at,
            incident.priority,
            incident.status,
            resolved_profile_id,
            incident.resolved_by or None,
            incident.resolved_at,
            incident.resolution_notes,
            incident.estimated_impact_m3,
            incident.notes,
        ],
    )
    row = cursor.fetchone()
    return row['id'] if row else None


def upsert_incident_comment(cursor, comment):
    incident = comment.incident
    incident_id = upsert_incident(cursor, incident)
    created_by_profile_id = mobile_profile_id_for_user(cursor, comment.created_by)
    conflict_clause = (
        'on conflict (id) do update set'
        if comment.mobile_external_id
        else 'on conflict (django_comment_id) where django_comment_id is not null do update set'
    )
    cursor.execute(
        f"""
        insert into public.incident_comments (
            id, django_comment_id, incident_id, comment, status_from, status_to,
            created_by, created_by_name, synced_at, created_at
        )
        values (
            coalesce(%s, gen_random_uuid()), %s, %s, %s, %s, %s,
            %s, %s, now(), %s
        )
        {conflict_clause}
            django_comment_id = excluded.django_comment_id,
            incident_id = excluded.incident_id,
            comment = excluded.comment,
            status_from = excluded.status_from,
            status_to = excluded.status_to,
            created_by = excluded.created_by,
            created_by_name = excluded.created_by_name,
            synced_at = now()
        returning id
        """,
        [
            comment.mobile_external_id,
            comment.id,
            incident_id,
            comment.comment,
            comment.status_from,
            comment.status_to,
            created_by_profile_id,
            comment.created_by.get_full_name() or comment.created_by.get_username()
            if comment.created_by_id else None,
            comment.created_at,
        ],
    )
    row = cursor.fetchone()
    return row['id'] if row else None


def push_profile(profile):
    return run_best_effort(
        f'profile {profile.pk}',
        lambda cursor: upsert_profile(cursor, profile),
    )


def push_meter(meter):
    if isinstance(meter, WaterMeter):
        meter_type = 'WATER'
    elif isinstance(meter, EnergyMeter):
        meter_type = 'ENERGY'
    else:
        raise TypeError('meter must be a WaterMeter or EnergyMeter')
    return run_best_effort(
        f'{meter_type.lower()} meter {meter.pk}',
        lambda cursor: upsert_meter(cursor, meter, meter_type),
    )


def push_assignment(assignment):
    return run_best_effort(
        f'assignment {assignment.pk}',
        lambda cursor: upsert_assignment(cursor, assignment),
    )


def remove_assignment(assignment_id):
    return run_best_effort(
        f'assignment delete {assignment_id}',
        lambda cursor: deactivate_assignment(cursor, assignment_id),
    )


def push_incident(incident):
    return run_best_effort(
        f'incident {incident.pk}',
        lambda cursor: upsert_incident(cursor, incident),
    )


def push_incident_comment(comment):
    return run_best_effort(
        f'incident comment {comment.pk}',
        lambda cursor: upsert_incident_comment(cursor, comment),
    )


def push_reading_status(reading, meter_type):
    if not reading.mobile_external_id:
        return False
    status = 'validated' if reading.is_validated else 'submitted'
    return run_best_effort(
        f'{meter_type.lower()} reading status {reading.pk}',
        lambda cursor: cursor.execute(
            """
            update public.meter_readings
            set status = %s,
                django_reading_id = %s,
                updated_at = now()
            where id = %s
            """,
            [status, reading.pk, reading.mobile_external_id],
        ),
    )
