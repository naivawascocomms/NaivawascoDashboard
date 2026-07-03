export interface ProductionSite {
  name: string;
  volume: number;
}

export interface SupplyPoint {
  name: string;
  volume: number;
}

export interface RegionalDailyData {
  region: string;
  productionSites: ProductionSite[];
  supplyPoints: SupplyPoint[];
  totalProduction: number;
  totalSupply: number;
  collection: number;
}

export interface DailyReport {
  date: string;
  regions: RegionalDailyData[];
  totalProduction: number;
  totalSupply: number;
  totalCollection: number;
  nrw: number;
  nrwPercentage: number;
}

export interface DailyTrend {
  date: string;
  production: number;
  supply: number;
  collection: number;
  nrw: number;
}
