import express, { type Express } from 'express';
import path from 'node:path';
import { SentinelEngineStore, type RealtimeBroadcastFn } from '../core/store.ts';
import {
  getBreachDrillScenario,
  type BreachDrillStepExecutionResult,
} from '../core/breachDrill.ts';
import {
  createOrEditImageWithGemini,
  formatGeminiError,
  generateOrAnimateVideoWithGemini,
  runMapsGroundedQuery,
  runSentinelSecurityChat,
  transcribeAudioWithGemini,
  type SentinelChatModelMode,
  type SentinelChatTurn,
} from './gemini.ts';

function resolveSafeLocalStoragePath(rawPath: string | undefined, region: string): string {
  const fallback = `/tmp/sentinel-regional-${region}-v4.json`;
  const trimmed = (rawPath ?? '').trim();
  if (!trimmed) return fallback;
  // Reject object-storage URIs (e.g. s3://bucket, gs://bucket, https://...) or colon paths that create stray workspace dirs
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.includes(':')) {
    return fallback;
  }
  if (!path.isAbsolute(trimmed)) {
    return fallback;
  }
  return trimmed;
}

export interface CreateSentinelApiOptions {
  broadcast?: RealtimeBroadcastFn;
  getWsClientCount?: () => number;
}

export function createSentinelApiApp(options?: CreateSentinelApiOptions): {
  app: Express;
  store: SentinelEngineStore;
} {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // Ensure Firebase popup auth works cleanly across browsers, Netlify, and reverse proxies
  app.use((_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });

  // Normalize Netlify Function paths so both `/.netlify/functions/api/*`, `/api/*`,
  // and stripped `/*` paths resolve deterministically to `/api/*` with zero 404s.
  app.use((req, _res, next) => {
    if (req.url.startsWith('/.netlify/functions/api')) {
      const stripped = req.url.slice('/.netlify/functions/api'.length) || '/';
      req.url = stripped.startsWith('/api/') || stripped === '/api'
        ? stripped
        : `/api${stripped.startsWith('/') ? stripped : `/${stripped}`}`;
    } else if (
      process.env.NETLIFY &&
      !req.url.startsWith('/api/') &&
      req.url !== '/api' &&
      !req.url.startsWith('/assets/')
    ) {
      req.url = `/api${req.url.startsWith('/') ? req.url : `/${req.url}`}`;
    }
    next();
  });

  const configuredKmsKeyId =
    process.env.SENTINEL_BYOK_KEY_ID ||
    process.env.SENTINEL_CUSTOMER_KMS_KEY_ID ||
    'arn:aws:kms:ap-southeast-2:635224474982:key/7e88b489-ec3a-41f2-a86f-0a4aae156b76';
  const arnRegionMatch = /^arn:aws[^:]*:kms:([a-z0-9-]+):/i.exec(configuredKmsKeyId);
  const resolvedRegion =
    arnRegionMatch?.[1] || process.env.SENTINEL_REGION || 'ap-southeast-2';

  const store = new SentinelEngineStore({
    region: resolvedRegion,
    customerKmsKeyId: configuredKmsKeyId,
    edgeSalt: process.env.SENTINEL_EDGE_SALT || 'sentinel-harbor-finch-edge-hmac-salt-2026',
    webhookUrl: process.env.SENTINEL_WEBHOOK_URL || '',
    webhookSigningSecret:
      process.env.SENTINEL_WEBHOOK_SIGNING_SECRET || process.env.SENTINEL_WEBHOOK_SECRET,
    storageFilePath: resolveSafeLocalStoragePath(
      process.env.SENTINEL_STORAGE_PATH,
      resolvedRegion,
    ),
    broadcast: options?.broadcast ?? (() => {}),
  });

  // --- Sentinel Regional Data Plane & Control Plane REST APIs ---

  app.get('/api/health', (_req, res) => {
    const snap = store.getSnapshot();
    res.json({
      ok: true,
      region: snap.controlPlane.region,
      vaultValid: snap.vaultVerification.valid,
      wsClients: options?.getWsClientCount ? options.getWsClientCount() : 0,
      runtime: process.env.NETLIFY ? 'netlify-functions' : 'node-server',
    });
  });

  app.get('/api/snapshot', (_req, res) => {
    res.json(store.getSnapshot());
  });

  app.post('/api/ingest', (req, res) => {
    const body = req.body ?? {};
    if (!body.sourceSystem || !body.rawActor || !body.rawPayload) {
      res.status(400).json({
        error: 'sourceSystem, rawActor, and rawPayload are required.',
      });
      return;
    }

    try {
      const result = store.ingestEvent({
        sourceSystem: String(body.sourceSystem),
        rawTimestamp: body.rawTimestamp ? String(body.rawTimestamp) : new Date().toISOString(),
        clockSkewMs: typeof body.clockSkewMs === 'number' ? body.clockSkewMs : 0,
        rawActor: String(body.rawActor),
        action: body.action ? String(body.action) : 'api.request',
        sourceIp: body.sourceIp ? String(body.sourceIp) : '198.51.100.14',
        endpoint: body.endpoint ? String(body.endpoint) : '/v1/events',
        volumeCount: typeof body.volumeCount === 'number' ? body.volumeCount : 1,
        rawPayload: String(body.rawPayload),
        targetVendorId: body.targetVendorId ? String(body.targetVendorId) : undefined,
      });
      res.status(201).json({
        ...result,
        snapshot: store.getSnapshot(),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Ingestion failed' });
    }
  });

  app.post('/api/honey-traps', (req, res) => {
    const { kind, label, plantedLocation } = req.body ?? {};
    if (
      (kind !== 'honey_key' && kind !== 'honey_vendor') ||
      typeof label !== 'string' ||
      !label.trim() ||
      typeof plantedLocation !== 'string' ||
      !plantedLocation.trim()
    ) {
      res.status(400).json({
        error: 'Valid kind ("honey_key" or "honey_vendor"), label, and plantedLocation are required.',
      });
      return;
    }

    const trap = store.createHoneyTrap({ kind, label, plantedLocation });
    res.status(201).json({ trap, snapshot: store.getSnapshot() });
  });

  app.post('/api/honey-traps/:id/trigger', (req, res) => {
    try {
      const sourceIp =
        typeof req.body?.sourceIp === 'string' && req.body.sourceIp.trim()
          ? req.body.sourceIp.trim()
          : '194.26.135.88';
      const alert = store.triggerHoneyTrap(req.params.id, sourceIp);
      res.status(201).json({ alert, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Honey trap not found' });
    }
  });

  app.post('/api/alerts/:id/feedback', (req, res) => {
    const { decision, operator, note } = req.body ?? {};
    if (decision !== 'approve' && decision !== 'dismiss') {
      res.status(400).json({ error: 'decision must be "approve" or "dismiss".' });
      return;
    }
    try {
      const alert = store.submitAlertFeedback(
        req.params.id,
        decision,
        typeof operator === 'string' && operator.trim() ? operator.trim() : 'E. Vance (SecOps)',
        typeof note === 'string' ? note : '',
      );
      res.json({ alert, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Alert not found' });
    }
  });

  app.post('/api/alerts/:id/respond', (req, res) => {
    const { optionId, operator } = req.body ?? {};
    if (typeof optionId !== 'string' || !optionId.trim()) {
      res.status(400).json({ error: 'optionId is required.' });
      return;
    }
    try {
      const execution = store.executeResponse(
        req.params.id,
        optionId,
        typeof operator === 'string' && operator.trim() ? operator.trim() : 'E. Vance (SecOps)',
      );
      res.json({ execution, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Response failed' });
    }
  });

  app.post('/api/alerts/:id/undo', (req, res) => {
    const { operator } = req.body ?? {};
    try {
      const execution = store.undoResponse(
        req.params.id,
        typeof operator === 'string' && operator.trim() ? operator.trim() : 'E. Vance (SecOps)',
      );
      res.json({ execution, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Undo failed' });
    }
  });

  app.post('/api/alerts/:id/resolve', (req, res) => {
    const { operator, note } = req.body ?? {};
    try {
      const alert = store.resolveAlert(
        req.params.id,
        typeof operator === 'string' && operator.trim() ? operator.trim() : 'E. Vance (SecOps)',
        typeof note === 'string' ? note : '',
      );
      res.json({ alert, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Alert not found' });
    }
  });

  // --- Cross-Device Manual Demo Attacker Endpoints ---
  app.post('/api/attacker/action', async (req, res) => {
    const body = req.body ?? {};
    const validActions = new Set([
      'mutate_api_key',
      'create_anomaly',
      'access_file',
      'touch_honey_trap',
      'alter_vendor_bank',
      'inject_ticket_secret',
    ]);
    if (typeof body.actionType !== 'string' || !validActions.has(body.actionType)) {
      res.status(400).json({ error: 'Valid actionType is required.' });
      return;
    }
    try {
      const result = await store.executeManualAttackerAction({
        actionType: body.actionType,
        attackerAlias: typeof body.attackerAlias === 'string' ? body.attackerAlias : undefined,
        sourceIp: typeof body.sourceIp === 'string' ? body.sourceIp : undefined,
        targetKeyAlias: typeof body.targetKeyAlias === 'string' ? body.targetKeyAlias : undefined,
        mutationLabel: typeof body.mutationLabel === 'string' ? body.mutationLabel : undefined,
        hourUtc: typeof body.hourUtc === 'number' ? body.hourUtc : undefined,
        volumeCount: typeof body.volumeCount === 'number' ? body.volumeCount : undefined,
        endpoint: typeof body.endpoint === 'string' ? body.endpoint : undefined,
        fileId: typeof body.fileId === 'string' ? body.fileId : undefined,
        trapId: typeof body.trapId === 'string' ? body.trapId : undefined,
        vendorId: typeof body.vendorId === 'string' ? body.vendorId : undefined,
        customPayload: typeof body.customPayload === 'string' ? body.customPayload : undefined,
      });
      res.status(result.blocked ? 200 : 201).json({ ...result, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Attacker action failed' });
    }
  });

  app.post('/api/attacker/unblock', (req, res) => {
    const { sourceIp, operator } = req.body ?? {};
    if (typeof sourceIp !== 'string' || !sourceIp.trim()) {
      res.status(400).json({ error: 'sourceIp is required.' });
      return;
    }
    try {
      store.unblockAttackerSession(
        sourceIp.trim(),
        typeof operator === 'string' && operator.trim() ? operator.trim() : 'SecOps Admin',
      );
      res.json({ ok: true, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Blocked session not found' });
    }
  });

  app.post('/api/payment-holds/:id/decision', (req, res) => {
    const { decision, operator } = req.body ?? {};
    if (decision !== 'released_verified' && decision !== 'blocked_fraud') {
      res.status(400).json({
        error: 'decision must be "released_verified" or "blocked_fraud".',
      });
      return;
    }
    try {
      const hold = store.resolvePaymentHold(
        req.params.id,
        decision,
        typeof operator === 'string' && operator.trim()
          ? operator.trim()
          : 'M. Lindqvist (Controller)',
      );
      res.json({ hold, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Payment hold not found' });
    }
  });

  app.post('/api/secrets-scanner/scan', (req, res) => {
    const { ticketId, ticketText, reporterSystem } = req.body ?? {};
    if (typeof ticketText !== 'string' || !ticketText.trim()) {
      res.status(400).json({ error: 'ticketText is required.' });
      return;
    }
    const id =
      typeof ticketId === 'string' && ticketId.trim()
        ? ticketId.trim()
        : `HD-${Math.floor(1000 + Math.random() * 9000)}`;

    const result = store.scanTicketForSecrets({
      ticketId: id,
      ticketText,
      reporterSystem: typeof reporterSystem === 'string' ? reporterSystem : 'IT Service Desk',
    });
    res.status(201).json({ ...result, snapshot: store.getSnapshot() });
  });

  app.get('/api/evidence-pack/:caseId', (req, res) => {
    try {
      const pack = store.generateEvidencePack(req.params.caseId);
      res.json(pack);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Case not found' });
    }
  });

  app.post('/api/notifications/read-all', (_req, res) => {
    store.markAllNotificationsRead();
    res.json({ ok: true, snapshot: store.getSnapshot() });
  });

  app.patch('/api/notifications/preferences', (req, res) => {
    const { browserPushEnabled, soundChimeEnabled, minPushSeverity } = req.body ?? {};
    const patch: Record<string, unknown> = {};
    if (typeof browserPushEnabled === 'boolean') patch.browserPushEnabled = browserPushEnabled;
    if (typeof soundChimeEnabled === 'boolean') patch.soundChimeEnabled = soundChimeEnabled;
    if (
      minPushSeverity === 'low' ||
      minPushSeverity === 'medium' ||
      minPushSeverity === 'high' ||
      minPushSeverity === 'critical'
    ) {
      patch.minPushSeverity = minPushSeverity;
    }
    const prefs = store.updateNotificationPrefs(patch);
    res.json({ prefs, snapshot: store.getSnapshot() });
  });

  // --- Deploy-Ready Signed Webhook Management & Live Loopback Receiver ---
  app.post('/api/webhooks', (req, res) => {
    const { name, provider, url, minSeverity } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || typeof url !== 'string' || !url.trim()) {
      res.status(400).json({ error: 'Webhook name and valid http(s) URL are required.' });
      return;
    }
    const validProvider =
      provider === 'slack' ||
      provider === 'pagerduty' ||
      provider === 'teams' ||
      provider === 'generic_json' ||
      provider === 'sentinel_loopback'
        ? provider
        : 'generic_json';
    const validSeverity =
      minSeverity === 'low' ||
      minSeverity === 'medium' ||
      minSeverity === 'high' ||
      minSeverity === 'critical'
        ? minSeverity
        : 'medium';

    try {
      const endpoint = store.addWebhook({
        name,
        provider: validProvider,
        url,
        minSeverity: validSeverity,
      });
      res.status(201).json({ endpoint, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid webhook URL' });
    }
  });

  app.patch('/api/webhooks/:id', (req, res) => {
    const { enabled, minSeverity } = req.body ?? {};
    try {
      const endpoint = store.updateWebhook(req.params.id, {
        enabled: typeof enabled === 'boolean' ? enabled : undefined,
        minSeverity:
          minSeverity === 'low' ||
          minSeverity === 'medium' ||
          minSeverity === 'high' ||
          minSeverity === 'critical'
            ? minSeverity
            : undefined,
      });
      res.json({ endpoint, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Webhook not found' });
    }
  });

  app.delete('/api/webhooks/:id', (req, res) => {
    try {
      store.deleteWebhook(req.params.id);
      res.json({ ok: true, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Webhook not found' });
    }
  });

  app.post('/api/webhooks/:id/test', async (req, res) => {
    try {
      const delivery = await store.testWebhook(req.params.id);
      res.status(200).json({ delivery, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Webhook not found' });
    }
  });

  // Built-in signed receiver so operators can verify real HTTP HMAC-SHA256 webhook delivery out of the box
  app.post('/api/webhook-receiver', (req, res) => {
    const sig = String(req.headers['x-sentinel-signature-256'] ?? '');
    const ts = String(req.headers['x-sentinel-timestamp'] ?? '');
    const rawJson = JSON.stringify(req.body ?? {});
    const verified = store.verifyIncomingSignature(rawJson, ts, sig);
    if (!verified) {
      res.status(401).json({ accepted: false, signatureVerified: false, error: 'Invalid HMAC signature' });
      return;
    }
    res.status(200).json({
      accepted: true,
      signatureVerified: true,
      receivedAt: new Date().toISOString(),
      eventHeader: req.headers['x-sentinel-event'] ?? 'unknown',
    });
  });

  app.post('/api/demo/reset', (_req, res) => {
    const snapshot = store.resetToHarborAndFinchSeed();
    res.json({ ok: true, snapshot });
  });

  // --- Server-Side Gemini Multi-Turn Security & Governance Analyst ---
  app.post('/api/chat', async (req, res) => {
    const body = req.body ?? {};
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) {
      res.status(400).json({ error: 'message is required.' });
      return;
    }

    const mode: SentinelChatModelMode = body.mode === 'fast' ? 'fast' : 'standard';
    const history: SentinelChatTurn[] = Array.isArray(body.history)
      ? body.history
          .filter(
            (item: unknown): item is SentinelChatTurn =>
              Boolean(item) &&
              typeof item === 'object' &&
              ((item as SentinelChatTurn).role === 'user' ||
                (item as SentinelChatTurn).role === 'model') &&
              typeof (item as SentinelChatTurn).content === 'string',
          )
          .slice(-24)
      : [];

    try {
      const result = await runSentinelSecurityChat(store.getSnapshot(), {
        message,
        history,
        mode,
      });
      res.status(200).json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Security Analyst request failed.';
      const statusCode = /GEMINI_API_KEY/i.test(msg) ? 503 : 500;
      res.status(statusCode).json({ error: msg });
    }
  });

  // --- Controlled Sandbox Breach Drill Orchestration ---
  app.post('/api/breach-drill/step', async (req, res) => {
    const body = req.body ?? {};
    const scenarioId = typeof body.scenarioId === 'string' ? body.scenarioId : 'full_kill_chain';
    const stepIndex = typeof body.stepIndex === 'number' ? body.stepIndex : 0;
    const drillId =
      typeof body.drillId === 'string' && body.drillId.trim()
        ? body.drillId.trim().slice(0, 64)
        : `drill_${Date.now()}`;

    const scenario = getBreachDrillScenario(scenarioId);
    if (!scenario) {
      res.status(400).json({ error: `Unknown breach drill scenario: ${scenarioId}` });
      return;
    }

    const stage = scenario.stages[stepIndex];
    if (!stage) {
      res.status(400).json({ error: `Invalid stepIndex ${stepIndex} for scenario ${scenarioId}` });
      return;
    }

    try {
      let alertId: string | null = null;
      let severity = stage.expectedSeverity;
      let vaultSequence: number | null = null;
      let summary = stage.description;

      if (stage.kind === 'ticket_secret') {
        const ticketId = `${stage.params.ticketPrefix ?? 'DRILL'}-${Math.floor(1000 + Math.random() * 9000)}`;
        const result = store.scanTicketForSecrets({
          ticketId,
          ticketText: stage.params.ticketText ?? '[SANDBOX DRILL] Credential leak test.',
          reporterSystem: stage.params.reporterSystem ?? 'IT Service Desk [Sandbox Drill]',
        });
        alertId = result.alertCreated?.id ?? null;
        severity = result.alertCreated?.severity ?? stage.expectedSeverity;
        vaultSequence = result.alertCreated?.vaultSequence ?? null;
        summary = `Scanned ${ticketId}: ${result.findings.length} secret(s) redacted at edge${alertId ? ` · Alert ${alertId}` : ''}.`;
      } else if (stage.kind === 'fingerprint_ingest') {
        const ts = new Date();
        ts.setUTCHours(stage.params.hourUtc ?? 3, Math.floor(10 + Math.random() * 35), 14, 0);
        const result = store.ingestEvent({
          sourceSystem: stage.system,
          rawTimestamp: ts.toISOString(),
          clockSkewMs: stage.params.clockSkewMs ?? 2400,
          rawActor: stage.params.rawActor ?? 'ak_payroll_prod',
          action: stage.params.action ?? 'batch.export.unauthorized',
          sourceIp: stage.sourceIp,
          endpoint: stage.params.endpoint ?? '/v2/export/unusual-bulk-dump',
          volumeCount: stage.params.volumeCount ?? 240,
          rawPayload: stage.params.rawPayload ?? `[SANDBOX DRILL] ${stage.title}`,
        });
        alertId = result.alert?.id ?? null;
        severity = result.alert?.severity ?? stage.expectedSeverity;
        vaultSequence = result.alert?.vaultSequence ?? null;
        summary = result.alert
          ? `${result.alert.title} from ${stage.sourceIp} (${stage.params.volumeCount ?? 240} req/hr).`
          : `Event ingested from ${stage.system} (${stage.sourceIp}).`;
      } else if (stage.kind === 'vendor_bank_hijack') {
        const result = await store.executeManualAttackerAction({
          actionType: 'alter_vendor_bank',
          attackerAlias: stage.params.attackerAlias ?? 'drill-sim',
          sourceIp: stage.sourceIp,
          vendorId: stage.params.vendorId ?? 'VND-4021',
        });
        alertId = result.alert?.id ?? result.record.alertId ?? null;
        severity = result.alert?.severity ?? stage.expectedSeverity;
        vaultSequence = result.record.vaultSequence;
        summary = result.record.summary;
      } else if (stage.kind === 'honey_trap') {
        const snap = store.getSnapshot();
        const targetTrap =
          snap.honeyTraps.find((t) => t.id === stage.params.trapId) ?? snap.honeyTraps[0];
        if (!targetTrap) {
          throw new Error('No honey traps available to trigger during drill.');
        }
        const alert = store.triggerHoneyTrap(targetTrap.id, stage.sourceIp);
        alertId = alert.id;
        severity = alert.severity;
        vaultSequence = alert.vaultSequence;
        summary = `Honey trap "${targetTrap.label}" tripped by ${stage.sourceIp} — immediate critical alert raised.`;
      }

      const stepResult: BreachDrillStepExecutionResult = {
        drillId,
        scenarioId: scenario.id,
        stepIndex,
        stepId: stage.id,
        stepTitle: stage.title,
        system: stage.system,
        mitreTactic: stage.mitreTactic,
        alertId,
        severity,
        vaultSequence,
        summary,
        executedAt: new Date().toISOString(),
      };

      res.status(201).json({
        stepResult,
        snapshot: store.getSnapshot(),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Breach drill stage failed',
      });
    }
  });

  // --- Multimodal Gemini Operations Endpoints ---

  app.post('/api/ai/maps', async (req, res) => {
    const body = req.body ?? {};
    if (typeof body.query !== 'string' || !body.query.trim()) {
      res.status(400).json({ error: 'query is required.' });
      return;
    }
    try {
      const snap = store.getSnapshot();
      const result = await runMapsGroundedQuery({
        query: body.query,
        latitude: typeof body.latitude === 'number' ? body.latitude : undefined,
        longitude: typeof body.longitude === 'number' ? body.longitude : undefined,
        region: snap.controlPlane.region,
      });
      res.json(result);
    } catch (err) {
      const formatted = formatGeminiError(err, 'gemini-4-hydrogen');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/transcribe', async (req, res) => {
    const body = req.body ?? {};
    if (typeof body.audioBase64 !== 'string' || !body.audioBase64.trim()) {
      res.status(400).json({ error: 'audioBase64 is required.' });
      return;
    }
    try {
      const result = await transcribeAudioWithGemini({
        audioBase64: body.audioBase64,
        mimeType: typeof body.mimeType === 'string' ? body.mimeType : 'audio/webm',
        instruction: typeof body.instruction === 'string' ? body.instruction : undefined,
      });
      res.json(result);
    } catch (err) {
      const formatted = formatGeminiError(err, 'gemini-3.5-transcribe');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/image', async (req, res) => {
    const body = req.body ?? {};
    if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
      res.status(400).json({ error: 'prompt is required.' });
      return;
    }
    try {
      const allowedRatios = new Set(['1:1', '16:9', '9:16', '4:3', '3:4']);
      const aspectRatio = allowedRatios.has(body.aspectRatio) ? body.aspectRatio : '16:9';
      const imageSize = body.imageSize === '2K' ? '2K' : '1K';
      const result = await createOrEditImageWithGemini({
        prompt: body.prompt,
        sourceImageBase64:
          typeof body.sourceImageBase64 === 'string' ? body.sourceImageBase64 : undefined,
        sourceMimeType:
          typeof body.sourceMimeType === 'string' ? body.sourceMimeType : undefined,
        aspectRatio,
        imageSize,
      });
      res.json(result);
    } catch (err) {
      const formatted = formatGeminiError(err, 'gemini-nano-banana-2.1');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/video', async (req, res) => {
    const body = req.body ?? {};
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    const sourceImageBase64 =
      typeof body.sourceImageBase64 === 'string' ? body.sourceImageBase64 : undefined;
    if (!prompt.trim() && !sourceImageBase64) {
      res.status(400).json({ error: 'Either prompt or sourceImageBase64 is required.' });
      return;
    }
    try {
      const aspectRatio: '16:9' | '9:16' = body.aspectRatio === '9:16' ? '9:16' : '16:9';
      const duration: '5s' | '8s' | '10s' =
        body.duration === '8s' || body.duration === '10s' ? body.duration : '5s';
      const result = await generateOrAnimateVideoWithGemini({
        prompt,
        sourceImageBase64,
        sourceMimeType:
          typeof body.sourceMimeType === 'string' ? body.sourceMimeType : undefined,
        aspectRatio,
        duration,
      });
      res.json(result);
    } catch (err) {
      const formatted = formatGeminiError(err, 'gemini-omni-1.2-flash');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Always return JSON for unknown /api/* routes instead of falling through to SPA HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Sentinel API endpoint not found.' });
  });

  return { app, store };
}
