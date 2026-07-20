import { type ReactNode, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertTriangle, Filter, GitBranch, RefreshCw } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type {
  ProductionSite,
  WaterBalanceModel,
  WaterBalanceNode,
  WaterBalanceNodeInput,
  WaterBalanceRule,
  WaterBalanceRuleMethod,
  WaterMeter,
  Zone,
} from '@/types/api';

const ALL_VALUE = 'all';

type GraphTone = 'site' | 'meter' | 'balance' | 'zone' | 'warning';

interface GraphNodeData extends Record<string, unknown> {
  title: string;
  subtitle: string;
  badge: string;
  tone: GraphTone;
}

type BalanceGraphNode = Node<GraphNodeData, 'balanceNode'>;
type BalanceGraphEdge = Edge<{ tone?: GraphTone }>;

interface WaterBalanceVisualModelProps {
  zones: Zone[];
  sites: ProductionSite[];
  meters: WaterMeter[];
  nodes: WaterBalanceNode[];
  models: WaterBalanceModel[];
  rules: WaterBalanceRule[];
  inputs: WaterBalanceNodeInput[];
  loading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}

const nodeTypes = {
  balanceNode: BalanceGraphNodeCard,
};

const methodOptions: Array<{ value: WaterBalanceRuleMethod | typeof ALL_VALUE; label: string }> = [
  { value: ALL_VALUE, label: 'All methods' },
  { value: 'METERED_VOLUME', label: 'Metered volume' },
  { value: 'MIXING_NODE_SHARE', label: 'Mixing node share' },
  { value: 'FIXED_PERCENTAGE', label: 'Fixed percentage' },
  { value: 'FIXED_WEIGHT', label: 'Fixed weight' },
  { value: 'MANUAL_OVERRIDE', label: 'Manual override' },
];

function BalanceGraphNodeCard({ data }: NodeProps<BalanceGraphNode>) {
  const toneClasses: Record<GraphTone, string> = {
    site: 'border-blue-300 bg-blue-50 text-blue-950',
    meter: 'border-orange-300 bg-orange-50 text-orange-950',
    balance: 'border-emerald-300 bg-emerald-50 text-emerald-950',
    zone: 'border-slate-300 bg-slate-50 text-slate-950',
    warning: 'border-red-300 bg-red-50 text-red-950',
  };

  return (
    <div className={`min-w-[190px] rounded-md border px-3 py-2 shadow-sm ${toneClasses[data.tone]}`}>
      <Handle type="target" position={Position.Left} className="h-2.5 w-2.5" />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{data.title}</div>
          <div className="mt-0.5 line-clamp-2 text-[11px] opacity-75">{data.subtitle}</div>
        </div>
        <span className="shrink-0 rounded border border-current/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase opacity-75">
          {data.badge}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="h-2.5 w-2.5" />
    </div>
  );
}

function addNode(
  nodeMap: Map<string, BalanceGraphNode>,
  id: string,
  data: GraphNodeData,
  column: number,
  rowTracker: Map<number, number>,
) {
  if (nodeMap.has(id)) {
    return;
  }

  const row = rowTracker.get(column) ?? 0;
  rowTracker.set(column, row + 1);
  nodeMap.set(id, {
    id,
    type: 'balanceNode',
    position: { x: column * 320, y: row * 110 },
    data,
  });
}

function edgeStyle(tone?: GraphTone) {
  const colors: Record<GraphTone, string> = {
    site: '#2563eb',
    meter: '#f97316',
    balance: '#16a34a',
    zone: '#475569',
    warning: '#dc2626',
  };
  return {
    stroke: tone ? colors[tone] : '#64748b',
    strokeWidth: 2,
  };
}

function addEdge(edgeMap: Map<string, BalanceGraphEdge>, edge: BalanceGraphEdge) {
  if (edgeMap.has(edge.id)) {
    return;
  }
  edgeMap.set(edge.id, {
    animated: edge.data?.tone === 'balance',
    markerEnd: { type: MarkerType.ArrowClosed },
    ...edge,
    style: edgeStyle(edge.data?.tone),
  });
}

function sourceNodeId(siteId: number) {
  return `site-${siteId}`;
}

function meterNodeId(meterId: number) {
  return `meter-${meterId}`;
}

function balanceNodeId(nodeId: number) {
  return `balance-node-${nodeId}`;
}

function zoneNodeId(zoneId: number) {
  return `zone-${zoneId}`;
}

function methodLabel(method: WaterBalanceRuleMethod) {
  return method.replaceAll('_', ' ').toLowerCase();
}

function listNames(names: string[]) {
  const uniqueNames = Array.from(new Set(names.filter(Boolean)));
  if (uniqueNames.length === 0) return 'none';
  if (uniqueNames.length === 1) return uniqueNames[0];
  if (uniqueNames.length === 2) return `${uniqueNames[0]} and ${uniqueNames[1]}`;
  return `${uniqueNames.slice(0, -1).join(', ')}, and ${uniqueNames[uniqueNames.length - 1]}`;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildWarnings(
  models: WaterBalanceModel[],
  rules: WaterBalanceRule[],
  nodes: WaterBalanceNode[],
  inputs: WaterBalanceNodeInput[],
) {
  const warnings: string[] = [];
  const inputsByNode = new Map<number, WaterBalanceNodeInput[]>();
  const rulesByModel = new Map<number, WaterBalanceRule[]>();
  const mixingRulesByNode = new Map<number, WaterBalanceRule[]>();

  inputs.forEach((input) => {
    inputsByNode.set(input.node, [...(inputsByNode.get(input.node) ?? []), input]);
  });
  rules.forEach((rule) => {
    rulesByModel.set(rule.balance_model, [...(rulesByModel.get(rule.balance_model) ?? []), rule]);
    if (rule.mixing_node) {
      mixingRulesByNode.set(rule.mixing_node, [...(mixingRulesByNode.get(rule.mixing_node) ?? []), rule]);
    }
  });

  models.forEach((model) => {
    if (!(rulesByModel.get(model.id)?.length)) {
      warnings.push(`${model.zone_name} has an active model with no active rules.`);
    }
  });

  nodes.forEach((node) => {
    if (!(inputsByNode.get(node.id)?.length) && !(mixingRulesByNode.get(node.id)?.length)) {
      warnings.push(`${node.name} is active, but has no active inputs or rule outputs.`);
    }
  });

  rules.forEach((rule) => {
    if (rule.method === 'METERED_VOLUME' && !rule.water_meter) {
      warnings.push(`${rule.zone_name} / ${rule.production_site_name} uses metered volume without a meter.`);
    }
    if (rule.method === 'MIXING_NODE_SHARE' && !rule.mixing_node) {
      warnings.push(`${rule.zone_name} / ${rule.production_site_name} uses mixing-node share without a node.`);
    }
    if (rule.method === 'MIXING_NODE_SHARE' && rule.mixing_node) {
      const matchingInput = (inputsByNode.get(rule.mixing_node) ?? []).some(
        (input) => input.production_site === rule.production_site,
      );
      if (!matchingInput) {
        warnings.push(`${rule.zone_name} / ${rule.production_site_name} uses ${rule.mixing_node_name}, but that node has no matching input for this production site.`);
      }
    }
  });

  inputs
    .filter((input) => input.input_method === 'RESIDUAL' || input.confidence === 'ESTIMATED')
    .forEach((input) => {
      warnings.push(`${input.node_name} includes estimated or residual input from ${input.production_site_name}.`);
    });

  return Array.from(new Set(warnings));
}

function buildNarrative({
  regionFilter,
  zoneFilter,
  siteFilter,
  methodFilter,
  zones,
  sites,
  models,
  rules,
  inputs,
  warnings,
}: {
  regionFilter: string;
  zoneFilter: string;
  siteFilter: string;
  methodFilter: string;
  zones: Zone[];
  sites: ProductionSite[];
  models: WaterBalanceModel[];
  rules: WaterBalanceRule[];
  inputs: WaterBalanceNodeInput[];
  warnings: string[];
}) {
  const selectedRegion = regionFilter === ALL_VALUE ? 'all regions' : regionFilter;
  const selectedZone = zoneFilter === ALL_VALUE
    ? null
    : zones.find((zone) => zone.id === Number(zoneFilter))?.name;
  const selectedSite = siteFilter === ALL_VALUE
    ? null
    : sites.find((site) => site.id === Number(siteFilter))?.name;
  const selectedMethod = methodFilter === ALL_VALUE ? null : methodLabel(methodFilter as WaterBalanceRuleMethod);
  const zoneNames = models.map((model) => model.zone_name);
  const sourceNames = rules.map((rule) => rule.production_site_name);
  const inputNodeNames = inputs.map((input) => input.node_name);
  const directRules = rules.filter((rule) => rule.method === 'METERED_VOLUME');
  const mixingRules = rules.filter((rule) => rule.method === 'MIXING_NODE_SHARE');
  const fixedRules = rules.filter((rule) => rule.method === 'FIXED_PERCENTAGE' || rule.method === 'FIXED_WEIGHT');
  const manualRules = rules.filter((rule) => rule.method === 'MANUAL_OVERRIDE');
  const residualInputs = inputs.filter((input) => input.input_method === 'RESIDUAL' || input.confidence === 'ESTIMATED');

  if (rules.length === 0 && inputs.length === 0) {
    const scope = [
      selectedSite ? `production site ${selectedSite}` : null,
      selectedZone ? `zone ${selectedZone}` : null,
      selectedMethod ? `method ${selectedMethod}` : null,
    ].filter(Boolean).join(', ');
    return [
      `The current filters${scope ? ` for ${scope}` : ''} do not match any active water-balance rules or node inputs.`,
      'Either the selected scope has not been configured yet, or the active model/rule filters are excluding the relevant records.',
    ];
  }

  const scopeParts = [
    selectedSite ? `production site ${selectedSite}` : null,
    selectedZone ? `zone ${selectedZone}` : `${pluralize(new Set(zoneNames).size, 'zone')}`,
    selectedMethod ? `using ${selectedMethod} rules` : null,
  ].filter(Boolean);

  const paragraphs = [
    `This view is showing ${scopeParts.join(' across ')} in ${selectedRegion}. It includes ${pluralize(models.length, 'active balance model')}, ${pluralize(rules.length, 'active rule')}, and ${pluralize(inputs.length, 'visible node input')}.`,
  ];

  if (sourceNames.length) {
    paragraphs.push(`The visible production sources are ${listNames(sourceNames)}. These sources are attributed to ${listNames(zoneNames)}.`);
  }

  if (inputs.length) {
    const inputSources = inputs.map((input) => `${input.production_site_name} into ${input.node_name}`);
    paragraphs.push(`The visible node inputs are ${listNames(inputSources)}. These inputs are used to calculate source ratios for any mixing-node-share routes in the filtered view.`);
  }

  if (directRules.length) {
    const routes = directRules.map((rule) => {
      const meter = rule.water_meter_name || 'an assigned meter';
      return `${rule.production_site_name} to ${rule.zone_name} through ${meter}`;
    });
    paragraphs.push(`Direct metered attribution is configured for ${listNames(routes)}. For these paths, the selected meter volume is used directly in the source attribution.`);
  }

  if (mixingRules.length) {
    const nodesUsed = mixingRules.map((rule) => rule.mixing_node_name || 'a mixing node');
    const routes = mixingRules.map((rule) => `${rule.production_site_name} to ${rule.zone_name}`);
    paragraphs.push(`Mixing-node attribution is configured through ${listNames(nodesUsed)} for ${listNames(routes)}. For these paths, the zone supply is split using the input ratios calculated at the mixing node.`);
  }

  if (fixedRules.length) {
    const fixedDescriptions = fixedRules.map((rule) => `${rule.zone_name}: ${rule.production_site_name} at ${rule.basis_value ?? 'configured'} basis`);
    paragraphs.push(`Fixed allocation is configured for ${listNames(fixedDescriptions)}. These rules attribute the measured zone supply by configured weight or percentage rather than by a transfer meter.`);
  }

  if (manualRules.length) {
    paragraphs.push(`Manual override rules are visible for ${listNames(manualRules.map((rule) => `${rule.production_site_name} to ${rule.zone_name}`))}. These should be reviewed carefully because they bypass meter-based attribution.`);
  }

  if (residualInputs.length) {
    paragraphs.push(`Review note: ${listNames(residualInputs.map((input) => `${input.production_site_name} into ${input.node_name}`))} uses residual or estimated input logic.`);
  }

  if (warnings.length) {
    paragraphs.push(`There ${warnings.length === 1 ? 'is' : 'are'} ${pluralize(warnings.length, 'configuration review flag')} in this filtered view. Resolve or explicitly accept these before rollout.`);
  }

  return paragraphs;
}

export function WaterBalanceVisualModel({
  zones,
  sites,
  meters,
  nodes,
  models,
  rules,
  inputs,
  loading,
  onRefresh,
  refreshing,
}: WaterBalanceVisualModelProps) {
  const [regionFilter, setRegionFilter] = useState(ALL_VALUE);
  const [zoneFilter, setZoneFilter] = useState(ALL_VALUE);
  const [siteFilter, setSiteFilter] = useState(ALL_VALUE);
  const [methodFilter, setMethodFilter] = useState<string>(ALL_VALUE);

  const regions = useMemo(
    () => Array.from(new Set(models.map((model) => model.distribution_region_name).filter(Boolean))).sort(),
    [models],
  );

  const filteredModels = useMemo(() => {
    return models.filter((model) => {
      if (regionFilter !== ALL_VALUE && model.distribution_region_name !== regionFilter) return false;
      if (zoneFilter !== ALL_VALUE && model.zone !== Number(zoneFilter)) return false;
      return true;
    });
  }, [models, regionFilter, zoneFilter]);

  const graphData = useMemo(() => {
    const modelIds = new Set(filteredModels.map((model) => model.id));
    const zoneIds = new Set(filteredModels.map((model) => model.zone));
    const visibleRules = rules.filter((rule) => {
      if (!modelIds.has(rule.balance_model)) return false;
      if (siteFilter !== ALL_VALUE && rule.production_site !== Number(siteFilter)) return false;
      if (methodFilter !== ALL_VALUE && rule.method !== methodFilter) return false;
      return true;
    });
    const visibleMixingNodeIds = new Set(
      visibleRules
        .map((rule) => rule.mixing_node)
        .filter((id): id is number => typeof id === 'number'),
    );
    const visibleInputSiteIds = new Set(visibleRules.map((rule) => rule.production_site));
    const visibleInputs = inputs.filter((input) => {
      const connectedToVisibleRule = visibleMixingNodeIds.has(input.node);
      const matchesSite = siteFilter === ALL_VALUE || input.production_site === Number(siteFilter);
      return connectedToVisibleRule && matchesSite || visibleInputSiteIds.has(input.production_site) && visibleMixingNodeIds.has(input.node);
    });

    const graphNodes = new Map<string, BalanceGraphNode>();
    const graphEdges = new Map<string, BalanceGraphEdge>();
    const rowTracker = new Map<number, number>();
    const sitesById = new Map(sites.map((site) => [site.id, site]));
    const metersById = new Map(meters.map((meter) => [meter.id, meter]));
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const zonesById = new Map(zones.map((zone) => [zone.id, zone]));

    visibleInputs.forEach((input) => {
      const site = sitesById.get(input.production_site);
      const node = nodesById.get(input.node);
      if (!node) return;

      addNode(graphNodes, sourceNodeId(input.production_site), {
        title: input.production_site_name,
        subtitle: site?.region_name || input.production_site_code,
        badge: 'site',
        tone: 'site',
      }, 0, rowTracker);

      addNode(graphNodes, balanceNodeId(input.node), {
        title: input.node_name,
        subtitle: node.node_type_display,
        badge: 'node',
        tone: input.input_method === 'RESIDUAL' ? 'warning' : 'balance',
      }, 2, rowTracker);

      if (input.water_meter) {
        const meter = metersById.get(input.water_meter);
        addNode(graphNodes, meterNodeId(input.water_meter), {
          title: input.water_meter_name || meter?.display_label || meter?.meter_number || 'Water meter',
          subtitle: input.input_method_display,
          badge: 'meter',
          tone: 'meter',
        }, 1, rowTracker);
        addEdge(graphEdges, {
          id: `input-site-meter-${input.id}`,
          source: sourceNodeId(input.production_site),
          target: meterNodeId(input.water_meter),
          label: input.production_site_name,
          data: { tone: 'meter' },
        });
        addEdge(graphEdges, {
          id: `input-meter-node-${input.id}`,
          source: meterNodeId(input.water_meter),
          target: balanceNodeId(input.node),
          label: input.input_method_display,
          data: { tone: input.input_method === 'RESIDUAL' ? 'warning' : 'balance' },
        });
      } else {
        addEdge(graphEdges, {
          id: `input-site-node-${input.id}`,
          source: sourceNodeId(input.production_site),
          target: balanceNodeId(input.node),
          label: input.input_method_display,
          data: { tone: input.input_method === 'RESIDUAL' ? 'warning' : 'balance' },
        });
      }
    });

    visibleRules.forEach((rule) => {
      const site = sitesById.get(rule.production_site);
      const model = filteredModels.find((item) => item.id === rule.balance_model);
      const zoneId = model?.zone;
      const zone = zoneId ? zonesById.get(zoneId) : null;
      if (!zoneId) return;

      addNode(graphNodes, sourceNodeId(rule.production_site), {
        title: rule.production_site_name,
        subtitle: site?.region_name || rule.production_site_code,
        badge: 'site',
        tone: 'site',
      }, 0, rowTracker);
      addNode(graphNodes, zoneNodeId(zoneId), {
        title: rule.zone_name,
        subtitle: zone?.region_name || model?.distribution_region_name || '',
        badge: 'zone',
        tone: 'zone',
      }, 3, rowTracker);

      if (rule.method === 'METERED_VOLUME' && rule.water_meter) {
        const meter = metersById.get(rule.water_meter);
        addNode(graphNodes, meterNodeId(rule.water_meter), {
          title: rule.water_meter_name || meter?.display_label || meter?.meter_number || 'Water meter',
          subtitle: rule.route_name || rule.method_display,
          badge: 'meter',
          tone: 'meter',
        }, 1, rowTracker);
        addEdge(graphEdges, {
          id: `rule-site-meter-${rule.id}`,
          source: sourceNodeId(rule.production_site),
          target: meterNodeId(rule.water_meter),
          label: rule.production_site_name,
          data: { tone: 'meter' },
        });
        addEdge(graphEdges, {
          id: `rule-meter-zone-${rule.id}`,
          source: meterNodeId(rule.water_meter),
          target: zoneNodeId(zoneId),
          label: rule.route_name || methodLabel(rule.method),
          data: { tone: 'meter' },
        });
        return;
      }

      if (rule.method === 'MIXING_NODE_SHARE' && rule.mixing_node) {
        const node = nodesById.get(rule.mixing_node);
        addNode(graphNodes, balanceNodeId(rule.mixing_node), {
          title: rule.mixing_node_name || node?.name || 'Mixing node',
          subtitle: node?.node_type_display || rule.method_display,
          badge: 'node',
          tone: 'balance',
        }, 2, rowTracker);
        addEdge(graphEdges, {
          id: `rule-node-zone-${rule.id}`,
          source: balanceNodeId(rule.mixing_node),
          target: zoneNodeId(zoneId),
          label: rule.route_name || rule.production_site_name,
          data: { tone: 'balance' },
        });
        return;
      }

      addEdge(graphEdges, {
        id: `rule-site-zone-${rule.id}`,
        source: sourceNodeId(rule.production_site),
        target: zoneNodeId(zoneId),
        label: rule.basis_value ? `${methodLabel(rule.method)} ${rule.basis_value}` : methodLabel(rule.method),
        data: { tone: rule.method === 'MANUAL_OVERRIDE' ? 'warning' : 'site' },
      });
    });

    const warnings = buildWarnings(filteredModels, visibleRules, nodes, visibleInputs);

    return {
      nodes: Array.from(graphNodes.values()),
      edges: Array.from(graphEdges.values()),
      warnings,
      visibleRules,
      visibleInputs,
    };
  }, [filteredModels, inputs, methodFilter, meters, nodes, rules, siteFilter, sites, zones]);
  const narrative = useMemo(
    () => buildNarrative({
      regionFilter,
      zoneFilter,
      siteFilter,
      methodFilter,
      zones,
      sites,
      models: filteredModels,
      rules: graphData.visibleRules,
      inputs: graphData.visibleInputs,
      warnings: graphData.warnings,
    }),
    [
      filteredModels,
      graphData.visibleInputs,
      graphData.visibleRules,
      graphData.warnings,
      methodFilter,
      regionFilter,
      siteFilter,
      sites,
      zoneFilter,
      zones,
    ],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <GitBranch className="h-4 w-4" />
              Live Balance Model
            </CardTitle>
            <CardDescription>
              Generated directly from active water-balance models, rules, nodes, and node inputs.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={onRefresh} disabled={refreshing} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <GraphFilter label="Region" value={regionFilter} onChange={setRegionFilter}>
            <SelectItem value={ALL_VALUE}>All regions</SelectItem>
            {regions.map((region) => <SelectItem key={region} value={region}>{region}</SelectItem>)}
          </GraphFilter>
          <GraphFilter label="Zone" value={zoneFilter} onChange={setZoneFilter}>
            <SelectItem value={ALL_VALUE}>All zones</SelectItem>
            {zones.map((zone) => <SelectItem key={zone.id} value={String(zone.id)}>{zone.name}</SelectItem>)}
          </GraphFilter>
          <GraphFilter label="Production site" value={siteFilter} onChange={setSiteFilter}>
            <SelectItem value={ALL_VALUE}>All sites</SelectItem>
            {sites.map((site) => <SelectItem key={site.id} value={String(site.id)}>{site.name}</SelectItem>)}
          </GraphFilter>
          <GraphFilter label="Method" value={methodFilter} onChange={setMethodFilter}>
            {methodOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </GraphFilter>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricTile label="Visible rules" value={graphData.visibleRules.length} />
        <MetricTile label="Visible inputs" value={graphData.visibleInputs.length} />
        <MetricTile label="Graph nodes" value={graphData.nodes.length} />
        <MetricTile label="Warnings" value={graphData.warnings.length} warning={graphData.warnings.length > 0} />
      </div>

      {graphData.warnings.length ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Configuration review flags</AlertTitle>
          <AlertDescription className="space-y-1">
            {graphData.warnings.slice(0, 8).map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            {graphData.warnings.length > 8 ? (
              <p>{graphData.warnings.length - 8} more flags hidden by this view.</p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <div className="h-[680px] min-h-[520px] overflow-hidden rounded-md border bg-background">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading visual model...
              </div>
            ) : graphData.nodes.length ? (
              <ReactFlow
                nodes={graphData.nodes}
                edges={graphData.edges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.2}
                maxZoom={1.6}
                nodesDraggable
              >
                <MiniMap pannable zoomable />
                <Controls />
                <Background gap={24} size={1} />
              </ReactFlow>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <Filter className="h-5 w-5" />
                No configured balance graph matches the current filters.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Legend</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge className="bg-blue-100 text-blue-950 hover:bg-blue-100">Production site</Badge>
          <Badge className="bg-orange-100 text-orange-950 hover:bg-orange-100">Meter</Badge>
          <Badge className="bg-emerald-100 text-emerald-950 hover:bg-emerald-100">Balance node</Badge>
          <Badge className="bg-slate-100 text-slate-950 hover:bg-slate-100">Zone</Badge>
          <Badge className="bg-red-100 text-red-950 hover:bg-red-100">Estimated / review</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Model Description</CardTitle>
          <CardDescription>
            Plain-language explanation for the current visual filters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
          {narrative.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function GraphFilter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

function MetricTile({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${warning ? 'text-destructive' : 'text-foreground'}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
