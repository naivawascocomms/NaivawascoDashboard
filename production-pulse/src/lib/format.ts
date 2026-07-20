// Shared number formatting for dashboards. Use these instead of per-page
// fmt()/n() helper copies so values render consistently across modules.

/** Coerce API values (decimal strings, nulls) to a number, defaulting to 0. */
export function toNumber(value: string | number | null | undefined): number {
  if (value == null || value === '') return 0;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Compact K/M notation for large magnitudes: 1234567 → "1.23M", 4321 → "4.3K". */
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/** Whole number with thousands separators. */
export function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/**
 * Unit-aware KPI value formatting: percentages get one decimal, rate units
 * (kWh/m³, KES/m³, …) two decimals, everything else compact K/M notation.
 */
export function formatKpiValue(value: number, unit?: string): string {
  if (unit === '%') return value.toFixed(1);
  if (unit && unit.includes('/')) return value.toFixed(2);
  return formatCompact(value);
}
