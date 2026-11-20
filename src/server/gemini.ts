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

export interface MapsGroundingSource {
  title: string;
  uri: string;
  placeId?: string;
  reviewSnippets: Array<{ text: string; uri?: string }>;
}

export interface MapsGroundingResponse {
  answer: string;
  model: string;
  sources: MapsGroundingSource[];
  timestamp: string;
}

export interface AudioTranscriptionResponse {
  transcript: string;
  model: string;
  timestamp: string;
}

export interface ImageStudioResponse {
  imageDataUrl: string;
  mimeType: string;
  caption: string;
  model: string;
  mode: 'create' | 'edit';
  aspectRatio: string;
  timestamp: string;
}

export interface VideoStudioResponse {
  videoDataUrl: string | null;
  videoUri: string | null;
  mimeType: string;
  model: string;
  mode: 'text' | 'animate';
  aspectRatio: '16:9' | '9:16';
  duration: string;
  timestamp: string;
}

const MODEL_BY_MODE: Record<SentinelChatModelMode, string> = {
  standard: 'gemini-4-hydrogen',
  fast: 'gemini-3.1-flash-lite',
};

export function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Please select or configure an API key in Settings > Secrets.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function formatGeminiError(err: unknown, modelName?: string): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err || 'Unexpected Gemini API error');
  const lower = raw.toLowerCase();
  if (lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota')) {
    return {
      status: 429,
      message: `${modelName ? `Model ${modelName} requires` : 'This model requires'} higher quota or a billing-enabled API key. Select a paid API key in Settings > Secrets to use this capability. (${raw})`,
    };
  }
  if (lower.includes('permission_denied') || lower.includes('403') || lower.includes('api_key_invalid')) {
    return {
      status: 403,
      message: `API key access denied or invalid for ${modelName ?? 'Gemini API'}. Please verify or select a billing-enabled API key in Settings > Secrets. (${raw})`,
    };
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return {
      status: 404,
      message: `Model ${modelName ?? 'requested'} was not found or is unavailable for your current key. (${raw})`,
    };
  }
  return { status: 500, message: raw };
}

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

export function buildSystemInstruction(snapshot: SystemSnapshot): string {
  const telemetryJson = buildRedactedSnapshotContext(snapshot);
  return [
    "You are the Sentinel Security & Governance Analyst embedded inside Harbor & Finch LLP's Admin Management Portal.",
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

export function buildLiveVoiceSystemInstruction(snapshot: SystemSnapshot): string {
  const openAlerts = snapshot.alerts.filter((a) => a.status !== 'resolved');
  const topLines = openAlerts
    .slice(0, 6)
    .map(
      (a) =>
        `- ${a.id} [${a.severity.toUpperCase()} / ${a.status}]: ${a.title} (IP ${a.sourceIp}, Vault #${a.vaultSequence})`,
    )
    .join('\n');

  return [
    'You are Sentinel Live Voice Analyst for Harbor & Finch LLP.',
    'Speak naturally, concisely, and clearly like a senior SecOps incident commander on a live briefing call.',
    `Active region: ${snapshot.controlPlane.region}. Vault integrity: ${snapshot.vaultVerification.valid ? 'VERIFIED' : 'ALERT'}.`,
    `Open alerts: ${openAlerts.length}. Blocked intruder sessions: ${snapshot.blockedSessions.length}. Control drift score: ${snapshot.controlDrift.driftScore}%.`,
    topLines ? `Current open incidents:\n${topLines}` : 'No open alerts right now.',
    'Keep spoken responses brief (2 to 4 sentences unless asked for deeper detail) and grounded strictly in this telemetry.',
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
  const userMessage = request.message.trim();
  if (!userMessage) {
    throw new Error('Message cannot be empty.');
  }

  const mode: SentinelChatModelMode = request.mode === 'fast' ? 'fast' : 'standard';
  const model = MODEL_BY_MODE[mode];
  const ai = createGeminiClient();

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

/**
 * Google Maps Grounding via gemini-4-hydrogen + { googleMaps: {} } tool.
 * Extracts all maps groundingChunks URIs and review snippets for UI links.
 */
export async function runMapsGroundedQuery(payload: {
  query: string;
  latitude?: number;
  longitude?: number;
  region?: string;
}): Promise<MapsGroundingResponse> {
  const query = payload.query.trim();
  if (!query) {
    throw new Error('Please enter a location or geographic security query.');
  }

  const model = 'gemini-4-hydrogen';
  const ai = createGeminiClient();

  const hasCoords =
    typeof payload.latitude === 'number' &&
    Number.isFinite(payload.latitude) &&
    typeof payload.longitude === 'number' &&
    Number.isFinite(payload.longitude);

  const response = await ai.models.generateContent({
    model,
    contents: query.slice(0, 2000),
    config: {
      systemInstruction: `You are Sentinel's Geospatial & Facilities Security Researcher (region: ${payload.region ?? 'ap-southeast-2'}). Provide accurate, up-to-date place and geographic intelligence grounded in Google Maps data. Respond in clear Markdown.`,
      tools: [{ googleMaps: {} }],
      ...(hasCoords
        ? {
            toolConfig: {
              retrievalConfig: {
                latLng: {
                  latitude: payload.latitude!,
                  longitude: payload.longitude!,
                },
              },
            },
          }
        : {}),
    },
  });

  const answer = (response.text ?? '').trim();
  if (!answer) {
    throw new Error('Maps grounding returned an empty response. Please refine your query.');
  }

  const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources: MapsGroundingSource[] = [];
  const seenUris = new Set<string>();

  for (const chunk of rawChunks) {
    const mapsObj = (chunk as {
      maps?: {
        uri?: string;
        title?: string;
        placeId?: string;
        placeAnswerSources?: {
          reviewSnippets?: Array<{
            content?: string;
            text?: string;
            googleMapsUri?: string;
            uri?: string;
          }>;
        };
      };
    }).maps;

    if (!mapsObj?.uri) continue;
    if (seenUris.has(mapsObj.uri)) continue;
    seenUris.add(mapsObj.uri);

    const snippets = (mapsObj.placeAnswerSources?.reviewSnippets ?? [])
      .map((s) => ({
        text: (s.text ?? s.content ?? '').trim(),
        uri: s.googleMapsUri ?? s.uri,
      }))
      .filter((s) => s.text.length > 0 || Boolean(s.uri));

    sources.push({
      title: mapsObj.title?.trim() || 'View on Google Maps',
      uri: mapsObj.uri,
      placeId: mapsObj.placeId,
      reviewSnippets: snippets,
    });
  }

  return {
    answer,
    model,
    sources,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Audio Transcription via gemini-3.5-transcribe using the Interactions API.
 */
export async function transcribeAudioWithGemini(payload: {
  audioBase64: string;
  mimeType: string;
  instruction?: string;
}): Promise<AudioTranscriptionResponse> {
  const cleanBase64 = payload.audioBase64.replace(/^data:[^;]+;base64,/, '').trim();
  if (!cleanBase64) {
    throw new Error('Audio payload is empty. Please record or upload audio first.');
  }

  const model = 'gemini-3.5-transcribe';
  const ai = createGeminiClient();
  const mimeType = (payload.mimeType || 'audio/webm').split(';')[0].trim();

  const interaction = await ai.interactions.create({
    model,
    input: [
      {
        type: 'audio',
        data: cleanBase64,
        mime_type: mimeType,
      },
      {
        type: 'text',
        text:
          payload.instruction?.trim() ||
          'Transcribe this audio accurately with clear punctuation.',
      },
    ],
  });

  let transcript = (interaction.output_text ?? '').trim();
  if (!transcript && Array.isArray((interaction as { steps?: unknown[] }).steps)) {
    const steps = (interaction as {
      steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    }).steps ?? [];
    transcript = steps
      .filter((s) => s.type === 'model_output')
      .flatMap((s) => s.content ?? [])
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('\n')
      .trim();
  }

  if (!transcript) {
    throw new Error('No speech was detected in the recorded audio. Please try speaking closer to the microphone.');
  }

  return {
    transcript,
    model,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create or Edit Images via gemini-nano-banana-2.1 using the Interactions API.
 */
export async function createOrEditImageWithGemini(payload: {
  prompt: string;
  sourceImageBase64?: string;
  sourceMimeType?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  imageSize?: '1K' | '2K';
}): Promise<ImageStudioResponse> {
  const prompt = payload.prompt.trim();
  if (!prompt) {
    throw new Error('Please enter a prompt describing the image to create or edit.');
  }

  const model = 'gemini-nano-banana-2.1';
  const ai = createGeminiClient();
  const aspectRatio = payload.aspectRatio ?? '16:9';
  const imageSize = payload.imageSize ?? '1K';
  const cleanSource = payload.sourceImageBase64
    ? payload.sourceImageBase64.replace(/^data:[^;]+;base64,/, '').trim()
    : '';
  const isEdit = cleanSource.length > 0;

  const interaction = await ai.interactions.create({
    model,
    input: isEdit
      ? [
          {
            type: 'image',
            data: cleanSource,
            mime_type: payload.sourceMimeType || 'image/png',
          },
          {
            type: 'text',
            text: prompt.slice(0, 2000),
          },
        ]
      : prompt.slice(0, 2000),
    response_modalities: ['image', 'text'],
    generation_config: {
      image_config: {
        aspect_ratio: aspectRatio,
        image_size: imageSize,
      },
    },
  });

  let imageData: string | null = null;
  let mimeType = 'image/png';
  const captions: string[] = [];

  const outputImg = (interaction as { output_image?: { data?: string; mime_type?: string } | null })
    .output_image;
  if (outputImg?.data) {
    imageData = outputImg.data;
    mimeType = outputImg.mime_type || 'image/png';
  }

  const steps = (interaction as {
    steps?: Array<{
      type?: string;
      content?: Array<{ type?: string; data?: string; mime_type?: string; text?: string }>;
    }>;
  }).steps ?? [];

  for (const step of steps) {
    if (step.type !== 'model_output') continue;
    for (const part of step.content ?? []) {
      if (part.type === 'image' && part.data && !imageData) {
        imageData = part.data;
        mimeType = part.mime_type || 'image/png';
      } else if (part.type === 'text' && part.text) {
        captions.push(part.text.trim());
      }
    }
  }

  if (!imageData) {
    throw new Error('The image model did not return an image. Try clarifying your prompt.');
  }

  return {
    imageDataUrl: `data:${mimeType};base64,${imageData}`,
    mimeType,
    caption: captions.join('\n').trim() || (interaction.output_text ?? '').trim(),
    model,
    mode: isEdit ? 'edit' : 'create',
    aspectRatio,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate Video from Text or Animate an Uploaded Photo via gemini-omni-1.2-flash (Interactions API).
 * Strictly enforces 16:9 (landscape) or 9:16 (portrait) aspect ratio.
 */
export async function generateOrAnimateVideoWithGemini(payload: {
  prompt: string;
  sourceImageBase64?: string;
  sourceMimeType?: string;
  aspectRatio: '16:9' | '9:16';
  duration?: '5s' | '8s' | '10s';
}): Promise<VideoStudioResponse> {
  const prompt = payload.prompt.trim();
  const cleanSource = payload.sourceImageBase64
    ? payload.sourceImageBase64.replace(/^data:[^;]+;base64,/, '').trim()
    : '';
  const isAnimate = cleanSource.length > 0;

  if (!prompt && !isAnimate) {
    throw new Error('Enter a motion/scene prompt or upload a photo to animate.');
  }

  const model = 'gemini-omni-1.2-flash';
  const aspectRatio: '16:9' | '9:16' = payload.aspectRatio === '9:16' ? '9:16' : '16:9';
  const duration = payload.duration === '5s' || payload.duration === '8s' ? payload.duration : '5s';
  const ai = createGeminiClient();

  const interaction = await ai.interactions.create(
    {
      model,
      input: isAnimate
        ? [
            {
              type: 'image',
              mime_type: payload.sourceMimeType || 'image/png',
              data: cleanSource,
            },
            {
              type: 'text',
              text:
                prompt.slice(0, 2000) ||
                'Smoothly animate this scene with subtle cinematic camera motion and realistic lighting.',
            },
          ]
        : prompt.slice(0, 2000),
      background: false,
      store: false,
      stream: false,
      response_format: {
        type: 'video',
        aspect_ratio: aspectRatio,
        duration,
        resolution: '720p',
      },
    } as Parameters<typeof ai.interactions.create>[0],
    { timeout: 300000 },
  );

  const videoPart = (interaction as {
    output_video?: { data?: string; uri?: string; mime_type?: string } | null;
  }).output_video;

  let videoData = videoPart?.data ?? null;
  let videoUri = videoPart?.uri ?? null;
  let mimeType = videoPart?.mime_type ?? 'video/mp4';

  if (!videoData && !videoUri) {
    const steps = (interaction as {
      steps?: Array<{
        type?: string;
        content?: Array<{ type?: string; data?: string; uri?: string; mime_type?: string }>;
      }>;
    }).steps ?? [];
    for (const step of steps) {
      if (step.type !== 'model_output') continue;
      const vid = step.content?.find((c) => c.type === 'video');
      if (vid) {
        videoData = vid.data ?? null;
        videoUri = vid.uri ?? null;
        mimeType = vid.mime_type ?? 'video/mp4';
        break;
      }
    }
  }

  if (!videoData && !videoUri) {
    throw new Error('Video generation completed without returning a playable video payload.');
  }

  return {
    videoDataUrl: videoData ? `data:${mimeType};base64,${videoData}` : null,
    videoUri,
    mimeType,
    model,
    mode: isAnimate ? 'animate' : 'text',
    aspectRatio,
    duration,
    timestamp: new Date().toISOString(),
  };
}
