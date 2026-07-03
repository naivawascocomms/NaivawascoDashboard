from django.contrib.auth import get_user_model
from django.db.models import Count
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Incident, IncidentComment
from .serializers import (
    IncidentCommentSerializer,
    IncidentSerializer,
    IncidentStatusUpdateSerializer,
    UserOptionSerializer,
)


class IncidentViewSet(viewsets.ModelViewSet):
    queryset = Incident.objects.select_related(
        'production_site',
        'zone__region',
        'created_by',
        'updated_by',
    ).prefetch_related('comments').annotate(
        comment_count=Count('comments')
    )
    serializer_class = IncidentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = [
        'incident_type', 'status', 'priority', 'category',
        'production_site', 'zone', 'zone__region',
        'reported_at',
    ]
    search_fields = ['category', 'description', 'location', 'reported_by', 'assigned_to']
    ordering_fields = ['reported_at', 'created_at', 'updated_at', 'priority', 'status']
    ordering = ['-reported_at', '-created_at']

    def perform_create(self, serializer):
        serializer.save(
            reported_by=self.request.user.get_username(),
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def create(self, request, *args, **kwargs):
        mobile_external_id = request.data.get('mobile_external_id')
        if mobile_external_id:
            existing = self.get_queryset().filter(mobile_external_id=mobile_external_id).first()
            if existing is not None:
                serializer = self.get_serializer(existing)
                return Response(serializer.data, status=status.HTTP_200_OK)
        return super().create(request, *args, **kwargs)

    def get_queryset(self):
        queryset = super().get_queryset()
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        active = self.request.query_params.get('active')

        if start_date:
            queryset = queryset.filter(reported_at__date__gte=start_date)
        if end_date:
            queryset = queryset.filter(reported_at__date__lte=end_date)
        if active is not None:
            active_value = str(active).lower() in ('1', 'true', 'yes')
            if active_value:
                queryset = queryset.exclude(status=Incident.Status.RESOLVED)
            else:
                queryset = queryset.filter(status=Incident.Status.RESOLVED)
        return queryset

    @action(detail=False, methods=['get'])
    def summary(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        today = timezone.localdate()
        data = {
            'total': queryset.count(),
            'open': queryset.filter(status=Incident.Status.OPEN).count(),
            'in_progress': queryset.filter(status=Incident.Status.IN_PROGRESS).count(),
            'resolved': queryset.filter(status=Incident.Status.RESOLVED).count(),
            'critical_open': queryset.filter(
                priority=Incident.Priority.CRITICAL,
            ).exclude(status=Incident.Status.RESOLVED).count(),
            'overdue': queryset.filter(
                reported_at__date__lt=today,
            ).exclude(status=Incident.Status.RESOLVED).count(),
            'production': queryset.filter(incident_type=Incident.IncidentType.PRODUCTION).count(),
            'distribution': queryset.filter(incident_type=Incident.IncidentType.DISTRIBUTION).count(),
        }
        return Response(data)

    @action(detail=False, methods=['get'])
    def assigned_to_me(self, request):
        queryset = self.filter_queryset(
            self.get_queryset().filter(assigned_to_user=request.user)
        )
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        incident = self.get_object()
        serializer = IncidentStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        old_status = incident.status
        new_status = serializer.validated_data['status']
        incident.status = new_status
        if new_status == Incident.Status.RESOLVED:
            incident.resolved_by = serializer.validated_data.get('resolved_by') or request.user.get_username()
            incident.resolution_notes = serializer.validated_data.get('resolution_notes') or incident.resolution_notes
        else:
            incident.resolved_by = ''
            if new_status != old_status:
                incident.resolution_notes = ''
        incident.updated_by = request.user
        incident.save()

        comment = serializer.validated_data.get('comment', '').strip()
        if comment or old_status != new_status:
            IncidentComment.objects.create(
                incident=incident,
                comment=comment or f'Status changed from {old_status} to {new_status}.',
                status_from=old_status,
                status_to=new_status,
                created_by=request.user,
            )

        output = self.get_serializer(incident)
        return Response(output.data)

    @action(detail=True, methods=['post'])
    def add_comment(self, request, pk=None):
        incident = self.get_object()
        comment = str(request.data.get('comment', '')).strip()
        if not comment:
            return Response({'detail': 'comment is required'}, status=status.HTTP_400_BAD_REQUEST)

        mobile_external_id = request.data.get('mobile_external_id')
        if mobile_external_id:
            existing = IncidentComment.objects.filter(mobile_external_id=mobile_external_id).first()
            if existing is not None:
                serializer = IncidentCommentSerializer(existing)
                return Response(serializer.data, status=status.HTTP_200_OK)

        obj = IncidentComment.objects.create(
            incident=incident,
            comment=comment,
            mobile_external_id=mobile_external_id or None,
            created_by=request.user,
        )
        serializer = IncidentCommentSerializer(obj)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class IncidentCommentViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = IncidentComment.objects.select_related('incident', 'created_by').all()
    serializer_class = IncidentCommentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['incident']


class IncidentUserViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = UserOptionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['username', 'first_name', 'last_name', 'email']
    ordering = ['username']

    def get_queryset(self):
        return get_user_model().objects.filter(is_active=True).order_by('username')

    def _serialize_user(self, user):
        display_name = user.get_full_name() or user.get_username()
        return {
            'id': user.id,
            'username': user.get_username(),
            'display_name': display_name,
            'email': user.email or '',
        }

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        users = page if page is not None else queryset
        data = [self._serialize_user(user) for user in users]
        serializer = self.get_serializer(data, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def me(self, request):
        serializer = self.get_serializer(self._serialize_user(request.user))
        return Response(serializer.data)

