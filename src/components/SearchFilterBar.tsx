import { useId, useState } from 'react';
import { Check, Clock, Download, Network, RotateCcw, Search, X } from 'lucide-react';
import type { Severity } from '../core/types';
import { severityLabel } from '../lib/format';

export type SeverityFilter = 'all' | Severity;
export type TimeWindowPreset = 'all' | '15m' | '1h' | '24h' | '7d' | 'custom';

export interface FilterBarState {
  query: string;
  severity: SeverityFilter;
  sourceIp: string;
  timeWindow: TimeWindowPreset;
  fromTimestamp: string;
  toTimestamp: string;
}

export const INITIAL_FILTER_STATE: FilterBarState = {
  query: '',
  severity: 'all',
  sourceIp: '',
  timeWindow: 'all',
  fromTimestamp: '',
  toTimestamp: '',
};

export function hasActiveFilters(state: FilterBarState): boolean {
  return (
    state.query.trim().length > 0 ||
    state.severity !== 'all' ||
    state.sourceIp.trim().length > 0 ||
    state.timeWindow !== 'all' ||
    state.fromTimestamp.length > 0 ||
    state.toTimestamp.length > 0
  );
}

const PRESET_WINDOW_MS: Record<Exclude<TimeWindowPreset, 'all' | 'custom'>, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

export function matchesTimestampFilter(
  isoTimestamp: string,
  state: Pick<FilterBarState, 'timeWindow' | 'fromTimestamp' | 'toTimestamp'>,
): boolean {
  if (state.timeWindow === 'all') return true;
  const tsMs = Date.parse(isoTimestamp);
  if (Number.isNaN(tsMs)) return true;

  if (state.timeWindow !== 'custom') {
    const windowMs = PRESET_WINDOW_MS[state.timeWindow];
    return Date.now() - tsMs <= windowMs;
  }

  if (state.fromTimestamp) {
    const fromMs = Date.parse(state.fromTimestamp);
    if (!Number.isNaN(fromMs) && tsMs < fromMs) return false;
  }
  if (state.toTimestamp) {
    const toMs = Date.parse(state.toTimestamp);
    if (!Number.isNaN(toMs) && tsMs > toMs) return false;
  }
  return true;
}

interface SearchFilterBarProps {
  value: FilterBarState;
  onChange: (next: FilterBarState) => void;
  onReset: () => void;
  availableIps: string[];
  matchedCount: number;
  totalCount: number;
  itemLabel: string;
  searchPlaceholder: string;
  surface?: 'suede' | 'nude';
  testIdPrefix: string;
  onExportCsv?: () => void;
}

const SEVERITY_OPTIONS: Array<{ id: SeverityFilter; label: string }> = [
  { id: 'all', label: 'All Severities' },
  { id: 'critical', label: severityLabel('critical') },
  { id: 'high', label: severityLabel('high') },
  { id: 'medium', label: severityLabel('medium') },
  { id: 'low', label: severityLabel('low') },
];

export function SearchFilterBar({
  value,
  onChange,
  onReset,
  availableIps,
  matchedCount,
  totalCount,
  itemLabel,
  searchPlaceholder,
  surface = 'nude',
  testIdPrefix,
  onExportCsv,
}: SearchFilterBarProps) {
  const ipListId = useId();
  const [justExported, setJustExported] = useState(false);
  const active = hasActiveFilters(value);

  const handleExportClick = () => {
    if (!onExportCsv || matchedCount === 0) return;
    onExportCsv();
    setJustExported(true);
    window.setTimeout(() => setJustExported(false), 2000);
  };

  const patch = (partial: Partial<FilterBarState>) => {
    onChange({ ...value, ...partial });
  };

  return (
    <section
      aria-label={`Search and filter ${itemLabel}`}
      data-testid={`${testIdPrefix}-filter-bar`}
      className={`${surface === 'suede' ? 'window-suede' : 'window-nude'} rounded-lg p-4 space-y-3`}
    >
      {/* Row 1: Keyword Search + Source IP + Timestamp Window */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Free-text search */}
        <div className="md:col-span-5 relative">
          <Search
            className="w-4 h-4 text-[var(--sentinel-ink-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={value.query}
            onChange={(e) => patch({ query: e.target.value })}
            placeholder={searchPlaceholder}
            aria-label={`Search ${itemLabel}`}
            data-testid={`${testIdPrefix}-search-input`}
            className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm surface-input rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--sentinel-teal)]"
          />
          {value.query && (
            <button
              type="button"
              onClick={() => patch({ query: '' })}
              aria-label="Clear search query"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--sentinel-ink-muted)] hover:text-[var(--sentinel-ink)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Source IP filter with datalist autocomplete */}
        <div className="md:col-span-4 relative">
          <Network
            className="w-4 h-4 text-[var(--sentinel-ink-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            list={ipListId}
            value={value.sourceIp}
            onChange={(e) => patch({ sourceIp: e.target.value })}
            placeholder="Source IP (e.g. 185.220.101.44)"
            aria-label="Filter by source IP"
            data-testid={`${testIdPrefix}-ip-input`}
            className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm font-mono tabular-nums surface-input rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--sentinel-teal)]"
          />
          <datalist id={ipListId}>
            {availableIps.map((ip) => (
              <option key={ip} value={ip} />
            ))}
          </datalist>
          {value.sourceIp && (
            <button
              type="button"
              onClick={() => patch({ sourceIp: '' })}
              aria-label="Clear source IP filter"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--sentinel-ink-muted)] hover:text-[var(--sentinel-ink)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Timestamp Window selector */}
        <div className="md:col-span-3 relative">
          <Clock
            className="w-4 h-4 text-[var(--sentinel-ink-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <select
            value={value.timeWindow}
            onChange={(e) => {
              const nextWindow = e.target.value as TimeWindowPreset;
              patch({
                timeWindow: nextWindow,
                ...(nextWindow !== 'custom' ? { fromTimestamp: '', toTimestamp: '' } : {}),
              });
            }}
            aria-label="Filter by timestamp window"
            data-testid={`${testIdPrefix}-time-select`}
            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm surface-input rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--sentinel-teal)] cursor-pointer"
          >
            <option value="all">Any Timestamp</option>
            <option value="15m">Last 15 Minutes</option>
            <option value="1h">Last 1 Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="custom">Custom Time Range…</option>
          </select>
        </div>
      </div>

      {/* Optional Custom Timestamp Range Inputs */}
      {value.timeWindow === 'custom' && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-[var(--sentinel-divider)]"
          data-testid={`${testIdPrefix}-custom-time-range`}
        >
          <label className="flex items-center gap-2 text-xs text-[var(--sentinel-ink-secondary)]">
            <span className="font-medium whitespace-nowrap w-10">From</span>
            <input
              type="datetime-local"
              value={value.fromTimestamp}
              onChange={(e) => patch({ fromTimestamp: e.target.value })}
              data-testid={`${testIdPrefix}-from-timestamp`}
              className="flex-1 px-2.5 py-1.5 text-xs font-mono tabular-nums surface-input rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--sentinel-teal)]"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--sentinel-ink-secondary)]">
            <span className="font-medium whitespace-nowrap w-10">To</span>
            <input
              type="datetime-local"
              value={value.toTimestamp}
              onChange={(e) => patch({ toTimestamp: e.target.value })}
              data-testid={`${testIdPrefix}-to-timestamp`}
              className="flex-1 px-2.5 py-1.5 text-xs font-mono tabular-nums surface-input rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--sentinel-teal)]"
            />
          </label>
        </div>
      )}

      {/* Row 2: Severity Segmented Filter + Match Counter & Reset */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-[var(--sentinel-divider)]">
        <div
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-[var(--sentinel-segment)] rounded-md"
          role="group"
          aria-label="Filter by severity"
        >
          {SEVERITY_OPTIONS.map((opt) => {
            const selected = value.severity === opt.id;
            const activeColor =
              opt.id === 'critical'
                ? 'text-[var(--sentinel-crit)]'
                : opt.id === 'high'
                  ? 'text-[var(--sentinel-high)]'
                  : 'text-[var(--sentinel-ink)]';
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={selected}
                data-testid={`${testIdPrefix}-severity-${opt.id}`}
                onClick={() => patch({ severity: opt.id })}
                className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selected
                    ? `bg-[var(--sentinel-suede)] ${activeColor} font-semibold shadow-xs`
                    : 'text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-ink)] font-medium'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs text-[var(--sentinel-ink-secondary)]">
          <span
            className="font-mono tabular-nums"
            data-testid={`${testIdPrefix}-match-count`}
          >
            Showing <strong className="text-[var(--sentinel-ink)]">{matchedCount}</strong> / {totalCount}{' '}
            {itemLabel}
          </span>
          {active && (
            <button
              type="button"
              onClick={onReset}
              data-testid={`${testIdPrefix}-reset-filters`}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[var(--sentinel-teal)] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
          {onExportCsv && (
            <button
              type="button"
              disabled={matchedCount === 0}
              onClick={handleExportClick}
              data-testid={`${testIdPrefix}-export-csv-btn`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--sentinel-ink)] bg-[var(--sentinel-suede)] border border-[var(--sentinel-border)] rounded-md hover:border-[var(--sentinel-teal)] hover:text-[var(--sentinel-teal)] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {justExported ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[var(--sentinel-teal)]" />
                  <span>Exported CSV ({matchedCount})</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-[var(--sentinel-teal)]" />
                  <span>Export CSV</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
