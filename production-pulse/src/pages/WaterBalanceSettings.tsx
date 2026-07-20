import { type FormEvent, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import {
  AlertTriangle,
  ArrowRightLeft,
  Factory,
  GitBranch,
  Gauge,
  ListChecks,
  Network,
  PlusCircle,
  Route,
  Settings2,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useZones } from '@/hooks/useDistribution';
import { useWaterMeters } from '@/hooks/useMetering';
import { useProductionSites } from '@/hooks/useProduction';
import { WaterBalanceVisualModel } from '@/components/water-balance/WaterBalanceVisualModel';
import {
  useConfiguredSourceAttributions,
  useCreateWaterBalanceModel,
  useCreateWaterBalanceNode,
  useCreateWaterBalanceNodeInput,
  useCreateWaterBalanceRule,
  useWaterBalanceModels,
  useWaterBalanceNodeInputs,
  useWaterBalanceNodes,
  useWaterBalanceRules,
  useZoneCycleSourceAttributions,
} from '@/hooks/useWaterBalance';
import type {
  WaterBalanceConfidence,
  WaterBalanceNodeInputMethod,
  WaterBalanceNodeType,
  WaterBalanceRuleMethod,
} from '@/types/api';

const ALL_VALUE = 'all';
const NONE_VALUE = 'none';

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultStartDate() {
  const today = new Date();
  return toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1));
}

function defaultEndDate() {
  return toDateInputValue(new Date());
}

function formatVolume(value?: number | string | null) {
  const numberValue = typeof value === 'string' ? Number(value) : value ?? 0;
  return new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(
    Number.isFinite(numberValue) ? numberValue : 0,
  );
}

function formatPercent(value?: number | string | null) {
  const numberValue = typeof value === 'string' ? Number(value) : value ?? 0;
  return `${new Intl.NumberFormat('en-KE', { maximumFractionDigits: 1 }).format(
    Number.isFinite(numberValue) ? numberValue : 0,
  )}%`;
}

function errorDetail(error: unknown) {
  const responseData = error instanceof AxiosError ? error.response?.data : null;
  if (!responseData) return 'The backend rejected this configuration.';
  if (typeof responseData === 'string') return responseData;
  return Object.entries(responseData)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
    .join(' ');
}

export default function WaterBalanceSettings() {
  const { toast } = useToast();
  const now = new Date();
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [zoneFilter, setZoneFilter] = useState(ALL_VALUE);
  const [siteFilter, setSiteFilter] = useState(ALL_VALUE);
  const [cycleZone, setCycleZone] = useState('');
  const [cycleYear, setCycleYear] = useState(String(now.getFullYear()));
  const [cycleMonth, setCycleMonth] = useState(String(now.getMonth() + 1));

  const [nodeForm, setNodeForm] = useState({
    name: '',
    code: '',
    node_type: 'MIXING_NODE' as WaterBalanceNodeType,
    production_site: NONE_VALUE,
    notes: '',
  });
  const [modelForm, setModelForm] = useState({
    name: '',
    zone: '',
    effective_start_date: defaultEndDate(),
    effective_end_date: '',
    notes: '',
  });
  const [inputForm, setInputForm] = useState({
    node: '',
    production_site: '',
    input_method: 'SITE_PRODUCTION' as WaterBalanceNodeInputMethod,
    water_meter: NONE_VALUE,
    confidence: 'MEASURED' as WaterBalanceConfidence,
    priority: '0',
    effective_start_date: '',
    effective_end_date: '',
    notes: '',
  });
  const [ruleForm, setRuleForm] = useState({
    balance_model: '',
    production_site: '',
    route_name: '',
    method: 'MIXING_NODE_SHARE' as WaterBalanceRuleMethod,
    basis_value: '',
    water_meter: NONE_VALUE,
    mixing_node: NONE_VALUE,
    manual_volume_m3: '',
    confidence: 'MEASURED_ALLOCATED' as WaterBalanceConfidence,
    priority: '0',
    effective_start_date: '',
    effective_end_date: '',
    notes: '',
  });

  const selectedZoneId = zoneFilter === ALL_VALUE ? undefined : Number(zoneFilter);
  const selectedSiteId = siteFilter === ALL_VALUE ? undefined : Number(siteFilter);

  const attributionParams = useMemo(
    () => ({
      start_date: startDate,
      end_date: endDate,
      ...(selectedZoneId ? { zone: selectedZoneId } : {}),
      ...(selectedSiteId ? { production_site: selectedSiteId } : {}),
    }),
    [endDate, selectedSiteId, selectedZoneId, startDate],
  );
  const cycleParams = useMemo(
    () => ({
      zone: Number(cycleZone),
      year: Number(cycleYear),
      month: Number(cycleMonth),
      ...(selectedSiteId ? { production_site: selectedSiteId } : {}),
    }),
    [cycleMonth, cycleYear, cycleZone, selectedSiteId],
  );

  const { data: zonesData } = useZones({ is_active: true });
  const { data: sitesData } = useProductionSites({ is_active: true });
  const { data: metersData } = useWaterMeters({ is_active: true, ordering: 'display_name,meter_number' });
  const {
    data: nodesData,
    isLoading: nodesLoading,
    isFetching: nodesFetching,
    refetch: refetchNodes,
  } = useWaterBalanceNodes({ is_active: true, ordering: 'name' });
  const {
    data: modelsData,
    isLoading: modelsLoading,
    isFetching: modelsFetching,
    refetch: refetchModels,
  } = useWaterBalanceModels({
    is_active: true,
    ordering: 'zone__region__dashboard_order,zone__dashboard_order,zone__name,-effective_start_date',
  });
  const {
    data: rulesData,
    isLoading: rulesLoading,
    isFetching: rulesFetching,
    refetch: refetchRules,
  } = useWaterBalanceRules({ is_active: true, ordering: 'priority' });
  const {
    data: inputsData,
    isLoading: inputsLoading,
    isFetching: inputsFetching,
    refetch: refetchInputs,
  } = useWaterBalanceNodeInputs({ is_active: true, ordering: 'priority' });
  const report = useConfiguredSourceAttributions(attributionParams);
  const cycleReport = useZoneCycleSourceAttributions(cycleParams, { enabled: !!cycleZone });

  const createNode = useCreateWaterBalanceNode();
  const createModel = useCreateWaterBalanceModel();
  const createInput = useCreateWaterBalanceNodeInput();
  const createRule = useCreateWaterBalanceRule();

  const zones = zonesData?.results ?? [];
  const sites = sitesData?.results ?? [];
  const meters = metersData?.results ?? [];
  const nodes = nodesData?.results ?? [];
  const models = modelsData?.results ?? [];
  const rules = rulesData?.results ?? [];
  const inputs = inputsData?.results ?? [];

  const allocationData = cycleZone ? cycleReport.data : report.data;
  const isReportLoading = cycleZone ? cycleReport.isLoading : report.isLoading;
  const warnings = allocationData?.warnings ?? [];
  const allocationGap = Math.max(
    0,
    (allocationData?.total_zone_supply_m3 ?? 0) - (allocationData?.total_allocated_volume_m3 ?? 0),
  );
  const visualModelLoading = nodesLoading || modelsLoading || rulesLoading || inputsLoading;
  const visualModelRefreshing = nodesFetching || modelsFetching || rulesFetching || inputsFetching;

  function refreshVisualModel() {
    void Promise.all([
      refetchNodes(),
      refetchModels(),
      refetchRules(),
      refetchInputs(),
    ]);
  }

  async function submitNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createNode.mutateAsync({
        name: nodeForm.name,
        code: nodeForm.code,
        node_type: nodeForm.node_type,
        production_site: nodeForm.production_site === NONE_VALUE ? null : Number(nodeForm.production_site),
        is_active: true,
        notes: nodeForm.notes,
      });
      setNodeForm({ name: '', code: '', node_type: 'MIXING_NODE', production_site: NONE_VALUE, notes: '' });
      toast({ title: 'Water balance node saved.' });
    } catch (error) {
      toast({ title: 'Could not save node.', description: errorDetail(error), variant: 'destructive' });
    }
  }

  async function submitModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createModel.mutateAsync({
        name: modelForm.name,
        zone: Number(modelForm.zone),
        effective_start_date: modelForm.effective_start_date,
        effective_end_date: modelForm.effective_end_date || null,
        is_active: true,
        notes: modelForm.notes,
      });
      setModelForm({ name: '', zone: '', effective_start_date: defaultEndDate(), effective_end_date: '', notes: '' });
      toast({ title: 'Water balance model saved.' });
    } catch (error) {
      toast({ title: 'Could not save model.', description: errorDetail(error), variant: 'destructive' });
    }
  }

  async function submitInput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createInput.mutateAsync({
        node: Number(inputForm.node),
        production_site: Number(inputForm.production_site),
        input_method: inputForm.input_method,
        water_meter: inputForm.water_meter === NONE_VALUE ? null : Number(inputForm.water_meter),
        confidence: inputForm.confidence,
        priority: Number(inputForm.priority || 0),
        is_active: true,
        effective_start_date: inputForm.effective_start_date || null,
        effective_end_date: inputForm.effective_end_date || null,
        notes: inputForm.notes,
      });
      setInputForm({
        node: '',
        production_site: '',
        input_method: 'SITE_PRODUCTION',
        water_meter: NONE_VALUE,
        confidence: 'MEASURED',
        priority: '0',
        effective_start_date: '',
        effective_end_date: '',
        notes: '',
      });
      toast({ title: 'Node input saved.' });
    } catch (error) {
      toast({ title: 'Could not save node input.', description: errorDetail(error), variant: 'destructive' });
    }
  }

  async function submitRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createRule.mutateAsync({
        balance_model: Number(ruleForm.balance_model),
        production_site: Number(ruleForm.production_site),
        route_name: ruleForm.route_name,
        method: ruleForm.method,
        basis_value: ruleForm.basis_value ? Number(ruleForm.basis_value) : null,
        water_meter: ruleForm.water_meter === NONE_VALUE ? null : Number(ruleForm.water_meter),
        mixing_node: ruleForm.mixing_node === NONE_VALUE ? null : Number(ruleForm.mixing_node),
        manual_volume_m3: ruleForm.manual_volume_m3 ? Number(ruleForm.manual_volume_m3) : null,
        confidence: ruleForm.confidence,
        priority: Number(ruleForm.priority || 0),
        is_active: true,
        effective_start_date: ruleForm.effective_start_date || null,
        effective_end_date: ruleForm.effective_end_date || null,
        notes: ruleForm.notes,
      });
      setRuleForm({
        balance_model: '',
        production_site: '',
        route_name: '',
        method: 'MIXING_NODE_SHARE',
        basis_value: '',
        water_meter: NONE_VALUE,
        mixing_node: NONE_VALUE,
        manual_volume_m3: '',
        confidence: 'MEASURED_ALLOCATED',
        priority: '0',
        effective_start_date: '',
        effective_end_date: '',
        notes: '',
      });
      toast({ title: 'Balance rule saved.' });
    } catch (error) {
      toast({ title: 'Could not save balance rule.', description: errorDetail(error), variant: 'destructive' });
    }
  }

  return (
    <div className="container space-y-6 py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            <h2 className="text-2xl font-bold tracking-tight">Water Balancing</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Attribute measured zone supply to production sites, routes, and mixing nodes using frontend-managed rules.
          </p>
        </div>
        <Badge variant={warnings.length ? 'destructive' : 'secondary'} className="w-fit">
          {warnings.length ? `${warnings.length} warnings` : 'Configured attribution'}
        </Badge>
      </div>

      <Tabs defaultValue="report" className="space-y-6">
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <h3 className="text-lg font-semibold">Balance Workspace</h3>
            <TabsList className="h-auto flex-wrap justify-start gap-1 p-1">
              <TabsTrigger value="report"><Gauge className="mr-1.5 h-3.5 w-3.5" />Report</TabsTrigger>
              <TabsTrigger value="models"><ListChecks className="mr-1.5 h-3.5 w-3.5" />Models</TabsTrigger>
              <TabsTrigger value="rules"><Route className="mr-1.5 h-3.5 w-3.5" />Rules</TabsTrigger>
              <TabsTrigger value="nodes"><Network className="mr-1.5 h-3.5 w-3.5" />Nodes</TabsTrigger>
              <TabsTrigger value="inputs"><GitBranch className="mr-1.5 h-3.5 w-3.5" />Inputs</TabsTrigger>
              <TabsTrigger value="visual"><GitBranch className="mr-1.5 h-3.5 w-3.5" />Visual Model</TabsTrigger>
            </TabsList>
          </CardContent>
        </Card>

        <TabsContent value="report" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attribution Filters</CardTitle>
              <CardDescription>
                Use dates for operational review, or select a zone cycle to use opening and closing dates.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Field label="Start date"><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field>
              <Field label="End date"><Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></Field>
              <Field label="Zone">
                <Select value={zoneFilter} onValueChange={setZoneFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>All zones</SelectItem>
                    {zones.map((zone) => <SelectItem key={zone.id} value={String(zone.id)}>{zone.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Production site">
                <Select value={siteFilter} onValueChange={setSiteFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>All sites</SelectItem>
                    {sites.map((site) => <SelectItem key={site.id} value={String(site.id)}>{site.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Zone cycle">
                <Select value={cycleZone || NONE_VALUE} onValueChange={(value) => setCycleZone(value === NONE_VALUE ? '' : value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>Use date range</SelectItem>
                    {zones.map((zone) => <SelectItem key={zone.id} value={String(zone.id)}>{zone.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              {cycleZone ? (
                <>
                  <Field label="Cycle year"><Input type="number" value={cycleYear} onChange={(event) => setCycleYear(event.target.value)} /></Field>
                  <Field label="Cycle month"><Input type="number" min="1" max="12" value={cycleMonth} onChange={(event) => setCycleMonth(event.target.value)} /></Field>
                </>
              ) : null}
            </CardContent>
          </Card>

          {warnings.length ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Attribution warnings</AlertTitle>
              <AlertDescription>
                {warnings.slice(0, 4).map((warning, index) => (
                  <p key={`${warning.date}-${warning.zone_id}-${index}`}>
                    {warning.date}: {warning.zone_name} - {warning.message}
                  </p>
                ))}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryTile label="Zone Supply" value={`${formatVolume(allocationData?.total_zone_supply_m3)} m3`} icon={Gauge} />
            <SummaryTile label="Attributed" value={`${formatVolume(allocationData?.total_allocated_volume_m3)} m3`} icon={ArrowRightLeft} />
            <SummaryTile label="Unmapped" value={`${formatVolume(allocationGap)} m3`} icon={AlertTriangle} />
            <SummaryTile label="Active Models" value={String(modelsData?.count ?? models.length)} icon={ListChecks} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily Source Attribution</CardTitle>
              <CardDescription>
                Rows show how zone supply is attributed by production site, route, method, and confidence.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Zone</TableHead>
                    <TableHead>Production site</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isReportLoading ? (
                    <EmptyRow colSpan={8} label="Loading source attribution..." />
                  ) : allocationData?.rows?.length ? (
                    allocationData.rows.slice(0, 150).map((row) => (
                      <TableRow key={`${row.date}-${row.zone_id}-${row.production_site_id}-${row.route_name || row.rule_id}`}>
                        <TableCell>{row.date}</TableCell>
                        <TableCell>{row.zone_name}</TableCell>
                        <TableCell>{row.production_site_name}</TableCell>
                        <TableCell>{row.route_name || '-'}</TableCell>
                        <TableCell><Badge variant="outline">{row.method}</Badge></TableCell>
                        <TableCell><Badge variant={row.confidence === 'ESTIMATED' ? 'secondary' : 'default'}>{row.confidence || '-'}</Badge></TableCell>
                        <TableCell className="text-right mono-value">{formatPercent(row.allocation_percentage)}</TableCell>
                        <TableCell className="text-right mono-value">{formatVolume(row.allocated_volume_m3)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <EmptyRow colSpan={8} label="No source attribution rows for the selected filters." />
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="models" className="grid gap-6 xl:grid-cols-[minmax(320px,420px)_1fr]">
          <ConfigCard title="New Balance Model" description="One effective-dated model per zone." onSubmit={submitModel} busy={createModel.isPending}>
            <Field label="Name"><Input value={modelForm.name} onChange={(event) => setModelForm({ ...modelForm, name: event.target.value })} required /></Field>
            <Field label="Zone">
              <Select value={modelForm.zone} onValueChange={(value) => setModelForm({ ...modelForm, zone: value })}>
                <SelectTrigger><SelectValue placeholder="Select zone" /></SelectTrigger>
                <SelectContent>{zones.map((zone) => <SelectItem key={zone.id} value={String(zone.id)}>{zone.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Effective start"><Input type="date" value={modelForm.effective_start_date} onChange={(event) => setModelForm({ ...modelForm, effective_start_date: event.target.value })} required /></Field>
            <Field label="Effective end"><Input type="date" value={modelForm.effective_end_date} onChange={(event) => setModelForm({ ...modelForm, effective_end_date: event.target.value })} /></Field>
            <Field label="Notes"><Textarea value={modelForm.notes} onChange={(event) => setModelForm({ ...modelForm, notes: event.target.value })} /></Field>
          </ConfigCard>
          <ListCard title="Configured Models" loading={modelsLoading} emptyLabel="No water balance models configured.">
            {models.map((model) => (
              <TableRow key={model.id}>
                <TableCell><div className="font-medium">{model.name}</div><div className="text-xs text-muted-foreground">{model.zone_name}</div></TableCell>
                <TableCell>{model.effective_start_date} to {model.effective_end_date ?? 'open'}</TableCell>
                <TableCell><Badge variant="secondary">{model.distribution_region_name}</Badge></TableCell>
              </TableRow>
            ))}
          </ListCard>
        </TabsContent>

        <TabsContent value="rules" className="grid gap-6 xl:grid-cols-[minmax(320px,460px)_1fr]">
          <ConfigCard title="New Balance Rule" description="Map a production site to a zone model by method and route." onSubmit={submitRule} busy={createRule.isPending}>
            <Field label="Model"><ModelSelect value={ruleForm.balance_model} models={models} onChange={(value) => setRuleForm({ ...ruleForm, balance_model: value })} /></Field>
            <Field label="Production site"><SiteSelect value={ruleForm.production_site} sites={sites} onChange={(value) => setRuleForm({ ...ruleForm, production_site: value })} /></Field>
            <Field label="Route"><Input value={ruleForm.route_name} onChange={(event) => setRuleForm({ ...ruleForm, route_name: event.target.value })} placeholder="Karati via Water Works" /></Field>
            <Field label="Method">
              <Select value={ruleForm.method} onValueChange={(value) => setRuleForm({ ...ruleForm, method: value as WaterBalanceRuleMethod })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MIXING_NODE_SHARE">Mixing Node Share</SelectItem>
                  <SelectItem value="METERED_VOLUME">Metered Volume</SelectItem>
                  <SelectItem value="FIXED_PERCENTAGE">Fixed Percentage</SelectItem>
                  <SelectItem value="FIXED_WEIGHT">Fixed Weight</SelectItem>
                  <SelectItem value="MANUAL_OVERRIDE">Manual Override</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Basis / percentage"><Input type="number" step="0.0001" value={ruleForm.basis_value} onChange={(event) => setRuleForm({ ...ruleForm, basis_value: event.target.value })} /></Field>
            <Field label="Mixing node"><NodeSelect value={ruleForm.mixing_node} nodes={nodes} onChange={(value) => setRuleForm({ ...ruleForm, mixing_node: value })} includeNone /></Field>
            <Field label="Water meter"><MeterSelect value={ruleForm.water_meter} meters={meters} onChange={(value) => setRuleForm({ ...ruleForm, water_meter: value })} includeNone /></Field>
            <Field label="Manual volume"><Input type="number" step="0.01" value={ruleForm.manual_volume_m3} onChange={(event) => setRuleForm({ ...ruleForm, manual_volume_m3: event.target.value })} /></Field>
            <Field label="Confidence"><ConfidenceSelect value={ruleForm.confidence} onChange={(value) => setRuleForm({ ...ruleForm, confidence: value })} /></Field>
            <Field label="Priority"><Input type="number" value={ruleForm.priority} onChange={(event) => setRuleForm({ ...ruleForm, priority: event.target.value })} /></Field>
            <Field label="Notes"><Textarea value={ruleForm.notes} onChange={(event) => setRuleForm({ ...ruleForm, notes: event.target.value })} /></Field>
          </ConfigCard>
          <ListCard title="Configured Rules" loading={rulesLoading} emptyLabel="No water balance rules configured.">
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell><div className="font-medium">{rule.production_site_name}</div><div className="text-xs text-muted-foreground">{rule.zone_name}</div></TableCell>
                <TableCell>{rule.route_name || '-'}</TableCell>
                <TableCell><Badge variant="outline">{rule.method_display}</Badge></TableCell>
                <TableCell>{rule.mixing_node_name || rule.water_meter_name || rule.manual_volume_m3 || rule.basis_value || '-'}</TableCell>
              </TableRow>
            ))}
          </ListCard>
        </TabsContent>

        <TabsContent value="nodes" className="grid gap-6 xl:grid-cols-[minmax(320px,420px)_1fr]">
          <ConfigCard title="New Node" description="Create mixing or intermediary points such as Water Works." onSubmit={submitNode} busy={createNode.isPending}>
            <Field label="Name"><Input value={nodeForm.name} onChange={(event) => setNodeForm({ ...nodeForm, name: event.target.value })} required /></Field>
            <Field label="Code"><Input value={nodeForm.code} onChange={(event) => setNodeForm({ ...nodeForm, code: event.target.value })} required /></Field>
            <Field label="Type">
              <Select value={nodeForm.node_type} onValueChange={(value) => setNodeForm({ ...nodeForm, node_type: value as WaterBalanceNodeType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MIXING_NODE">Mixing Node</SelectItem>
                  <SelectItem value="PRODUCTION_SITE">Production Site</SelectItem>
                  <SelectItem value="INTERMEDIARY">Intermediary</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Linked production site"><SiteSelect value={nodeForm.production_site} sites={sites} onChange={(value) => setNodeForm({ ...nodeForm, production_site: value })} includeNone /></Field>
            <Field label="Notes"><Textarea value={nodeForm.notes} onChange={(event) => setNodeForm({ ...nodeForm, notes: event.target.value })} /></Field>
          </ConfigCard>
          <ListCard title="Configured Nodes" loading={nodesLoading} emptyLabel="No water balance nodes configured.">
            {nodes.map((node) => (
              <TableRow key={node.id}>
                <TableCell><div className="font-medium">{node.name}</div><div className="text-xs text-muted-foreground">{node.code}</div></TableCell>
                <TableCell><Badge variant="outline">{node.node_type_display}</Badge></TableCell>
                <TableCell>{node.production_site_name || '-'}</TableCell>
              </TableRow>
            ))}
          </ListCard>
        </TabsContent>

        <TabsContent value="inputs" className="grid gap-6 xl:grid-cols-[minmax(320px,460px)_1fr]">
          <ConfigCard title="New Node Input" description="Define measured and residual inputs to a mixing node." onSubmit={submitInput} busy={createInput.isPending}>
            <Field label="Node"><NodeSelect value={inputForm.node} nodes={nodes} onChange={(value) => setInputForm({ ...inputForm, node: value })} /></Field>
            <Field label="Production site"><SiteSelect value={inputForm.production_site} sites={sites} onChange={(value) => setInputForm({ ...inputForm, production_site: value })} /></Field>
            <Field label="Input method">
              <Select value={inputForm.input_method} onValueChange={(value) => setInputForm({ ...inputForm, input_method: value as WaterBalanceNodeInputMethod })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SITE_PRODUCTION">Site Production</SelectItem>
                  <SelectItem value="METERED_TRANSFER">Metered Transfer</SelectItem>
                  <SelectItem value="RESIDUAL">Residual</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Water meter"><MeterSelect value={inputForm.water_meter} meters={meters} onChange={(value) => setInputForm({ ...inputForm, water_meter: value })} includeNone /></Field>
            <Field label="Confidence"><ConfidenceSelect value={inputForm.confidence} onChange={(value) => setInputForm({ ...inputForm, confidence: value })} /></Field>
            <Field label="Priority"><Input type="number" value={inputForm.priority} onChange={(event) => setInputForm({ ...inputForm, priority: event.target.value })} /></Field>
            <Field label="Notes"><Textarea value={inputForm.notes} onChange={(event) => setInputForm({ ...inputForm, notes: event.target.value })} /></Field>
          </ConfigCard>
          <ListCard title="Configured Node Inputs" loading={inputsLoading} emptyLabel="No node inputs configured.">
            {inputs.map((input) => (
              <TableRow key={input.id}>
                <TableCell><div className="font-medium">{input.node_name}</div><div className="text-xs text-muted-foreground">{input.production_site_name}</div></TableCell>
                <TableCell><Badge variant="outline">{input.input_method_display}</Badge></TableCell>
                <TableCell>{input.water_meter_name || '-'}</TableCell>
                <TableCell><Badge variant={input.confidence === 'ESTIMATED' ? 'secondary' : 'default'}>{input.confidence_display}</Badge></TableCell>
              </TableRow>
            ))}
          </ListCard>
        </TabsContent>

        <TabsContent value="visual" className="space-y-6">
          <WaterBalanceVisualModel
            zones={zones}
            sites={sites}
            meters={meters}
            nodes={nodes}
            models={models}
            rules={rules}
            inputs={inputs}
            loading={visualModelLoading}
            onRefresh={refreshVisualModel}
            refreshing={visualModelRefreshing}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ConfigCard({
  title,
  description,
  children,
  onSubmit,
  busy,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><PlusCircle className="h-4 w-4" />{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          {children}
          <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving...' : 'Save'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ListCard({
  title,
  children,
  loading,
  emptyLabel,
}: {
  title: string;
  children: React.ReactNode[];
  loading: boolean;
  emptyLabel: string;
}) {
  const hasRows = Array.isArray(children) && children.length > 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Configuration</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <EmptyRow colSpan={4} label="Loading..." /> : hasRows ? children : <EmptyRow colSpan={4} label={emptyLabel} />}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-6 text-center text-muted-foreground">{label}</TableCell>
    </TableRow>
  );
}

function SummaryTile({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Gauge }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-bold mono-value">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

interface OptionSelectProps {
  value: string;
  onChange: (value: string) => void;
  includeNone?: boolean;
}

function SiteSelect({ value, sites, onChange, includeNone = false }: OptionSelectProps & {
  sites: Array<{ id: number; name: string }>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select production site" /></SelectTrigger>
      <SelectContent>
        {includeNone ? <SelectItem value={NONE_VALUE}>None</SelectItem> : null}
        {sites.map((site) => <SelectItem key={site.id} value={String(site.id)}>{site.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function NodeSelect({ value, nodes, onChange, includeNone = false }: OptionSelectProps & {
  nodes: Array<{ id: number; name: string }>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select node" /></SelectTrigger>
      <SelectContent>
        {includeNone ? <SelectItem value={NONE_VALUE}>None</SelectItem> : null}
        {nodes.map((node) => <SelectItem key={node.id} value={String(node.id)}>{node.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function ModelSelect({ value, models, onChange }: Omit<OptionSelectProps, 'includeNone'> & {
  models: Array<{ id: number; name: string; zone_name: string }>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select model" /></SelectTrigger>
      <SelectContent>
        {models.map((model) => <SelectItem key={model.id} value={String(model.id)}>{model.zone_name} - {model.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function MeterSelect({ value, meters, onChange, includeNone = false }: OptionSelectProps & {
  meters: Array<{ id: number; meter_number: string; display_label?: string | null }>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select meter" /></SelectTrigger>
      <SelectContent>
        {includeNone ? <SelectItem value={NONE_VALUE}>None</SelectItem> : null}
        {meters.map((meter) => <SelectItem key={meter.id} value={String(meter.id)}>{meter.display_label || meter.meter_number}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function ConfidenceSelect({ value, onChange }: { value: WaterBalanceConfidence; onChange: (value: WaterBalanceConfidence) => void }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as WaterBalanceConfidence)}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="MEASURED">Measured</SelectItem>
        <SelectItem value="MEASURED_ALLOCATED">Measured/Allocated</SelectItem>
        <SelectItem value="ESTIMATED">Estimated</SelectItem>
        <SelectItem value="MANUAL">Manual</SelectItem>
      </SelectContent>
    </Select>
  );
}
