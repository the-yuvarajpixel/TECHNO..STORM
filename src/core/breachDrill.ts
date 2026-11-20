import type { Severity } from './types.ts';

export type BreachDrillStageKind =
  | 'ticket_secret'
  | 'fingerprint_ingest'
  | 'vendor_bank_hijack'
  | 'honey_trap';

export interface BreachDrillStage {
  id: string;
  title: string;
  system: string;
  mitreTactic: string;
  expectedSeverity: Severity;
  description: string;
  kind: BreachDrillStageKind;
  sourceIp: string;
  params: {
    // ticket_secret
    ticketPrefix?: string;
    ticketText?: string;
    reporterSystem?: string;
    // fingerprint_ingest
    rawActor?: string;
    action?: string;
    endpoint?: string;
    volumeCount?: number;
    clockSkewMs?: number;
    hourUtc?: number;
    rawPayload?: string;
    // vendor_bank_hijack
    attackerAlias?: string;
    vendorId?: string;
    // honey_trap
    trapId?: string;
  };
}

export interface BreachDrillScenario {
  id: 'full_kill_chain' | 'finance_insider' | 'identity_deception';
  name: string;
  subtitle: string;
  estimatedDurationSec: number;
  stages: BreachDrillStage[];
}

export interface BreachDrillStepExecutionResult {
  drillId: string;
  scenarioId: BreachDrillScenario['id'];
  stepIndex: number;
  stepId: string;
  stepTitle: string;
  system: string;
  mitreTactic: string;
  alertId: string | null;
  severity: Severity;
  vaultSequence: number | null;
  summary: string;
  executedAt: string;
}

export const BREACH_DRILL_SCENARIOS: BreachDrillScenario[] = [
  {
    id: 'full_kill_chain',
    name: 'Multi-System Kill Chain',
    subtitle:
      'End-to-end 5-stage intrusion across IT Service Desk, Client Portal, BACS Payroll, NetSuite ERP, and Stealth Honey Traps.',
    estimatedDurationSec: 12,
    stages: [
      {
        id: 'kc_ticket_secret',
        title: 'Leaked API Credential in Support Ticket',
        system: 'IT Service Desk (Jira)',
        mitreTactic: 'Credential Access',
        expectedSeverity: 'high',
        description:
          'Injects a helpdesk escalation containing an exposed production API key and contact email to verify edge HMAC redaction and secret alerting.',
        kind: 'ticket_secret',
        sourceIp: '198.51.100.88',
        params: {
          ticketPrefix: 'DRILL-HD',
          reporterSystem: 'IT Service Desk [Sandbox Drill]',
          ticketText:
            `[SANDBOX BREACH DRILL] Escalating BACS connector timeout for finance-ops@harborfinch.co.uk. Temporary token pasted: ${['sk', 'live', 'drill99887766554433221100aabbccdd'].join('_')} — please verify.`,
        },
      },
      {
        id: 'kc_crm_spike',
        title: 'Client Matter Portal Bulk Scrape',
        system: 'Client Matter Portal',
        mitreTactic: 'Collection',
        expectedSeverity: 'high',
        description:
          'Drives an anomalous 340 req/hr bulk client-dossier export from an unseen foreign exit IP using ak_crm_webhook.',
        kind: 'fingerprint_ingest',
        sourceIp: '185.220.102.91',
        params: {
          rawActor: 'ak_crm_webhook',
          action: 'clients.dossier.bulk_export',
          endpoint: '/v1/clients/export-all-matters',
          volumeCount: 340,
          clockSkewMs: 1450,
          hourUtc: 2,
          rawPayload:
            '[SANDBOX DRILL] Bulk matter export triggered via ak_crm_webhook for partner.review@harborfinch.co.uk',
        },
      },
      {
        id: 'kc_payroll_lateral',
        title: 'Off-Hours Payroll API Lateral Dump',
        system: 'BACS Payroll & HRIS',
        mitreTactic: 'Lateral Movement',
        expectedSeverity: 'critical',
        description:
          'Fires a 03:22 UTC unauthorized payroll IBAN dump with +3.4s clock skew from 185.220.102.91, testing payday-sensitive blast-radius previews.',
        kind: 'fingerprint_ingest',
        sourceIp: '185.220.102.91',
        params: {
          rawActor: 'ak_payroll_prod',
          action: 'payroll.iban_manifest.export',
          endpoint: '/v2/payroll/bulk-iban-dump',
          volumeCount: 245,
          clockSkewMs: 3420,
          hourUtc: 3,
          rawPayload:
            '[SANDBOX DRILL] Unscheduled BACS export touching GB29NWBK60161331926819 initiated by ak_payroll_prod',
        },
      },
      {
        id: 'kc_vendor_hijack',
        title: 'Pre-Payout Vendor Bank Account Diversion',
        system: 'NetSuite General Ledger',
        mitreTactic: 'Impact (Financial)',
        expectedSeverity: 'high',
        description:
          'Submits a last-minute vendor bank change before scheduled settlement to trigger Sentinel Dual-Control Payment Hold.',
        kind: 'vendor_bank_hijack',
        sourceIp: '45.133.1.94',
        params: {
          attackerAlias: 'drill-sim-ops',
          vendorId: 'VND-4021',
        },
      },
      {
        id: 'kc_honey_trap',
        title: 'Stealth Honey-Key Tripwire Triggered',
        system: 'Secrets Deception Layer',
        mitreTactic: 'Deception Trigger',
        expectedSeverity: 'critical',
        description:
          'Simulates an intruder probing the planted AWS Archive Backup honey key, firing a zero-false-positive critical alert and webhook dispatch.',
        kind: 'honey_trap',
        sourceIp: '185.220.102.91',
        params: {
          trapId: 'ht_key_1',
        },
      },
    ],
  },
  {
    id: 'finance_insider',
    name: 'Finance & Insider Fraud Drill',
    subtitle:
      'Focused 3-stage exercise validating secret redaction, ERP ledger exfiltration, and dual-control payment holds.',
    estimatedDurationSec: 7,
    stages: [
      {
        id: 'fi_ticket_secret',
        title: 'AWS Key Pasted in Accounting Ticket',
        system: 'IT Service Desk (Jira)',
        mitreTactic: 'Credential Access',
        expectedSeverity: 'high',
        description:
          'Simulates an accidental AWS IAM key leak in a month-end close support ticket to verify instant edge masking.',
        kind: 'ticket_secret',
        sourceIp: '198.51.100.64',
        params: {
          ticketPrefix: 'DRILL-FIN',
          reporterSystem: 'Accounting Desk [Sandbox Drill]',
          ticketText:
            `[SANDBOX BREACH DRILL] Month-end S3 export failing using ${['AKIA', 'IOSFODNN7DRILL99'].join('')} — contact controller@harborfinch.co.uk.`,
        },
      },
      {
        id: 'fi_erp_dump',
        title: 'Off-Hours General Ledger Bulk Export',
        system: 'NetSuite General Ledger',
        mitreTactic: 'Exfiltration',
        expectedSeverity: 'high',
        description:
          'Drives a 02:15 UTC high-volume journal dump using ak_erp_ledger_sync from an unrecognized IP address.',
        kind: 'fingerprint_ingest',
        sourceIp: '91.214.124.53',
        params: {
          rawActor: 'ak_erp_ledger_sync',
          action: 'ledger.trial_balance.dump',
          endpoint: '/v1/ledger/export-unrestricted',
          volumeCount: 290,
          clockSkewMs: 2650,
          hourUtc: 2,
          rawPayload:
            '[SANDBOX DRILL] Unrestricted ledger export requested by netsuite-sync-bot from external proxy.',
        },
      },
      {
        id: 'fi_vendor_hijack',
        title: 'Urgent Vendor IBAN Swap Before Payout',
        system: 'NetSuite Accounts Payable',
        mitreTactic: 'Impact (Financial)',
        expectedSeverity: 'high',
        description:
          'Tests CFO/Controller dual-control workflow by attempting an out-of-band vendor payout account change.',
        kind: 'vendor_bank_hijack',
        sourceIp: '91.214.124.53',
        params: {
          attackerAlias: 'drill-fin-sim',
          vendorId: 'VND-4021',
        },
      },
    ],
  },
  {
    id: 'identity_deception',
    name: 'Machine Identity & Deception Stress',
    subtitle:
      '4-stage SecOps speed test combining simultaneous API key anomalies with both Honey Key and Honey Vendor tripwires.',
    estimatedDurationSec: 10,
    stages: [
      {
        id: 'id_crm_spike',
        title: 'Client Webhook Credential Abuse',
        system: 'Client Matter Portal',
        mitreTactic: 'Discovery',
        expectedSeverity: 'high',
        description:
          'Tests baseline deviation scoring when ak_crm_webhook spikes 12x above normal from an unknown ASN.',
        kind: 'fingerprint_ingest',
        sourceIp: '194.26.135.72',
        params: {
          rawActor: 'ak_crm_webhook',
          action: 'clients.schema.enumerate',
          endpoint: '/v1/admin/internal-dump',
          volumeCount: 310,
          clockSkewMs: 1800,
          hourUtc: 1,
          rawPayload: '[SANDBOX DRILL] Rapid endpoint enumeration via ak_crm_webhook.',
        },
      },
      {
        id: 'id_payroll_spike',
        title: 'Payroll Disburser Midnight Replay',
        system: 'BACS Payroll & HRIS',
        mitreTactic: 'Lateral Movement',
        expectedSeverity: 'critical',
        description:
          'Exercises blast-radius preview and narrow-scope vs full-suspend response options on a payday-sensitive key.',
        kind: 'fingerprint_ingest',
        sourceIp: '194.26.135.72',
        params: {
          rawActor: 'ak_payroll_prod',
          action: 'payroll.batch.unauthorized_export',
          endpoint: '/v2/payroll/export-direct-debit',
          volumeCount: 265,
          clockSkewMs: 4100,
          hourUtc: 4,
          rawPayload: '[SANDBOX DRILL] Midnight payroll export replay from 194.26.135.72.',
        },
      },
      {
        id: 'id_honey_key',
        title: 'Treasury Standby Honey Key Touched',
        system: 'Secrets Deception Layer',
        mitreTactic: 'Deception Trigger',
        expectedSeverity: 'critical',
        description:
          'Trips the Treasury Wire Standby honey key (ht_key_2) to verify instant critical alerting and signed webhooks.',
        kind: 'honey_trap',
        sourceIp: '194.26.135.72',
        params: {
          trapId: 'ht_key_2',
        },
      },
      {
        id: 'id_honey_vendor',
        title: 'Decoy Vendor Registry Probed',
        system: 'ERP Deception Layer',
        mitreTactic: 'Deception Trigger',
        expectedSeverity: 'critical',
        description:
          'Trips the Meridian Archival Supplies honey vendor (ht_vendor_1) to validate vendor-level deception alerts.',
        kind: 'honey_trap',
        sourceIp: '194.26.135.72',
        params: {
          trapId: 'ht_vendor_1',
        },
      },
    ],
  },
];

export function getBreachDrillScenario(scenarioId: string): BreachDrillScenario | undefined {
  return BREACH_DRILL_SCENARIOS.find((s) => s.id === scenarioId);
}
