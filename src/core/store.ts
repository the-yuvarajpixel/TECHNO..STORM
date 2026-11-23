import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { hashApiKeyIdentifier, redactTextAtEdge, runEdgeRedaction } from './redaction.ts';
import {
  appendVaultEntry,
  applyFingerprintFeedback,
  buildBlastRadiusPreview,
  buildLegalEvidencePack,
  computeControlDriftReport,
  evaluateFingerprintAnomaly,
  evaluateHoneyTrap,
  normalizeEvent,
  verifyVaultChain,
} from './pipeline.ts';
import {
  createInitialControlPlane,
  createSeedDataPlane,
  type RegionalDataPlaneState,
} from './seed.ts';
import {
  buildProviderWebhookPayload,
  severityMeetsThreshold,
  signWebhookPayload,
  verifyWebhookSignature,
} from './webhooks.ts';
import type {
  BlockedAttackerSession,
  ControlPlaneSettings,
  HoneyTrap,
  NormalizedEvent,
  NotificationPreferences,
  PaymentHoldRecord,
  PushNotificationEvent,
  RawIngestEvent,
  RedactionFinding,
  ResponseExecution,
  SecurityAlert,
  Severity,
  SystemSnapshot,
  WebhookDeliveryLog,
  WebhookEndpoint,
} from './types.ts';

export type RealtimeBroadcastFn = (eventType: string, payload: unknown) => void;

export class SentinelEngineStore {
  // Architectural Control-Plane vs Regional Data-Plane separation:
  // controlPlane holds ONLY tenant settings & metadata, NEVER customer logs.
  private controlPlane: ControlPlaneSettings;
  private dataPlane: RegionalDataPlaneState;
  private readonly edgeSalt: string;
  private readonly webhookSigningSecret: string;
  private readonly storageFilePath: string | null;
  private readonly broadcast: RealtimeBroadcastFn;
  private connectedRoles: { secops: number; executive: number; attacker: number } = {
    secops: 0,
    executive: 0,
    attacker: 0,
  };

  constructor(options?: {
    region?: string;
    customerKmsKeyId?: string;
    edgeSalt?: string;
    webhookUrl?: string;
    webhookSigningSecret?: string;
    storageFilePath?: string | null;
    broadcast?: RealtimeBroadcastFn;
  }) {
    this.edgeSalt = options?.edgeSalt ?? 'sentinel-harbor-finch-edge-hmac-salt-2026';
    this.webhookSigningSecret =
      options?.webhookSigningSecret ??
      process.env.SENTINEL_WEBHOOK_SECRET ??
      ['whsec', 'sentinel_regional_hmac_key_2026_9a4f'].join('_');
    const rawStoragePath = options?.storageFilePath ?? null;
    this.storageFilePath =
      rawStoragePath &&
      !/^[a-z][a-z0-9+.-]*:\/\//i.test(rawStoragePath) &&
      !rawStoragePath.includes(':')
        ? rawStoragePath
        : null;
    this.broadcast = options?.broadcast ?? (() => {});
    this.controlPlane = createInitialControlPlane(
      options?.region,
      options?.customerKmsKeyId,
      options?.webhookUrl,
    );

    const loaded = this.loadFromDisk();
    if (loaded) {
      this.dataPlane = {
        ...createSeedDataPlane(this.controlPlane, this.edgeSalt),
        ...loaded,
        blockedSessions: Array.isArray(loaded.blockedSessions) ? loaded.blockedSessions : [],
      };
    } else {
      this.dataPlane = createSeedDataPlane(this.controlPlane, this.edgeSalt);
    }

    // If SENTINEL_WEBHOOK_URL env var is supplied for deployment, validate strictly before registering
    const safeEnvWebhookUrl = (() => {
      const raw = (options?.webhookUrl ?? '').trim().replace(/^['"]+|['"]+$/g, '').trim();
      if (!raw || /[\s[\]()<>]/.test(raw) || !/^https?:\/\//i.test(raw)) return null;
      try {
        const parsed = new URL(raw);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
      } catch {
        return null;
      }
    })();

    if (safeEnvWebhookUrl) {
      const exists = this.dataPlane.webhooks.some((w) => w.url === safeEnvWebhookUrl);
      if (!exists) {
        this.dataPlane.webhooks.unshift({
          id: 'wh_env_primary',
          name: 'Deployment Env Webhook (SENTINEL_WEBHOOK_URL)',
          provider: safeEnvWebhookUrl.includes('hooks.slack.com') ? 'slack' : 'generic_json',
          url: safeEnvWebhookUrl,
          signingSecretPreview: `${this.webhookSigningSecret.slice(0, 10)}…${this.webhookSigningSecret.slice(-4)}`,
          enabled: true,
          minSeverity: 'low',
          createdAt: new Date().toISOString(),
          lastDeliveryAt: null,
          lastStatusCode: null,
        });
      }
    }
    this.syncWebhookControlMeta();
    this.saveToDisk();
  }

  private syncWebhookControlMeta(): void {
    const activeCount = this.dataPlane.webhooks.filter((w) => w.enabled).length;
    this.controlPlane.webhookTargetConfigured = activeCount > 0;
    this.controlPlane.webhookUrlPreview =
      activeCount > 0
        ? `${activeCount} active signed endpoint${activeCount > 1 ? 's' : ''}`
        : 'No active webhooks (WebSocket + Browser Push active)';
  }

  public verifyIncomingSignature(payloadJson: string, timestampIso: string, sig: string): boolean {
    return verifyWebhookSignature(payloadJson, timestampIso, sig, this.webhookSigningSecret);
  }

  private async deliverToEndpoint(
    endpoint: WebhookEndpoint,
    notification: PushNotificationEvent,
    eventType: string,
  ): Promise<WebhookDeliveryLog> {
    const started = Date.now();
    const timestampIso = new Date().toISOString();
    const bodyObj = buildProviderWebhookPayload({
      provider: endpoint.provider,
      region: this.controlPlane.region,
      tenantName: this.controlPlane.tenantName,
      notification,
      endpointUrl: endpoint.url,
    });
    const payloadJson = JSON.stringify(bodyObj);
    const signatureHeader = signWebhookPayload(
      payloadJson,
      timestampIso,
      this.webhookSigningSecret,
    );

    let statusCode: number | null = null;
    let status: 'delivered' | 'failed' = 'failed';
    let responsePreview = '';

    const isServerlessRuntime = Boolean(
      process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT,
    );
    const isLocalLoopbackEndpoint =
      endpoint.provider === 'sentinel_loopback' &&
      /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/api\/webhook-receiver/i.test(endpoint.url);

    const verifyLoopbackInProcess = () => {
      const verified = this.verifyIncomingSignature(payloadJson, timestampIso, signatureHeader);
      statusCode = verified ? 200 : 401;
      status = verified ? 'delivered' : 'failed';
      responsePreview = JSON.stringify({
        accepted: verified,
        signatureVerified: verified,
        mode: isServerlessRuntime ? 'serverless_verified' : 'loopback_verified',
        eventHeader: eventType,
      }).slice(0, 140);
    };

    if (isServerlessRuntime && isLocalLoopbackEndpoint) {
      verifyLoopbackInProcess();
    } else {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Sentinel-Webhook-Dispatcher/1.0',
            'X-Sentinel-Event': eventType,
            'X-Sentinel-Timestamp': timestampIso,
            'X-Sentinel-Signature-256': signatureHeader,
            'X-Sentinel-Region': this.controlPlane.region,
          },
          body: payloadJson,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        statusCode = res.status;
        status = res.ok ? 'delivered' : 'failed';
        const text = await res.text();
        responsePreview = text.slice(0, 140) || `HTTP ${res.status}`;
      } catch (err) {
        if (isLocalLoopbackEndpoint) {
          verifyLoopbackInProcess();
        } else {
          status = 'failed';
          responsePreview = err instanceof Error ? err.message : 'Network error';
        }
      }
    }

    const log: WebhookDeliveryLog = {
      id: `whd_${crypto.randomUUID().slice(0, 8)}`,
      webhookId: endpoint.id,
      webhookName: endpoint.name,
      url: endpoint.url,
      eventType,
      severity: notification.severity,
      status,
      statusCode,
      latencyMs: Math.max(1, Date.now() - started),
      signatureHeader: `${signatureHeader.slice(0, 22)}…`,
      payloadSummary: `${notification.title} (${notification.severity})`,
      responsePreview,
      timestamp: timestampIso,
    };

    endpoint.lastDeliveryAt = timestampIso;
    endpoint.lastStatusCode = statusCode;
    this.dataPlane.webhookDeliveries = [log, ...this.dataPlane.webhookDeliveries].slice(0, 40);
    this.saveToDisk();
    this.broadcast('webhook:delivered', log);
    this.broadcast('state:updated', { reason: 'webhook_delivered', deliveryId: log.id });
    return log;
  }

  private async dispatchWebhooks(
    notification: PushNotificationEvent,
    eventType: string,
  ): Promise<WebhookDeliveryLog[]> {
    if (!this.storageFilePath) return [];
    const targets = this.dataPlane.webhooks.filter(
      (w) => w.enabled && severityMeetsThreshold(notification.severity, w.minSeverity),
    );
    if (targets.length === 0) return [];
    return Promise.all(targets.map((endpoint) => this.deliverToEndpoint(endpoint, notification, eventType)));
  }

  private loadFromDisk(): RegionalDataPlaneState | null {
    if (!this.storageFilePath) return null;
    try {
      if (!fs.existsSync(this.storageFilePath)) return null;
      const raw = fs.readFileSync(this.storageFilePath, 'utf8');
      const parsed = JSON.parse(raw) as RegionalDataPlaneState;
      if (!parsed || !Array.isArray(parsed.vaultEntries) || !Array.isArray(parsed.alerts)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private saveToDisk(): void {
    if (!this.storageFilePath) return;
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storageFilePath, JSON.stringify(this.dataPlane, null, 2), 'utf8');
    } catch {
      // Non-fatal in read-only environments
    }
  }

  private pushNotification(params: {
    severity: PushNotificationEvent['severity'];
    title: string;
    message: string;
    alertId?: string;
    vaultSequence?: number;
    origin?: 'baseline' | 'manual_attacker';
    eventType?: string;
  }): { notification: PushNotificationEvent; webhookPromise: Promise<WebhookDeliveryLog[]> } {
    const matchingWebhooks = this.storageFilePath
      ? this.dataPlane.webhooks.filter(
          (w) => w.enabled && severityMeetsThreshold(params.severity, w.minSeverity),
        )
      : [];

    const notif: PushNotificationEvent = {
      id: `notif_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      severity: params.severity,
      title: params.title,
      message: params.message,
      alertId: params.alertId,
      vaultSequence: params.vaultSequence,
      origin: params.origin,
      webhookDispatched: matchingWebhooks.length > 0,
      channel: 'websocket',
      read: false,
    };
    this.dataPlane.notifications = [notif, ...this.dataPlane.notifications].slice(0, 50);
    this.broadcast('notification:push', notif);
    const webhookPromise = this.dispatchWebhooks(notif, params.eventType ?? 'sentinel.alert.push');
    return { notification: notif, webhookPromise };
  }

  public setConnectedRoles(roles: { secops: number; executive: number; attacker: number }): void {
    this.connectedRoles = { ...roles };
    this.broadcast('presence:updated', this.connectedRoles);
  }

  public getSnapshot(): SystemSnapshot {
    const vaultVerification = verifyVaultChain(this.dataPlane.vaultEntries);
    const controlDrift = computeControlDriftReport(this.dataPlane.assertions);

    return {
      controlPlane: { ...this.controlPlane },
      metrics: {
        totalEventsIngested: this.dataPlane.stats.totalEventsIngested,
        secretsMaskedAtEdge: this.dataPlane.stats.secretsMaskedAtEdge,
        clockDriftsStitched: this.dataPlane.stats.clockDriftsStitched,
        aliasesResolved: this.dataPlane.stats.aliasesResolved,
        alertsOpen: this.dataPlane.alerts.filter((a) => a.status === 'open').length,
        honeyTrapHits: this.dataPlane.honeyTraps.reduce((s, t) => s + t.triggerCount, 0),
        activeHolds: this.dataPlane.paymentHolds.filter((h) => h.status === 'held_for_review').length,
      },
      alerts: this.dataPlane.alerts,
      fingerprints: this.dataPlane.fingerprints,
      honeyTraps: this.dataPlane.honeyTraps,
      controlDrift,
      paymentHolds: this.dataPlane.paymentHolds,
      breachClocks: this.dataPlane.breachClocks,
      vaultEntries: this.dataPlane.vaultEntries.slice(-80).reverse(),
      vaultVerification,
      notifications: this.dataPlane.notifications,
      recentEvents: this.dataPlane.recentEvents.slice(-25).reverse(),
      webhooks: this.dataPlane.webhooks,
      webhookDeliveries: this.dataPlane.webhookDeliveries.slice(0, 30),
      notificationPrefs: { ...this.dataPlane.notificationPrefs },
      demoFiles: this.dataPlane.demoFiles ?? [],
      attackerFeed: (this.dataPlane.attackerFeed ?? []).slice(0, 25),
      blockedSessions: this.dataPlane.blockedSessions ?? [],
      connectedRoles: { ...this.connectedRoles },
    };
  }

  /**
   * Full Pipeline Ingestion:
   * Raw Event -> Edge Redaction -> Normalizer -> Hash-Chained Vault -> Detection Engine -> Decision Engine -> Push Notifier
   */
  public ingestEvent(
    raw: RawIngestEvent,
    meta?: {
      logFileRef?: string;
      origin?: 'baseline' | 'manual_attacker';
      customAlertTitle?: string;
      attackerAlias?: string;
      attackAction?: string;
      attackTarget?: string;
      suppressAutoNotification?: boolean;
    },
  ): {
    normalized: NormalizedEvent;
    alert: SecurityAlert | null;
    vaultSequence: number;
  } {
    const redacted = runEdgeRedaction(raw, this.edgeSalt);
    const normalized = normalizeEvent(redacted, this.dataPlane.aliasDirectory);
    const lineNum = 1000 + this.dataPlane.vaultEntries.length * 7;
    const defaultLogFile = `/var/log/harbor-finch/${normalized.sourceSystem
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}.log:${lineNum}`;
    const logFileRef = meta?.logFileRef ?? defaultLogFile;

    this.dataPlane.stats.totalEventsIngested += 1;
    this.dataPlane.stats.secretsMaskedAtEdge += normalized.redactions.length;
    if (normalized.clockDriftCorrectedMs !== 0) {
      this.dataPlane.stats.clockDriftsStitched += 1;
    }
    if (normalized.rawActorAlias !== normalized.canonicalActorLabel) {
      this.dataPlane.stats.aliasesResolved += 1;
    }

    this.dataPlane.recentEvents = [...this.dataPlane.recentEvents.slice(-49), normalized];

    const eventVaultEntry = appendVaultEntry(this.dataPlane.vaultEntries, {
      entryType: 'ingested_event',
      actor: normalized.canonicalActorLabel,
      summary: `${normalized.sourceSystem}: ${normalized.action} from ${normalized.sourceIp}`,
      redactionsCount: normalized.redactions.length,
      payloadForDigest: normalized.redactedPayload,
      region: this.controlPlane.region,
      customerKeyFingerprint: this.controlPlane.customerKeyFingerprint,
      timestamp: normalized.canonicalTimestamp,
      sourceSystem: normalized.sourceSystem,
      sourceIp: normalized.sourceIp,
      endpoint: normalized.endpoint,
      logFileRef,
      redactedSnippet: normalized.redactedPayload,
    });
    this.dataPlane.vaultEntries.push(eventVaultEntry);

    let createdAlert: SecurityAlert | null = null;

    // 1. Check Honey Traps first (near-certain signal)
    const honeyMatch = evaluateHoneyTrap(normalized, this.dataPlane.honeyTraps);
    if (honeyMatch) {
      const trap = honeyMatch.matchedTrap;
      trap.triggerCount += 1;
      trap.lastTriggeredAt = normalized.canonicalTimestamp;
      trap.status = 'triggered';

      const indicator = `Decoy ${trap.identifier} touched from ${normalized.sourceIp}`;
      eventVaultEntry.matchedIndicator = indicator;

      const alertVault = appendVaultEntry(this.dataPlane.vaultEntries, {
        entryType: 'alert_raised',
        actor: 'Sentinel Honey Trap Detector',
        summary: `Near-certain honey trap hit: ${trap.label} (${trap.identifier}) from ${normalized.sourceIp}`,
        redactionsCount: normalized.redactions.length,
        payloadForDigest: `${trap.id}|${normalized.sourceIp}|${normalized.eventId}`,
        region: this.controlPlane.region,
        customerKeyFingerprint: this.controlPlane.customerKeyFingerprint,
        sourceSystem: normalized.sourceSystem,
        sourceIp: normalized.sourceIp,
        endpoint: normalized.endpoint,
        logFileRef,
        redactedSnippet: normalized.redactedPayload,
        matchedIndicator: indicator,
      });
      this.dataPlane.vaultEntries.push(alertVault);

      createdAlert = {
        id: `alt_honey_${crypto.randomUUID().slice(0, 6)}`,
        createdAt: new Date().toISOString(),
        severity: 'critical',
        confidence: 0.998,
        category: 'honey_trap',
        title: meta?.customAlertTitle ?? `Honey ${trap.kind === 'honey_key' ? 'key' : 'vendor'} touched: ${trap.label}`,
        summary: `Decoy artifact ${trap.identifier} (${trap.plantedLocation}) was accessed from ${normalized.sourceIp}. Nothing legitimate touches this asset.`,
        canonicalActorId: normalized.canonicalActorId,
        actorLabel: trap.identifier,
        sourceSystem: normalized.sourceSystem,
        sourceIp: normalized.sourceIp,
        observedHourUtc: new Date(normalized.canonicalTimestamp).getUTCHours(),
        observedVolume: normalized.volumeCount,
        status: 'open',
        explainWhy: honeyMatch.factors,
        blastRadius: buildBlastRadiusPreview({
          targetActorId: trap.id,
          targetLabel: trap.label,
          sourceIp: normalized.sourceIp,
          isHoneyTrap: true,
        }),
        activeResponse: null,
        feedbackHistory: [],
        vaultSequence: alertVault.sequence,
        sourceVaultSequence: eventVaultEntry.sequence,
        logFileRef,
        logSnippet: normalized.redactedPayload,
        matchedIndicator: indicator,
        origin: meta?.origin ?? 'baseline',
        attackerAlias: meta?.attackerAlias,
        attackAction: meta?.attackAction,
        attackTarget: meta?.attackTarget ?? trap.identifier,
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
      };
    } else {
      // 2. Evaluate Machine-Identity Fingerprint baseline
      const fp = this.dataPlane.fingerprints.find(
        (f) => f.canonicalActorId === normalized.canonicalActorId || f.keyAlias === raw.rawActor,
      );
      if (fp) {
        const hourUtc = new Date(normalized.canonicalTimestamp).getUTCHours();
        fp.hourlyObservedToday[hourUtc] =
          (fp.hourlyObservedToday[hourUtc] ?? 0) + normalized.volumeCount;
        fp.lastSeenUtc = normalized.canonicalTimestamp;

        const evaluation = evaluateFingerprintAnomaly(normalized, fp);
        if (evaluation.isAnomaly) {
          const indicator = evaluation.factors.map((f) => f.observed).join(' · ');
          eventVaultEntry.matchedIndicator = indicator;

          const alertVault = appendVaultEntry(this.dataPlane.vaultEntries, {
            entryType: 'alert_raised',
            actor: 'Sentinel Fingerprint Engine',
            summary: `${evaluation.severity.toUpperCase()} anomaly on ${fp.keyAlias} from ${normalized.sourceIp}`,
            redactionsCount: normalized.redactions.length,
            payloadForDigest: JSON.stringify(evaluation.factors),
            region: this.controlPlane.region,
            customerKeyFingerprint: this.controlPlane.customerKeyFingerprint,
            sourceSystem: normalized.sourceSystem,
            sourceIp: normalized.sourceIp,
            endpoint: normalized.endpoint,
            logFileRef,
            redactedSnippet: normalized.redactedPayload,
            matchedIndicator: indicator,
          });
          this.dataPlane.vaultEntries.push(alertVault);

          createdAlert = {
            id: `alt_fp_${crypto.randomUUID().slice(0, 6)}`,
            createdAt: new Date().toISOString(),
            severity: evaluation.severity,
            confidence: evaluation.confidence,
            category: 'fingerprint_anomaly',
            title: meta?.customAlertTitle ?? `Behavioral deviation on ${fp.keyAlias}`,
            summary: evaluation.factors.map((f) => f.summary).join(' · '),
            canonicalActorId: fp.canonicalActorId,
            actorLabel: fp.keyAlias,
            sourceSystem: normalized.sourceSystem,
            sourceIp: normalized.sourceIp,
            observedHourUtc: hourUtc,
            observedVolume: normalized.volumeCount,
            status: 'open',
            explainWhy: evaluation.factors,
            blastRadius: buildBlastRadiusPreview({
              fingerprint: fp,
              targetActorId: fp.canonicalActorId,
              targetLabel: fp.keyAlias,
              sourceIp: normalized.sourceIp,
            }),
            activeResponse: null,
            feedbackHistory: [],
            vaultSequence: alertVault.sequence,
            sourceVaultSequence: eventVaultEntry.sequence,
            logFileRef,
            logSnippet: normalized.redactedPayload,
            matchedIndicator: indicator,
            origin: meta?.origin ?? 'baseline',
            attackerAlias: meta?.attackerAlias,
            attackAction: meta?.attackAction,
            attackTarget: meta?.attackTarget ?? fp.keyAlias,
            resolvedAt: null,
            resolvedBy: null,
            resolutionNote: null,
          };
        }
      }
    }

    if (createdAlert) {
      this.dataPlane.alerts = [createdAlert, ...this.dataPlane.alerts];
      if (!meta?.suppressAutoNotification) {
        this.pushNotification({
          severity: createdAlert.severity,
          title: `${createdAlert.severity.toUpperCase()}: ${createdAlert.title}`,
          message: createdAlert.summary,
          alertId: createdAlert.id,
          vaultSequence: createdAlert.sourceVaultSequence,
          origin: createdAlert.origin,
          eventType:
            createdAlert.category === 'honey_trap'
              ? 'sentinel.honey_trap.triggered'
              : 'sentinel.fingerprint.anomaly',
        });
      }
    }

    this.saveToDisk();
    this.broadcast('state:updated', { reason: 'event_ingested', alertId: createdAlert?.id ?? null });

    return {
      normalized,
      alert: createdAlert,
      vaultSequence: eventVaultEntry.sequence,
    };
  }

  public createHoneyTrap(params: {
    kind: 'honey_key' | 'honey_vendor';
    label: string;
    plantedLocation: string;
  }): HoneyTrap {
    const suffix = crypto.randomBytes(2).toString('hex');
    const slug = params.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/honey|decoy|trap|bait|fake/g, '')
      .replace(/_+/g, '_')
      .slice(0, 12);
    const keySlug = slug && slug.length >= 2 ? slug : 'ops_svc';
    const identifier =
      params.kind === 'honey_key'
        ? `ak_${keySlug}_${suffix}`
        : `VND-9${Math.floor(1000 + Math.random() * 8999)}`;

    const trap: HoneyTrap = {
      id: `ht_${crypto.randomUUID().slice(0, 6)}`,
      kind: params.kind,
      label: params.label.trim(),
      identifier,
      tokenHash: hashApiKeyIdentifier(identifier, this.edgeSalt),
      plantedLocation:
        params.plantedLocation.trim() ||
        (params.kind === 'honey_key'
          ? 'Production env (api_keys_prod.env)'
          : 'ERP Vendor Master (vendor_master_registry.json)'),
      createdAt: new Date().toISOString(),
      triggerCount: 0,
      lastTriggeredAt: null,
      status: 'armed',
    };

    this.dataPlane.honeyTraps = [trap, ...this.dataPlane.honeyTraps];

    const entry = appendVaultEntry(this.dataPlane.vaultEntries, {
      entryType: 'honey_trap_created',
      actor: 'Security Operator',
      summary: `Planted stealth ${trap.kind === 'honey_key' ? 'honey key' : 'honey vendor'} "${trap.label}" (${trap.identifier}) into ${trap.plantedLocation}`,
      redactionsCount: 0,
      payloadForDigest: `${trap.id}|${trap.tokenHash}`,
      region: this.controlPlane.region,
      customerKeyFingerprint: this.controlPlane.customerKeyFingerprint,
    });
    this.dataPlane.vaultEntries.push(entry);

    this.saveToDisk();
    this.broadcast('state:updated', { reason: 'honey_trap_created', trapId: trap.id });
    return trap;
  }

  public unblockAttackerSession(
    sourceIp: string,
    operator = 'E. Vance (SecOps)',
  ): BlockedAttackerSession[] {
    const cleanIp = sourceIp.trim();
    const existing = (this.dataPlane.blockedSessions ?? []).find((b) => b.sourceIp === cleanIp);
    this.dataPlane.blockedSessions = (this.dataPlane.blockedSessions ?? []).filter(
      (b) => b.sourceIp !== cleanIp,
    );

    if (existing) {
      const entry = appendVaultEntry(this.dataPlane.vaultEntries, {
        entryType: 'response_undone',
        actor: operator,
        summary: `Released honey-trap IP quarantine for ${cleanIp} (handle: ${existing.attackerAlias}, trap: ${existing.trapIdentifier})`,
        redactionsCount: 0,
        payloadForDigest: `unblock|${cleanIp}|${existing.trapId}`,
        region: this.controlPlane.region,
        customerKeyFingerprint: this.controlPlane.customerKeyFingerprint,
        sourceIp: cleanIp,
        matchedIndicator: `Quarantine released by ${operator}`,
      });
      this.dataPlane.vaultEntries.push(entry);

      this.pushNotification({
        severity: 'low',
        title: `Trap Quarantine Released: ${cleanIp}`,
        message: `${operator} unblocked quarantined session ${existing.attackerAlias} (${cleanIp}). Recorded in Vault #${entry.sequence}.`,
        alertId: existing.alertId,
        vaultSequence: entry.sequence,
        eventType: 'sentinel.quarantine.released',
      });

      this.saveToDisk();
      this.broadcast('state:updated', { reason: 'attacker_unblocked', sourceIp: cleanIp });
    }
    return this.dataPlane.blockedSessions;
  }

  public triggerHoneyTrap(trapId: string, sourceIp = '194.26.135.88'): SecurityAlert {
    const trap = this.dataPlane.honeyTraps.find((t) => t.id === trapId);
    if (!trap) {
      throw new Error(`Honey trap ${trapId} not found`);
    }

    const result = this.ingestEvent({
      sourceSystem: trap.kind === 'honey_key' ? 'API Gateway Edge' : 'ERP Vendor Master',
      rawTimestamp: new Date().toISOString(),
      clockSkewMs: 0,
      rawActor: trap.kind === 'honey_key' ? trap.identifier : 'external-erp-client',
      action: trap.kind === 'honey_key' ? 'api.auth.attempt' : 'vendor.bank_details.query',
      sourceIp,
      endpoint: trap.kind === 'honey_key' ? '/v1/secrets/export' : `/v1/vendors/${trap.identifier}`,
      volumeCount: 1,
      targetVendorId: trap.kind === 'honey_vendor' ? trap.identifier : undefined,
      apiKeyHash: trap.kind === 'honey_key' ? trap.tokenHash : undefined,
      rawPayload:
        trap.kind === 'honey_key'
          ? `Unauthorized bearer call using decoy key ${trap.identifier} from ${sourceIp}`
          : `Read/update attempted against decoy vendor ${trap.identifier} (${trap.label})`,
    });

    if (!result.alert) {
      throw new Error('Honey trap trigger did not produce an alert');
    }

    return result.alert;
  }

  public submitAlertFeedback(
    alertId: string,
    decision: 'approve' | 'dismiss',
    operator = 'E. Vance (SecOps)',
    note = '',
  ): SecurityAlert {
    const alert = this.dataPlane.alerts.find((a) => a.id === alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    const fpIdx = this.dataPlane.fingerprints.findIndex(
      (f) => f.canonicalActorId === alert.canonicalActorId,
    );
    if (fpIdx >= 0) {
      this.dataPlane.fingerprints[fpIdx] = applyFingerprintFeedback(
        this.dataPlane.fingerprints[fpIdx],
        alert,
        decision,
      );
    }

    alert.feedbackHistory.push({
      decision,
      operator,
      note:
        note.trim() ||
        (decision === 'dismiss'
          ? 'Marked expected; baseline updated to reduce future false alarms.'
          : 'Confirmed unauthorized activity.'),
      timestamp: new Date().toISOString(),
    });

    if (decision === 'dismiss') {
      alert.status = 'dismissed';
    }

    const entry = appendVaultEntry(this.dataPlane.vaultEntries, {
      entryType: 'operator_feedback',
      actor: operator,
      summary: `${decision === 'approve' ? 'Confirmed' : 'Dismissed & learned'} alert ${alert.id} (${alert.actorLabel})`,
      redactionsCount: 0,
      payloadForDigest: `${alert.id}|${decision}|${note}`,
      region: this.controlPlane.region,
      customerKeyFingerprint: this.controlPlane.customerKeyFingerprint,
    });
    this.dataPlane.vaultEntries.push(entry);

    this.saveToDisk();
    this.broadcast('state:updated', { reason: 'feedback_recorded', alertId });
    return alert;
  }

  public executeResponse(
    alertId: string,
    optionId: string,
    operator = 'E. Vance (SecOps)',
  ): ResponseExecution {
    const alert = this.dataPlane.alerts.find((a) => a.id === alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    const option = alert.blastRadius.options.find((o) => o.id === optionId);
    if (!option) {
      throw new Error(`Response option ${optionId} not found`);
    }

    const fp = this.dataPlane.fingerprints.find(
      (f) => f.canonicalActorId === alert.canonicalActorId,
    );
    if (fp) {
      fp.status = option.mode === 'full_suspend' ? 'suspended' : 'scoped_restricted';
    }

    const vaultEntry = appendVaultEntry(this.dataPlane.vaultEntries, {
      entryType: 'response_executed',
      actor: operator,
      summary: `Executed ${option.mode === 'narrow_scoped' ? 'narrow scoped' : 'full suspend'} action on ${alert.actorLabel}: ${option.scopeSummary}`,
      redactionsCount: 0,
      payloadForDigest: `${alert.id}|${option.id}|${option.mode}`,
      region: this.controlPlane.region,
      customerKeyFingerprint: this.controlPlane.customerKeyFingerprint,
    });
    this.dataPlane.vaultEntries.push(vaultEntry);

    const execution: ResponseExecution = {
      id: `resp_${crypto.randomUUID().slice(0, 6)}`,
      alertId: alert.id,
      targetActorId: alert.canonicalActorId,
      mode: option.mode,
      actionSummary: option.scopeSummary,
      executedBy: operator,
      executedAt: new Date().toISOString(),
      undoneAt: null,
      undoneBy: null,
      vaultSequence: vaultEntry.sequence,
      undoVaultSequence: null,
    };

    alert.activeResponse = execution;
    alert.status = 'contained';

    // Update control drift assertion if payroll anomaly is contained
    if (alert.id === 'alt_payroll_03am') {
      const ctrl = this.dataPlane.assertions.find((c) => c.id === 'ctrl_01');
      if (ctrl) {
        ctrl.status = 'drifting';
        ctrl.observedReality = `Contained via scoped response (${option.scopeSummary}); awaiting permanent CIDR lock.`;
        ctrl.lastCheckedAt = new Date().toISOString();
      }
    }

    this.pushNotification({
      severity: 'medium',
      title: 'Response Connector: Action executed',
      message: `${option.scopeSummary} (Vault #${vaultEntry.sequence}, reversible via 1-click Undo).`,
      alertId: alert.id,
    });

    this.saveToDisk();
    this.broadcast('state:updated', { reason: 'response_executed', alertId });
    return execution;
  }

  public undoResponse(alertId: string, operator = 'E. Vance (SecOps)'): ResponseExecution {
    const alert = this.dataPlane.alerts.find((a) => a.id === alertId);
    if (!alert || !alert.activeResponse) {
      throw new Error(`No active response found on alert ${alertId}`);
    }
    if (alert.activeResponse.undoneAt) {
      return alert.activeResponse;
    }

    const fp = this.dataPlane.fingerprints.find(
      (f) => f.canonicalActorId === alert.canonicalActorId,
    );
    if (fp) {
      fp.status = 'active';
    }

    const undoEntry = appendVaultEntry(this.dataPlane.vaultEntries, {
      entryType: 'response_undone',
      actor: operator,
      summary: `Undid ${alert.activeResponse.mode} action on ${alert.actorLabel} (original Vault #${alert.activeResponse.vaultSequence})`,
      redactionsCount: 0,
      payloadForDigest: `undo|${alert.activeResponse.id}|${alert.id}`,
      region: this.controlPlane.region,
      customerKeyFingerprint: this.controlPlane.customerKeyFingerprint,
    });
    this.dataPlane.vaultEntries.push(undoEntry);

    alert.activeResponse.undoneAt = new Date().toISOString();
    alert.activeResponse.undoneBy = operator;
    alert.activeResponse.undoVaultSequence = undoEntry.sequence;
    alert.status = 'open';

    if (alert.id === 'alt_payroll_03am') {
      const ctrl = this.dataPlane.assertions.find((c) => c.id === 'ctrl_01');
      if (ctrl) {
        ctrl.status = 'violated';
        ctrl.observedReality = 'ak_payroll_prod accepted 194 requests at 03:14 UTC from external IP 185.220.101.44 (previous containment undone).';
        ctrl.lastCheckedAt = new Date().toISOString();
      }
    }

    this.pushNotification({
      severity: 'low',
      title: 'Response Connector: Action undone',
      message: `Rolled back containment on ${alert.actorLabel}. Both steps recorded in Vault #${alert.activeResponse.vaultSequence} & #${undoEntry.sequence}.`,
      alertId: alert.id,
    });

    this.saveToDisk();
    this.broadcast('state:updated', { reason: 'response_undone', alertId });
    return alert.activeResponse;
  }

  public resolvePaymentHold(
    holdId: string,
    decision: 'released_verified' | 'blocked_fraud',
    operator = 'M. Lindqvist (Controller)',
  ): PaymentHoldRecord {
    const hold = this.dataPlane.paymentHolds.find((h) => h.id === holdId);
    if (!hold) {
      throw new Error(`Payment hold ${holdId} not found`);
    }

    hold.status = decision;
    hold.decidedBy = operator;
    hold.decidedAt = new Date().toISOString();

    const entry = appendVaultEntry(this.dataPlane.vaultEntries, {
      entryType: 'payment_hold',
      actor: operator,
      summary:
        decision === 'blocked_fraud'
          ? `Blocked fraudulent bank change on ${hold.vendorName} (${hold.amountFormatted})`
          : `Verified callback and released payment hold for ${hold.vendorName} (${hold.amountFormatted})`,
      redactionsCount: 2,
      payloadForDigest: `${hold.id}|${decision}`,
      region: this.controlPlane.region,
      customerKeyFingerprint: this.controlPlane.customerKeyFingerprint,
    });
    this.dataPlane.vaultEntries.push(entry);

    if (hold.id === 'hold_44109') {
      const ctrl = this.dataPlane.assertions.find((c) => c.id === 'ctrl_02');
      if (ctrl) {
        ctrl.status = 'aligned';
        ctrl.observedReality = `Pre-payout bank change for ${hold.vendorName} resolved (${decision}) with dual-control audit entry #${entry.sequence}.`;
        ctrl.lastCheckedAt = new Date().toISOString();
      }
      const linkedAlert = this.dataPlane.alerts.find((a) => a.id === 'alt_payment_hold_01');
      if (linkedAlert) {
        linkedAlert.status = 'resolved';
      }
    }

    this.pushNotification({
      severity: decision === 'blocked_fraud' ? 'high' : 'low',
      title:
        decision === 'blocked_fraud'
          ? 'Payment-Run Guard: Fraudulent edit blocked'
          : 'Payment-Run Guard: Hold released',
      message: `${hold.vendorName} (${hold.amountFormatted}) marked ${decision.replace('_', ' ')} by ${operator}.`,
    });

    this.saveToDisk();
    this.broadcast('state:updated', { reason: 'payment_hold_updated', holdId });
    return hold;
  }

  public scanTicketForSecrets(params: {
    ticketId: string;
    ticketText: string;
    reporterSystem?: string;
  }): {
    ticketId: string;
    redactedText: string;
    findings: RedactionFinding[];
    alertCreated: SecurityAlert | null;
  } {
    const { redacted, findings } = redactTextAtEdge(
      params.ticketText,
      `ticket:${params.ticketId}`,
      this.edgeSalt,
    );

    this.dataPlane.stats.secretsMaskedAtEdge += findings.length;

    let alertCreated: SecurityAlert | null = null;
    if (findings.length > 0) {
      const logFileRef = `/var/log/harbor-finch/helpdesk-edge.log:${400 + this.dataPlane.vaultEntries.length}`;
      const indicator = `${findings.length} masked secret(s): ${findings.map((f) => f.kind).join(', ')}`;
      const vaultEntry = appendVaultEntry(this.dataPlane.vaultEntries, {
        entryType: 'alert_raised',
        actor: 'Sentinel Secrets-in-Tickets Scanner',
        summary: `Masked ${findings.length} secret/PII artifact(s) in ticket ${params.ticketId} at customer edge`,
        redactionsCount: findings.length,
        payloadForDigest: redacted,
        region: this.controlPlane.region,
        customerKeyFingerprint: this.controlPlane.customerKeyFingerprint,
        sourceSystem: params.reporterSystem || 'IT Service Desk',
        sourceIp: 'edge-scanner',
        endpoint: `/tickets/${params.ticketId}`,
        logFileRef,
        redactedSnippet: redacted,
        matchedIndicator: indicator,
      });
      this.dataPlane.vaultEntries.push(vaultEntry);

      alertCreated = {
        id: `alt_secret_${crypto.randomUUID().slice(0, 6)}`,
        createdAt: new Date().toISOString(),
        severity: findings.some((f) => f.kind === 'api_key' || f.kind === 'aws_key' || f.kind === 'jwt_bearer')
          ? 'high'
          : 'medium',
        confidence: 0.96,
        category: 'secret_in_ticket',
        title: `Credential or PII detected in ticket ${params.ticketId}`,
        summary: `Detected ${findings.length} sensitive item(s) (${[...new Set(findings.map((f) => f.kind))].join(', ')}). Masked at edge before storage; raw value was never persisted.`,
        canonicalActorId: `ticket_${params.ticketId}`,
        actorLabel: params.reporterSystem || 'Jira / Service Desk',
        sourceSystem: params.reporterSystem || 'IT Service Desk',
        sourceIp: 'edge-scanner',
        observedHourUtc: new Date().getUTCHours(),
        observedVolume: findings.length,
        status: 'open',
        explainWhy: findings.map((f) => ({
          dimension: 'secret_leak' as const,
          summary: `Detected ${f.kind} and replaced with deterministic hash ${f.previewMasked}`,
          expected: 'Zero plaintext credentials or PII in support tickets',
          observed: f.previewMasked,
          weight: 0.9,
        })),
        blastRadius: buildBlastRadiusPreview({
          targetActorId: `ticket_${params.ticketId}`,
          targetLabel: `Leaked credential in ${params.ticketId}`,
          sourceIp: 'edge-scanner',
          isHoneyTrap: true,
        }),
        activeResponse: null,
        feedbackHistory: [],
        vaultSequence: vaultEntry.sequence,
        sourceVaultSequence: vaultEntry.sequence,
        logFileRef,
        logSnippet: redacted,
        matchedIndicator: indicator,
        origin: 'baseline',
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
      };

      this.dataPlane.alerts = [alertCreated, ...this.dataPlane.alerts];
      this.pushNotification({
        severity: alertCreated.severity,
        title: `Secrets Scanner: ${params.ticketId}`,
        message: `Masked ${findings.length} sensitive artifact(s) at the edge. Rotation recommended.`,
        alertId: alertCreated.id,
      });
    }

    this.saveToDisk();
    this.broadcast('state:updated', { reason: 'ticket_scanned', findingsCount: findings.length });

    return {
      ticketId: params.ticketId,
      redactedText: redacted,
      findings,
      alertCreated,
    };
  }

  public generateEvidencePack(caseId: string) {
    const breachCase =
      this.dataPlane.breachClocks.find((b) => b.id === caseId) ?? this.dataPlane.breachClocks[0];
    if (!breachCase) {
      throw new Error('No breach clock case available');
    }
    const verification = verifyVaultChain(this.dataPlane.vaultEntries);
    return buildLegalEvidencePack({
      tenantName: this.controlPlane.tenantName,
      region: this.controlPlane.region,
      customerKmsKeyId: this.controlPlane.customerKmsKeyId,
      breachCase,
      vaultVerification: verification,
      recentVaultEntries: this.dataPlane.vaultEntries,
      alerts: this.dataPlane.alerts,
    });
  }

  public addWebhook(params: {
    name: string;
    provider: WebhookEndpoint['provider'];
    url: string;
    minSeverity: Severity;
  }): WebhookEndpoint {
    let parsed: URL;
    try {
      parsed = new URL(params.url.trim());
    } catch {
      throw new Error('Webhook URL must be a valid http:// or https:// address.');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Webhook URL must use http:// or https:// protocol.');
    }

    const endpoint: WebhookEndpoint = {
      id: `wh_${crypto.randomUUID().slice(0, 6)}`,
      name: params.name.trim(),
      provider: params.provider,
      url: parsed.toString(),
      signingSecretPreview: `${this.webhookSigningSecret.slice(0, 10)}…${this.webhookSigningSecret.slice(-4)}`,
      enabled: true,
      minSeverity: params.minSeverity,
      createdAt: new Date().toISOString(),
      lastDeliveryAt: null,
      lastStatusCode: null,
    };

    this.dataPlane.webhooks = [endpoint, ...this.dataPlane.webhooks];
    this.syncWebhookControlMeta();
    this.saveToDisk();
    this.broadcast('state:updated', { reason: 'webhook_added', webhookId: endpoint.id });
    return endpoint;
  }

  public updateWebhook(
    webhookId: string,
    patch: { enabled?: boolean; minSeverity?: Severity },
  ): WebhookEndpoint {
    const endpoint = this.dataPlane.webhooks.find((w) => w.id === webhookId);
    if (!endpoint) {
      throw new Error(`Webhook ${webhookId} not found`);
    }
    if (typeof patch.enabled === 'boolean') endpoint.enabled = patch.enabled;
    if (patch.minSeverity) endpoint.minSeverity = patch.minSeverity;
    this.syncWebhookControlMeta();
    this.saveToDisk();
    this.broadcast('state:updated', { reason: 'webhook_updated', webhookId });
    return endpoint;
  }

  public deleteWebhook(webhookId: string): void {
    const idx = this.dataPlane.webhooks.findIndex((w) => w.id === webhookId);
    if (idx < 0) {
      throw new Error(`Webhook ${webhookId} not found`);
    }
    this.dataPlane.webhooks.splice(idx, 1);
    this.syncWebhookControlMeta();
    this.saveToDisk();
    this.broadcast('state:updated', { reason: 'webhook_deleted', webhookId });
  }

  public async testWebhook(webhookId: string): Promise<WebhookDeliveryLog> {
    const endpoint = this.dataPlane.webhooks.find((w) => w.id === webhookId);
    if (!endpoint) {
      throw new Error(`Webhook ${webhookId} not found`);
    }
    const testNotif: PushNotificationEvent = {
      id: `notif_test_${crypto.randomUUID().slice(0, 6)}`,
      timestamp: new Date().toISOString(),
      severity: 'high',
      title: 'Signed Webhook Delivery Verification',
      message: `Live HMAC-SHA256 verification dispatched from Sentinel regional plane (${this.controlPlane.region}). Zero customer PII included.`,
      channel: 'webhook',
      read: false,
    };
    this.dataPlane.notifications = [testNotif, ...this.dataPlane.notifications].slice(0, 50);
    this.broadcast('notification:push', testNotif);
    return this.deliverToEndpoint(endpoint, testNotif, 'sentinel.webhook.test');
  }

  public updateNotificationPrefs(patch: Partial<NotificationPreferences>): NotificationPreferences {
    this.dataPlane.notificationPrefs = {
      ...this.dataPlane.notificationPrefs,
      ...patch,
    };
    this.saveToDisk();
    this.broadcast('state:updated', { reason: 'notification_prefs_updated' });
    return { ...this.dataPlane.notificationPrefs };
  }

  public markAllNotificationsRead(): void {
    this.dataPlane.notifications = this.dataPlane.notifications.map((n) => ({
      ...n,
      read: true,
    }));
    this.saveToDisk();
    this.broadcast('state:updated', { reason: 'notifications_read' });
  }

  public resolveAlert(
    alertId: string,
    operator = 'E. Vance (SecOps)',
    note = '',
  ): SecurityAlert {
    const alert = this.dataPlane.alerts.find((a) => a.id === alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    alert.status = 'resolved';
    alert.resolvedAt = new Date().toISOString();
    alert.resolvedBy = operator;
    alert.resolutionNote =
      note.trim() || 'Vulnerability investigated, verified in hash-chained vault, and resolved.';

    if (alert.id === 'alt_payroll_03am') {
      const ctrl = this.dataPlane.assertions.find((c) => c.id === 'ctrl_01');
      if (ctrl) {
        ctrl.status = 'aligned';
        ctrl.observedReality = `Resolved by ${operator}; CIDR restriction enforced and verified in log vault.`;
        ctrl.lastCheckedAt = new Date().toISOString();
      }
    }

    const entry = appendVaultEntry(this.dataPlane.vaultEntries, {
      entryType: 'alert_resolved',
      actor: operator,
      summary: `Resolved alert "${alert.title}" (${alert.actorLabel})`,
      redactionsCount: 0,
      payloadForDigest: `resolve|${alert.id}|${alert.resolutionNote}`,
      region: this.controlPlane.region,
      customerKeyFingerprint: this.controlPlane.customerKeyFingerprint,
      sourceSystem: alert.sourceSystem,
      sourceIp: alert.sourceIp,
      logFileRef: alert.logFileRef,
      redactedSnippet: alert.resolutionNote,
      matchedIndicator: `Resolved · ref Vault #${alert.sourceVaultSequence}`,
    });
    this.dataPlane.vaultEntries.push(entry);

    this.pushNotification({
      severity: 'low',
      title: `Resolved: ${alert.title}`,
      message: `${operator} marked this incident resolved (Vault #${entry.sequence}).`,
      alertId: alert.id,
    });

    this.saveToDisk();
    this.broadcast('state:updated', { reason: 'alert_resolved', alertId: alert.id });
    return alert;
  }

  /**
   * Cross-Device Manual Demo Attacker Portal handler:
   * - Intercepts already-quarantined sessions immediately (HTTP 403 TRAPPED & BLOCKED).
   * - Auto-detects stealth Honey Traps across ALL action types, immediately traps & blocks
   *   the attacker's source IP, raises a 99.9% critical alert, and awaits signed webhook dispatch.
   * - Guarantees exact alerts, WebSocket push, and signed webhook delivery for every live attack.
   */
  public async executeManualAttackerAction(params: {
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
  }) {
    const attackerAlias = params.attackerAlias?.trim() || 'remote-phone-shell';
    const sourceIp = params.sourceIp?.trim() || '185.220.101.88';
    const timestampForHour = (hr?: number) => {
      const d = new Date();
      if (typeof hr === 'number' && Number.isFinite(hr)) {
        d.setUTCHours(Math.max(0, Math.min(23, Math.floor(hr))), d.getUTCMinutes(), d.getUTCSeconds(), 0);
      }
      return d.toISOString();
    };

    const recordFeed = (entry: {
      target: string;
      outcome: 'detected' | 'blocked' | 'trapped_and_blocked' | 'executed';
      alertId: string | null;
      vaultSequence: number;
      summary: string;
    }) => {
      const rec = {
        id: `atk_${crypto.randomUUID().slice(0, 6)}`,
        timestamp: new Date().toISOString(),
        attackerAlias,
        sourceIp,
        actionType: params.actionType,
        ...entry,
      };
      this.dataPlane.attackerFeed = [rec, ...(this.dataPlane.attackerFeed ?? [])].slice(0, 30);
      this.saveToDisk();
      this.broadcast('state:updated', { reason: 'attacker_action', actionId: rec.id, alertId: rec.alertId });
      return rec;
    };

    // 0. Check if this attacker IP is ALREADY trapped & quarantined by a honey trap
    const existingBlock = (this.dataPlane.blockedSessions ?? []).find(
      (b) => b.sourceIp === sourceIp,
    );
    if (existingBlock) {
      const logFileRef = `/var/log/harbor-finch/edge-quarantine.log:${900 + this.dataPlane.vaultEntries.length * 2}`;
      const snippet = `DROP action=${params.actionType} actor=${attackerAlias} ip=${sourceIp} reason=HONEY_TRAP_QUARANTINE trap=${existingBlock.trapIdentifier}`;
      const vaultEntry = appendVaultEntry(this.dataPlane.vaultEntries, {
        entryType: 'response_executed',
        actor: 'Sentinel Edge Quarantine',
        summary: `Blocked quarantined intruder ${attackerAlias} (${sourceIp}) attempting ${params.actionType}`,
        redactionsCount: 0,
        payloadForDigest: snippet,
        region: this.controlPlane.region,
        customerKeyFingerprint: this.controlPlane.customerKeyFingerprint,
        sourceSystem: 'API Gateway Edge',
        sourceIp,
        endpoint: params.endpoint || '/v1/blocked',
        logFileRef,
        redactedSnippet: snippet,
        matchedIndicator: `Quarantined IP ${sourceIp} (tripped ${existingBlock.trapIdentifier})`,
      });
      this.dataPlane.vaultEntries.push(vaultEntry);

      const { webhookPromise } = this.pushNotification({
        severity: 'high',
        title: `BLOCKED RETRY: ${attackerAlias} (${sourceIp})`,
        message: `Quarantined intruder attempted ${params.actionType} and was hard-blocked at edge (tripped trap ${existingBlock.trapIdentifier}, Vault #${vaultEntry.sequence}).`,
        alertId: existingBlock.alertId,
        vaultSequence: vaultEntry.sequence,
        origin: 'manual_attacker',
        eventType: 'sentinel.attacker.blocked_retry',
      });
      const webhookDeliveries = await webhookPromise;

      const rec = recordFeed({
        target: params.targetKeyAlias || params.vendorId || params.fileId || existingBlock.trapIdentifier,
        outcome: 'trapped_and_blocked',
        alertId: existingBlock.alertId,
        vaultSequence: vaultEntry.sequence,
        summary: `Hard-blocked at edge — ${sourceIp} is quarantined from tripping ${existingBlock.trapIdentifier}`,
      });
      return {
        record: rec,
        alert: this.dataPlane.alerts.find((a) => a.id === existingBlock.alertId) ?? null,
        trapped: true,
        blocked: true,
        webhookDeliveries,
        terminalOutput: `HTTP 403 CONNECTION TERMINATED — Session ${sourceIp} is TRAPPED & BLOCKED by Sentinel Edge Quarantine (Vault #${vaultEntry.sequence}). Contact SecOps to release.`,
      };
    }

    // 1. Stealth Honey Trap Auto-Detection across ALL action types!
    const findMatchedTrap = (): HoneyTrap | undefined => {
      if (params.trapId) {
        const byId = this.dataPlane.honeyTraps.find((t) => t.id === params.trapId);
        if (byId) return byId;
      }
      if (params.targetKeyAlias) {
        const byKey = this.dataPlane.honeyTraps.find(
          (t) => t.kind === 'honey_key' && t.identifier === params.targetKeyAlias,
        );
        if (byKey) return byKey;
      }
      if (params.vendorId) {
        const byVendor = this.dataPlane.honeyTraps.find(
          (t) => t.kind === 'honey_vendor' && t.identifier === params.vendorId,
        );
        if (byVendor) return byVendor;
      }
      if (params.customPayload) {
        const byPayload = this.dataPlane.honeyTraps.find((t) =>
          params.customPayload!.includes(t.identifier),
        );
        if (byPayload) return byPayload;
      }
      if (params.actionType === 'touch_honey_trap') {
        return this.dataPlane.honeyTraps[0];
      }
      return undefined;
    };

    const matchedTrap = findMatchedTrap();
    if (matchedTrap) {
      const trap = matchedTrap;
      const nowIso = new Date().toISOString();
      const attemptedOp =
        params.actionType === 'mutate_api_key'
          ? `mutate API key (${params.mutationLabel?.trim() || 'scope_escalation'})`
          : params.actionType === 'create_anomaly'
            ? `API burst probe (${params.volumeCount ?? 120} req/hr)`
            : params.actionType === 'alter_vendor_bank'
              ? 'alter vendor bank payout details'
              : trap.kind === 'honey_key'
                ? 'authenticate with credential'
                : 'query vendor master record';

      const logFileRef =
        trap.kind === 'honey_key'
          ? `/var/log/harbor-finch/api-gateway-edge.log:${1400 + this.dataPlane.vaultEntries.length * 3}`
          : `/var/log/harbor-finch/erp-vendor-gateway.log:${1800 + this.dataPlane.vaultEntries.length * 3}`;

      const rawPayload =
        trap.kind === 'honey_key'
          ? `AUTH_DENIED_TRAP actor=${attackerAlias} op=${params.actionType} key=${trap.identifier} ip=${sourceIp} action=AUTO_QUARANTINE_BLOCK`
          : `VENDOR_TRAP_TRIPPED actor=${attackerAlias} op=${params.actionType} vendor=${trap.identifier} ip=${sourceIp} action=AUTO_QUARANTINE_BLOCK`;

      const ingested = this.ingestEvent(
        {
          sourceSystem: trap.kind === 'honey_key' ? 'API Gateway Edge' : 'ERP Vendor Master',
          rawTimestamp: nowIso,
          clockSkewMs: 0,
          rawActor: trap.kind === 'honey_key' ? trap.identifier : attackerAlias,
          action: trap.kind === 'honey_key' ? 'api.auth.trap_tripped' : 'vendor.record.trap_tripped',
          sourceIp,
          endpoint:
            trap.kind === 'honey_key'
              ? params.endpoint?.trim() || `/v1/auth/verify/${trap.identifier}`
              : `/v1/vendors/${trap.identifier}`,
          volumeCount: params.volumeCount ?? 1,
          targetVendorId: trap.kind === 'honey_vendor' ? trap.identifier : undefined,
          apiKeyHash: trap.kind === 'honey_key' ? trap.tokenHash : undefined,
          rawPayload,
        },
        {
          logFileRef,
          origin: 'manual_attacker',
          customAlertTitle: `TRAPPED & BLOCKED: ${attackerAlias} touched ${trap.label} (${trap.identifier})`,
          attackerAlias,
          attackAction: attemptedOp,
          attackTarget: `${trap.label} (${trap.identifier})`,
          suppressAutoNotification: true,
        },
      );

      const alert = ingested.alert;
      if (!alert) {
        throw new Error('Stealth honey trap failed to raise alert');
      }

      // Immediately quarantine & auto-block the attacker session
      alert.trappedAndBlocked = true;
      alert.confidence = 0.999;
      alert.status = 'contained';
      alert.summary = `Intruder "${attackerAlias}" (${sourceIp}) attempted to ${attemptedOp} on stealth honey ${
        trap.kind === 'honey_key' ? 'key' : 'vendor'
      } ${trap.identifier} (${trap.plantedLocation}). Session was IMMEDIATELY TRAPPED & BLOCKED at edge.`;

      const quarantineVault = appendVaultEntry(this.dataPlane.vaultEntries, {
        entryType: 'response_executed',
        actor: 'Sentinel Auto-Trap Containment',
        summary: `Immediately trapped & quarantined ${attackerAlias} (${sourceIp}) after hitting stealth trap ${trap.identifier}`,
        redactionsCount: 0,
        payloadForDigest: `trap_block|${trap.id}|${sourceIp}|${attackerAlias}`,
        region: this.controlPlane.region,
        customerKeyFingerprint: this.controlPlane.customerKeyFingerprint,
        sourceSystem: alert.sourceSystem,
        sourceIp,
        endpoint: alert.logFileRef,
        logFileRef,
        redactedSnippet: rawPayload,
        matchedIndicator: `TRAPPED & BLOCKED · ${trap.identifier} (${sourceIp})`,
      });
      this.dataPlane.vaultEntries.push(quarantineVault);

      alert.activeResponse = {
        id: `resp_trap_${crypto.randomUUID().slice(0, 6)}`,
        alertId: alert.id,
        targetActorId: trap.id,
        mode: 'full_suspend',
        actionSummary: `Auto-trapped & hard-blocked ${sourceIp} (${attackerAlias}) at edge gateway upon honey trap contact`,
        executedBy: 'Sentinel Auto-Trap Containment',
        executedAt: nowIso,
        undoneAt: null,
        undoneBy: null,
        vaultSequence: quarantineVault.sequence,
        undoVaultSequence: null,
      };

      const blockedRecord: BlockedAttackerSession = {
        sourceIp,
        attackerAlias,
        trapId: trap.id,
        trapLabel: trap.label,
        trapIdentifier: trap.identifier,
        blockedAt: nowIso,
        vaultSequence: alert.sourceVaultSequence,
        alertId: alert.id,
        reason: `Touched stealth honey ${trap.kind === 'honey_key' ? 'key' : 'vendor'} ${trap.identifier} via ${attemptedOp}`,
      };
      this.dataPlane.blockedSessions = [
        blockedRecord,
        ...(this.dataPlane.blockedSessions ?? []).filter((b) => b.sourceIp !== sourceIp),
      ];

      const { webhookPromise } = this.pushNotification({
        severity: 'critical',
        title: `TRAPPED & BLOCKED: ${attackerAlias} hit ${trap.identifier}`,
        message: `Intruder ${attackerAlias} (${sourceIp}) tried to ${attemptedOp} on stealth trap "${trap.label}". Connection terminated & IP quarantined (Vault #${alert.sourceVaultSequence}).`,
        alertId: alert.id,
        vaultSequence: alert.sourceVaultSequence,
        origin: 'manual_attacker',
        eventType: 'sentinel.honey_trap.trapped_and_blocked',
      });
      const webhookDeliveries = await webhookPromise;

      const rec = recordFeed({
        target: trap.identifier,
        outcome: 'trapped_and_blocked',
        alertId: alert.id,
        vaultSequence: alert.sourceVaultSequence,
        summary: `TRAPPED & BLOCKED — ${attackerAlias} (${sourceIp}) touched ${trap.identifier} (${attemptedOp})`,
      });

      return {
        record: rec,
        alert,
        trapped: true,
        blocked: true,
        webhookDeliveries,
        terminalOutput: `HTTP 403 CONNECTION TERMINATED — TRAPPED & BLOCKED BY SENTINEL. Asset ${trap.identifier} triggered immediate session quarantine for ${sourceIp} (Vault #${alert.sourceVaultSequence}).`,
      };
    }

    // 2. Vendor Bank Account Modification -> Payment-Run Guard freeze + exact webhook push
    if (params.actionType === 'alter_vendor_bank') {
      const vendorId = params.vendorId?.trim() || 'VND-31002';
      const vendorName =
        vendorId === 'VND-44109'
          ? 'Northstar Legal Print Ltd'
          : vendorId === 'VND-31002'
            ? 'Thames Discovery Hosting'
            : `Vendor ${vendorId}`;
      const newIbanRaw = 'GB94BARC20201530093459';
      const { redacted } = redactTextAtEdge(
        `PUT /v1/vendors/${vendorId}/bank-account actor=${attackerAlias} ip=${sourceIp} new_iban=${newIbanRaw} amount=£29,450.00`,
        `attacker:vendor:${vendorId}`,
        this.edgeSalt,
      );
      const logFileRef = `/var/log/harbor-finch/ap-vendor-audit.log:${510 + this.dataPlane.vaultEntries.length}`;
      const vaultEntry = appendVaultEntry(this.dataPlane.vaultEntries, {
        entryType: 'payment_hold',
        actor: `Intruder Session (${attackerAlias})`,
        summary: `Unauthorized bank-detail edit attempted on ${vendorName} (${vendorId}) from ${sourceIp}`,
        redactionsCount: 1,
        payloadForDigest: redacted,
        region: this.controlPlane.region,
        customerKeyFingerprint: this.controlPlane.customerKeyFingerprint,
        sourceSystem: 'Accounts Payable ERP',
        sourceIp,
        endpoint: `/v1/vendors/${vendorId}/bank-account`,
        logFileRef,
        redactedSnippet: redacted,
        matchedIndicator: `Off-CIDR IBAN modification on ${vendorId} (${sourceIp})`,
      });
      this.dataPlane.vaultEntries.push(vaultEntry);

      const hold: PaymentHoldRecord = {
        id: `hold_${crypto.randomUUID().slice(0, 6)}`,
        vendorId,
        vendorName,
        payoutDate: new Date(Date.now() + 18 * 3_600_000).toISOString().slice(0, 10),
        hoursUntilPayout: 18,
        amountFormatted: vendorId === 'VND-44109' ? '£84,200.00' : '£29,450.00',
        requestedBy: `${attackerAlias} (${sourceIp})`,
        sourceIp,
        maskedOldAccount: '[REDACTED:IBAN#11c9e442b9a1]',
        maskedNewAccount: '[REDACTED:IBAN#f91e04b7c218]',
        status: 'held_for_review',
        detectedAt: new Date().toISOString(),
        decidedBy: null,
        decidedAt: null,
      };
      this.dataPlane.paymentHolds = [hold, ...this.dataPlane.paymentHolds];

      const alert: SecurityAlert = {
        id: `alt_pay_${crypto.randomUUID().slice(0, 6)}`,
        createdAt: new Date().toISOString(),
        severity: 'critical',
        confidence: 0.96,
        category: 'payment_guard',
        title: `LIVE ATTACK: Bank-account diversion on ${vendorName} (${vendorId})`,
        summary: `Intruder "${attackerAlias}" (${sourceIp}) attempted to redirect ${vendorName} (${vendorId}) payout IBAN 18h before settlement. Payment-Run Guard froze the payout.`,
        canonicalActorId: 'actor_ap_portal',
        actorLabel: `AP Vendor Portal (${vendorId})`,
        sourceSystem: 'Accounts Payable ERP',
        sourceIp,
        observedHourUtc: new Date().getUTCHours(),
        observedVolume: 1,
        status: 'open',
        explainWhy: [
          {
            dimension: 'payment_window',
            summary: `Bank account modified 18h prior to payout run (${hold.amountFormatted})`,
            expected: '48-hour freeze + dual-control approval before BACS payout',
            observed: `External request by ${attackerAlias} from ${sourceIp}`,
            weight: 0.65,
          },
          {
            dimension: 'source_ip',
            summary: `Submitted from unapproved external address ${sourceIp}`,
            expected: '198.51.100.0/24 corporate office egress',
            observed: sourceIp,
            weight: 0.35,
          },
        ],
        blastRadius: buildBlastRadiusPreview({
          targetActorId: 'actor_ap_portal',
          targetLabel: `${vendorId} Payout Hold`,
          sourceIp,
        }),
        activeResponse: null,
        feedbackHistory: [],
        vaultSequence: vaultEntry.sequence,
        sourceVaultSequence: vaultEntry.sequence,
        logFileRef,
        logSnippet: redacted,
        matchedIndicator: `IBAN change on ${vendorId} by ${attackerAlias} (${sourceIp})`,
        origin: 'manual_attacker',
        attackerAlias,
        attackAction: 'alter_vendor_bank',
        attackTarget: `${vendorName} (${vendorId})`,
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
      };
      this.dataPlane.alerts = [alert, ...this.dataPlane.alerts];

      const { webhookPromise } = this.pushNotification({
        severity: 'critical',
        title: `LIVE ATTACK · Payment Guard: ${vendorName} (${vendorId})`,
        message: `${attackerAlias} (${sourceIp}) tried to divert ${hold.amountFormatted} payout IBAN — auto-frozen at ${logFileRef} (Vault #${vaultEntry.sequence}).`,
        alertId: alert.id,
        vaultSequence: vaultEntry.sequence,
        origin: 'manual_attacker',
        eventType: 'sentinel.attacker.payment_diversion',
      });
      const webhookDeliveries = await webhookPromise;

      const rec = recordFeed({
        target: `${vendorId} IBAN`,
        outcome: 'blocked',
        alertId: alert.id,
        vaultSequence: vaultEntry.sequence,
        summary: `Attempted to redirect ${vendorName} payout IBAN — frozen by Payment-Run Guard`,
      });
      return {
        record: rec,
        alert,
        trapped: false,
        blocked: false,
        webhookDeliveries,
        terminalOutput: `HTTP 423 Locked — Bank-account modification for ${vendorId} intercepted by Sentinel Payment-Run Guard (Vault #${vaultEntry.sequence})`,
      };
    }

    // 3. Inject Ticket Secret -> Edge Redactor + exact alert + awaited webhook push
    if (params.actionType === 'inject_ticket_secret') {
      const ticketId = `HD-${Math.floor(4850 + Math.random() * 140)}`;
      const ticketText =
        params.customPayload?.trim() ||
        `Escalating access sync for ${attackerAlias}@external.io using token sk_live_exfil_${crypto.randomBytes(4).toString('hex')} on payroll runner`;
      const { redacted, findings } = redactTextAtEdge(
        ticketText,
        `ticket:${ticketId}`,
        this.edgeSalt,
      );
      this.dataPlane.stats.secretsMaskedAtEdge += findings.length;

      const logFileRef = `/var/log/harbor-finch/helpdesk-edge.log:${400 + this.dataPlane.vaultEntries.length}`;
      const indicator =
        findings.length > 0
          ? `${findings.length} masked secret(s): ${findings.map((f) => f.kind).join(', ')}`
          : `Suspicious ticket injection from ${attackerAlias} (${sourceIp})`;

      const vaultEntry = appendVaultEntry(this.dataPlane.vaultEntries, {
        entryType: 'alert_raised',
        actor: `Intruder Session (${attackerAlias})`,
        summary: `Ticket ${ticketId} injected from ${sourceIp} — ${findings.length} secret(s) masked at edge`,
        redactionsCount: findings.length,
        payloadForDigest: redacted,
        region: this.controlPlane.region,
        customerKeyFingerprint: this.controlPlane.customerKeyFingerprint,
        sourceSystem: 'IT Service Desk',
        sourceIp,
        endpoint: `/tickets/${ticketId}`,
        logFileRef,
        redactedSnippet: redacted,
        matchedIndicator: indicator,
      });
      this.dataPlane.vaultEntries.push(vaultEntry);

      const alert: SecurityAlert = {
        id: `alt_secret_${crypto.randomUUID().slice(0, 6)}`,
        createdAt: new Date().toISOString(),
        severity: 'high',
        confidence: 0.96,
        category: 'secret_in_ticket',
        title: `LIVE ATTACK: Secret/PII injected in ticket ${ticketId}`,
        summary: `Intruder "${attackerAlias}" (${sourceIp}) posted sensitive payload into ${ticketId}. Sentinel masked ${findings.length} secret(s) at the edge before storage.`,
        canonicalActorId: `ticket_${ticketId}`,
        actorLabel: `IT Service Desk (${ticketId})`,
        sourceSystem: 'IT Service Desk',
        sourceIp,
        observedHourUtc: new Date().getUTCHours(),
        observedVolume: Math.max(1, findings.length),
        status: 'open',
        explainWhy:
          findings.length > 0
            ? findings.map((f) => ({
                dimension: 'secret_leak' as const,
                summary: `Detected ${f.kind} and replaced with hash ${f.previewMasked}`,
                expected: 'Zero plaintext credentials or PII in support tickets',
                observed: f.previewMasked,
                weight: 0.9,
              }))
            : [
                {
                  dimension: 'secret_leak' as const,
                  summary: `Unauthorized ticket payload injected by ${attackerAlias} (${sourceIp})`,
                  expected: 'Authenticated corporate helpdesk session',
                  observed: `${attackerAlias} @ ${sourceIp}`,
                  weight: 0.85,
                },
              ],
        blastRadius: buildBlastRadiusPreview({
          targetActorId: `ticket_${ticketId}`,
          targetLabel: `Leaked credential in ${ticketId}`,
          sourceIp,
          isHoneyTrap: true,
        }),
        activeResponse: null,
        feedbackHistory: [],
        vaultSequence: vaultEntry.sequence,
        sourceVaultSequence: vaultEntry.sequence,
        logFileRef,
        logSnippet: redacted,
        matchedIndicator: indicator,
        origin: 'manual_attacker',
        attackerAlias,
        attackAction: 'inject_ticket_secret',
        attackTarget: ticketId,
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
      };
      this.dataPlane.alerts = [alert, ...this.dataPlane.alerts];

      const { webhookPromise } = this.pushNotification({
        severity: 'high',
        title: `LIVE ATTACK · Ticket Secret (${ticketId})`,
        message: `${attackerAlias} (${sourceIp}) injected secret into ${ticketId} — ${findings.length} masked at edge (${logFileRef}, Vault #${vaultEntry.sequence}).`,
        alertId: alert.id,
        vaultSequence: vaultEntry.sequence,
        origin: 'manual_attacker',
        eventType: 'sentinel.attacker.ticket_secret',
      });
      const webhookDeliveries = await webhookPromise;

      const rec = recordFeed({
        target: ticketId,
        outcome: 'detected',
        alertId: alert.id,
        vaultSequence: vaultEntry.sequence,
        summary: `Posted credential payload in ${ticketId} — masked at edge (${findings.length} secret(s))`,
      });
      return {
        record: rec,
        alert,
        trapped: false,
        blocked: false,
        webhookDeliveries,
        terminalOutput: `Ticket ${ticketId} created — Sentinel Edge Redactor stripped ${findings.length} credential(s) before storage (Vault #${vaultEntry.sequence}).`,
      };
    }

    // 4. mutate_api_key, create_anomaly, or access_file -> Fingerprint pipeline + GUARANTEED exact alert & awaited webhook
    const fp =
      this.dataPlane.fingerprints.find((f) => f.keyAlias === params.targetKeyAlias) ??
      this.dataPlane.fingerprints[0];

    const isKeyContained = fp.status === 'suspended' || fp.status === 'scoped_restricted';

    const hourUtc =
      typeof params.hourUtc === 'number'
        ? params.hourUtc
        : params.actionType === 'create_anomaly'
          ? 2
          : 3;
    const volumeCount =
      typeof params.volumeCount === 'number' && params.volumeCount > 0
        ? params.volumeCount
        : params.actionType === 'mutate_api_key'
          ? 145
          : params.actionType === 'access_file'
            ? 210
            : 120;

    const fileTarget = this.dataPlane.demoFiles?.find((f) => f.id === params.fileId);
    const mutationLabel = params.mutationLabel?.trim() || 'scope_escalation:payroll:write_all';
    const endpoint =
      params.endpoint?.trim() ||
      (params.actionType === 'mutate_api_key'
        ? `/v2/iam/keys/${fp.keyAlias}/scopes`
        : params.actionType === 'access_file'
          ? `/v2/files/export/${fileTarget?.name ?? 'payroll_disbursement_nov.csv'}`
          : '/v2/export/unusual-query');

    const rawPayload =
      params.customPayload?.trim() ||
      (params.actionType === 'mutate_api_key'
        ? `PATCH ${endpoint} actor=${attackerAlias} mutation=${mutationLabel} token=${fp.keyAlias} ip=${sourceIp} status=${isKeyContained ? 'DENIED_CONTAINED' : '200_OK'}`
        : params.actionType === 'access_file'
          ? `GET ${endpoint} actor=${attackerAlias} file=${fileTarget?.path ?? '/srv/harbor-finch/finance/payroll_disbursement_nov.csv'} rows=412 contact=payroll-admin@harborfinch.co.uk`
          : `POST ${endpoint} actor=${attackerAlias} key=${fp.keyAlias} burst=${volumeCount}req/hr at ${String(hourUtc).padStart(2, '0')}:00Z from ${sourceIp}`);

    const targetLabel =
      params.actionType === 'access_file'
        ? fileTarget?.name ?? 'payroll_disbursement_nov.csv'
        : fp.keyAlias;

    const customAlertTitle =
      params.actionType === 'mutate_api_key'
        ? `LIVE ATTACK: API key tampered — ${fp.keyAlias} (${mutationLabel})`
        : params.actionType === 'access_file'
          ? `LIVE ATTACK: Company file exfiltrated — ${targetLabel}`
          : `LIVE ATTACK: Manual anomaly on ${fp.keyAlias} (${volumeCount} req/hr @ ${String(hourUtc).padStart(2, '0')}:00 UTC)`;

    const logFileRef =
      params.actionType === 'mutate_api_key'
        ? `/var/log/harbor-finch/iam-keys.log:${2100 + this.dataPlane.vaultEntries.length * 3}`
        : params.actionType === 'access_file'
          ? `/var/log/harbor-finch/file-gateway.log:${4300 + this.dataPlane.vaultEntries.length * 3}`
          : `/var/log/harbor-finch/api-gateway.log:${7200 + this.dataPlane.vaultEntries.length * 3}`;

    const result = this.ingestEvent(
      {
        sourceSystem: fp.system,
        rawTimestamp: timestampForHour(hourUtc),
        clockSkewMs: 1450,
        rawActor: fp.keyAlias,
        action:
          params.actionType === 'mutate_api_key'
            ? 'iam.api_key.mutate'
            : params.actionType === 'access_file'
              ? 'file.sensitive.export'
              : 'api.anomaly.burst',
        sourceIp,
        endpoint,
        volumeCount,
        rawPayload,
      },
      {
        logFileRef,
        origin: 'manual_attacker',
        customAlertTitle,
        attackerAlias,
        attackAction:
          params.actionType === 'mutate_api_key'
            ? `mutate_api_key (${mutationLabel})`
            : params.actionType,
        attackTarget: targetLabel,
        suppressAutoNotification: true,
      },
    );

    // Guarantee an exact SecurityAlert even if attacker picked a mild volume or business hour
    let exactAlert = result.alert;
    if (!exactAlert) {
      const alertVault = appendVaultEntry(this.dataPlane.vaultEntries, {
        entryType: 'alert_raised',
        actor: 'Sentinel Behavioral Detector',
        summary: `${customAlertTitle} by ${attackerAlias} (${sourceIp})`,
        redactionsCount: result.normalized.redactions.length,
        payloadForDigest: `${params.actionType}|${targetLabel}|${sourceIp}|${attackerAlias}`,
        region: this.controlPlane.region,
        customerKeyFingerprint: this.controlPlane.customerKeyFingerprint,
        sourceSystem: fp.system,
        sourceIp,
        endpoint,
        logFileRef,
        redactedSnippet: result.normalized.redactedPayload,
        matchedIndicator: `${params.actionType} on ${targetLabel} from ${sourceIp}`,
      });
      this.dataPlane.vaultEntries.push(alertVault);

      exactAlert = {
        id: `alt_atk_${crypto.randomUUID().slice(0, 6)}`,
        createdAt: new Date().toISOString(),
        severity: params.actionType === 'mutate_api_key' ? 'critical' : 'high',
        confidence: 0.93,
        category: 'fingerprint_anomaly',
        title: customAlertTitle,
        summary: `Intruder "${attackerAlias}" (${sourceIp}) executed ${params.actionType} targeting ${targetLabel} at ${String(hourUtc).padStart(2, '0')}:00 UTC (${volumeCount} req/hr).`,
        canonicalActorId: fp.canonicalActorId,
        actorLabel: fp.keyAlias,
        sourceSystem: fp.system,
        sourceIp,
        observedHourUtc: hourUtc,
        observedVolume: volumeCount,
        status: 'open',
        explainWhy: [
          {
            dimension: 'endpoint',
            summary: `Unauthorized ${params.actionType} targeting ${endpoint} by ${attackerAlias}`,
            expected: `Normal learned baseline for ${fp.keyAlias}`,
            observed: `${params.actionType} · ${volumeCount} req/hr from ${sourceIp}`,
            weight: 0.92,
          },
        ],
        blastRadius: buildBlastRadiusPreview({
          fingerprint: fp,
          targetActorId: fp.canonicalActorId,
          targetLabel: fp.keyAlias,
          sourceIp,
        }),
        activeResponse: null,
        feedbackHistory: [],
        vaultSequence: alertVault.sequence,
        sourceVaultSequence: result.vaultSequence,
        logFileRef,
        logSnippet: result.normalized.redactedPayload,
        matchedIndicator: `${params.actionType} on ${targetLabel} (${sourceIp})`,
        origin: 'manual_attacker',
        attackerAlias,
        attackAction:
          params.actionType === 'mutate_api_key'
            ? `mutate_api_key (${mutationLabel})`
            : params.actionType,
        attackTarget: targetLabel,
        resolvedAt: null,
        resolvedBy: null,
        resolutionNote: null,
      };
      this.dataPlane.alerts = [exactAlert, ...this.dataPlane.alerts];
    } else {
      exactAlert.summary = `Intruder "${attackerAlias}" (${sourceIp}) executed ${
        params.actionType === 'mutate_api_key'
          ? `API key mutation (${mutationLabel})`
          : params.actionType === 'access_file'
            ? `file exfiltration on ${targetLabel}`
            : `anomaly burst (${volumeCount} req/hr)`
      } · ${exactAlert.summary}`;
    }

    const { webhookPromise } = this.pushNotification({
      severity: exactAlert.severity,
      title: exactAlert.title,
      message: `${attackerAlias} (${sourceIp}) → ${targetLabel} · Spotted at ${logFileRef} (Vault #${result.vaultSequence}).`,
      alertId: exactAlert.id,
      vaultSequence: result.vaultSequence,
      origin: 'manual_attacker',
      eventType: `sentinel.attacker.${params.actionType}`,
    });
    const webhookDeliveries = await webhookPromise;

    const rec = recordFeed({
      target: targetLabel,
      outcome: isKeyContained ? 'blocked' : 'detected',
      alertId: exactAlert.id,
      vaultSequence: result.vaultSequence,
      summary: isKeyContained
        ? `Blocked by active Sentinel containment on ${fp.keyAlias} (${sourceIp})`
        : `${customAlertTitle} — logged at ${logFileRef} (Vault #${result.vaultSequence})`,
    });

    return {
      record: rec,
      alert: exactAlert,
      trapped: false,
      blocked: isKeyContained,
      webhookDeliveries,
      terminalOutput: isKeyContained
        ? `HTTP 403 Blocked — Sentinel containment active on ${fp.keyAlias} (${fp.status}). Attempt logged at Vault #${result.vaultSequence}.`
        : `HTTP 200 Executed (${endpoint}) — Sentinel spotted exact activity at ${logFileRef} (Vault #${result.vaultSequence}), pushed real-time alert & dispatched ${webhookDeliveries.length} signed webhook(s).`,
    };
  }

  public resetToHarborAndFinchSeed(): SystemSnapshot {
    this.dataPlane = createSeedDataPlane(this.controlPlane, this.edgeSalt);
    this.syncWebhookControlMeta();
    this.saveToDisk();
    this.broadcast('state:updated', { reason: 'demo_reset' });
    return this.getSnapshot();
  }
}
