import { FinanceKPI, BillingMetrics, CollectionMetrics, RegionalFinanceMetrics, MonthlyFinanceTrend } from '@/types/finance';

export const financeKPIs: FinanceKPI[] = [
  {
    label: 'Total Billed',
    value: 21739892,
    unit: 'KES',
    target: 23761055,
    percentRealized: 91,
    trend: 'up',
    status: 'good',
    monthlyValue: 21739892,
    cumulativeValue: 190127948,
  },
  {
    label: 'Total Collection',
    value: 23335361,
    unit: 'KES',
    target: 22573002,
    percentRealized: 103,
    trend: 'up',
    status: 'good',
    monthlyValue: 23335361,
    cumulativeValue: 188904487,
  },
  {
    label: 'Collection Efficiency',
    value: 115,
    unit: '%',
    target: 105,
    percentRealized: 109,
    trend: 'up',
    status: 'good',
    monthlyValue: 115,
    cumulativeValue: 103,
  },
  {
    label: 'Water Sales',
    value: 13956857,
    unit: 'KES',
    target: 16490988,
    percentRealized: 85,
    trend: 'up',
    status: 'warning',
    monthlyValue: 13956857,
    cumulativeValue: 129618709,
  },
];

export const cumulativeFinanceKPIs: FinanceKPI[] = [
  {
    label: 'Cumulative Billed',
    value: 190127948,
    unit: 'KES',
    target: 213484296,
    percentRealized: 89,
    trend: 'up',
    status: 'warning',
  },
  {
    label: 'Cumulative Collection',
    value: 188904487,
    unit: 'KES',
    target: 202810082,
    percentRealized: 93,
    trend: 'up',
    status: 'good',
  },
  {
    label: 'YTD Collection Efficiency',
    value: 103,
    unit: '%',
    target: 105,
    percentRealized: 98,
    trend: 'stable',
    status: 'good',
  },
  {
    label: 'Cumulative Water Sales',
    value: 129618709,
    unit: 'KES',
    target: 144017276,
    percentRealized: 90,
    trend: 'up',
    status: 'good',
  },
];

export const billingMetrics: BillingMetrics = {
  waterSales: { monthly: 13956857, cumulative: 129618709, target: 144017276, percentRealized: 90 },
  sewerageSales: { monthly: 5710579, cumulative: 46919802, target: 50536320, percentRealized: 93 },
  totalBilled: { monthly: 21739892, cumulative: 190127948, target: 213484296, percentRealized: 89 },
  bulkWater: { monthly: 73540, cumulative: 493190 },
  meterRent: { monthly: 281750, cumulative: 4783850 },
  newConnectionsWater: { monthly: 417500, cumulative: 2137500 },
  newConnectionsSewer: { monthly: 17500, cumulative: 265500 },
  reconnections: { monthly: 122500, cumulative: 2586500 },
  prepaidKiosk: { monthly: 67500, cumulative: 933000 },
  penalties: { monthly: 285362, cumulative: 573342 },
  exhauster: { monthly: 195000, cumulative: 1522500 },
};

export const collectionMetrics: CollectionMetrics = {
  totalCollection: { monthly: 23335361, cumulative: 188904487, target: 202810082, percentRealized: 93 },
  collectionEfficiency: { monthly: 115, cumulative: 103, target: 105 },
  disconnectedWater: { monthly: 111, cumulative: 2161 },
  disconnectedSewer: { monthly: 5, cumulative: 184 },
};

export const regionalFinanceMetrics: RegionalFinanceMetrics[] = [
  {
    region: 'Central',
    billedWater: { monthly: 9123070, cumulative: 71285877 },
    billedSewer: { monthly: 5635044, cumulative: 46266612 },
    otherSales: { monthly: 1189108, cumulative: 7076439 },
    totalBilled: { monthly: 15947221, cumulative: 124628928 },
    collected: { monthly: 16977535, cumulative: 126670652 },
    collectionEfficiency: { monthly: 127, cumulative: 106 },
  },
  {
    region: 'Southern',
    billedWater: { monthly: 2884277, cumulative: 36331038 },
    billedSewer: { monthly: 0, cumulative: 0 },
    otherSales: { monthly: 539558, cumulative: 3538350 },
    totalBilled: { monthly: 3423835, cumulative: 39869388 },
    collected: { monthly: 3717078, cumulative: 36580538 },
    collectionEfficiency: { monthly: 84, cumulative: 97 },
  },
  {
    region: 'Eastern',
    billedWater: { monthly: 1949510, cumulative: 22001794 },
    billedSewer: { monthly: 75535, cumulative: 653540 },
    otherSales: { monthly: 143598, cumulative: 1046671 },
    totalBilled: { monthly: 2168643, cumulative: 23701655 },
    collected: { monthly: 2640748, cumulative: 25653297 },
    collectionEfficiency: { monthly: 120, cumulative: 108 },
  },
];

export const monthlyFinanceTrends: MonthlyFinanceTrend[] = [
  { month: 'Jul', billed: 18500000, collected: 17200000, collectionEfficiency: 93, target: 95 },
  { month: 'Aug', billed: 19800000, collected: 18600000, collectionEfficiency: 94, target: 95 },
  { month: 'Sep', billed: 20200000, collected: 19500000, collectionEfficiency: 97, target: 98 },
  { month: 'Oct', billed: 21500000, collected: 20800000, collectionEfficiency: 97, target: 100 },
  { month: 'Nov', billed: 22100000, collected: 21800000, collectionEfficiency: 99, target: 102 },
  { month: 'Dec', billed: 19500000, collected: 19200000, collectionEfficiency: 98, target: 103 },
  { month: 'Jan', billed: 24200000, collected: 23500000, collectionEfficiency: 97, target: 104 },
  { month: 'Feb', billed: 21800000, collected: 21200000, collectionEfficiency: 97, target: 104 },
  { month: 'Mar', billed: 20800000, collected: 19800000, collectionEfficiency: 95, target: 105 },
  { month: 'Apr', billed: 21739892, collected: 23335361, collectionEfficiency: 107, target: 105 },
];

export const financeSummary = {
  currentYear: {
    totalBilled: 190127948,
    totalCollected: 188904487,
    collectionEfficiency: 99.4,
  },
  previousYear: {
    totalBilled: 172135867,
    totalCollected: 164519694,
    collectionEfficiency: 95.6,
  },
  growth: {
    billed: 10.4,
    collected: 14.8,
    efficiency: 4.0,
  },
};
