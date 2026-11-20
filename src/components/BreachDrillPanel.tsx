import { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Crosshair,
  FastForward,
  FileSearch,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Square,
  X,
} from 'lucide-react';
import {
  BREACH_DRILL_SCENARIOS,
  type BreachDrillScenario,
  type BreachDrillStepExecutionResult,
} from '../core/breachDrill';
import type { SystemSnapshot } from '../core/types';
import { severityLabel, severityTextClass } from '../lib/format';

export type BreachDrillCadence = 'realistic' | 'rapid' | 'manual';

export const DRILL_CADENCE_MS: Record<BreachDrillCadence, number | null> = {
  realistic: 2600,
  rapid: 900,
  manual: null,
};

interface BreachDrillModalProps {
  open: boolean;
  onClose: () => void;
  onLaunch: (scenarioId: BreachDrillScenario['id'], cadence: BreachDrillCadence) => void;
  isRunning: boolean;
}

export function BreachDrillModal({
  open,
  onClose,
  onLaunch,
  isRunning,
}: BreachDrillModalProps) {
  const [selectedId, setSelectedId] = useState<BreachDrillScenario['id']>('full_kill_chain');
  const [cadence, setCadence] = useState<BreachDrillCadence>('realistic');

  if (!open) return null;

  const activeScenario =
    BREACH_DRILL_SCENARIOS.find((s) => s.id === selectedId) ?? BREACH_DRILL_SCENARIOS[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55"
      role="dialog"
      aria-modal="true"
      aria-label="Run Breach Drill Sandbox"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl window-suede rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[var(--sentinel-nude)] border-b border-[var(--sentinel-border)] flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--sentinel-high)]">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Controlled SecOps Sandbox Exercise</span>
            </div>
            <h2 className="font-title text-2xl font-semibold text-[var(--sentinel-ink)]">
              Run Breach Drill
            </h2>
            <p className="text-xs text-[var(--sentinel-ink-secondary)]">
              Automatically fire a multi-system sequence of anomalous events through Sentinel&apos;s live edge redactor, fingerprint engine, payment guard, honey traps, Vault, and webhooks. Reset to clean baseline anytime.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close breach drill modal"
            className="p-1.5 rounded-md text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-ink)] hover:bg-[var(--sentinel-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Scenario Selection */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--sentinel-ink-muted)]">
              1. Select Drill Scenario
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {BREACH_DRILL_SCENARIOS.map((scenario) => {
                const selected = scenario.id === activeScenario.id;
                return (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => setSelectedId(scenario.id)}
                    data-testid={`drill-scenario-${scenario.id}`}
                    className={`text-left p-3.5 rounded-md border transition-colors cursor-pointer space-y-1.5 ${
                      selected
                        ? 'border-[var(--sentinel-accent)] bg-[var(--sentinel-accent-soft)]/50'
                        : 'border-[var(--sentinel-border)] bg-[var(--sentinel-inset)] hover:border-[var(--sentinel-ink-muted)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-title text-sm font-semibold text-[var(--sentinel-ink)] leading-snug">
                        {scenario.name}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-[var(--sentinel-accent)] font-semibold">
                      {scenario.stages.length} stages · ~{scenario.estimatedDurationSec}s
                    </p>
                    <p className="text-[11px] text-[var(--sentinel-ink-secondary)] leading-relaxed">
                      {scenario.subtitle}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cadence Selector */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--sentinel-ink-muted)]">
              2. Injection Cadence
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'realistic', label: 'Realistic', desc: '1 stage every 2.6s' },
                  { id: 'rapid', label: 'Rapid Burst', desc: '1 stage every 0.9s' },
                  { id: 'manual', label: 'Manual Step', desc: 'Advance on click' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCadence(opt.id)}
                  className={`p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                    cadence === opt.id
                      ? 'border-[var(--sentinel-accent)] bg-[var(--sentinel-accent-soft)]/50'
                      : 'border-[var(--sentinel-border)] bg-[var(--sentinel-inset)] hover:border-[var(--sentinel-ink-muted)]'
                  }`}
                >
                  <p className="text-xs font-semibold text-[var(--sentinel-ink)]">{opt.label}</p>
                  <p className="text-[11px] text-[var(--sentinel-ink-muted)]">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Stage Sequence Preview */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--sentinel-ink-muted)]">
              3. Automated Sequence Preview ({activeScenario.stages.length} Systems)
            </p>
            <div className="surface-inset rounded-md divide-y divide-[var(--sentinel-divider)]">
              {activeScenario.stages.map((stage, idx) => (
                <div key={stage.id} className="px-3.5 py-2.5 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="font-mono text-[11px] font-bold text-[var(--sentinel-ink-muted)] mt-0.5 shrink-0">
                      0{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[var(--sentinel-ink)]">
                        {stage.title}
                      </p>
                      <p className="text-[11px] text-[var(--sentinel-ink-secondary)]">
                        {stage.system} · <span className="font-mono">{stage.mitreTactic}</span> · IP{' '}
                        <span className="font-mono">{stage.sourceIp}</span>
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-mono font-bold uppercase shrink-0 ${severityTextClass(
                      stage.expectedSeverity,
                    )}`}
                  >
                    {severityLabel(stage.expectedSeverity)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[var(--sentinel-nude)] border-t border-[var(--sentinel-border)] flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-[var(--sentinel-ink-secondary)]">
            Non-blocking: triage, contain, undo, and audit alerts live while the drill runs.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] hover:border-[var(--sentinel-ink-muted)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isRunning}
              onClick={() => onLaunch(activeScenario.id, cadence)}
              data-testid="launch-breach-drill-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-[var(--sentinel-high)] hover:opacity-90 disabled:opacity-60 text-white transition-opacity cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Start Breach Drill</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface BreachDrillDockProps {
  scenario: BreachDrillScenario;
  cadence: BreachDrillCadence;
  status: 'running' | 'paused' | 'completed' | 'aborted';
  currentStepIndex: number;
  firingStepIndex: number | null;
  results: BreachDrillStepExecutionResult[];
  error: string | null;
  snapshot: SystemSnapshot | null;
  onTogglePause: () => void;
  onStepNow: () => void;
  onAbort: () => void;
  onResetSandbox: () => void;
  onCloseDock: () => void;
  onOpenAlert: (alertId: string) => void;
  onInspectVault: (vaultSeq: number, alertId: string) => void;
  busyAction: string | null;
}

export function BreachDrillDock({
  scenario,
  cadence,
  status,
  currentStepIndex,
  firingStepIndex,
  results,
  error,
  snapshot,
  onTogglePause,
  onStepNow,
  onAbort,
  onResetSandbox,
  onCloseDock,
  onOpenAlert,
  onInspectVault,
  busyAction,
}: BreachDrillDockProps) {
  const [expanded, setExpanded] = useState(true);

  const totalStages = scenario.stages.length;
  const completedStages = results.length;
  const progressPct = Math.round((completedStages / Math.max(1, totalStages)) * 100);

  // Live SecOps readiness scorecard computed from actual operator actions on drill alerts
  const drillAlertIds = results
    .map((r) => r.alertId)
    .filter((id): id is string => Boolean(id));
  const drillAlerts = (snapshot?.alerts ?? []).filter((a) => drillAlertIds.includes(a.id));
  const triagedCount = drillAlerts.filter(
    (a) => a.feedbackHistory.length > 0 || a.status !== 'open',
  ).length;
  const containedCount = drillAlerts.filter(
    (a) => a.activeResponse !== null || a.status === 'contained' || a.status === 'resolved',
  ).length;
  const resolvedCount = drillAlerts.filter((a) => a.status === 'resolved').length;

  const readinessScore =
    drillAlerts.length === 0
      ? 0
      : Math.round(
          ((triagedCount * 0.35 + containedCount * 0.35 + resolvedCount * 0.3) /
            drillAlerts.length) *
            100,
        );

  const isResetting = busyAction === 'reset';

  return (
    <section
      aria-label="Active Breach Drill Sandbox"
      data-testid="breach-drill-dock"
      className="mb-5 window-nude rounded-lg border-l-4 border-l-[var(--sentinel-high)] overflow-hidden"
    >
      {/* Top Control Strip */}
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-md bg-[var(--sentinel-high-bg)] border border-[var(--sentinel-high-border)] text-[var(--sentinel-high)] flex items-center justify-center shrink-0">
            <Crosshair className={`w-4 h-4 ${status === 'running' ? 'animate-pulse' : ''}`} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--sentinel-high)]">
                SANDBOX BREACH DRILL ·{' '}
                {status === 'running'
                  ? 'ACTIVE'
                  : status === 'paused'
                    ? 'PAUSED'
                    : status === 'completed'
                      ? 'SEQUENCE COMPLETE'
                      : 'ABORTED'}
              </span>
              <span className="font-mono text-[11px] font-semibold text-[var(--sentinel-ink-muted)] tabular-nums">
                {completedStages}/{totalStages} stages ({progressPct}%)
              </span>
            </div>
            <h2 className="font-title text-base font-semibold text-[var(--sentinel-ink)] truncate">
              {scenario.name}
            </h2>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {(status === 'running' || status === 'paused') && cadence !== 'manual' && (
            <button
              type="button"
              onClick={onTogglePause}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] hover:border-[var(--sentinel-accent)] cursor-pointer"
            >
              {status === 'running' ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Resume</span>
                </>
              )}
            </button>
          )}

          {(status === 'running' || status === 'paused') && currentStepIndex < totalStages && (
            <button
              type="button"
              disabled={firingStepIndex !== null}
              onClick={onStepNow}
              data-testid="drill-step-now-btn"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md bg-[var(--sentinel-high)] text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>{cadence === 'manual' ? 'Fire Next Stage' : 'Step Now'}</span>
            </button>
          )}

          {(status === 'running' || status === 'paused') && (
            <button
              type="button"
              onClick={onAbort}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-crit-border)] bg-[var(--sentinel-crit-bg)] text-[var(--sentinel-crit-ink)] hover:opacity-90 cursor-pointer"
            >
              <Square className="w-3 h-3" />
              <span>Stop</span>
            </button>
          )}

          <button
            type="button"
            disabled={isResetting || firingStepIndex !== null}
            onClick={onResetSandbox}
            data-testid="drill-reset-sandbox-btn"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] hover:border-[var(--sentinel-accent)] disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isResetting ? 'Resetting...' : 'Reset Sandbox'}</span>
          </button>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse breach drill timeline' : 'Expand breach drill timeline'}
            className="p-1.5 rounded-md text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-ink)] hover:bg-[var(--sentinel-hover)] cursor-pointer"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {(status === 'completed' || status === 'aborted') && (
            <button
              type="button"
              onClick={onCloseDock}
              aria-label="Dismiss breach drill dock"
              className="p-1.5 rounded-md text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-ink)] hover:bg-[var(--sentinel-hover)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 w-full bg-[var(--sentinel-segment)]">
        <div
          className="h-full bg-[var(--sentinel-high)] transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {expanded && (
        <div className="p-4 space-y-3 border-t border-[var(--sentinel-border-soft)] bg-[var(--sentinel-suede)]/75">
          {error && (
            <div className="p-2.5 rounded-md alert-pop-critical text-xs font-medium text-[var(--sentinel-crit-ink)]">
              Drill stage error: {error}
            </div>
          )}

          {/* Live SecOps Response Readiness Scorecard */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <div className="surface-inset rounded-md px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sentinel-ink-muted)]">
                Alerts Raised
              </p>
              <p className="text-base font-mono font-bold tabular-nums text-[var(--sentinel-crit)]">
                {drillAlerts.length}
              </p>
            </div>
            <div className="surface-inset rounded-md px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sentinel-ink-muted)]">
                Triaged
              </p>
              <p className="text-base font-mono font-bold tabular-nums text-[var(--sentinel-ink)]">
                {triagedCount}/{drillAlerts.length}
              </p>
            </div>
            <div className="surface-inset rounded-md px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sentinel-ink-muted)]">
                Contained
              </p>
              <p className="text-base font-mono font-bold tabular-nums text-[var(--sentinel-accent)]">
                {containedCount}/{drillAlerts.length}
              </p>
            </div>
            <div className="surface-inset rounded-md px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sentinel-ink-muted)]">
                Resolved
              </p>
              <p className="text-base font-mono font-bold tabular-nums text-[var(--sentinel-accent)]">
                {resolvedCount}/{drillAlerts.length}
              </p>
            </div>
            <div className="surface-inset rounded-md px-3 py-2 col-span-2 sm:col-span-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sentinel-ink-muted)]">
                Workflow Score
              </p>
              <p className="text-base font-mono font-bold tabular-nums text-[var(--sentinel-accent)]">
                {readinessScore}%
              </p>
            </div>
          </div>

          {/* Stage-by-Stage Timeline */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {scenario.stages.map((stage, idx) => {
              const result = results.find((r) => r.stepIndex === idx);
              const isFiring = firingStepIndex === idx;
              const liveAlert = result?.alertId
                ? (snapshot?.alerts ?? []).find((a) => a.id === result.alertId)
                : null;

              return (
                <div
                  key={stage.id}
                  data-testid={`drill-stage-row-${idx}`}
                  className={`p-3 rounded-md border flex items-start justify-between gap-2.5 ${
                    isFiring
                      ? 'border-[var(--sentinel-high-border)] bg-[var(--sentinel-high-bg)]/60'
                      : result
                        ? 'border-[var(--sentinel-border)] bg-[var(--sentinel-inset)]'
                        : 'border-[var(--sentinel-border-soft)] bg-[var(--sentinel-suede)]/50 opacity-75'
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="mt-0.5 shrink-0">
                      {isFiring ? (
                        <Activity className="w-4 h-4 text-[var(--sentinel-high)] animate-pulse" />
                      ) : result ? (
                        liveAlert?.status === 'resolved' ? (
                          <CheckCircle2 className="w-4 h-4 text-[var(--sentinel-accent)]" />
                        ) : (
                          <ShieldAlert
                            className={`w-4 h-4 ${severityTextClass(result.severity)}`}
                          />
                        )
                      ) : (
                        <Clock className="w-4 h-4 text-[var(--sentinel-ink-muted)]" />
                      )}
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[10px] font-bold text-[var(--sentinel-ink-muted)]">
                          0{idx + 1}
                        </span>
                        <span className="text-xs font-semibold text-[var(--sentinel-ink)] truncate">
                          {stage.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--sentinel-ink-secondary)]">
                        {stage.system} · <span className="font-mono">{stage.sourceIp}</span>
                        {liveAlert && (
                          <span className="font-mono ml-1.5 uppercase text-[10px] font-bold text-[var(--sentinel-accent)]">
                            · {liveAlert.status}
                          </span>
                        )}
                      </p>
                      {result && (
                        <p className="text-[11px] text-[var(--sentinel-ink-muted)] leading-snug">
                          {result.summary}
                        </p>
                      )}
                    </div>
                  </div>

                  {result && (
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {result.alertId && (
                        <button
                          type="button"
                          onClick={() => onOpenAlert(result.alertId!)}
                          className="text-[11px] font-semibold text-[var(--sentinel-accent)] hover:underline whitespace-nowrap cursor-pointer"
                        >
                          Open Alert →
                        </button>
                      )}
                      {result.vaultSequence && result.alertId && (
                        <button
                          type="button"
                          onClick={() => onInspectVault(result.vaultSequence!, result.alertId!)}
                          className="inline-flex items-center gap-1 text-[10px] font-mono text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-ink)] hover:underline whitespace-nowrap cursor-pointer"
                        >
                          <FileSearch className="w-3 h-3" />
                          <span>Vault #{result.vaultSequence}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
