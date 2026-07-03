export interface DistributionZone {
  id: string;
  name: string;
  region: 'Central' | 'Southern' | 'Eastern';
  dmas: DMA[];
}

export interface DMA {
  id: string;
  name: string;
  zoneId: string;
  connections: number;
  meterCount: number;
}

export interface DistributionKPI {
  label: string;
  value: number;
  unit: string;
  target?: number;
  percentRealized?: number;
  trend?: 'up' | 'down' | 'stable';
  status?: 'good' | 'warning' | 'critical';
  comparison?: {
    previousPeriod: number;
    change: number;
  };
}

export interface GlobalNRWMetrics {
  waterAvailed: number;
  waterBilled: number;
  nrwVolume: number;
  nrwPercentage: number;
  transmissionLoss: number;
  transmissionLossPercentage: number;
  target: number;
  percentRealized: number;
}

export interface RegionalMetrics {
  region: string;
  zones: string[];
  waterSupplied: number;
  waterSold: number;
  nrwVolume: number;
  nrwPercentage: number;
  target: number;
  connections: number;
  sewerConnections?: number;
  waterRevenue?: number;
  sewerRevenue?: number;
  leaksBursts: number;
  monthlyTarget: number;
  cumulativeTarget: number;
  cumulativeActual: number;
}

export interface ZonalMetrics {
  id: string;
  name: string;
  region: string;
  waterSupplied: number;
  waterSold: number;
  nrwVolume: number;
  nrwPercentage: number;
  target: number;
  connections: number;
  waterRevenue?: number;
  sewerRevenue?: number;
  activeLeaks: number;
  metersCaptured: number;
  illegalConnections: number;
  avgDailyConsumption: number;
  monthlyTarget: number;
  cumulativePerformance: number;
}

export interface TransmissionMetrics {
  productionVolume: number;
  distributionVolume: number;
  lossVolume: number;
  lossPercentage: number;
  pipelineLength: number;
  leaksDetected: number;
  leaksRepaired: number;
}

export interface MonthlyDistributionTrend {
  month: string;
  waterSupplied: number;
  waterBilled: number;
  nrwPercentage: number;
  transmissionLoss: number;
  target: number;
}

export interface LeakageMetrics {
  totalLeaks: number;
  repaired: number;
  pending: number;
  avgRepairTime: number; // hours
  estimatedLoss: number; // m³/day
  highPriorityCount: number;
}
