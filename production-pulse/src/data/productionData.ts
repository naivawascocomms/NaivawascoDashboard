import { ProductionKPI, SourcePerformance, MonthlyProductionTrend, EnergyData, ChemicalUsage, TreatmentMetrics } from '@/types/production';

export const productionSources = [
  { id: 'dti', name: 'DTI Treatment Plant', type: 'treatment_plant' as const, region: 'Central', capacity: 8000 },
  { id: 'ptank-bh', name: 'P.Tank Borehole', type: 'borehole' as const, region: 'Central', capacity: 1200 },
  { id: 'aic-cbd', name: 'AIC CBD Supply', type: 'borehole' as const, region: 'Central', capacity: 800 },
  { id: 'new-line', name: 'New Line', type: 'surface' as const, region: 'Central', capacity: 1500 },
  { id: 'kayole-bh', name: 'Kayole Borehole', type: 'borehole' as const, region: 'Eastern', capacity: 600 },
  { id: 'kinungi-bh', name: 'Kinungi Borehole', type: 'borehole' as const, region: 'Eastern', capacity: 400 },
  { id: 'maimahiu-bh', name: 'Mai Mahiu Borehole', type: 'borehole' as const, region: 'Southern', capacity: 1000 },
  { id: 'longonot-bh', name: 'Longonot Borehole', type: 'borehole' as const, region: 'Southern', capacity: 500 },
];

export const productionKPIs: ProductionKPI[] = [
  {
    label: 'Total Production',
    value: 186535,
    unit: 'm³',
    target: 241381,
    percentRealized: 77,
    trend: 'up',
    status: 'warning',
  },
  {
    label: 'DTI Plant Output',
    value: 145000,
    unit: 'm³',
    target: 180000,
    percentRealized: 81,
    trend: 'stable',
    status: 'warning',
  },
  {
    label: 'Borehole Production',
    value: 41535,
    unit: 'm³',
    target: 61381,
    percentRealized: 68,
    trend: 'down',
    status: 'critical',
  },
  {
    label: 'Pumping Hours',
    value: 18420,
    unit: 'hrs',
    target: 21600,
    percentRealized: 85,
    trend: 'up',
    status: 'good',
  },
];

export const energyKPIs: ProductionKPI[] = [
  {
    label: 'Total Energy Consumed',
    value: 285600,
    unit: 'kWh',
    target: 320000,
    percentRealized: 89,
    trend: 'down',
    status: 'good',
  },
  {
    label: 'Solar Generation',
    value: 72450,
    unit: 'kWh',
    target: 85000,
    percentRealized: 85,
    trend: 'up',
    status: 'warning',
  },
  {
    label: 'Grid Consumption',
    value: 213150,
    unit: 'kWh',
    target: 235000,
    percentRealized: 91,
    trend: 'down',
    status: 'good',
  },
  {
    label: 'Solar Utilization',
    value: 25.4,
    unit: '%',
    target: 30,
    percentRealized: 85,
    trend: 'up',
    status: 'warning',
  },
  {
    label: 'Energy Cost',
    value: 2850000,
    unit: 'KES',
    target: 3200000,
    percentRealized: 89,
    trend: 'down',
    status: 'good',
  },
  {
    label: 'Energy Efficiency',
    value: 0.65,
    unit: 'm³/kWh',
    target: 0.75,
    percentRealized: 87,
    trend: 'up',
    status: 'warning',
  },
];

export const sourcePerformance: SourcePerformance[] = [
  { id: 'dti', name: 'DTI Treatment Plant', type: 'Treatment Plant', dailyProduction: 4833, monthlyProduction: 145000, cumulativeProduction: 1420000, capacity: 8000, utilizationRate: 60, energyEfficiency: 0.72, status: 'active' },
  { id: 'ptank-bh', name: 'P.Tank Borehole', type: 'Borehole', dailyProduction: 850, monthlyProduction: 25500, cumulativeProduction: 252000, capacity: 1200, utilizationRate: 71, energyEfficiency: 0.58, status: 'active' },
  { id: 'aic-cbd', name: 'AIC CBD Supply', type: 'Borehole', dailyProduction: 320, monthlyProduction: 9600, cumulativeProduction: 94000, capacity: 800, utilizationRate: 40, energyEfficiency: 0.52, status: 'maintenance' },
  { id: 'new-line', name: 'New Line', type: 'Surface', dailyProduction: 215, monthlyProduction: 6435, cumulativeProduction: 63500, capacity: 1500, utilizationRate: 14, energyEfficiency: 0.68, status: 'active' },
  { id: 'kayole-bh', name: 'Kayole Borehole', type: 'Borehole', dailyProduction: 420, monthlyProduction: 12600, cumulativeProduction: 124000, capacity: 600, utilizationRate: 70, energyEfficiency: 0.61, status: 'active' },
  { id: 'kinungi-bh', name: 'Kinungi Borehole', type: 'Borehole', dailyProduction: 280, monthlyProduction: 8400, cumulativeProduction: 82000, capacity: 400, utilizationRate: 70, energyEfficiency: 0.55, status: 'active' },
  { id: 'maimahiu-bh', name: 'Mai Mahiu Borehole', type: 'Borehole', dailyProduction: 650, monthlyProduction: 19500, cumulativeProduction: 192000, capacity: 1000, utilizationRate: 65, energyEfficiency: 0.48, status: 'active' },
  { id: 'longonot-bh', name: 'Longonot Borehole', type: 'Borehole', dailyProduction: 165, monthlyProduction: 4950, cumulativeProduction: 48500, capacity: 500, utilizationRate: 33, energyEfficiency: 0.42, status: 'offline' },
];

export const monthlyProductionTrends: MonthlyProductionTrend[] = [
  { month: 'Jul', production: 200856, target: 218197, solarEnergy: 65000, gridEnergy: 195000, energyCost: 2600000 },
  { month: 'Aug', production: 228611, target: 218261, solarEnergy: 68500, gridEnergy: 208000, energyCost: 2780000 },
  { month: 'Sep', production: 220243, target: 218714, solarEnergy: 70200, gridEnergy: 202000, energyCost: 2700000 },
  { month: 'Oct', production: 226927, target: 223363, solarEnergy: 72000, gridEnergy: 212000, energyCost: 2830000 },
  { month: 'Nov', production: 232327, target: 223774, solarEnergy: 71500, gridEnergy: 218000, energyCost: 2910000 },
  { month: 'Dec', production: 162567, target: 224621, solarEnergy: 58000, gridEnergy: 165000, energyCost: 2200000 },
  { month: 'Jan', production: 280545, target: 233058, solarEnergy: 78000, gridEnergy: 242000, energyCost: 3230000 },
  { month: 'Feb', production: 236218, target: 233141, solarEnergy: 74500, gridEnergy: 215000, energyCost: 2870000 },
  { month: 'Mar', production: 234258, target: 233215, solarEnergy: 73200, gridEnergy: 214000, energyCost: 2860000 },
  { month: 'Apr', production: 186535, target: 241381, solarEnergy: 72450, gridEnergy: 213150, energyCost: 2850000 },
];

export const dailyEnergyData: EnergyData[] = [
  { date: '2025-04-01', totalConsumed: 9520, solarGenerated: 2415, gridConsumed: 7105, solarPercentage: 25.4, costKes: 94850 },
  { date: '2025-04-02', totalConsumed: 9850, solarGenerated: 2580, gridConsumed: 7270, solarPercentage: 26.2, costKes: 97100 },
  { date: '2025-04-03', totalConsumed: 9320, solarGenerated: 2250, gridConsumed: 7070, solarPercentage: 24.1, costKes: 94430 },
  { date: '2025-04-04', totalConsumed: 9680, solarGenerated: 2680, gridConsumed: 7000, solarPercentage: 27.7, costKes: 93500 },
  { date: '2025-04-05', totalConsumed: 9150, solarGenerated: 2150, gridConsumed: 7000, solarPercentage: 23.5, costKes: 93500 },
];

export const chemicalUsage: ChemicalUsage[] = [
  { chemical: 'Chlorine', used: 1250, unit: 'kg', cost: 187500, target: 1500 },
  { chemical: 'Alum', used: 3200, unit: 'kg', cost: 256000, target: 3500 },
  { chemical: 'Lime', used: 850, unit: 'kg', cost: 42500, target: 1000 },
  { chemical: 'Polymer', used: 45, unit: 'kg', cost: 135000, target: 50 },
];

export const treatmentMetrics: TreatmentMetrics = {
  chlorineDosage: 2.5,
  turbidityIn: 45,
  turbidityOut: 0.8,
  phLevel: 7.2,
  residualChlorine: 0.5,
};

export const cumulativeProduction = {
  target: 2267725,
  actual: 2209087,
  percentRealized: 97,
  previousYear: 1949296,
  yearOnYearGrowth: 13.3,
};
