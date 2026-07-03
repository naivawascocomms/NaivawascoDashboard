import { DistributionKPI, GlobalNRWMetrics, RegionalMetrics, ZonalMetrics, TransmissionMetrics, MonthlyDistributionTrend, LeakageMetrics } from '@/types/distribution';

export const globalNRWMetrics: GlobalNRWMetrics = {
  waterAvailed: 186535,
  waterBilled: 135488,
  nrwVolume: 51047,
  nrwPercentage: 27,
  transmissionLoss: 11194,
  transmissionLossPercentage: 6,
  target: 22,
  percentRealized: 81,
};

export const distributionKPIs: DistributionKPI[] = [
  {
    label: 'Water Availed for Sale',
    value: 186535,
    unit: 'm³',
    target: 241381,
    percentRealized: 77,
    trend: 'up',
    status: 'warning',
    comparison: { previousPeriod: 234258, change: -20.4 },
  },
  {
    label: 'Volume Water Billed',
    value: 135488,
    unit: 'm³',
    target: 188033,
    percentRealized: 72,
    trend: 'up',
    status: 'warning',
    comparison: { previousPeriod: 175998, change: -23.0 },
  },
  {
    label: 'Global NRW',
    value: 27,
    unit: '%',
    target: 22,
    percentRealized: 81,
    trend: 'down',
    status: 'warning',
    comparison: { previousPeriod: 24.9, change: 8.4 },
  },
  {
    label: 'Transmission Loss',
    value: 6,
    unit: '%',
    target: 0,
    percentRealized: 0,
    trend: 'stable',
    status: 'critical',
    comparison: { previousPeriod: 1.7, change: 252.9 },
  },
];

export const cumulativeKPIs: DistributionKPI[] = [
  {
    label: 'Cumulative Water Availed',
    value: 2209087,
    unit: 'm³',
    target: 2267725,
    percentRealized: 97,
    trend: 'up',
    status: 'good',
  },
  {
    label: 'Cumulative Water Billed',
    value: 1595065,
    unit: 'm³',
    target: 1709538,
    percentRealized: 93,
    trend: 'up',
    status: 'good',
  },
  {
    label: 'Cumulative NRW',
    value: 28,
    unit: '%',
    target: 25,
    percentRealized: 89,
    trend: 'down',
    status: 'warning',
  },
  {
    label: 'YTD NRW Volume',
    value: 614022,
    unit: 'm³',
    target: 558187,
    percentRealized: 91,
    trend: 'down',
    status: 'warning',
  },
];

export const regionalMetrics: RegionalMetrics[] = [
  {
    region: 'Central',
    zones: ['CBD', 'CCCR', 'Lake View', 'Kabati', 'Site & Services', 'Kihoto', 'Hopewell'],
    waterSupplied: 87092,
    waterSold: 71595,
    nrwVolume: 15497,
    nrwPercentage: 18,
    target: 20,
    connections: 8650,
    leaksBursts: 53,
    monthlyTarget: 109968,
    cumulativeTarget: 1102140,
    cumulativeActual: 1045575,
  },
  {
    region: 'Southern',
    zones: ['Mai Mahiu', 'Kamere', 'Hells Gate', 'Longonot', 'Ihindu'],
    waterSupplied: 55754,
    waterSold: 37599,
    nrwVolume: 18155,
    nrwPercentage: 33,
    target: 40,
    connections: 4320,
    leaksBursts: 41,
    monthlyTarget: 83289,
    cumulativeTarget: 725072,
    cumulativeActual: 680647,
  },
  {
    region: 'Eastern',
    zones: ['Kayole', 'Gondi', 'Kinungi', 'Nyonjoro'],
    waterSupplied: 32495,
    waterSold: 26294,
    nrwVolume: 6201,
    nrwPercentage: 19,
    target: 21,
    connections: 2860,
    leaksBursts: 12,
    monthlyTarget: 39087,
    cumulativeTarget: 381810,
    cumulativeActual: 368175,
  },
];

export const zonalMetrics: ZonalMetrics[] = [
  { id: 'cbd', name: 'CBD', region: 'Central', waterSupplied: 21609, waterSold: 14822, nrwVolume: 6787, nrwPercentage: 31, target: 27, connections: 1834, activeLeaks: 20, metersCaptured: 1756, illegalConnections: 12, avgDailyConsumption: 720, monthlyTarget: 21704, cumulativePerformance: 97 },
  { id: 'cccr', name: 'CCCR', region: 'Central', waterSupplied: 15629, waterSold: 14401, nrwVolume: 1228, nrwPercentage: 8, target: 14, connections: 1450, activeLeaks: 12, metersCaptured: 1420, illegalConnections: 5, avgDailyConsumption: 521, monthlyTarget: 26576, cumulativePerformance: 75 },
  { id: 'lakeview', name: 'Lake View', region: 'Central', waterSupplied: 17420, waterSold: 14918, nrwVolume: 2502, nrwPercentage: 14, target: 21, connections: 1200, activeLeaks: 8, metersCaptured: 1180, illegalConnections: 3, avgDailyConsumption: 581, monthlyTarget: 30523, cumulativePerformance: 84 },
  { id: 'kabati', name: 'Kabati', region: 'Central', waterSupplied: 14499, waterSold: 11461, nrwVolume: 3038, nrwPercentage: 21, target: 24, connections: 890, activeLeaks: 6, metersCaptured: 865, illegalConnections: 4, avgDailyConsumption: 483, monthlyTarget: 17062, cumulativePerformance: 95 },
  { id: 'site', name: 'Site & Services', region: 'Central', waterSupplied: 10907, waterSold: 9620, nrwVolume: 1287, nrwPercentage: 12, target: 16, connections: 756, activeLeaks: 4, metersCaptured: 745, illegalConnections: 2, avgDailyConsumption: 364, monthlyTarget: 11954, cumulativePerformance: 108 },
  { id: 'kihoto', name: 'Kihoto', region: 'Central', waterSupplied: 1856, waterSold: 1486, nrwVolume: 370, nrwPercentage: 20, target: 13, connections: 520, activeLeaks: 3, metersCaptured: 508, illegalConnections: 2, avgDailyConsumption: 62, monthlyTarget: 2149, cumulativePerformance: 100 },
  { id: 'hopewell', name: 'Hopewell', region: 'Central', waterSupplied: 5172, waterSold: 4887, nrwVolume: 285, nrwPercentage: 6, target: 6, connections: 480, activeLeaks: 0, metersCaptured: 478, illegalConnections: 0, avgDailyConsumption: 172, monthlyTarget: 5475, cumulativePerformance: 109 },
  { id: 'maimahiu', name: 'Mai Mahiu', region: 'Southern', waterSupplied: 13179, waterSold: 6907, nrwVolume: 6272, nrwPercentage: 48, target: 57, connections: 1100, activeLeaks: 15, metersCaptured: 980, illegalConnections: 25, avgDailyConsumption: 439, monthlyTarget: 41167, cumulativePerformance: 62 },
  { id: 'kamere', name: 'Kamere', region: 'Southern', waterSupplied: 7721, waterSold: 6181, nrwVolume: 1540, nrwPercentage: 20, target: 13, connections: 650, activeLeaks: 10, metersCaptured: 635, illegalConnections: 8, avgDailyConsumption: 257, monthlyTarget: 6835, cumulativePerformance: 125 },
  { id: 'hellsgate', name: 'Hells Gate', region: 'Southern', waterSupplied: 31995, waterSold: 22538, nrwVolume: 9457, nrwPercentage: 30, target: 26, connections: 1420, activeLeaks: 8, metersCaptured: 1385, illegalConnections: 12, avgDailyConsumption: 1067, monthlyTarget: 35287, cumulativePerformance: 99 },
  { id: 'longonot', name: 'Longonot', region: 'Southern', waterSupplied: 2859, waterSold: 1973, nrwVolume: 886, nrwPercentage: 31, target: 50, connections: 580, activeLeaks: 5, metersCaptured: 550, illegalConnections: 8, avgDailyConsumption: 95, monthlyTarget: 9037, cumulativePerformance: 78 },
  { id: 'ihindu', name: 'Ihindu', region: 'Southern', waterSupplied: 0, waterSold: 0, nrwVolume: 0, nrwPercentage: 0, target: 0, connections: 120, activeLeaks: 3, metersCaptured: 115, illegalConnections: 2, avgDailyConsumption: 0, monthlyTarget: 0, cumulativePerformance: 0 },
  { id: 'kayole', name: 'Kayole', region: 'Eastern', waterSupplied: 32495, waterSold: 26294, nrwVolume: 6201, nrwPercentage: 19, target: 21, connections: 1980, activeLeaks: 5, metersCaptured: 1920, illegalConnections: 6, avgDailyConsumption: 1083, monthlyTarget: 39087, cumulativePerformance: 96 },
  { id: 'gondi', name: 'Gondi', region: 'Eastern', waterSupplied: 0, waterSold: 0, nrwVolume: 0, nrwPercentage: 0, target: 0, connections: 450, activeLeaks: 3, metersCaptured: 440, illegalConnections: 2, avgDailyConsumption: 0, monthlyTarget: 0, cumulativePerformance: 0 },
  { id: 'kinungi', name: 'Kinungi', region: 'Eastern', waterSupplied: 0, waterSold: 0, nrwVolume: 0, nrwPercentage: 0, target: 0, connections: 280, activeLeaks: 2, metersCaptured: 275, illegalConnections: 1, avgDailyConsumption: 0, monthlyTarget: 0, cumulativePerformance: 0 },
  { id: 'nyonjoro', name: 'Nyonjoro', region: 'Eastern', waterSupplied: 0, waterSold: 0, nrwVolume: 0, nrwPercentage: 0, target: 0, connections: 150, activeLeaks: 2, metersCaptured: 145, illegalConnections: 1, avgDailyConsumption: 0, monthlyTarget: 0, cumulativePerformance: 0 },
];

export const transmissionMetrics: TransmissionMetrics = {
  productionVolume: 186535,
  distributionVolume: 175341,
  lossVolume: 11194,
  lossPercentage: 6,
  pipelineLength: 245,
  leaksDetected: 8,
  leaksRepaired: 5,
};

export const monthlyDistributionTrends: MonthlyDistributionTrend[] = [
  { month: 'Jul', waterSupplied: 179812, waterBilled: 158778, nrwPercentage: 11.7, transmissionLoss: 0, target: 27.2 },
  { month: 'Aug', waterSupplied: 218591, waterBilled: 159844, nrwPercentage: 26.9, transmissionLoss: 0, target: 26.8 },
  { month: 'Sep', waterSupplied: 206801, waterBilled: 161552, nrwPercentage: 21.9, transmissionLoss: 0, target: 26.1 },
  { month: 'Oct', waterSupplied: 217593, waterBilled: 166261, nrwPercentage: 23.6, transmissionLoss: 0, target: 25.6 },
  { month: 'Nov', waterSupplied: 230368, waterBilled: 179892, nrwPercentage: 21.9, transmissionLoss: 0.8, target: 24.9 },
  { month: 'Dec', waterSupplied: 151401, waterBilled: 116560, nrwPercentage: 23.0, transmissionLoss: 6.9, target: 24.3 },
  { month: 'Jan', waterSupplied: 267445, waterBilled: 184451, nrwPercentage: 31.0, transmissionLoss: 4.7, target: 23.8 },
  { month: 'Feb', waterSupplied: 216809, waterBilled: 168191, nrwPercentage: 22.4, transmissionLoss: 8.2, target: 23.2 },
  { month: 'Mar', waterSupplied: 230236, waterBilled: 175998, nrwPercentage: 23.6, transmissionLoss: 1.7, target: 22.6 },
  { month: 'Apr', waterSupplied: 175341, waterBilled: 135488, nrwPercentage: 22.7, transmissionLoss: 6.0, target: 22.1 },
];

export const leakageMetrics: LeakageMetrics = {
  totalLeaks: 106,
  repaired: 78,
  pending: 28,
  avgRepairTime: 48,
  estimatedLoss: 1250,
  highPriorityCount: 8,
};

export const yearComparison = {
  currentYear: {
    waterSupplied: 2094397,
    waterBilled: 1595065,
    nrwPercentage: 23.8,
  },
  previousYear: {
    waterSupplied: 1949296,
    waterBilled: 1538584,
    nrwPercentage: 21.1,
  },
  change: {
    waterSupplied: 7.4,
    waterBilled: 3.7,
    nrwPercentage: 12.8,
  },
};
