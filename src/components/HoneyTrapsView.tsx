import { useState, type FormEvent } from 'react';
import { Ban, Crosshair, Plus, ShieldCheck, Unlock } from 'lucide-react';
import type { SystemSnapshot } from '../core/types';
import { formatRelativeTime } from '../lib/format';

interface HoneyTrapsViewProps {
  snapshot: SystemSnapshot;
  onTriggerTrap: (trapId: string, sourceIp?: string) => Promise<void>;
  onCreateTrap: (payload: {
    kind: 'honey_key' | 'honey_vendor';
    label: string;
    plantedLocation: string;
  }) => Promise<void>;
  onUnblockSession?: (sourceIp: string) => Promise<void>;
  busyAction: string | null;
}

export function HoneyTrapsView({
  snapshot,
  onTriggerTrap,
  onCreateTrap,
  onUnblockSession,
  busyAction,
}: HoneyTrapsViewProps) {
  const [kind, setKind] = useState<'honey_key' | 'honey_vendor'>('honey_key');
  const [label, setLabel] = useState('');
  const [plantedLocation, setPlantedLocation] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [lastTriggeredMsg, setLastTriggeredMsg] = useState<string | null>(null);

  const blockedSessions = snapshot.blockedSessions ?? [];

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !plantedLocation.trim()) {
      setFormError('Both stealth label and planted location are required.');
      return;
    }
    setFormError(null);
    try {
      await onCreateTrap({ kind, label: label.trim(), plantedLocation: plantedLocation.trim() });
      setLabel('');
      setPlantedLocation('');
      setLastTriggeredMsg(
        `Planted stealth ${kind === 'honey_key' ? 'honey API key' : 'honey vendor'}. It now appears disguised inside Harbor & Finch's live files in the Attacker Portal — touching it will immediately trap and block the intruder.`,
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to plant honey trap');
    }
  };

  return (
    <div className="space-y-6">
      <section className="window-suede rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="text-xl font-bold text-[var(--sentinel-ink)]">
              Stealth Honey Keys &amp; Honey Vendors
            </h1>
            <p className="mt-1 text-sm text-[var(--sentinel-ink-secondary)]">
              Realistic credentials and vendor records nothing legitimate touches. Planted traps blend invisibly into Harbor &amp; Finch&apos;s files — any intruder contact immediately traps, blocks, and fires real-time push alerts + signed webhooks.
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums text-[var(--sentinel-ink-secondary)] whitespace-nowrap">
            {snapshot.honeyTraps.length} traps ·{' '}
            <strong className="text-[var(--sentinel-crit)]">{snapshot.metrics.honeyTrapHits} hits</strong> ·{' '}
            <strong className="text-[var(--sentinel-crit)]">{blockedSessions.length} trapped IPs</strong>
          </div>
        </div>
      </section>

      {lastTriggeredMsg && (
        <div
          className="p-4 rounded-lg alert-pop-critical text-sm font-medium"
          data-testid="honey-trigger-confirmation"
        >
          {lastTriggeredMsg}
        </div>
      )}

      {/* Active Trapped & Quarantined Intruder Sessions */}
      <section className="window-nude rounded-lg p-5 space-y-3" data-testid="quarantined-sessions-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Ban className="w-4 h-4 text-[var(--sentinel-crit)]" />
            <h2 className="text-sm font-semibold text-[var(--sentinel-ink)]">
              Trapped &amp; Blocked Intruder Sessions (Auto-Quarantine)
            </h2>
          </div>
          <span className="text-xs font-mono tabular-nums text-[var(--sentinel-ink-muted)]">
            {blockedSessions.length} active quarantine(s)
          </span>
        </div>

        {blockedSessions.length === 0 ? (
          <div className="p-3.5 rounded-md surface-inset text-xs text-[var(--sentinel-ink-secondary)] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--sentinel-teal)] shrink-0" />
            <span>
              No intruders currently quarantined. When an attacker touches any planted honey key or vendor from the Attacker Portal, their session is locked here automatically.
            </span>
          </div>
        ) : (
          <div className="divide-y divide-[var(--sentinel-divider)] border-t border-[var(--sentinel-divider)]">
            {blockedSessions.map((session) => (
              <div
                key={session.sourceIp}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-[var(--sentinel-crit)] font-mono">
                    {session.sourceIp}{' '}
                    <span className="font-sans text-xs font-semibold text-[var(--sentinel-ink)]">
                      ({session.attackerAlias})
                    </span>
                  </p>
                  <p className="text-xs text-[var(--sentinel-ink-secondary)]">
                    {session.reason} · Trap:{' '}
                    <span className="font-mono font-semibold text-[var(--sentinel-ink)]">
                      {session.trapIdentifier}
                    </span>{' '}
                    · Vault #{session.vaultSequence} · {formatRelativeTime(session.blockedAt)}
                  </p>
                </div>
                {onUnblockSession && (
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void onUnblockSession(session.sourceIp)}
                    data-testid={`unblock-ip-${session.sourceIp}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--sentinel-ink)] bg-[var(--sentinel-suede)] border border-[var(--sentinel-border)] rounded-md hover:border-[var(--sentinel-teal)] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
                  >
                    <Unlock className="w-3.5 h-3.5 text-[var(--sentinel-teal)]" />
                    {busyAction === `unblock:${session.sourceIp}` ? 'Releasing...' : 'Release / Unblock IP'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section className="xl:col-span-8 window-nude rounded-lg overflow-hidden">
          <div className="p-4 border-b border-[var(--sentinel-divider)] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--sentinel-ink)]">Deployed Stealth Traps</h2>
            <span className="text-xs text-[var(--sentinel-ink-muted)]">
              Disguised as real assets in the Attacker Portal
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--sentinel-divider)] text-xs font-medium text-[var(--sentinel-ink-muted)] bg-[var(--sentinel-suede)]">
                  <th className="py-3 px-4">Stealth Artifact</th>
                  <th className="py-3 px-4">Type &amp; Location</th>
                  <th className="py-3 px-4 text-right">Hits</th>
                  <th className="py-3 px-4 text-right">Live Drill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sentinel-divider)] text-sm">
                {snapshot.honeyTraps.map((trap) => (
                  <tr key={trap.id} className="hover:bg-[var(--sentinel-suede)]/60 transition-colors">
                    <td className="py-3.5 px-4 align-top">
                      <p className="font-semibold text-[var(--sentinel-ink)]">{trap.label}</p>
                      <p className="mt-0.5 text-xs font-mono text-[var(--sentinel-ink-secondary)]">
                        {trap.identifier} · hash {trap.tokenHash}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 align-top">
                      <p className="text-xs font-medium text-[var(--sentinel-ink)]">
                        {trap.kind === 'honey_key' ? 'Stealth API Key' : 'Stealth Vendor Record'}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--sentinel-ink-secondary)]">
                        {trap.plantedLocation}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 text-right align-top font-mono tabular-nums">
                      <span
                        className={
                          trap.triggerCount > 0
                            ? 'text-[var(--sentinel-crit)] font-bold'
                            : 'text-[var(--sentinel-teal)] font-semibold'
                        }
                      >
                        {trap.triggerCount}
                      </span>
                      <p className="text-xs text-[var(--sentinel-ink-muted)]">
                        {trap.lastTriggeredAt ? formatRelativeTime(trap.lastTriggeredAt) : 'Armed'}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 text-right align-top">
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        aria-label={`Trigger trap ${trap.label}`}
                        onClick={async () => {
                          await onTriggerTrap(trap.id);
                          setLastTriggeredMsg(
                            `Triggered "${trap.label}" (${trap.identifier}). Critical alert pushed via WebSocket & signed Webhooks.`,
                          );
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#DC2626] rounded-md hover:bg-[#B91C1C] transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer"
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                        {busyAction === `trigger:${trap.id}` ? 'Firing...' : 'Trigger Trap'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="xl:col-span-4 window-suede rounded-lg p-5">
          <h2 className="text-sm font-semibold text-[var(--sentinel-ink)]">Plant New Stealth Trap</h2>
          <p className="mt-1 text-xs text-[var(--sentinel-ink-secondary)]">
            Automatically disguised as a normal Harbor &amp; Finch credential or vendor in the Attacker Portal. Only the salted HMAC hash is stored in Sentinel.
          </p>

          <form onSubmit={handleCreate} className="mt-4 space-y-4">
            <div>
              <label htmlFor="trap-kind" className="block text-xs font-medium text-[var(--sentinel-ink)]">
                Trap Type
              </label>
              <select
                id="trap-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as 'honey_key' | 'honey_vendor')}
                className="mt-1 w-full px-3 py-2 text-sm surface-input rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--sentinel-teal)]"
              >
                <option value="honey_key">Stealth API Key (ak_* — looks like real prod key)</option>
                <option value="honey_vendor">Stealth Vendor Record (VND-9****)</option>
              </select>
            </div>

            <div>
              <label htmlFor="trap-label" className="block text-xs font-medium text-[var(--sentinel-ink)]">
                Realistic Asset Name
              </label>
              <input
                id="trap-label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Finance S3 Archive Sync Key"
                className="mt-1 w-full px-3 py-2 text-sm surface-input rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--sentinel-teal)]"
              />
            </div>

            <div>
              <label htmlFor="trap-location" className="block text-xs font-medium text-[var(--sentinel-ink)]">
                Planted Location
              </label>
              <input
                id="trap-location"
                type="text"
                value={plantedLocation}
                onChange={(e) => setPlantedLocation(e.target.value)}
                placeholder="e.g. api_keys_prod.env / ERP Vendor Master"
                className="mt-1 w-full px-3 py-2 text-sm surface-input rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--sentinel-teal)]"
              />
            </div>

            {formError && <p className="text-xs font-semibold text-[var(--sentinel-crit)]">{formError}</p>}

            <button
              type="submit"
              disabled={busyAction !== null}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[var(--sentinel-teal)] rounded-md hover:bg-[var(--sentinel-teal-hover)] transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Plant Stealth Trap
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
