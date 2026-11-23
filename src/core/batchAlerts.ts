import type { SecurityAlert } from './types.ts';

export type BatchAlertAction = 'dismiss' | 'resolve';

export interface BatchAlertOperationResult {
  action: BatchAlertAction;
  updatedIds: string[];
  skippedIds: string[];
  notFoundIds: string[];
  vaultSequences: number[];
}

export interface BatchSelectionSummary {
  action: BatchAlertAction;
  totalSelected: number;
  eligibleAlerts: SecurityAlert[];
  skippedAlerts: SecurityAlert[];
  criticalCount: number;
  highCount: number;
  affectedActors: string[];
}

/**
 * Toggles a single alert ID in the selection set, returning a new Set.
 */
export function toggleAlertSelection(
  selectedIds: ReadonlySet<string>,
  alertId: string,
): Set<string> {
  const next = new Set(selectedIds);
  if (next.has(alertId)) {
    next.delete(alertId);
  } else {
    next.add(alertId);
  }
  return next;
}

/**
 * Selects all visible alerts if any visible alert is unselected; otherwise deselects all visible alerts.
 * Preserves selections outside the currently filtered view.
 */
export function toggleSelectAllVisible(
  selectedIds: ReadonlySet<string>,
  visibleIds: readonly string[],
): Set<string> {
  const next = new Set(selectedIds);
  if (visibleIds.length === 0) return next;

  const allVisibleSelected = visibleIds.every((id) => next.has(id));
  if (allVisibleSelected) {
    for (const id of visibleIds) {
      next.delete(id);
    }
  } else {
    for (const id of visibleIds) {
      next.add(id);
    }
  }
  return next;
}

/**
 * Removes any selected IDs that no longer exist in the current alert snapshot.
 */
export function pruneSelectionToExisting(
  selectedIds: ReadonlySet<string>,
  existingIds: ReadonlySet<string>,
): Set<string> {
  let changed = false;
  const next = new Set<string>();
  for (const id of selectedIds) {
    if (existingIds.has(id)) {
      next.add(id);
    } else {
      changed = true;
    }
  }
  return changed ? next : new Set(selectedIds);
}

/**
 * Checks whether an alert is eligible for the requested batch action.
 */
export function isAlertEligibleForBatchAction(
  alert: Pick<SecurityAlert, 'status'>,
  action: BatchAlertAction,
): boolean {
  if (action === 'resolve') {
    return alert.status !== 'resolved';
  }
  return alert.status !== 'dismissed';
}

/**
 * Computes an operational summary of selected alerts for the confirmation dialog
 * and bulk action buttons.
 */
export function summarizeBatchSelection(
  alerts: readonly SecurityAlert[],
  selectedIds: ReadonlySet<string>,
  action: BatchAlertAction,
): BatchSelectionSummary {
  const eligibleAlerts: SecurityAlert[] = [];
  const skippedAlerts: SecurityAlert[] = [];
  const actorSet = new Set<string>();
  let criticalCount = 0;
  let highCount = 0;

  for (const alert of alerts) {
    if (!selectedIds.has(alert.id)) continue;
    if (isAlertEligibleForBatchAction(alert, action)) {
      eligibleAlerts.push(alert);
      actorSet.add(alert.actorLabel);
      if (alert.severity === 'critical') criticalCount += 1;
      if (alert.severity === 'high') highCount += 1;
    } else {
      skippedAlerts.push(alert);
    }
  }

  return {
    action,
    totalSelected: eligibleAlerts.length + skippedAlerts.length,
    eligibleAlerts,
    skippedAlerts,
    criticalCount,
    highCount,
    affectedActors: Array.from(actorSet),
  };
}
