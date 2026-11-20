export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type AlertStatus = 'open' | 'contained' | 'dismissed' | 'resolved';

export type AlertCategory =
  | 'fingerprint_anomaly'
  | 'honey_trap'
  | 'payment_guard'
  | 'secret_in_ticket'
  | 'control_drift';

export type RedactionKind =
  | 'api_key'
  | 'aws_key'
  | 'jwt_bearer'
  | 'email'
  | 'iban'
  | 'bank_account'
  | 'ssn'
  | 'card_pan'
  | 'high_entropy_secret';

export interface RedactionFinding {
  kind: RedactionKind;
  field: string;
  tokenHash: string;
  previewMasked: string;
}

export interface RawIngestEvent {
  id?: string;
  sourceSystem: string;
  rawTimestamp: string;
  clockSkewMs?: number;
  rawActor: string;
  action: string;
  sourceIp: string;
  endpoint?: string;
  volumeCount?: number;
  rawPayload: string;
  targetVendorId?: string;
  apiKeyHash?: string;
}

export interface RedactedEvent {
  eventId: string;
  sourceSystem: string;
  rawTimestamp: string;
  clockSkewMs: number;
  redactedActor: string;
  action: string;
  sourceIp: string;
  endpoint: string;
  volumeCount: number;
  redactedPayload: string;
  redactions: RedactionFinding[];
  targetVendorId?: string;
  apiKeyHash?: string;
  redactedAt: string;
}

export interface NormalizedEvent {
  eventId: string;
  sourceSystem: string;
  canonicalTimestamp: string;
  originalTimestamp: string;
  clockDriftCorrectedMs: number;
  canonicalActorId: string;
  canonicalActorLabel: string;
  rawActorAlias: string;
  action: string;
  sourceIp: string;
  endpoint: string;
  volumeCount: number;
  redactedPayload: string;
  redactions: RedactionFinding[];
  targetVendorId?: string;
  apiKeyHash?: string;
}

export interface MachineFingerprint {
  id: string;
  keyAlias: string;
  system: string;
  ownerTeam: string;
  canonicalActorId: string;
  allowedHoursUtc: [number, number];
  hourlyBaseline: number[]; // 24 slots (0..23 UTC)
  hourlyObservedToday: number[]; // 24 slots (0..23 UTC)
  knownIps: string[];
  normalVolumeMean: number;
  normalVolumeStdDev: number;
  typicalEndpoints: string[];
  criticalDependencies: string[];
  paydaySensitive: boolean;
  status: 'active' | 'scoped_restricted' | 'suspended';
  learnedDismissals: number;
  confirmedAlerts: number;
  lastSeenUtc: string;
}

export interface HoneyTrap {
  id: string;
  kind: 'honey_key' | 'honey_vendor';
  label: string;
  identifier: string; // e.g. sk_live_honey_... (masked prefix) or VND-90412
  tokenHash: string;
  plantedLocation: string;
  createdAt: string;
  triggerCount: number;
  lastTriggeredAt: string | null;
  status: 'armed' | 'triggered';
}

export interface ExplainWhyFactor {
  dimension: 'time_window' | 'source_ip' | 'volume' | 'endpoint' | 'honey_trap' | 'payment_window' | 'secret_leak';
  summary: string;
  expected: string;
  observed: string;
  weight: number; // 0..1
}

export interface BlastRadiusOption {
  id: string;
  mode: 'narrow_scoped' | 'full_suspend';
  title: string;
  description: string;
  scopeSummary: string;
  disruptedServices: string[];
  estimatedUsersImpacted: number;
  businessRisk: 'low' | 'high';
  reversible: boolean;
}

export interface BlastRadiusPreview {
  targetActorId: string;
  targetLabel: string;
  businessContextWarning: string | null;
  affectedDownstream: string[];
  recommendedOptionId: string;
  options: BlastRadiusOption[];
}

export interface ResponseExecution {
  id: string;
  alertId: string;
  targetActorId: string;
  mode: 'narrow_scoped' | 'full_suspend';
  actionSummary: string;
  executedBy: string;
  executedAt: string;
  undoneAt: string | null;
  undoneBy: string | null;
  vaultSequence: number;
  undoVaultSequence: number | null;
}

export interface SecurityAlert {
  id: string;
  createdAt: string;
  severity: Severity;
  confidence: number; // 0..1
  category: AlertCategory;
  title: string;
  summary: string;
  canonicalActorId: string;
  actorLabel: string;
  sourceSystem: string;
  sourceIp: string;
  observedHourUtc: number;
  observedVolume: number;
  status: AlertStatus;
  explainWhy: ExplainWhyFactor[];
  blastRadius: BlastRadiusPreview;
  activeResponse: ResponseExecution | null;
  feedbackHistory: Array<{
    decision: 'approve' | 'dismiss';
    operator: string;
    note: string;
    timestamp: string;
  }>;
  vaultSequence: number;
  sourceVaultSequence: number;
  logFileRef: string;
  logSnippet: string;
  matchedIndicator: string;
  origin?: 'baseline' | 'manual_attacker';
  attackerAlias?: string;
  attackAction?: string;
  attackTarget?: string;
  trappedAndBlocked?: boolean;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolutionNote?: string | null;
}

export interface VaultEntry {
  sequence: number;
  timestamp: string;
  entryType:
    | 'ingested_event'
    | 'alert_raised'
    | 'alert_resolved'
    | 'operator_feedback'
    | 'response_executed'
    | 'response_undone'
    | 'payment_hold'
    | 'honey_trap_created';
  actor: string;
  summary: string;
  redactionsCount: number;
  payloadDigest: string;
  prevHash: string;
  entryHash: string;
  region: string;
  customerKeyFingerprint: string;
  sourceSystem?: string;
  sourceIp?: string;
  endpoint?: string;
  logFileRef?: string;
  redactedSnippet?: string;
  matchedIndicator?: string;
}

export interface DemoCompanyFile {
  id: string;
  path: string;
  name: string;
  category: 'credentials' | 'finance' | 'vendors' | 'tickets';
  sizeLabel: string;
  sensitivity: 'restricted' | 'confidential' | 'internal';
  lastModified: string;
  previewLines: string[];
  recommendedAction?: {
    type: 'mutate_api_key' | 'access_file' | 'touch_honey_trap' | 'alter_vendor_bank' | 'inject_ticket_secret';
    label: string;
    targetId: string;
  };
}

export interface AttackerActionRecord {
  id: string;
  timestamp: string;
  attackerAlias: string;
  sourceIp: string;
  actionType: string;
  target: string;
  outcome: 'detected' | 'blocked' | 'trapped_and_blocked' | 'executed';
  alertId: string | null;
  vaultSequence: number;
  summary: string;
}

export interface BlockedAttackerSession {
  sourceIp: string;
  attackerAlias: string;
  trapId: string;
  trapLabel: string;
  trapIdentifier: string;
  blockedAt: string;
  alertId: string;
  vaultSequence: number;
  reason: string;
}

export interface VaultVerificationResult {
  valid: boolean;
  totalEntries: number;
  verifiedEntries: number;
  headHash: string;
  brokenAtSequence: number | null;
  checkedAt: string;
}

export interface ControlAssertion {
  id: string;
  controlRef: string;
  framework: string;
  paperworkClaim: string;
  observedReality: string;
  status: 'aligned' | 'drifting' | 'violated';
  driftWeight: number; // 0..25
  evidenceCount: number;
  owner: string;
  lastCheckedAt: string;
}

export interface ControlDriftReport {
  driftScore: number; // 0 (aligned) to 100 (severe drift)
  alignedCount: number;
  driftingCount: number;
  violatedCount: number;
  auditChairAnswer: string;
  assertions: ControlAssertion[];
}

export interface PaymentHoldRecord {
  id: string;
  vendorId: string;
  vendorName: string;
  payoutDate: string;
  hoursUntilPayout: number;
  amountFormatted: string;
  requestedBy: string;
  sourceIp: string;
  maskedOldAccount: string;
  maskedNewAccount: string;
  status: 'held_for_review' | 'released_verified' | 'blocked_fraud';
  detectedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface BreachClockCase {
  id: string;
  title: string;
  regulator: string;
  statutoryWindowHours: number;
  detectedAt: string;
  deadlineAt: string;
  status: 'active_countdown' | 'contained_assessing' | 'closed_no_pii_exposed';
  customerPiiExposed: boolean;
  linkedAlertIds: string[];
  evidencePackHash: string;
}

export interface ControlPlaneSettings {
  tenantName: string;
  region: string;
  customerKmsKeyId: string;
  customerKeyFingerprint: string;
  outboundAgentMode: 'read_only_mtls';
  edgeRedactionEnabled: boolean;
  controlPlaneStoresLogs: false;
  webhookTargetConfigured: boolean;
  webhookUrlPreview: string;
  browserPushEnabled: boolean;
}

export interface PushNotificationEvent {
  id: string;
  timestamp: string;
  severity: Severity;
  title: string;
  message: string;
  alertId?: string;
  vaultSequence?: number;
  origin?: 'baseline' | 'manual_attacker';
  webhookDispatched?: boolean;
  channel: 'websocket' | 'webhook' | 'browser_push';
  read: boolean;
}

export interface PipelineMetrics {
  totalEventsIngested: number;
  secretsMaskedAtEdge: number;
  clockDriftsStitched: number;
  aliasesResolved: number;
  alertsOpen: number;
  honeyTrapHits: number;
  activeHolds: number;
}

export interface WebhookEndpoint {
  id: string;
  name: string;
  provider: 'slack' | 'pagerduty' | 'teams' | 'generic_json' | 'sentinel_loopback';
  url: string;
  signingSecretPreview: string;
  enabled: boolean;
  minSeverity: Severity;
  createdAt: string;
  lastDeliveryAt: string | null;
  lastStatusCode: number | null;
}

export interface WebhookDeliveryLog {
  id: string;
  webhookId: string;
  webhookName: string;
  url: string;
  eventType: string;
  severity: Severity;
  status: 'delivered' | 'failed';
  statusCode: number | null;
  latencyMs: number;
  signatureHeader: string;
  payloadSummary: string;
  responsePreview: string;
  timestamp: string;
}

export interface NotificationPreferences {
  browserPushEnabled: boolean;
  soundChimeEnabled: boolean;
  minPushSeverity: Severity;
}

export interface SystemSnapshot {
  controlPlane: ControlPlaneSettings;
  metrics: PipelineMetrics;
  alerts: SecurityAlert[];
  fingerprints: MachineFingerprint[];
  honeyTraps: HoneyTrap[];
  controlDrift: ControlDriftReport;
  paymentHolds: PaymentHoldRecord[];
  breachClocks: BreachClockCase[];
  vaultEntries: VaultEntry[];
  vaultVerification: VaultVerificationResult;
  notifications: PushNotificationEvent[];
  recentEvents: NormalizedEvent[];
  webhooks: WebhookEndpoint[];
  webhookDeliveries: WebhookDeliveryLog[];
  notificationPrefs: NotificationPreferences;
  demoFiles: DemoCompanyFile[];
  attackerFeed: AttackerActionRecord[];
  blockedSessions: BlockedAttackerSession[];
  connectedRoles: {
    secops: number;
    executive: number;
    attacker: number;
  };
}
