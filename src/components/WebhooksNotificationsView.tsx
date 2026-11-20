import { useState, type FormEvent } from 'react';
import { BellRing, CheckCircle2, Plus, Send, Trash2, Volume2, Webhook, XCircle } from 'lucide-react';
import type { Severity, SystemSnapshot, WebhookEndpoint } from '../core/types';
import { formatRelativeTime, formatUtcTime, severityLabel, severityTextClass } from '../lib/format';

interface WebhooksNotificationsViewProps {
  snapshot: SystemSnapshot;
  wsStatus: 'connecting' | 'connected' | 'reconnecting';
  browserPushPermission: NotificationPermission;
  onRequestBrowserPush: () => Promise<void>;
  onUpdatePrefs: (patch: {
    browserPushEnabled?: boolean;
    soundChimeEnabled?: boolean;
    minPushSeverity?: Severity;
  }) => Promise<void>;
  onAddWebhook: (payload: {
    name: string;
    provider: WebhookEndpoint['provider'];
    url: string;
    minSeverity: Severity;
  }) => Promise<void>;
  onToggleWebhook: (id: string, enabled: boolean) => Promise<void>;
  onDeleteWebhook: (id: string) => Promise<void>;
  onTestWebhook: (id: string) => Promise<{
    status: string;
    statusCode: number | null;
    latencyMs: number;
  }>;
  busyAction: string | null;
}

export function WebhooksNotificationsView({
  snapshot,
  wsStatus,
  browserPushPermission,
  onRequestBrowserPush,
  onUpdatePrefs,
  onAddWebhook,
  onToggleWebhook,
  onDeleteWebhook,
  onTestWebhook,
  busyAction,
}: WebhooksNotificationsViewProps) {
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<WebhookEndpoint['provider']>('slack');
  const [url, setUrl] = useState('');
  const [minSeverity, setMinSeverity] = useState<Severity>('high');
  const [formError, setFormError] = useState<string | null>(null);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) {
      setFormError('Endpoint name and http(s) URL are required.');
      return;
    }
    setFormError(null);
    try {
      await onAddWebhook({ name: name.trim(), provider, url: url.trim(), minSeverity });
      setName('');
      setUrl('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to register webhook');
    }
  };

  const handleTest = async (endpoint: WebhookEndpoint) => {
    setTestFeedback(null);
    try {
      const res = await onTestWebhook(endpoint.id);
      setTestFeedback(
        res.status === 'delivered'
          ? `Delivered HMAC-SHA256 payload to "${endpoint.name}" — HTTP ${res.statusCode} in ${res.latencyMs}ms.`
          : `Delivery to "${endpoint.name}" failed (${res.statusCode ?? 'network error'}).`,
      );
    } catch (err) {
      setTestFeedback(err instanceof Error ? err.message : 'Test delivery failed');
    }
  };

  const { notificationPrefs, webhooks, webhookDeliveries } = snapshot;

  return (
    <div className="space-y-6">
      <section className="window-suede rounded-lg p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="text-xl font-bold text-[var(--sentinel-ink)]">
              Webhooks &amp; Real-Time Notifications
            </h1>
            <p className="mt-1 text-sm text-[var(--sentinel-ink-secondary)]">
              Every outbound webhook is signed with <span className="font-mono">X-Sentinel-Signature-256</span> and carries edge-redacted alert metadata only.
            </p>
          </div>
          <div className="text-xs font-mono tabular-nums text-[var(--sentinel-ink-secondary)] whitespace-nowrap">
            WebSocket:{' '}
            <strong className={wsStatus === 'connected' ? 'text-[var(--sentinel-teal)]' : 'text-[var(--sentinel-high)]'}>
              {wsStatus}
            </strong>
            {' · '}
            {webhooks.filter((w) => w.enabled).length} active
          </div>
        </div>

        <div className="pt-4 border-t border-[var(--sentinel-divider)] grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--sentinel-ink)]">Browser Desktop Push</p>
            <button
              type="button"
              onClick={() => void onRequestBrowserPush()}
              disabled={browserPushPermission === 'granted'}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[var(--sentinel-teal)] rounded-md hover:bg-[var(--sentinel-teal-hover)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              <BellRing className="w-3.5 h-3.5" />
              {browserPushPermission === 'granted' ? 'Browser Push Granted' : 'Enable Browser Push'}
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--sentinel-ink)]">Ops Desk Alert Chime</p>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                void onUpdatePrefs({ soundChimeEnabled: !notificationPrefs.soundChimeEnabled })
              }
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md border whitespace-nowrap cursor-pointer ${
                notificationPrefs.soundChimeEnabled
                  ? 'bg-[var(--sentinel-teal-soft)] text-[var(--sentinel-teal-ink)] border-[var(--sentinel-teal)]/40'
                  : 'surface-inset text-[var(--sentinel-ink)] hover:bg-[var(--sentinel-hover)]'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              {notificationPrefs.soundChimeEnabled ? 'Alert Chime On' : 'Enable Alert Chime'}
            </button>
          </div>

          <div className="space-y-2">
            <label htmlFor="pref-min-severity" className="block text-xs font-semibold text-[var(--sentinel-ink)]">
              Minimum Push Severity
            </label>
            <select
              id="pref-min-severity"
              value={notificationPrefs.minPushSeverity}
              onChange={(e) => void onUpdatePrefs({ minPushSeverity: e.target.value as Severity })}
              className="w-full px-3 py-2 text-xs font-medium surface-input rounded-md"
            >
              <option value="low">All severities (Low+)</option>
              <option value="medium">Medium, High &amp; Critical</option>
              <option value="high">High &amp; Critical only</option>
              <option value="critical">Critical only</option>
            </select>
          </div>
        </div>
      </section>

      {testFeedback && (
        <div
          className="p-4 rounded-lg bg-[var(--sentinel-teal-soft)] border border-[var(--sentinel-teal)]/40 text-sm font-medium text-[var(--sentinel-teal-ink)]"
          data-testid="webhook-test-banner"
        >
          {testFeedback}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section className="xl:col-span-8 window-nude rounded-lg overflow-hidden">
          <div className="p-4 border-b border-[var(--sentinel-divider)] flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--sentinel-ink)]">Configured Endpoints</h2>
            <span className="text-xs text-[var(--sentinel-ink-muted)]">
              Live HMAC-SHA256 HTTP delivery
            </span>
          </div>

          <div className="divide-y divide-[var(--sentinel-divider)]" data-testid="webhook-endpoint-list">
            {webhooks.map((wh) => (
              <div
                key={wh.id}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[var(--sentinel-suede)]/55 transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-[var(--sentinel-ink)] text-sm">{wh.name}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-[var(--sentinel-ink-secondary)]">{wh.provider}</span>
                    <span aria-hidden="true">·</span>
                    <span className={wh.enabled ? 'text-[var(--sentinel-teal)] font-semibold' : 'text-[var(--sentinel-ink-muted)]'}>
                      {wh.enabled ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-[var(--sentinel-ink-secondary)] truncate">{wh.url}</p>
                  <p className="text-xs text-[var(--sentinel-ink-muted)] font-mono tabular-nums">
                    Secret {wh.signingSecretPreview} · Min: {wh.minSeverity}
                    {wh.lastDeliveryAt
                      ? ` · HTTP ${wh.lastStatusCode ?? 'ERR'} (${formatRelativeTime(wh.lastDeliveryAt)})`
                      : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void handleTest(wh)}
                    aria-label={`Send signed test to ${wh.name}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[var(--sentinel-teal)] rounded-md hover:bg-[var(--sentinel-teal-hover)] whitespace-nowrap disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {busyAction === `test-wh:${wh.id}` ? 'Sending...' : 'Send Signed Test'}
                  </button>

                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void onToggleWebhook(wh.id, !wh.enabled)}
                    className="px-3 py-1.5 text-xs font-medium text-[var(--sentinel-ink)] surface-inset rounded-md hover:bg-[var(--sentinel-hover)] whitespace-nowrap cursor-pointer"
                  >
                    {wh.enabled ? 'Pause' : 'Resume'}
                  </button>

                  {wh.provider !== 'sentinel_loopback' && (
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => void onDeleteWebhook(wh.id)}
                      aria-label={`Remove webhook ${wh.name}`}
                      className="p-1.5 text-[var(--sentinel-crit)] hover:bg-[var(--sentinel-crit-bg)] rounded-md cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="xl:col-span-4 window-suede rounded-lg p-5">
          <div className="flex items-center gap-2">
            <Webhook className="w-4 h-4 text-[var(--sentinel-teal)]" />
            <h2 className="text-sm font-semibold text-[var(--sentinel-ink)]">Add Outbound Webhook</h2>
          </div>

          <form onSubmit={handleAdd} className="mt-4 space-y-3.5">
            <div>
              <label htmlFor="wh-name" className="block text-xs font-medium text-[var(--sentinel-ink)]">
                Destination Name
              </label>
              <input
                id="wh-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. #secops-alerts Slack"
                className="mt-1 w-full px-3 py-2 text-sm surface-input rounded-md"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="wh-provider" className="block text-xs font-medium text-[var(--sentinel-ink)]">
                  Format
                </label>
                <select
                  id="wh-provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as WebhookEndpoint['provider'])}
                  className="mt-1 w-full px-2.5 py-2 text-xs surface-input rounded-md"
                >
                  <option value="slack">Slack Blocks</option>
                  <option value="pagerduty">PagerDuty v2</option>
                  <option value="teams">MS Teams</option>
                  <option value="generic_json">Generic JSON</option>
                </select>
              </div>
              <div>
                <label htmlFor="wh-severity" className="block text-xs font-medium text-[var(--sentinel-ink)]">
                  Min Severity
                </label>
                <select
                  id="wh-severity"
                  value={minSeverity}
                  onChange={(e) => setMinSeverity(e.target.value as Severity)}
                  className="mt-1 w-full px-2.5 py-2 text-xs surface-input rounded-md"
                >
                  <option value="low">Low+</option>
                  <option value="medium">Medium+</option>
                  <option value="high">High+</option>
                  <option value="critical">Critical only</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="wh-url" className="block text-xs font-medium text-[var(--sentinel-ink)]">
                Endpoint URL
              </label>
              <input
                id="wh-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="mt-1 w-full px-3 py-2 text-sm font-mono surface-input rounded-md"
              />
            </div>

            {formError && <p className="text-xs font-semibold text-[var(--sentinel-crit)]">{formError}</p>}

            <button
              type="submit"
              disabled={busyAction !== null}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[var(--sentinel-teal)] rounded-md hover:bg-[var(--sentinel-teal-hover)] whitespace-nowrap disabled:opacity-50 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Register Signed Webhook
            </button>
          </form>
        </section>
      </div>

      <section className="window-suede rounded-lg overflow-hidden">
        <div className="p-4 border-b border-[var(--sentinel-divider)] flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--sentinel-ink)]">Signed Webhook Delivery Log</h2>
          <span className="text-xs font-mono tabular-nums text-[var(--sentinel-ink-muted)]">
            {webhookDeliveries.length} attempt(s)
          </span>
        </div>

        {webhookDeliveries.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--sentinel-ink-secondary)]">
            No deliveries yet. Click “Send Signed Test” or trigger an anomaly from the Phone Attacker portal.
          </div>
        ) : (
          <div className="overflow-x-auto" data-testid="webhook-delivery-table">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--sentinel-divider)] text-[var(--sentinel-ink-muted)] bg-[var(--sentinel-nude)]/70">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Endpoint &amp; Event</th>
                  <th className="py-2.5 px-4">HMAC Signature</th>
                  <th className="py-2.5 px-4">Response</th>
                  <th className="py-2.5 px-4 text-right">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sentinel-divider)]">
                {webhookDeliveries.map((d) => (
                  <tr key={d.id} className="hover:bg-[var(--sentinel-nude)]/40">
                    <td className="py-3 px-4 font-mono tabular-nums text-[var(--sentinel-ink-secondary)] whitespace-nowrap">
                      {formatUtcTime(d.timestamp)}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-[var(--sentinel-ink)]">{d.webhookName}</p>
                      <p className="text-[var(--sentinel-ink-secondary)]">
                        <span className={severityTextClass(d.severity)}>{severityLabel(d.severity)}</span>
                        {' · '}
                        {d.payloadSummary}
                      </p>
                    </td>
                    <td className="py-3 px-4 font-mono text-[var(--sentinel-ink-secondary)] whitespace-nowrap">
                      {d.signatureHeader}
                    </td>
                    <td className="py-3 px-4 font-mono text-[var(--sentinel-ink-secondary)] max-w-xs truncate">
                      {d.responsePreview}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap font-mono tabular-nums">
                      {d.status === 'delivered' ? (
                        <span className="inline-flex items-center gap-1 text-[var(--sentinel-teal)] font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          HTTP {d.statusCode} · {d.latencyMs}ms
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[var(--sentinel-crit)] font-semibold">
                          <XCircle className="w-3.5 h-3.5" />
                          {d.statusCode ? `HTTP ${d.statusCode}` : 'Failed'} · {d.latencyMs}ms
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
