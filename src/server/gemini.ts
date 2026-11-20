import { GoogleGenAI, type Content } from '@google/genai';
import type { SystemSnapshot } from '../core/types.ts';

export type SentinelChatModelMode = 'standard' | 'fast';

export interface SentinelChatTurn {
  role: 'user' | 'model';
  content: string;
}

export interface SentinelChatRequest {
  message: string;
  history?: SentinelChatTurn[];
  mode?: SentinelChatModelMode;
}

export interface SentinelChatResponse {
  reply: string;
  model: string;
  mode: SentinelChatModelMode;
  timestamp: string;
}

const MODEL_BY_MODE: Record<SentinelChatModelMode, string> = {
  standard: 'gemini-4-hydrogen',
  fast: 'gemini-3.1-flash-lite',
};

function buildRedactedSnapshotContext(snapshot: SystemSnapshot): string {
  const openAlerts = snapshot.alerts.filter((a) => a.status !== 'resolved');
  const criticalCount = openAlerts.filter((a) => a.severity === 'critical').length;
  const highCount = openAlerts.filter((a) => a.severity === 'high').length;

  const topAlerts = snapshot.alerts.slice(0, 10).map((a) => ({
    id: a.id,
    severity: a.severity,
    status: a.status,
    title: a.title,
    sourceIp: a.sourceIp,
    vaultSequence: a.vaultSequence,
    createdAt: a.createdAt,
    summary: a.summary,
    responseExecuted: a.activeResponse
      ? `${a.activeResponse.actionSummary} (${a.activeResponse.undoneAt ? 'undone' : 'active'})`
      : 'none',
  }));

  const honeyTraps = snapshot.honeyTraps.map((t) => ({
    id: t.id,
    kind: t.kind,
    label: t.label,
    location: t.plantedLocation,
    status: t.status,
    triggerCount: t.triggerCount,
    lastTriggeredAt: t.lastTriggeredAt,
  }));

  const blockedSessions = snapshot.blockedSessions.map((b) => ({
    sourceIp: b.sourceIp,
    attackerAlias: b.attackerAlias,
    reason: b.reason,
    blockedAt: b.blockedAt,
  }));

  const pendingHolds = snapshot.paymentHolds
    .filter((h) => h.status === 'held_for_review')
    .map((h) => ({
      id: h.id,
      vendorName: h.vendorName,
      amount: h.amountFormatted,
      hoursUntilPayout: h.hoursUntilPayout,
      requestedBy: h.requestedBy,
      sourceIp: h.sourceIp,
    }));

  const failingControls = snapshot.controlDrift.assertions
    .filter((c) => c.status !== 'aligned')
    .map((c) => ({
      id: c.id,
      controlRef: c.controlRef,
      framework: c.framework,
      status: c.status,
      observedReality: c.observedReality,
    }));

  const breachClocks = snapshot.breachClocks.map((bc) => ({
    id: bc.id,
    title: bc.title,
    regulator: bc.regulator,
    status: bc.status,
    deadlineAt: bc.deadlineAt,
    customerPiiExposed: bc.customerPiiExposed,
  }));

  const fingerprints = snapshot.fingerprints.map((fp) => ({
    keyAlias: fp.keyAlias,
    system: fp.system,
    allowedHoursUtc: fp.allowedHoursUtc,
    normalVolumeMean: fp.normalVolumeMean,
    knownIps: fp.knownIps,
  }));

  return JSON.stringify(
    {
      tenant: snapshot.controlPlane.tenantName,
      region: snapshot.controlPlane.region,
      kmsKeyId: snapshot.controlPlane.customerKmsKeyId,
      vaultIntegrity: {
        valid: snapshot.vaultVerification.valid,
        totalEntries: snapshot.vaultEntries.length,
        headHash: snapshot.vaultVerification.headHash.slice(0, 16),
      },
      summaryCounts: {
        totalAlerts: snapshot.alerts.length,
        openAlerts: openAlerts.length,
        openCritical: criticalCount,
        openHigh: highCount,
        activeBlockedIps: blockedSessions.length,
        pendingPaymentHolds: pendingHolds.length,
        controlDriftScore: snapshot.controlDrift.driftScore,
        enabledWebhooks: snapshot.webhooks.filter((w) => w.enabled).length,
        recentWebhookDeliveries: snapshot.webhookDeliveries.length,
      },
      recentAlerts: topAlerts,
      honeyTraps,
      blockedSessions,
      pendingPaymentHolds: pendingHolds,
      controlDriftIssues: failingControls,
      breachClocks,
      machineFingerprints: fingerprints,
    },
    null,
    2,
  );
}

function buildSystemInstruction(snapshot: SystemSnapshot): string {
  const telemetryJson = buildRedactedSnapshotContext(snapshot);
  return [
    'You are the Sentinel Security & Governance Analyst embedded inside Harbor & Finch LLP\'s Admin Management Portal.',
    'Your role is to assist SecOps engineers, CFO/Controllers, and Legal/Audit leadership with:',
    '1. Investigating active security alerts, exact Vault log sequences, source IPs, and machine-identity anomalies.',
    '2. Assessing containment blast radius and recommending reversible response actions.',
    '3. Reviewing stealth honey-trap triggers, quarantined attacker sessions, and dual-control payment holds.',
    '4. Drafting concise executive board summaries, audit findings, and 72-hour UK/EU regulatory breach notices.',
    '',
    'Strict operating rules:',
    '- Ground every answer strictly in the live edge-redacted Sentinel telemetry below. Never fabricate alert IDs, IPs, hashes, or timestamps.',
    '- Never ask for or output raw credentials, API keys, or unredacted PII — Sentinel is a minimal-exposure platform.',
    '- Keep answers structured, crisp, executive-ready, and actionable (use short headings or concise bullets when helpful).',
    '- Cite exact Alert IDs, Vault sequence numbers (#seq), and source IPs whenever referencing incidents.',
    '',
    'Live Edge-Redacted Sentinel Telemetry Snapshot:',
    telemetryJson,
  ].join('\n');
}

function sanitizeHistory(raw?: SentinelChatTurn[]): Content[] {
  if (!Array.isArray(raw)) return [];
  const trimmed = raw
    .filter(
      (item): item is SentinelChatTurn =>
        Boolean(item) &&
        (item.role === 'user' || item.role === 'model') &&
        typeof item.content === 'string' &&
        item.content.trim().length > 0,
    )
    .slice(-24);

  // Ensure valid alternating start with user turn if possible
  const contents: Content[] = [];
  for (const turn of trimmed) {
    const cleanText = turn.content.trim().slice(0, 6000);
    if (contents.length === 0 && turn.role !== 'user') {
      continue;
    }
    const prev = contents[contents.length - 1];
    if (prev && prev.role === turn.role && prev.parts?.[0]?.text) {
      prev.parts[0].text = `${prev.parts[0].text}\n\n${cleanText}`.slice(0, 8000);
    } else {
      contents.push({
        role: turn.role,
        parts: [{ text: cleanText }],
      });
    }
  }
  return contents;
}

export async function runSentinelSecurityChat(
  snapshot: SystemSnapshot,
  request: SentinelChatRequest,
): Promise<SentinelChatResponse> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Set GEMINI_API_KEY in your environment to enable the Security Analyst chatbot.',
    );
  }

  const userMessage = request.message.trim();
  if (!userMessage) {
    throw new Error('Message cannot be empty.');
  }

  const mode: SentinelChatModelMode = request.mode === 'fast' ? 'fast' : 'standard';
  const model = MODEL_BY_MODE[mode];

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const history = sanitizeHistory(request.history);
  const chat = ai.chats.create({
    model,
    history,
    config: {
      systemInstruction: buildSystemInstruction(snapshot),
    },
  });

  const response = await chat.sendMessage({
    message: userMessage.slice(0, 4000),
  });

  const reply = (response.text ?? '').trim();
  if (!reply) {
    throw new Error('The AI model returned an empty response. Please try again.');
  }

  return {
    reply,
    model,
    mode,
    timestamp: new Date().toISOString(),
  };
}
