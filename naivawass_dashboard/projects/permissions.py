from rest_framework import permissions

from .models import Visibility


PROJECTS_TEAM_GROUPS = {'Projects Team', 'Project Team', 'Projects', 'projects_team'}


def is_projects_team_user(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_staff or user.is_superuser:
        return True
    return user.groups.filter(name__in=PROJECTS_TEAM_GROUPS).exists()


class ProjectsTeamWritePermission(permissions.BasePermission):
    """Authenticated users may read curated data; project workspace writes need project-team access."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_projects_team_user(request.user)


class ProjectsTeamOnlyPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        return is_projects_team_user(request.user)


class ProjectVisibilityPermission(permissions.BasePermission):
    """Prevent direct retrieval of internal workspace records by non-project-team users."""

    def has_object_permission(self, request, view, obj):
        visibility = getattr(obj, 'visibility', None)
        if visibility == Visibility.INTERNAL:
            return is_projects_team_user(request.user)
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_projects_team_user(request.user)


def visible_to_user(queryset, user):
    if is_projects_team_user(user):
        return queryset
    return queryset.exclude(visibility=Visibility.INTERNAL)
