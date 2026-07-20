// Shared labels, colors, and formatters for the Projects module.

import type { ProjectHealth, ProjectStatus } from '@/types/projects';

export const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

export const healthLabels: Record<ProjectHealth, string> = {
  on_track: 'On Track',
  delayed: 'Delayed',
  blocked: 'Blocked',
  completed: 'Completed',
  watch: 'Watch',
};

export const statusLabels: Record<ProjectStatus, string> = {
  planned: 'Planned',
  ongoing: 'Ongoing',
  stalled: 'Stalled',
  completed: 'Completed',
  closed: 'Closed',
};

export const healthColors: Record<string, string> = {
  on_track: '#16a34a',
  delayed: '#f59e0b',
  blocked: '#dc2626',
  completed: '#2563eb',
  watch: '#7c3aed',
};

export const statusOrder: ProjectStatus[] = ['ongoing', 'planned', 'stalled', 'completed', 'closed'];

export function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return 0;
  return Number(value) || 0;
}

export function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatCurrency(value: string | number | null | undefined) {
  const amount = toNumber(value);
  if (!amount) return '-';
  return `KES ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function healthBadgeClass(health: string) {
  if (health === 'on_track') return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25';
  if (health === 'completed') return 'bg-blue-500/10 text-blue-700 border-blue-500/25';
  if (health === 'delayed' || health === 'watch') return 'bg-amber-500/10 text-amber-700 border-amber-500/25';
  return 'bg-destructive/10 text-destructive border-destructive/25';
}
