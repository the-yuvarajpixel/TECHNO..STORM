import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock,
  Download,
  FileSearch,
  Lock,
  ShieldCheck,
  Webhook,
} from 'lucide-react';
import type { SystemSnapshot } from '../core/types';
import type { UiCopy } from '../lib/i18n';
import { sentinelApi } from '../lib/api';
import { formatCountdown, formatRelativeTime, formatUtcTime, severityLabel, severityTextClass } from '../lib/format';

interface ExecutivePortalViewProps {
  snapshot: SystemSnapshot;
  copy: UiCopy;
  onResolveHold: (holdId: string, decision: 'released_verified' | 'blocked_fraud') => Promise<void>;
  onResolveAlert: (alertId: string) => Promise<void>;
  onInspectLogSpot: (vaultSequence: number, alertId: string) => void;
  onSwitchToSecOps: (alertId?: string) => void;
  busyAction: string | null;
}

export function ExecutivePortalView({
  snapshot,
  copy,
  onResolveHold,
  onResolveAlert,
  onInspectLogSpot,
  onSwitchToSecOps,
  busyAction,
}: ExecutivePortalViewProps) {
  const [packStatus, setPackStatus] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const urgentAlerts = snapshot.alerts.filter(
    (a) =>
      (a.origin === 'manual_attacker' && a.status !== 'resolved') ||
      (a.status === 'open' && (a.severity === 'critical' || a.severity === 'high')),
  );
  const pendingHolds = snapshot.paymentHolds.filter((h) => h.status === 'held_for_review');
  const latestWebhookDelivery = snapshot.webhookDeliveries[0] ?? null;

  const handleExportEvidencePack = async (caseId: string) => {
    setPackStatus('Preparing hash-verified counsel bundle...');
    try {
      const pack = await sentinelApi.getEvidencePack(caseId);
      const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `harbor-finch-executive-evidence-pack-${caseId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setPackStatus(`Exported PII-free Evidence Pack · SHA-256 ${pack.packHash.slice(0, 16)}…`);
    } catch (err) {
      setPackStatus(err instanceof Error ? err.message : 'Export failed');
    }
  };

  return (
    <div className="space-y-6" data-testid="executive-portal-view">
      {/* Window 1 (Soft Suede): Board & Audit Committee Chair Brief */}
      <section className="window-suede rounded-lg p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold text-[var(--sentinel-teal)]">
              Executive, Audit Committee &amp; Legal Brief · {snapshot.controlPlane.tenantName}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--sentinel-ink)]">
              {copy.execTitle}
            </h1>
            <p className="mt-1.5 text-sm text-[var(--sentinel-ink-secondary)] leading-relaxed">
              {snapshot.controlDrift.auditChairAnswer}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSwitchToSecOps()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[var(--sentinel-ink)] bg-[var(--sentinel-nude)] border border-[var(--sentinel-border)] rounded-md hover:bg-[var(--sentinel-hover)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Open Alerts &amp; Response
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="pt-5 border-t border-[var(--sentinel-divider)] grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <p className="text-xs font-medium text-[var(--sentinel-ink-muted)]">{copy.metricControlDrift}</p>
            <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-[var(--sentinel-crit)]">
              {snapshot.controlDrift.driftScore}/100
            </p>
            <p className="text-xs text-[var(--sentinel-ink-secondary)]">
              {snapshot.controlDrift.violatedCount} violated · {snapshot.controlDrift.driftingCount} drifting
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-[var(--sentinel-ink-muted)]">Active Escalations</p>
            <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-[var(--sentinel-crit)]">
              {urgentAlerts.length}
            </p>
            <p className="text-xs text-[var(--sentinel-ink-secondary)]">Live WebSocket sync</p>
          </div>

          <div>
            <p className="text-xs font-medium text-[var(--sentinel-ink-muted)]">Customer PII in Sentinel</p>
            <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-[var(--sentinel-teal)]">
              0 records
            </p>
            <p className="text-xs text-[var(--sentinel-ink-secondary)]">
              {snapshot.metrics.secretsMaskedAtEdge.toLocaleString()} masked at edge
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-[var(--sentinel-ink-muted)]">Vault &amp; BYOK Integrity</p>
            <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-[var(--sentinel-teal)]">
              {snapshot.vaultVerification.valid ? 'Verified' : 'Check Vault'}
            </p>
            <p className="text-xs font-mono text-[var(--sentinel-ink-secondary)]">
              {snapshot.controlPlane.region} · {snapshot.controlPlane.customerKeyFingerprint}
            </p>
          </div>
        </div>
      </section>

      {/* Window 2 (Soft Nude): Priority Incidents & Live Attacker Escalations */}
      <section className="window-nude rounded-lg p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold text-[var(--sentinel-ink)]">
              {copy.execEscalations}
            </h2>
            {latestWebhookDelivery && (
              <p className="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--sentinel-teal)]">
                <Webhook className="w-3.5 h-3.5 shrink-0" />
                Last Signed Webhook: {latestWebhookDelivery.webhookName} ·{' '}
                <strong>
                  {latestWebhookDelivery.status.toUpperCase()} (HTTP{' '}
                  {latestWebhookDelivery.statusCode ?? 'ERR'})
                </strong>{' '}
                · {formatRelativeTime(latestWebhookDelivery.timestamp)}
              </p>
            )}
          </div>
          <span className="text-xs font-mono tabular-nums font-bold text-[var(--sentinel-crit)]">
            {urgentAlerts.length} active · {(snapshot.blockedSessions ?? []).length} trapped IP(s)
          </span>
        </div>

        {urgentAlerts.length === 0 ? (
          <div className="p-5 rounded-md bg-[var(--sentinel-teal-soft)] border border-[var(--sentinel-teal)]/30 text-sm text-[var(--sentinel-teal-ink)] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <span>No uncontained Critical or High alerts active right now.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {urgentAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-lg p-4 space-y-2.5 ${
                  alert.severity === 'critical' ? 'alert-pop-critical' : 'alert-pop-high'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className={`inline-flex items-center gap-1.5 ${severityTextClass(alert.severity)}`}>
                    {alert.trappedAndBlocked ? (
                      <Ban className="w-3.5 h-3.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    )}
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
                <p className="text-sm font-bold text-[var(--sentinel-ink)]">{alert.title}</p>
                <p className="text-xs text-[var(--sentinel-ink-secondary)] leading-relaxed">
                  {alert.summary}
                </p>
                {alert.origin === 'manual_attacker' && (
                  <p className="text-[11px] font-mono text-[var(--sentinel-ink)] bg-[var(--sentinel-suede)]/80 border border-[var(--sentinel-border)] rounded px-2.5 py-1.5">
                    Intruder: <strong>{alert.attackerAlias ?? 'remote-phone-shell'}</strong> ({alert.sourceIp}) →{' '}
                    <strong>{alert.attackTarget ?? alert.actorLabel}</strong> · Action:{' '}
                    <strong>{alert.attackAction ?? alert.category}</strong>
                  </p>
                )}
                <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => onInspectLogSpot(alert.sourceVaultSequence, alert.id)}
                    className="inline-flex items-center gap-1 font-semibold text-[var(--sentinel-ink)] hover:underline cursor-pointer"
                  >
                    <FileSearch className="w-3.5 h-3.5 text-[var(--sentinel-teal)]" />
                    {copy.inspectLogSpot} (#{alert.sourceVaultSequence})
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => void onResolveAlert(alert.id)}
                      className="inline-flex items-center gap-1 font-semibold text-[var(--sentinel-teal)] hover:underline cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {copy.resolveBtn}
                    </button>
                    <button
                      type="button"
                      onClick={() => onSwitchToSecOps(alert.id)}
                      className="font-semibold text-[var(--sentinel-teal)] hover:underline cursor-pointer"
                    >
                      Inspect Alert →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Bottom Row: CFO Payment Sign-Off / General Counsel Breach Clock */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section className="xl:col-span-7 window-suede rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[var(--sentinel-ink)]">
                {copy.execPaymentTitle}
              </h2>
              <p className="text-xs text-[var(--sentinel-ink-secondary)]">
                Approve verified vendor bank changes or block fraudulent edits before BACS payout.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums font-semibold text-[var(--sentinel-high)]">
              {pendingHolds.length} pending
            </span>
          </div>

          <div className="divide-y divide-[var(--sentinel-divider)] border-t border-[var(--sentinel-divider)]">
            {snapshot.paymentHolds.map((hold) => (
              <div key={hold.id} className="py-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--sentinel-ink)]">
                      {hold.vendorName}{' '}
                      <span className="font-mono text-xs text-[var(--sentinel-ink-secondary)]">
                        ({hold.vendorId})
                      </span>
                    </p>
                    <p className="text-xs text-[var(--sentinel-ink-secondary)] font-mono tabular-nums">
                      {hold.amountFormatted} · Payout {hold.payoutDate} ({hold.hoursUntilPayout}h) ·{' '}
                      {hold.maskedNewAccount}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold ${
                      hold.status === 'held_for_review'
                        ? 'text-[var(--sentinel-high)]'
                        : hold.status === 'blocked_fraud'
                          ? 'text-[var(--sentinel-crit)]'
                          : 'text-[var(--sentinel-teal)]'
                    }`}
                  >
                    {hold.status === 'held_for_review'
                      ? 'Held Pending Sign-Off'
                      : hold.status === 'blocked_fraud'
                        ? 'Blocked (Fraud)'
                        : 'Verified & Released'}
                  </span>
                </div>

                {hold.status === 'held_for_review' && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => void onResolveHold(hold.id, 'blocked_fraud')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#DC2626] rounded-md hover:bg-[#B91C1C] transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Block Fraudulent Change
                    </button>
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => void onResolveHold(hold.id, 'released_verified')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-[var(--sentinel-teal-ink)] bg-[var(--sentinel-teal-soft)] border border-[var(--sentinel-teal)]/40 rounded-md transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Confirm Callback &amp; Release
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* General Counsel Breach Clock */}
        <section className="xl:col-span-5 window-nude rounded-lg p-6 space-y-4">
          <h2 className="text-base font-semibold text-[var(--sentinel-ink)]">
            {copy.execLegalTitle}
          </h2>

          {snapshot.breachClocks.map((bc) => (
            <div key={bc.id} className="pt-3 border-t border-[var(--sentinel-divider)] space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--sentinel-ink)]">{bc.title}</p>
                  <p className="text-xs text-[var(--sentinel-ink-secondary)]">{bc.regulator}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="inline-flex items-center gap-1 text-sm font-mono font-bold tabular-nums text-[var(--sentinel-crit)]">
                    <Clock className="w-4 h-4" />
                    {formatCountdown(bc.deadlineAt)}
                  </p>
                  <p className="text-xs text-[var(--sentinel-ink-muted)]">until 72h cutoff</p>
                </div>
              </div>

              <div className="text-xs font-mono tabular-nums text-[var(--sentinel-ink-secondary)] space-y-1">
                <p>Detected: {formatUtcTime(bc.detectedAt)}</p>
                <p>Vault head: {snapshot.vaultVerification.headHash.slice(0, 22)}…</p>
              </div>

              <button
                type="button"
                onClick={() => void handleExportEvidencePack(bc.id)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[var(--sentinel-teal)] rounded-md hover:bg-[var(--sentinel-teal-hover)] transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Export Counsel Evidence Pack (JSON)
              </button>

              {packStatus && (
                <p className="text-xs font-mono text-[var(--sentinel-teal)]">{packStatus}</p>
              )}

              <p className="text-xs text-[var(--sentinel-ink-muted)] leading-relaxed">
                Verify data-residency boundaries and statutory filing obligations with legal counsel before submission.
              </p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
