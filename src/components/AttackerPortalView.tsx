import { useMemo, useState } from 'react';
import {
  FileText,
  KeyRound,
  Terminal,
  ShieldAlert,
  Activity,
  Download,
  Building2,
  ArrowLeft,
  Send,
  Ban,
  ShieldOff,
} from 'lucide-react';
import type { DemoCompanyFile, SystemSnapshot } from '../core/types';
import { formatRelativeTime, formatUtcTime } from '../lib/format';

interface AttackerPortalViewProps {
  snapshot: SystemSnapshot;
  wsStatus: 'connecting' | 'connected' | 'reconnecting';
  onExecuteAction: (payload: {
    actionType:
      | 'mutate_api_key'
      | 'create_anomaly'
      | 'access_file'
      | 'touch_honey_trap'
      | 'alter_vendor_bank'
      | 'inject_ticket_secret';
    attackerAlias?: string;
    sourceIp?: string;
    targetKeyAlias?: string;
    mutationLabel?: string;
    hourUtc?: number;
    volumeCount?: number;
    endpoint?: string;
    fileId?: string;
    trapId?: string;
    vendorId?: string;
    customPayload?: string;
  }) => Promise<{
    terminalOutput: string;
    vaultSequence: number;
    alertId: string | null;
    trapped?: boolean;
    blocked?: boolean;
  }>;
  onExitToAdmin: () => void;
  busyAction: string | null;
}

const EXIT_NODES = [
  { ip: '185.220.101.88', label: '185.220.101.88 (Tor Exit · Frankfurt)' },
  { ip: '91.198.174.205', label: '91.198.174.205 (External VPN · Amsterdam)' },
  { ip: '45.155.205.41', label: '45.155.205.41 (Unregistered VPS · Tallinn)' },
];

const KEY_MUTATIONS = [
  { id: 'scope_escalation:payroll:write_all', label: 'Grant payroll:write_all scope' },
  { id: 'cidr_allowlist:bypass_office_ip', label: 'Bypass office IP allow-list' },
  { id: 'secret_rotate:export_raw_token', label: 'Rotate & export bearer token' },
];

function toEnvVarName(label: string, fallbackIdx: number): string {
  const cleaned = label
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/HONEY|DECOY|TRAP|BAIT|FAKE/g, '')
    .replace(/_+/g, '_')
    .slice(0, 22);
  return cleaned.length >= 3 ? `${cleaned}_KEY` : `SERVICE_OPS_${fallbackIdx + 1}_KEY`;
}

function sanitizeDisplayLabel(label: string): string {
  return (
    label
      .replace(/\b(honey|decoy|trap|bait|fake)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim() || 'Production Service Key'
  );
}

export function AttackerPortalView({
  snapshot,
  wsStatus,
  onExecuteAction,
  onExitToAdmin,
  busyAction,
}: AttackerPortalViewProps) {
  const [tab, setTab] = useState<'files' | 'manual' | 'logs'>('files');
  const [attackerAlias, setAttackerAlias] = useState('phone-intruder-01');
  const [sourceIp, setSourceIp] = useState(EXIT_NODES[0].ip);
  const [selectedFileId, setSelectedFileId] = useState<string>(
    snapshot.demoFiles[0]?.id ?? 'file_env',
  );

  // Manual Key Mutation / Anomaly controls
  const [targetKeyAlias, setTargetKeyAlias] = useState(
    snapshot.fingerprints[0]?.keyAlias ?? 'ak_payroll_prod',
  );
  const [mutationLabel, setMutationLabel] = useState(KEY_MUTATIONS[0].id);
  const [anomalyHourUtc, setAnomalyHourUtc] = useState(3);
  const [anomalyVolume, setAnomalyVolume] = useState(145);
  const [anomalyEndpoint, setAnomalyEndpoint] = useState('/v2/payroll/export-bank-details');

  const [terminalLines, setTerminalLines] = useState<
    Array<{ ts: string; cmd: string; output: string; blocked: boolean }>
  >([
    {
      ts: new Date().toISOString(),
      cmd: 'ssh compromised-svc@hf-jumpbox-01.internal',
      output:
        'Session established inside Harbor & Finch LLP staging subnet. File shares and API gateway reachable.',
      blocked: false,
    },
  ]);

  // Seamlessly blend real machine keys + planted honey keys with ZERO giveaway hints
  const discoveredApiKeys = useMemo(() => {
    const realKeys = snapshot.fingerprints.map((fp) => ({
      alias: fp.keyAlias,
      system: fp.system,
      envVar: `${fp.keyAlias.replace(/^ak_/, '').toUpperCase()}_TOKEN`,
      status: fp.status,
    }));
    const stealthKeys = snapshot.honeyTraps
      .filter((t) => t.kind === 'honey_key')
      .map((t, idx) => ({
        alias: t.identifier,
        system: sanitizeDisplayLabel(t.label),
        envVar: toEnvVarName(t.label, idx),
        status: 'active',
      }));
    return [...realKeys, ...stealthKeys];
  }, [snapshot.fingerprints, snapshot.honeyTraps]);

  // Seamlessly blend real ERP vendors + planted honey vendors with ZERO giveaway hints
  const discoveredVendors = useMemo(() => {
    const realVendors = [
      { id: 'VND-44109', name: 'Northstar Legal Print Ltd', payout: '£84,200.00', status: 'scheduled' },
      { id: 'VND-31002', name: 'Thames Discovery Hosting', payout: '£29,450.00', status: 'scheduled' },
    ];
    const stealthVendors = snapshot.honeyTraps
      .filter((t) => t.kind === 'honey_vendor')
      .map((t) => ({
        id: t.identifier,
        name: sanitizeDisplayLabel(t.label),
        payout: '£41,800.00',
        status: 'scheduled',
      }));
    return [...realVendors, ...stealthVendors];
  }, [snapshot.honeyTraps]);

  const activeBlock = useMemo(
    () => (snapshot.blockedSessions ?? []).find((b) => b.sourceIp === sourceIp) ?? null,
    [snapshot.blockedSessions, sourceIp],
  );

  const activeFile: DemoCompanyFile | null =
    snapshot.demoFiles.find((f) => f.id === selectedFileId) ?? snapshot.demoFiles[0] ?? null;

  // Dynamically enrich api_keys_prod.env and vendor_master_registry.json with newly planted assets
  const renderedFilePreview = useMemo(() => {
    if (!activeFile) return '';
    if (activeFile.id === 'file_env') {
      const lines = [
        '# Harbor & Finch LLP — Staging / Production Service Credentials',
        ...discoveredApiKeys.map((k) => `${k.envVar}=${k.alias}  # ${k.system}`),
        'WEBHOOK_SIGNING_MODE=HMAC-SHA256',
      ];
      return lines.join('\n');
    }
    if (activeFile.id === 'file_vendors') {
      return JSON.stringify(
        {
          registry: 'Harbor & Finch Accounts Payable Master',
          payout_cycle: 'BACS-WEEKLY',
          vendors: discoveredVendors.map((v) => ({
            id: v.id,
            name: v.name,
            next_payout: v.payout,
            status: v.status,
          })),
        },
        null,
        2,
      );
    }
    return activeFile.previewLines.join('\n');
  }, [activeFile, discoveredApiKeys, discoveredVendors]);

  const runCommand = async (
    cmdDisplay: string,
    payload: Parameters<AttackerPortalViewProps['onExecuteAction']>[0],
  ) => {
    const res = await onExecuteAction({
      ...payload,
      attackerAlias,
      sourceIp,
    });
    setTerminalLines((prev) => [
      {
        ts: new Date().toISOString(),
        cmd: cmdDisplay,
        output: res.terminalOutput,
        blocked:
          Boolean(res.trapped) ||
          Boolean(res.blocked) ||
          res.terminalOutput.includes('403') ||
          res.terminalOutput.includes('423'),
      },
      ...prev.slice(0, 14),
    ]);
  };

  return (
    <div
      className="min-h-screen bg-[#120E0C] text-[#F5ECE4] flex flex-col"
      data-testid="attacker-portal-view"
    >
      {/* Mobile-First Intruder Top Bar */}
      <header className="sticky top-0 z-30 bg-[#1B1411] border-b border-[#3D2E27] px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#F87171] shrink-0" />
              <span className="text-sm font-bold tracking-tight text-white truncate">
                Harbor &amp; Finch — Remote Intruder Shell
              </span>
            </div>
            <p className="text-[11px] font-mono text-[#B7A190] truncate">
              Demo Attacker Mode · Target: Harbor &amp; Finch LLP · Link:{' '}
              <span className={wsStatus === 'connected' ? 'text-[#6EE7C7]' : 'text-[#FBBF24]'}>
                {wsStatus}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={onExitToAdmin}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#F5ECE4] bg-[#2C211C] border border-[#544137] rounded-md hover:bg-[#3A2B24] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Admin Portal
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 space-y-4">
        {/* Session Identity & Exit Node Bar */}
        <section className="bg-[#1D1512] border border-[#3D2E27] rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-[#FECACA]">
              Manual Red-Team Controls — Every action streams live to Sentinel Admin Portal
            </span>
            <span className="font-mono text-[#A99586]">
              {snapshot.connectedRoles.secops + snapshot.connectedRoles.executive} defender(s) watching
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="atk-alias" className="block text-[11px] font-medium text-[#CBB8A8]">
                Operator Handle
              </label>
              <input
                id="atk-alias"
                type="text"
                value={attackerAlias}
                onChange={(e) => setAttackerAlias(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-xs font-mono bg-[#120E0C] border border-[#4A3930] rounded-md text-[#F5ECE4] focus:outline-none focus:ring-2 focus:ring-[#EF4444]"
              />
            </div>
            <div>
              <label htmlFor="atk-ip" className="block text-[11px] font-medium text-[#CBB8A8]">
                Source IP / Exit Node
              </label>
              <select
                id="atk-ip"
                value={sourceIp}
                onChange={(e) => setSourceIp(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-xs font-mono bg-[#120E0C] border border-[#4A3930] rounded-md text-[#F5ECE4] focus:outline-none focus:ring-2 focus:ring-[#EF4444]"
              >
                {EXIT_NODES.map((node) => {
                  const isNodeBlocked = (snapshot.blockedSessions ?? []).some(
                    (b) => b.sourceIp === node.ip,
                  );
                  return (
                    <option key={node.ip} value={node.ip}>
                      {isNodeBlocked ? `[BLOCKED] ${node.label}` : node.label}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </section>

        {/* TRAPPED & BLOCKED QUARANTINE LOCKDOWN BANNER */}
        {activeBlock && (
          <section
            data-testid="attacker-trapped-banner"
            className="bg-[#340E0E] border-2 border-[#EF4444] rounded-lg p-5 space-y-3 shadow-lg"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-[#DC2626] text-white shrink-0">
                <Ban className="w-5 h-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-mono font-bold tracking-wide text-[#FCA5A5]">
                  HTTP 403 CONNECTION TERMINATED · SENTINEL AUTO-CONTAINMENT
                </p>
                <h2 className="text-base font-bold text-white">
                  SESSION TRAPPED &amp; BLOCKED ({activeBlock.sourceIp})
                </h2>
                <p className="text-xs text-[#FECACA] leading-relaxed">
                  You touched a monitored Sentinel trap asset (<span className="font-mono font-semibold">{activeBlock.trapIdentifier}</span>).
                  Your shell session from <span className="font-mono font-semibold">{activeBlock.sourceIp}</span> has been
                  immediately quarantined and hard-blocked at the edge (Vault #{activeBlock.vaultSequence}).
                  Real-time push alerts and signed webhooks have been dispatched to SecOps &amp; Executive teams.
                </p>
                <p className="text-[11px] font-mono text-[#FCA5A5] pt-1">
                  Quarantined {formatRelativeTime(activeBlock.blockedAt)} · Ask an Admin in Honey Traps to release this IP, or switch exit nodes above to test another route.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 3 Touch-Friendly Mode Tabs */}
        <div
          className="grid grid-cols-3 gap-1 p-1 bg-[#1D1512] border border-[#3D2E27] rounded-lg"
          role="tablist"
          aria-label="Attacker console sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'files'}
            onClick={() => setTab('files')}
            className={`py-2.5 px-2 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              tab === 'files'
                ? 'bg-[#DC2626] text-white'
                : 'text-[#CBB8A8] hover:text-white hover:bg-[#2B211C]'
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span>Company Files</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'manual'}
            onClick={() => setTab('manual')}
            className={`py-2.5 px-2 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              tab === 'manual'
                ? 'bg-[#DC2626] text-white'
                : 'text-[#CBB8A8] hover:text-white hover:bg-[#2B211C]'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
            <span>Tamper &amp; Anomaly</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'logs'}
            onClick={() => setTab('logs')}
            className={`py-2.5 px-2 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              tab === 'logs'
                ? 'bg-[#DC2626] text-white'
                : 'text-[#CBB8A8] hover:text-white hover:bg-[#2B211C]'
            }`}
          >
            <Activity className="w-3.5 h-3.5 shrink-0" />
            <span>Live Logs ({snapshot.recentEvents.length})</span>
          </button>
        </div>

        {/* TAB 1: HARBOR & FINCH COMPANY FILES */}
        {tab === 'files' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
            <section className="md:col-span-5 bg-[#1D1512] border border-[#3D2E27] rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-[#3D2E27] flex items-center justify-between">
                <span className="text-xs font-semibold text-white">
                  /srv/harbor-finch/ (Exposed Share)
                </span>
                <span className="text-[11px] font-mono text-[#A99586]">
                  {snapshot.demoFiles.length} files
                </span>
              </div>
              <div className="divide-y divide-[#30241E]">
                {snapshot.demoFiles.map((file) => {
                  const selected = file.id === activeFile?.id;
                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => setSelectedFileId(file.id)}
                      className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                        selected ? 'bg-[#3A1515] border-r-2 border-[#EF4444]' : 'hover:bg-[#271D18]'
                      }`}
                    >
                      <p className="text-xs font-mono font-semibold text-white truncate">
                        {file.name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#B7A190] font-mono">
                        {file.sizeLabel} · {file.sensitivity}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            {activeFile && (
              <section className="md:col-span-7 bg-[#1D1512] border border-[#3D2E27] rounded-lg p-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-[#3D2E27]">
                  <div>
                    <p className="text-xs font-mono text-[#F87171]">{activeFile.path}</p>
                    <h2 className="text-sm font-bold text-white mt-0.5">{activeFile.name}</h2>
                  </div>
                  <span className="text-[11px] font-mono text-[#A99586]">
                    {activeFile.sizeLabel}
                  </span>
                </div>

                <pre
                  data-testid="attacker-file-preview"
                  className="p-3 rounded-md bg-[#110D0B] border border-[#3D2E27] text-xs font-mono text-[#E7D5C7] overflow-x-auto leading-relaxed"
                >
                  {renderedFilePreview}
                </pre>

                <div className="space-y-2.5">
                  {activeFile.id === 'file_env' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {discoveredApiKeys.map((keyItem) => (
                        <button
                          key={keyItem.alias}
                          type="button"
                          disabled={busyAction !== null || Boolean(activeBlock)}
                          onClick={() =>
                            void runCommand(
                              `curl -X PATCH /v2/iam/keys/${keyItem.alias}/scopes --ip ${sourceIp}`,
                              {
                                actionType: 'mutate_api_key',
                                targetKeyAlias: keyItem.alias,
                                mutationLabel: 'scope_escalation:write_all',
                                hourUtc: 3,
                                volumeCount: 168,
                              },
                            )
                          }
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-white bg-[#DC2626] rounded-md hover:bg-[#B91C1C] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer truncate"
                        >
                          <KeyRound className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Use / Modify {keyItem.alias}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {activeFile.id === 'file_payroll' && (
                    <button
                      type="button"
                      disabled={busyAction !== null || Boolean(activeBlock)}
                      onClick={() =>
                        void runCommand(
                          `scp hf-jumpbox-01:${activeFile.path} ./exfil_payroll.csv`,
                          {
                            actionType: 'access_file',
                            targetKeyAlias: 'ak_payroll_prod',
                            fileId: activeFile.id,
                            hourUtc: 3,
                            volumeCount: 215,
                          },
                        )
                      }
                      className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#DC2626] rounded-md hover:bg-[#B91C1C] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Exfiltrate payroll_disbursement_nov.csv (412 Staff Records)
                    </button>
                  )}

                  {activeFile.id === 'file_vendors' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {discoveredVendors.map((vendor) => (
                        <button
                          key={vendor.id}
                          type="button"
                          disabled={busyAction !== null || Boolean(activeBlock)}
                          onClick={() =>
                            void runCommand(
                              `curl -X PUT /v1/vendors/${vendor.id}/bank-account -d '{"iban":"GB94BARC..."}'`,
                              {
                                actionType: 'alter_vendor_bank',
                                vendorId: vendor.id,
                              },
                            )
                          }
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-white bg-[#DC2626] rounded-md hover:bg-[#B91C1C] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer truncate"
                        >
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Edit Bank ({vendor.id})</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {activeFile.id === 'file_tickets' && (
                    <button
                      type="button"
                      disabled={busyAction !== null || Boolean(activeBlock)}
                      onClick={() =>
                        void runCommand(
                          `curl -X POST /api/helpdesk/tickets -d '{"body":"token sk_live_exfil_..."}'`,
                          {
                            actionType: 'inject_ticket_secret',
                          },
                        )
                      }
                      className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#DC2626] rounded-md hover:bg-[#B91C1C] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Plant Leaked API Key in Support Ticket
                    </button>
                  )}

                  {activeBlock && (
                    <p className="text-[11px] font-mono text-[#FCA5A5] flex items-center gap-1.5 pt-1">
                      <ShieldOff className="w-3.5 h-3.5 shrink-0" />
                      Commands disabled while {activeBlock.sourceIp} is quarantined by Sentinel.
                    </p>
                  )}
                </div>
              </section>
            )}
          </div>
        )}

        {/* TAB 2: MANUAL KEY TAMPER & CUSTOM SMALL ANOMALY */}
        {tab === 'manual' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Modify an API Key */}
            <section className="bg-[#1D1512] border border-[#3D2E27] rounded-lg p-4 space-y-3.5">
              <div>
                <h2 className="text-sm font-bold text-white">1. Modify / Tamper API Key</h2>
                <p className="text-xs text-[#B7A190] mt-0.5">
                  Change scopes or bypass IP controls on any discovered Harbor &amp; Finch credential.
                </p>
              </div>

              <div>
                <label htmlFor="atk-key" className="block text-[11px] font-medium text-[#CBB8A8]">
                  Target API Key
                </label>
                <select
                  id="atk-key"
                  value={targetKeyAlias}
                  onChange={(e) => setTargetKeyAlias(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-xs font-mono bg-[#120E0C] border border-[#4A3930] rounded-md text-white"
                >
                  {discoveredApiKeys.map((k) => (
                    <option key={k.alias} value={k.alias}>
                      {k.alias} ({k.system}) — {k.status}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="atk-mut" className="block text-[11px] font-medium text-[#CBB8A8]">
                  API Key Change
                </label>
                <select
                  id="atk-mut"
                  value={mutationLabel}
                  onChange={(e) => setMutationLabel(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-xs font-mono bg-[#120E0C] border border-[#4A3930] rounded-md text-white"
                >
                  {KEY_MUTATIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                disabled={busyAction !== null || Boolean(activeBlock)}
                data-testid="attacker-mutate-key-btn"
                onClick={() =>
                  void runCommand(
                    `PATCH /v2/iam/keys/${targetKeyAlias}/scopes (${mutationLabel}) from ${sourceIp}`,
                    {
                      actionType: 'mutate_api_key',
                      targetKeyAlias,
                      mutationLabel,
                      hourUtc: 3,
                      volumeCount: 155,
                    },
                  )
                }
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#DC2626] rounded-md hover:bg-[#B91C1C] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                {activeBlock ? 'Session Quarantined (Blocked)' : 'Execute API Key Change Now'}
              </button>
            </section>

            {/* Create Custom Small Anomaly */}
            <section className="bg-[#1D1512] border border-[#3D2E27] rounded-lg p-4 space-y-3.5">
              <div>
                <h2 className="text-sm font-bold text-white">2. Inject Custom Anomaly</h2>
                <p className="text-xs text-[#B7A190] mt-0.5">
                  Trigger an off-hours spike or unusual endpoint call and watch Sentinel spot the exact log line.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="atk-hr" className="block text-[11px] font-medium text-[#CBB8A8]">
                    Time (UTC Hour 0–23)
                  </label>
                  <input
                    id="atk-hr"
                    type="number"
                    min={0}
                    max={23}
                    value={anomalyHourUtc}
                    onChange={(e) => setAnomalyHourUtc(Number(e.target.value))}
                    className="mt-1 w-full px-3 py-2 text-xs font-mono tabular-nums bg-[#120E0C] border border-[#4A3930] rounded-md text-white"
                  />
                </div>
                <div>
                  <label htmlFor="atk-vol" className="block text-[11px] font-medium text-[#CBB8A8]">
                    Request Burst (req/hr)
                  </label>
                  <input
                    id="atk-vol"
                    type="number"
                    min={10}
                    max={500}
                    value={anomalyVolume}
                    onChange={(e) => setAnomalyVolume(Number(e.target.value))}
                    className="mt-1 w-full px-3 py-2 text-xs font-mono tabular-nums bg-[#120E0C] border border-[#4A3930] rounded-md text-white"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="atk-ep" className="block text-[11px] font-medium text-[#CBB8A8]">
                  Target Endpoint
                </label>
                <input
                  id="atk-ep"
                  type="text"
                  value={anomalyEndpoint}
                  onChange={(e) => setAnomalyEndpoint(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-xs font-mono bg-[#120E0C] border border-[#4A3930] rounded-md text-white"
                />
              </div>

              <button
                type="button"
                disabled={busyAction !== null || Boolean(activeBlock)}
                data-testid="attacker-create-anomaly-btn"
                onClick={() =>
                  void runCommand(
                    `POST ${anomalyEndpoint} key=${targetKeyAlias} burst=${anomalyVolume}/hr @ ${String(anomalyHourUtc).padStart(2, '0')}:00Z`,
                    {
                      actionType: 'create_anomaly',
                      targetKeyAlias,
                      hourUtc: anomalyHourUtc,
                      volumeCount: anomalyVolume,
                      endpoint: anomalyEndpoint,
                    },
                  )
                }
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#D97706] rounded-md hover:bg-[#B45309] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4" />
                {activeBlock ? 'Session Quarantined (Blocked)' : 'Create Live Anomaly'}
              </button>
            </section>
          </div>
        )}

        {/* TAB 3: COMPANY LOG STREAM */}
        {tab === 'logs' && (
          <section className="bg-[#1D1512] border border-[#3D2E27] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[#3D2E27] flex items-center justify-between">
              <span className="text-xs font-semibold text-white">
                Harbor &amp; Finch Live System Logs (Edge-Redacted View)
              </span>
              <span className="text-[11px] font-mono text-[#A99586]">
                {snapshot.vaultEntries.length} vault records
              </span>
            </div>
            <div className="divide-y divide-[#30241E] max-h-96 overflow-y-auto">
              {snapshot.vaultEntries.slice(0, 15).map((entry) => (
                <div key={entry.sequence} className="px-4 py-2.5 text-xs font-mono space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[#A99586]">
                    <span>
                      <strong className="text-[#F87171]">#{entry.sequence}</strong> ·{' '}
                      {entry.logFileRef ?? entry.sourceSystem ?? entry.entryType}
                    </span>
                    <span className="tabular-nums">{formatUtcTime(entry.timestamp)}</span>
                  </div>
                  <p className="text-[#F5ECE4] break-words">
                    {entry.redactedSnippet ?? entry.summary}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Persistent Live Terminal Output & Defender Response Feed */}
        <section className="bg-[#0D0A08] border border-[#3D2E27] rounded-lg p-4 space-y-2.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#A99586]">
            <span>LIVE TERMINAL OUTPUT · {attackerAlias}@{sourceIp}</span>
            <span>{snapshot.attackerFeed.length} logged action(s)</span>
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto font-mono text-xs" data-testid="attacker-terminal-output">
            {terminalLines.map((line, idx) => (
              <div key={idx} className="space-y-0.5 pb-2 border-b border-[#241B17] last:border-0">
                <p className="text-[#6EE7C7]">
                  <span className="text-[#A99586]">[{formatRelativeTime(line.ts)}]</span> $ {line.cmd}
                </p>
                <p className={line.blocked ? 'text-[#F87171] font-semibold' : 'text-[#E7D5C7]'}>
                  {line.output}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
