import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, X } from 'lucide-react';
import type { BatchSelectionSummary } from '../core/batchAlerts';
import { severityLabel, severityTextClass } from '../lib/format';

interface BatchAlertConfirmModalProps {
  open: boolean;
  summary: BatchSelectionSummary | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => Promise<void>;
}

export function BatchAlertConfirmModal({
  open,
  summary,
  busy,
  onCancel,
  onConfirm,
}: BatchAlertConfirmModalProps) {
  const [auditNote, setAuditNote] = useState('');

  useEffect(() => {
    if (!open) {
      setAuditNote('');
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onCancel]);

  if (!open || !summary) return null;

  const isResolve = summary.action === 'resolve';
  const eligibleCount = summary.eligibleAlerts.length;
  const skippedCount = summary.skippedAlerts.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-alert-confirm-title"
      data-testid="batch-confirm-dialog"
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="window-suede rounded-lg w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h2
              id="batch-alert-confirm-title"
              className="font-title text-lg font-semibold text-[var(--sentinel-ink)]"
            >
              {isResolve
                ? `Resolve ${eligibleCount} Selected Alert${eligibleCount === 1 ? '' : 's'}?`
                : `Dismiss ${eligibleCount} Selected Alert${eligibleCount === 1 ? '' : 's'}?`}
            </h2>
            <p className="text-xs text-[var(--sentinel-ink-secondary)] leading-relaxed">
              {isResolve
                ? 'Marks all eligible alerts as resolved, updates linked compliance controls where satisfied, and appends signed entries to the SHA-256 hash-chained Vault.'
                : 'Marks all eligible alerts as dismissed and updates associated machine-identity baselines so similar activity triggers fewer false alarms. Every dismissal is logged in the Vault.'}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label="Close confirmation dialog"
            className="p-1.5 rounded-md text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-ink)] hover:bg-[var(--sentinel-hover)] disabled:opacity-50 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* High-severity safety warning when bulk-dismissing critical or high alerts */}
          {!isResolve && (summary.criticalCount > 0 || summary.highCount > 0) && (
            <div
              role="alert"
              data-testid="batch-dismiss-severity-warning"
              className="p-3.5 rounded-md alert-pop-critical flex items-start gap-2.5 text-xs"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[var(--sentinel-crit)]" />
              <div className="space-y-0.5">
                <p className="font-bold text-[var(--sentinel-crit-ink)]">
                  High-severity incidents included in dismissal
                </p>
                <p className="text-[var(--sentinel-crit-ink)] leading-relaxed">
                  Your selection includes{' '}
                  <span className="font-mono tabular-nums font-bold">
                    {summary.criticalCount > 0 ? `${summary.criticalCount} critical` : ''}
                    {summary.criticalCount > 0 && summary.highCount > 0 ? ' and ' : ''}
                    {summary.highCount > 0 ? `${summary.highCount} high` : ''}
                  </span>{' '}
                  severity alert{summary.criticalCount + summary.highCount === 1 ? '' : 's'}. Dismissing teaches the baseline to treat similar behavior as expected.
                </p>
              </div>
            </div>
          )}

          {/* Quantitative Summary Line */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--sentinel-ink-secondary)] pb-3 border-b border-[var(--sentinel-divider)]">
            <span>
              Eligible:{' '}
              <strong className="font-mono tabular-nums text-[var(--sentinel-ink)]">
                {eligibleCount}
              </strong>
            </span>
            {skippedCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Skipped (already {isResolve ? 'resolved' : 'dismissed'}):{' '}
                  <strong className="font-mono tabular-nums text-[var(--sentinel-ink)]">
                    {skippedCount}
                  </strong>
                </span>
              </>
            )}
            {summary.affectedActors.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Actors:{' '}
                  <strong className="font-mono text-[var(--sentinel-ink)]">
                    {summary.affectedActors.slice(0, 3).join(', ')}
                    {summary.affectedActors.length > 3
                      ? ` +${summary.affectedActors.length - 3} more`
                      : ''}
                  </strong>
                </span>
              </>
            )}
          </div>

          {/* Selected Alert Preview List */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-[var(--sentinel-ink)]">
              Alerts to be {isResolve ? 'resolved' : 'dismissed'}
            </p>
            <div
              data-testid="batch-confirm-alert-list"
              className="max-h-52 overflow-y-auto divide-y divide-[var(--sentinel-divider)] border border-[var(--sentinel-border)] rounded-md bg-[var(--sentinel-inset)]"
            >
              {summary.eligibleAlerts.map((alert) => (
                <div key={alert.id} className="px-3.5 py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--sentinel-ink)] truncate">
                      {alert.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--sentinel-ink-secondary)] font-mono tabular-nums truncate">
                      {alert.actorLabel} · {alert.sourceIp} · {alert.status}
                    </p>
                  </div>
                  <span className={`text-[11px] shrink-0 ${severityTextClass(alert.severity)}`}>
                    {severityLabel(alert.severity)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Shared Audit Note */}
          <div className="space-y-1.5">
            <label
              htmlFor="batch-audit-note-input"
              className="block text-xs font-semibold text-[var(--sentinel-ink)]"
            >
              Shared Audit Note (optional)
            </label>
            <input
              id="batch-audit-note-input"
              type="text"
              value={auditNote}
              disabled={busy}
              onChange={(e) => setAuditNote(e.target.value)}
              maxLength={500}
              data-testid="batch-confirm-note-input"
              placeholder={
                isResolve
                  ? 'e.g., Verified containment and rotated credentials during shift triage...'
                  : 'e.g., Expected quarterly audit job confirmed with Finance Ops...'
              }
              className="w-full px-3 py-2 text-xs surface-input rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--sentinel-accent)]"
            />
            <p className="text-[11px] text-[var(--sentinel-ink-muted)] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--sentinel-teal)] shrink-0" />
              <span>Recorded on every alert&apos;s SHA-256 hash-chained Vault entry.</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            data-testid="batch-confirm-cancel-btn"
            className="px-4 py-2 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] hover:bg-[var(--sentinel-hover)] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || eligibleCount === 0}
            onClick={() => void onConfirm(auditNote)}
            data-testid="batch-confirm-submit-btn"
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer ${
              isResolve
                ? 'bg-[var(--sentinel-teal)] hover:bg-[var(--sentinel-teal-hover)]'
                : 'bg-[var(--sentinel-accent)] hover:bg-[var(--sentinel-accent-hover)]'
            }`}
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isResolve ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <X className="w-3.5 h-3.5" />
            )}
            <span>
              {busy
                ? isResolve
                  ? 'Resolving...'
                  : 'Dismissing...'
                : isResolve
                  ? `Confirm Resolve (${eligibleCount})`
                  : `Confirm Dismiss (${eligibleCount})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
