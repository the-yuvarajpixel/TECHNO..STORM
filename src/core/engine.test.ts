import test from 'node:test';
import assert from 'node:assert/strict';
import { runEdgeRedaction, redactTextAtEdge, calculateShannonEntropy } from './redaction.ts';
import {
  appendVaultEntry,
  applyFingerprintFeedback,
  buildBlastRadiusPreview,
  computeControlDriftReport,
  evaluateFingerprintAnomaly,
  evaluateHoneyTrap,
  normalizeEvent,
  verifyVaultChain,
} from './pipeline.ts';
import { SentinelEngineStore } from './store.ts';
import type { VaultEntry } from './types.ts';

const TEST_SALT = 'unit-test-edge-salt';

test('Edge Redaction masks secrets and PII with deterministic HMAC tokens and leaks zero plaintext', () => {
  const secretKey = ['sk', 'live', 'payroll_9928172635abc'].join('_');
  const email = 'alice.chen@harborfinch.co.uk';
  const iban = 'GB29NWBK60161331926819';
  const ssn = '123-45-6789';

  const result = runEdgeRedaction(
    {
      sourceSystem: 'Helpdesk',
      rawTimestamp: '2026-11-19T03:15:00.000Z',
      rawActor: email,
      action: 'ticket.comment',
      sourceIp: '198.51.100.14',
      rawPayload: `Please check key ${secretKey} for IBAN ${iban} and SSN ${ssn} contact ${email}`,
    },
    TEST_SALT,
  );

  assert.equal(result.redactedPayload.includes(secretKey), false);
  assert.equal(result.redactedPayload.includes(email), false);
  assert.equal(result.redactedPayload.includes(iban), false);
  assert.equal(result.redactedPayload.includes(ssn), false);
  assert.equal(result.redactedActor.includes(email), false);
  assert.ok(result.redactions.length >= 4);

  // Deterministic HMAC: masking the same email twice yields the same token hash
  const second = redactTextAtEdge(`Follow up with ${email}`, 'body', TEST_SALT);
  const firstEmailToken = result.redactions.find((r) => r.kind === 'email')?.tokenHash;
  const secondEmailToken = second.findings.find((r) => r.kind === 'email')?.tokenHash;
  assert.equal(firstEmailToken, secondEmailToken);
  assert.ok(calculateShannonEntropy('Xy9#mK2$pL7@qR4!vN8&zT3*') > 3.85);
});

test('Normalizer stitches drifted clocks and resolves identity aliases', () => {
  const redacted = runEdgeRedaction(
    {
      sourceSystem: 'Payroll Runner',
      rawTimestamp: '2026-11-19T03:14:25.000Z',
      clockSkewMs: 5000,
      rawActor: 'payroll-runner-02',
      action: 'payroll.export',
      sourceIp: '185.220.101.44',
      rawPayload: 'Export triggered',
    },
    TEST_SALT,
  );

  const normalized = normalizeEvent(redacted, {
    'payroll-runner-02': {
      canonicalActorId: 'actor_payroll_svc',
      label: 'Payroll Disbursement Key (ak_payroll_prod)',
    },
  });

  assert.equal(normalized.canonicalTimestamp, '2026-11-19T03:14:20.000Z');
  assert.equal(normalized.canonicalActorId, 'actor_payroll_svc');
  assert.equal(normalized.clockDriftCorrectedMs, 5000);
});

test('Hash-chained Log Vault detects single-byte tampering deterministically', () => {
  const entries: VaultEntry[] = [];
  const e1 = appendVaultEntry(entries, {
    entryType: 'ingested_event',
    actor: 'actor_1',
    summary: 'Event 1',
    redactionsCount: 1,
    payloadForDigest: 'redacted-1',
    region: 'eu-west-2',
    customerKeyFingerprint: 'fp_byok_01',
  });
  entries.push(e1);

  const e2 = appendVaultEntry(entries, {
    entryType: 'alert_raised',
    actor: 'Sentinel',
    summary: 'Alert 1',
    redactionsCount: 0,
    payloadForDigest: 'alert-1',
    region: 'eu-west-2',
    customerKeyFingerprint: 'fp_byok_01',
  });
  entries.push(e2);

  const ok = verifyVaultChain(entries);
  assert.equal(ok.valid, true);
  assert.equal(ok.verifiedEntries, 2);

  // Tamper with entry 1 summary
  const tampered = entries.map((e, idx) => (idx === 0 ? { ...e, summary: 'Tampered Event 1' } : e));
  const check = verifyVaultChain(tampered);
  assert.equal(check.valid, false);
  assert.equal(check.brokenAtSequence, 1);
});

test('Fingerprint detection flags out-of-hours unseen IP spike and learns on Dismiss', () => {
  const store = new SentinelEngineStore({ storageFilePath: null, edgeSalt: TEST_SALT });
  const snap = store.getSnapshot();
  const payrollFp = snap.fingerprints.find((f) => f.id === 'fp_payroll')!;
  const payrollAlert = snap.alerts.find((a) => a.id === 'alt_payroll_03am')!;

  assert.equal(payrollAlert.severity, 'critical');
  assert.ok(payrollAlert.explainWhy.length >= 3);

  // Dismiss teaches the fingerprint that IP 185.220.101.44 & hour 03:00 UTC are legitimate
  const updatedFp = applyFingerprintFeedback(payrollFp, payrollAlert, 'dismiss');
  assert.ok(updatedFp.knownIps.includes('185.220.101.44'));
  assert.equal(updatedFp.learnedDismissals, payrollFp.learnedDismissals + 1);

  const recheck = evaluateFingerprintAnomaly(
    {
      eventId: 'evt_recheck',
      sourceSystem: 'BACS Payroll & HRIS',
      canonicalTimestamp: '2026-11-19T03:20:00.000Z',
      originalTimestamp: '2026-11-19T03:20:00.000Z',
      clockDriftCorrectedMs: 0,
      canonicalActorId: updatedFp.canonicalActorId,
      canonicalActorLabel: updatedFp.keyAlias,
      rawActorAlias: updatedFp.keyAlias,
      action: 'payroll.status',
      sourceIp: '185.220.101.44',
      endpoint: '/v2/payroll/status',
      volumeCount: 45,
      redactedPayload: 'status ok',
      redactions: [],
    },
    updatedFp,
  );

  assert.equal(recheck.isAnomaly, false);
});

test('Honey trap trigger raises near-certain alert and blasts push notification', () => {
  const pushed: Array<{ type: string; payload: unknown }> = [];
  const store = new SentinelEngineStore({
    storageFilePath: null,
    edgeSalt: TEST_SALT,
    broadcast: (type, payload) => pushed.push({ type, payload }),
  });

  const alert = store.triggerHoneyTrap('ht_key_1', '194.26.135.88');
  assert.equal(alert.severity, 'critical');
  assert.ok(alert.confidence >= 0.99);
  assert.equal(alert.category, 'honey_trap');
  assert.ok(pushed.some((p) => p.type === 'notification:push'));

  const snap = store.getSnapshot();
  assert.equal(snap.vaultVerification.valid, true);
  assert.equal(snap.metrics.honeyTrapHits, 1);
});

test('Safe response executes narrow action with blast-radius preview and 1-click undo logs both steps', () => {
  const store = new SentinelEngineStore({ storageFilePath: null, edgeSalt: TEST_SALT });
  const beforeSnap = store.getSnapshot();
  const payrollAlert = beforeSnap.alerts.find((a) => a.id === 'alt_payroll_03am')!;

  assert.ok(payrollAlert.blastRadius.businessContextWarning?.includes('pay day'));
  const narrowOption = payrollAlert.blastRadius.options.find((o) => o.mode === 'narrow_scoped')!;
  assert.equal(narrowOption.estimatedUsersImpacted, 0);

  const exec = store.executeResponse(payrollAlert.id, narrowOption.id, 'Test Operator');
  assert.equal(exec.mode, 'narrow_scoped');
  assert.equal(exec.undoneAt, null);

  const afterExec = store.getSnapshot();
  assert.equal(afterExec.fingerprints.find((f) => f.id === 'fp_payroll')?.status, 'scoped_restricted');

  const undone = store.undoResponse(payrollAlert.id, 'Test Operator');
  assert.ok(undone.undoneAt !== null);
  assert.ok(undone.undoVaultSequence !== null && undone.undoVaultSequence > undone.vaultSequence);

  const afterUndo = store.getSnapshot();
  assert.equal(afterUndo.fingerprints.find((f) => f.id === 'fp_payroll')?.status, 'active');
  assert.equal(afterUndo.vaultVerification.valid, true);
});

test('Control drift score and blast-radius preview helper compute consistent results', () => {
  const report = computeControlDriftReport([
    {
      id: 'c1',
      controlRef: 'IAM-1',
      framework: 'Policy',
      paperworkClaim: 'Claim',
      observedReality: 'Violated',
      status: 'violated',
      driftWeight: 50,
      evidenceCount: 1,
      owner: 'Ops',
      lastCheckedAt: new Date().toISOString(),
    },
    {
      id: 'c2',
      controlRef: 'LOG-1',
      framework: 'Policy',
      paperworkClaim: 'Claim',
      observedReality: 'Aligned',
      status: 'aligned',
      driftWeight: 50,
      evidenceCount: 1,
      owner: 'Sec',
      lastCheckedAt: new Date().toISOString(),
    },
  ]);

  assert.equal(report.driftScore, 50);
  assert.equal(report.violatedCount, 1);
  assert.equal(report.alignedCount, 1);

  const honeyPreview = buildBlastRadiusPreview({
    targetActorId: 'ht_1',
    targetLabel: 'Decoy Key',
    sourceIp: '1.2.3.4',
    isHoneyTrap: true,
  });
  assert.equal(honeyPreview.options[0].estimatedUsersImpacted, 0);

  const trapCheck = evaluateHoneyTrap(
    {
      eventId: 'e1',
      sourceSystem: 'ERP',
      canonicalTimestamp: new Date().toISOString(),
      originalTimestamp: new Date().toISOString(),
      clockDriftCorrectedMs: 0,
      canonicalActorId: 'a1',
      canonicalActorLabel: 'a1',
      rawActorAlias: 'a1',
      action: 'read',
      sourceIp: '5.5.5.5',
      endpoint: '/v1/vendors',
      volumeCount: 1,
      redactedPayload: 'Read VND-90412',
      redactions: [],
      targetVendorId: 'VND-90412',
    },
    [
      {
        id: 'ht_v',
        kind: 'honey_vendor',
        label: 'Meridian',
        identifier: 'VND-90412',
        tokenHash: 'hash_v',
        plantedLocation: 'ERP',
        createdAt: new Date().toISOString(),
        triggerCount: 0,
        lastTriggeredAt: null,
        status: 'armed',
      },
    ],
  );
  assert.ok(trapCheck !== null);
});

test('Webhook HMAC-SHA256 signatures verify cleanly and reject tampering', async () => {
  const { signWebhookPayload, verifyWebhookSignature, severityMeetsThreshold, buildProviderWebhookPayload } =
    await import('./webhooks.ts');

  const payload = JSON.stringify(
    buildProviderWebhookPayload({
      provider: 'slack',
      region: 'eu-west-2',
      tenantName: 'Harbor & Finch LLP',
      notification: {
        id: 'n1',
        timestamp: '2026-11-19T12:00:00.000Z',
        severity: 'critical',
        title: 'Honey key touched',
        message: 'Decoy key used from 194.26.135.88',
        channel: 'webhook',
        read: false,
      },
    }),
  );

  const ts = '2026-11-19T12:00:01.000Z';
  const secret = ['whsec', 'test_secret_123'].join('_');
  const sig = signWebhookPayload(payload, ts, secret);

  assert.equal(verifyWebhookSignature(payload, ts, sig, secret), true);
  assert.equal(verifyWebhookSignature(payload + 'tamper', ts, sig, secret), false);
  assert.equal(severityMeetsThreshold('critical', 'high'), true);
  assert.equal(severityMeetsThreshold('low', 'high'), false);
});

test('Manual attacker action mutates API key, records exact log spot, and pushes live alert', async () => {
  const pushed: Array<{ type: string; payload: unknown }> = [];
  const store = new SentinelEngineStore({
    storageFilePath: null,
    edgeSalt: TEST_SALT,
    broadcast: (type, payload) => pushed.push({ type, payload }),
  });

  const outcome = await store.executeManualAttackerAction({
    actionType: 'mutate_api_key',
    attackerAlias: 'phone-tester-01',
    sourceIp: '185.220.101.88',
    targetKeyAlias: 'ak_payroll_prod',
    mutationLabel: 'scope_escalation:payroll:write_all',
  });

  assert.equal(outcome.record.outcome, 'detected');
  assert.equal(outcome.trapped, false);
  assert.ok(outcome.alert !== null);
  assert.equal(outcome.alert?.origin, 'manual_attacker');
  assert.equal(outcome.alert?.attackerAlias, 'phone-tester-01');
  assert.equal(outcome.alert?.attackTarget, 'ak_payroll_prod');
  assert.equal(outcome.alert?.sourceVaultSequence, outcome.record.vaultSequence);
  assert.ok(outcome.alert?.logFileRef?.includes('/var/log/'));
  assert.ok(outcome.alert?.logSnippet && outcome.alert.logSnippet.length > 0);
  assert.ok(pushed.some((p) => p.type === 'notification:push'));

  const snap = store.getSnapshot();
  const matchedEntry = snap.vaultEntries.find((v) => v.sequence === outcome.alert?.sourceVaultSequence);
  assert.ok(matchedEntry !== undefined);
  assert.equal(snap.vaultVerification.valid, true);
});

test('Planted stealth honey key hides bait label, immediately traps & blocks intruder, rejects retries, and releases on Admin unblock', async () => {
  const pushed: Array<{ type: string; payload: unknown }> = [];
  const store = new SentinelEngineStore({
    storageFilePath: null,
    edgeSalt: TEST_SALT,
    broadcast: (type, payload) => pushed.push({ type, payload }),
  });

  // 1. Admin plants a new honey key — identifier must NOT reveal "honey" / "decoy" / "bait"
  const trap = store.createHoneyTrap({
    kind: 'honey_key',
    label: 'Finance S3 Backup Key',
    plantedLocation: 'api_keys_prod.env',
  });
  assert.equal(trap.identifier.toLowerCase().includes('honey'), false);
  assert.equal(trap.identifier.toLowerCase().includes('decoy'), false);
  assert.ok(trap.identifier.startsWith('ak_'));

  // 2. Attacker tries to mutate that disguised key -> IMMEDIATELY TRAPPED & BLOCKED
  const trapHit = await store.executeManualAttackerAction({
    actionType: 'mutate_api_key',
    attackerAlias: 'redteam-phone',
    sourceIp: '91.198.174.205',
    targetKeyAlias: trap.identifier,
    mutationLabel: 'scope_escalation:write_all',
  });
  assert.equal(trapHit.trapped, true);
  assert.equal(trapHit.blocked, true);
  assert.equal(trapHit.record.outcome, 'trapped_and_blocked');
  assert.equal(trapHit.alert?.trappedAndBlocked, true);
  assert.equal(trapHit.alert?.severity, 'critical');
  assert.equal(trapHit.alert?.attackerAlias, 'redteam-phone');
  assert.ok(trapHit.terminalOutput.includes('TRAPPED & BLOCKED'));

  const blockedSnap = store.getSnapshot();
  assert.equal(blockedSnap.blockedSessions.length, 1);
  assert.equal(blockedSnap.blockedSessions[0].sourceIp, '91.198.174.205');
  assert.equal(blockedSnap.vaultVerification.valid, true);

  // 3. Subsequent attack from that quarantined IP is immediately hard-blocked
  const retry = await store.executeManualAttackerAction({
    actionType: 'access_file',
    attackerAlias: 'redteam-phone',
    sourceIp: '91.198.174.205',
    fileId: 'file_payroll',
  });
  assert.equal(retry.trapped, true);
  assert.equal(retry.blocked, true);
  assert.ok(retry.terminalOutput.includes('403 CONNECTION TERMINATED'));

  // 4. Admin releases quarantine
  const remaining = store.unblockAttackerSession('91.198.174.205', 'Admin Tester');
  assert.equal(remaining.length, 0);
  assert.equal(store.getSnapshot().vaultVerification.valid, true);
});

test('Resolving an alert marks it resolved and appends an auditable vault entry', () => {
  const store = new SentinelEngineStore({ storageFilePath: null, edgeSalt: TEST_SALT });
  const beforeCount = store.getSnapshot().vaultEntries.length;

  const resolved = store.resolveAlert('alt_payroll_03am', 'SecOps Analyst', 'Key rotated & verified');
  assert.equal(resolved.status, 'resolved');
  assert.ok(resolved.resolvedAt !== undefined);
  assert.equal(resolved.resolvedBy, 'SecOps Analyst');

  const after = store.getSnapshot();
  assert.equal(after.vaultEntries.length, beforeCount + 1);
  assert.equal(after.vaultEntries[0].entryType, 'alert_resolved');
  assert.equal(after.vaultVerification.valid, true);
});


