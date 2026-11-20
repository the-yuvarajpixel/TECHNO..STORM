import crypto from 'node:crypto';
import type { RawIngestEvent, RedactedEvent, RedactionFinding, RedactionKind } from './types.ts';

function hmacToken(value: string, edgeSalt: string): string {
  return crypto
    .createHmac('sha256', edgeSalt)
    .update(value)
    .digest('hex')
    .slice(0, 12);
}

export function calculateShannonEntropy(input: string): number {
  if (!input.length) return 0;
  const counts = new Map<string, number>();
  for (const ch of input) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / input.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

interface PatternRule {
  kind: RedactionKind;
  regex: RegExp;
  label: string;
}

const REDACTION_RULES: PatternRule[] = [
  {
    kind: 'jwt_bearer',
    regex: /\b(?:Bearer\s+)?eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g,
    label: 'JWT_TOKEN',
  },
  {
    kind: 'aws_key',
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    label: 'AWS_KEY',
  },
  {
    kind: 'api_key',
    regex: /\b(?:sk_live|sk_test|pk_live|ak|ghp|xoxb|xoxp|hf_live)_[A-Za-z0-9_-]{8,}\b/g,
    label: 'API_KEY',
  },
  {
    kind: 'iban',
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,28}\b/g,
    label: 'IBAN',
  },
  {
    kind: 'ssn',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    label: 'SSN',
  },
  {
    kind: 'card_pan',
    regex: /\b(?:\d[ -]*?){13,16}\b/g,
    label: 'CARD_PAN',
  },
  {
    kind: 'bank_account',
    regex: /\b(?:acct|account|routing|sort_code)[=:\s#]+([0-9-]{6,16})\b/gi,
    label: 'BANK_ACCT',
  },
  {
    kind: 'email',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    label: 'EMAIL',
  },
];

export function redactTextAtEdge(
  text: string,
  field: string,
  edgeSalt: string,
): { redacted: string; findings: RedactionFinding[] } {
  const findings: RedactionFinding[] = [];
  let output = text;

  for (const rule of REDACTION_RULES) {
    output = output.replace(rule.regex, (match) => {
      // Avoid false-matching IPv4 or timestamps on card_pan rule
      if (rule.kind === 'card_pan') {
        const digitsOnly = match.replace(/\D/g, '');
        if (digitsOnly.length < 13 || digitsOnly.length > 16) {
          return match;
        }
      }
      const tokenHash = hmacToken(match, edgeSalt);
      const masked = `[REDACTED:${rule.label}#${tokenHash}]`;
      findings.push({
        kind: rule.kind,
        field,
        tokenHash,
        previewMasked: masked,
      });
      return masked;
    });
  }

  // Secondary pass: detect high-entropy opaque secrets (e.g. passwords/tokens in tickets)
  output = output.replace(/\b[A-Za-z0-9+/=_-]{24,}\b/g, (candidate) => {
    if (candidate.startsWith('REDACTED') || /^[0-9a-f]{32,64}$/i.test(candidate)) {
      return candidate;
    }
    const hasMixedClasses =
      /[A-Z]/.test(candidate) && /[a-z]/.test(candidate) && /\d/.test(candidate);
    if (hasMixedClasses && calculateShannonEntropy(candidate) >= 3.85) {
      const tokenHash = hmacToken(candidate, edgeSalt);
      const masked = `[REDACTED:SECRET#${tokenHash}]`;
      findings.push({
        kind: 'high_entropy_secret',
        field,
        tokenHash,
        previewMasked: masked,
      });
      return masked;
    }
    return candidate;
  });

  return { redacted: output, findings };
}

export function hashApiKeyIdentifier(rawKey: string, edgeSalt: string): string {
  return `key_${hmacToken(rawKey.trim(), edgeSalt)}`;
}

/**
 * Customer-Edge Redaction Boundary.
 * Strips PII and secrets BEFORE the payload crosses the outbound-only mTLS agent
 * into Sentinel's regional data plane. Never persists raw secrets.
 */
export function runEdgeRedaction(raw: RawIngestEvent, edgeSalt: string): RedactedEvent {
  const eventId = raw.id ?? `evt_${crypto.randomUUID().slice(0, 8)}`;

  // Extract hashed API key reference if a key appears in the payload or actor so honey traps
  // and machine fingerprints still correlate accurately without storing plaintext keys.
  const keyMatch = raw.rawPayload.match(/\b(?:sk_live|sk_test|ak|hf_live)_[A-Za-z0-9_-]{8,}\b/);
  const derivedApiKeyHash = raw.apiKeyHash ?? (keyMatch ? hashApiKeyIdentifier(keyMatch[0], edgeSalt) : undefined);

  const actorPass = redactTextAtEdge(raw.rawActor, 'actor', edgeSalt);
  const payloadPass = redactTextAtEdge(raw.rawPayload, 'payload', edgeSalt);

  return {
    eventId,
    sourceSystem: raw.sourceSystem.trim() || 'unknown-system',
    rawTimestamp: raw.rawTimestamp || new Date().toISOString(),
    clockSkewMs: typeof raw.clockSkewMs === 'number' ? raw.clockSkewMs : 0,
    redactedActor: actorPass.redacted,
    action: raw.action.trim() || 'api.request',
    sourceIp: raw.sourceIp.trim() || '0.0.0.0',
    endpoint: raw.endpoint?.trim() || '/v1/events',
    volumeCount: typeof raw.volumeCount === 'number' && raw.volumeCount > 0 ? raw.volumeCount : 1,
    redactedPayload: payloadPass.redacted,
    redactions: [...actorPass.findings, ...payloadPass.findings],
    targetVendorId: raw.targetVendorId,
    apiKeyHash: derivedApiKeyHash,
    redactedAt: new Date().toISOString(),
  };
}
