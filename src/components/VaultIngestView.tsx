import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2, Crosshair, ShieldAlert, Upload } from 'lucide-react';
import type { Severity, SystemSnapshot, VaultEntry } from '../core/types';
import { formatUtcTime, severityLabel, severityTextClass } from '../lib/format';
import { downloadCsvFile, formatAuditExportDate } from '../lib/csv';
import {
  INITIAL_FILTER_STATE,
  SearchFilterBar,
  matchesTimestampFilter,
  type FilterBarState,
} from './SearchFilterBar';

interface VaultIngestViewProps {
  snapshot: SystemSnapshot;
  highlightedVaultSeq: number | null;
  highlightedAlertId: string | null;
  onClearHighlight: () => void;
  onResolveAlert: (alertId: string, note?: string) => Promise<void>;
  onReturnToAlert: (alertId: string) => void;
  onIngestEvent: (payload: {
    sourceSystem: string;
    rawActor: string;
    action: string;
    sourceIp: string;
    endpoint: string;
    volumeCount: number;
    clockSkewMs: number;
    rawPayload: string;
  }) => Promise<void>;
  busyAction: string | null;
}

export function VaultIngestView({
  snapshot,
  highlightedVaultSeq,
  highlightedAlertId,
  onClearHighlight,
  onResolveAlert,
  onReturnToAlert,
  onIngestEvent,
  busyAction,
}: VaultIngestViewProps) {
  const [sourceSystem, setSourceSystem] = useState('BACS Payroll & HRIS');
  const [rawActor, setRawActor] = useState('payroll-runner-02');
  const [sourceIp, setSourceIp] = useState('198.51.100.14');
  const [clockSkewMs, setClockSkewMs] = useState(3400);
  const [volumeCount, setVolumeCount] = useState(24);
  const [rawPayload, setRawPayload] = useState(
    `Batch sync by finance@harborfinch.co.uk with token ${['sk', 'live', 'demo_88219a01b2'].join('_')} for IBAN GB29NWBK60161331926819`,
  );
  const [ingestMessage, setIngestMessage] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [showIngestForm, setShowIngestForm] = useState(false);
  const [filterState, setFilterState] = useState<FilterBarState>(INITIAL_FILTER_STATE);

  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);

  // When jumping from an alert to an exact log spot, clear active vault filters so the target row is always visible
  useEffect(() => {
    if (highlightedVaultSeq) {
      setFilterState(INITIAL_FILTER_STATE);
    }
  }, [highlightedVaultSeq]);

  useEffect(() => {
    if (highlightedVaultSeq && highlightRowRef.current) {
      highlightRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedVaultSeq]);

  // Map vault sequences to their associated alert severity and source IP for accurate severity/IP filtering
  const alertMetaByVaultSeq = useMemo(() => {
    const map = new Map<number, { severity: Severity; sourceIp?: string }>();
    for (const alert of snapshot.alerts) {
      const meta = { severity: alert.severity, sourceIp: alert.sourceIp };
      if (alert.vaultSequence) map.set(alert.vaultSequence, meta);
      if (alert.sourceVaultSequence) map.set(alert.sourceVaultSequence, meta);
      if (alert.activeResponse?.vaultSequence) map.set(alert.activeResponse.vaultSequence, meta);
      if (alert.activeResponse?.undoVaultSequence) {
        map.set(alert.activeResponse.undoVaultSequence, meta);
      }
    }
    return map;
  }, [snapshot.alerts]);

  const inferEntrySeverity = (entry: VaultEntry): Severity => {
    const linked = alertMetaByVaultSeq.get(entry.sequence);
    if (linked) return linked.severity;
    if (entry.entryType === 'alert_raised') return 'high';
    if (entry.entryType === 'payment_hold' || entry.entryType === 'response_executed') return 'high';
    if (entry.entryType === 'honey_trap_created' || entry.entryType === 'response_undone') {
      return 'medium';
    }
    return 'low';
  };

  const availableIps = useMemo(() => {
    const set = new Set<string>();
    for (const entry of snapshot.vaultEntries) {
      const ip = entry.sourceIp || alertMetaByVaultSeq.get(entry.sequence)?.sourceIp;
      if (ip) set.add(ip);
    }
    return Array.from(set).sort();
  }, [snapshot.vaultEntries, alertMetaByVaultSeq]);

  const filteredEntries = useMemo(() => {
    const q = filterState.query.trim().toLowerCase();
    const ipQuery = filterState.sourceIp.trim().toLowerCase();

    return snapshot.vaultEntries.filter((entry) => {
      const entrySeverity = inferEntrySeverity(entry);
      const entryIp = entry.sourceIp || alertMetaByVaultSeq.get(entry.sequence)?.sourceIp || '';

      if (filterState.severity !== 'all' && entrySeverity !== filterState.severity) return false;
      if (ipQuery && !entryIp.toLowerCase().includes(ipQuery)) return false;
      if (!matchesTimestampFilter(entry.timestamp, filterState)) return false;
      if (!q) return true;

      return (
        `#${entry.sequence}`.includes(q) ||
        entry.summary.toLowerCase().includes(q) ||
        entry.actor.toLowerCase().includes(q) ||
        entry.entryType.replace(/_/g, ' ').toLowerCase().includes(q) ||
        (entry.sourceSystem ?? '').toLowerCase().includes(q) ||
        entryIp.toLowerCase().includes(q) ||
        (entry.logFileRef ?? '').toLowerCase().includes(q) ||
        (entry.redactedSnippet ?? '').toLowerCase().includes(q) ||
        (entry.matchedIndicator ?? '').toLowerCase().includes(q) ||
        entry.entryHash.toLowerCase().includes(q) ||
        formatUtcTime(entry.timestamp).toLowerCase().includes(q)
      );
    });
  }, [snapshot.vaultEntries, filterState, alertMetaByVaultSeq]);

  const highlightedEntry = highlightedVaultSeq
    ? snapshot.vaultEntries.find((e) => e.sequence === highlightedVaultSeq) ?? null
    : null;
  const linkedAlert = highlightedAlertId
    ? snapshot.alerts.find((a) => a.id === highlightedAlertId) ?? null
    : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!sourceSystem.trim() || !rawActor.trim() || !rawPayload.trim()) {
      setIngestError('Source system, raw actor alias, and raw payload are required.');
      return;
    }
    setIngestError(null);
    setIngestMessage(null);
    try {
      await onIngestEvent({
        sourceSystem: sourceSystem.trim(),
        rawActor: rawActor.trim(),
        action: 'agent.event.ingest',
        sourceIp: sourceIp.trim() || '198.51.100.14',
        endpoint: '/v2/payroll/status',
        volumeCount: Number(volumeCount) || 1,
        clockSkewMs: Number(clockSkewMs) || 0,
        rawPayload: rawPayload.trim(),
      });
      setIngestMessage(
        'Redacted at customer edge, clock skew stitched, alias normalized, and chained into the SHA-256 Log Vault.',
      );
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : 'Ingestion failed');
    }
  };

  const { vaultVerification, controlPlane } = snapshot;

  const handleExportVaultCsv = () => {
    const headers = [
      'Sequence',
      'Timestamp (UTC)',
      'Severity',
      'Entry Type',
      'Actor',
      'Source System',
      'Source IP',
      'Log File Ref',
      'Summary',
      'Redacted Snippet',
      'Matched Indicator',
      'Edge Redactions Count',
      'Region',
      'Customer KMS Fingerprint',
      'Entry SHA-256',
      'Prev SHA-256',
    ];
    const rows = filteredEntries.map((entry) => {
      const entrySeverity = inferEntrySeverity(entry);
      const entryIp = entry.sourceIp || alertMetaByVaultSeq.get(entry.sequence)?.sourceIp || '';
      return [
        entry.sequence,
        entry.timestamp,
        severityLabel(entrySeverity),
        entry.entryType,
        entry.actor,
        entry.sourceSystem ?? '',
        entryIp,
        entry.logFileRef ?? '',
        entry.summary,
        entry.redactedSnippet ?? '',
        entry.matchedIndicator ?? '',
        entry.redactionsCount,
        entry.region,
        entry.customerKeyFingerprint,
        entry.entryHash,
        entry.prevHash,
      ];
    });
    downloadCsvFile(`sentinel-vault-audit-${formatAuditExportDate()}.csv`, headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Exact Log Spot Forensic Spotlight Banner (shown when jumping from an alert) */}
      {highlightedEntry && (
        <section
          className="alert-pop-critical rounded-lg p-5 space-y-3"
          data-testid="exact-log-spot-banner"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[var(--sentinel-crit)]">
                <Crosshair className="w-4 h-4" />
                <span>EXACT VULNERABILITY LOG SPOT · VAULT #{highlightedEntry.sequence}</span>
              </div>
              <h2 className="text-base font-bold text-[var(--sentinel-ink)]">
                {highlightedEntry.logFileRef ?? highlightedEntry.sourceSystem ?? 'Regional Log Stream'}
              </h2>
              {highlightedEntry.matchedIndicator && (
                <p className="text-xs font-semibold text-[var(--sentinel-crit)]">
                  Spotted indicator: {highlightedEntry.matchedIndicator}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {linkedAlert && linkedAlert.status !== 'resolved' && (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void onResolveAlert(linkedAlert.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[var(--sentinel-teal)] rounded-md hover:bg-[var(--sentinel-teal-hover)] cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Resolve Alert
                </button>
              )}
              {linkedAlert && (
                <button
                  type="button"
                  onClick={() => onReturnToAlert(linkedAlert.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[var(--sentinel-ink)] surface-inset rounded-md cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Alert
                </button>
              )}
              <button
                type="button"
                onClick={onClearHighlight}
                className="px-2.5 py-2 text-xs font-medium text-[var(--sentinel-ink-secondary)] hover:underline cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="surface-inset rounded-md p-3 font-mono text-xs space-y-1.5">
            <p className="text-[var(--sentinel-ink-muted)]">
              Timestamp: {formatUtcTime(highlightedEntry.timestamp)} · Actor: {highlightedEntry.actor} · IP:{' '}
              {highlightedEntry.sourceIp ?? 'edge'}
            </p>
            <p className="text-[var(--sentinel-ink)] font-semibold break-words">
              {highlightedEntry.redactedSnippet ?? highlightedEntry.summary}
            </p>
            <p className="text-[11px] text-[var(--sentinel-ink-muted)] truncate">
              SHA-256 Entry: {highlightedEntry.entryHash} · Prev: {highlightedEntry.prevHash.slice(0, 16)}…
            </p>
          </div>
        </section>
      )}

      {/* Window 1 (Soft Suede): Verification Summary */}
      <section className="window-suede rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="text-xl font-bold text-[var(--sentinel-ink)]">
              Tamper-Evident SHA-256 Log Vault
            </h1>
            <p className="mt-1 text-sm text-[var(--sentinel-ink-secondary)]">
              Every ingested event and operator action is hash-chained under customer KMS key{' '}
              <span className="font-mono">{controlPlane.customerKeyFingerprint}</span> in{' '}
              <span className="font-mono">{controlPlane.region}</span>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {vaultVerification.valid ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sentinel-teal)]">
                <CheckCircle2 className="w-4 h-4" />
                Chain verified ({vaultVerification.verifiedEntries}/{vaultVerification.totalEntries})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sentinel-crit)]">
                <ShieldAlert className="w-4 h-4" />
                Broken at #{vaultVerification.brokenAtSequence}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowIngestForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--sentinel-ink)] bg-[var(--sentinel-nude)] border border-[var(--sentinel-border)] rounded-md hover:bg-[var(--sentinel-hover)] cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              {showIngestForm ? 'Hide Edge Ingest Form' : 'Test Edge Ingest'}
            </button>
          </div>
        </div>
      </section>

      {/* Top Search & Filtering Bar: Severity, Source IP, Timestamp, and Keyword */}
      <SearchFilterBar
        value={filterState}
        onChange={setFilterState}
        onReset={() => setFilterState(INITIAL_FILTER_STATE)}
        availableIps={availableIps}
        matchedCount={filteredEntries.length}
        totalCount={snapshot.vaultEntries.length}
        itemLabel="vault entries"
        searchPlaceholder="Search vault by #seq, actor, log file, snippet, hash, or UTC time..."
        surface="nude"
        testIdPrefix="vault"
        onExportCsv={handleExportVaultCsv}
      />

      {/* Collapsible Edge Ingest Sandbox (reduces clutter until needed) */}
      {showIngestForm && (
        <section className="window-nude rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--sentinel-ink)]">
            Outbound-Agent Event Ingest (Edge Redaction + Clock &amp; Alias Stitching)
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label htmlFor="ing-system" className="block text-xs font-medium text-[var(--sentinel-ink)]">
                  Source System
                </label>
                <input
                  id="ing-system"
                  type="text"
                  value={sourceSystem}
                  onChange={(e) => setSourceSystem(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-xs surface-input rounded-md"
                />
              </div>
              <div>
                <label htmlFor="ing-actor" className="block text-xs font-medium text-[var(--sentinel-ink)]">
                  Raw Actor Alias
                </label>
                <input
                  id="ing-actor"
                  type="text"
                  value={rawActor}
                  onChange={(e) => setRawActor(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-xs font-mono surface-input rounded-md"
                />
              </div>
              <div>
                <label htmlFor="ing-ip" className="block text-xs font-medium text-[var(--sentinel-ink)]">
                  Source IP
                </label>
                <input
                  id="ing-ip"
                  type="text"
                  value={sourceIp}
                  onChange={(e) => setSourceIp(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-xs font-mono surface-input rounded-md"
                />
              </div>
              <div>
                <label htmlFor="ing-skew" className="block text-xs font-medium text-[var(--sentinel-ink)]">
                  Clock Skew (ms)
                </label>
                <input
                  id="ing-skew"
                  type="number"
                  value={clockSkewMs}
                  onChange={(e) => setClockSkewMs(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 text-xs font-mono tabular-nums surface-input rounded-md"
                />
              </div>
              <div>
                <label htmlFor="ing-vol" className="block text-xs font-medium text-[var(--sentinel-ink)]">
                  Volume (req/hr)
                </label>
                <input
                  id="ing-vol"
                  type="number"
                  min={1}
                  value={volumeCount}
                  onChange={(e) => setVolumeCount(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 text-xs font-mono tabular-nums surface-input rounded-md"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-9">
                <label htmlFor="ing-payload" className="block text-xs font-medium text-[var(--sentinel-ink)]">
                  Raw Payload (secrets &amp; PII stripped at customer edge)
                </label>
                <input
                  id="ing-payload"
                  type="text"
                  value={rawPayload}
                  onChange={(e) => setRawPayload(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-xs font-mono surface-input rounded-md"
                />
              </div>
              <div className="lg:col-span-3">
                <button
                  type="submit"
                  disabled={busyAction !== null}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--sentinel-teal)] rounded-md hover:bg-[var(--sentinel-teal-hover)] disabled:opacity-50 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {busyAction === 'ingest' ? 'Processing...' : 'Ingest Event'}
                </button>
              </div>
            </div>
            {ingestError && <p className="text-xs font-semibold text-[var(--sentinel-crit)]">{ingestError}</p>}
            {ingestMessage && (
              <p className="text-xs text-[var(--sentinel-teal-ink)] bg-[var(--sentinel-teal-soft)] rounded px-3 py-2">
                {ingestMessage}
              </p>
            )}
          </form>
        </section>
      )}

      {/* Window 2 (Soft Nude): Hash-Chained Ledger Table */}
      <section className="window-nude rounded-lg overflow-hidden">
        <div className="p-4 border-b border-[var(--sentinel-divider)] flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--sentinel-ink)]">
            Hash-Chained Audit &amp; Telemetry Ledger
          </h2>
          <span className="text-xs font-mono tabular-nums text-[var(--sentinel-ink-muted)]">
            Head: {vaultVerification.headHash.slice(0, 14)}…
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--sentinel-divider)] text-xs font-medium text-[var(--sentinel-ink-muted)] bg-[var(--sentinel-suede)]">
                <th className="py-2.5 px-4">Seq</th>
                <th className="py-2.5 px-4">Timestamp (UTC)</th>
                <th className="py-2.5 px-4">Source / Log File</th>
                <th className="py-2.5 px-4">Redacted Log Entry</th>
                <th className="py-2.5 px-4 text-right">SHA-256</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sentinel-divider)] text-xs" data-testid="vault-ledger-rows">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 px-4 text-center">
                    <p className="text-sm font-medium text-[var(--sentinel-ink)]">
                      No vault entries match the current filters
                    </p>
                    <button
                      type="button"
                      onClick={() => setFilterState(INITIAL_FILTER_STATE)}
                      className="mt-3 px-3 py-1.5 text-xs font-semibold text-[var(--sentinel-teal)] border border-[var(--sentinel-teal)] rounded-md cursor-pointer"
                    >
                      Reset Filters
                    </button>
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => {
                  const isSpot = highlightedVaultSeq === entry.sequence;
                  const entrySeverity = inferEntrySeverity(entry);
                  const entryIp = entry.sourceIp || alertMetaByVaultSeq.get(entry.sequence)?.sourceIp;
                  return (
                    <tr
                      key={entry.sequence}
                      ref={isSpot ? highlightRowRef : undefined}
                      data-testid={isSpot ? 'highlighted-vault-row' : undefined}
                      className={
                        isSpot
                          ? 'bg-[var(--sentinel-crit-bg)] ring-2 ring-inset ring-[var(--sentinel-crit-border)]'
                          : 'hover:bg-[var(--sentinel-suede)]/60'
                      }
                    >
                      <td className="py-3 px-4 font-mono tabular-nums font-bold text-[var(--sentinel-ink)] whitespace-nowrap align-top">
                        #{entry.sequence}
                        <span className={`block mt-0.5 text-[10px] ${severityTextClass(entrySeverity)}`}>
                          {severityLabel(entrySeverity)}
                        </span>
                        {isSpot && (
                          <span className="block text-[10px] font-bold text-[var(--sentinel-crit)]">
                            SPOTTED HERE
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-[var(--sentinel-ink-secondary)] whitespace-nowrap align-top">
                        {formatUtcTime(entry.timestamp)}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <p className="font-semibold text-[var(--sentinel-ink)]">
                          {entry.entryType.replace(/_/g, ' ')}
                        </p>
                        <p className="font-mono text-[11px] text-[var(--sentinel-ink-muted)]">
                          {entry.logFileRef ?? entry.actor}
                        </p>
                        {entryIp && (
                          <p className="font-mono tabular-nums text-[11px] text-[var(--sentinel-ink-secondary)]">
                            IP: {entryIp}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[var(--sentinel-ink)] max-w-md align-top">
                        <p className="font-medium">{entry.summary}</p>
                        {entry.redactedSnippet && (
                          <p className="mt-1 font-mono text-[11px] text-[var(--sentinel-ink-secondary)] break-words">
                            {entry.redactedSnippet}
                          </p>
                        )}
                        {entry.redactionsCount > 0 && (
                          <span className="inline-block mt-1 text-[11px] text-[var(--sentinel-teal)] font-mono font-semibold">
                            {entry.redactionsCount} secret/PII masked at edge
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[var(--sentinel-ink-muted)] whitespace-nowrap align-top">
                        {entry.entryHash.slice(0, 12)}…
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
