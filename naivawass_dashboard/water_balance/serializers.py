from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError

from .models import (
    ProductionZoneAllocationRule,
    WaterBalanceModel,
    WaterBalanceNode,
    WaterBalanceNodeInput,
    WaterBalanceRule,
)


class ProductionZoneAllocationRuleSerializer(serializers.ModelSerializer):
    production_site_name = serializers.CharField(source='production_site.name', read_only=True)
    production_site_code = serializers.CharField(source='production_site.code', read_only=True)
    production_region_name = serializers.CharField(source='production_site.region.name', read_only=True)
    zone_name = serializers.CharField(source='zone.name', read_only=True)
    zone_code = serializers.CharField(source='zone.code', read_only=True)
    distribution_region_name = serializers.CharField(source='zone.region.name', read_only=True)
    method_display = serializers.CharField(source='get_method_display', read_only=True)
    rule_type_display = serializers.CharField(source='get_rule_type_display', read_only=True)

    class Meta:
        model = ProductionZoneAllocationRule
        fields = [
            'id',
            'production_site',
            'production_site_name',
            'production_site_code',
            'production_region_name',
            'zone',
            'zone_name',
            'zone_code',
            'distribution_region_name',
            'method',
            'method_display',
            'rule_type',
            'rule_type_display',
            'basis_value',
            'effective_start_date',
            'effective_end_date',
            'priority',
            'is_active',
            'reason',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate(self, attrs):
        data = {}
        for field in [
            'production_site',
            'zone',
            'method',
            'rule_type',
            'basis_value',
            'effective_start_date',
            'effective_end_date',
            'priority',
            'is_active',
            'reason',
            'notes',
        ]:
            data[field] = attrs.get(field, getattr(self.instance, field, None))

        rule = ProductionZoneAllocationRule(**data)
        if self.instance:
            rule.pk = self.instance.pk

        try:
            rule.clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict if hasattr(exc, 'message_dict') else exc.messages)

        return attrs


class SourceAllocationQuerySerializer(serializers.Serializer):
    start_date = serializers.DateField(required=True)
    end_date = serializers.DateField(required=True)
    zone = serializers.IntegerField(required=False, min_value=1)
    production_site = serializers.IntegerField(required=False, min_value=1)

    def validate(self, attrs):
        if attrs['start_date'] > attrs['end_date']:
            raise serializers.ValidationError({'end_date': 'end_date cannot be before start_date.'})
        return attrs


class WaterBalanceNodeSerializer(serializers.ModelSerializer):
    production_site_name = serializers.CharField(source='production_site.name', read_only=True)
    production_site_code = serializers.CharField(source='production_site.code', read_only=True)
    node_type_display = serializers.CharField(source='get_node_type_display', read_only=True)

    class Meta:
        model = WaterBalanceNode
        fields = [
            'id',
            'name',
            'code',
            'node_type',
            'node_type_display',
            'production_site',
            'production_site_name',
            'production_site_code',
            'is_active',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class WaterBalanceModelSerializer(serializers.ModelSerializer):
    zone_name = serializers.CharField(source='zone.name', read_only=True)
    zone_code = serializers.CharField(source='zone.code', read_only=True)
    distribution_region_name = serializers.CharField(source='zone.region.name', read_only=True)

    class Meta:
        model = WaterBalanceModel
        fields = [
            'id',
            'name',
            'zone',
            'zone_name',
            'zone_code',
            'distribution_region_name',
            'effective_start_date',
            'effective_end_date',
            'is_active',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate(self, attrs):
        data = {}
        for field in ['name', 'zone', 'effective_start_date', 'effective_end_date', 'is_active', 'notes']:
            data[field] = attrs.get(field, getattr(self.instance, field, None))
        model = WaterBalanceModel(**data)
        if self.instance:
            model.pk = self.instance.pk
        try:
            model.clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict if hasattr(exc, 'message_dict') else exc.messages)
        return attrs


class WaterBalanceRuleSerializer(serializers.ModelSerializer):
    balance_model_name = serializers.CharField(source='balance_model.name', read_only=True)
    zone_name = serializers.CharField(source='balance_model.zone.name', read_only=True)
    zone_code = serializers.CharField(source='balance_model.zone.code', read_only=True)
    production_site_name = serializers.CharField(source='production_site.name', read_only=True)
    production_site_code = serializers.CharField(source='production_site.code', read_only=True)
    water_meter_name = serializers.CharField(source='water_meter.display_label', read_only=True)
    mixing_node_name = serializers.CharField(source='mixing_node.name', read_only=True)
    method_display = serializers.CharField(source='get_method_display', read_only=True)
    confidence_display = serializers.CharField(source='get_confidence_display', read_only=True)

    class Meta:
        model = WaterBalanceRule
        fields = [
            'id',
            'balance_model',
            'balance_model_name',
            'zone_name',
            'zone_code',
            'production_site',
            'production_site_name',
            'production_site_code',
            'route_name',
            'method',
            'method_display',
            'basis_value',
            'water_meter',
            'water_meter_name',
            'mixing_node',
            'mixing_node_name',
            'manual_volume_m3',
            'confidence',
            'confidence_display',
            'priority',
            'is_active',
            'effective_start_date',
            'effective_end_date',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate(self, attrs):
        data = {}
        for field in [
            'balance_model',
            'production_site',
            'route_name',
            'method',
            'basis_value',
            'water_meter',
            'mixing_node',
            'manual_volume_m3',
            'confidence',
            'priority',
            'is_active',
            'effective_start_date',
            'effective_end_date',
            'notes',
        ]:
            data[field] = attrs.get(field, getattr(self.instance, field, None))
        rule = WaterBalanceRule(**data)
        if self.instance:
            rule.pk = self.instance.pk
        try:
            rule.clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict if hasattr(exc, 'message_dict') else exc.messages)
        return attrs


class WaterBalanceNodeInputSerializer(serializers.ModelSerializer):
    node_name = serializers.CharField(source='node.name', read_only=True)
    production_site_name = serializers.CharField(source='production_site.name', read_only=True)
    production_site_code = serializers.CharField(source='production_site.code', read_only=True)
    water_meter_name = serializers.CharField(source='water_meter.display_label', read_only=True)
    input_method_display = serializers.CharField(source='get_input_method_display', read_only=True)
    confidence_display = serializers.CharField(source='get_confidence_display', read_only=True)

    class Meta:
        model = WaterBalanceNodeInput
        fields = [
            'id',
            'node',
            'node_name',
            'production_site',
            'production_site_name',
            'production_site_code',
            'input_method',
            'input_method_display',
            'water_meter',
            'water_meter_name',
            'confidence',
            'confidence_display',
            'priority',
            'is_active',
            'effective_start_date',
            'effective_end_date',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate(self, attrs):
        data = {}
        for field in [
            'node',
            'production_site',
            'input_method',
            'water_meter',
            'confidence',
            'priority',
            'is_active',
            'effective_start_date',
            'effective_end_date',
            'notes',
        ]:
            data[field] = attrs.get(field, getattr(self.instance, field, None))
        node_input = WaterBalanceNodeInput(**data)
        if self.instance:
            node_input.pk = self.instance.pk
        try:
            node_input.clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict if hasattr(exc, 'message_dict') else exc.messages)
        return attrs


class ConfiguredSourceAllocationQuerySerializer(SourceAllocationQuerySerializer):
    pass


class ZoneCycleSourceAllocationQuerySerializer(serializers.Serializer):
    zone = serializers.IntegerField(required=True, min_value=1)
    year = serializers.IntegerField(required=True, min_value=2000)
    month = serializers.IntegerField(required=True, min_value=1, max_value=12)
    production_site = serializers.IntegerField(required=False, min_value=1)
