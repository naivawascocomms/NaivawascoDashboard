from rest_framework.permissions import BasePermission, SAFE_METHODS

from .access import user_can_assign_meter_readings


class CanManageMeterReadingAssignments(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return user_can_assign_meter_readings(request.user)
