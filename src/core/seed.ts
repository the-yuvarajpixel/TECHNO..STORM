import crypto from 'node:crypto';
import { hashApiKeyIdentifier, runEdgeRedaction } from './redaction.ts';
import {
  appendVaultEntry,
  buildBlastRadiusPreview,
  computeControlDriftReport,
  evaluateFingerprintAnomaly,
  normalizeEvent,
  type IdentityAliasDirectory,
} from './pipeline.ts';
import type {
  AttackerActionRecord,
  BlockedAttackerSession,
  BreachClockCase,
  ControlAssertion,
  ControlPlaneSettings,
  DemoCompanyFile,
  HoneyTrap,
  MachineFingerprint,
  NormalizedEvent,
  NotificationPreferences,
  PaymentHoldRecord,
  PushNotificationEvent,
  SecurityAlert,
  VaultEntry,
  WebhookDeliveryLog,
  WebhookEndpoint,
} from './types.ts';

export interface RegionalDataPlaneState {
  aliasDirectory: IdentityAliasDirectory;
  fingerprints: MachineFingerprint[];
  honeyTraps: HoneyTrap[];
  alerts: SecurityAlert[];
  assertions: ControlAssertion[];
  paymentHolds: PaymentHoldRecord[];
  breachClocks: BreachClockCase[];
  vaultEntries: VaultEntry[];
  notifications: PushNotificationEvent[];
  recentEvents: NormalizedEvent[];
  webhooks: WebhookEndpoint[];
  webhookDeliveries: WebhookDeliveryLog[];
  notificationPrefs: NotificationPreferences;
  demoFiles: DemoCompanyFile[];
  attackerFeed: AttackerActionRecord[];
  blockedSessions: BlockedAttackerSession[];
  stats: {
    totalEventsIngested: number;
    secretsMaskedAtEdge: number;
    clockDriftsStitched: number;
    aliasesResolved: number;
  };
}

export function createInitialControlPlane(
  region = 'ap-southeast-2',
  customerKmsKeyId = 'arn:aws:kms:ap-southeast-2:635224474982:key/7e88b489-ec3a-41f2-a86f-0a4aae156b76',
  webhookUrl = '',
): ControlPlaneSettings {
  const customerKeyFingerprint = crypto
    .createHash('sha256')
    .update(customerKmsKeyId)
    .digest('hex')
    .slice(0, 16);

  return {
    tenantName: 'Harbor & Finch LLP',
    region,
    customerKmsKeyId,
    customerKeyFingerprint,
    outboundAgentMode: 'read_only_mtls',
    edgeRedactionEnabled: true,
    controlPlaneStoresLogs: false,
    webhookTargetConfigured: Boolean(webhookUrl),
    webhookUrlPreview: webhookUrl
      ? `${webhookUrl.slice(0, 28)}...`
      : 'Not configured (WebSocket + Browser Push active)',
    browserPushEnabled: true,
  };
}

export function createSeedDataPlane(
  controlPlane: ControlPlaneSettings,
  edgeSalt: string,
): RegionalDataPlaneState {
  const now = Date.now();
  const isoAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const isoAhead = (hours: number) => new Date(now + hours * 3_600_000).toISOString();

  const aliasDirectory: IdentityAliasDirectory = {
    'ak_payroll_prod': {
      canonicalActorId: 'actor_payroll_svc',
      label: 'Payroll Disbursement Key (ak_payroll_prod)',
    },
    'svc-payroll@okta': {
      canonicalActorId: 'actor_payroll_svc',
      label: 'Payroll Disbursement Key (ak_payroll_prod)',
    },
    'payroll-runner-02': {
      canonicalActorId: 'actor_payroll_svc',
      label: 'Payroll Disbursement Key (ak_payroll_prod)',
    },
    'ak_erp_ledger_sync': {
      canonicalActorId: 'actor_erp_sync',
      label: 'ERP General Ledger Sync (ak_erp_ledger_sync)',
    },
    'netsuite-sync-bot': {
      canonicalActorId: 'actor_erp_sync',
      label: 'ERP General Ledger Sync (ak_erp_ledger_sync)',
    },
    'ak_crm_webhook': {
      canonicalActorId: 'actor_crm_webhook',
      label: 'Client Portal Webhook (ak_crm_webhook)',
    },
  };

  const payrollBaseline = [
    0, 0, 0, 0, 0, 0, 2, 14, 48, 62, 58, 54, 49, 55, 61, 52, 46, 28, 6, 0, 0, 0, 0, 0,
  ];
  const payrollObserved = [
    0, 0, 0, 194, 12, 0, 2, 15, 46, 60, 56, 51, 47, 54, 59, 50, 44, 26, 5, 0, 0, 0, 0, 0,
  ];

  const erpBaseline = [
    12, 10, 10, 11, 12, 14, 24, 38, 64, 72, 70, 68, 66, 71, 74, 68, 59, 44, 28, 18, 15, 14, 13, 12,
  ];
  const erpObserved = [
    11, 10, 12, 11, 13, 15, 22, 39, 63, 75, 69, 66, 65, 70, 72, 66, 58, 43, 27, 17, 16, 14, 12, 11,
  ];

  const crmBaseline = [
    4, 3, 2, 2, 3, 5, 11, 22, 34, 42, 45, 44, 41, 43, 46, 40, 35, 26, 18, 12, 9, 7, 5, 4,
  ];
  const crmObserved = [
    4, 3, 2, 2, 3, 6, 12, 21, 35, 44, 43, 45, 42, 41, 47, 39, 34, 25, 17, 11, 8, 7, 5, 4,
  ];

  const fingerprints: MachineFingerprint[] = [
    {
      id: 'fp_payroll',
      keyAlias: 'ak_payroll_prod',
      system: 'BACS Payroll & HRIS',
      ownerTeam: 'Finance Operations',
      canonicalActorId: 'actor_payroll_svc',
      allowedHoursUtc: [7, 18],
      hourlyBaseline: payrollBaseline,
      hourlyObservedToday: payrollObserved,
      knownIps: ['198.51.100.14', '198.51.100.15'],
      normalVolumeMean: 46,
      normalVolumeStdDev: 14,
      typicalEndpoints: ['/v2/payroll/batches', '/v2/payroll/status', '/v2/employees/roster'],
      criticalDependencies: ['Payroll Disbursement (BACS)', 'Payslip Portal Sync'],
      paydaySensitive: true,
      status: 'active',
      learnedDismissals: 3,
      confirmedAlerts: 1,
      lastSeenUtc: isoAgo(14),
    },
    {
      id: 'fp_erp',
      keyAlias: 'ak_erp_ledger_sync',
      system: 'NetSuite General Ledger',
      ownerTeam: 'Corporate Accounting',
      canonicalActorId: 'actor_erp_sync',
      allowedHoursUtc: [6, 22],
      hourlyBaseline: erpBaseline,
      hourlyObservedToday: erpObserved,
      knownIps: ['198.51.100.22', '10.42.8.19'],
      normalVolumeMean: 44,
      normalVolumeStdDev: 21,
      typicalEndpoints: ['/v1/ledger/journals', '/v1/vendors/list', '/v1/invoices/reconcile'],
      criticalDependencies: ['Month-End Journal Export', 'AP Invoice Matching'],
      paydaySensitive: false,
      status: 'active',
      learnedDismissals: 5,
      confirmedAlerts: 0,
      lastSeenUtc: isoAgo(4),
    },
    {
      id: 'fp_crm',
      keyAlias: 'ak_crm_webhook',
      system: 'Client Matter Portal',
      ownerTeam: 'Client Operations',
      canonicalActorId: 'actor_crm_webhook',
      allowedHoursUtc: [0, 23],
      hourlyBaseline: crmBaseline,
      hourlyObservedToday: crmObserved,
      knownIps: ['203.0.113.41', '203.0.113.42'],
      normalVolumeMean: 24,
      normalVolumeStdDev: 13,
      typicalEndpoints: ['/webhooks/matter-update', '/v1/clients/status'],
      criticalDependencies: ['Client Matter Notifications'],
      paydaySensitive: false,
      status: 'active',
      learnedDismissals: 2,
      confirmedAlerts: 0,
      lastSeenUtc: isoAgo(9),
    },
  ];

  const honeyTraps: HoneyTrap[] = [
    {
      id: 'ht_key_1',
      kind: 'honey_key',
      label: 'AWS Archive Backup Key',
      identifier: 'ak_aws_archive_94a2',
      tokenHash: hashApiKeyIdentifier('ak_aws_archive_94a2', edgeSalt),
      plantedLocation: '/srv/harbor-finch/config/api_keys_prod.env',
      createdAt: isoAgo(14_400),
      triggerCount: 0,
      lastTriggeredAt: null,
      status: 'armed',
    },
    {
      id: 'ht_key_2',
      kind: 'honey_key',
      label: 'Treasury Wire Standby Key',
      identifier: 'ak_treasury_wire_71c8',
      tokenHash: hashApiKeyIdentifier('ak_treasury_wire_71c8', edgeSalt),
      plantedLocation: '/srv/harbor-finch/config/api_keys_prod.env',
      createdAt: isoAgo(21_600),
      triggerCount: 0,
      lastTriggeredAt: null,
      status: 'armed',
    },
    {
      id: 'ht_vendor_1',
      kind: 'honey_vendor',
      label: 'Meridian Archival Supplies Ltd',
      identifier: 'VND-90412',
      tokenHash: hashApiKeyIdentifier('VND-90412', edgeSalt),
      plantedLocation: '/srv/harbor-finch/erp/vendor_master_registry.json',
      createdAt: isoAgo(28_800),
      triggerCount: 0,
      lastTriggeredAt: null,
      status: 'armed',
    },
  ];

  const vaultEntries: VaultEntry[] = [];
  const recentEvents: NormalizedEvent[] = [];

  const seedRawEvents = [
    {
      sourceSystem: 'NetSuite General Ledger',
      logFileRef: '/var/log/harbor-finch/erp-ledger.log:1482',
      rawTimestamp: isoAgo(48),
      clockSkewMs: 3200,
      rawActor: 'netsuite-sync-bot',
      action: 'ledger.journal.sync',
      sourceIp: '198.51.100.22',
      endpoint: '/v1/ledger/journals',
      volumeCount: 42,
      rawPayload: 'Synced 42 journal entries for finance@harborfinch.co.uk batch #2026-11',
    },
    {
      sourceSystem: 'BACS Payroll & HRIS',
      logFileRef: '/var/log/harbor-finch/payroll-api.log:8904',
      rawTimestamp: new Date(new Date().setUTCHours(3, 14, 22, 0)).toISOString(),
      clockSkewMs: 4120,
      rawActor: 'payroll-runner-02',
      action: 'payroll.batch.export',
      sourceIp: '185.220.101.44',
      endpoint: '/v2/payroll/export-bank-details',
      volumeCount: 194,
      rawPayload:
        'Bulk export requested with token ak_payroll_prod for account=4029184421 contact payroll-admin@harborfinch.co.uk',
    },
  ];

  let secretsMasked = 0;
  let clockDrifts = 0;
  let aliasesResolved = 0;

  for (const raw of seedRawEvents) {
    const redacted = runEdgeRedaction(raw, edgeSalt);
    const normalized = normalizeEvent(redacted, aliasDirectory);
    recentEvents.push(normalized);
    secretsMasked += normalized.redactions.length;
    if (normalized.clockDriftCorrectedMs !== 0) clockDrifts++;
    if (normalized.rawActorAlias !== normalized.canonicalActorLabel) aliasesResolved++;

    vaultEntries.push(
      appendVaultEntry(vaultEntries, {
        entryType: 'ingested_event',
        actor: normalized.canonicalActorLabel,
        summary: `${normalized.sourceSystem}: ${normalized.action} (${normalized.sourceIp})`,
        redactionsCount: normalized.redactions.length,
        payloadForDigest: normalized.redactedPayload,
        region: controlPlane.region,
        customerKeyFingerprint: controlPlane.customerKeyFingerprint,
        timestamp: normalized.canonicalTimestamp,
        sourceSystem: normalized.sourceSystem,
        sourceIp: normalized.sourceIp,
        endpoint: normalized.endpoint,
        logFileRef: raw.logFileRef,
        redactedSnippet: normalized.redactedPayload,
        matchedIndicator:
          raw.sourceIp === '185.220.101.44'
            ? '03:14 UTC · IP 185.220.101.44 · 194 req/hr · /v2/payroll/export-bank-details'
            : undefined,
      }),
    );
  }

  const payrollSourceSeq = vaultEntries[1].sequence;
  const payrollEvent = recentEvents[1];
  const payrollFp = fingerprints[0];
  const payrollEval = evaluateFingerprintAnomaly(payrollEvent, payrollFp);

  const payrollAlertVault = appendVaultEntry(vaultEntries, {
    entryType: 'alert_raised',
    actor: 'Sentinel Detection Engine',
    summary: `Critical fingerprint anomaly on ${payrollFp.keyAlias} at 03:14 UTC from unseen IP 185.220.101.44`,
    redactionsCount: payrollEvent.redactions.length,
    payloadForDigest: JSON.stringify(payrollEval.factors),
    region: controlPlane.region,
    customerKeyFingerprint: controlPlane.customerKeyFingerprint,
    timestamp: isoAgo(18),
    sourceSystem: payrollFp.system,
    sourceIp: payrollEvent.sourceIp,
    endpoint: payrollEvent.endpoint,
    logFileRef: '/var/log/harbor-finch/payroll-api.log:8904',
    redactedSnippet: payrollEvent.redactedPayload,
    matchedIndicator: 'Unseen IP 185.220.101.44 + 03:14 UTC + 194 req/hr',
  });
  vaultEntries.push(payrollAlertVault);

  const paymentHoldVault = appendVaultEntry(vaultEntries, {
    entryType: 'payment_hold',
    actor: 'Sentinel Payment-Run Guard',
    summary: 'Held vendor bank-detail change for Northstar Legal Print (£84,200 payout in 16h)',
    redactionsCount: 2,
    payloadForDigest: 'VND-44109|hold|bank-detail-change-pre-payout',
    region: controlPlane.region,
    customerKeyFingerprint: controlPlane.customerKeyFingerprint,
    timestamp: isoAgo(11),
    sourceSystem: 'Accounts Payable ERP',
    sourceIp: '91.198.174.192',
    endpoint: '/v1/vendors/VND-44109/bank-account',
    logFileRef: '/var/log/harbor-finch/ap-vendor-audit.log:419',
    redactedSnippet:
      'PUT /v1/vendors/VND-44109/bank-account by ap-clerk-04 from 91.198.174.192 old=[REDACTED:IBAN#4a9f10c2e81b] new=[REDACTED:IBAN#8d3b77a1f04e]',
    matchedIndicator: 'Bank edit 16h before £84,200 BACS payout from non-office IP',
  });
  vaultEntries.push(paymentHoldVault);

  const alerts: SecurityAlert[] = [
    {
      id: 'alt_payroll_03am',
      createdAt: isoAgo(18),
      severity: 'critical',
      confidence: payrollEval.confidence,
      category: 'fingerprint_anomaly',
      title: 'Out-of-hours payroll API spike from unseen IP',
      summary:
        'Payroll key ak_payroll_prod ran at 03:14 UTC from 185.220.101.44 (194 req/hr, 4.2x normal) targeting an uncommon bank-export endpoint.',
      canonicalActorId: payrollFp.canonicalActorId,
      actorLabel: payrollFp.keyAlias,
      sourceSystem: payrollFp.system,
      sourceIp: payrollEvent.sourceIp,
      observedHourUtc: 3,
      observedVolume: 194,
      status: 'open',
      explainWhy: payrollEval.factors,
      blastRadius: buildBlastRadiusPreview({
        fingerprint: payrollFp,
        targetActorId: payrollFp.canonicalActorId,
        targetLabel: payrollFp.keyAlias,
        sourceIp: payrollEvent.sourceIp,
      }),
      activeResponse: null,
      feedbackHistory: [],
      vaultSequence: payrollAlertVault.sequence,
      sourceVaultSequence: payrollSourceSeq,
      logFileRef: '/var/log/harbor-finch/payroll-api.log:8904',
      logSnippet: payrollEvent.redactedPayload,
      matchedIndicator: 'Unseen IP 185.220.101.44 · 03:14 UTC · 194 req/hr',
      origin: 'baseline',
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
    },
    {
      id: 'alt_payment_hold_01',
      createdAt: isoAgo(11),
      severity: 'high',
      confidence: 0.91,
      category: 'payment_guard',
      title: 'Vendor bank details altered 16 hours before payout run',
      summary:
        'Northstar Legal Print (VND-44109) IBAN was updated inside the 48-hour freeze window. Sentinel automatically placed a payout hold pending callback.',
      canonicalActorId: 'actor_ap_portal',
      actorLabel: 'AP Vendor Portal (VND-44109)',
      sourceSystem: 'Accounts Payable ERP',
      sourceIp: '91.198.174.192',
      observedHourUtc: 6,
      observedVolume: 1,
      status: 'open',
      explainWhy: [
        {
          dimension: 'payment_window',
          summary: 'Bank account modified 16 hours before scheduled £84,200 BACS payout',
          expected: 'No bank-detail edits within 48h of payout without dual approval',
          observed: 'Single-user edit 16h prior to settlement cutoff',
          weight: 0.65,
        },
        {
          dimension: 'source_ip',
          summary: 'Change submitted from non-corporate ISP 91.198.174.192',
          expected: '198.51.100.0/24 corporate office egress',
          observed: '91.198.174.192',
          weight: 0.35,
        },
      ],
      blastRadius: buildBlastRadiusPreview({
        targetActorId: 'actor_ap_portal',
        targetLabel: 'VND-44109 Payout Entry',
        sourceIp: '91.198.174.192',
      }),
      activeResponse: null,
      feedbackHistory: [],
      vaultSequence: paymentHoldVault.sequence,
      sourceVaultSequence: paymentHoldVault.sequence,
      logFileRef: '/var/log/harbor-finch/ap-vendor-audit.log:419',
      logSnippet:
        'PUT /v1/vendors/VND-44109/bank-account by ap-clerk-04 from 91.198.174.192 old=[REDACTED:IBAN#4a9f10c2e81b] new=[REDACTED:IBAN#8d3b77a1f04e]',
      matchedIndicator: 'VND-44109 IBAN edit 16h pre-payout',
      origin: 'baseline',
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
    },
  ];

  const assertions: ControlAssertion[] = [
    {
      id: 'ctrl_01',
      controlRef: 'IAM-04',
      framework: 'Policy / Risk Register',
      paperworkClaim: 'Payroll API keys restricted to office IP range and 07:00–18:00 UTC business hours.',
      observedReality: 'ak_payroll_prod accepted 194 requests at 03:14 UTC from external IP 185.220.101.44.',
      status: 'violated',
      driftWeight: 25,
      evidenceCount: 1,
      owner: 'Head of Finance Ops',
      lastCheckedAt: isoAgo(2),
    },
    {
      id: 'ctrl_02',
      controlRef: 'FIN-11',
      framework: 'Audit Committee Charter',
      paperworkClaim: 'Vendor bank-detail edits require 48-hour freeze and dual approval before payout.',
      observedReality: '1 vendor bank change (VND-44109) attempted 16h before payout; held by Payment-Run Guard.',
      status: 'drifting',
      driftWeight: 20,
      evidenceCount: 1,
      owner: 'Accounts Payable Lead',
      lastCheckedAt: isoAgo(5),
    },
    {
      id: 'ctrl_03',
      controlRef: 'SEC-09',
      framework: 'IT Security Policy',
      paperworkClaim: 'Zero production API tokens pasted into helpdesk tickets.',
      observedReality: '2 tickets contained API tokens over 14 days (masked at edge before storage).',
      status: 'drifting',
      driftWeight: 20,
      evidenceCount: 2,
      owner: 'IT Service Desk Manager',
      lastCheckedAt: isoAgo(9),
    },
    {
      id: 'ctrl_04',
      controlRef: 'LOG-02',
      framework: 'ISO 27001 A.12.4',
      paperworkClaim: 'Audit logs retained in tamper-evident regional vault with zero raw PII.',
      observedReality: `SHA-256 vault intact in ${controlPlane.region}; 100% of detected secrets masked at customer edge.`,
      status: 'aligned',
      driftWeight: 35,
      evidenceCount: vaultEntries.length,
      owner: 'Security Engineering',
      lastCheckedAt: isoAgo(1),
    },
  ];

  computeControlDriftReport(assertions);

  const paymentHolds: PaymentHoldRecord[] = [
    {
      id: 'hold_44109',
      vendorId: 'VND-44109',
      vendorName: 'Northstar Legal Print Ltd',
      payoutDate: isoAhead(16).slice(0, 10),
      hoursUntilPayout: 16,
      amountFormatted: '£84,200.00',
      requestedBy: 'ap-clerk-04 (portal)',
      sourceIp: '91.198.174.192',
      maskedOldAccount: '[REDACTED:IBAN#4a9f10c2e81b]',
      maskedNewAccount: '[REDACTED:IBAN#8d3b77a1f04e]',
      status: 'held_for_review',
      detectedAt: isoAgo(11),
      decidedBy: null,
      decidedAt: null,
    },
  ];

  const breachClocks: BreachClockCase[] = [
    {
      id: 'bc_2026_1104',
      title: 'Payroll API Key Out-of-Hours Export Investigation',
      regulator: 'UK ICO / GDPR Art. 33 (72-hour clock)',
      statutoryWindowHours: 72,
      detectedAt: isoAgo(18),
      deadlineAt: new Date(now - 18 * 60_000 + 72 * 3_600_000).toISOString(),
      status: 'active_countdown',
      customerPiiExposed: false,
      linkedAlertIds: ['alt_payroll_03am'],
      evidencePackHash: crypto
        .createHash('sha256')
        .update(`bc_2026_1104|${payrollAlertVault.entryHash}`)
        .digest('hex')
        .slice(0, 24),
    },
  ];

  const notifications: PushNotificationEvent[] = [
    {
      id: 'notif_seed_1',
      timestamp: isoAgo(18),
      severity: 'critical',
      title: 'Critical: Out-of-hours payroll API spike',
      message: 'ak_payroll_prod ran at 03:14 UTC from unseen IP 185.220.101.44 (194 req/hr).',
      alertId: 'alt_payroll_03am',
      channel: 'websocket',
      read: false,
    },
    {
      id: 'notif_seed_2',
      timestamp: isoAgo(11),
      severity: 'high',
      title: 'Payment-Run Guard: Payout held',
      message: 'Northstar Legal Print bank change held 16h before £84,200 settlement.',
      alertId: 'alt_payment_hold_01',
      channel: 'websocket',
      read: false,
    },
  ];

  const webhooks: WebhookEndpoint[] = [
    {
      id: 'wh_loopback_01',
      name: 'Sentinel Built-In Signed Receiver',
      provider: 'sentinel_loopback',
      url: `http://127.0.0.1:${process.env.PORT || 3000}/api/webhook-receiver`,
      signingSecretPreview: 'whsec_sent…9a4f',
      enabled: true,
      minSeverity: 'low',
      createdAt: isoAgo(1440),
      lastDeliveryAt: null,
      lastStatusCode: null,
    },
  ];

  const demoFiles: DemoCompanyFile[] = [
    {
      id: 'file_env',
      path: '/srv/harbor-finch/config/api_keys_prod.env',
      name: 'api_keys_prod.env',
      category: 'credentials',
      sizeLabel: '2.4 KB',
      sensitivity: 'restricted',
      lastModified: isoAgo(120),
      previewLines: [
        '# Harbor & Finch LLP — Production Integrations',
        'PAYROLL_API_KEY=ak_payroll_prod  # Scope: batches:read,status:read (07:00-18:00 UTC)',
        'ERP_LEDGER_KEY=ak_erp_ledger_sync # Scope: journals:sync (Office CIDR only)',
        'CRM_WEBHOOK_KEY=ak_crm_webhook    # Scope: matter:notify',
      ],
      recommendedAction: {
        type: 'mutate_api_key',
        label: 'Escalate & Hijack ak_payroll_prod',
        targetId: 'ak_payroll_prod',
      },
    },
    {
      id: 'file_payroll',
      path: '/srv/harbor-finch/finance/payroll_disbursement_nov.csv',
      name: 'payroll_disbursement_nov.csv',
      category: 'finance',
      sizeLabel: '184 KB',
      sensitivity: 'restricted',
      lastModified: isoAgo(42),
      previewLines: [
        'batch_id,pay_date,employees,total_gbp,bacs_channel,approval_status',
        'BACS-2026-11B,2026-11-20,412,418900.00,ak_payroll_prod,SCHEDULED',
        'emp_001,J. Hargreaves,Partner,GB29NWBK60161331926819,11400.00',
        'emp_002,S. Al-Mansoor,Senior Associate,GB82WEST12345698765432,7850.00',
        '... (410 additional rows truncated in preview)',
      ],
      recommendedAction: {
        type: 'access_file',
        label: 'Exfiltrate Payroll CSV via ak_payroll_prod',
        targetId: 'file_payroll',
      },
    },
    {
      id: 'file_vendors',
      path: '/srv/harbor-finch/erp/vendor_master_registry.json',
      name: 'vendor_master_registry.json',
      category: 'vendors',
      sizeLabel: '46 KB',
      sensitivity: 'confidential',
      lastModified: isoAgo(19),
      previewLines: [
        '{',
        '  "VND-44109": { "name": "Northstar Legal Print Ltd", "next_payout_gbp": 84200, "freeze_hrs": 16 },',
        '  "VND-31002": { "name": "Thames Discovery Hosting", "next_payout_gbp": 29450, "freeze_hrs": 68 }',
        '}',
      ],
      recommendedAction: {
        type: 'alter_vendor_bank',
        label: 'Divert Vendor Payout IBAN (VND-31002)',
        targetId: 'VND-31002',
      },
    },
    {
      id: 'file_tickets',
      path: '/var/spool/harbor-finch/it_helpdesk_recent_tickets.log',
      name: 'it_helpdesk_recent_tickets.log',
      category: 'tickets',
      sizeLabel: '18 KB',
      sensitivity: 'internal',
      lastModified: isoAgo(7),
      previewLines: [
        '[HD-4799] VPN split-tunnel requested for partner travel (CLOSED)',
        '[HD-4805] NetSuite reconciliation lag on month-end batch (OPEN)',
        '[HD-4810] Reset staging token for payroll runner (PENDING)',
      ],
      recommendedAction: {
        type: 'inject_ticket_secret',
        label: 'Plant Scraped Key in Helpdesk Ticket',
        targetId: 'HD-4891',
      },
    },
  ];

  const webhookDeliveries: WebhookDeliveryLog[] = [];

  const notificationPrefs: NotificationPreferences = {
    browserPushEnabled: true,
    soundChimeEnabled: false,
    minPushSeverity: 'low',
  };

  return {
    aliasDirectory,
    fingerprints,
    honeyTraps,
    alerts,
    assertions,
    paymentHolds,
    breachClocks,
    vaultEntries,
    notifications,
    recentEvents,
    webhooks,
    webhookDeliveries,
    notificationPrefs,
    demoFiles,
    attackerFeed: [],
    blockedSessions: [],
    stats: {
      totalEventsIngested: 14_820 + recentEvents.length,
      secretsMaskedAtEdge: 312 + secretsMasked,
      clockDriftsStitched: 1_204 + clockDrifts,
      aliasesResolved: 846 + aliasesResolved,
    },
  };
}
