// NAIVAWASCO's financial year runs July through June. A "FY year" is the
// calendar year the FY starts in: FY 2025 = Jul 2025 – Jun 2026.

export const FY_START_MONTH = 7;

/** Calendar month numbers in FY order: Jul … Dec, Jan … Jun. */
export const FY_MONTH_ORDER = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];

export const MONTH_SHORT_LABELS: Record<number, string> = {
  1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun',
  7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec',
};

/** FY start year containing the given date (Jan–Jun belongs to the prior FY). */
export function fyYearForDate(date: Date = new Date()): number {
  return date.getMonth() >= FY_START_MONTH - 1 ? date.getFullYear() : date.getFullYear() - 1;
}

/** Calendar year a month falls in within a FY: (2025, 7) → 2025; (2025, 1) → 2026. */
export function calYearForFyMonth(fyYear: number, month: number): number {
  return month >= FY_START_MONTH ? fyYear : fyYear + 1;
}

/** "FY 2025/26" */
export function formatFyLabel(fyYear: number): string {
  return `FY ${fyYear}/${String(fyYear + 1).slice(-2)}`;
}
