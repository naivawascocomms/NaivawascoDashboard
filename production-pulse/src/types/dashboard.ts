export interface MeterReading {
  id: string;
  date: string;
  meterId: string;
  meterName: string;
  zone: string;
  region: string;
  initialReading: number;
  currentReading: number;
  volume: number;
  unit: 'm3';
}

export interface Zone {
  id: string;
  name: string;
  region: string;
  meters: Meter[];
}

export interface Meter {
  id: string;
  name: string;
  zoneId: string;
  type: 'production' | 'distribution' | 'dma';
}

export interface DailyRecord {
  date: string;
  production: {
    totalVolume: number;
    bySource: Record<string, number>;
  };
  distribution: {
    totalVolume: number;
    byZone: Record<string, number>;
  };
  nrw: {
    volume: number;
    percentage: number;
  };
}

export interface KPIData {
  label: string;
  value: number;
  unit: string;
  target?: number;
  percentRealized?: number;
  trend?: 'up' | 'down' | 'stable';
  status?: 'good' | 'warning' | 'critical';
}

export interface RegionPerformance {
  name: string;
  waterSupplied: number;
  waterSold: number;
  nrwVolume: number;
  nrwPercentage: number;
  target: number;
}

export interface ZonePerformance {
  name: string;
  region: string;
  waterSupplied: number;
  waterSold: number;
  nrwPercentage: number;
  connections: number;
  leaksBursts: number;
}
