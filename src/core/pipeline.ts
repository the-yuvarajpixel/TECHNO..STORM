import crypto from 'node:crypto';
import type {
  BlastRadiusPreview,
  ControlAssertion,
  ControlDriftReport,
  ExplainWhyFactor,
  HoneyTrap,
  MachineFingerprint,
  NormalizedEvent,
  RedactedEvent,
  SecurityAlert,
  VaultEntry,
  VaultVerificationResult,
} from './types.ts';

export interface IdentityAliasDirectory {
  [rawAliasLower: string]: {
    canonicalActorId: string;
    label: string;
  };
}

/**
 * Normalizer: Stitches source clock skew into canonical UTC and resolves
 * disparate actor aliases across Cloud, ERP, Okta, and Payroll into one canonical ID.
 */
export function normalizeEvent(
  redacted: RedactedEvent,
  aliasDirectory: IdentityAliasDirectory,
): NormalizedEvent {
  const parsedMs = Date.parse(redacted.rawTimestamp);
  const baseMs = Number.isFinite(parsedMs) ? parsedMs : Date.now();
  const correctedMs = baseMs - redacted.clockSkewMs;
  const canonicalTimestamp = new Date(correctedMs).toISOString();

  const lookupKey = redacted.redactedActor.trim().toLowerCase();
  const matchedAlias = aliasDirectory[lookupKey];

  const canonicalActorId = matchedAlias
    ? matchedAlias.canonicalActorId
    : `actor_${crypto.createHash('sha256').update(lookupKey).digest('hex').slice(0, 8)}`;

  const canonicalActorLabel = matchedAlias
    ? matchedAlias.label
    : redacted.redactedActor;

  return {
    eventId: redacted.eventId,
    sourceSystem: redacted.sourceSystem,
    canonicalTimestamp,
    originalTimestamp: redacted.rawTimestamp,
    clockDriftCorrectedMs: redacted.clockSkewMs,
    canonicalActorId,
    canonicalActorLabel,
    rawActorAlias: redacted.redactedActor,
    action: redacted.action,
    sourceIp: redacted.sourceIp,
    endpoint: redacted.endpoint,
    volumeCount: redacted.volumeCount,
    redactedPayload: redacted.redactedPayload,
    redactions: redacted.redactions,
    targetVendorId: redacted.targetVendorId,
    apiKeyHash: redacted.apiKeyHash,
  };
}

/**
 * Tamper-Evident Log Vault: Cryptographic SHA-256 hash chaining bound to customer-held key fingerprint.
 */
export function computeVaultEntryHash(entry: Omit<VaultEntry, 'entryHash'>): string {
  const canonical = [
    entry.sequence,
    entry.timestamp,
    entry.entryType,
    entry.actor,
    entry.summary,
    entry.redactionsCount,
    entry.payloadDigest,
    entry.prevHash,
    entry.region,
    entry.customerKeyFingerprint,
  ].join('|');

  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function appendVaultEntry(
  existingEntries: VaultEntry[],
  params: {
    entryType: VaultEntry['entryType'];
    actor: string;
    summary: string;
    redactionsCount: number;
    payloadForDigest: string;
    region: string;
    customerKeyFingerprint: string;
    timestamp?: string;
    sourceSystem?: string;
    sourceIp?: string;
    endpoint?: string;
    logFileRef?: string;
    redactedSnippet?: string;
    matchedIndicator?: string;
  },
): VaultEntry {
  const last = existingEntries[existingEntries.length - 1];
  const sequence = last ? last.sequence + 1 : 1;
  const prevHash = last ? last.entryHash : '0'.repeat(64);
  const payloadDigest = crypto
    .createHash('sha256')
    .update(params.payloadForDigest)
    .digest('hex')
    .slice(0, 24);

  const draft: Omit<VaultEntry, 'entryHash'> = {
    sequence,
    timestamp: params.timestamp ?? new Date().toISOString(),
    entryType: params.entryType,
    actor: params.actor,
    summary: params.summary,
    redactionsCount: params.redactionsCount,
    payloadDigest,
    prevHash,
    region: params.region,
    customerKeyFingerprint: params.customerKeyFingerprint,
    sourceSystem: params.sourceSystem,
    sourceIp: params.sourceIp,
    endpoint: params.endpoint,
    logFileRef: params.logFileRef,
    redactedSnippet: params.redactedSnippet,
    matchedIndicator: params.matchedIndicator,
  };

  return {
    ...draft,
    entryHash: computeVaultEntryHash(draft),
  };
}

export function verifyVaultChain(entries: VaultEntry[]): VaultVerificationResult {
  const checkedAt = new Date().toISOString();
  if (entries.length === 0) {
    return {
      valid: true,
      totalEntries: 0,
      verifiedEntries: 0,
      headHash: '0'.repeat(64),
      brokenAtSequence: null,
      checkedAt,
    };
  }

  let expectedPrevHash = '0'.repeat(64);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        verifiedEntries: i,
        headHash: entries[entries.length - 1].entryHash,
        brokenAtSequence: entry.sequence,
        checkedAt,
      };
    }

    const { entryHash, ...rest } = entry;
    const recomputed = computeVaultEntryHash(rest);
    if (recomputed !== entryHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        verifiedEntries: i,
        headHash: entries[entries.length - 1].entryHash,
        brokenAtSequence: entry.sequence,
        checkedAt,
      };
    }
    expectedPrevHash = entry.entryHash;
  }

  return {
    valid: true,
    totalEntries: entries.length,
    verifiedEntries: entries.length,
    headHash: entries[entries.length - 1].entryHash,
    brokenAtSequence: null,
    checkedAt,
  };
}

/**
 * Detection Engine — Honey Traps (Near-Certain Alerts).
 */
export function evaluateHoneyTrap(
  event: NormalizedEvent,
  traps: HoneyTrap[],
): { matchedTrap: HoneyTrap; factors: ExplainWhyFactor[] } | null {
  for (const trap of traps) {
    const keyMatch =
      trap.kind === 'honey_key' &&
      ((event.apiKeyHash && event.apiKeyHash === trap.tokenHash) ||
        event.redactedPayload.includes(trap.identifier) ||
        event.rawActorAlias.includes(trap.identifier));

    const vendorMatch =
      trap.kind === 'honey_vendor' &&
      ((event.targetVendorId && event.targetVendorId === trap.identifier) ||
        event.redactedPayload.includes(trap.identifier));

    if (keyMatch || vendorMatch) {
      return {
        matchedTrap: trap,
        factors: [
          {
            dimension: 'honey_trap',
            summary:
              trap.kind === 'honey_key'
                ? `Decoy API credential "${trap.label}" was invoked from ${event.sourceIp}`
                : `Decoy vendor record "${trap.label}" (${trap.identifier}) was accessed`,
            expected: 'Zero legitimate traffic ever touches this planted decoy',
            observed: `${event.action} via ${event.sourceSystem} (${event.sourceIp})`,
            weight: 1.0,
          },
        ],
      };
    }
  }
  return null;
}

/**
 * Detection Engine — Machine-Identity Fingerprint Baseline Evaluation (Statement A).
 */
export function evaluateFingerprintAnomaly(
  event: NormalizedEvent,
  fingerprint: MachineFingerprint,
): {
  isAnomaly: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  factors: ExplainWhyFactor[];
} {
  const factors: ExplainWhyFactor[] = [];
  const hourUtc = new Date(event.canonicalTimestamp).getUTCHours();
  const [startHour, endHour] = fingerprint.allowedHoursUtc;

  const insideHours =
    startHour <= endHour
      ? hourUtc >= startHour && hourUtc <= endHour
      : hourUtc >= startHour || hourUtc <= endHour;

  if (!insideHours) {
    const baselineAtHour = fingerprint.hourlyBaseline[hourUtc] ?? 0;
    factors.push({
      dimension: 'time_window',
      summary: `Executed at ${String(hourUtc).padStart(2, '0')}:00 UTC outside normal ${String(startHour).padStart(2, '0')}:00–${String(endHour).padStart(2, '0')}:00 UTC window`,
      expected: `${String(startHour).padStart(2, '0')}:00–${String(endHour).padStart(2, '0')}:00 UTC (baseline ${baselineAtHour} req/hr at this hour)`,
      observed: `${String(hourUtc).padStart(2, '0')}:00 UTC`,
      weight: 0.42,
    });
  }

  if (!fingerprint.knownIps.includes(event.sourceIp)) {
    factors.push({
      dimension: 'source_ip',
      summary: `Unseen source IP ${event.sourceIp} not in 90-day learned address list`,
      expected: fingerprint.knownIps.join(', '),
      observed: event.sourceIp,
      weight: 0.45,
    });
  }

  const volumeThreshold = Math.max(
    fingerprint.normalVolumeMean + fingerprint.normalVolumeStdDev * 3,
    fingerprint.normalVolumeMean * 2.2,
  );
  if (event.volumeCount > volumeThreshold) {
    const ratio = (event.volumeCount / Math.max(1, fingerprint.normalVolumeMean)).toFixed(1);
    factors.push({
      dimension: 'volume',
      summary: `Request volume ${event.volumeCount} req/hr is ${ratio}x above normal baseline`,
      expected: `${fingerprint.normalVolumeMean} ± ${fingerprint.normalVolumeStdDev} req/hr`,
      observed: `${event.volumeCount} req/hr`,
      weight: 0.35,
    });
  }

  if (
    fingerprint.typicalEndpoints.length > 0 &&
    !fingerprint.typicalEndpoints.includes(event.endpoint)
  ) {
    factors.push({
      dimension: 'endpoint',
      summary: `Accessed uncommon endpoint ${event.endpoint}`,
      expected: fingerprint.typicalEndpoints.join(', '),
      observed: event.endpoint,
      weight: 0.25,
    });
  }

  const totalScore = Math.min(
    0.99,
    factors.reduce((sum, f) => sum + f.weight, 0),
  );

  if (totalScore < 0.4) {
    return { isAnomaly: false, severity: 'low', confidence: totalScore, factors };
  }

  const severity =
    totalScore >= 0.82 ? 'critical' : totalScore >= 0.62 ? 'high' : 'medium';

  return {
    isAnomaly: true,
    severity,
    confidence: Number(totalScore.toFixed(2)),
    factors,
  };
}

/**
 * Adaptive Feedback Loop: Approve/Dismiss updates the machine-identity fingerprint baseline.
 */
export function applyFingerprintFeedback(
  fingerprint: MachineFingerprint,
  alert: SecurityAlert,
  decision: 'approve' | 'dismiss',
): MachineFingerprint {
  if (decision === 'approve') {
    return {
      ...fingerprint,
      confirmedAlerts: fingerprint.confirmedAlerts + 1,
    };
  }

  // Dismiss teaches Sentinel that this IP / hour / volume is legitimate normal behavior.
  const nextKnownIps = fingerprint.knownIps.includes(alert.sourceIp)
    ? fingerprint.knownIps
    : [...fingerprint.knownIps, alert.sourceIp];

  const nextHourlyBaseline = [...fingerprint.hourlyBaseline];
  const hr = Math.max(0, Math.min(23, alert.observedHourUtc));
  nextHourlyBaseline[hr] = Math.max(nextHourlyBaseline[hr], Math.round(alert.observedVolume * 0.6));

  let [startHour, endHour] = fingerprint.allowedHoursUtc;
  if (hr < startHour) startHour = hr;
  if (hr > endHour) endHour = hr;

  const nextMean =
    alert.observedVolume > fingerprint.normalVolumeMean
      ? Math.round((fingerprint.normalVolumeMean * 3 + alert.observedVolume) / 4)
      : fingerprint.normalVolumeMean;

  return {
    ...fingerprint,
    knownIps: nextKnownIps,
    hourlyBaseline: nextHourlyBaseline,
    allowedHoursUtc: [startHour, endHour],
    normalVolumeMean: nextMean,
    learnedDismissals: fingerprint.learnedDismissals + 1,
  };
}

/**
 * Decision Engine — Blast-Radius Preview before any containment write.
 */
export function buildBlastRadiusPreview(params: {
  fingerprint?: MachineFingerprint;
  targetActorId: string;
  targetLabel: string;
  sourceIp: string;
  isHoneyTrap?: boolean;
}): BlastRadiusPreview {
  const { fingerprint, targetActorId, targetLabel, sourceIp, isHoneyTrap } = params;

  if (isHoneyTrap) {
    return {
      targetActorId,
      targetLabel,
      businessContextWarning: null,
      affectedDownstream: ['Zero production dependencies (decoy credential / record)'],
      recommendedOptionId: 'opt_revoke_honey',
      options: [
        {
          id: 'opt_revoke_honey',
          mode: 'full_suspend',
          title: 'Revoke decoy token & block caller IP',
          description: `Immediately invalidate decoy artifact and add ${sourceIp} to edge deny-list. Zero production workflows depend on this honey trap.`,
          scopeSummary: `Deny IP ${sourceIp} + revoke decoy artifact`,
          disruptedServices: [],
          estimatedUsersImpacted: 0,
          businessRisk: 'low',
          reversible: true,
        },
        {
          id: 'opt_observe_honey',
          mode: 'narrow_scoped',
          title: 'Rate-limit caller IP & capture forensic metadata',
          description: `Keep decoy route returning synthetic 403 while rate-limiting ${sourceIp} to observe follow-on probing.`,
          scopeSummary: `Throttle ${sourceIp} to 1 req/min`,
          disruptedServices: [],
          estimatedUsersImpacted: 0,
          businessRisk: 'low',
          reversible: true,
        },
      ],
    };
  }

  const dependencies = fingerprint?.criticalDependencies ?? ['Internal API Gateway'];
  const isPayday = Boolean(fingerprint?.paydaySensitive);

  return {
    targetActorId,
    targetLabel,
    businessContextWarning: isPayday
      ? 'Full suspension would halt Payroll Disbursement on pay day (412 employees awaiting BACS settlement).'
      : dependencies.length > 0
        ? `Full suspension impacts ${dependencies.join(', ')}. Consider narrower IP-scoped containment first.`
        : null,
    affectedDownstream: dependencies,
    recommendedOptionId: 'opt_narrow_scope',
    options: [
      {
        id: 'opt_narrow_scope',
        mode: 'narrow_scoped',
        title: `Block unseen IP ${sourceIp} & restrict key to read-only outside office CIDR`,
        description:
          'Stops the anomalous session immediately while keeping scheduled payroll/ERP jobs running from verified office IPs.',
        scopeSummary: `Block ${sourceIp} + restrict write scopes off-CIDR`,
        disruptedServices: [],
        estimatedUsersImpacted: 0,
        businessRisk: 'low',
        reversible: true,
      },
      {
        id: 'opt_full_suspend',
        mode: 'full_suspend',
        title: `Suspend ${targetLabel} globally`,
        description:
          'Revokes the API key across every caller, including scheduled production batch jobs.',
        scopeSummary: `Global key disable for ${targetLabel}`,
        disruptedServices: dependencies,
        estimatedUsersImpacted: isPayday ? 412 : 45,
        businessRisk: 'high',
        reversible: true,
      },
    ],
  };
}

/**
 * Paperwork vs Reality: Computes Control Drift Score (0..100) and Audit Committee summary.
 */
export function computeControlDriftReport(assertions: ControlAssertion[]): ControlDriftReport {
  let alignedCount = 0;
  let driftingCount = 0;
  let violatedCount = 0;
  let totalPossible = 0;
  let actualDrift = 0;

  for (const item of assertions) {
    totalPossible += item.driftWeight;
    if (item.status === 'aligned') {
      alignedCount++;
    } else if (item.status === 'drifting') {
      driftingCount++;
      actualDrift += item.driftWeight * 0.55;
    } else {
      violatedCount++;
      actualDrift += item.driftWeight;
    }
  }

  const driftScore = totalPossible > 0 ? Math.round((actualDrift / totalPossible) * 100) : 0;

  const auditChairAnswer =
    violatedCount > 0
      ? `${violatedCount} stated control${violatedCount > 1 ? 's' : ''} in the risk register ${violatedCount === 1 ? 'contradicts' : 'contradict'} live telemetry (${driftingCount} drifting, ${alignedCount} aligned). Control drift sits at ${driftScore}/100 — immediate remediation is prioritized on violated payroll and vendor controls.`
      : driftingCount > 0
        ? `No hard control violations active, though ${driftingCount} control${driftingCount > 1 ? 's are' : ' is'} drifting from written policy (drift score ${driftScore}/100).`
        : `All ${alignedCount} monitored controls match live system telemetry (drift score 0/100).`;

  return {
    driftScore,
    alignedCount,
    driftingCount,
    violatedCount,
    auditChairAnswer,
    assertions,
  };
}

/**
 * Legal Evidence Pack builder: outputs PII-free, hash-verified audit documentation.
 */
export function buildLegalEvidencePack(params: {
  tenantName: string;
  region: string;
  customerKmsKeyId: string;
  breachCase: {
    id: string;
    title: string;
    regulator: string;
    detectedAt: string;
    deadlineAt: string;
    customerPiiExposed: boolean;
  };
  vaultVerification: VaultVerificationResult;
  recentVaultEntries: VaultEntry[];
  alerts: SecurityAlert[];
}): {
  generatedAt: string;
  packHash: string;
  document: Record<string, unknown>;
} {
  const generatedAt = new Date().toISOString();
  const document = {
    schema: 'sentinel.legal-evidence-pack.v1',
    generatedAt,
    tenantName: params.tenantName,
    dataResidencyRegion: params.region,
    customerKmsKeyId: params.customerKmsKeyId,
    counselNotice:
      'Verify statutory notification windows and data-residency assertions with qualified legal counsel before regulatory filing.',
    incident: {
      caseId: params.breachCase.id,
      title: params.breachCase.title,
      regulator: params.breachCase.regulator,
      detectedAtUtc: params.breachCase.detectedAt,
      statutoryDeadlineUtc: params.breachCase.deadlineAt,
      customerPiiExposedInSentinel: false,
      customerPiiExposureAssessment: params.breachCase.customerPiiExposed
        ? 'Under investigation in customer environment (Sentinel vault holds redacted digests only)'
        : 'No evidence of customer PII exfiltration',
    },
    cryptographicIntegrity: {
      chainValid: params.vaultVerification.valid,
      verifiedEntries: params.vaultVerification.verifiedEntries,
      headSha256: params.vaultVerification.headHash,
    },
    alertSummary: params.alerts.map((a) => ({
      id: a.id,
      severity: a.severity,
      category: a.category,
      status: a.status,
      createdAt: a.createdAt,
      actorId: a.canonicalActorId,
      explainWhy: a.explainWhy.map((f) => f.summary),
      responseTaken: a.activeResponse
        ? {
            mode: a.activeResponse.mode,
            executedAt: a.activeResponse.executedAt,
            undoneAt: a.activeResponse.undoneAt,
          }
        : null,
    })),
    auditChainExcerpt: params.recentVaultEntries.slice(-15).map((e) => ({
      sequence: e.sequence,
      timestamp: e.timestamp,
      entryType: e.entryType,
      summary: e.summary,
      redactionsCount: e.redactionsCount,
      entryHash: e.entryHash,
    })),
  };

  const packHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(document))
    .digest('hex');

  return { generatedAt, packHash, document };
}
