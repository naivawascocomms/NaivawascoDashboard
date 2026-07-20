export interface ProductionSource {
  id: string;
  name: string;
  type: 'borehole' | 'surface' | 'treatment_plant' | 'reservoir';
  region: string;
  capacity: number; // m³/day
}

export interface ProductionReading {
  sourceId: string;
  date: string;
  volume: number;
  pumpingHours: number;
  energyConsumed: number; // kWh
  solarGenerated?: number; // kWh
  gridConsumed?: number; // kWh
}

export interface EnergyData {
  date: string;
  totalConsumed: number; // kWh
  solarGenerated: number; // kWh
  gridConsumed: number; // kWh
  solarPercentage: number; // %
  costKes: number;
}

export interface SourcePerformance {
  id: string;
  name: string;
  type: string;
  dailyProduction: number;
  monthlyProduction: number;
  cumulativeProduction: number;
  capacity: number;
  utilizationRate: number;
  energyEfficiency: number; // m³/kWh
  status: 'active' | 'maintenance' | 'offline';
}

export interface MonthlyProductionTrend {
  month: string;
  production: number;
  target: number;
  solarEnergy: number;
  gridEnergy: number;
  energyCost: number;
}

export interface ChemicalUsage {
  chemical: string;
  used: number;
  unit: string;
  cost: number;
  target: number;
}

export interface TreatmentMetrics {
  chlorineDosage: number; // mg/L
  turbidityIn: number; // NTU
  turbidityOut: number; // NTU
  phLevel: number;
  residualChlorine: number; // mg/L
}
