import { useMemo, useState, type ReactNode } from 'react';
import { ClipboardList, Database, Droplets, Loader2, ShieldCheck, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { MeterReadingAssignmentManager } from '@/components/metering/MeterReadingAssignmentManager';
import { MeterReadingValidationManager } from '@/components/metering/MeterReadingValidationManager';
import { useProductionSites } from '@/hooks/useProduction';
import { useZones } from '@/hooks/useDistribution';
import {
  useBulkCreateEnergyMeterReadings,
  useBulkCreateWaterMeterReadings,
  useMyMeterReadingAssignments,
  useMyMeteringProfile,
} from '@/hooks/useMetering';
import type { MeterReadingAssignment } from '@/types/api';

type MeterInputMap = Record<string, string>;

type ProductionWaterEntry = {
  water_meter: number;
  meter_number: string;
  meter_label: string;
  assignment_ids: number[];
  last_reading_date: string | null;
  last_reading_value: string | null;
  initial_reading: string;
};

type ProductionEnergyEntry = {
  energy_meter: number;
  meter_number: string;
  meter_label: string;
  assignment_ids: number[];
  last_reading_date: string | null;
  last_reading_value: string | null;
  initial_reading: string;
};

type DistributionWaterEntry = {
  water_meter: number;
  meter_number: string;
  meter_label: string;
  assignment_ids: number[];
  last_reading_date: string | null;
  last_reading_value: string | null;
  initial_reading: string;
};

function readingHint(lastDate: string | null, lastValue: string | null, initialReading: string) {
  if (lastDate && lastValue) {
    return `Last reading ${lastDate} | ${lastValue}`;
  }
  return `Initial reading ${initialReading}`;
}

function mergeInputValues<T>(
  items: T[],
  getKey: (item: T) => string,
  previous: MeterInputMap,
) {
  return items.reduce<MeterInputMap>((accumulator, item) => {
    const key = getKey(item);
    accumulator[key] = previous[key] ?? '';
    return accumulator;
  }, {});
}

function groupProductionWaterEntries(assignments: MeterReadingAssignment[]) {
  const grouped = new Map<number, ProductionWaterEntry>();

  assignments.forEach((assignment) => {
    if (!assignment.water_meter || !assignment.water_meter_label || !assignment.water_meter_number) {
      return;
    }

    const existing = grouped.get(assignment.water_meter);
    if (existing) {
      existing.assignment_ids.push(assignment.id);
      return;
    }

    grouped.set(assignment.water_meter, {
      water_meter: assignment.water_meter,
      meter_number: assignment.water_meter_number,
      meter_label: assignment.water_meter_label,
      assignment_ids: [assignment.id],
      last_reading_date: assignment.last_reading_date,
      last_reading_value: assignment.last_reading_value,
      initial_reading: assignment.initial_reading || '0',
    });
  });

  return Array.from(grouped.values());
}

function groupProductionEnergyEntries(assignments: MeterReadingAssignment[]) {
  const grouped = new Map<number, ProductionEnergyEntry>();

  assignments.forEach((assignment) => {
    if (!assignment.energy_meter || !assignment.energy_meter_label || !assignment.energy_meter_number) {
      return;
    }

    const existing = grouped.get(assignment.energy_meter);
    if (existing) {
      existing.assignment_ids.push(assignment.id);
      return;
    }

    grouped.set(assignment.energy_meter, {
      energy_meter: assignment.energy_meter,
      meter_number: assignment.energy_meter_number,
      meter_label: assignment.energy_meter_label,
      assignment_ids: [assignment.id],
      last_reading_date: assignment.last_reading_date,
      last_reading_value: assignment.last_reading_value,
      initial_reading: assignment.initial_reading || '0',
    });
  });

  return Array.from(grouped.values());
}

function groupDistributionWaterEntries(assignments: MeterReadingAssignment[]) {
  const grouped = new Map<number, DistributionWaterEntry>();

  assignments.forEach((assignment) => {
    if (!assignment.water_meter || !assignment.water_meter_label || !assignment.water_meter_number) {
      return;
    }

    const existing = grouped.get(assignment.water_meter);
    if (existing) {
      existing.assignment_ids.push(assignment.id);
      return;
    }

    grouped.set(assignment.water_meter, {
      water_meter: assignment.water_meter,
      meter_number: assignment.water_meter_number,
      meter_label: assignment.water_meter_label,
      assignment_ids: [assignment.id],
      last_reading_date: assignment.last_reading_date,
      last_reading_value: assignment.last_reading_value,
      initial_reading: assignment.initial_reading || '0',
    });
  });

  return Array.from(grouped.values());
}

export default function DataEntry() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedSite, setSelectedSite] = useState('');
  const [selectedZone, setSelectedZone] = useState('');
  const [productionWaterInputs, setProductionWaterInputs] = useState<MeterInputMap>({});
  const [productionEnergyInputs, setProductionEnergyInputs] = useState<MeterInputMap>({});
  const [distributionInputs, setDistributionInputs] = useState<MeterInputMap>({});

  const { data: profileData } = useMyMeteringProfile();
  const { data: sitesData, isLoading: sitesLoading } = useProductionSites({ is_active: true });
  const { data: zonesData, isLoading: zonesLoading } = useZones({ is_active: true });
  const {
    data: allAssignments = [],
    isLoading: assignmentsLoading,
  } = useMyMeterReadingAssignments({ is_active: true });

  const bulkCreateWaterReadings = useBulkCreateWaterMeterReadings();
  const bulkCreateEnergyReadings = useBulkCreateEnergyMeterReadings();

  const allProductionSites = sitesData?.results || [];
  const allDistributionZones = zonesData?.results || [];

  const assignedProductionSiteIds = useMemo(
    () =>
      new Set(
        allAssignments
          .filter((assignment) => assignment.scope_type === 'PRODUCTION_SITE' && assignment.production_site != null)
          .map((assignment) => assignment.production_site as number),
      ),
    [allAssignments],
  );
  const assignedZoneIds = useMemo(
    () =>
      new Set(
        allAssignments
          .filter((assignment) => assignment.scope_type === 'ZONE' && assignment.zone != null)
          .map((assignment) => assignment.zone as number),
      ),
    [allAssignments],
  );

  const productionSites = useMemo(
    () => allProductionSites.filter((site) => assignedProductionSiteIds.has(site.id)),
    [allProductionSites, assignedProductionSiteIds],
  );
  const distributionZones = useMemo(
    () => allDistributionZones.filter((zone) => assignedZoneIds.has(zone.id)),
    [allDistributionZones, assignedZoneIds],
  );

  const selectedProductionSite = useMemo(
    () => productionSites.find((site) => site.id.toString() === selectedSite),
    [productionSites, selectedSite],
  );
  const selectedDistributionZone = useMemo(
    () => distributionZones.find((zone) => zone.id.toString() === selectedZone),
    [distributionZones, selectedZone],
  );

  const productionAssignments = useMemo(
    () =>
      selectedSite
        ? allAssignments.filter(
            (assignment) =>
              assignment.scope_type === 'PRODUCTION_SITE' &&
              assignment.production_site === parseInt(selectedSite, 10),
          )
        : [],
    [allAssignments, selectedSite],
  );
  const zoneAssignments = useMemo(
    () =>
      selectedZone
        ? allAssignments.filter(
            (assignment) =>
              assignment.scope_type === 'ZONE' &&
              assignment.zone === parseInt(selectedZone, 10),
          )
        : [],
    [allAssignments, selectedZone],
  );

  const productionWaterEntries = useMemo(
    () => groupProductionWaterEntries(productionAssignments.filter((assignment) => !!assignment.water_meter)),
    [productionAssignments],
  );
  const productionEnergyEntries = useMemo(
    () => groupProductionEnergyEntries(productionAssignments.filter((assignment) => !!assignment.energy_meter)),
    [productionAssignments],
  );
  const distributionEntries = useMemo(
    () => groupDistributionWaterEntries(zoneAssignments.filter((assignment) => !!assignment.water_meter)),
    [zoneAssignments],
  );

  const syncedProductionWaterInputs = useMemo(
    () => mergeInputValues(productionWaterEntries, (entry) => entry.water_meter.toString(), productionWaterInputs),
    [productionWaterEntries, productionWaterInputs],
  );
  const syncedProductionEnergyInputs = useMemo(
    () => mergeInputValues(productionEnergyEntries, (entry) => entry.energy_meter.toString(), productionEnergyInputs),
    [productionEnergyEntries, productionEnergyInputs],
  );
  const syncedDistributionInputs = useMemo(
    () => mergeInputValues(distributionEntries, (entry) => entry.water_meter.toString(), distributionInputs),
    [distributionEntries, distributionInputs],
  );

  const filledProductionCount = useMemo(
    () =>
      Object.values(syncedProductionWaterInputs).filter((value) => value.trim() !== '').length +
      Object.values(syncedProductionEnergyInputs).filter((value) => value.trim() !== '').length,
    [syncedProductionEnergyInputs, syncedProductionWaterInputs],
  );

  const filledDistributionCount = useMemo(
    () => Object.values(syncedDistributionInputs).filter((value) => value.trim() !== '').length,
    [syncedDistributionInputs],
  );

  const handleProductionWaterInputChange = (waterMeterId: number, value: string) => {
    setProductionWaterInputs((current) => ({ ...current, [waterMeterId.toString()]: value }));
  };

  const handleProductionEnergyInputChange = (energyMeterId: number, value: string) => {
    setProductionEnergyInputs((current) => ({ ...current, [energyMeterId.toString()]: value }));
  };

  const handleDistributionInputChange = (waterMeterId: number, value: string) => {
    setDistributionInputs((current) => ({ ...current, [waterMeterId.toString()]: value }));
  };

  const resetProductionForm = () => {
    setSelectedSite('');
    setProductionWaterInputs({});
    setProductionEnergyInputs({});
  };

  const resetDistributionForm = () => {
    setSelectedZone('');
    setDistributionInputs({});
  };

  const handleProductionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const waterPayload = productionWaterEntries
      .filter((entry) => (syncedProductionWaterInputs[entry.water_meter.toString()] || '').trim() !== '')
      .map((entry) => ({
        water_meter: entry.water_meter,
        reading_date: selectedDate,
        current_reading: parseFloat(syncedProductionWaterInputs[entry.water_meter.toString()]),
        reading_method: 'MANUAL',
      }));

    const energyPayload = productionEnergyEntries
      .filter((entry) => (syncedProductionEnergyInputs[entry.energy_meter.toString()] || '').trim() !== '')
      .map((entry) => ({
        energy_meter: entry.energy_meter,
        reading_date: selectedDate,
        current_reading: parseFloat(syncedProductionEnergyInputs[entry.energy_meter.toString()]),
        reading_method: 'MANUAL',
      }));

    if (!selectedSite || (waterPayload.length === 0 && energyPayload.length === 0)) {
      return;
    }

    try {
      await Promise.all([
        waterPayload.length > 0 ? bulkCreateWaterReadings.mutateAsync(waterPayload) : Promise.resolve(),
        energyPayload.length > 0 ? bulkCreateEnergyReadings.mutateAsync(energyPayload) : Promise.resolve(),
      ]);

      toast({
        title: 'Production meter readings saved',
        description: `${waterPayload.length + energyPayload.length} readings recorded for ${selectedProductionSite?.name || 'the selected site'} on ${selectedDate}.`,
      });

      resetProductionForm();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save production meter readings.',
        variant: 'destructive',
      });
    }
  };

  const handleDistributionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = distributionEntries
      .filter((entry) => (syncedDistributionInputs[entry.water_meter.toString()] || '').trim() !== '')
      .map((entry) => ({
        water_meter: entry.water_meter,
        reading_date: selectedDate,
        current_reading: parseFloat(syncedDistributionInputs[entry.water_meter.toString()]),
        reading_method: 'MANUAL',
      }));

    if (!selectedZone || payload.length === 0) {
      return;
    }

    try {
      await bulkCreateWaterReadings.mutateAsync(payload);

      toast({
        title: 'Zone meter readings saved',
        description: `${payload.length} readings recorded for ${selectedDistributionZone?.name || 'the selected zone'} on ${selectedDate}.`,
      });

      resetDistributionForm();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save zone meter readings. If a meter was already captured for the selected date, review the existing reading first.',
        variant: 'destructive',
      });
    }
  };

  if (sitesLoading || zonesLoading) {
    return (
      <div className="min-h-screen bg-gradient-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-surface">
      <div className="container py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Data Entry</h1>
          <p className="text-muted-foreground">
            Capture only the meters assigned to you. Select a production site or zone to load its eligible reading list.
          </p>
          {profileData ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{profileData.user.full_name}</span> | {profileData.role.replaceAll('_', ' ')}
            </p>
          ) : null}
        </div>

        <Tabs defaultValue="production" className="space-y-6">
          <div className="rounded-2xl border border-border/50 bg-card/70 p-4 shadow-soft">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <h2 className="text-xl font-semibold text-foreground">Data</h2>
              <TabsList className="h-auto flex-wrap gap-1 p-1">
                <TabsTrigger value="production" className="flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5" />
                  Production Data
                </TabsTrigger>
                <TabsTrigger value="distribution" className="flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" />
                  Distribution Data
                </TabsTrigger>
                {profileData?.can_assign_readings ? (
                  <TabsTrigger value="assignments" className="flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5" />
                    Assignments
                  </TabsTrigger>
                ) : null}
                {profileData?.can_assign_readings ? (
                  <TabsTrigger value="validation" className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Readings Validation
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/50 bg-card p-4">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Data Entry Date</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Readings and assignment history are shown for this date.
              </p>
            </div>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-[180px]"
            />
          </div>

          <TabsContent value="production">
            <Card className="bg-card/80 border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Droplets className="w-5 h-5 text-primary" />
                  Production Meter Readings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleProductionSubmit} className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_1fr] md:items-end">
                    <div className="space-y-2">
                      <Label>Production Site</Label>
                      <Select value={selectedSite} onValueChange={setSelectedSite}>
                        <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                        <SelectContent>
                          {productionSites.map((site) => (
                            <SelectItem key={site.id} value={site.id.toString()}>
                              {site.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                      {selectedSite
                        ? `${productionWaterEntries.length + productionEnergyEntries.length} assigned meters loaded for ${selectedProductionSite?.name || 'this site'}. Only meters associated with the selected production site are shown.`
                        : 'Select a production site to load only the meters assigned to you for that site.'}
                    </div>
                  </div>

                  {selectedSite && assignmentsLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Loading assigned meters...
                    </div>
                  ) : null}

                  {selectedSite && !assignmentsLoading && productionWaterEntries.length + productionEnergyEntries.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      No assigned production meters were found for this site.
                    </div>
                  ) : null}

                  {selectedSite && !assignmentsLoading && (productionWaterEntries.length + productionEnergyEntries.length > 0) ? (
                    <div className="space-y-5">
                      {productionWaterEntries.length > 0 ? (
                        <AssignmentSection
                          title="Water Meters"
                          icon={<Droplets className="w-4 h-4 text-primary" />}
                          items={productionWaterEntries}
                          getKey={(item) => item.water_meter.toString()}
                          getLabel={(item) => item.meter_label}
                          getHint={(item) => readingHint(item.last_reading_date, item.last_reading_value, item.initial_reading)}
                          values={syncedProductionWaterInputs}
                          onChange={handleProductionWaterInputChange}
                        />
                      ) : null}

                      {productionEnergyEntries.length > 0 ? (
                        <AssignmentSection
                          title="Energy Meters"
                          icon={<Zap className="w-4 h-4 text-warning" />}
                          items={productionEnergyEntries}
                          getKey={(item) => item.energy_meter.toString()}
                          getLabel={(item) => item.meter_label}
                          getHint={(item) => readingHint(item.last_reading_date, item.last_reading_value, item.initial_reading)}
                          values={syncedProductionEnergyInputs}
                          onChange={handleProductionEnergyInputChange}
                        />
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {filledProductionCount > 0 ? `${filledProductionCount} production readings ready to save.` : 'No production readings entered yet.'}
                    </p>
                    <Button
                      type="submit"
                      disabled={!selectedSite || filledProductionCount === 0 || bulkCreateWaterReadings.isPending || bulkCreateEnergyReadings.isPending}
                    >
                      {bulkCreateWaterReadings.isPending || bulkCreateEnergyReadings.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Production Data'
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="distribution">
            <Card className="bg-card/80 border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-accent" />
                  Zone Meter Readings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleDistributionSubmit} className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_1fr] md:items-end">
                    <div className="space-y-2">
                      <Label>Distribution Zone</Label>
                      <Select value={selectedZone} onValueChange={setSelectedZone}>
                        <SelectTrigger><SelectValue placeholder="Select zone" /></SelectTrigger>
                        <SelectContent>
                          {distributionZones.map((zone) => (
                            <SelectItem key={zone.id} value={zone.id.toString()}>
                              {zone.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                      {selectedZone
                        ? `${distributionEntries.length} assigned meters loaded for ${selectedDistributionZone?.name || 'this zone'}. Only meters associated with the selected zone are shown.`
                        : 'Select a distribution zone to load only the meters assigned to you for that zone.'}
                    </div>
                  </div>

                  {selectedZone && assignmentsLoading ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Loading assigned meters...
                    </div>
                  ) : null}

                  {selectedZone && !assignmentsLoading && distributionEntries.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      No assigned zone meters were found for this zone.
                    </div>
                  ) : null}

                  {selectedZone && !assignmentsLoading && distributionEntries.length > 0 ? (
                    <div className="space-y-5">
                      <AssignmentSection
                        title="Zone Water Meters"
                        icon={<Database className="w-4 h-4 text-accent" />}
                        items={distributionEntries}
                        getKey={(item) => item.water_meter.toString()}
                        getLabel={(item) => item.meter_label}
                        getHint={(item) => readingHint(item.last_reading_date, item.last_reading_value, item.initial_reading)}
                        values={syncedDistributionInputs}
                        onChange={handleDistributionInputChange}
                      />
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {filledDistributionCount > 0 ? `${filledDistributionCount} zone readings ready to save.` : 'No zone readings entered yet.'}
                    </p>
                    <Button
                      type="submit"
                      disabled={!selectedZone || filledDistributionCount === 0 || bulkCreateWaterReadings.isPending}
                    >
                      {bulkCreateWaterReadings.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Distribution Data'
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {profileData?.can_assign_readings ? (
            <TabsContent value="assignments">
              <MeterReadingAssignmentManager profile={profileData} selectedDate={selectedDate} />
            </TabsContent>
          ) : null}

          {profileData?.can_assign_readings ? (
            <TabsContent value="validation">
              <MeterReadingValidationManager profile={profileData} selectedDate={selectedDate} />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
    </div>
  );
}

function AssignmentSection<T>({
  title,
  icon,
  items,
  getKey,
  getLabel,
  getHint,
  values,
  onChange,
}: {
  title: string;
  icon: ReactNode;
  items: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getHint: (item: T) => string;
  values: MeterInputMap;
  onChange: (id: number, value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/60 p-4">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h4 className="font-medium">{title}</h4>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const key = getKey(item);
          return (
            <div key={key} className="space-y-2 rounded-lg border border-border/40 bg-background/70 p-3">
              <Label htmlFor={key}>{getLabel(item)}</Label>
              <Input
                id={key}
                type="number"
                step="0.01"
                value={values[key] || ''}
                onChange={(e) => onChange(Number(key), e.target.value)}
                placeholder="Enter current reading"
              />
              <p className="text-xs text-muted-foreground">{getHint(item)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
