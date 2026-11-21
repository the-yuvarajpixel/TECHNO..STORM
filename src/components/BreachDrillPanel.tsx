import { useEffect, useId, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Crosshair,
  FastForward,
  FileSearch,
  History,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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

export const DRILL_HISTORY_STORAGE_KEY = 'sentinel-breach-drill-history-v1';
export const MAX_DRILL_HISTORY_ITEMS = 5;

export interface CompletedDrillSessionRecord {
  drillId: string;
  scenarioId: BreachDrillScenario['id'];
  scenarioName: string;
  cadence: BreachDrillCadence;
  completedAt: string;
  durationSec: number;
  completedStages: number;
  totalStages: number;
  alertsRaised: number;
  triagedCount: number;
  containedCount: number;
  resolvedCount: number;
  successRate: number;
}

export function loadCompletedDrillHistory(): CompletedDrillSessionRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DRILL_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is CompletedDrillSessionRecord =>
          Boolean(item) &&
          typeof item.drillId === 'string' &&
          typeof item.scenarioId === 'string' &&
          typeof item.scenarioName === 'string' &&
          typeof item.completedAt === 'string' &&
          typeof item.successRate === 'number',
      )
      .slice(0, MAX_DRILL_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

export function upsertCompletedDrillSession(
  current: CompletedDrillSessionRecord[],
  record: CompletedDrillSessionRecord,
): CompletedDrillSessionRecord[] {
  const existingIdx = current.findIndex((item) => item.drillId === record.drillId);
  if (existingIdx >= 0) {
    const existing = current[existingIdx];
    if (
      existing.successRate === record.successRate &&
      existing.triagedCount === record.triagedCount &&
      existing.containedCount === record.containedCount &&
      existing.resolvedCount === record.resolvedCount &&
      existing.alertsRaised === record.alertsRaised &&
      existing.completedStages === record.completedStages &&
      existing.durationSec === record.durationSec
    ) {
      return current;
    }
  }
  let next: CompletedDrillSessionRecord[];
  if (existingIdx >= 0) {
    next = current.map((item, idx) =>
      idx === existingIdx ? { ...record, completedAt: item.completedAt } : item,
    );
  } else {
    next = [record, ...current].slice(0, MAX_DRILL_HISTORY_ITEMS);
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(DRILL_HISTORY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors in restricted iframe environments
    }
  }
  return next;
}

export function clearCompletedDrillHistory(): CompletedDrillSessionRecord[] {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(DRILL_HISTORY_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }
  return [];
}

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
  drillId?: string;
  scenario: BreachDrillScenario;
  cadence: BreachDrillCadence;
  status: 'running' | 'paused' | 'completed' | 'aborted';
  startedAt?: string;
  currentStepIndex: number;
  firingStepIndex: number | null;
  results: BreachDrillStepExecutionResult[];
  error: string | null;
  snapshot: SystemSnapshot | null;
  completedSessions?: CompletedDrillSessionRecord[];
  onClearHistory?: () => void;
  onTogglePause: () => void;
  onStepNow: () => void;
  onAbort: () => void;
  onResetSandbox: () => void;
  onCloseDock: () => void;
  onOpenAlert: (alertId: string) => void;
  onInspectVault: (vaultSeq: number, alertId: string) => void;
  busyAction: string | null;
}

interface DrillProgressPoint {
  elapsedSec: number;
  completionPct: number;
  completedCount: number;
  totalStages: number;
  timeLabel: string;
  stageLabel: string;
  system: string;
  mitreTactic?: string;
  isLiveTail?: boolean;
}

interface HistoryTrendPoint {
  sessionOrder: string;
  drillId: string;
  scenarioName: string;
  cadence: BreachDrillCadence;
  completedAt: string;
  shortTime: string;
  successRate: number;
  resolvedCount: number;
  alertsRaised: number;
  durationSec: number;
  completedStages: number;
  totalStages: number;
}

function formatClockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatShortSessionTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatElapsedAxis(seconds: number): string {
  const rounded = Math.round(seconds * 10) / 10;
  return `+${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}s`;
}

function getSuccessRateTier(rate: number): {
  label: 'Strong' | 'Moderate' | 'Low';
  colorVar: string;
} {
  if (rate >= 75) {
    return { label: 'Strong', colorVar: 'var(--sentinel-teal)' };
  }
  if (rate >= 40) {
    return { label: 'Moderate', colorVar: 'var(--sentinel-high)' };
  }
  return { label: 'Low', colorVar: 'var(--sentinel-crit)' };
}

interface CircularStageGaugeProps {
  percentage: number;
  completedStages: number;
  totalStages: number;
  status: 'running' | 'paused' | 'completed' | 'aborted';
  size?: number;
  strokeWidth?: number;
  compact?: boolean;
}

function CircularStageGauge({
  percentage,
  completedStages,
  totalStages,
  status,
  size = 132,
  strokeWidth = 9,
  compact = false,
}: CircularStageGaugeProps) {
  const clampedPct = Math.max(0, Math.min(100, percentage));
  const center = size / 2;
  const radius = center - strokeWidth / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clampedPct / 100);

  const strokeColor =
    status === 'completed' || clampedPct === 100
      ? 'var(--sentinel-teal)'
      : status === 'aborted'
        ? 'var(--sentinel-crit)'
        : status === 'paused'
          ? 'var(--sentinel-accent)'
          : 'var(--sentinel-high)';

  return (
    <div
      role="progressbar"
      aria-label={`Drill scenario stage completion: ${clampedPct}% (${completedStages} of ${totalStages} stages)`}
      aria-valuenow={clampedPct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--sentinel-segment)"
          strokeWidth={strokeWidth}
        />
        {!compact && totalStages > 1 && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--sentinel-border-soft)"
            strokeWidth={1}
            strokeDasharray={`2 ${Math.max(4, circumference / totalStages - 2)}`}
          />
        )}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset,stroke] duration-300 ease-out"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        {compact ? (
          <span className="font-mono text-[10px] font-bold tabular-nums text-[var(--sentinel-ink)] leading-none">
            {clampedPct}%
          </span>
        ) : (
          <>
            <span className="font-mono text-2xl font-bold tabular-nums text-[var(--sentinel-ink)] leading-none">
              {clampedPct}%
            </span>
            <span className="mt-1 font-mono text-[11px] font-semibold tabular-nums text-[var(--sentinel-ink-muted)] leading-none">
              {completedStages}/{totalStages} stages
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function BreachDrillDock({
  drillId,
  scenario,
  cadence,
  status,
  startedAt,
  currentStepIndex,
  firingStepIndex,
  results,
  error,
  snapshot,
  completedSessions = [],
  onClearHistory,
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
  const [nowMs, setNowMs] = useState(() => Date.now());
  const chartGradientId = useId().replace(/:/g, '');

  const totalStages = scenario.stages.length;
  const completedStages = results.length;
  const progressPct = Math.round((completedStages / Math.max(1, totalStages)) * 100);

  // Keep elapsed timeline progressing smoothly while a drill is actively running
  useEffect(() => {
    if (status !== 'running') return;
    setNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 500);
    return () => window.clearInterval(intervalId);
  }, [status, completedStages]);

  const { progressSeries, maxElapsedSec, elapsedTotalSec } = useMemo(() => {
    const sortedResults = [...results].sort((a, b) => a.stepIndex - b.stepIndex);
    const parsedStartMs = startedAt ? Date.parse(startedAt) : Number.NaN;
    const firstResultMs = sortedResults[0] ? Date.parse(sortedResults[0].executedAt) : Number.NaN;
    const originMs = !Number.isNaN(parsedStartMs)
      ? parsedStartMs
      : !Number.isNaN(firstResultMs)
        ? firstResultMs - 1000
        : nowMs;
    const originIso = new Date(originMs).toISOString();

    const points: DrillProgressPoint[] = [
      {
        elapsedSec: 0,
        completionPct: 0,
        completedCount: 0,
        totalStages,
        timeLabel: formatClockTime(originIso),
        stageLabel: 'Drill initialized',
        system: scenario.name,
      },
    ];

    let lastElapsed = 0;
    sortedResults.forEach((res, idx) => {
      const execMs = Date.parse(res.executedAt);
      const rawElapsed = Number.isNaN(execMs) ? (idx + 1) * 1.5 : (execMs - originMs) / 1000;
      const elapsedSec = Number(Math.max(lastElapsed + 0.1, rawElapsed).toFixed(1));
      lastElapsed = elapsedSec;
      const completedCount = idx + 1;
      points.push({
        elapsedSec,
        completionPct: Math.round((completedCount / Math.max(1, totalStages)) * 100),
        completedCount,
        totalStages,
        timeLabel: formatClockTime(res.executedAt),
        stageLabel: `0${res.stepIndex + 1} · ${res.stepTitle}`,
        system: res.system,
        mitreTactic: res.mitreTactic,
      });
    });

    if (status === 'running' && completedStages < totalStages) {
      const liveElapsed = Number(Math.max(lastElapsed + 0.2, (nowMs - originMs) / 1000).toFixed(1));
      lastElapsed = liveElapsed;
      points.push({
        elapsedSec: liveElapsed,
        completionPct: progressPct,
        completedCount: completedStages,
        totalStages,
        timeLabel: formatClockTime(new Date(nowMs).toISOString()),
        stageLabel:
          firingStepIndex !== null
            ? `Running stage 0${firingStepIndex + 1}...`
            : `Awaiting stage 0${Math.min(completedStages + 1, totalStages)}`,
        system:
          scenario.stages[Math.min(completedStages, totalStages - 1)]?.system ?? scenario.name,
        isLiveTail: true,
      });
    }

    const domainMax = Math.max(
      scenario.estimatedDurationSec,
      Math.ceil(lastElapsed + 1),
      4,
    );

    return {
      progressSeries: points,
      maxElapsedSec: domainMax,
      elapsedTotalSec: lastElapsed,
    };
  }, [
    results,
    startedAt,
    nowMs,
    totalStages,
    scenario.name,
    scenario.estimatedDurationSec,
    scenario.stages,
    status,
    completedStages,
    progressPct,
    firingStepIndex,
  ]);

  const chartStrokeColor =
    status === 'completed' ? 'var(--sentinel-accent)' : 'var(--sentinel-high)';

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

  const recentSessions = useMemo(
    () => completedSessions.slice(0, MAX_DRILL_HISTORY_ITEMS),
    [completedSessions],
  );

  const { historyTrendData, avgSuccessRate, latestTrendDelta } = useMemo(() => {
    // Chronological order (oldest -> newest) for left-to-right trend chart
    const chronological = [...recentSessions].reverse();
    const trendPoints: HistoryTrendPoint[] = chronological.map((session, idx) => ({
      sessionOrder: `#${idx + 1}`,
      drillId: session.drillId,
      scenarioName: session.scenarioName,
      cadence: session.cadence,
      completedAt: session.completedAt,
      shortTime: formatShortSessionTime(session.completedAt),
      successRate: session.successRate,
      resolvedCount: session.resolvedCount,
      alertsRaised: session.alertsRaised,
      durationSec: session.durationSec,
      completedStages: session.completedStages,
      totalStages: session.totalStages,
    }));

    const avg =
      recentSessions.length === 0
        ? 0
        : Math.round(
            recentSessions.reduce((acc, item) => acc + item.successRate, 0) /
              recentSessions.length,
          );

    const delta =
      recentSessions.length >= 2
        ? recentSessions[0].successRate - recentSessions[1].successRate
        : null;

    return {
      historyTrendData: trendPoints,
      avgSuccessRate: avg,
      latestTrendDelta: delta,
    };
  }, [recentSessions]);

  const isResetting = busyAction === 'reset';

  const statusLabelText =
    status === 'running'
      ? 'ACTIVE'
      : status === 'paused'
        ? 'PAUSED'
        : status === 'completed'
          ? 'SEQUENCE COMPLETE'
          : 'ABORTED';

  const nextPendingStage =
    completedStages < totalStages ? scenario.stages[completedStages] : null;

  return (
    <section
      aria-label="Active Breach Drill Sandbox"
      data-testid="breach-drill-dock"
      className="mb-5 window-nude rounded-lg border-l-4 border-l-[var(--sentinel-high)] overflow-hidden"
    >
      {/* Top Control Strip */}
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            data-testid="breach-drill-header-gauge"
            className="shrink-0"
            title={`${progressPct}% scenario stages completed`}
          >
            <CircularStageGauge
              percentage={progressPct}
              completedStages={completedStages}
              totalStages={totalStages}
              status={status}
              size={44}
              strokeWidth={4}
              compact
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--sentinel-high)]">
                <Crosshair className={`w-3.5 h-3.5 ${status === 'running' ? 'animate-pulse' : ''}`} />
                <span>SANDBOX BREACH DRILL · {statusLabelText}</span>
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

          {/* Circular Completion Gauge + Stage Completion Progress Over Time Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            {/* Circular Progress Indicator / Visual Gauge */}
            <div
              data-testid="breach-drill-circular-gauge"
              className="lg:col-span-4 surface-inset rounded-md p-3.5 flex flex-col justify-between gap-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-title text-sm font-semibold text-[var(--sentinel-ink)]">
                  Scenario Stage Gauge
                </h3>
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--sentinel-ink-muted)]">
                  {statusLabelText}
                </span>
              </div>

              <div className="flex items-center justify-center py-1">
                <CircularStageGauge
                  percentage={progressPct}
                  completedStages={completedStages}
                  totalStages={totalStages}
                  status={status}
                  size={136}
                  strokeWidth={10}
                />
              </div>

              <div className="space-y-1.5 border-t border-[var(--sentinel-divider)] pt-2.5 text-[11px]">
                <div className="flex items-center justify-between gap-2 text-[var(--sentinel-ink-secondary)]">
                  <span>Current focus</span>
                  <span className="font-medium text-[var(--sentinel-ink)] truncate max-w-[190px]">
                    {status === 'completed'
                      ? 'All stages executed'
                      : status === 'aborted'
                        ? 'Stopped by operator'
                        : firingStepIndex !== null
                          ? `Executing 0${firingStepIndex + 1}`
                          : nextPendingStage
                            ? `0${completedStages + 1} · ${nextPendingStage.title}`
                            : 'Queued'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[var(--sentinel-ink-secondary)] font-mono tabular-nums">
                  <span>Elapsed / Target</span>
                  <span className="text-[var(--sentinel-ink)]">
                    {formatElapsedAxis(elapsedTotalSec)} / ~{scenario.estimatedDurationSec}s
                  </span>
                </div>
              </div>
            </div>

            {/* Stage Completion Progress Over Time Chart */}
            <div
              data-testid="breach-drill-progress-chart"
              className="lg:col-span-8 surface-inset rounded-md p-3.5 space-y-2.5 flex flex-col justify-between"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="space-y-0.5">
                  <h3 className="font-title text-sm font-semibold text-[var(--sentinel-ink)]">
                    Stage Completion Over Time
                  </h3>
                  <p className="text-[11px] text-[var(--sentinel-ink-muted)] tabular-nums">
                    {scenario.name} · {completedStages}/{totalStages} stages completed ({progressPct}%) · Elapsed {formatElapsedAxis(elapsedTotalSec)}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono text-[var(--sentinel-ink-secondary)] tabular-nums">
                  <span>Cadence: {cadence}</span>
                  <span aria-hidden="true">·</span>
                  <span>Target: ~{scenario.estimatedDurationSec}s</span>
                </div>
              </div>

              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={progressSeries}
                    margin={{ top: 8, right: 12, left: -16, bottom: 2 }}
                  >
                    <defs>
                      <linearGradient id={chartGradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartStrokeColor} stopOpacity={0.28} />
                        <stop offset="95%" stopColor={chartStrokeColor} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--sentinel-divider)"
                    />
                    <XAxis
                      dataKey="elapsedSec"
                      type="number"
                      domain={[0, maxElapsedSec]}
                      tickFormatter={formatElapsedAxis}
                      tick={{
                        fill: 'var(--sentinel-ink-muted)',
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                      }}
                      axisLine={{ stroke: 'var(--sentinel-border-soft)' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tickFormatter={(val: number) => `${val}%`}
                      tick={{
                        fill: 'var(--sentinel-ink-muted)',
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                      }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <ReferenceLine
                      y={100}
                      stroke="var(--sentinel-accent)"
                      strokeDasharray="4 4"
                      strokeOpacity={0.45}
                    />
                    <Tooltip
                      cursor={{
                        stroke: 'var(--sentinel-border)',
                        strokeWidth: 1,
                        strokeDasharray: '3 3',
                      }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const pt = payload[0]?.payload as DrillProgressPoint | undefined;
                        if (!pt) return null;
                        return (
                          <div className="window-suede rounded-md px-3 py-2 shadow-lg max-w-xs space-y-1">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-mono text-xs font-bold tabular-nums text-[var(--sentinel-ink)]">
                                {pt.completionPct}% complete
                              </span>
                              <span className="font-mono text-[11px] tabular-nums text-[var(--sentinel-ink-muted)]">
                                {pt.timeLabel} ({formatElapsedAxis(pt.elapsedSec)})
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-[var(--sentinel-ink)] leading-snug">
                              {pt.stageLabel}
                            </p>
                            <p className="text-[11px] text-[var(--sentinel-ink-secondary)]">
                              {pt.system}
                              {pt.mitreTactic ? ` · ${pt.mitreTactic}` : ''}
                              {` · ${pt.completedCount}/${pt.totalStages} stages`}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="stepAfter"
                      dataKey="completionPct"
                      stroke={chartStrokeColor}
                      strokeWidth={2}
                      fill={`url(#${chartGradientId})`}
                      isAnimationActive={false}
                      dot={(dotProps) => {
                        const { cx, cy, payload, index } = dotProps as {
                          cx?: number;
                          cy?: number;
                          payload?: DrillProgressPoint;
                          index?: number;
                        };
                        if (
                          typeof cx !== 'number' ||
                          typeof cy !== 'number' ||
                          payload?.isLiveTail
                        ) {
                          return <g key={`dot-skip-${index ?? 0}`} />;
                        }
                        return (
                          <circle
                            key={`dot-${index ?? 0}`}
                            cx={cx}
                            cy={cy}
                            r={3.5}
                            fill="var(--sentinel-suede)"
                            stroke={chartStrokeColor}
                            strokeWidth={2}
                          />
                        );
                      }}
                      activeDot={{
                        r: 5,
                        fill: chartStrokeColor,
                        stroke: 'var(--sentinel-suede)',
                        strokeWidth: 2,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Historical Context: Last 5 Completed Drill Sessions Trend + Summary List */}
          <div
            data-testid="breach-drill-history-panel"
            className="surface-inset rounded-md p-3.5 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-[var(--sentinel-accent)] shrink-0" />
                  <h3 className="font-title text-sm font-semibold text-[var(--sentinel-ink)]">
                    Last 5 Completed Drill Sessions
                  </h3>
                </div>
                <p className="text-[11px] text-[var(--sentinel-ink-muted)] tabular-nums">
                  {recentSessions.length === 0
                    ? 'Historical response workflow success rates are saved automatically upon drill completion.'
                    : `${recentSessions.length} of ${MAX_DRILL_HISTORY_ITEMS} recorded · Avg success rate ${avgSuccessRate}%${
                        latestTrendDelta !== null
                          ? ` · Latest vs prior ${latestTrendDelta >= 0 ? '+' : ''}${latestTrendDelta}%`
                          : ''
                      }`}
                </p>
              </div>

              {recentSessions.length > 0 && onClearHistory && (
                <button
                  type="button"
                  onClick={onClearHistory}
                  data-testid="drill-clear-history-btn"
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md text-[var(--sentinel-ink-muted)] hover:text-[var(--sentinel-crit-ink)] hover:bg-[var(--sentinel-hover)] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear History</span>
                </button>
              )}
            </div>

            {recentSessions.length === 0 ? (
              <div className="rounded-md border border-dashed border-[var(--sentinel-border)] px-3.5 py-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[var(--sentinel-ink-secondary)] leading-relaxed max-w-2xl">
                  No completed sessions logged yet. Finish all {totalStages} stages of this drill to record its SecOps workflow success rate and plot your 5-session trend here.
                </p>
                <div className="font-mono text-[11px] text-[var(--sentinel-ink-muted)] tabular-nums whitespace-nowrap">
                  Live run · {progressPct}% stages · {readinessScore}% score
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
                {/* Small Trend Chart (Oldest -> Newest) */}
                <div
                  data-testid="breach-drill-history-chart"
                  className="lg:col-span-5 rounded-md border border-[var(--sentinel-border-soft)] bg-[var(--sentinel-suede)]/60 p-2.5 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sentinel-ink-muted)]">
                      Success Rate Trend
                    </span>
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-[var(--sentinel-ink-secondary)]">
                      Avg {avgSuccessRate}%
                    </span>
                  </div>
                  <div className="h-36 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={historyTrendData}
                        margin={{ top: 8, right: 12, left: -22, bottom: 2 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="var(--sentinel-divider)"
                        />
                        <XAxis
                          dataKey="sessionOrder"
                          tick={{
                            fill: 'var(--sentinel-ink-muted)',
                            fontSize: 11,
                            fontFamily: 'var(--font-mono)',
                          }}
                          axisLine={{ stroke: 'var(--sentinel-border-soft)' }}
                          tickLine={false}
                        />
                        <YAxis
                          domain={[0, 100]}
                          ticks={[0, 50, 100]}
                          tickFormatter={(val: number) => `${val}%`}
                          tick={{
                            fill: 'var(--sentinel-ink-muted)',
                            fontSize: 10,
                            fontFamily: 'var(--font-mono)',
                          }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <ReferenceLine
                          y={avgSuccessRate}
                          stroke="var(--sentinel-accent)"
                          strokeDasharray="4 4"
                          strokeOpacity={0.5}
                        />
                        <Tooltip
                          cursor={{
                            stroke: 'var(--sentinel-border)',
                            strokeWidth: 1,
                            strokeDasharray: '3 3',
                          }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const pt = payload[0]?.payload as HistoryTrendPoint | undefined;
                            if (!pt) return null;
                            const tier = getSuccessRateTier(pt.successRate);
                            return (
                              <div className="window-suede rounded-md px-3 py-2 shadow-lg max-w-xs space-y-1">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-mono text-xs font-bold tabular-nums text-[var(--sentinel-ink)]">
                                    {pt.successRate}% · {tier.label}
                                  </span>
                                  <span className="font-mono text-[11px] tabular-nums text-[var(--sentinel-ink-muted)]">
                                    {pt.shortTime}
                                  </span>
                                </div>
                                <p className="text-xs font-semibold text-[var(--sentinel-ink)] leading-snug">
                                  {pt.scenarioName}
                                </p>
                                <p className="text-[11px] font-mono tabular-nums text-[var(--sentinel-ink-secondary)]">
                                  {pt.resolvedCount}/{pt.alertsRaised} alerts resolved · {pt.durationSec}s · {pt.cadence}
                                </p>
                              </div>
                            );
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="successRate"
                          stroke="var(--sentinel-accent)"
                          strokeWidth={2}
                          isAnimationActive={false}
                          dot={(dotProps) => {
                            const { cx, cy, payload, index } = dotProps as {
                              cx?: number;
                              cy?: number;
                              payload?: HistoryTrendPoint;
                              index?: number;
                            };
                            if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) {
                              return <g key={`hist-dot-skip-${index ?? 0}`} />;
                            }
                            const tier = getSuccessRateTier(payload.successRate);
                            return (
                              <circle
                                key={`hist-dot-${payload.drillId}-${index ?? 0}`}
                                cx={cx}
                                cy={cy}
                                r={4}
                                fill="var(--sentinel-suede)"
                                stroke={tier.colorVar}
                                strokeWidth={2.25}
                              />
                            );
                          }}
                          activeDot={{
                            r: 5.5,
                            fill: 'var(--sentinel-accent)',
                            stroke: 'var(--sentinel-suede)',
                            strokeWidth: 2,
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Compact Summary List (Newest First) */}
                <div
                  data-testid="breach-drill-history-list"
                  className="lg:col-span-7 divide-y divide-[var(--sentinel-divider)] rounded-md border border-[var(--sentinel-border-soft)] bg-[var(--sentinel-suede)]/60 overflow-hidden"
                >
                  {recentSessions.map((session, idx) => {
                    const tier = getSuccessRateTier(session.successRate);
                    const isCurrent = Boolean(drillId && session.drillId === drillId);
                    return (
                      <div
                        key={session.drillId}
                        data-testid={`drill-history-row-${idx}`}
                        className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono text-[10px] font-bold text-[var(--sentinel-ink-muted)] tabular-nums shrink-0">
                              #{recentSessions.length - idx}
                            </span>
                            <span className="font-semibold text-[var(--sentinel-ink)] truncate">
                              {session.scenarioName}
                            </span>
                            {isCurrent && (
                              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--sentinel-accent)] shrink-0">
                                · Active
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-mono text-[var(--sentinel-ink-muted)] tabular-nums">
                            {formatShortSessionTime(session.completedAt)} · {session.resolvedCount}/{session.alertsRaised} resolved · {session.durationSec}s · {session.cadence}
                          </p>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <div
                            className="hidden sm:block w-16 h-1.5 rounded-full bg-[var(--sentinel-segment)] overflow-hidden"
                            aria-hidden="true"
                          >
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${session.successRate}%`,
                                backgroundColor: tier.colorVar,
                              }}
                            />
                          </div>
                          <div className="text-right min-w-[78px]">
                            <span
                              className="font-mono text-xs font-bold tabular-nums"
                              style={{ color: tier.colorVar }}
                            >
                              {session.successRate}%
                            </span>
                            <span className="ml-1.5 text-[10px] font-medium text-[var(--sentinel-ink-muted)]">
                              {tier.label}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
