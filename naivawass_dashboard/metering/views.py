from django.contrib.auth import get_user_model
from django.db import models
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from django.utils.dateparse import parse_date

from .access import assigned_energy_meter_ids, assigned_water_meter_ids, user_can_assign_meter_readings
from .models import (
    DistributionWaterMeterAssignment,
    EnergyMeter,
    EnergyMeterReading,
    MeterReadingAssignment,
    ProductionEnergyMeterAssignment,
    ProductionWaterMeterAssignment,
    UserProfile,
    WaterMeter,
    WaterMeterReading,
)
from .permissions import CanManageMeterReadingAssignments
from .serializers import (
    DistributionWaterMeterAssignmentSerializer,
    EnergyMeterReadingCreateSerializer,
    EnergyMeterReadingSerializer,
    EnergyMeterSerializer,
    MeterReadingAssignmentSerializer,
    ProductionEnergyMeterAssignmentSerializer,
    ProductionWaterMeterAssignmentSerializer,
    UserProfileSerializer,
    WaterMeterReadingCreateSerializer,
    WaterMeterReadingSerializer,
    WaterMeterSerializer,
)

User = get_user_model()


class WaterMeterViewSet(viewsets.ModelViewSet):
    queryset = WaterMeter.objects.all()
    serializer_class = WaterMeterSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['meter_number', 'display_name', 'manufacturer', 'model']
    ordering = ['meter_number']

    def get_queryset(self):
        queryset = super().get_queryset()
        meter_ids = assigned_water_meter_ids(self.request.user)
        if meter_ids is None:
            return queryset
        return queryset.filter(id__in=meter_ids)


class EnergyMeterViewSet(viewsets.ModelViewSet):
    queryset = EnergyMeter.objects.all()
    serializer_class = EnergyMeterSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['energy_kind', 'is_active']
    search_fields = ['meter_number', 'display_name', 'manufacturer', 'model']
    ordering = ['meter_number']

    def get_queryset(self):
        queryset = super().get_queryset()
        meter_ids = assigned_energy_meter_ids(self.request.user)
        if meter_ids is None:
            return queryset
        return queryset.filter(id__in=meter_ids)


class UserProfileViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = UserProfile.objects.select_related('user').all()
    serializer_class = UserProfileSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['role', 'user__is_active']
    search_fields = ['user__username', 'user__first_name', 'user__last_name']
    ordering = ['user__username']

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.is_staff or user.is_superuser or user_can_assign_meter_readings(user):
            return queryset
        return queryset.filter(user=user)

    @action(detail=False, methods=['get'])
    def me(self, request):
        profile, _ = UserProfile.objects.get_or_create(
            user=request.user,
            defaults={'role': 'PRODUCTION_SUPERVISOR' if (request.user.is_staff or request.user.is_superuser) else 'PUMP_OPERATOR'},
        )
        serializer = self.get_serializer(profile)
        return Response(serializer.data)


class WaterMeterReadingViewSet(viewsets.ModelViewSet):
    queryset = WaterMeterReading.objects.select_related('water_meter').all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['water_meter', 'reading_date', 'is_validated', 'is_anomaly']
    ordering = ['-reading_date', '-reading_time']

    def get_queryset(self):
        queryset = super().get_queryset()
        meter_ids = assigned_water_meter_ids(self.request.user)
        if meter_ids is None:
            return queryset
        return queryset.filter(water_meter_id__in=meter_ids)

    def get_serializer_class(self):
        if self.action == 'create':
            return WaterMeterReadingCreateSerializer
        return WaterMeterReadingSerializer

    def perform_create(self, serializer):
        serializer.save(submitted_by=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reading = serializer.save(submitted_by=request.user)
        response_serializer = WaterMeterReadingSerializer(reading, context={'request': request})
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def bulk_create(self, request):
        serializer = WaterMeterReadingCreateSerializer(
            data=request.data,
            many=True,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        readings = serializer.save(submitted_by=request.user)
        response_serializer = WaterMeterReadingSerializer(readings, many=True, context={'request': request})
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def submit(self, request):
        """Mobile-friendly idempotent reading submission."""
        serializer = WaterMeterReadingCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        reading = serializer.save(submitted_by=request.user)
        response_serializer = WaterMeterReadingSerializer(reading, context={'request': request})
        return Response(response_serializer.data, status=status.HTTP_200_OK)


class EnergyMeterReadingViewSet(viewsets.ModelViewSet):
    queryset = EnergyMeterReading.objects.select_related('energy_meter').all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['energy_meter', 'reading_date', 'is_validated', 'is_anomaly']
    ordering = ['-reading_date', '-reading_time']

    def get_queryset(self):
        queryset = super().get_queryset()
        meter_ids = assigned_energy_meter_ids(self.request.user)
        if meter_ids is None:
            return queryset
        return queryset.filter(energy_meter_id__in=meter_ids)

    def get_serializer_class(self):
        if self.action == 'create':
            return EnergyMeterReadingCreateSerializer
        return EnergyMeterReadingSerializer

    def perform_create(self, serializer):
        serializer.save(submitted_by=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reading = serializer.save(submitted_by=request.user)
        response_serializer = EnergyMeterReadingSerializer(reading, context={'request': request})
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def bulk_create(self, request):
        serializer = EnergyMeterReadingCreateSerializer(
            data=request.data,
            many=True,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        readings = serializer.save(submitted_by=request.user)
        response_serializer = EnergyMeterReadingSerializer(readings, many=True, context={'request': request})
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def submit(self, request):
        """Mobile-friendly idempotent reading submission."""
        serializer = EnergyMeterReadingCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        reading = serializer.save(submitted_by=request.user)
        response_serializer = EnergyMeterReadingSerializer(reading, context={'request': request})
        return Response(response_serializer.data, status=status.HTTP_200_OK)


class ProductionWaterMeterAssignmentViewSet(viewsets.ModelViewSet):
    queryset = ProductionWaterMeterAssignment.objects.select_related(
        'water_meter', 'production_site', 'water_source'
    ).all()
    serializer_class = ProductionWaterMeterAssignmentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['production_site', 'production_site__region', 'assignment_role', 'is_active']


class ProductionEnergyMeterAssignmentViewSet(viewsets.ModelViewSet):
    queryset = ProductionEnergyMeterAssignment.objects.select_related(
        'energy_meter', 'production_site'
    ).all()
    serializer_class = ProductionEnergyMeterAssignmentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['production_site', 'production_site__region', 'assignment_role', 'is_active']


class DistributionWaterMeterAssignmentViewSet(viewsets.ModelViewSet):
    queryset = DistributionWaterMeterAssignment.objects.select_related(
        'water_meter', 'zone__region', 'dma__zone__region'
    ).all()
    serializer_class = DistributionWaterMeterAssignmentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['zone', 'zone__region', 'dma', 'assignment_role', 'is_active']


class MeterReadingAssignmentViewSet(viewsets.ModelViewSet):
    queryset = MeterReadingAssignment.objects.select_related(
        'assignee',
        'assigned_by',
        'approval_delegate',
        'production_site',
        'zone',
        'water_meter',
        'energy_meter',
    ).all()
    serializer_class = MeterReadingAssignmentSerializer
    permission_classes = [CanManageMeterReadingAssignments]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['assignee', 'scope_type', 'production_site', 'zone', 'is_active']
    ordering = ['assignee__username', 'scope_type', 'production_site__name', 'zone__name']

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.is_staff or user.is_superuser or user_can_assign_meter_readings(user):
            scoped_queryset = queryset
        else:
            scoped_queryset = queryset.filter(assignee=user)

        date_param = self.request.query_params.get('reading_date')
        if not date_param:
            return scoped_queryset

        reading_date = parse_date(date_param)
        if reading_date is None:
            return scoped_queryset.none()

        return scoped_queryset.filter(
            models.Q(start_date__isnull=True) | models.Q(start_date__lte=reading_date),
            models.Q(end_date__isnull=True) | models.Q(end_date__gte=reading_date),
        )

    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save()

    def _scoped_approval_assignments(self, request, reading_date=None, filters_override=None):
        queryset = MeterReadingAssignment.objects.select_related(
            'assignee',
            'assigned_by',
            'approval_delegate',
            'production_site',
            'zone',
            'water_meter',
            'energy_meter',
        ).filter(is_active=True)

        user = request.user
        if not (user.is_staff or user.is_superuser):
            queryset = queryset.filter(
                models.Q(assigned_by=user) | models.Q(approval_delegate=user)
            )

        if reading_date is not None:
            queryset = queryset.filter(
                models.Q(start_date__isnull=True) | models.Q(start_date__lte=reading_date),
                models.Q(end_date__isnull=True) | models.Q(end_date__gte=reading_date),
            )

        params = filters_override or request.query_params
        assignee = params.get('assignee')
        scope_type = params.get('scope_type')
        production_site = params.get('production_site')
        zone = params.get('zone')

        if assignee:
            queryset = queryset.filter(assignee_id=assignee)
        if scope_type:
            queryset = queryset.filter(scope_type=scope_type)
        if production_site:
            queryset = queryset.filter(production_site_id=production_site)
        if zone:
            queryset = queryset.filter(zone_id=zone)

        return queryset

    def _assignment_readings(self, assignment, reading_date=None):
        if assignment.water_meter_id:
            queryset = WaterMeterReading.objects.filter(
                water_meter_id=assignment.water_meter_id,
                is_validated=False,
            )
            if reading_date is not None:
                queryset = queryset.filter(reading_date=reading_date)
            return 'WATER', queryset.order_by('reading_date', 'reading_time')

        if assignment.energy_meter_id:
            queryset = EnergyMeterReading.objects.filter(
                energy_meter_id=assignment.energy_meter_id,
                is_validated=False,
            )
            if reading_date is not None:
                queryset = queryset.filter(reading_date=reading_date)
            return 'ENERGY', queryset.order_by('reading_date', 'reading_time')

        return None, []

    def _approval_item(self, assignment, reading_type, reading):
        meter = assignment.water_meter if reading_type == 'WATER' else assignment.energy_meter
        return {
            'assignment_id': assignment.id,
            'reading_type': reading_type,
            'reading_id': reading.id,
            'reading_date': reading.reading_date,
            'reading_time': reading.reading_time,
            'current_reading': reading.current_reading,
            'previous_reading': reading.previous_reading,
            'consumption': reading.consumption,
            'meter_id': meter.id,
            'meter_number': meter.meter_number,
            'meter_label': meter.display_label,
            'assignee': {
                'id': assignment.assignee_id,
                'username': assignment.assignee.username,
                'full_name': assignment.assignee.get_full_name() or assignment.assignee.username,
            },
            'assigned_by': {
                'id': assignment.assigned_by_id,
                'username': assignment.assigned_by.username,
                'full_name': assignment.assigned_by.get_full_name() or assignment.assigned_by.username,
            },
            'approval_delegate': None if assignment.approval_delegate_id is None else {
                'id': assignment.approval_delegate_id,
                'username': assignment.approval_delegate.username,
                'full_name': assignment.approval_delegate.get_full_name() or assignment.approval_delegate.username,
            },
            'scope_type': assignment.scope_type,
            'production_site': assignment.production_site_id,
            'production_site_name': assignment.production_site.name if assignment.production_site_id else None,
            'zone': assignment.zone_id,
            'zone_name': assignment.zone.name if assignment.zone_id else None,
            'submitted_by_username': reading.submitted_by.username if reading.submitted_by_id else '',
            'read_by': reading.read_by,
            'notes': reading.notes,
        }

    def _pending_approval_items(self, request, reading_date=None, filters_override=None):
        items = []
        seen = set()
        for assignment in self._scoped_approval_assignments(request, reading_date, filters_override):
            reading_type, readings = self._assignment_readings(assignment, reading_date)
            if reading_type is None:
                continue
            for reading in readings:
                key = (reading_type, reading.id)
                if key in seen:
                    continue
                seen.add(key)
                items.append(self._approval_item(assignment, reading_type, reading))
        return sorted(items, key=lambda item: (item['reading_date'], item['meter_label']))

    def _validate_approval_item(self, item, user):
        model = WaterMeterReading if item['reading_type'] == 'WATER' else EnergyMeterReading
        reading = model.objects.get(id=item['reading_id'])
        if reading.is_validated:
            return False
        reading.is_validated = True
        reading.validated_by = user.get_full_name() or user.username
        reading.validated_at = timezone.now()
        reading.save(update_fields=['is_validated', 'validated_by', 'validated_at', 'updated_at'])
        return True

    @action(detail=False, methods=['get'])
    def pending_approvals(self, request):
        if not user_can_assign_meter_readings(request.user):
            return Response({'count': 0, 'results': []})

        date_param = request.query_params.get('reading_date')
        reading_date = parse_date(date_param) if date_param else None
        if date_param and reading_date is None:
            return Response({'detail': 'reading_date must be a valid YYYY-MM-DD value'}, status=status.HTTP_400_BAD_REQUEST)

        items = self._pending_approval_items(request, reading_date)
        return Response({'count': len(items), 'results': items})

    @action(detail=False, methods=['post'])
    def approve_reading(self, request):
        reading_type = request.data.get('reading_type')
        reading_id = request.data.get('reading_id')
        if reading_type not in {'WATER', 'ENERGY'} or not reading_id:
            return Response({'detail': 'reading_type and reading_id are required.'}, status=status.HTTP_400_BAD_REQUEST)

        items = self._pending_approval_items(request)
        item = next(
            (
                candidate for candidate in items
                if candidate['reading_type'] == reading_type and str(candidate['reading_id']) == str(reading_id)
            ),
            None,
        )
        if item is None:
            return Response({'detail': 'No pending approval found for this reading.'}, status=status.HTTP_404_NOT_FOUND)

        self._validate_approval_item(item, request.user)
        return Response({'approved': 1, 'reading': item})

    @action(detail=False, methods=['post'])
    def bulk_approve(self, request):
        date_param = request.data.get('reading_date')
        reading_date = parse_date(date_param) if date_param else None
        if date_param and reading_date is None:
            return Response({'detail': 'reading_date must be a valid YYYY-MM-DD value'}, status=status.HTTP_400_BAD_REQUEST)

        filters_override = {}
        for field in ['assignee', 'scope_type', 'production_site', 'zone']:
            value = request.data.get(field)
            if value not in [None, '']:
                filters_override[field] = value

        items = self._pending_approval_items(request, reading_date, filters_override)
        approved = 0
        for item in items:
            if self._validate_approval_item(item, request.user):
                approved += 1
        return Response({'approved': approved, 'count': len(items)})

    @action(detail=True, methods=['post'])
    def delegate_approval(self, request, pk=None):
        assignment = self.get_object()
        user = request.user
        if not (user.is_staff or user.is_superuser or assignment.assigned_by_id == user.id):
            return Response({'detail': 'Only the assigning user or an admin can delegate approval.'}, status=status.HTTP_403_FORBIDDEN)

        delegate_id = request.data.get('delegate_id')
        if delegate_id in [None, '']:
            assignment.approval_delegate = None
        else:
            try:
                delegate = User.objects.get(id=delegate_id)
            except User.DoesNotExist:
                return Response({'detail': 'Approval delegate was not found.'}, status=status.HTTP_404_NOT_FOUND)
            if not user_can_assign_meter_readings(delegate):
                return Response({'detail': 'Approval delegate must be an admin, Production Supervisor or Zonal Officer.'}, status=status.HTTP_400_BAD_REQUEST)
            assignment.approval_delegate = delegate

        assignment.save(update_fields=['approval_delegate', 'updated_at'])
        serializer = self.get_serializer(assignment)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def mine(self, request):
        queryset = self.filter_queryset(
            self.get_queryset().filter(assignee=request.user, is_active=True)
        )
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def today(self, request):
        date_param = request.query_params.get('date')
        if date_param:
            reading_date = parse_date(date_param)
            if reading_date is None:
                return Response({'detail': 'date must be a valid YYYY-MM-DD value'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            reading_date = timezone.localdate()

        assignments = (
            self.get_queryset()
            .filter(assignee=request.user, is_active=True)
            .filter(
                models.Q(start_date__isnull=True) | models.Q(start_date__lte=reading_date),
                models.Q(end_date__isnull=True) | models.Q(end_date__gte=reading_date),
            )
            .select_related('production_site', 'zone', 'water_meter', 'energy_meter')
        )

        task_map = {}
        for assignment in assignments:
            if assignment.water_meter_id:
                key = ('WATER', assignment.water_meter_id)
                meter = assignment.water_meter
                reading = WaterMeterReading.objects.filter(
                    water_meter=meter,
                    reading_date=reading_date,
                ).first()
                previous = WaterMeterReading.objects.filter(
                    water_meter=meter,
                    reading_date__lt=reading_date,
                ).order_by('-reading_date', '-reading_time').first()
                initial_reading = meter.initial_reading
            elif assignment.energy_meter_id:
                key = ('ENERGY', assignment.energy_meter_id)
                meter = assignment.energy_meter
                reading = EnergyMeterReading.objects.filter(
                    energy_meter=meter,
                    reading_date=reading_date,
                ).first()
                previous = EnergyMeterReading.objects.filter(
                    energy_meter=meter,
                    reading_date__lt=reading_date,
                ).order_by('-reading_date', '-reading_time').first()
                initial_reading = meter.initial_reading
            else:
                continue

            task = task_map.setdefault(key, {
                'meter_type': key[0],
                'meter_id': key[1],
                'meter_number': meter.meter_number,
                'meter_label': meter.display_label,
                'display_name': meter.display_name,
                'reading_date': reading_date,
                'initial_reading': initial_reading,
                'previous_reading_date': previous.reading_date if previous else None,
                'previous_reading_value': previous.current_reading if previous else initial_reading,
                'today_reading': None,
                'status': 'missing',
                'assignment_ids': [],
                'scopes': [],
            })
            task['assignment_ids'].append(assignment.id)
            task['scopes'].append({
                'scope_type': assignment.scope_type,
                'production_site_id': assignment.production_site_id,
                'production_site_name': assignment.production_site.name if assignment.production_site_id else None,
                'zone_id': assignment.zone_id,
                'zone_name': assignment.zone.name if assignment.zone_id else None,
            })

            if reading is not None and task['today_reading'] is None:
                serializer_class = WaterMeterReadingSerializer if key[0] == 'WATER' else EnergyMeterReadingSerializer
                task['today_reading'] = serializer_class(reading, context={'request': request}).data
                task['status'] = 'validated' if reading.is_validated else 'submitted'

        tasks = sorted(
            task_map.values(),
            key=lambda item: (item['status'] != 'missing', item['meter_label']),
        )
        return Response({
            'date': reading_date,
            'count': len(tasks),
            'results': tasks,
        })
