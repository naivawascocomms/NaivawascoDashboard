from django.db.models import Q

from .constants import ASSIGNER_ROLES
from .models import MeterReadingAssignment


def get_user_role(user):
    if not getattr(user, 'is_authenticated', False):
        return None
    profile = getattr(user, 'metering_profile', None)
    return getattr(profile, 'role', None)


def user_has_global_metering_access(user):
    return bool(
        getattr(user, 'is_authenticated', False)
        and (getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False))
    )


def user_can_assign_meter_readings(user):
    if user_has_global_metering_access(user):
        return True
    return get_user_role(user) in ASSIGNER_ROLES


def _active_assignment_filters(reading_date):
    filters = Q(is_active=True)
    if reading_date is not None:
        filters &= (Q(start_date__isnull=True) | Q(start_date__lte=reading_date))
        filters &= (Q(end_date__isnull=True) | Q(end_date__gte=reading_date))
    return filters


def user_can_submit_water_meter_reading(user, water_meter_id, reading_date):
    if user_has_global_metering_access(user):
        return True
    return MeterReadingAssignment.objects.filter(
        _active_assignment_filters(reading_date),
        assignee=user,
        water_meter_id=water_meter_id,
    ).exists()


def user_can_submit_energy_meter_reading(user, energy_meter_id, reading_date):
    if user_has_global_metering_access(user):
        return True
    return MeterReadingAssignment.objects.filter(
        _active_assignment_filters(reading_date),
        assignee=user,
        energy_meter_id=energy_meter_id,
    ).exists()


def assigned_water_meter_ids(user):
    if user_has_global_metering_access(user):
        return None
    return list(
        MeterReadingAssignment.objects.filter(
            assignee=user,
            is_active=True,
            water_meter__isnull=False,
        ).values_list('water_meter_id', flat=True).distinct()
    )


def assigned_energy_meter_ids(user):
    if user_has_global_metering_access(user):
        return None
    return list(
        MeterReadingAssignment.objects.filter(
            assignee=user,
            is_active=True,
            energy_meter__isnull=False,
        ).values_list('energy_meter_id', flat=True).distinct()
    )
