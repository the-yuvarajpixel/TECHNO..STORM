import { useState } from 'react';
import { Send } from 'lucide-react';
import type { MachineFingerprint, SystemSnapshot } from '../core/types';
import { FingerprintChart } from './FingerprintChart';
import { formatRelativeTime } from '../lib/format';

interface FingerprintsViewProps {
  snapshot: SystemSnapshot;
  selectedFpId: string | null;
  onSelectFp: (id: string) => void;
  onSimulateAnomaly: (fp: MachineFingerprint, mode: 'normal' | 'anomalous') => Promise<void>;
  onJumpToAlert: (alertId: string) => void;
  busyAction: string | null;
}

export function FingerprintsView({
  snapshot,
  selectedFpId,
  onSelectFp,
  onSimulateAnomaly,
  onJumpToAlert,
  busyAction,
}: FingerprintsViewProps) {
  const [testNotice, setTestNotice] = useState<string | null>(null);

  const activeFp =
    snapshot.fingerprints.find((f) => f.id === selectedFpId) ?? snapshot.fingerprints[0];

  const relatedAlert = snapshot.alerts.find(
    (a) => a.canonicalActorId === activeFp?.canonicalActorId && a.status === 'open',
  );

  const handleTest = async (mode: 'normal' | 'anomalous') => {
    if (!activeFp) return;
    setTestNotice(null);
    await onSimulateAnomaly(activeFp, mode);
    setTestNotice(
      mode === 'anomalous'
        ? `Sent out-of-hours spike for ${activeFp.keyAlias} through Edge Redaction -> Detection -> WebSocket Push.`
        : `Sent baseline call for ${activeFp.keyAlias}. Logged in SHA-256 Vault with zero false alert.`,
    );
  };

  return (
    <div className="space-y-6">
      <section className="window-suede rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="text-xl font-bold text-[var(--sentinel-ink)]">
              Machine-Identity Fingerprints (Statement A)
            </h1>
            <p className="mt-1 text-sm text-[var(--sentinel-ink-secondary)]">
              Learned behavioral baseline per API key (active UTC hours, known IPs, volume, endpoints) with explain-why alerts that adapt on Approve/Dismiss.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-[var(--sentinel-ink-muted)] whitespace-nowrap">
            {snapshot.fingerprints.length} monitored keys
          </span>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section className="xl:col-span-4 window-nude rounded-lg overflow-hidden">
          <div className="p-4 border-b border-[var(--sentinel-divider)]">
            <h2 className="text-sm font-semibold text-[var(--sentinel-ink)]">API Keys &amp; Integrations</h2>
          </div>
          <div className="divide-y divide-[var(--sentinel-divider)]">
            {snapshot.fingerprints.map((fp) => {
              const selected = fp.id === activeFp?.id;
              const openAlertCount = snapshot.alerts.filter(
                (a) => a.canonicalActorId === fp.canonicalActorId && a.status === 'open',
              ).length;
              return (
                <button
                  key={fp.id}
                  type="button"
                  onClick={() => onSelectFp(fp.id)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer ${
                    selected ? 'bg-[var(--sentinel-teal-soft)]' : 'hover:bg-[var(--sentinel-suede)]/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-mono font-semibold text-[var(--sentinel-ink)]">
                      {fp.keyAlias}
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        fp.status === 'suspended'
                          ? 'text-[var(--sentinel-crit)]'
                          : fp.status === 'scoped_restricted'
                            ? 'text-[var(--sentinel-high)]'
                            : 'text-[var(--sentinel-teal)]'
                      }`}
                    >
                      {fp.status === 'scoped_restricted'
                        ? 'Scoped'
                        : fp.status === 'suspended'
                          ? 'Suspended'
                          : 'Active'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--sentinel-ink-secondary)]">
                    {fp.system} · {fp.ownerTeam}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-[var(--sentinel-ink-muted)] font-mono tabular-nums">
                    <span>
                      {String(fp.allowedHoursUtc[0]).padStart(2, '0')}h–
                      {String(fp.allowedHoursUtc[1]).padStart(2, '0')}h UTC · {fp.knownIps.length} IPs
                    </span>
                    {openAlertCount > 0 ? (
                      <span className="text-[var(--sentinel-crit)] font-bold">{openAlertCount} open</span>
                    ) : (
                      <span>{formatRelativeTime(fp.lastSeenUtc)}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {activeFp && (
          <section className="xl:col-span-8 window-suede rounded-lg p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-[var(--sentinel-divider)]">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--sentinel-ink-secondary)]">
                  <span>{activeFp.system}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeFp.ownerTeam}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {activeFp.learnedDismissals} learned / {activeFp.confirmedAlerts} confirmed
                  </span>
                </div>
                <h2 className="mt-1 text-lg font-bold font-mono text-[var(--sentinel-ink)]">
                  {activeFp.keyAlias}
                </h2>
              </div>

              {relatedAlert && (
                <button
                  type="button"
                  onClick={() => onJumpToAlert(relatedAlert.id)}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-[#DC2626] rounded-md hover:bg-[#B91C1C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Inspect Open Alert &amp; Blast Radius
                </button>
              )}
            </div>

            <FingerprintChart fingerprint={activeFp} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[var(--sentinel-divider)] text-sm">
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-[var(--sentinel-ink-muted)]">Learned Source IPs</p>
                  <p className="mt-1 font-mono tabular-nums text-[var(--sentinel-ink)]">
                    {activeFp.knownIps.join(', ')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--sentinel-ink-muted)]">Typical Hourly Volume</p>
                  <p className="mt-1 font-mono tabular-nums text-[var(--sentinel-ink)]">
                    {activeFp.normalVolumeMean} ± {activeFp.normalVolumeStdDev} req/hr
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-[var(--sentinel-ink-muted)]">Typical Endpoints</p>
                  <p className="mt-1 font-mono text-xs text-[var(--sentinel-ink)]">
                    {activeFp.typicalEndpoints.join(' · ')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--sentinel-ink-muted)]">Blast-Radius Dependencies</p>
                  <p className="mt-1 text-[var(--sentinel-ink)]">
                    {activeFp.criticalDependencies.join(', ')}
                    {activeFp.paydaySensitive ? ' (Pay-day sensitive)' : ''}
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-5 border-t border-[var(--sentinel-divider)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--sentinel-ink)]">
                  Pipeline Test for {activeFp.keyAlias}
                </p>
                <p className="text-xs text-[var(--sentinel-ink-muted)]">
                  Verify normal vs out-of-hours detection live.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void handleTest('normal')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[var(--sentinel-ink)] surface-inset rounded-md hover:bg-[var(--sentinel-hover)] whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send Normal Call
                </button>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void handleTest('anomalous')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#DC2626] rounded-md hover:bg-[#B91C1C] whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send 03:00 Spike
                </button>
              </div>
            </div>

            {testNotice && (
              <p className="text-xs text-[var(--sentinel-teal-ink)] bg-[var(--sentinel-teal-soft)] rounded-md px-3.5 py-2.5">
                {testNotice}
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
