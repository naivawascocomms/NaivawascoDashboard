import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from 'lucide-react';

interface PeriodFilterProps {
  selectedMonth: string;
  selectedYear: string;
  onMonthChange: (month: string) => void;
  onYearChange: (year: string) => void;
  fiscalYears?: Array<{ value: string; label: string }>;
  allowAllMonths?: boolean;
  showCumulative?: boolean;
  isCumulative?: boolean;
  onCumulativeChange?: (cumulative: boolean) => void;
}

// Financial year starts July — list months in FY order
const months = [
  { value: '0',  label: 'All Months (FY)' },
  { value: '7',  label: 'July' },
  { value: '8',  label: 'August' },
  { value: '9',  label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
  { value: '1',  label: 'January' },
  { value: '2',  label: 'February' },
  { value: '3',  label: 'March' },
  { value: '4',  label: 'April' },
  { value: '5',  label: 'May' },
  { value: '6',  label: 'June' },
];

// FY start years — value is the July-year, label shows full FY span
// Historical data goes from FY 2020/21 through 2025/26
const fyYears = [
  { value: '2020', label: '2020-2021' },
  { value: '2021', label: '2021-2022' },
  { value: '2022', label: '2022-2023' },
  { value: '2023', label: '2023-2024' },
  { value: '2024', label: '2024-2025' },
  { value: '2025', label: '2025-2026' },
];

export function PeriodFilter({
  selectedMonth,
  selectedYear,
  onMonthChange,
  onYearChange,
  fiscalYears,
  allowAllMonths = true,
  showCumulative = false,
  isCumulative = true,
  onCumulativeChange,
}: PeriodFilterProps) {
  const visibleMonths = allowAllMonths ? months : months.filter(m => m.value !== '0');
  const visibleYears = fiscalYears ?? fyYears;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Calendar className="w-4 h-4" />
        <span className="text-sm">Period:</span>
      </div>

      {showCumulative && (
        <Select value={isCumulative ? 'ytd' : 'monthly'} onValueChange={(v) => onCumulativeChange?.(v === 'ytd')}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="View" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ytd">YTD Cumulative</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      )}

      <Select value={selectedYear} onValueChange={onYearChange}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="FY" />
        </SelectTrigger>
        <SelectContent>
          {visibleYears.map(y => (
            <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedMonth} onValueChange={onMonthChange}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent>
          {visibleMonths.map(m => (
            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
