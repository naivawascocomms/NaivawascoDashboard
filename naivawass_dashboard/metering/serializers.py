from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import serializers

from .access import user_can_submit_energy_meter_reading, user_can_submit_water_meter_reading
from .constants import USER_ROLE_CHOICES
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

User = get_user_model()


class UserSummarySerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    role = serializers.CharField(source='metering_profile.role', read_only=True)
    role_display = serializers.CharField(source='metering_profile.get_role_display', read_only=True)

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'first_name',
            'last_name',
            'full_name',
            'is_active',
            'is_staff',
            'is_superuser',
            'role',
            'role_display',
        ]

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class UserProfileSerializer(serializers.ModelSerializer):
    user = UserSummarySerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(source='user', queryset=User.objects.all(), write_only=True)
    can_assign_readings = serializers.BooleanField(read_only=True)
    can_receive_reading_assignments = serializers.BooleanField(read_only=True)

    class Meta:
        model = UserProfile
        fields = [
            'id',
            'user',
            'user_id',
            'role',
            'phone_number',
            'notes',
            'can_assign_readings',
            'can_receive_reading_assignments',
            'created_at',
            'updated_at',
        ]


class UserManagementSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    profile = UserProfileSerializer(source='metering_profile', read_only=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=False, trim_whitespace=False)
    role = serializers.ChoiceField(choices=USER_ROLE_CHOICES, write_only=True, required=False)
    phone_number = serializers.CharField(write_only=True, required=False, allow_blank=True)
    profile_notes = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'full_name',
            'is_active',
            'is_staff',
            'is_superuser',
            'last_login',
            'date_joined',
            'profile',
            'password',
            'role',
            'phone_number',
            'profile_notes',
        ]
        read_only_fields = ['id', 'full_name', 'last_login', 'date_joined', 'profile']
        extra_kwargs = {
            'email': {'required': False, 'allow_blank': True},
            'first_name': {'required': False, 'allow_blank': True},
            'last_name': {'required': False, 'allow_blank': True},
            'is_active': {'required': False},
            'is_staff': {'required': False},
            'is_superuser': {'required': False},
        }

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

    def validate(self, attrs):
        request = self.context.get('request')
        actor = getattr(request, 'user', None)
        if not getattr(actor, 'is_superuser', False):
            privileged_fields = {'is_staff', 'is_superuser'}
            requested_privileges = privileged_fields.intersection(attrs)
            if requested_privileges:
                raise serializers.ValidationError(
                    'Only superusers can change staff or superuser access.'
                )

        if self.instance is not None and self.instance == actor and attrs.get('is_active') is False:
            raise serializers.ValidationError('You cannot deactivate your own user account.')

        if self.instance is not None and self.instance == actor and attrs.get('is_superuser') is False:
            raise serializers.ValidationError('You cannot remove your own superuser access.')

        if self.instance is None and not attrs.get('password'):
            raise serializers.ValidationError({'password': 'Password is required when creating a user.'})

        return attrs

    def _profile_payload(self, validated_data):
        return {
            'role': validated_data.pop('role', None),
            'phone_number': validated_data.pop('phone_number', None),
            'notes': validated_data.pop('profile_notes', None),
        }

    @transaction.atomic
    def create(self, validated_data):
        profile_payload = self._profile_payload(validated_data)
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()

        profile, _ = UserProfile.objects.get_or_create(
            user=user,
            defaults={'role': profile_payload['role'] or 'PUMP_OPERATOR'},
        )
        profile.role = profile_payload['role'] or profile.role
        profile.phone_number = profile_payload['phone_number'] or ''
        profile.notes = profile_payload['notes'] or ''
        profile.save(update_fields=['role', 'phone_number', 'notes', 'updated_at'])
        user._state.fields_cache.pop('metering_profile', None)
        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        profile_payload = self._profile_payload(validated_data)
        password = validated_data.pop('password', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()

        profile, _ = UserProfile.objects.get_or_create(
            user=instance,
            defaults={'role': profile_payload['role'] or 'PUMP_OPERATOR'},
        )
        update_fields = []
        if profile_payload['role'] is not None:
            profile.role = profile_payload['role']
            update_fields.append('role')
        if profile_payload['phone_number'] is not None:
            profile.phone_number = profile_payload['phone_number']
            update_fields.append('phone_number')
        if profile_payload['notes'] is not None:
            profile.notes = profile_payload['notes']
            update_fields.append('notes')
        if update_fields:
            profile.save(update_fields=[*update_fields, 'updated_at'])
            instance._state.fields_cache.pop('metering_profile', None)
        return instance


class UserPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, allow_blank=False, trim_whitespace=False)


class WaterMeterSerializer(serializers.ModelSerializer):
    last_reading_date = serializers.SerializerMethodField()
    last_reading_value = serializers.SerializerMethodField()
    display_label = serializers.CharField(read_only=True)

    class Meta:
        model = WaterMeter
        fields = '__all__'

    def get_last_reading_date(self, obj):
        reading = obj.readings.order_by('-reading_date', '-reading_time').first()
        return reading.reading_date if reading else None

    def get_last_reading_value(self, obj):
        reading = obj.readings.order_by('-reading_date', '-reading_time').first()
        return reading.current_reading if reading else None


class EnergyMeterSerializer(serializers.ModelSerializer):
    last_reading_date = serializers.SerializerMethodField()
    last_reading_value = serializers.SerializerMethodField()
    display_label = serializers.CharField(read_only=True)

    class Meta:
        model = EnergyMeter
        fields = '__all__'

    def get_last_reading_date(self, obj):
        reading = obj.readings.order_by('-reading_date', '-reading_time').first()
        return reading.reading_date if reading else None

    def get_last_reading_value(self, obj):
        reading = obj.readings.order_by('-reading_date', '-reading_time').first()
        return reading.current_reading if reading else None


class WaterMeterReadingSerializer(serializers.ModelSerializer):
    meter_number = serializers.CharField(source='water_meter.meter_number', read_only=True)
    meter_display_name = serializers.CharField(source='water_meter.display_name', read_only=True)
    meter_label = serializers.CharField(source='water_meter.display_label', read_only=True)
    submitted_by_username = serializers.CharField(source='submitted_by.username', read_only=True, allow_null=True)

    class Meta:
        model = WaterMeterReading
        fields = '__all__'


class EnergyMeterReadingSerializer(serializers.ModelSerializer):
    meter_number = serializers.CharField(source='energy_meter.meter_number', read_only=True)
    meter_display_name = serializers.CharField(source='energy_meter.display_name', read_only=True)
    meter_label = serializers.CharField(source='energy_meter.display_label', read_only=True)
    submitted_by_username = serializers.CharField(source='submitted_by.username', read_only=True, allow_null=True)

    class Meta:
        model = EnergyMeterReading
        fields = '__all__'


class ProductionWaterMeterAssignmentSerializer(serializers.ModelSerializer):
    meter_number = serializers.CharField(source='water_meter.meter_number', read_only=True)
    meter_display_name = serializers.CharField(source='water_meter.display_name', read_only=True)
    meter_label = serializers.CharField(source='water_meter.display_label', read_only=True)
    production_site_name = serializers.CharField(source='production_site.name', read_only=True)
    water_source_name = serializers.CharField(source='water_source.name', read_only=True, allow_null=True)
    initial_reading = serializers.DecimalField(source='water_meter.initial_reading', max_digits=15, decimal_places=2, read_only=True)
    last_reading_date = serializers.SerializerMethodField()
    last_reading_value = serializers.SerializerMethodField()

    class Meta:
        model = ProductionWaterMeterAssignment
        fields = '__all__'

    def get_last_reading_date(self, obj):
        reading = obj.water_meter.readings.order_by('-reading_date', '-reading_time').first()
        return reading.reading_date if reading else None

    def get_last_reading_value(self, obj):
        reading = obj.water_meter.readings.order_by('-reading_date', '-reading_time').first()
        return reading.current_reading if reading else None


class ProductionEnergyMeterAssignmentSerializer(serializers.ModelSerializer):
    meter_number = serializers.CharField(source='energy_meter.meter_number', read_only=True)
    meter_display_name = serializers.CharField(source='energy_meter.display_name', read_only=True)
    meter_label = serializers.CharField(source='energy_meter.display_label', read_only=True)
    production_site_name = serializers.CharField(source='production_site.name', read_only=True)
    initial_reading = serializers.DecimalField(source='energy_meter.initial_reading', max_digits=15, decimal_places=2, read_only=True)
    last_reading_date = serializers.SerializerMethodField()
    last_reading_value = serializers.SerializerMethodField()

    class Meta:
        model = ProductionEnergyMeterAssignment
        fields = '__all__'

    def get_last_reading_date(self, obj):
        reading = obj.energy_meter.readings.order_by('-reading_date', '-reading_time').first()
        return reading.reading_date if reading else None

    def get_last_reading_value(self, obj):
        reading = obj.energy_meter.readings.order_by('-reading_date', '-reading_time').first()
        return reading.current_reading if reading else None


class DistributionWaterMeterAssignmentSerializer(serializers.ModelSerializer):
    meter_number = serializers.CharField(source='water_meter.meter_number', read_only=True)
    meter_display_name = serializers.CharField(source='water_meter.display_name', read_only=True)
    meter_label = serializers.CharField(source='water_meter.display_label', read_only=True)
    zone_name = serializers.CharField(source='zone.name', read_only=True, allow_null=True)
    dma_name = serializers.CharField(source='dma.name', read_only=True, allow_null=True)
    initial_reading = serializers.DecimalField(source='water_meter.initial_reading', max_digits=15, decimal_places=2, read_only=True)
    last_reading_date = serializers.SerializerMethodField()
    last_reading_value = serializers.SerializerMethodField()

    class Meta:
        model = DistributionWaterMeterAssignment
        fields = '__all__'

    def get_last_reading_date(self, obj):
        reading = obj.water_meter.readings.order_by('-reading_date', '-reading_time').first()
        return reading.reading_date if reading else None

    def get_last_reading_value(self, obj):
        reading = obj.water_meter.readings.order_by('-reading_date', '-reading_time').first()
        return reading.current_reading if reading else None


class MeterReadingAssignmentSerializer(serializers.ModelSerializer):
    assignee = UserSummarySerializer(read_only=True)
    assignee_id = serializers.PrimaryKeyRelatedField(source='assignee', queryset=User.objects.all(), write_only=True)
    assigned_by = UserSummarySerializer(read_only=True)
    assigned_by_id = serializers.PrimaryKeyRelatedField(
        source='assigned_by',
        queryset=User.objects.all(),
        write_only=True,
        required=False,
    )
    approval_delegate = UserSummarySerializer(read_only=True)
    approval_delegate_id = serializers.PrimaryKeyRelatedField(
        source='approval_delegate',
        queryset=User.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )
    production_site_name = serializers.CharField(source='production_site.name', read_only=True, allow_null=True)
    zone_name = serializers.CharField(source='zone.name', read_only=True, allow_null=True)
    water_meter_label = serializers.CharField(source='water_meter.display_label', read_only=True, allow_null=True)
    energy_meter_label = serializers.CharField(source='energy_meter.display_label', read_only=True, allow_null=True)
    water_meter_number = serializers.CharField(source='water_meter.meter_number', read_only=True, allow_null=True)
    energy_meter_number = serializers.CharField(source='energy_meter.meter_number', read_only=True, allow_null=True)
    last_reading_date = serializers.SerializerMethodField()
    last_reading_value = serializers.SerializerMethodField()
    initial_reading = serializers.SerializerMethodField()
    reading_date = serializers.SerializerMethodField()
    reading_status = serializers.SerializerMethodField()
    reading_id = serializers.SerializerMethodField()
    reading_current_value = serializers.SerializerMethodField()
    reading_is_validated = serializers.SerializerMethodField()

    class Meta:
        model = MeterReadingAssignment
        fields = [
            'id',
            'assignee',
            'assignee_id',
            'assigned_by',
            'assigned_by_id',
            'approval_delegate',
            'approval_delegate_id',
            'scope_type',
            'production_site',
            'production_site_name',
            'zone',
            'zone_name',
            'water_meter',
            'water_meter_label',
            'water_meter_number',
            'energy_meter',
            'energy_meter_label',
            'energy_meter_number',
            'last_reading_date',
            'last_reading_value',
            'initial_reading',
            'reading_date',
            'reading_status',
            'reading_id',
            'reading_current_value',
            'reading_is_validated',
            'is_active',
            'start_date',
            'end_date',
            'notes',
            'created_at',
            'updated_at',
        ]
        validators = []

    def validate(self, attrs):
        request = self.context.get('request')
        if self.instance is not None:
            original_values = {field: getattr(self.instance, field) for field in attrs}
            try:
                for field, value in attrs.items():
                    setattr(self.instance, field, value)
                self.instance.full_clean()
            finally:
                for field, value in original_values.items():
                    setattr(self.instance, field, value)
            return attrs

        validation_attrs = attrs.copy()
        if 'assigned_by' not in validation_attrs and request is not None and getattr(request, 'user', None) is not None:
            validation_attrs['assigned_by'] = request.user
        instance = MeterReadingAssignment(
            **validation_attrs,
        )
        instance.full_clean()
        return attrs

    def get_last_reading_date(self, obj):
        if obj.water_meter_id:
            reading = obj.water_meter.readings.order_by('-reading_date', '-reading_time').first()
            return reading.reading_date if reading else None
        if obj.energy_meter_id:
            reading = obj.energy_meter.readings.order_by('-reading_date', '-reading_time').first()
            return reading.reading_date if reading else None
        return None

    def get_last_reading_value(self, obj):
        if obj.water_meter_id:
            reading = obj.water_meter.readings.order_by('-reading_date', '-reading_time').first()
            return reading.current_reading if reading else None
        if obj.energy_meter_id:
            reading = obj.energy_meter.readings.order_by('-reading_date', '-reading_time').first()
            return reading.current_reading if reading else None
        return None

    def get_initial_reading(self, obj):
        if obj.water_meter_id:
            return obj.water_meter.initial_reading
        if obj.energy_meter_id:
            return obj.energy_meter.initial_reading
        return None

    def _selected_reading_date(self):
        request = self.context.get('request')
        date_param = request.query_params.get('reading_date') if request is not None else None
        return parse_date(date_param) if date_param else timezone.localdate()

    def _selected_reading(self, obj):
        reading_date = self._selected_reading_date()
        if obj.water_meter_id:
            return obj.water_meter.readings.filter(reading_date=reading_date).first()
        if obj.energy_meter_id:
            return obj.energy_meter.readings.filter(reading_date=reading_date).first()
        return None

    def get_reading_date(self, obj):
        return self._selected_reading_date()

    def get_reading_status(self, obj):
        reading = self._selected_reading(obj)
        if reading is None:
            return 'NOT_SUBMITTED'
        return 'VALIDATED' if reading.is_validated else 'SUBMITTED'

    def get_reading_id(self, obj):
        reading = self._selected_reading(obj)
        return reading.id if reading else None

    def get_reading_current_value(self, obj):
        reading = self._selected_reading(obj)
        return reading.current_reading if reading else None

    def get_reading_is_validated(self, obj):
        reading = self._selected_reading(obj)
        return reading.is_validated if reading else False


class WaterMeterReadingCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WaterMeterReading
        fields = [
            'water_meter', 'reading_date', 'reading_time', 'current_reading',
            'read_by', 'reading_method', 'notes'
        ]
        validators = []

    def validate(self, data):
        meter = data['water_meter']
        reading_date = data['reading_date']
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is not None and not user_can_submit_water_meter_reading(user, meter.id, reading_date):
            raise serializers.ValidationError(
                'You are not assigned to submit readings for this water meter on the selected date.'
            )
        existing = meter.readings.filter(reading_date=reading_date).first()
        if existing and existing.is_validated:
            raise serializers.ValidationError(
                'This reading has already been validated and cannot be changed from the field app.'
            )
        previous = meter.readings.filter(
            reading_date__lt=reading_date,
        ).order_by('-reading_date', '-reading_time').first()
        previous_reading = previous.current_reading if previous else meter.initial_reading
        data['previous_reading'] = previous_reading
        if data['current_reading'] < previous_reading:
            raise serializers.ValidationError(
                'Current reading cannot be less than previous reading'
            )
        if user is not None and not data.get('read_by'):
            data['read_by'] = user.get_full_name() or user.username
        return data

    def create(self, validated_data):
        reading, _ = WaterMeterReading.objects.update_or_create(
            water_meter=validated_data['water_meter'],
            reading_date=validated_data['reading_date'],
            defaults=validated_data,
        )
        return reading


class EnergyMeterReadingCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EnergyMeterReading
        fields = [
            'energy_meter', 'reading_date', 'reading_time', 'current_reading',
            'read_by', 'reading_method', 'notes'
        ]
        validators = []

    def validate(self, data):
        meter = data['energy_meter']
        reading_date = data['reading_date']
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is not None and not user_can_submit_energy_meter_reading(user, meter.id, reading_date):
            raise serializers.ValidationError(
                'You are not assigned to submit readings for this energy meter on the selected date.'
            )
        existing = meter.readings.filter(reading_date=reading_date).first()
        if existing and existing.is_validated:
            raise serializers.ValidationError(
                'This reading has already been validated and cannot be changed from the field app.'
            )
        previous = meter.readings.filter(
            reading_date__lt=reading_date,
        ).order_by('-reading_date', '-reading_time').first()
        previous_reading = previous.current_reading if previous else meter.initial_reading
        data['previous_reading'] = previous_reading
        if data['current_reading'] < previous_reading:
            raise serializers.ValidationError(
                'Current reading cannot be less than previous reading'
            )
        if user is not None and not data.get('read_by'):
            data['read_by'] = user.get_full_name() or user.username
        return data

    def create(self, validated_data):
        reading, _ = EnergyMeterReading.objects.update_or_create(
            energy_meter=validated_data['energy_meter'],
            reading_date=validated_data['reading_date'],
            defaults=validated_data,
        )
        return reading
