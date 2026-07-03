import { Zone, KPIData, RegionPerformance, ZonePerformance, MeterReading } from '@/types/dashboard';

export const zones: Zone[] = [
  // Central Region
  { id: 'cbd', name: 'CBD', region: 'Central', meters: [
    { id: 'cbd-inlet', name: 'CBD Inlet Meter', zoneId: 'cbd', type: 'distribution' },
    { id: 'cbd-outlet', name: 'CBD Outlet Meter', zoneId: 'cbd', type: 'distribution' },
  ]},
  { id: 'cccr', name: 'CCCR', region: 'Central', meters: [
    { id: 'cccr-main', name: 'CCCR Main Meter', zoneId: 'cccr', type: 'distribution' },
  ]},
  { id: 'kabati', name: 'Kabati', region: 'Central', meters: [
    { id: 'kabati-main', name: 'Kabati Main Meter', zoneId: 'kabati', type: 'distribution' },
  ]},
  { id: 'site', name: 'Site & Services', region: 'Central', meters: [
    { id: 'site-main', name: 'Site Main Meter', zoneId: 'site', type: 'distribution' },
  ]},
  { id: 'kihoto', name: 'Kihoto', region: 'Central', meters: [
    { id: 'kihoto-main', name: 'Kihoto Main Meter', zoneId: 'kihoto', type: 'distribution' },
  ]},
  { id: 'lakeview', name: 'Lake View', region: 'Central', meters: [
    { id: 'lakeview-main', name: 'Lake View Main Meter', zoneId: 'lakeview', type: 'distribution' },
  ]},
  // Southern Region
  { id: 'maimahiu', name: 'Mai Mahiu', region: 'Southern', meters: [
    { id: 'maimahiu-main', name: 'Mai Mahiu Main Meter', zoneId: 'maimahiu', type: 'distribution' },
  ]},
  { id: 'kamere', name: 'Kamere', region: 'Southern', meters: [
    { id: 'kamere-main', name: 'Kamere Main Meter', zoneId: 'kamere', type: 'distribution' },
  ]},
  { id: 'hellsgate', name: 'Hells Gate', region: 'Southern', meters: [
    { id: 'hellsgate-main', name: 'Hells Gate Main Meter', zoneId: 'hellsgate', type: 'distribution' },
  ]},
  // Eastern Region
  { id: 'kayole', name: 'Kayole', region: 'Eastern', meters: [
    { id: 'kayole-upper', name: 'Upper Kayole Meter', zoneId: 'kayole', type: 'distribution' },
    { id: 'kayole-lower', name: 'Lower Kayole Meter', zoneId: 'kayole', type: 'distribution' },
  ]},
  { id: 'gondi', name: 'Gondi', region: 'Eastern', meters: [
    { id: 'gondi-main', name: 'Gondi Main Meter', zoneId: 'gondi', type: 'distribution' },
  ]},
  { id: 'kinungi', name: 'Kinungi', region: 'Eastern', meters: [
    { id: 'kinungi-bh', name: 'Kinungi Borehole', zoneId: 'kinungi', type: 'production' },
  ]},
  { id: 'nyonjoro', name: 'Nyonjoro', region: 'Eastern', meters: [
    { id: 'nyonjoro-bh', name: 'Nyonjoro Borehole', zoneId: 'nyonjoro', type: 'production' },
  ]},
];

export const productionMeters = [
  { id: 'dti-inlet', name: 'DTI Inlet', type: 'production' as const },
  { id: 'ptank-bh', name: 'P.Tank BH', type: 'production' as const },
  { id: 'aic-cbd', name: 'AIC CBD Supply', type: 'production' as const },
  { id: 'new-line', name: 'New Line', type: 'production' as const },
];

export const globalKPIs: KPIData[] = [
  {
    label: 'Water Availed for Sale',
    value: 186535,
    unit: 'm³',
    target: 241381,
    percentRealized: 77,
    trend: 'up',
    status: 'warning',
  },
  {
    label: 'Volume Water Billed',
    value: 135488,
    unit: 'm³',
    target: 188033,
    percentRealized: 72,
    trend: 'up',
    status: 'warning',
  },
  {
    label: 'Global NRW',
    value: 27,
    unit: '%',
    target: 22,
    percentRealized: 81,
    trend: 'down',
    status: 'warning',
  },
  {
    label: 'Transmission Loss',
    value: 6,
    unit: '%',
    target: 0,
    percentRealized: 0,
    trend: 'stable',
    status: 'critical',
  },
];

export const regionPerformance: RegionPerformance[] = [
  {
    name: 'Central',
    waterSupplied: 87092,
    waterSold: 71595,
    nrwVolume: 15497,
    nrwPercentage: 18,
    target: 20,
  },
  {
    name: 'Southern',
    waterSupplied: 55754,
    waterSold: 37599,
    nrwVolume: 18155,
    nrwPercentage: 33,
    target: 40,
  },
  {
    name: 'Eastern',
    waterSupplied: 32495,
    waterSold: 26294,
    nrwVolume: 6201,
    nrwPercentage: 19,
    target: 21,
  },
];

export const zonePerformance: ZonePerformance[] = [
  { name: 'CBD', region: 'Central', waterSupplied: 21609, waterSold: 14822, nrwPercentage: 31, connections: 1834, leaksBursts: 20 },
  { name: 'CCCR', region: 'Central', waterSupplied: 15629, waterSold: 14401, nrwPercentage: 8, connections: 1450, leaksBursts: 12 },
  { name: 'Lake View', region: 'Central', waterSupplied: 17420, waterSold: 14918, nrwPercentage: 14, connections: 1200, leaksBursts: 8 },
  { name: 'Kabati', region: 'Central', waterSupplied: 14499, waterSold: 11461, nrwPercentage: 21, connections: 890, leaksBursts: 6 },
  { name: 'Site & Services', region: 'Central', waterSupplied: 10907, waterSold: 9620, nrwPercentage: 12, connections: 756, leaksBursts: 4 },
  { name: 'Kihoto', region: 'Central', waterSupplied: 7028, waterSold: 6373, nrwPercentage: 9, connections: 520, leaksBursts: 3 },
  { name: 'Mai Mahiu', region: 'Southern', waterSupplied: 28500, waterSold: 19200, nrwPercentage: 33, connections: 1100, leaksBursts: 15 },
  { name: 'Kamere', region: 'Southern', waterSupplied: 15254, waterSold: 10399, nrwPercentage: 32, connections: 650, leaksBursts: 10 },
  { name: 'Hells Gate', region: 'Southern', waterSupplied: 12000, waterSold: 8000, nrwPercentage: 33, connections: 420, leaksBursts: 8 },
  { name: 'Kayole', region: 'Eastern', waterSupplied: 18500, waterSold: 15200, nrwPercentage: 18, connections: 980, leaksBursts: 5 },
  { name: 'Gondi', region: 'Eastern', waterSupplied: 8500, waterSold: 7094, nrwPercentage: 17, connections: 450, leaksBursts: 3 },
  { name: 'Kinungi', region: 'Eastern', waterSupplied: 3495, waterSold: 2800, nrwPercentage: 20, connections: 280, leaksBursts: 2 },
  { name: 'Nyonjoro', region: 'Eastern', waterSupplied: 2000, waterSold: 1200, nrwPercentage: 40, connections: 150, leaksBursts: 2 },
];

// Sample meter readings for the past week
export const sampleMeterReadings: MeterReading[] = [
  { id: '1', date: '2025-04-01', meterId: 'dti-inlet', meterName: 'DTI Inlet', zone: 'Production', region: 'Production', initialReading: 1450000, currentReading: 1451216, volume: 1216, unit: 'm3' },
  { id: '2', date: '2025-04-01', meterId: 'ptank-bh', meterName: 'P.Tank BH', zone: 'Production', region: 'Production', initialReading: 135000, currentReading: 135772, volume: 772, unit: 'm3' },
  { id: '3', date: '2025-04-01', meterId: 'cbd-inlet', meterName: 'CBD Inlet', zone: 'CBD', region: 'Central', initialReading: 165000, currentReading: 165720, volume: 720, unit: 'm3' },
  { id: '4', date: '2025-04-02', meterId: 'dti-inlet', meterName: 'DTI Inlet', zone: 'Production', region: 'Production', initialReading: 1451216, currentReading: 1452575, volume: 1359, unit: 'm3' },
  { id: '5', date: '2025-04-02', meterId: 'ptank-bh', meterName: 'P.Tank BH', zone: 'Production', region: 'Production', initialReading: 135772, currentReading: 136538, volume: 766, unit: 'm3' },
];

// Monthly trend data
export const monthlyTrends = [
  { month: 'Jul', production: 185000, billed: 142000, nrw: 23 },
  { month: 'Aug', production: 192000, billed: 148000, nrw: 23 },
  { month: 'Sep', production: 188000, billed: 140000, nrw: 26 },
  { month: 'Oct', production: 195000, billed: 152000, nrw: 22 },
  { month: 'Nov', production: 178000, billed: 138000, nrw: 22 },
  { month: 'Dec', production: 165000, billed: 125000, nrw: 24 },
  { month: 'Jan', production: 172000, billed: 130000, nrw: 24 },
  { month: 'Feb', production: 180000, billed: 135000, nrw: 25 },
  { month: 'Mar', production: 188000, billed: 140000, nrw: 26 },
  { month: 'Apr', production: 186535, billed: 135488, nrw: 27 },
];
