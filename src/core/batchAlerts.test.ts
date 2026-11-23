import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAlertEligibleForBatchAction,
  pruneSelectionToExisting,
  summarizeBatchSelection,
  toggleAlertSelection,
  toggleSelectAllVisible,
} from './batchAlerts';
import { SentinelEngineStore } from './store';
import { verifyVaultChain } from './pipeline';

test('toggleAlertSelection adds and removes IDs immutably', () => {
  const initial = new Set<string>(['alt_1']);
  const added = toggleAlertSelection(initial, 'alt_2');
  assert.deepEqual([...added].sort(), ['alt_1', 'alt_2']);
  assert.deepEqual([...initial], ['alt_1']);

  const removed = toggleAlertSelection(added, 'alt_1');
  assert.deepEqual([...removed], ['alt_2']);
});

test('toggleSelectAllVisible selects all visible when partially selected and deselects only visible when all selected', () => {
  const initial = new Set<string>(['alt_hidden', 'alt_1']);
  const selectedAll = toggleSelectAllVisible(initial, ['alt_1', 'alt_2', 'alt_3']);
  assert.deepEqual([...selectedAll].sort(), ['alt_1', 'alt_2', 'alt_3', 'alt_hidden']);

  const deselectedVisible = toggleSelectAllVisible(selectedAll, ['alt_1', 'alt_2', 'alt_3']);
  assert.deepEqual([...deselectedVisible], ['alt_hidden']);
});

test('pruneSelectionToExisting removes deleted or stale alert IDs', () => {
  const pruned = pruneSelectionToExisting(
    new Set(['alt_1', 'alt_stale', 'alt_2']),
    new Set(['alt_1', 'alt_2', 'alt_3']),
  );
  assert.deepEqual([...pruned].sort(), ['alt_1', 'alt_2']);
});

test('summarizeBatchSelection separates eligible vs already-settled alerts and counts high/critical severity', () => {
  const store = new SentinelEngineStore({ storageFilePath: null });
  const alerts = store.getSnapshot().alerts;
  assert.ok(alerts.length >= 2, 'Seed data must contain at least 2 alerts');

  // Resolve the first alert so we can test eligible vs skipped calculation
  store.resolveAlert(alerts[0].id, 'Analyst A', 'Already resolved');
  const updatedAlerts = store.getSnapshot().alerts;

  const selected = new Set([updatedAlerts[0].id, updatedAlerts[1].id]);
  const resolveSummary = summarizeBatchSelection(updatedAlerts, selected, 'resolve');
  assert.equal(resolveSummary.totalSelected, 2);
  assert.equal(resolveSummary.eligibleAlerts.length, 1);
  assert.equal(resolveSummary.skippedAlerts.length, 1);
  assert.equal(resolveSummary.eligibleAlerts[0].id, updatedAlerts[1].id);
  assert.equal(isAlertEligibleForBatchAction(updatedAlerts[0], 'resolve'), false);
  assert.equal(isAlertEligibleForBatchAction(updatedAlerts[0], 'dismiss'), true);
});

test('SentinelEngineStore.batchOperateAlerts resolves multiple alerts atomically and preserves SHA-256 vault integrity', () => {
  const store = new SentinelEngineStore({ storageFilePath: null });
  const openAlerts = store.getSnapshot().alerts.filter((a) => a.status !== 'resolved');
  assert.ok(openAlerts.length >= 2);

  const targetIds = [openAlerts[0].id, openAlerts[1].id, openAlerts[0].id, 'alt_nonexistent'];
  const result = store.batchOperateAlerts(
    targetIds,
    'resolve',
    'K. Patel (SecOps)',
    'Verified in shift handover',
  );

  assert.equal(result.action, 'resolve');
  assert.deepEqual(result.updatedIds, [openAlerts[0].id, openAlerts[1].id]);
  assert.deepEqual(result.notFoundIds, ['alt_nonexistent']);
  assert.equal(result.skippedIds.length, 0);
  assert.equal(result.vaultSequences.length, 2);

  const snap = store.getSnapshot();
  for (const id of result.updatedIds) {
    const updated = snap.alerts.find((a) => a.id === id);
    assert.equal(updated?.status, 'resolved');
    assert.equal(updated?.resolvedBy, 'K. Patel (SecOps)');
    assert.equal(updated?.resolutionNote, 'Verified in shift handover');
  }

  // Re-running resolve on already-resolved alerts skips them cleanly without redundant vault entries
  const secondRun = store.batchOperateAlerts(result.updatedIds, 'resolve', 'K. Patel (SecOps)');
  assert.equal(secondRun.updatedIds.length, 0);
  assert.deepEqual(secondRun.skippedIds, result.updatedIds);

  assert.equal(snap.vaultVerification.valid, true);
  assert.equal(verifyVaultChain([...snap.vaultEntries].reverse()).valid, true);
});

test('SentinelEngineStore.batchOperateAlerts dismisses alerts, updates fingerprint baselines, and preserves vault integrity', () => {
  const store = new SentinelEngineStore({ storageFilePath: null });
  const snapBefore = store.getSnapshot();
  const payrollAlert = snapBefore.alerts.find((a) => a.id === 'alt_payroll_03am');
  assert.ok(payrollAlert, 'Expected seeded payroll alert');

  const fpBefore = snapBefore.fingerprints.find(
    (f) => f.canonicalActorId === payrollAlert.canonicalActorId,
  );
  const dismissalsBefore = fpBefore?.learnedDismissals ?? 0;

  const secondAlert = snapBefore.alerts.find((a) => a.id !== payrollAlert.id);
  assert.ok(secondAlert);

  const result = store.batchOperateAlerts(
    [payrollAlert.id, secondAlert.id],
    'dismiss',
    'M. Chen (SecOps)',
    'Confirmed planned batch export window',
  );

  assert.equal(result.action, 'dismiss');
  assert.equal(result.updatedIds.length, 2);

  const snapAfter = store.getSnapshot();
  const payrollAfter = snapAfter.alerts.find((a) => a.id === payrollAlert.id);
  assert.equal(payrollAfter?.status, 'dismissed');
  assert.ok(
    payrollAfter?.feedbackHistory.some(
      (f) => f.decision === 'dismiss' && f.note === 'Confirmed planned batch export window',
    ),
  );

  const fpAfter = snapAfter.fingerprints.find(
    (f) => f.canonicalActorId === payrollAlert.canonicalActorId,
  );
  assert.equal(fpAfter?.learnedDismissals, dismissalsBefore + 1);
  assert.equal(snapAfter.vaultVerification.valid, true);
  assert.equal(verifyVaultChain([...snapAfter.vaultEntries].reverse()).valid, true);
});
