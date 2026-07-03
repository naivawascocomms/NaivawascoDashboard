import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon, Plus, Save, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import { zones, productionMeters } from '@/data/mockData';
import { toast } from 'sonner';

interface MeterEntry {
  id: string;
  meterId: string;
  meterName: string;
  initialReading: string;
  currentReading: string;
}

export function DataInputForm() {
  const [date, setDate] = useState<Date>(new Date());
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [entries, setEntries] = useState<MeterEntry[]>([
    { id: '1', meterId: '', meterName: '', initialReading: '', currentReading: '' }
  ]);

  const allMeters = [
    ...productionMeters.map(m => ({ ...m, zone: 'Production', region: 'Production' })),
    ...zones.flatMap(z => z.meters.map(m => ({ ...m, zone: z.name, region: z.region }))),
  ];

  const filteredMeters = allMeters.filter(m => {
    if (selectedRegion && selectedRegion !== 'all' && m.region !== selectedRegion) return false;
    if (selectedZone && selectedZone !== 'all' && m.zone !== selectedZone) return false;
    return true;
  });

  const regions = ['Production', 'Central', 'Southern', 'Eastern'];
  const filteredZones = selectedRegion && selectedRegion !== 'all'
    ? zones.filter(z => z.region === selectedRegion).map(z => z.name)
    : zones.map(z => z.name);

  const addEntry = () => {
    setEntries([
      ...entries,
      { id: Date.now().toString(), meterId: '', meterName: '', initialReading: '', currentReading: '' }
    ]);
  };

  const updateEntry = (id: string, field: keyof MeterEntry, value: string) => {
    setEntries(entries.map(e => {
      if (e.id === id) {
        const updated = { ...e, [field]: value };
        if (field === 'meterId') {
          const meter = allMeters.find(m => m.id === value);
          updated.meterName = meter?.name || '';
        }
        return updated;
      }
      return e;
    }));
  };

  const removeEntry = (id: string) => {
    if (entries.length > 1) {
      setEntries(entries.filter(e => e.id !== id));
    }
  };

  const calculateVolume = (initial: string, current: string) => {
    const init = parseFloat(initial) || 0;
    const curr = parseFloat(current) || 0;
    return curr >= init ? curr - init : 0;
  };

  const handleSubmit = () => {
    const validEntries = entries.filter(e => e.meterId && e.initialReading && e.currentReading);
    
    if (validEntries.length === 0) {
      toast.error('Please fill in at least one complete meter reading');
      return;
    }

    // In a real app, this would save to a database
    const readings = validEntries.map(e => ({
      date: format(date, 'yyyy-MM-dd'),
      meterId: e.meterId,
      meterName: e.meterName,
      initialReading: parseFloat(e.initialReading),
      currentReading: parseFloat(e.currentReading),
      volume: calculateVolume(e.initialReading, e.currentReading),
    }));

    console.log('Saving readings:', readings);
    toast.success(`Successfully saved ${validEntries.length} meter reading(s)`);
    
    // Reset form
    setEntries([{ id: '1', meterId: '', meterName: '', initialReading: '', currentReading: '' }]);
  };

  return (
    <div className="chart-container animate-slide-up">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Gauge className="w-5 h-5 text-primary" />
          Daily Meter Readings Input
        </h3>
      </div>

      <div className="space-y-6">
        {/* Date and Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !date && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Region (optional)</Label>
            <Select value={selectedRegion} onValueChange={setSelectedRegion}>
              <SelectTrigger>
                <SelectValue placeholder="All regions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All regions</SelectItem>
                {regions.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Zone (optional)</Label>
            <Select value={selectedZone} onValueChange={setSelectedZone}>
              <SelectTrigger>
                <SelectValue placeholder="All zones" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All zones</SelectItem>
                {selectedRegion === 'Production' && (
                  <SelectItem value="Production">Production</SelectItem>
                )}
                {filteredZones.map(z => (
                  <SelectItem key={z} value={z}>{z}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Meter Entries */}
        <div className="space-y-4">
          <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
            <div className="col-span-4">Meter</div>
            <div className="col-span-3">Initial Reading</div>
            <div className="col-span-3">Current Reading</div>
            <div className="col-span-2">Volume (m³)</div>
          </div>

          {entries.map((entry, idx) => (
            <div key={entry.id} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-4">
                <Select
                  value={entry.meterId}
                  onValueChange={(v) => updateEntry(entry.id, 'meterId', v)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select meter" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredMeters.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="flex items-center gap-2">
                          <span>{m.name}</span>
                          <span className="text-xs text-muted-foreground">({m.zone})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                <Input
                  type="number"
                  placeholder="0"
                  value={entry.initialReading}
                  onChange={(e) => updateEntry(entry.id, 'initialReading', e.target.value)}
                  className="h-10 mono-value"
                />
              </div>
              <div className="col-span-3">
                <Input
                  type="number"
                  placeholder="0"
                  value={entry.currentReading}
                  onChange={(e) => updateEntry(entry.id, 'currentReading', e.target.value)}
                  className="h-10 mono-value"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <span className="mono-value text-foreground font-medium">
                  {calculateVolume(entry.initialReading, entry.currentReading).toLocaleString()}
                </span>
                {entries.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeEntry(entry.id)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          <Button
            variant="outline"
            size="sm"
            onClick={addEntry}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Meter
          </Button>

          <Button onClick={handleSubmit} className="gap-2">
            <Save className="w-4 h-4" />
            Save Readings
          </Button>
        </div>
      </div>
    </div>
  );
}
