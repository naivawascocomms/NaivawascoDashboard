from django.contrib import admin

from .models import Incident, IncidentComment


class IncidentCommentInline(admin.TabularInline):
    model = IncidentComment
    extra = 0
    readonly_fields = ['created_by', 'created_at']


@admin.register(Incident)
class IncidentAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'incident_type', 'category', 'priority', 'status',
        'location', 'reported_by', 'reported_at', 'assigned_to_user',
    ]
    list_filter = ['incident_type', 'priority', 'status', 'reported_at']
    search_fields = ['category', 'description', 'location', 'reported_by', 'assigned_to']
    autocomplete_fields = ['production_site', 'zone', 'assigned_to_user', 'created_by', 'updated_by']
    readonly_fields = ['created_at', 'updated_at', 'resolved_at']
    inlines = [IncidentCommentInline]


@admin.register(IncidentComment)
class IncidentCommentAdmin(admin.ModelAdmin):
    list_display = ['incident', 'status_from', 'status_to', 'created_by', 'created_at']
    list_filter = ['status_from', 'status_to', 'created_at']
    search_fields = ['comment', 'incident__category']
    autocomplete_fields = ['incident', 'created_by']
    readonly_fields = ['created_at']

# Register your models here.
