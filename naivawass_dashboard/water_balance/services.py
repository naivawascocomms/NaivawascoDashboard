from collections import defaultdict
from calendar import monthrange
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Q, Sum
from django.utils import timezone

from distribution.models import (
    CustomerBillingData,
    DailyDistribution,
    GlobalNRWPerformance,
    MonthlyDistribution,
    Zone,
    ZoneBillingCycle,
)
from metering.models import WaterMeterReading
from production.models import DailyProduction, MonthlyProduction, ProductionSite

from .models import (
    ProductionZoneAllocationRule,
    WaterBalanceDashboardSettings,
    WaterBalanceModel,
    WaterBalanceNodeInput,
    WaterBalanceRule,
)


def decimal_to_float(value):
    return float(value or Decimal('0'))


def round_decimal(value, places='0.01'):
    return value.quantize(Decimal(places), rounding=ROUND_HALF_UP)


def active_rules_for_date(target_date, zone_ids=None):
    queryset = (
        ProductionZoneAllocationRule.objects
        .select_related('production_site', 'production_site__region', 'zone', 'zone__region')
        .filter(
            is_active=True,
            effective_start_date__lte=target_date,
        )
        .filter(
            Q(effective_end_date__isnull=True) | Q(effective_end_date__gte=target_date)
        )
    )
    if zone_ids is not None:
        queryset = queryset.filter(zone_id__in=zone_ids)
    return queryset.order_by('zone_id', 'rule_type', 'priority', 'production_site__name')


def select_rules_for_balance(all_rules):
    """Choose exception rules over monthly standards for one zone/day."""

    exception_rules = [
        rule
        for rule in all_rules
        if rule.rule_type == ProductionZoneAllocationRule.RuleType.OPERATIONAL_EXCEPTION
    ]
    if exception_rules:
        return exception_rules

    return [
        rule
        for rule in all_rules
        if rule.rule_type == ProductionZoneAllocationRule.RuleType.MONTHLY_STANDARD
    ]


def calculate_source_allocations(start_date, end_date, zone_id=None, production_site_id=None):
    """Allocate official zone supply to production sites for a date range.

    The source supply is the existing DailyDistribution volume. Allocation rules
    only split that known zone supply; they do not affect meter configuration or
    official supply calculations.
    """

    distribution_qs = (
        DailyDistribution.objects
        .select_related('zone', 'zone__region')
        .filter(distribution_date__gte=start_date, distribution_date__lte=end_date)
    )
    if zone_id:
        distribution_qs = distribution_qs.filter(zone_id=zone_id)

    daily_supply = list(
        distribution_qs
        .values(
            'distribution_date',
            'zone_id',
            'zone__name',
            'zone__code',
            'zone__region_id',
            'zone__region__name',
        )
        .annotate(zone_supply_m3=Sum('volume_supplied_m3'))
        .order_by('distribution_date', 'zone__region__dashboard_order', 'zone__dashboard_order', 'zone__name')
    )

    zone_ids = {row['zone_id'] for row in daily_supply}
    zones_with_supply = Zone.objects.filter(id__in=zone_ids).select_related('region')

    rows = []
    warnings = []

    for item in daily_supply:
        target_date = item['distribution_date']
        zone_supply = item['zone_supply_m3'] or Decimal('0')
        active_rules = list(
            active_rules_for_date(
                target_date,
                zone_ids=[item['zone_id']],
            )
        )
        rules = select_rules_for_balance(active_rules)

        if not rules:
            warnings.append({
                'date': target_date.isoformat(),
                'zone_id': item['zone_id'],
                'zone_name': item['zone__name'],
                'message': 'No active monthly standard or operational exception rule was found for this zone/date.',
            })
            continue

        basis_total = sum((rule.basis_value for rule in rules), Decimal('0'))
        if basis_total <= 0:
            warnings.append({
                'date': target_date.isoformat(),
                'zone_id': item['zone_id'],
                'zone_name': item['zone__name'],
                'message': 'Active allocation rules have zero total basis.',
            })
            continue

        allocated_running_total = Decimal('0')
        for index, rule in enumerate(rules):
            if index == len(rules) - 1:
                allocated_volume = zone_supply - allocated_running_total
            else:
                allocated_volume = round_decimal(zone_supply * rule.basis_value / basis_total)
                allocated_running_total += allocated_volume

            allocation_percentage = (rule.basis_value / basis_total * Decimal('100')) if basis_total else Decimal('0')
            row = {
                'date': target_date.isoformat(),
                'zone_id': item['zone_id'],
                'zone_name': item['zone__name'],
                'zone_code': item['zone__code'],
                'distribution_region_id': item['zone__region_id'],
                'distribution_region_name': item['zone__region__name'],
                'production_site_id': rule.production_site_id,
                'production_site_name': rule.production_site.name,
                'production_site_code': rule.production_site.code,
                'production_region_id': rule.production_site.region_id,
                'production_region_name': rule.production_site.region.name,
                'rule_id': rule.id,
                'method': rule.method,
                'rule_type': rule.rule_type,
                'reason': rule.reason,
                'basis': decimal_to_float(rule.basis_value),
                'basis_total': decimal_to_float(basis_total),
                'allocation_percentage': decimal_to_float(allocation_percentage),
                'zone_supply_m3': decimal_to_float(zone_supply),
                'allocated_volume_m3': decimal_to_float(allocated_volume),
            }
            if not production_site_id or rule.production_site_id == production_site_id:
                rows.append(row)

    summary_by_zone = defaultdict(lambda: {
        'zone_id': None,
        'zone_name': '',
        'zone_code': '',
        'distribution_region_name': '',
        'zone_supply_m3': 0.0,
        'allocated_volume_m3': 0.0,
        'sources': defaultdict(float),
    })
    summary_by_site = defaultdict(lambda: {
        'production_site_id': None,
        'production_site_name': '',
        'production_site_code': '',
        'production_region_name': '',
        'allocated_volume_m3': 0.0,
        'zones': defaultdict(float),
    })

    for row in rows:
        zone_summary = summary_by_zone[row['zone_id']]
        zone_summary.update({
            'zone_id': row['zone_id'],
            'zone_name': row['zone_name'],
            'zone_code': row['zone_code'],
            'distribution_region_name': row['distribution_region_name'],
        })
        zone_summary['allocated_volume_m3'] += row['allocated_volume_m3']
        zone_summary['sources'][row['production_site_name']] += row['allocated_volume_m3']

        site_summary = summary_by_site[row['production_site_id']]
        site_summary.update({
            'production_site_id': row['production_site_id'],
            'production_site_name': row['production_site_name'],
            'production_site_code': row['production_site_code'],
            'production_region_name': row['production_region_name'],
        })
        site_summary['allocated_volume_m3'] += row['allocated_volume_m3']
        site_summary['zones'][row['zone_name']] += row['allocated_volume_m3']

    zone_supply_totals = defaultdict(float)
    for item in daily_supply:
        zone_supply_totals[item['zone_id']] += decimal_to_float(item['zone_supply_m3'])
    for zone_id_value, zone in [(zone.id, zone) for zone in zones_with_supply]:
        if zone_id_value in summary_by_zone:
            summary_by_zone[zone_id_value]['zone_supply_m3'] = zone_supply_totals[zone_id_value]

    return {
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat(),
        'total_zone_supply_m3': sum(zone_supply_totals.values()),
        'total_allocated_volume_m3': sum(row['allocated_volume_m3'] for row in rows),
        'rows': rows,
        'zones': [
            {
                **{key: value for key, value in zone.items() if key != 'sources'},
                'sources': [
                    {'production_site_name': name, 'allocated_volume_m3': volume}
                    for name, volume in sorted(zone['sources'].items())
                ],
            }
            for zone in summary_by_zone.values()
        ],
        'production_sites': [
            {
                **{key: value for key, value in site.items() if key != 'zones'},
                'zones': [
                    {'zone_name': name, 'allocated_volume_m3': volume}
                    for name, volume in sorted(site['zones'].items())
                ],
            }
            for site in summary_by_site.values()
        ],
        'warnings': warnings,
    }


def active_balance_model_for_date(zone_id, target_date):
    return (
        WaterBalanceModel.objects
        .filter(
            zone_id=zone_id,
            is_active=True,
            effective_start_date__lte=target_date,
        )
        .filter(Q(effective_end_date__isnull=True) | Q(effective_end_date__gte=target_date))
        .order_by('-effective_start_date', '-id')
        .first()
    )


def active_balance_rules_for_date(balance_model, target_date):
    return list(
        balance_model.rules
        .select_related('production_site', 'production_site__region', 'water_meter', 'mixing_node')
        .filter(is_active=True)
        .filter(Q(effective_start_date__isnull=True) | Q(effective_start_date__lte=target_date))
        .filter(Q(effective_end_date__isnull=True) | Q(effective_end_date__gte=target_date))
        .order_by('priority', 'production_site__name', 'route_name')
    )


def active_node_inputs_for_date(node, target_date):
    return list(
        WaterBalanceNodeInput.objects
        .select_related('production_site', 'production_site__region', 'water_meter')
        .filter(node=node, is_active=True)
        .filter(Q(effective_start_date__isnull=True) | Q(effective_start_date__lte=target_date))
        .filter(Q(effective_end_date__isnull=True) | Q(effective_end_date__gte=target_date))
        .order_by('priority', 'production_site__name')
    )


def get_daily_zone_supply_rows(start_date, end_date, zone_id=None):
    distribution_qs = (
        DailyDistribution.objects
        .select_related('zone', 'zone__region')
        .filter(distribution_date__gte=start_date, distribution_date__lte=end_date)
    )
    if zone_id:
        distribution_qs = distribution_qs.filter(zone_id=zone_id)

    return list(
        distribution_qs
        .values(
            'distribution_date',
            'zone_id',
            'zone__name',
            'zone__code',
            'zone__region_id',
            'zone__region__name',
        )
        .annotate(zone_supply_m3=Sum('volume_supplied_m3'))
        .order_by('distribution_date', 'zone__region__dashboard_order', 'zone__dashboard_order', 'zone__name')
    )


def get_meter_consumption(water_meter_id, target_date):
    if not water_meter_id:
        return Decimal('0')
    reading = WaterMeterReading.objects.filter(
        water_meter_id=water_meter_id,
        reading_date=target_date,
        is_validated=True,
    ).first()
    return reading.consumption if reading and reading.consumption is not None else Decimal('0')


def get_site_own_production(production_site_id, target_date):
    """Own production excludes received water at a mixing site."""

    record = DailyProduction.objects.filter(
        production_site_id=production_site_id,
        production_date=target_date,
        is_validated=True,
    ).first()
    if not record:
        return Decimal('0')
    return record.water_abstracted_m3 or Decimal('0')


def build_attribution_row(item, rule, allocated_volume, allocation_percentage, confidence=None, method=None):
    return {
        'date': item['distribution_date'].isoformat(),
        'zone_id': item['zone_id'],
        'zone_name': item['zone__name'],
        'zone_code': item['zone__code'],
        'distribution_region_id': item['zone__region_id'],
        'distribution_region_name': item['zone__region__name'],
        'production_site_id': rule.production_site_id,
        'production_site_name': rule.production_site.name,
        'production_site_code': rule.production_site.code,
        'production_region_id': rule.production_site.region_id,
        'production_region_name': rule.production_site.region.name,
        'rule_id': rule.id,
        'balance_model_id': rule.balance_model_id,
        'balance_model_name': rule.balance_model.name,
        'route_name': rule.route_name,
        'method': method or rule.method,
        'confidence': confidence or rule.confidence,
        'allocation_percentage': decimal_to_float(allocation_percentage),
        'zone_supply_m3': decimal_to_float(item['zone_supply_m3']),
        'allocated_volume_m3': decimal_to_float(allocated_volume),
        'notes': rule.notes,
    }


def evaluate_mixing_node(node, target_date, allocated_node_volume, share_basis_volume=None):
    """Return per-site shares for a mixing node on one date.

    Residual inputs absorb the difference between total configured node output and
    measured non-residual inputs. This supports cases like Karati -> Water Works
    where the transfer meter is missing.
    """

    if share_basis_volume is None:
        share_basis_volume = allocated_node_volume

    inputs = active_node_inputs_for_date(node, target_date)
    if not inputs:
        return [], [{
            'date': target_date.isoformat(),
            'node_id': node.id,
            'node_name': node.name,
            'message': 'No active inputs were found for this mixing node/date.',
        }]

    measured_items = []
    residual_items = []
    measured_total = Decimal('0')
    warnings = []

    for item in inputs:
        if item.input_method == WaterBalanceNodeInput.InputMethod.SITE_PRODUCTION:
            volume = get_site_own_production(item.production_site_id, target_date)
            measured_total += volume
            measured_items.append((item, volume))
        elif item.input_method == WaterBalanceNodeInput.InputMethod.METERED_TRANSFER:
            volume = get_meter_consumption(item.water_meter_id, target_date)
            measured_total += volume
            measured_items.append((item, volume))
        elif item.input_method == WaterBalanceNodeInput.InputMethod.RESIDUAL:
            residual_items.append(item)

    residual_total = share_basis_volume - measured_total
    if residual_total < 0:
        warnings.append({
            'date': target_date.isoformat(),
            'node_id': node.id,
            'node_name': node.name,
            'message': 'Measured node inputs exceed configured node output; residual input was set to zero.',
        })
        residual_total = Decimal('0')

    resolved = list(measured_items)
    if residual_items:
        per_residual = residual_total / Decimal(len(residual_items))
        for item in residual_items:
            resolved.append((item, per_residual))
    elif residual_total > 0:
        warnings.append({
            'date': target_date.isoformat(),
            'node_id': node.id,
            'node_name': node.name,
            'message': 'Node output exceeds measured inputs but no residual input is configured.',
        })

    input_total = sum((volume for _item, volume in resolved), Decimal('0'))
    if input_total <= 0:
        return [], warnings + [{
            'date': target_date.isoformat(),
            'node_id': node.id,
            'node_name': node.name,
            'message': 'Node inputs total zero for this date.',
        }]

    shares = []
    for item, input_volume in resolved:
        share = input_volume / input_total
        shares.append({
            'input': item,
            'input_volume_m3': input_volume,
            'share': share,
            'allocated_volume_m3': round_decimal(allocated_node_volume * share),
        })
    if shares:
        allocated_total = sum((share['allocated_volume_m3'] for share in shares[:-1]), Decimal('0'))
        shares[-1]['allocated_volume_m3'] = allocated_node_volume - allocated_total
    return shares, warnings


def estimate_node_output_totals(daily_supply):
    """Estimate total daily output volume for each mixing node across all zones."""

    totals = defaultdict(Decimal)
    for item in daily_supply:
        target_date = item['distribution_date']
        zone_supply = item['zone_supply_m3'] or Decimal('0')
        balance_model = active_balance_model_for_date(item['zone_id'], target_date)
        if not balance_model:
            continue
        rules = active_balance_rules_for_date(balance_model, target_date)

        allocated_exact = Decimal('0')
        node_groups = {}
        variable_groups = []
        for rule in rules:
            if rule.method == WaterBalanceRule.Method.METERED_VOLUME:
                allocated_exact += get_meter_consumption(rule.water_meter_id, target_date)
            elif rule.method == WaterBalanceRule.Method.MANUAL_OVERRIDE:
                allocated_exact += rule.manual_volume_m3 or Decimal('0')
            elif rule.method == WaterBalanceRule.Method.FIXED_PERCENTAGE:
                allocated_exact += round_decimal(zone_supply * (rule.basis_value or Decimal('0')) / Decimal('100'))
            elif rule.method == WaterBalanceRule.Method.FIXED_WEIGHT:
                variable_groups.append(('rule', None, rule.basis_value or Decimal('0')))
            elif rule.method == WaterBalanceRule.Method.MIXING_NODE_SHARE and rule.mixing_node_id:
                if rule.mixing_node_id not in node_groups:
                    node_groups[rule.mixing_node_id] = {
                        'node': rule.mixing_node,
                        'basis': rule.basis_value or Decimal('1'),
                    }
                else:
                    node_groups[rule.mixing_node_id]['basis'] += rule.basis_value or Decimal('0')

        for node_id, data in node_groups.items():
            variable_groups.append(('node', node_id, data['basis']))

        remaining = zone_supply - allocated_exact
        if remaining < 0:
            remaining = Decimal('0')
        basis_total = sum((basis for _kind, _node_id, basis in variable_groups), Decimal('0'))
        running_total = Decimal('0')
        for index, (kind, node_id, basis) in enumerate(variable_groups):
            if basis_total <= 0:
                group_volume = Decimal('0')
            elif index == len(variable_groups) - 1:
                group_volume = remaining - running_total
            else:
                group_volume = round_decimal(remaining * basis / basis_total)
                running_total += group_volume
            if kind == 'node':
                totals[(target_date, node_id)] += group_volume

    return totals


def calculate_configured_source_attributions(start_date, end_date, zone_id=None, production_site_id=None):
    """Calculate daily source attribution from frontend-managed balance models."""

    daily_supply = get_daily_zone_supply_rows(start_date, end_date, zone_id=zone_id)
    node_output_totals = estimate_node_output_totals(get_daily_zone_supply_rows(start_date, end_date))
    rows = []
    warnings = []

    for item in daily_supply:
        target_date = item['distribution_date']
        zone_supply = item['zone_supply_m3'] or Decimal('0')
        balance_model = active_balance_model_for_date(item['zone_id'], target_date)
        if not balance_model:
            warnings.append({
                'date': target_date.isoformat(),
                'zone_id': item['zone_id'],
                'zone_name': item['zone__name'],
                'message': 'No active water balance model was found for this zone/date.',
            })
            continue

        rules = active_balance_rules_for_date(balance_model, target_date)
        if not rules:
            warnings.append({
                'date': target_date.isoformat(),
                'zone_id': item['zone_id'],
                'zone_name': item['zone__name'],
                'balance_model_id': balance_model.id,
                'message': 'No active water balance rules were found for this model/date.',
            })
            continue

        allocated_exact = Decimal('0')
        variable_groups = []

        for rule in rules:
            if rule.method == WaterBalanceRule.Method.METERED_VOLUME:
                volume = get_meter_consumption(rule.water_meter_id, target_date)
                allocated_exact += volume
                pct = (volume / zone_supply * Decimal('100')) if zone_supply else Decimal('0')
                if not production_site_id or rule.production_site_id == production_site_id:
                    rows.append(build_attribution_row(item, rule, volume, pct, method=rule.method))
            elif rule.method == WaterBalanceRule.Method.MANUAL_OVERRIDE:
                volume = rule.manual_volume_m3 or Decimal('0')
                allocated_exact += volume
                pct = (volume / zone_supply * Decimal('100')) if zone_supply else Decimal('0')
                if not production_site_id or rule.production_site_id == production_site_id:
                    rows.append(build_attribution_row(item, rule, volume, pct, method=rule.method))
            elif rule.method == WaterBalanceRule.Method.FIXED_PERCENTAGE:
                volume = round_decimal(zone_supply * (rule.basis_value or Decimal('0')) / Decimal('100'))
                allocated_exact += volume
                if not production_site_id or rule.production_site_id == production_site_id:
                    rows.append(build_attribution_row(item, rule, volume, rule.basis_value or Decimal('0'), method=rule.method))
            elif rule.method == WaterBalanceRule.Method.FIXED_WEIGHT:
                variable_groups.append({
                    'kind': 'rule',
                    'basis': rule.basis_value or Decimal('0'),
                    'rule': rule,
                })
            elif rule.method == WaterBalanceRule.Method.MIXING_NODE_SHARE and rule.mixing_node_id:
                existing = next(
                    (
                        group for group in variable_groups
                        if group['kind'] == 'node' and group['node'].id == rule.mixing_node_id
                    ),
                    None,
                )
                if existing is None:
                    variable_groups.append({
                        'kind': 'node',
                        'basis': rule.basis_value or Decimal('1'),
                        'node': rule.mixing_node,
                        'rules': [rule],
                    })
                else:
                    existing['rules'].append(rule)
                    existing['basis'] += rule.basis_value or Decimal('0')

        remaining = zone_supply - allocated_exact
        if remaining < 0:
            warnings.append({
                'date': target_date.isoformat(),
                'zone_id': item['zone_id'],
                'zone_name': item['zone__name'],
                'message': 'Direct/manual/fixed-percentage allocations exceed zone supply; variable allocation set to zero.',
            })
            remaining = Decimal('0')

        basis_total = sum((group['basis'] for group in variable_groups), Decimal('0'))
        allocated_running_total = Decimal('0')
        for index, group in enumerate(variable_groups):
            if basis_total <= 0:
                group_volume = Decimal('0')
            elif index == len(variable_groups) - 1:
                group_volume = remaining - allocated_running_total
            else:
                group_volume = round_decimal(remaining * group['basis'] / basis_total)
                allocated_running_total += group_volume

            if group['kind'] == 'rule':
                rule = group['rule']
                pct = (group_volume / zone_supply * Decimal('100')) if zone_supply else Decimal('0')
                if not production_site_id or rule.production_site_id == production_site_id:
                    rows.append(build_attribution_row(item, rule, group_volume, pct, method=rule.method))
            else:
                share_basis_volume = node_output_totals.get((target_date, group['node'].id), group_volume)
                shares, node_warnings = evaluate_mixing_node(
                    group['node'],
                    target_date,
                    allocated_node_volume=group_volume,
                    share_basis_volume=share_basis_volume,
                )
                warnings.extend(node_warnings)
                rules_by_site = {rule.production_site_id: rule for rule in group['rules']}
                for share in shares:
                    input_item = share['input']
                    rule = rules_by_site.get(input_item.production_site_id)
                    if rule is None:
                        warnings.append({
                            'date': target_date.isoformat(),
                            'zone_id': item['zone_id'],
                            'zone_name': item['zone__name'],
                            'node_id': group['node'].id,
                            'node_name': group['node'].name,
                            'production_site_id': input_item.production_site_id,
                            'message': 'Node input has no matching mixing-node-share rule for this zone.',
                        })
                        continue

                    volume = share['allocated_volume_m3']
                    pct = (volume / zone_supply * Decimal('100')) if zone_supply else Decimal('0')
                    confidence = input_item.confidence or rule.confidence
                    if not production_site_id or rule.production_site_id == production_site_id:
                        row = build_attribution_row(
                            item,
                            rule,
                            volume,
                            pct,
                            confidence=confidence,
                            method=rule.method,
                        )
                        row['node_id'] = group['node'].id
                        row['node_name'] = group['node'].name
                        row['node_input_method'] = input_item.input_method
                        row['node_input_volume_m3'] = decimal_to_float(share['input_volume_m3'])
                        rows.append(row)

    return summarize_attribution_rows(start_date, end_date, daily_supply, rows, warnings)


def summarize_attribution_rows(start_date, end_date, daily_supply, rows, warnings):
    summary_by_zone = defaultdict(lambda: {
        'zone_id': None,
        'zone_name': '',
        'zone_code': '',
        'distribution_region_name': '',
        'zone_supply_m3': 0.0,
        'allocated_volume_m3': 0.0,
        'sources': defaultdict(float),
    })
    summary_by_site = defaultdict(lambda: {
        'production_site_id': None,
        'production_site_name': '',
        'production_site_code': '',
        'production_region_name': '',
        'allocated_volume_m3': 0.0,
        'zones': defaultdict(float),
    })

    for row in rows:
        zone_summary = summary_by_zone[row['zone_id']]
        zone_summary.update({
            'zone_id': row['zone_id'],
            'zone_name': row['zone_name'],
            'zone_code': row['zone_code'],
            'distribution_region_name': row['distribution_region_name'],
        })
        zone_summary['allocated_volume_m3'] += row['allocated_volume_m3']
        zone_summary['sources'][row['production_site_name']] += row['allocated_volume_m3']

        site_summary = summary_by_site[row['production_site_id']]
        site_summary.update({
            'production_site_id': row['production_site_id'],
            'production_site_name': row['production_site_name'],
            'production_site_code': row['production_site_code'],
            'production_region_name': row['production_region_name'],
        })
        site_summary['allocated_volume_m3'] += row['allocated_volume_m3']
        site_summary['zones'][row['zone_name']] += row['allocated_volume_m3']

    zone_supply_totals = defaultdict(float)
    for item in daily_supply:
        zone_supply_totals[item['zone_id']] += decimal_to_float(item['zone_supply_m3'])
    for zone_id_value, total in zone_supply_totals.items():
        if zone_id_value in summary_by_zone:
            summary_by_zone[zone_id_value]['zone_supply_m3'] = total

    return {
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat(),
        'total_zone_supply_m3': sum(zone_supply_totals.values()),
        'total_allocated_volume_m3': sum(row['allocated_volume_m3'] for row in rows),
        'rows': rows,
        'zones': [
            {
                **{key: value for key, value in zone.items() if key != 'sources'},
                'sources': [
                    {'production_site_name': name, 'allocated_volume_m3': volume}
                    for name, volume in sorted(zone['sources'].items())
                ],
            }
            for zone in summary_by_zone.values()
        ],
        'production_sites': [
            {
                **{key: value for key, value in site.items() if key != 'zones'},
                'zones': [
                    {'zone_name': name, 'allocated_volume_m3': volume}
                    for name, volume in sorted(site['zones'].items())
                ],
            }
            for site in summary_by_site.values()
        ],
        'warnings': warnings,
    }


def calculate_configured_source_attributions_for_zone_cycle(year, month, zone_id, production_site_id=None):
    zone_cycle = ZoneBillingCycle.objects.select_related('zone').get(
        zone_id=zone_id,
        year=year,
        month=month,
    )
    result = calculate_configured_source_attributions(
        start_date=zone_cycle.opening_date,
        end_date=zone_cycle.effective_closing_date,
        zone_id=zone_id,
        production_site_id=production_site_id,
    )
    result['year'] = year
    result['month'] = month
    result['zone_billing_cycle_id'] = zone_cycle.id
    result['opening_date'] = zone_cycle.opening_date.isoformat()
    result['closing_date'] = zone_cycle.closing_date.isoformat() if zone_cycle.closing_date else None
    result['effective_closing_date'] = zone_cycle.effective_closing_date.isoformat()
    result['is_open'] = zone_cycle.is_open
    return result


def month_bounds(year, month):
    return date(year, month, 1), date(year, month, monthrange(year, month)[1])


def month_sequence_for_fy(fy_year):
    return [(fy_year, month) for month in range(7, 13)] + [(fy_year + 1, month) for month in range(1, 7)]


def decimal_string(value):
    return str(round_decimal(Decimal(value or 0)))


def dashboard_settings():
    return WaterBalanceDashboardSettings.get_active()


def data_source_for_window(start_date, end_date):
    settings = dashboard_settings()
    if end_date <= settings.historical_import_end_date:
        return 'HISTORICAL_IMPORT'
    if start_date < settings.live_balance_start_date:
        return 'MOCK_BALANCE_TEST'
    return 'BALANCE_MODEL'


def month_data_source(year, month):
    start_date, end_date = month_bounds(year, month)
    return data_source_for_window(start_date, end_date)


def cycle_effective_end(zone_cycle):
    return max(zone_cycle.opening_date, zone_cycle.effective_closing_date)


def resolve_balance_window(year=None, month=None, fy_year=None, zone_id=None, distribution_region_id=None):
    """Resolve the dashboard calculation window from zone-cycle dates.

    Open cycles use today as their effective end date. If no zone cycle exists,
    the function falls back to the requested calendar month/FY window.
    """

    cycle_qs = ZoneBillingCycle.objects.select_related('zone__region')
    if zone_id:
        cycle_qs = cycle_qs.filter(zone_id=zone_id)
    if distribution_region_id:
        cycle_qs = cycle_qs.filter(zone__region_id=distribution_region_id)
    if fy_year:
        month_filters = Q()
        for cycle_year, cycle_month in month_sequence_for_fy(fy_year):
            month_filters |= Q(year=cycle_year, month=cycle_month)
        cycle_qs = cycle_qs.filter(month_filters)
    elif year and month:
        cycle_qs = cycle_qs.filter(year=year, month=month)

    cycles = list(cycle_qs)
    if cycles:
        start_date = min(cycle.opening_date for cycle in cycles)
        end_date = max(cycle_effective_end(cycle) for cycle in cycles)
        return {
            'start_date': start_date,
            'end_date': end_date,
            'cycles': cycles,
            'is_open': any(cycle.is_open for cycle in cycles),
        }

    today = timezone.localdate()
    if fy_year:
        start_date = date(fy_year, 7, 1)
        end_date = date(fy_year + 1, 6, 30)
        if start_date <= today <= end_date:
            end_date = today
    elif year and month:
        start_date, end_date = month_bounds(year, month)
        if start_date <= today <= end_date:
            end_date = today
    else:
        start_date = today.replace(day=1)
        end_date = today

    return {
        'start_date': start_date,
        'end_date': end_date,
        'cycles': [],
        'is_open': end_date == today,
    }


def production_dashboard_from_balance_engine(year=None, month=None, fy_year=None, region_id=None, production_site_id=None):
    window = resolve_balance_window(year=year, month=month, fy_year=fy_year)
    start_date = window['start_date']
    end_date = window['end_date']
    attribution = calculate_configured_source_attributions(start_date=start_date, end_date=end_date)
    rows = attribution['rows']
    if region_id:
        rows = [row for row in rows if row['production_region_id'] == region_id]
    if production_site_id:
        rows = [row for row in rows if row['production_site_id'] == production_site_id]

    site_ids = {row['production_site_id'] for row in rows}
    site_qs = ProductionSite.objects.filter(is_active=True)
    if region_id:
        site_qs = site_qs.filter(region_id=region_id)
    if production_site_id:
        site_qs = site_qs.filter(id=production_site_id)
    if site_ids:
        site_qs = site_qs.filter(id__in=site_ids)

    daily_qs = DailyProduction.objects.filter(
        production_date__gte=start_date,
        production_date__lte=end_date,
        is_validated=True,
    )
    if region_id:
        daily_qs = daily_qs.filter(production_site__region_id=region_id)
    if production_site_id:
        daily_qs = daily_qs.filter(production_site_id=production_site_id)

    actuals = daily_qs.aggregate(
        water_abstracted=Sum('water_abstracted_m3'),
        production_loss=Sum('production_loss_m3'),
        grid_power=Sum('power_grid_kwh'),
        solar_power=Sum('power_solar_kwh'),
        total_power=Sum('total_power_kwh'),
    )

    monthly_qs = MonthlyProduction.objects.select_related('target').filter(
        start_date__lte=end_date,
        closing_date__gte=start_date,
    )
    if region_id:
        monthly_qs = monthly_qs.filter(production_site__region_id=region_id)
    if production_site_id:
        monthly_qs = monthly_qs.filter(production_site_id=production_site_id)
    target_totals = monthly_qs.aggregate(
        target_water_abstracted=Sum('target__water_abstraction_target_m3'),
        target_water_supplied=Sum('target__water_supply_target_m3'),
        target_production_loss=Sum('target__production_loss_target_m3'),
        target_power_grid=Sum('target__power_grid_target_kwh'),
        target_power_solar=Sum('target__power_solar_target_kwh'),
        power_costs=Sum('power_costs'),
        repair_maintenance_costs=Sum('repair_maintenance_costs'),
        abstraction_fee=Sum('abstraction_fee'),
        chemical_costs=Sum('chemical_costs'),
        total_direct_costs=Sum('total_direct_costs'),
    )

    total_water_supplied = Decimal(str(sum(row['allocated_volume_m3'] for row in rows)))
    total_water_abstracted = actuals['water_abstracted'] or Decimal('0')
    total_production_loss = actuals['production_loss'] or max(total_water_abstracted - total_water_supplied, Decimal('0'))
    total_power = actuals['total_power'] or Decimal('0')
    grid_power = actuals['grid_power'] or Decimal('0')
    solar_power = actuals['solar_power'] or Decimal('0')
    target_water_supplied = target_totals['target_water_supplied'] or Decimal('0')
    target_water_abstracted = target_totals['target_water_abstracted'] or Decimal('0')
    target_production_loss = target_totals['target_production_loss'] or Decimal('0')
    target_power_grid = target_totals['target_power_grid'] or Decimal('0')
    target_power_solar = target_totals['target_power_solar'] or Decimal('0')
    target_power = target_power_grid + target_power_solar
    total_costs = target_totals['total_direct_costs'] or Decimal('0')

    return {
        'period': f"{start_date.isoformat()} to {end_date.isoformat()}",
        'region': 'All Regions',
        'production_site': 'All Sites',
        'total_sites': site_qs.count(),
        'active_sites': site_qs.count(),
        'total_water_abstracted': decimal_string(total_water_abstracted),
        'total_water_supplied': decimal_string(total_water_supplied),
        'total_production_loss': decimal_string(total_production_loss),
        'production_loss_percentage': decimal_string(
            (total_production_loss / total_water_abstracted * Decimal('100'))
            if total_water_abstracted > 0 else Decimal('0')
        ),
        'total_power_consumption': decimal_string(total_power),
        'total_grid_power': decimal_string(grid_power),
        'total_solar_power': decimal_string(solar_power),
        'solar_power_percentage': decimal_string(
            (solar_power / total_power * Decimal('100')) if total_power > 0 else Decimal('0')
        ),
        'average_power_efficiency': decimal_string(
            (total_power / total_water_abstracted) if total_water_abstracted > 0 else Decimal('0')
        ),
        'total_costs': decimal_string(total_costs),
        'total_power_costs': decimal_string(target_totals['power_costs'] or Decimal('0')),
        'total_rm_costs': decimal_string(target_totals['repair_maintenance_costs'] or Decimal('0')),
        'total_abstraction_fee': decimal_string(target_totals['abstraction_fee'] or Decimal('0')),
        'total_chemical_costs': decimal_string(target_totals['chemical_costs'] or Decimal('0')),
        'average_cost_per_m3': decimal_string(
            (total_costs / total_water_supplied) if total_water_supplied > 0 else Decimal('0')
        ),
        'target_realization_percentage': decimal_string(
            (total_water_supplied / target_water_supplied * Decimal('100')) if target_water_supplied > 0 else Decimal('0')
        ),
        'target_water_abstracted': decimal_string(target_water_abstracted),
        'target_water_supplied': decimal_string(target_water_supplied),
        'target_production_loss': decimal_string(target_production_loss),
        'target_production_loss_percentage': decimal_string(
            (target_production_loss / target_water_abstracted * Decimal('100'))
            if target_water_abstracted > 0 else Decimal('0')
        ),
        'target_power_consumption': decimal_string(target_power),
        'target_grid_power': decimal_string(target_power_grid),
        'target_solar_power': decimal_string(target_power_solar),
        'target_solar_percentage': decimal_string(
            (target_power_solar / target_power * Decimal('100')) if target_power > 0 else Decimal('0')
        ),
        'target_power_efficiency': decimal_string(
            (target_power / target_water_abstracted) if target_water_abstracted > 0 else Decimal('0')
        ),
        'balance_window': {
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'is_open': window['is_open'],
        },
        'data_source': data_source_for_window(start_date, end_date),
        'warnings': attribution['warnings'],
    }


def production_dashboard_from_imported_records(
    year=None,
    month=None,
    fy_year=None,
    region_id=None,
    production_site_id=None,
    max_period_end_date=None,
):
    queryset = MonthlyProduction.objects.select_related('production_site', 'target')
    if fy_year:
        queryset = queryset.filter(Q(year=fy_year, month__gte=7) | Q(year=fy_year + 1, month__lte=6))
        if max_period_end_date:
            queryset = queryset.filter(
                Q(year__lt=max_period_end_date.year) |
                Q(year=max_period_end_date.year, month__lte=max_period_end_date.month)
            )
        period = f"FY {fy_year}/{str(fy_year + 1)[-2:]}"
        start_date = date(fy_year, 7, 1)
        end_date = date(fy_year + 1, 6, 30)
    else:
        if year:
            queryset = queryset.filter(year=year)
        if month:
            queryset = queryset.filter(month=month)
        period = f"{year}-{month:02d}" if year and month else str(year or 'All periods')
        start_date, end_date = month_bounds(year, month) if year and month else (None, None)
    if region_id:
        queryset = queryset.filter(production_site__region_id=region_id)
    if production_site_id:
        queryset = queryset.filter(production_site_id=production_site_id)

    aggregated = queryset.aggregate(
        total_water_abstracted=Sum('water_abstracted_m3'),
        total_water_received=Sum('water_received_m3'),
        total_production_loss=Sum('production_loss_m3'),
        total_water_supplied=Sum('water_supplied_m3'),
        total_power_consumption=Sum('total_power_kwh'),
        total_solar_power=Sum('power_solar_kwh'),
        total_grid_power=Sum('power_grid_kwh'),
        total_costs=Sum('total_direct_costs'),
        total_power_costs=Sum('power_costs'),
        total_rm_costs=Sum('repair_maintenance_costs'),
        total_abstraction_fee=Sum('abstraction_fee'),
        total_chemical_costs=Sum('chemical_costs'),
        target_water_abstracted=Sum('target__water_abstraction_target_m3'),
        target_water_supplied=Sum('target__water_supply_target_m3'),
        target_production_loss=Sum('target__production_loss_target_m3'),
        target_power_grid=Sum('target__power_grid_target_kwh'),
        target_power_solar=Sum('target__power_solar_target_kwh'),
    )

    total_water = aggregated['total_water_abstracted'] or Decimal('0')
    total_loss = aggregated['total_production_loss'] or Decimal('0')
    total_supplied = aggregated['total_water_supplied'] or Decimal('0')
    total_power = aggregated['total_power_consumption'] or Decimal('0')
    total_solar = aggregated['total_solar_power'] or Decimal('0')
    total_costs = aggregated['total_costs'] or Decimal('0')
    t_water = aggregated['target_water_abstracted'] or Decimal('0')
    t_supplied = aggregated['target_water_supplied'] or Decimal('0')
    t_loss = aggregated['target_production_loss'] or Decimal('0')
    t_grid = aggregated['target_power_grid'] or Decimal('0')
    t_solar = aggregated['target_power_solar'] or Decimal('0')
    t_power = t_grid + t_solar
    site_ids = set(queryset.values_list('production_site_id', flat=True))

    return {
        'period': period,
        'region': region_id or 'All regions',
        'production_site': production_site_id or 'All sites',
        'total_sites': len(site_ids),
        'active_sites': ProductionSite.objects.filter(id__in=site_ids, is_active=True).count(),
        'total_water_abstracted': decimal_string(total_water),
        'total_water_received': decimal_string(aggregated['total_water_received'] or Decimal('0')),
        'total_water_supplied': decimal_string(total_supplied),
        'total_production_loss': decimal_string(total_loss),
        'production_loss_percentage': decimal_string((total_loss / total_water * Decimal('100')) if total_water else Decimal('0')),
        'total_power_consumption': decimal_string(total_power),
        'total_grid_power': decimal_string(aggregated['total_grid_power'] or Decimal('0')),
        'total_solar_power': decimal_string(total_solar),
        'solar_power_percentage': decimal_string((total_solar / total_power * Decimal('100')) if total_power else Decimal('0')),
        'average_power_efficiency': decimal_string((total_power / total_water) if total_water else Decimal('0')),
        'total_costs': decimal_string(total_costs),
        'total_power_costs': decimal_string(aggregated['total_power_costs'] or Decimal('0')),
        'total_rm_costs': decimal_string(aggregated['total_rm_costs'] or Decimal('0')),
        'total_abstraction_fee': decimal_string(aggregated['total_abstraction_fee'] or Decimal('0')),
        'total_chemical_costs': decimal_string(aggregated['total_chemical_costs'] or Decimal('0')),
        'average_cost_per_m3': decimal_string((total_costs / total_water) if total_water else Decimal('0')),
        'target_realization_percentage': decimal_string((total_water / t_water * Decimal('100')) if t_water else Decimal('0')),
        'target_water_abstracted': decimal_string(t_water),
        'target_water_supplied': decimal_string(t_supplied),
        'target_production_loss': decimal_string(t_loss),
        'target_production_loss_percentage': decimal_string((t_loss / t_water * Decimal('100')) if t_water else Decimal('0')),
        'target_power_consumption': decimal_string(t_power),
        'target_grid_power': decimal_string(t_grid),
        'target_solar_power': decimal_string(t_solar),
        'target_solar_percentage': decimal_string((t_solar / t_power * Decimal('100')) if t_power else Decimal('0')),
        'target_power_efficiency': decimal_string((t_power / t_water) if t_water else Decimal('0')),
        'balance_window': {
            'start_date': start_date.isoformat() if start_date else None,
            'end_date': end_date.isoformat() if end_date else None,
            'is_open': False,
        },
        'data_source': 'HISTORICAL_IMPORT',
        'warnings': [],
    }


def combine_production_dashboard_summaries(imported, balance, period):
    numeric_keys = [
        'total_water_abstracted',
        'total_water_received',
        'total_water_supplied',
        'total_production_loss',
        'total_power_consumption',
        'total_grid_power',
        'total_solar_power',
        'total_costs',
        'total_power_costs',
        'total_rm_costs',
        'total_abstraction_fee',
        'total_chemical_costs',
        'target_water_abstracted',
        'target_water_supplied',
        'target_production_loss',
        'target_power_consumption',
        'target_grid_power',
        'target_solar_power',
    ]
    combined = {
        'period': period,
        'region': imported.get('region') or balance.get('region'),
        'production_site': imported.get('production_site') or balance.get('production_site'),
        'total_sites': max(imported.get('total_sites') or 0, balance.get('total_sites') or 0),
        'active_sites': max(imported.get('active_sites') or 0, balance.get('active_sites') or 0),
        'data_source': 'MIXED',
        'warnings': (imported.get('warnings') or []) + (balance.get('warnings') or []),
        'balance_window': {
            'start_date': imported.get('balance_window', {}).get('start_date'),
            'end_date': balance.get('balance_window', {}).get('end_date'),
            'is_open': bool(balance.get('balance_window', {}).get('is_open')),
        },
    }
    for key in numeric_keys:
        combined[key] = decimal_string(Decimal(str(imported.get(key) or 0)) + Decimal(str(balance.get(key) or 0)))

    total_water = Decimal(combined['total_water_abstracted'])
    total_supplied = Decimal(combined['total_water_supplied'])
    total_loss = Decimal(combined['total_production_loss'])
    total_power = Decimal(combined['total_power_consumption'])
    total_solar = Decimal(combined['total_solar_power'])
    total_costs = Decimal(combined['total_costs'])
    target_water = Decimal(combined['target_water_abstracted'])
    target_supplied = Decimal(combined['target_water_supplied'])
    target_loss = Decimal(combined['target_production_loss'])
    target_power = Decimal(combined['target_power_consumption'])
    target_solar = Decimal(combined['target_solar_power'])

    combined['production_loss_percentage'] = decimal_string(
        (total_loss / total_water * Decimal('100')) if total_water > 0 else Decimal('0')
    )
    combined['solar_power_percentage'] = decimal_string(
        (total_solar / total_power * Decimal('100')) if total_power > 0 else Decimal('0')
    )
    combined['average_power_efficiency'] = decimal_string(
        (total_power / total_water) if total_water > 0 else Decimal('0')
    )
    combined['average_cost_per_m3'] = decimal_string(
        (total_costs / total_supplied) if total_supplied > 0 else Decimal('0')
    )
    combined['target_realization_percentage'] = decimal_string(
        (total_supplied / target_supplied * Decimal('100')) if target_supplied > 0 else Decimal('0')
    )
    combined['target_production_loss_percentage'] = decimal_string(
        (target_loss / target_water * Decimal('100')) if target_water > 0 else Decimal('0')
    )
    combined['target_solar_percentage'] = decimal_string(
        (target_solar / target_power * Decimal('100')) if target_power > 0 else Decimal('0')
    )
    combined['target_power_efficiency'] = decimal_string(
        (target_power / target_water) if target_water > 0 else Decimal('0')
    )
    return combined


def production_dashboard_from_balance(year=None, month=None, fy_year=None, region_id=None, production_site_id=None):
    if fy_year:
        settings = dashboard_settings()
        if date(fy_year + 1, 6, 30) <= settings.historical_import_end_date:
            return production_dashboard_from_imported_records(
                fy_year=fy_year,
                region_id=region_id,
                production_site_id=production_site_id,
            )
        if date(fy_year, 7, 1) <= settings.historical_import_end_date:
            imported = production_dashboard_from_imported_records(
                fy_year=fy_year,
                region_id=region_id,
                production_site_id=production_site_id,
                max_period_end_date=settings.historical_import_end_date,
            )
            balance = production_dashboard_from_balance_engine(
                fy_year=fy_year,
                region_id=region_id,
                production_site_id=production_site_id,
            )
            return combine_production_dashboard_summaries(imported, balance, f"FY {fy_year}/{str(fy_year + 1)[-2:]}")
    elif year and month and month_data_source(year, month) == 'HISTORICAL_IMPORT':
        return production_dashboard_from_imported_records(
            year=year,
            month=month,
            region_id=region_id,
            production_site_id=production_site_id,
        )
    return production_dashboard_from_balance_engine(
        year=year,
        month=month,
        fy_year=fy_year,
        region_id=region_id,
        production_site_id=production_site_id,
    )


def zone_balance_summary(zone, year, month):
    if month_data_source(year, month) == 'HISTORICAL_IMPORT':
        record = (
            MonthlyDistribution.objects
            .select_related('zone__region', 'billing_cycle', 'zone_billing_cycle')
            .filter(zone=zone, billing_cycle__year=year, billing_cycle__month=month)
            .first()
        )
        start_date, end_date = month_bounds(year, month)
        if record:
            supplied = record.volume_supplied_m3
            billed = record.volume_billed_m3
            nrw = record.nrw_m3
            nrw_percentage = record.nrw_percentage
            if record.zone_billing_cycle:
                start_date = record.zone_billing_cycle.opening_date
                end_date = record.zone_billing_cycle.effective_closing_date
            elif record.billing_cycle:
                start_date = record.billing_cycle.start_date
                end_date = record.billing_cycle.end_date
        else:
            supplied = billed = nrw = Decimal('0')
            nrw_percentage = None

        return {
            'id': record.id if record else zone.id,
            'zone': zone.id,
            'zone_name': zone.name,
            'zone_code': zone.code,
            'region_name': zone.region.name,
            'billing_cycle': record.billing_cycle_id if record else None,
            'billing_cycle_details': None,
            'zone_billing_cycle': record.zone_billing_cycle_id if record else None,
            'zone_billing_cycle_details': None,
            'volume_supplied_m3': decimal_string(supplied),
            'volume_billed_m3': decimal_string(billed),
            'nrw_m3': decimal_string(nrw),
            'nrw_percentage': decimal_string(nrw_percentage) if nrw_percentage is not None else None,
            'nrw_target_percentage': decimal_string(record.nrw_target_percentage) if record and record.nrw_target_percentage is not None else None,
            'volume_supplied_target_m3': decimal_string(record.volume_supplied_target_m3) if record and record.volume_supplied_target_m3 is not None else None,
            'volume_supplied_realization_percent': decimal_string(record.volume_supplied_realization_percent) if record and record.volume_supplied_realization_percent is not None else None,
            'nrw_realization_percent': decimal_string(record.nrw_realization_percent) if record and record.nrw_realization_percent is not None else None,
            'is_finalized': bool(record and record.is_finalized),
            'balance_window': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'is_open': False,
            },
            'data_source': 'HISTORICAL_IMPORT',
            'warnings': [],
        }

    zone_cycle = ZoneBillingCycle.objects.filter(zone=zone, year=year, month=month).first()
    if zone_cycle:
        start_date = zone_cycle.opening_date
        end_date = cycle_effective_end(zone_cycle)
    else:
        start_date, end_date = month_bounds(year, month)
        today = timezone.localdate()
        if start_date <= today <= end_date:
            end_date = today

    supplied = (
        DailyDistribution.objects
        .filter(
            zone=zone,
            distribution_date__gte=start_date,
            distribution_date__lte=end_date,
            is_validated=True,
        )
        .aggregate(total=Sum('volume_supplied_m3'))['total'] or Decimal('0')
    )
    billing_data = None
    if zone_cycle:
        billing_data = CustomerBillingData.objects.filter(zone=zone, zone_billing_cycle=zone_cycle).first()
    if billing_data is None:
        billing_data = CustomerBillingData.objects.filter(
            zone=zone,
            billing_cycle__year=year,
            billing_cycle__month=month,
        ).first()
    billed = billing_data.total_volume_billed_m3 if billing_data else Decimal('0')
    nrw = supplied - billed
    nrw_percentage = (nrw / supplied * Decimal('100')) if supplied > 0 else None

    return {
        'id': zone_cycle.id if zone_cycle else zone.id,
        'zone': zone.id,
        'zone_name': zone.name,
        'zone_code': zone.code,
        'region_name': zone.region.name,
        'billing_cycle': None,
        'billing_cycle_details': None,
        'zone_billing_cycle': zone_cycle.id if zone_cycle else None,
        'zone_billing_cycle_details': None,
        'volume_supplied_m3': decimal_string(supplied),
        'volume_billed_m3': decimal_string(billed),
        'nrw_m3': decimal_string(nrw),
        'nrw_percentage': decimal_string(nrw_percentage) if nrw_percentage is not None else None,
        'nrw_target_percentage': None,
        'volume_supplied_target_m3': None,
        'volume_supplied_realization_percent': None,
        'nrw_realization_percent': None,
        'is_finalized': bool(zone_cycle and zone_cycle.is_finalized),
        'balance_window': {
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'is_open': bool(zone_cycle and zone_cycle.is_open),
        },
        'data_source': month_data_source(year, month),
        'warnings': [],
    }


def distribution_zone_summaries_from_balance(year, month, zone_id=None, region_id=None):
    zones = Zone.objects.filter(is_active=True).select_related('region').order_by(
        'region__dashboard_order',
        'dashboard_order',
        'name',
    )
    if zone_id:
        zones = zones.filter(id=zone_id)
    if region_id:
        zones = zones.filter(region_id=region_id)
    return [zone_balance_summary(zone, year, month) for zone in zones]


def distribution_dashboard_from_balance(year, month, zone_id=None, region_id=None):
    rows = distribution_zone_summaries_from_balance(year, month, zone_id=zone_id, region_id=region_id)
    supplied = sum((Decimal(row['volume_supplied_m3']) for row in rows), Decimal('0'))
    billed = sum((Decimal(row['volume_billed_m3']) for row in rows), Decimal('0'))
    nrw = supplied - billed
    return {
        'summary': {
            'total_supplied': decimal_string(supplied),
            'total_billed': decimal_string(billed),
            'total_nrw': decimal_string(nrw),
            'avg_nrw_percent': decimal_string((nrw / supplied * Decimal('100')) if supplied > 0 else Decimal('0')),
        },
        'zone_count': len(rows),
        'zones': rows,
        'data_source': month_data_source(year, month),
    }


def global_nrw_from_balance(year, month, region_id=None):
    if month_data_source(year, month) == 'HISTORICAL_IMPORT':
        global_record = (
            GlobalNRWPerformance.objects
            .select_related('billing_cycle')
            .filter(billing_cycle__year=year, billing_cycle__month=month)
            .first()
        )
        if global_record:
            return {
                'count': 1,
                'next': None,
                'previous': None,
                'results': [{
                    'id': global_record.id,
                    'billing_cycle': global_record.billing_cycle_id,
                    'billing_cycle_details': None,
                    'water_available_for_sale_m3': decimal_string(global_record.water_available_for_sale_m3),
                    'volume_billed_to_customers_m3': decimal_string(global_record.volume_billed_to_customers_m3),
                    'global_nrw_m3': decimal_string(global_record.global_nrw_m3),
                    'global_nrw_percentage': decimal_string(global_record.global_nrw_percentage or Decimal('0')),
                    'transmission_loss_percentage': decimal_string(global_record.transmission_loss_percentage or Decimal('0')),
                    'regional_nrw_percentage': decimal_string(global_record.regional_nrw_percentage or Decimal('0')),
                    'global_nrw_target_percentage': decimal_string(global_record.global_nrw_target_percentage) if global_record.global_nrw_target_percentage is not None else None,
                    'active_water_connections': global_record.active_water_connections,
                    'active_sewer_connections': global_record.active_sewer_connections,
                    'inactive_water_connections': global_record.inactive_water_connections,
                    'inactive_sewer_connections': global_record.inactive_sewer_connections,
                    'total_connections': global_record.total_connections,
                    'maintenance_repair_operational_cost': decimal_string(global_record.maintenance_repair_operational_cost) if global_record.maintenance_repair_operational_cost is not None else None,
                    'data_source': 'HISTORICAL_IMPORT',
                    'balance_window': {
                        'start_date': global_record.billing_cycle.start_date.isoformat(),
                        'end_date': global_record.billing_cycle.end_date.isoformat(),
                        'is_open': False,
                    },
                }],
            }

        dashboard = distribution_dashboard_from_balance(year, month, region_id=region_id)
        supplied = Decimal(dashboard['summary']['total_supplied'])
        billed = Decimal(dashboard['summary']['total_billed'])
        nrw = supplied - billed
        start_date, end_date = month_bounds(year, month)
        return {
            'count': 1,
            'next': None,
            'previous': None,
            'results': [{
                'id': 0,
                'billing_cycle': None,
                'billing_cycle_details': None,
                'water_available_for_sale_m3': decimal_string(supplied),
                'volume_billed_to_customers_m3': decimal_string(billed),
                'global_nrw_m3': decimal_string(nrw),
                'global_nrw_percentage': decimal_string((nrw / supplied * Decimal('100')) if supplied > 0 else Decimal('0')),
                'transmission_loss_percentage': decimal_string(Decimal('0')),
                'regional_nrw_percentage': decimal_string((nrw / supplied * Decimal('100')) if supplied > 0 else Decimal('0')),
                'global_nrw_target_percentage': None,
                'active_water_connections': 0,
                'active_sewer_connections': 0,
                'inactive_water_connections': 0,
                'inactive_sewer_connections': 0,
                'total_connections': 0,
                'maintenance_repair_operational_cost': None,
                'data_source': 'HISTORICAL_IMPORT',
                'balance_window': {
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat(),
                    'is_open': False,
                },
            }],
        }

    rows = distribution_zone_summaries_from_balance(year, month, region_id=region_id)
    supplied = sum((Decimal(row['volume_supplied_m3']) for row in rows), Decimal('0'))
    billed = sum((Decimal(row['volume_billed_m3']) for row in rows), Decimal('0'))
    nrw = supplied - billed
    window = resolve_balance_window(year=year, month=month, distribution_region_id=region_id)
    production_available = (
        DailyProduction.objects
        .filter(production_date__gte=window['start_date'], production_date__lte=window['end_date'], is_validated=True)
        .aggregate(total=Sum('water_available_for_sale_m3'))['total'] or Decimal('0')
    )
    transmission_loss = production_available - supplied
    return {
        'count': 1,
        'next': None,
        'previous': None,
        'results': [{
            'id': 0,
            'billing_cycle': None,
            'billing_cycle_details': None,
            'water_available_for_sale_m3': decimal_string(supplied),
            'volume_billed_to_customers_m3': decimal_string(billed),
            'global_nrw_m3': decimal_string(nrw),
            'global_nrw_percentage': decimal_string((nrw / supplied * Decimal('100')) if supplied > 0 else Decimal('0')),
            'transmission_loss_percentage': decimal_string(
                (transmission_loss / production_available * Decimal('100')) if production_available > 0 else Decimal('0')
            ),
            'regional_nrw_percentage': decimal_string((nrw / supplied * Decimal('100')) if supplied > 0 else Decimal('0')),
            'global_nrw_target_percentage': None,
            'active_water_connections': 0,
            'active_sewer_connections': 0,
            'inactive_water_connections': 0,
            'inactive_sewer_connections': 0,
            'total_connections': 0,
            'maintenance_repair_operational_cost': None,
            'data_source': month_data_source(year, month),
            'balance_window': {
                'start_date': window['start_date'].isoformat(),
                'end_date': window['end_date'].isoformat(),
                'is_open': window['is_open'],
            },
        }],
    }


def distribution_totals_for_period(year, month, region_id=None):
    if month_data_source(year, month) == 'HISTORICAL_IMPORT':
        qs = MonthlyDistribution.objects.filter(billing_cycle__year=year, billing_cycle__month=month)
        if region_id:
            qs = qs.filter(zone__region_id=region_id)
        totals = qs.aggregate(
            supplied=Sum('volume_supplied_m3'),
            billed=Sum('volume_billed_m3'),
        )
        start_date, end_date = month_bounds(year, month)
        first_record = qs.select_related('billing_cycle').first()
        if first_record and first_record.billing_cycle:
            start_date = first_record.billing_cycle.start_date
            end_date = first_record.billing_cycle.end_date
        return {
            'supplied': totals['supplied'] or Decimal('0'),
            'billed': totals['billed'] or Decimal('0'),
            'start_date': start_date,
            'end_date': end_date,
            'data_source': 'HISTORICAL_IMPORT',
        }

    zones = Zone.objects.filter(is_active=True).select_related('region')
    if region_id:
        zones = zones.filter(region_id=region_id)

    supplied = Decimal('0')
    billed = Decimal('0')
    start_dates = []
    end_dates = []
    for zone in zones:
        zone_cycle = ZoneBillingCycle.objects.filter(zone=zone, year=year, month=month).first()
        if zone_cycle:
            start_date = zone_cycle.opening_date
            end_date = cycle_effective_end(zone_cycle)
        else:
            start_date, end_date = month_bounds(year, month)
            today = timezone.localdate()
            if start_date <= today <= end_date:
                end_date = today

        start_dates.append(start_date)
        end_dates.append(end_date)
        supplied += (
            DailyDistribution.objects
            .filter(
                zone=zone,
                distribution_date__gte=start_date,
                distribution_date__lte=end_date,
                is_validated=True,
            )
            .aggregate(total=Sum('volume_supplied_m3'))['total'] or Decimal('0')
        )
        billing_data = None
        if zone_cycle:
            billing_data = CustomerBillingData.objects.filter(zone=zone, zone_billing_cycle=zone_cycle).first()
        if billing_data is None:
            billing_data = CustomerBillingData.objects.filter(
                zone=zone,
                billing_cycle__year=year,
                billing_cycle__month=month,
            ).first()
        if billing_data:
            billed += billing_data.total_volume_billed_m3

    return {
        'supplied': supplied,
        'billed': billed,
        'start_date': min(start_dates) if start_dates else None,
        'end_date': max(end_dates) if end_dates else None,
        'data_source': month_data_source(year, month),
    }


def distribution_fy_trend_from_balance(mode='fy', fy_year=None, up_to_month=6, anchor_year=None, anchor_month=None, region_id=None):
    if mode == 'rolling_12':
        periods = []
        anchor = date(anchor_year, anchor_month, 1)
        for offset in range(11, -1, -1):
            month_index = anchor.month - offset
            year = anchor.year + (month_index - 1) // 12
            month = (month_index - 1) % 12 + 1
            periods.append((year, month))
    else:
        periods = month_sequence_for_fy(fy_year)
        allowed_months = set(range(7, 13)) | set(range(1, up_to_month + 1))
        periods = [(year, month) for year, month in periods if month in allowed_months]

    month_labels = {
        1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun',
        7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec',
    }
    points = []
    for year, month in periods:
        totals = distribution_totals_for_period(year, month, region_id=region_id)
        supplied = totals['supplied']
        billed = totals['billed']
        nrw = supplied - billed
        nrw_pct = (nrw / supplied * Decimal('100')) if supplied > 0 else Decimal('0')
        production_available = Decimal('0')
        if totals['start_date'] and totals['end_date']:
            production_available = (
                DailyProduction.objects
                .filter(
                    production_date__gte=totals['start_date'],
                    production_date__lte=totals['end_date'],
                    is_validated=True,
                )
                .aggregate(total=Sum('water_available_for_sale_m3'))['total'] or Decimal('0')
            )
        transmission = (
            (production_available - supplied) / production_available * Decimal('100')
            if production_available > 0 else Decimal('0')
        )
        points.append({
            'month': month_labels[month],
            'period': f'{year}-{month:02d}',
            'waterSupplied': decimal_to_float(supplied),
            'waterBilled': decimal_to_float(billed),
            'nrwPercentage': decimal_to_float(nrw_pct),
            'transmissionLoss': decimal_to_float(transmission),
            'target': 22,
            'dataSource': totals['data_source'],
        })
    return points
