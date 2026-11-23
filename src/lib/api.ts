import { useCallback, useEffect, useRef, useState } from 'react';
import type { PushNotificationEvent, SystemSnapshot } from '../core/types';
import type {
  BreachDrillScenario,
  BreachDrillStepExecutionResult,
} from '../core/breachDrill';

import { resolveApiBaseUrl, resolveSentinelWsUrl } from './apiUrl';

const API_BASE_URL = resolveApiBaseUrl(
  import.meta.env?.VITE_API_BASE_URL as string | undefined,
  typeof window !== 'undefined' ? window.location.hostname : '',
);

function buildApiUrl(path: string): string {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

async function requestJson<T>(url: string, options?: RequestInit, retries = 1): Promise<T> {
  const fullUrl = buildApiUrl(url);
  try {
    const res = await fetch(fullUrl, {
      headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
      ...options,
    });
    const text = await res.text();
    let data: Record<string, unknown> | null = null;
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      if ((res.status === 502 || res.status === 503 || res.status === 504) && retries > 0) {
        await new Promise((r) => setTimeout(r, 700));
        return requestJson<T>(url, options, retries - 1);
      }
      if (res.status === 404) {
        if (typeof data?.error === 'string' && data.error.trim().length > 0) {
          throw new Error(data.error);
        }
        throw new Error(
          'Sentinel API endpoint returned 404. On Netlify, deploy the full repository (with netlify.toml & netlify/functions/api.ts) rather than a static-only dist upload, or set VITE_API_BASE_URL.',
        );
      }
      throw new Error(
        typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`,
      );
    }

    if (!data || typeof data !== 'object') {
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 700));
        return requestJson<T>(url, options, retries - 1);
      }
      throw new Error(
        'Sentinel API returned a non-JSON response. Verify the backend server or Netlify Functions route (/api/*) is active.',
      );
    }

    return data as T;
  } catch (err) {
    const isNetworkErr =
      err instanceof TypeError ||
      (err instanceof Error && /failed to fetch|networkerror|load failed/i.test(err.message));
    if (isNetworkErr && retries > 0) {
      await new Promise((r) => setTimeout(r, 700));
      return requestJson<T>(url, options, retries - 1);
    }
    throw err;
  }
}

function isValidSystemSnapshot(value: unknown): value is SystemSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SystemSnapshot>;
  return Boolean(
    candidate.controlPlane &&
      typeof candidate.controlPlane === 'object' &&
      Array.isArray(candidate.alerts) &&
      Array.isArray(candidate.notifications) &&
      candidate.notificationPrefs &&
      typeof candidate.notificationPrefs === 'object',
  );
}

export const sentinelApi = {
  getSnapshot: () => requestJson<SystemSnapshot>('/api/snapshot'),

  ingestEvent: (payload: {
    sourceSystem: string;
    rawActor: string;
    action: string;
    sourceIp: string;
    endpoint: string;
    volumeCount: number;
    clockSkewMs: number;
    rawTimestamp?: string;
    rawPayload: string;
  }) =>
    requestJson<{ snapshot: SystemSnapshot; normalized: unknown; alert: unknown }>('/api/ingest', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createHoneyTrap: (payload: {
    kind: 'honey_key' | 'honey_vendor';
    label: string;
    plantedLocation: string;
  }) =>
    requestJson<{ snapshot: SystemSnapshot }>('/api/honey-traps', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  triggerHoneyTrap: (trapId: string, sourceIp?: string) =>
    requestJson<{ snapshot: SystemSnapshot; alert: { id: string } }>(
      `/api/honey-traps/${encodeURIComponent(trapId)}/trigger`,
      {
        method: 'POST',
        body: JSON.stringify({ sourceIp }),
      },
    ),

  submitAlertFeedback: (
    alertId: string,
    decision: 'approve' | 'dismiss',
    note?: string,
  ) =>
    requestJson<{ snapshot: SystemSnapshot }>(
      `/api/alerts/${encodeURIComponent(alertId)}/feedback`,
      {
        method: 'POST',
        body: JSON.stringify({ decision, note }),
      },
    ),

  executeResponse: (alertId: string, optionId: string) =>
    requestJson<{ snapshot: SystemSnapshot }>(
      `/api/alerts/${encodeURIComponent(alertId)}/respond`,
      {
        method: 'POST',
        body: JSON.stringify({ optionId }),
      },
    ),

  undoResponse: (alertId: string) =>
    requestJson<{ snapshot: SystemSnapshot }>(
      `/api/alerts/${encodeURIComponent(alertId)}/undo`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    ),

  resolveAlert: (alertId: string, note?: string) =>
    requestJson<{ snapshot: SystemSnapshot }>(
      `/api/alerts/${encodeURIComponent(alertId)}/resolve`,
      {
        method: 'POST',
        body: JSON.stringify({ note }),
      },
    ),

  runAttackerAction: (payload: {
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
  }) =>
    requestJson<{
      record: { id: string; outcome: string; vaultSequence: number; alertId: string | null };
      alert: { id: string } | null;
      trapped: boolean;
      blocked: boolean;
      webhookDeliveries?: Array<{
        id: string;
        webhookName: string;
        status: string;
        statusCode: number | null;
      }>;
      terminalOutput: string;
      snapshot: SystemSnapshot;
    }>('/api/attacker/action', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  unblockAttackerSession: (sourceIp: string, operator?: string) =>
    requestJson<{ snapshot: SystemSnapshot }>('/api/attacker/unblock', {
      method: 'POST',
      body: JSON.stringify({ sourceIp, operator }),
    }),

  resolvePaymentHold: (holdId: string, decision: 'released_verified' | 'blocked_fraud') =>
    requestJson<{ snapshot: SystemSnapshot }>(
      `/api/payment-holds/${encodeURIComponent(holdId)}/decision`,
      {
        method: 'POST',
        body: JSON.stringify({ decision }),
      },
    ),

  scanTicket: (payload: { ticketId: string; ticketText: string; reporterSystem?: string }) =>
    requestJson<{
      ticketId: string;
      redactedText: string;
      findings: Array<{ kind: string; previewMasked: string; tokenHash: string }>;
      alertCreated: { id: string } | null;
      snapshot: SystemSnapshot;
    }>('/api/secrets-scanner/scan', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getEvidencePack: (caseId: string) =>
    requestJson<{
      generatedAt: string;
      packHash: string;
      document: Record<string, unknown>;
    }>(`/api/evidence-pack/${encodeURIComponent(caseId)}`),

  markNotificationsRead: () =>
    requestJson<{ snapshot: SystemSnapshot }>('/api/notifications/read-all', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  updateNotificationPrefs: (patch: {
    browserPushEnabled?: boolean;
    soundChimeEnabled?: boolean;
    minPushSeverity?: 'low' | 'medium' | 'high' | 'critical';
  }) =>
    requestJson<{ snapshot: SystemSnapshot }>('/api/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  addWebhook: (payload: {
    name: string;
    provider: 'slack' | 'pagerduty' | 'teams' | 'generic_json' | 'sentinel_loopback';
    url: string;
    minSeverity: 'low' | 'medium' | 'high' | 'critical';
  }) =>
    requestJson<{ snapshot: SystemSnapshot }>('/api/webhooks', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateWebhook: (
    webhookId: string,
    patch: { enabled?: boolean; minSeverity?: 'low' | 'medium' | 'high' | 'critical' },
  ) =>
    requestJson<{ snapshot: SystemSnapshot }>(`/api/webhooks/${encodeURIComponent(webhookId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteWebhook: (webhookId: string) =>
    requestJson<{ snapshot: SystemSnapshot }>(`/api/webhooks/${encodeURIComponent(webhookId)}`, {
      method: 'DELETE',
    }),

  testWebhook: (webhookId: string) =>
    requestJson<{
      delivery: { id: string; status: string; statusCode: number | null; latencyMs: number };
      snapshot: SystemSnapshot;
    }>(`/api/webhooks/${encodeURIComponent(webhookId)}/test`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  resetDemo: () =>
    requestJson<{ snapshot: SystemSnapshot }>('/api/demo/reset', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  sendChatMessage: (payload: {
    message: string;
    history?: Array<{ role: 'user' | 'model'; content: string }>;
    mode?: 'standard' | 'fast';
  }) =>
    requestJson<{
      reply: string;
      model: string;
      mode: 'standard' | 'fast';
      timestamp: string;
    }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  runBreachDrillStep: (payload: {
    scenarioId: BreachDrillScenario['id'];
    stepIndex: number;
    drillId: string;
  }) =>
    requestJson<{
      stepResult: BreachDrillStepExecutionResult;
      snapshot: SystemSnapshot;
    }>('/api/breach-drill/step', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  queryMapsGrounding: (payload: {
    query: string;
    latitude?: number;
    longitude?: number;
  }) =>
    requestJson<{
      answer: string;
      model: string;
      sources: Array<{
        title: string;
        uri: string;
        placeId?: string;
        reviewSnippets: Array<{ text: string; uri?: string }>;
      }>;
      timestamp: string;
    }>(
      '/api/ai/maps',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      0,
    ),

  transcribeAudio: (payload: {
    audioBase64: string;
    mimeType: string;
    instruction?: string;
  }) =>
    requestJson<{
      transcript: string;
      model: string;
      timestamp: string;
    }>(
      '/api/ai/transcribe',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      0,
    ),

  generateOrEditImage: (payload: {
    prompt: string;
    sourceImageBase64?: string;
    sourceMimeType?: string;
    aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
    imageSize?: '1K' | '2K';
  }) =>
    requestJson<{
      imageDataUrl: string;
      mimeType: string;
      caption: string;
      model: string;
      mode: 'create' | 'edit';
      aspectRatio: string;
      timestamp: string;
    }>(
      '/api/ai/image',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      0,
    ),

  generateOrAnimateVideo: (payload: {
    prompt: string;
    sourceImageBase64?: string;
    sourceMimeType?: string;
    aspectRatio: '16:9' | '9:16';
    duration?: '5s' | '8s' | '10s';
  }) =>
    requestJson<{
      videoDataUrl: string | null;
      videoUri: string | null;
      mimeType: string;
      model: string;
      mode: 'text' | 'animate';
      aspectRatio: '16:9' | '9:16';
      duration: string;
      timestamp: string;
    }>(
      '/api/ai/video',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      0,
    ),
};

export function buildSentinelWsUrl(path: string): string {
  return resolveSentinelWsUrl(path, API_BASE_URL, window.location);
}

export function useSentinelRealtime(portalRole: 'secops' | 'executive' | 'attacker' = 'secops') {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const [liveToast, setLiveToast] = useState<PushNotificationEvent | null>(null);
  const [browserPushPermission, setBrowserPushPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied',
  );

  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const roleRef = useRef(portalRole);
  roleRef.current = portalRole;

  const surfaceNotification = useCallback((notif: PushNotificationEvent) => {
    if (seenNotifIdsRef.current.has(notif.id)) return;
    seenNotifIdsRef.current.add(notif.id);
    if (roleRef.current === 'attacker') return;

    setLiveToast(notif);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setLiveToast(null), 6500);

    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification(`Sentinel — ${notif.title}`, {
          body: notif.message,
          tag: notif.id,
        });
      } catch {
        // Ignore sandbox notification restrictions
      }
    }
  }, []);

  const fetchLatest = useCallback(
    async (options?: { emitNewToasts?: boolean }) => {
      try {
        const data = await sentinelApi.getSnapshot();
        if (!isValidSystemSnapshot(data)) {
          throw new Error(
            'Sentinel API returned an incomplete snapshot. Retry connection once the server finishes starting.',
          );
        }
        setSnapshot(data);
        setLastSyncedAt(new Date().toISOString());
        setError(null);
        if (!initializedRef.current) {
          for (const n of data.notifications) {
            seenNotifIdsRef.current.add(n.id);
          }
          initializedRef.current = true;
        } else if (options?.emitNewToasts) {
          // Surface any brand-new notifications when polling via Auto-Refresh or HTTP Live Sync
          const newestFirst = [...data.notifications].reverse();
          for (const n of newestFirst) {
            if (!seenNotifIdsRef.current.has(n.id)) {
              surfaceNotification(n);
            }
          }
        }
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to reach Sentinel regional server');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [surfaceNotification],
  );

  useEffect(() => {
    void fetchLatest();
  }, [fetchLatest]);

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'client:role', role: portalRole }));
    }
  }, [portalRole]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: number | null = null;
    let pollInterval: number | null = null;
    let closedByCleanup = false;
    let everOpenedWs = false;
    let wsFailures = 0;

    const startHttpLiveSync = () => {
      if (closedByCleanup || pollInterval !== null) return;
      setWsStatus('connected');
      pollInterval = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          void fetchLatest({ emitNewToasts: true });
        }
      }, 3000);
    };

    const connect = () => {
      if (closedByCleanup) return;

      // Determine WebSocket target URL (sanitized, same-origin on full-stack hosts)
      const wsUrl = buildSentinelWsUrl('/ws/notifications');

      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;
      } catch {
        startHttpLiveSync();
        return;
      }

      ws.onopen = () => {
        everOpenedWs = true;
        wsFailures = 0;
        if (pollInterval !== null) {
          window.clearInterval(pollInterval);
          pollInterval = null;
        }
        setWsStatus('connected');
        ws?.send(JSON.stringify({ type: 'client:role', role: roleRef.current }));
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data));
          if (parsed?.type === 'notification:push' && parsed.payload) {
            surfaceNotification(parsed.payload as PushNotificationEvent);
          }
          if (parsed?.type === 'presence:updated' && parsed.payload) {
            setSnapshot((prev) =>
              prev ? { ...prev, connectedRoles: parsed.payload } : prev,
            );
          }
          if (
            parsed?.type === 'state:updated' ||
            parsed?.type === 'notification:push' ||
            parsed?.type === 'webhook:delivered'
          ) {
            void fetchLatest();
          }
        } catch {
          // Ignore malformed message
        }
      };

      ws.onclose = () => {
        if (closedByCleanup) return;
        wsFailures += 1;
        // Serverless hosts (like Netlify Functions) do not support persistent WebSockets:
        // switch cleanly to Live HTTP Sync instead of looping in "reconnecting".
        if (!everOpenedWs && wsFailures >= 1) {
          startHttpLiveSync();
          return;
        }
        setWsStatus('reconnecting');
        reconnectTimeout = window.setTimeout(connect, 2500);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
      if (pollInterval !== null) window.clearInterval(pollInterval);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      ws?.close();
      wsRef.current = null;
    };
  }, [fetchLatest, surfaceNotification]);

  const requestBrowserPush = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const perm = await Notification.requestPermission();
      setBrowserPushPermission(perm);
    } catch {
      // Ignore if iframe disallows Notification prompt
    }
  }, []);

  const refresh = useCallback(
    (options?: { emitNewToasts?: boolean }) =>
      fetchLatest({ emitNewToasts: options?.emitNewToasts ?? false }),
    [fetchLatest],
  );

  return {
    snapshot,
    setSnapshot,
    loading,
    error,
    lastSyncedAt,
    wsStatus,
    liveToast,
    dismissToast: () => setLiveToast(null),
    browserPushPermission,
    requestBrowserPush,
    refresh,
  };
}
