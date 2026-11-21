import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  FileSearch,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Unlock,
  Webhook,
  X,
} from 'lucide-react';
import type { SecurityAlert, SystemSnapshot } from '../core/types';
import type { UiCopy } from '../lib/i18n';
import { formatRelativeTime, formatUtcTime, severityLabel, severityTextClass } from '../lib/format';
import { downloadCsvFile, formatAuditExportDate } from '../lib/csv';
import {
  INITIAL_FILTER_STATE,
  SearchFilterBar,
  matchesTimestampFilter,
  type FilterBarState,
} from './SearchFilterBar';

interface OverviewAlertsViewProps {
  snapshot: SystemSnapshot;
  copy: UiCopy;
  selectedAlertId: string | null;
  onSelectAlert: (id: string) => void;
  onFeedback: (alertId: string, decision: 'approve' | 'dismiss', note?: string) => Promise<void>;
  onExecuteResponse: (alertId: string, optionId: string) => Promise<void>;
  onUndoResponse: (alertId: string) => Promise<void>;
  onResolveAlert: (alertId: string, note?: string) => Promise<void>;
  onUnblockSession?: (sourceIp: string) => Promise<void>;
  onInspectLogSpot: (vaultSequence: number, alertId: string) => void;
  onOpenView: (view: 'fingerprints' | 'honey_traps' | 'drift_toolkit' | 'vault' | 'architecture') => void;
  onStartDemo: () => void;
  onOpenPhoneAttackerModal: () => void;
  onOpenBreachDrill: () => void;
  drillActive?: boolean;
  onRefreshAlerts: (options?: { emitNewToasts?: boolean }) => Promise<boolean>;
  lastSyncedAt: string | null;
  busyAction: string | null;
}

const AUTO_REFRESH_STORAGE_KEY = 'sentinel-overview-auto-refresh-30s';
const AUTO_REFRESH_INTERVAL_SEC = 30;

function readInitialAutoRefresh(): boolean {
  if (typeof window === 'undefined') return true;
  const saved = window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY);
  if (saved === 'false') return false;
  if (saved === 'true') return true;
  return true;
}

export function OverviewAlertsView({
  snapshot,
  copy,
  selectedAlertId,
  onSelectAlert,
  onFeedback,
  onExecuteResponse,
  onUndoResponse,
  onResolveAlert,
  onUnblockSession,
  onInspectLogSpot,
  onOpenView,
  onStartDemo,
  onOpenPhoneAttackerModal,
  onOpenBreachDrill,
  drillActive = false,
  onRefreshAlerts,
  lastSyncedAt,
  busyAction,
}: OverviewAlertsViewProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'contained' | 'resolved'>('all');
  const [filterState, setFilterState] = useState<FilterBarState>(INITIAL_FILTER_STATE);
  const [selectedOptionByAlert, setSelectedOptionByAlert] = useState<Record<string, string>>({});
  const [feedbackNote, setFeedbackNote] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(readInitialAutoRefresh);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState<number>(AUTO_REFRESH_INTERVAL_SEC);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pollFailed, setPollFailed] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);
  const remainingRef = useRef<number>(AUTO_REFRESH_INTERVAL_SEC);
  const lastPollMsRef = useRef<number>(Date.now());

  // Persist user preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, String(autoRefreshEnabled));
    }
  }, [autoRefreshEnabled]);

  // Close View Settings popover on outside click or Escape
  useEffect(() => {
    if (!settingsOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [settingsOpen]);

  const runAlertPoll = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      const ok = await onRefreshAlerts({ emitNewToasts: true });
      setPollFailed(!ok);
      lastPollMsRef.current = Date.now();
    } catch {
      setPollFailed(true);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
      remainingRef.current = AUTO_REFRESH_INTERVAL_SEC;
      setSecondsUntilRefresh(AUTO_REFRESH_INTERVAL_SEC);
    }
  }, [onRefreshAlerts]);

  const handleToggleAutoRefresh = () => {
    setAutoRefreshEnabled((prev) => {
      const next = !prev;
      if (next) {
        // Trigger an immediate refresh when re-enabling auto-refresh
        void runAlertPoll();
      } else {
        setPollFailed(false);
      }
      return next;
    });
  };

  // 30-second Auto-Refresh polling loop with 1s countdown & tab-visibility catch-up
  useEffect(() => {
    if (!autoRefreshEnabled) {
      remainingRef.current = AUTO_REFRESH_INTERVAL_SEC;
      setSecondsUntilRefresh(AUTO_REFRESH_INTERVAL_SEC);
      return;
    }

    remainingRef.current = AUTO_REFRESH_INTERVAL_SEC;
    setSecondsUntilRefresh(AUTO_REFRESH_INTERVAL_SEC);

    const tick = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      if (syncingRef.current) return;
      remainingRef.current -= 1;
      if (remainingRef.current <= 0) {
        remainingRef.current = AUTO_REFRESH_INTERVAL_SEC;
        setSecondsUntilRefresh(AUTO_REFRESH_INTERVAL_SEC);
        void runAlertPoll();
      } else {
        setSecondsUntilRefresh(remainingRef.current);
      }
    }, 1000);

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        !syncingRef.current &&
        Date.now() - lastPollMsRef.current >= AUTO_REFRESH_INTERVAL_SEC * 1000
      ) {
        void runAlertPoll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoRefreshEnabled, runAlertPoll]);

  const availableIps = useMemo(() => {
    const set = new Set<string>();
    for (const a of snapshot.alerts) {
      if (a.sourceIp) set.add(a.sourceIp);
    }
    return Array.from(set).sort();
  }, [snapshot.alerts]);

  const filteredAlerts = useMemo(() => {
    const q = filterState.query.trim().toLowerCase();
    const ipQuery = filterState.sourceIp.trim().toLowerCase();
    return snapshot.alerts.filter((alert) => {
      if (statusFilter !== 'all' && alert.status !== statusFilter) return false;
      if (filterState.severity !== 'all' && alert.severity !== filterState.severity) return false;
      if (ipQuery && !alert.sourceIp.toLowerCase().includes(ipQuery)) return false;
      if (!matchesTimestampFilter(alert.createdAt, filterState)) return false;
      if (!q) return true;
      return (
        alert.title.toLowerCase().includes(q) ||
        alert.summary.toLowerCase().includes(q) ||
        alert.actorLabel.toLowerCase().includes(q) ||
        alert.sourceIp.toLowerCase().includes(q) ||
        alert.sourceSystem.toLowerCase().includes(q) ||
        alert.logFileRef.toLowerCase().includes(q) ||
        alert.matchedIndicator.toLowerCase().includes(q) ||
        formatUtcTime(alert.createdAt).toLowerCase().includes(q)
      );
    });
  }, [snapshot.alerts, statusFilter, filterState]);

  const activeAlert: SecurityAlert | null =
    filteredAlerts.find((a) => a.id === selectedAlertId) ??
    filteredAlerts[0] ??
    snapshot.alerts.find((a) => a.id === selectedAlertId) ??
    snapshot.alerts[0] ??
    null;

  const chosenOptionId = activeAlert
    ? selectedOptionByAlert[activeAlert.id] ?? activeAlert.blastRadius.recommendedOptionId
    : '';

  const activeOption = activeAlert?.blastRadius.options.find((o) => o.id === chosenOptionId) ?? null;

  const handleExportAlertsCsv = () => {
    const headers = [
      'Alert ID',
      'Timestamp (UTC)',
      'Severity',
      'Confidence (%)',
      'Status',
      'Category',
      'Origin',
      'Title',
      'Summary',
      'Actor',
      'Source System',
      'Source IP',
      'Log File Ref',
      'Matched Indicator',
      'Vault Sequence',
      'Resolved By',
      'Resolved At (UTC)',
    ];
    const rows = filteredAlerts.map((alert) => [
      alert.id,
      alert.createdAt,
      severityLabel(alert.severity),
      Math.round(alert.confidence * 100),
      alert.status,
      alert.category,
      alert.origin ?? 'detection_engine',
      alert.title,
      alert.summary,
      alert.actorLabel,
      alert.sourceSystem,
      alert.sourceIp,
      alert.logFileRef,
      alert.matchedIndicator,
      alert.sourceVaultSequence || alert.vaultSequence,
      alert.resolvedBy ?? '',
      alert.resolvedAt ?? '',
    ]);
    downloadCsvFile(`sentinel-alerts-audit-${formatAuditExportDate()}.csv`, headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Window 1 (Soft Suede): Compact Operational Header & KPI Strip */}
      <section className="window-suede rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="font-title text-2xl font-semibold tracking-tight text-[var(--sentinel-ink)]">
              {copy.overviewHeadline}
            </h1>
            <p className="mt-1 text-sm text-[var(--sentinel-ink-secondary)] leading-relaxed">
              {copy.overviewSubtitle}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Overview View Settings (30s Auto-Refresh Toggle + Manual Sync) */}
            <div className="relative" ref={settingsRef}>
              <button
                type="button"
                onClick={() => setSettingsOpen((prev) => !prev)}
                aria-expanded={settingsOpen}
                aria-haspopup="dialog"
                data-testid="overview-view-settings-btn"
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  autoRefreshEnabled
                    ? 'bg-[var(--sentinel-accent-soft)] text-[var(--sentinel-accent-soft-ink)] border-[var(--sentinel-accent)]/40 hover:border-[var(--sentinel-accent)]'
                    : 'bg-[var(--sentinel-inset)] text-[var(--sentinel-ink)] border-[var(--sentinel-border)] hover:border-[var(--sentinel-ink-muted)]'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                <span>View Settings</span>
                <span
                  className="font-mono text-[11px] tabular-nums opacity-85"
                  data-testid="auto-refresh-countdown"
                >
                  · {autoRefreshEnabled ? (isSyncing ? 'Syncing…' : `${secondsUntilRefresh}s`) : 'Off'}
                </span>
              </button>

              {settingsOpen && (
                <div
                  role="dialog"
                  aria-label="Overview View Settings"
                  data-testid="overview-view-settings-panel"
                  className="absolute right-0 mt-2 w-72 z-30 window-suede rounded-lg shadow-xl p-4 space-y-3.5 border border-[var(--sentinel-border)]"
                >
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--sentinel-divider)]">
                    <span className="font-title text-sm font-semibold text-[var(--sentinel-ink)]">
                      Overview View Settings
                    </span>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(false)}
                      aria-label="Close view settings"
                      className="p-1 rounded text-[var(--sentinel-ink-muted)] hover:text-[var(--sentinel-ink)] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* 30-Second Auto-Refresh Toggle */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-[var(--sentinel-ink)]">
                          Auto-Refresh (30s)
                        </p>
                        <span
                          className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
                            autoRefreshEnabled
                              ? 'text-[var(--sentinel-accent)]'
                              : 'text-[var(--sentinel-ink-muted)]'
                          }`}
                        >
                          · {autoRefreshEnabled ? 'On' : 'Off'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--sentinel-ink-secondary)] leading-snug">
                        Polls the Sentinel API for new alerts every 30 seconds while this view is open.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={autoRefreshEnabled}
                      aria-label="Toggle 30-second auto-refresh"
                      data-testid="auto-refresh-toggle"
                      onClick={handleToggleAutoRefresh}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-md border transition-colors cursor-pointer ${
                        autoRefreshEnabled
                          ? 'bg-[var(--sentinel-accent)] border-[var(--sentinel-accent)]'
                          : 'bg-[var(--sentinel-segment)] border-[var(--sentinel-border)]'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-sm bg-white transition-transform ${
                          autoRefreshEnabled ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>

                  {pollFailed && (
                    <div
                      role="status"
                      className="px-2.5 py-1.5 rounded-md alert-pop-critical text-[11px] font-medium text-[var(--sentinel-crit-ink)]"
                    >
                      Last poll could not reach Sentinel API. Will retry automatically or use Sync Now.
                    </div>
                  )}

                  {/* Sync Status & Manual Refresh Action */}
                  <div className="pt-2.5 border-t border-[var(--sentinel-divider)] flex items-center justify-between gap-2">
                    <div className="text-[11px] text-[var(--sentinel-ink-muted)] font-mono tabular-nums">
                      {autoRefreshEnabled ? (
                        <span>Next poll: {isSyncing ? 'now' : `${secondsUntilRefresh}s`}</span>
                      ) : (
                        <span>Auto-poll paused</span>
                      )}
                      {lastSyncedAt && (
                        <p className="text-[10px]">
                          Synced {formatUtcTime(lastSyncedAt)}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={isSyncing}
                      onClick={() => void runAlertPoll()}
                      data-testid="overview-refresh-now-btn"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-inset)] text-[var(--sentinel-ink)] hover:border-[var(--sentinel-accent)] disabled:opacity-60 transition-colors cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[var(--sentinel-accent)]' : ''}`} />
                      <span>{isSyncing ? 'Syncing' : 'Sync Now'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onOpenBreachDrill}
              data-testid="overview-run-breach-drill-btn"
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                drillActive
                  ? 'bg-[var(--sentinel-high-bg)] text-[var(--sentinel-high-ink)] border border-[var(--sentinel-high-border)]'
                  : 'bg-[var(--sentinel-high)] text-white hover:opacity-90'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{drillActive ? 'Breach Drill Active' : 'Run Breach Drill'}</span>
            </button>
            <button
              type="button"
              onClick={onOpenPhoneAttackerModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#DC2626] rounded-md hover:bg-[#B91C1C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5" />
              {copy.attackerLinkBtn}
              {snapshot.connectedRoles.attacker > 0 && (
                <span className="font-mono">({snapshot.connectedRoles.attacker})</span>
              )}
            </button>
            <button
              type="button"
              onClick={onStartDemo}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-[var(--sentinel-teal)] rounded-md hover:bg-[var(--sentinel-teal-hover)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copy.demoStart}
            </button>
          </div>
        </div>

        {/* 4-Metric Operational Summary Strip */}
        <div className="mt-5 pt-4 border-t border-[var(--sentinel-divider)] grid grid-cols-2 lg:grid-cols-4 gap-5">
          <div>
            <p className="text-xs font-medium text-[var(--sentinel-ink-muted)]">{copy.metricOpenAlerts}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className="text-2xl font-bold font-mono tabular-nums text-[var(--sentinel-crit)]"
                data-testid="metric-open-alerts"
              >
                {snapshot.metrics.alertsOpen}
              </span>
              <span className="text-xs font-semibold text-[var(--sentinel-crit)]">
                {snapshot.alerts.filter((a) => a.status === 'open' && a.severity === 'critical').length} critical
              </span>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-[var(--sentinel-ink-muted)]">{copy.metricControlDrift}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold font-mono tabular-nums text-[var(--sentinel-ink)]">
                {snapshot.controlDrift.driftScore}/100
              </span>
              <button
                type="button"
                onClick={() => onOpenView('drift_toolkit')}
                className="text-xs font-semibold text-[var(--sentinel-high)] hover:underline whitespace-nowrap cursor-pointer"
              >
                {snapshot.controlDrift.violatedCount} violated
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-[var(--sentinel-ink-muted)]">{copy.metricSecretsMasked}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold font-mono tabular-nums text-[var(--sentinel-ink)]">
                {snapshot.metrics.secretsMaskedAtEdge.toLocaleString()}
              </span>
              <span className="text-xs font-semibold text-[var(--sentinel-teal)]">0 raw stored</span>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-[var(--sentinel-ink-muted)]">{copy.metricLogVault}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold font-mono tabular-nums text-[var(--sentinel-ink)]">
                {snapshot.vaultVerification.verifiedEntries}
              </span>
              <span className="text-xs font-semibold text-[var(--sentinel-teal)]">
                {snapshot.vaultVerification.valid ? 'SHA-256 intact' : 'Tamper detected'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Top Search & Filtering Bar: Severity, Source IP, Timestamp, and Keyword */}
      <SearchFilterBar
        value={filterState}
        onChange={setFilterState}
        onReset={() => {
          setFilterState(INITIAL_FILTER_STATE);
          setStatusFilter('all');
        }}
        availableIps={availableIps}
        matchedCount={filteredAlerts.length}
        totalCount={snapshot.alerts.length}
        itemLabel="alerts"
        searchPlaceholder="Search alerts by title, key, system, indicator, or UTC time..."
        surface="nude"
        testIdPrefix="overview"
        onExportCsv={handleExportAlertsCsv}
      />

      {/* Alternating Split: Left Window 2 (Soft Nude) Alert Queue / Right Window 3 (Soft Suede) Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Alert Queue — Soft Nude */}
        <section className="xl:col-span-5 window-nude rounded-lg overflow-hidden">
          <div className="p-4 border-b border-[var(--sentinel-divider)] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[var(--sentinel-ink)]">{copy.alertQueueTitle}</h2>
              <span className="text-xs font-mono tabular-nums text-[var(--sentinel-ink-secondary)]">
                {filteredAlerts.length} / {snapshot.alerts.length}
              </span>
            </div>

            <div
              className="flex items-center gap-1 p-1 bg-[var(--sentinel-segment)] rounded-md"
              role="tablist"
              aria-label="Filter alerts by status"
            >
              {(
                [
                  { id: 'all', label: copy.filterAll },
                  { id: 'open', label: copy.filterOpen },
                  { id: 'contained', label: copy.filterContained },
                  { id: 'resolved', label: copy.filterResolved },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] shadow-xs font-semibold'
                      : 'text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-ink)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 space-y-2.5" data-testid="alert-list">
            {filteredAlerts.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm font-medium text-[var(--sentinel-ink)]">No alerts match the current filters</p>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all');
                    setFilterState(INITIAL_FILTER_STATE);
                  }}
                  className="mt-3 px-3 py-1.5 text-xs font-semibold text-[var(--sentinel-teal)] border border-[var(--sentinel-teal)] rounded-md cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              filteredAlerts.map((alert) => {
                const isSelected = activeAlert?.id === alert.id;
                const isUrgentOpen =
                  (alert.status === 'open' || alert.trappedAndBlocked) &&
                  (alert.severity === 'critical' || alert.severity === 'high');
                return (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={() => onSelectAlert(alert.id)}
                    className={`w-full text-left p-3.5 rounded-md transition-colors cursor-pointer ${
                      isUrgentOpen
                        ? alert.severity === 'critical'
                          ? `alert-pop-critical ${isSelected ? 'ring-2 ring-[var(--sentinel-crit-border)]' : ''}`
                          : `alert-pop-high ${isSelected ? 'ring-2 ring-[var(--sentinel-high-border)]' : ''}`
                        : isSelected
                          ? 'bg-[var(--sentinel-teal-soft)] border border-[var(--sentinel-teal)]'
                          : 'bg-[var(--sentinel-suede)] border border-[var(--sentinel-border)] hover:bg-[var(--sentinel-inset)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className={severityTextClass(alert.severity)}>
                        {severityLabel(alert.severity)} · {Math.round(alert.confidence * 100)}%
                        {alert.trappedAndBlocked
                          ? ' · TRAPPED & BLOCKED'
                          : alert.origin === 'manual_attacker'
                            ? ' · LIVE ATTACK'
                            : ''}
                      </span>
                      <span className="font-mono tabular-nums text-[var(--sentinel-ink-muted)]">
                        {formatRelativeTime(alert.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-bold text-[var(--sentinel-ink)] leading-snug">
                      {alert.title}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--sentinel-ink-secondary)]">
                      <span className="font-mono">{alert.actorLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{alert.sourceIp}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`capitalize font-semibold ${
                          alert.status === 'open'
                            ? 'text-[var(--sentinel-crit)]'
                            : 'text-[var(--sentinel-teal)]'
                        }`}
                      >
                        {alert.status}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Inspector + Exact Log Spot + Resolve + Blast-Radius Preview — Soft Suede */}
        <section className="xl:col-span-7 window-suede rounded-lg p-6">
          {!activeAlert ? (
            <div className="py-12 text-center text-sm text-[var(--sentinel-ink-secondary)]">
              Select an alert from the queue to inspect its log spot and response options.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header + Exact Log Spot & Resolve Buttons */}
              <div className="pb-5 border-b border-[var(--sentinel-divider)] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--sentinel-ink-secondary)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={severityTextClass(activeAlert.severity)}>
                      {severityLabel(activeAlert.severity)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {Math.round(activeAlert.confidence * 100)}% confidence
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize font-semibold text-[var(--sentinel-ink)]">
                      {activeAlert.status}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">Vault #{activeAlert.sourceVaultSequence}</span>
                  </div>
                  <span className="font-mono tabular-nums text-[var(--sentinel-ink-muted)]">
                    {formatUtcTime(activeAlert.createdAt)}
                  </span>
                </div>

                <h2 className="text-xl font-bold text-[var(--sentinel-ink)]">{activeAlert.title}</h2>
                <p className="text-sm text-[var(--sentinel-ink-secondary)] leading-relaxed">
                  {activeAlert.summary}
                </p>

                {/* Primary Vulnerability Action Strip: Exact Spot in Logs + Resolve */}
                <div className="pt-2 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    data-testid="inspect-exact-log-spot-btn"
                    onClick={() =>
                      onInspectLogSpot(
                        activeAlert.sourceVaultSequence || activeAlert.vaultSequence,
                        activeAlert.id,
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[var(--sentinel-ink)] bg-[var(--sentinel-nude)] border border-[var(--sentinel-border)] rounded-md hover:bg-[var(--sentinel-hover)] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <FileSearch className="w-3.5 h-3.5 text-[var(--sentinel-teal)]" />
                    {copy.inspectLogSpot} ({activeAlert.logFileRef.split('/').pop()})
                  </button>

                  {activeAlert.status !== 'resolved' ? (
                    <button
                      type="button"
                      data-testid="resolve-alert-btn"
                      disabled={busyAction !== null}
                      onClick={() => void onResolveAlert(activeAlert.id, feedbackNote)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--sentinel-teal)] rounded-md hover:bg-[var(--sentinel-teal-hover)] transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {busyAction === `resolve:${activeAlert.id}` ? 'Resolving...' : copy.resolveBtn}
                    </button>
                  ) : (
                    <span
                      data-testid="alert-resolved-badge"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--sentinel-teal-ink)] bg-[var(--sentinel-teal-soft)] rounded-md"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {copy.resolvedLabel}
                      {activeAlert.resolvedBy ? ` · ${activeAlert.resolvedBy}` : ''}
                    </span>
                  )}
                </div>

                {/* Exact Live Attack Telemetry & Signed Webhook Status */}
                {activeAlert.origin === 'manual_attacker' && (
                  <div
                    data-testid="exact-attack-telemetry"
                    className={`rounded-md p-3.5 text-xs space-y-2 ${
                      activeAlert.trappedAndBlocked ? 'alert-pop-critical' : 'surface-inset'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-bold text-[var(--sentinel-crit)]">
                        <Ban className="w-3.5 h-3.5" />
                        {activeAlert.trappedAndBlocked
                          ? 'STEALTH HONEY TRAP HIT — INTRUDER IMMEDIATELY TRAPPED & BLOCKED'
                          : 'EXACT LIVE INTRUDER TELEMETRY'}
                      </span>
                      {snapshot.webhookDeliveries[0] && (
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--sentinel-teal)] font-semibold">
                          <Webhook className="w-3 h-3" />
                          Webhook {snapshot.webhookDeliveries[0].status.toUpperCase()} (
                          {snapshot.webhookDeliveries[0].statusCode ?? 'ERR'} ·{' '}
                          {snapshot.webhookDeliveries[0].latencyMs}ms)
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-[11px] text-[var(--sentinel-ink)]">
                      <div>
                        <span className="text-[var(--sentinel-ink-muted)]">Intruder Handle: </span>
                        <strong>{activeAlert.attackerAlias ?? 'remote-phone-shell'}</strong>
                      </div>
                      <div>
                        <span className="text-[var(--sentinel-ink-muted)]">Source IP: </span>
                        <strong>{activeAlert.sourceIp}</strong>
                      </div>
                      <div>
                        <span className="text-[var(--sentinel-ink-muted)]">Exact Action: </span>
                        <strong>{activeAlert.attackAction ?? activeAlert.category}</strong>
                      </div>
                      <div>
                        <span className="text-[var(--sentinel-ink-muted)]">Exact Target: </span>
                        <strong>{activeAlert.attackTarget ?? activeAlert.actorLabel}</strong>
                      </div>
                    </div>
                    {onUnblockSession &&
                      (snapshot.blockedSessions ?? []).some(
                        (b) => b.sourceIp === activeAlert.sourceIp,
                      ) && (
                        <div className="pt-1 flex items-center justify-between gap-2 border-t border-[var(--sentinel-divider)]">
                          <span className="text-[11px] font-semibold text-[var(--sentinel-crit)]">
                            IP {activeAlert.sourceIp} is currently hard-blocked in Edge Quarantine.
                          </span>
                          <button
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() => void onUnblockSession(activeAlert.sourceIp)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[var(--sentinel-ink)] bg-[var(--sentinel-suede)] border border-[var(--sentinel-border)] rounded hover:border-[var(--sentinel-teal)] cursor-pointer"
                          >
                            <Unlock className="w-3 h-3 text-[var(--sentinel-teal)]" />
                            Release IP
                          </button>
                        </div>
                      )}
                  </div>
                )}

                {/* Inline Redacted Log Spot Preview */}
                <div className="surface-inset rounded-md p-3 text-xs font-mono space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[var(--sentinel-ink-muted)]">
                    <span>{activeAlert.logFileRef}</span>
                    <span>Vault #{activeAlert.sourceVaultSequence}</span>
                  </div>
                  <p className="text-[var(--sentinel-ink)] break-words">{activeAlert.logSnippet}</p>
                </div>
              </div>

              {/* Explain-Why Evidence */}
              <div>
                <h3 className="text-sm font-semibold text-[var(--sentinel-ink)]">
                  {copy.explainWhyTitle}
                </h3>
                <div className="mt-2.5 divide-y divide-[var(--sentinel-divider)] border-t border-b border-[var(--sentinel-divider)]">
                  {activeAlert.explainWhy.map((factor, idx) => (
                    <div key={idx} className="py-2.5 grid grid-cols-1 md:grid-cols-12 gap-2 text-sm">
                      <div className="md:col-span-5 font-medium text-[var(--sentinel-ink)]">
                        {factor.summary}
                      </div>
                      <div className="md:col-span-4 text-xs text-[var(--sentinel-ink-secondary)]">
                        <span className="text-[var(--sentinel-ink-muted)]">Expected: </span>
                        <span className="font-mono">{factor.expected}</span>
                      </div>
                      <div className="md:col-span-3 text-xs text-[var(--sentinel-crit)]">
                        <span className="text-[var(--sentinel-ink-muted)]">Observed: </span>
                        <span className="font-mono font-semibold">{factor.observed}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Safe Response: Blast-Radius Preview & Undo */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--sentinel-ink)]">
                    {copy.blastRadiusTitle}
                  </h3>
                  <span className="text-xs text-[var(--sentinel-ink-muted)]">
                    Reversible via 1-click Undo
                  </span>
                </div>

                {activeAlert.blastRadius.businessContextWarning && (
                  <div className="p-3.5 rounded-md alert-pop-critical flex items-start gap-2.5 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[var(--sentinel-crit)]" />
                    <div>
                      <span className="font-bold">Blast-radius warning: </span>
                      {activeAlert.blastRadius.businessContextWarning}
                    </div>
                  </div>
                )}

                {activeAlert.activeResponse && !activeAlert.activeResponse.undoneAt ? (
                  <div
                    className="p-4 rounded-md bg-[var(--sentinel-teal-soft)] border border-[var(--sentinel-teal)]/40 space-y-2"
                    data-testid="active-response-banner"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <ShieldCheck className="w-5 h-5 text-[var(--sentinel-teal)] shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-[var(--sentinel-teal-ink)]">
                            Containment active: {activeAlert.activeResponse.actionSummary}
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--sentinel-teal-ink)] font-mono tabular-nums">
                            {activeAlert.activeResponse.executedBy} · Vault #
                            {activeAlert.activeResponse.vaultSequence}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => void onUndoResponse(activeAlert.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[var(--sentinel-crit)] surface-inset rounded-md hover:bg-[var(--sentinel-crit-bg)] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {busyAction === `undo:${activeAlert.id}` ? 'Undoing...' : copy.undoAction}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeAlert.activeResponse?.undoneAt && (
                      <div
                        className="p-3 rounded-md surface-inset text-xs text-[var(--sentinel-ink-secondary)]"
                        data-testid="undone-response-banner"
                      >
                        Previous containment undone at{' '}
                        <span className="font-mono tabular-nums">
                          {formatUtcTime(activeAlert.activeResponse.undoneAt)}
                        </span>
                        . Both execution (Vault #{activeAlert.activeResponse.vaultSequence}) and rollback (Vault #
                        {activeAlert.activeResponse.undoVaultSequence}) remain permanently logged.
                      </div>
                    )}

                    <fieldset className="space-y-2">
                      <legend className="sr-only">Choose containment scope</legend>
                      {activeAlert.blastRadius.options.map((opt) => {
                        const checked = opt.id === chosenOptionId;
                        const isRecommended = opt.id === activeAlert.blastRadius.recommendedOptionId;
                        return (
                          <label
                            key={opt.id}
                            className={`block p-3.5 rounded-md border transition-colors cursor-pointer ${
                              checked
                                ? 'bg-[var(--sentinel-inset)] border-[var(--sentinel-teal)]'
                                : 'bg-[var(--sentinel-nude)]/50 border-[var(--sentinel-border)] hover:bg-[var(--sentinel-inset)]'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="radio"
                                name={`response-option-${activeAlert.id}`}
                                value={opt.id}
                                checked={checked}
                                onChange={() =>
                                  setSelectedOptionByAlert((prev) => ({
                                    ...prev,
                                    [activeAlert.id]: opt.id,
                                  }))
                                }
                                className="mt-1 accent-[var(--sentinel-teal)]"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-sm font-semibold text-[var(--sentinel-ink)]">
                                    {opt.title}
                                  </span>
                                  <span
                                    className={`text-xs font-mono tabular-nums ${
                                      opt.businessRisk === 'high'
                                        ? 'text-[var(--sentinel-crit)] font-semibold'
                                        : 'text-[var(--sentinel-teal)]'
                                    }`}
                                  >
                                    {isRecommended ? 'Recommended · ' : ''}
                                    {opt.estimatedUsersImpacted} users impacted
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-[var(--sentinel-ink-secondary)]">
                                  {opt.description}
                                </p>
                                {opt.disruptedServices.length > 0 && (
                                  <p className="mt-1 text-xs font-semibold text-[var(--sentinel-crit)]">
                                    Would disrupt: {opt.disruptedServices.join(', ')}
                                  </p>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </fieldset>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <span className="text-xs text-[var(--sentinel-ink-muted)]">
                        Checked: {activeAlert.blastRadius.affectedDownstream.join(', ')}
                      </span>
                      <button
                        type="button"
                        disabled={!activeOption || busyAction !== null}
                        onClick={() => activeOption && void onExecuteResponse(activeAlert.id, activeOption.id)}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[var(--sentinel-teal)] rounded-md hover:bg-[var(--sentinel-teal-hover)] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
                      >
                        <ShieldAlert className="w-4 h-4" />
                        {busyAction === `respond:${activeAlert.id}`
                          ? 'Executing...'
                          : activeOption?.mode === 'narrow_scoped'
                            ? copy.approveNarrower
                            : copy.executeContainment}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Adaptive Feedback Loop: Approve / Dismiss */}
              <div className="pt-4 border-t border-[var(--sentinel-divider)] space-y-3">
                <h3 className="text-sm font-semibold text-[var(--sentinel-ink)]">
                  {copy.teachBaselineTitle}
                </h3>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={feedbackNote}
                    onChange={(e) => setFeedbackNote(e.target.value)}
                    placeholder="Optional audit note (logged in Vault)..."
                    aria-label="Optional audit note"
                    className="flex-1 px-3 py-2 text-sm surface-input rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--sentinel-teal)]"
                  />
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={async () => {
                      await onFeedback(activeAlert.id, 'approve', feedbackNote);
                      setFeedbackNote('');
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[var(--sentinel-ink)] surface-inset rounded-md hover:bg-[var(--sentinel-hover)] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5 text-[var(--sentinel-teal)]" />
                    {copy.confirmThreat}
                  </button>
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={async () => {
                      await onFeedback(activeAlert.id, 'dismiss', feedbackNote);
                      setFeedbackNote('');
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[var(--sentinel-ink-secondary)] surface-inset rounded-md hover:bg-[var(--sentinel-hover)] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    {copy.dismissLearn}
                  </button>
                </div>

                {activeAlert.feedbackHistory.length > 0 && (
                  <div className="pt-1 space-y-1">
                    {activeAlert.feedbackHistory.map((item, idx) => (
                      <p key={idx} className="text-xs text-[var(--sentinel-ink-secondary)]">
                        <span className="font-semibold text-[var(--sentinel-ink)] capitalize">
                          {item.decision}
                        </span>
                        {' · '}
                        {item.operator}
                        {' · '}
                        {item.note}
                        {' · '}
                        <span className="font-mono tabular-nums text-[var(--sentinel-ink-muted)]">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
