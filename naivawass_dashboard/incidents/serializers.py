from rest_framework import serializers

from .models import Incident, IncidentComment


class UserOptionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    display_name = serializers.CharField()
    email = serializers.EmailField(allow_blank=True)


class IncidentCommentSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, allow_null=True)

    class Meta:
        model = IncidentComment
        fields = [
            'id', 'incident', 'comment', 'status_from', 'status_to',
            'created_by', 'created_by_name', 'mobile_external_id', 'created_at',
        ]
        read_only_fields = ['created_by', 'created_by_name', 'created_at']


class IncidentSerializer(serializers.ModelSerializer):
    type = serializers.CharField(source='incident_type')
    production_site_name = serializers.CharField(source='production_site.name', read_only=True, allow_null=True)
    zone_name = serializers.CharField(source='zone.name', read_only=True, allow_null=True)
    zone_region_name = serializers.CharField(source='zone.region.name', read_only=True, allow_null=True)
    assigned_to_user_name = serializers.CharField(source='assigned_to_user.username', read_only=True, allow_null=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, allow_null=True)
    updated_by_name = serializers.CharField(source='updated_by.username', read_only=True, allow_null=True)
    comment_count = serializers.IntegerField(read_only=True)
    comments = IncidentCommentSerializer(many=True, read_only=True)

    class Meta:
        model = Incident
        fields = [
            'id', 'type', 'incident_type', 'category', 'description', 'location',
            'production_site', 'production_site_name', 'zone', 'zone_name', 'zone_region_name',
            'reported_by', 'reported_at', 'priority', 'status',
            'assigned_to_user', 'assigned_to_user_name', 'assigned_to',
            'resolved_by', 'resolved_at', 'resolution_notes', 'estimated_impact_m3',
            'customer_notifications_sent', 'notes', 'created_by', 'created_by_name',
            'updated_by', 'updated_by_name', 'comment_count', 'comments',
            'mobile_external_id', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'reported_by', 'assigned_to', 'created_by', 'created_by_name', 'updated_by', 'updated_by_name',
            'comment_count', 'comments', 'created_at', 'updated_at',
        ]
        extra_kwargs = {
            'incident_type': {'write_only': True, 'required': False},
        }

    def validate(self, attrs):
        incident_type = attrs.get('incident_type')
        if incident_type is None and self.instance is not None:
            incident_type = self.instance.incident_type

        production_site = attrs.get('production_site')
        if production_site is None and self.instance is not None:
            production_site = self.instance.production_site

        zone = attrs.get('zone')
        if zone is None and self.instance is not None:
            zone = self.instance.zone

        if incident_type == Incident.IncidentType.PRODUCTION and zone is not None:
            raise serializers.ValidationError({'zone': 'Distribution zone can only be linked to distribution incidents.'})
        if incident_type == Incident.IncidentType.DISTRIBUTION and production_site is not None:
            raise serializers.ValidationError({'production_site': 'Production site can only be linked to production incidents.'})
        return attrs


class IncidentStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Incident.Status.choices)
    comment = serializers.CharField(required=False, allow_blank=True)
    resolved_by = serializers.CharField(required=False, allow_blank=True)
    resolution_notes = serializers.CharField(required=False, allow_blank=True)


class IncidentSummarySerializer(serializers.Serializer):
    total = serializers.IntegerField()
    open = serializers.IntegerField()
    in_progress = serializers.IntegerField()
    resolved = serializers.IntegerField()
    critical_open = serializers.IntegerField()
    overdue = serializers.IntegerField()
    production = serializers.IntegerField()
    distribution = serializers.IntegerField()
