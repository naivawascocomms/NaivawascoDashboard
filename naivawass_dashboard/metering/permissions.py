from rest_framework.permissions import BasePermission, SAFE_METHODS

from .access import user_can_assign_meter_readings


class CanManageUsers(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_superuser
        )

    def has_object_permission(self, request, view, obj):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


class CanManageMeterReadingAssignments(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return user_can_assign_meter_readings(request.user)
