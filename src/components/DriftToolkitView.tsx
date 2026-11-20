import { useEffect, useState, type FormEvent } from 'react';
import { Clock, Download, FileWarning, Lock, ShieldCheck } from 'lucide-react';
import type { SystemSnapshot } from '../core/types';
import { sentinelApi } from '../lib/api';
import { formatCountdown, formatUtcTime } from '../lib/format';

interface DriftToolkitViewProps {
  snapshot: SystemSnapshot;
  onResolveHold: (holdId: string, decision: 'released_verified' | 'blocked_fraud') => Promise<void>;
  onScanTicket: (payload: { ticketId: string; ticketText: string }) => Promise<{
    ticketId: string;
    redactedText: string;
    findings: Array<{ kind: string; previewMasked: string; tokenHash: string }>;
  }>;
  busyAction: string | null;
}

const SAMPLE_LEAKY_TICKET =
  `Payroll sync failed for alice.chen@harborfinch.co.uk using ${['sk', 'live', 'payroll_9928172635abc'].join('_')} against IBAN GB29NWBK60161331926819.`;

export function DriftToolkitView({
  snapshot,
  onResolveHold,
  onScanTicket,
  busyAction,
}: DriftToolkitViewProps) {
  const [ticketId, setTicketId] = useState('HD-4812');
  const [ticketText, setTicketText] = useState(SAMPLE_LEAKY_TICKET);
  const [scanResult, setScanResult] = useState<{
    ticketId: string;
    redactedText: string;
    findings: Array<{ kind: string; previewMasked: string; tokenHash: string }>;
  } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [packDownloadStatus, setPackDownloadStatus] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleScan = async (e: FormEvent) => {
    e.preventDefault();
    if (!ticketText.trim()) {
      setScanError('Paste ticket or log text to scan at the edge.');
      return;
    }
    setScanError(null);
    try {
      const res = await onScanTicket({ ticketId: ticketId.trim() || 'HD-4812', ticketText });
      setScanResult(res);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed');
    }
  };

  const handleDownloadPack = async (caseId: string) => {
    setPackDownloadStatus('Generating hash-verified pack...');
    try {
      const pack = await sentinelApi.getEvidencePack(caseId);
      const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sentinel-legal-evidence-pack-${caseId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setPackDownloadStatus(
        `Downloaded PII-free Legal Evidence Pack (SHA-256 ${pack.packHash.slice(0, 16)}...)`,
      );
    } catch (err) {
      setPackDownloadStatus(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const { controlDrift } = snapshot;

  return (
    <div className="space-y-6">
      {/* Window 1 (Soft Suede): Paperwork vs Reality — Control Drift Score */}
      <section className="window-suede rounded-lg p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-5 border-b border-[var(--sentinel-divider)]">
          <div className="max-w-3xl">
            <h1 className="text-xl font-bold text-[var(--sentinel-ink)]">
              Paperwork vs Reality — Control Drift Score
            </h1>
            <p className="mt-1 text-sm text-[var(--sentinel-ink-secondary)]">
              Continuously compares written policy claims against live normalized telemetry to answer the Audit Committee chair directly.
            </p>
          </div>
          <div className="lg:text-right shrink-0">
            <p className="text-xs font-medium text-[var(--sentinel-ink-muted)]">Control Drift Score</p>
            <p
              className="mt-0.5 text-3xl font-bold font-mono tabular-nums text-[var(--sentinel-crit)]"
              data-testid="control-drift-score"
            >
              {controlDrift.driftScore} / 100
            </p>
            <p className="text-xs text-[var(--sentinel-ink-secondary)]">
              {controlDrift.violatedCount} violated · {controlDrift.driftingCount} drifting ·{' '}
              {controlDrift.alignedCount} aligned
            </p>
          </div>
        </div>

        <div className="p-4 rounded-md bg-[var(--sentinel-nude)] border border-[var(--sentinel-border)]">
          <p className="text-xs font-semibold text-[var(--sentinel-ink)]">Audit Committee Chair Summary</p>
          <p className="mt-1 text-sm text-[var(--sentinel-ink)] leading-relaxed">{controlDrift.auditChairAnswer}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--sentinel-divider)] text-xs font-medium text-[var(--sentinel-ink-muted)]">
                <th className="py-2.5 pr-4">Control</th>
                <th className="py-2.5 px-4">Paperwork Claim</th>
                <th className="py-2.5 px-4">Observed Reality</th>
                <th className="py-2.5 pl-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sentinel-divider)] text-sm">
              {controlDrift.assertions.map((item) => (
                <tr key={item.id} className="hover:bg-[var(--sentinel-inset)]/60">
                  <td className="py-3.5 pr-4 align-top whitespace-nowrap">
                    <p className="font-mono font-semibold text-[var(--sentinel-ink)]">{item.controlRef}</p>
                    <p className="text-xs text-[var(--sentinel-ink-muted)]">{item.framework}</p>
                  </td>
                  <td className="py-3.5 px-4 align-top text-[var(--sentinel-ink-secondary)]">{item.paperworkClaim}</td>
                  <td className="py-3.5 px-4 align-top text-[var(--sentinel-ink)]">{item.observedReality}</td>
                  <td className="py-3.5 pl-4 align-top text-right whitespace-nowrap">
                    <span
                      className={`text-xs font-semibold capitalize ${
                        item.status === 'violated'
                          ? 'text-[var(--sentinel-crit)]'
                          : item.status === 'drifting'
                            ? 'text-[var(--sentinel-high)]'
                            : 'text-[var(--sentinel-teal)]'
                      }`}
                    >
                      {item.status}
                    </span>
                    <p className="text-xs text-[var(--sentinel-ink-muted)]">{item.owner}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Window 2 (Soft Nude): Payment-Run Guard */}
      <section className="window-nude rounded-lg p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[var(--sentinel-ink)]">Payment-Run Guard</h2>
            <p className="text-xs text-[var(--sentinel-ink-secondary)]">
              Holds vendor bank-detail edits within 48 hours of payout dates. Raw IBANs stay masked at the edge.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-[var(--sentinel-ink-muted)]">
            {snapshot.metrics.activeHolds} active hold(s)
          </span>
        </div>

        <div className="divide-y divide-[var(--sentinel-divider)] border-t border-[var(--sentinel-divider)]">
          {snapshot.paymentHolds.map((hold) => (
            <div
              key={hold.id}
              className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono font-semibold text-[var(--sentinel-ink)]">{hold.vendorId}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-[var(--sentinel-ink)]">{hold.vendorName}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums font-bold text-[var(--sentinel-crit)]">
                    {hold.amountFormatted}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-[var(--sentinel-ink-secondary)]">
                    Payout {hold.payoutDate} ({hold.hoursUntilPayout}h)
                  </span>
                </div>
                <p className="text-xs font-mono text-[var(--sentinel-ink-secondary)]">
                  Old: {hold.maskedOldAccount} → New: {hold.maskedNewAccount} · IP {hold.sourceIp}
                </p>
                <p className="text-xs text-[var(--sentinel-ink-muted)]">
                  Status:{' '}
                  <strong
                    className={
                      hold.status === 'held_for_review'
                        ? 'text-[var(--sentinel-high)]'
                        : hold.status === 'blocked_fraud'
                          ? 'text-[var(--sentinel-crit)]'
                          : 'text-[var(--sentinel-teal)]'
                    }
                  >
                    {hold.status === 'held_for_review'
                      ? 'Held pending callback'
                      : hold.status === 'blocked_fraud'
                        ? 'Blocked (Fraud)'
                        : 'Verified & Released'}
                  </strong>
                  {hold.decidedBy ? ` · ${hold.decidedBy}` : ''}
                </p>
              </div>

              {hold.status === 'held_for_review' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void onResolveHold(hold.id, 'blocked_fraud')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#DC2626] rounded-md hover:bg-[#B91C1C] transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Block Fraud
                  </button>
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void onResolveHold(hold.id, 'released_verified')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--sentinel-teal-ink)] bg-[var(--sentinel-teal-soft)] border border-[var(--sentinel-teal)]/30 rounded-md whitespace-nowrap disabled:opacity-50 cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Verify &amp; Release
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Bottom Split: Secrets Scanner / Breach Clock */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section className="xl:col-span-7 window-suede rounded-lg p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--sentinel-ink)]">Secrets-in-Tickets Scanner</h2>
            <p className="mt-0.5 text-xs text-[var(--sentinel-ink-secondary)]">
              Detects API keys, JWTs, IBANs, SSNs, and emails pasted into helpdesk tickets and masks them at the customer edge.
            </p>
          </div>

          <form onSubmit={handleScan} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="sm:w-40">
                <label htmlFor="scan-ticket-id" className="block text-xs font-medium text-[var(--sentinel-ink)]">
                  Ticket ID
                </label>
                <input
                  id="scan-ticket-id"
                  type="text"
                  value={ticketId}
                  onChange={(e) => setTicketId(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm font-mono surface-input rounded-md"
                />
              </div>
              <div className="flex-1 flex items-end justify-end">
                <button
                  type="submit"
                  disabled={busyAction !== null}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--sentinel-teal)] rounded-md hover:bg-[var(--sentinel-teal-hover)] whitespace-nowrap disabled:opacity-50 cursor-pointer"
                >
                  <FileWarning className="w-4 h-4" />
                  {busyAction === 'scan' ? 'Scanning...' : 'Scan & Redact Ticket'}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="scan-ticket-body" className="block text-xs font-medium text-[var(--sentinel-ink)]">
                Raw Ticket Text (redacted at edge; raw values never stored)
              </label>
              <textarea
                id="scan-ticket-body"
                rows={3}
                value={ticketText}
                onChange={(e) => setTicketText(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm font-mono surface-input rounded-md"
              />
            </div>

            {scanError && <p className="text-xs font-semibold text-[var(--sentinel-crit)]">{scanError}</p>}
          </form>

          {scanResult && (
            <div
              className="p-4 rounded-md surface-inset space-y-2.5"
              data-testid="ticket-scan-result"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--sentinel-teal)]">
                  Edge Redaction Complete · {scanResult.findings.length} masked
                </span>
                <span className="font-mono text-[var(--sentinel-ink-muted)]">{scanResult.ticketId}</span>
              </div>
              <p className="text-xs font-mono text-[var(--sentinel-ink)] bg-[var(--sentinel-suede)] border border-[var(--sentinel-divider)] rounded p-3 break-words">
                {scanResult.redactedText}
              </p>
            </div>
          )}
        </section>

        <section className="xl:col-span-5 window-nude rounded-lg p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--sentinel-ink)]">
              Breach Clock &amp; Legal Evidence Pack
            </h2>
            <p className="mt-0.5 text-xs text-[var(--sentinel-ink-secondary)]">
              Statutory notification countdown with hash-verified, PII-free counsel export.
            </p>
          </div>

          {snapshot.breachClocks.map((bc) => (
            <div key={bc.id} className="space-y-3 pt-2 border-t border-[var(--sentinel-divider)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--sentinel-ink)]">{bc.title}</p>
                  <p className="text-xs text-[var(--sentinel-ink-secondary)]">{bc.regulator}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="inline-flex items-center gap-1.5 text-sm font-mono font-bold tabular-nums text-[var(--sentinel-crit)]">
                    <Clock className="w-4 h-4" />
                    {formatCountdown(bc.deadlineAt)}
                  </div>
                  <p className="text-xs text-[var(--sentinel-ink-muted)]">remaining</p>
                </div>
              </div>

              <div className="text-xs text-[var(--sentinel-ink-secondary)] space-y-1 font-mono tabular-nums">
                <p>Detected: {formatUtcTime(bc.detectedAt)}</p>
                <p>Deadline: {formatUtcTime(bc.deadlineAt)}</p>
              </div>

              <button
                type="button"
                onClick={() => void handleDownloadPack(bc.id)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--sentinel-ink)] surface-inset rounded-md hover:bg-[var(--sentinel-hover)] whitespace-nowrap cursor-pointer"
              >
                <Download className="w-4 h-4 text-[var(--sentinel-teal)]" />
                Download Legal Evidence Pack (JSON)
              </button>

              {packDownloadStatus && (
                <p className="text-xs text-[var(--sentinel-teal)] font-mono">{packDownloadStatus}</p>
              )}

              <p className="text-xs text-[var(--sentinel-ink-muted)] leading-relaxed">
                Confirm statutory clocks and data-residency assertions with legal counsel before external filing.
              </p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
