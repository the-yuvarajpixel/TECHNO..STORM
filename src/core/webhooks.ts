import crypto from 'node:crypto';
import type { PushNotificationEvent, Severity, WebhookEndpoint } from './types.ts';

const SEVERITY_RANK: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function severityMeetsThreshold(actual: Severity, minimum: Severity): boolean {
  return SEVERITY_RANK[actual] >= SEVERITY_RANK[minimum];
}

export function signWebhookPayload(
  payloadJson: string,
  timestampIso: string,
  signingSecret: string,
): string {
  const mac = crypto
    .createHmac('sha256', signingSecret)
    .update(`${timestampIso}.${payloadJson}`)
    .digest('hex');
  return `sha256=${mac}`;
}

export function verifyWebhookSignature(
  payloadJson: string,
  timestampIso: string,
  signatureHeader: string,
  signingSecret: string,
): boolean {
  const expected = signWebhookPayload(payloadJson, timestampIso, signingSecret);
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function buildProviderWebhookPayload(params: {
  provider: WebhookEndpoint['provider'];
  region: string;
  tenantName: string;
  notification: PushNotificationEvent;
  endpointUrl?: string;
}): Record<string, unknown> {
  const { provider, region, tenantName, notification, endpointUrl } = params;

  if (endpointUrl && /discord(app)?\.com\/api\/webhooks\//i.test(endpointUrl)) {
    const colorMap: Record<Severity, number> = {
      critical: 0xdc2626,
      high: 0xd97706,
      medium: 0x0d6b53,
      low: 0x6b7280,
    };
    return {
      username: 'Sentinel Security Monitor',
      content: `**[Sentinel · ${notification.severity.toUpperCase()}]** ${notification.title}`,
      embeds: [
        {
          title: notification.title.slice(0, 256),
          description: notification.message.slice(0, 2000),
          color: colorMap[notification.severity] ?? 0x0d6b53,
          fields: [
            { name: 'Tenant', value: tenantName, inline: true },
            { name: 'Region', value: region, inline: true },
            { name: 'Severity', value: notification.severity.toUpperCase(), inline: true },
          ],
          footer: { text: 'Sentinel Zero-Trust Edge Redaction · Zero Raw PII' },
          timestamp: notification.timestamp,
        },
      ],
    };
  }

  if (provider === 'slack') {
    return {
      text: `[Sentinel · ${notification.severity.toUpperCase()}] ${notification.title} — ${notification.message}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `Sentinel Alert (${notification.severity.toUpperCase()})`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${notification.title}*\n${notification.message}\n_Tenant: ${tenantName} · Region: ${region} · Zero raw PII_`,
          },
        },
      ],
    };
  }

  if (provider === 'pagerduty') {
    return {
      event_action: 'trigger',
      dedup_key: notification.alertId ?? notification.id,
      payload: {
        summary: `[Sentinel] ${notification.title}`,
        severity: notification.severity === 'low' ? 'info' : notification.severity,
        source: `sentinel-${region}`,
        custom_details: {
          tenant: tenantName,
          message: notification.message,
          containsCustomerPii: false,
        },
      },
    };
  }

  if (provider === 'teams') {
    return {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: notification.title,
      themeColor: notification.severity === 'critical' ? 'C8281E' : '0D6B53',
      title: `Sentinel (${notification.severity.toUpperCase()}): ${notification.title}`,
      text: `${notification.message} (Region: ${region} · Edge-redacted, zero raw PII)`,
    };
  }

  return {
    schema: 'sentinel.webhook.v1',
    tenantName,
    region,
    containsCustomerPii: false,
    event: {
      id: notification.id,
      timestamp: notification.timestamp,
      severity: notification.severity,
      title: notification.title,
      message: notification.message,
      alertId: notification.alertId ?? null,
    },
  };
}
