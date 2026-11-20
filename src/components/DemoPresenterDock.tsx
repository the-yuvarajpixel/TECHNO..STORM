import { ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';

export type NavSection =
  | 'overview'
  | 'executive'
  | 'fingerprints'
  | 'honey_traps'
  | 'drift_toolkit'
  | 'vault'
  | 'webhooks'
  | 'architecture';

export interface DemoStep {
  index: number;
  timeRange: string;
  onScreen: string;
  script: string;
  targetView: NavSection;
  actionLabel?: string;
}

export const HARBOR_FINCH_DEMO_STEPS: DemoStep[] = [
  {
    index: 0,
    timeRange: '0:00 – 0:30',
    onScreen: 'Harbor & Finch log pile, unmonitored systems',
    script:
      '“Harbor & Finch has logs from every system. Nobody reads them, and the first sign of trouble is usually a customer calling.”',
    targetView: 'vault',
  },
  {
    index: 1,
    timeRange: '0:30 – 1:10',
    onScreen: 'Payroll API key fingerprint chart with 03:00 UTC out-of-hours spike from unseen IP',
    script:
      '“This payroll key has behaved the same way for months. Tonight it ran at 3 a.m. from an address it has never used. Sentinel shows what normal looked like and why this isn’t.”',
    targetView: 'fingerprints',
  },
  {
    index: 2,
    timeRange: '1:10 – 1:50',
    onScreen: 'Honey key list — trigger a fake key live',
    script:
      '“This key is fake. Nothing legitimate touches it. Watch.” Trigger it. “That is a near-certain alert, with almost no false alarms.”',
    targetView: 'honey_traps',
    actionLabel: 'Trigger Honey Key Live',
  },
  {
    index: 3,
    timeRange: '1:50 – 2:35',
    onScreen: 'Blast-radius preview, then Approve narrower action, then Undo',
    script:
      '“Before suspending, Sentinel shows what would break: payroll, on pay day. I’ll approve a narrower action instead. And if I’m wrong, one click undoes it, and both steps are logged.”',
    targetView: 'overview',
  },
  {
    index: 4,
    timeRange: '2:35 – 3:00',
    onScreen: 'Architecture, honest limits & close',
    script:
      '“What we miss: an attacker who stays inside a key’s normal pattern, and anything in systems we aren’t connected to. That’s why the log vault and paperwork checks exist.”',
    targetView: 'architecture',
  },
];

interface DemoPresenterDockProps {
  stepIndex: number;
  onSelectStep: (idx: number) => void;
  onTriggerHoneyDemo: () => Promise<void>;
  onResetDemo: () => Promise<void>;
  onClose: () => void;
  busyAction: string | null;
}

export function DemoPresenterDock({
  stepIndex,
  onSelectStep,
  onTriggerHoneyDemo,
  onResetDemo,
  onClose,
  busyAction,
}: DemoPresenterDockProps) {
  const step = HARBOR_FINCH_DEMO_STEPS[stepIndex] ?? HARBOR_FINCH_DEMO_STEPS[0];

  return (
    <aside
      aria-label="3-Minute Harbor and Finch Demo Script"
      data-testid="demo-presenter-dock"
      className="bg-[#231914] text-[#FAF5F0] border border-[#45332A] rounded-lg p-4 mb-6"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-4xl">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#C7B3A3]">
            <span className="font-semibold text-[#5EEAD4]">3-Minute Demo · Harbor &amp; Finch</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-white">{step.timeRange}</span>
            <span aria-hidden="true">·</span>
            <span>On screen: {step.onScreen}</span>
          </div>
          <p className="text-sm text-white leading-relaxed">{step.script}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {step.actionLabel && (
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void onTriggerHoneyDemo()}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#C62828] rounded-md hover:bg-[#DC2626] transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer"
            >
              {step.actionLabel}
            </button>
          )}

          <button
            type="button"
            disabled={stepIndex <= 0}
            onClick={() => onSelectStep(stepIndex - 1)}
            aria-label="Previous demo step"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#E4E3DD] bg-[#27272A] rounded-md hover:bg-[#3F3F46] disabled:opacity-40 whitespace-nowrap cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev
          </button>

          <button
            type="button"
            disabled={stepIndex >= HARBOR_FINCH_DEMO_STEPS.length - 1}
            onClick={() => onSelectStep(stepIndex + 1)}
            aria-label="Next demo step"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#18181B] bg-white rounded-md hover:bg-[#E4E3DD] disabled:opacity-40 whitespace-nowrap cursor-pointer"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void onResetDemo()}
            aria-label="Reset Harbor and Finch demo state"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#D4D3CC] border border-[#3F3F46] rounded-md hover:bg-[#27272A] whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Exit 3-minute demo mode"
            className="p-1.5 text-[#A8A69E] hover:text-white rounded-md hover:bg-[#27272A] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Step selector strip */}
      <div className="mt-3 pt-3 border-t border-[#2E2E32] flex flex-wrap items-center gap-2">
        {HARBOR_FINCH_DEMO_STEPS.map((s) => (
          <button
            key={s.index}
            type="button"
            onClick={() => onSelectStep(s.index)}
            className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded transition-colors whitespace-nowrap cursor-pointer ${
              s.index === stepIndex
                ? 'bg-[#0F6E56] text-white font-semibold'
                : 'text-[#A8A69E] hover:text-white hover:bg-[#27272A]'
            }`}
          >
            {s.index + 1}. {s.timeRange}
          </button>
        ))}
      </div>
    </aside>
  );
}
