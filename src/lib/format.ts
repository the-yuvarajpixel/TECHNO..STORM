import type { Severity } from '../core/types';

export function formatUtcTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export function formatShortUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(11, 19) + ' UTC';
}

export function formatRelativeTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 48) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function formatCountdown(deadlineIso: string): string {
  const target = Date.parse(deadlineIso);
  if (!Number.isFinite(target)) return '72h 00m';
  const diffMs = Math.max(0, target - Date.now());
  const hours = Math.floor(diffMs / 3_600_000);
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  const secs = Math.floor((diffMs % 60_000) / 1000);
  return `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

export function severityLabel(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return 'Critical';
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
  }
}

export function severityTextClass(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return 'text-[var(--sentinel-crit)] font-bold';
    case 'high':
      return 'text-[var(--sentinel-high)] font-bold';
    case 'medium':
      return 'text-[var(--sentinel-teal)] font-semibold';
    case 'low':
      return 'text-[var(--sentinel-ink-secondary)] font-medium';
  }
}
