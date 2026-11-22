import { useEffect } from 'react';
import { Accessibility, Contrast, RotateCcw, Sparkles, Type, X } from 'lucide-react';

export type TextScaleOption = 'md' | 'lg' | 'xl';

export interface AccessibilityPrefs {
  highContrast: boolean;
  textScale: TextScaleOption;
  reduceMotion: boolean;
}

export const A11Y_STORAGE_KEY = 'sentinel-accessibility-prefs-v1';

export const DEFAULT_A11Y_PREFS: AccessibilityPrefs = {
  highContrast: false,
  textScale: 'md',
  reduceMotion: false,
};

export function loadAccessibilityPrefs(): AccessibilityPrefs {
  if (typeof window === 'undefined') return DEFAULT_A11Y_PREFS;
  try {
    const raw = window.localStorage.getItem(A11Y_STORAGE_KEY);
    if (!raw) {
      const prefersReduced =
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const prefersMoreContrast =
        window.matchMedia?.('(prefers-contrast: more)').matches ?? false;
      return {
        highContrast: prefersMoreContrast,
        textScale: 'md',
        reduceMotion: prefersReduced,
      };
    }
    const parsed = JSON.parse(raw) as Partial<AccessibilityPrefs>;
    const textScale: TextScaleOption =
      parsed.textScale === 'lg' || parsed.textScale === 'xl' ? parsed.textScale : 'md';
    return {
      highContrast: Boolean(parsed.highContrast),
      textScale,
      reduceMotion: Boolean(parsed.reduceMotion),
    };
  } catch {
    return DEFAULT_A11Y_PREFS;
  }
}

export function applyAccessibilityPrefs(prefs: AccessibilityPrefs): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('high-contrast', prefs.highContrast);
  root.classList.toggle('reduce-motion', prefs.reduceMotion);
  if (prefs.textScale === 'md') {
    root.removeAttribute('data-text-scale');
  } else {
    root.setAttribute('data-text-scale', prefs.textScale);
  }
  try {
    window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage errors
  }
}

interface AccessibilityModalProps {
  open: boolean;
  prefs: AccessibilityPrefs;
  onChange: (next: AccessibilityPrefs) => void;
  onClose: () => void;
}

const TEXT_SCALE_CHOICES: Array<{ id: TextScaleOption; label: string; pct: string }> = [
  { id: 'md', label: 'Default', pct: '100%' },
  { id: 'lg', label: 'Large', pct: '112%' },
  { id: 'xl', label: 'Extra Large', pct: '125%' },
];

export function AccessibilityModal({
  open,
  prefs,
  onChange,
  onClose,
}: AccessibilityModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isCustomized =
    prefs.highContrast || prefs.textScale !== 'md' || prefs.reduceMotion;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="a11y-modal-title"
      data-testid="accessibility-modal"
    >
      <div className="window-suede rounded-lg w-full max-w-md shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Accessibility className="w-4 h-4 text-[var(--sentinel-accent)] shrink-0" />
            <h2
              id="a11y-modal-title"
              className="font-title text-base font-semibold text-[var(--sentinel-ink)] truncate"
            >
              Accessibility &amp; Display
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close accessibility settings"
            className="p-1.5 rounded-md text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-ink)] hover:bg-[var(--sentinel-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* High Contrast Toggle */}
          <div className="surface-inset rounded-md p-3.5 flex items-center justify-between gap-4">
            <div className="space-y-0.5 min-w-0">
              <p className="text-xs font-semibold text-[var(--sentinel-ink)] flex items-center gap-1.5">
                <Contrast className="w-3.5 h-3.5 text-[var(--sentinel-accent)] shrink-0" />
                <span>High-Contrast Mode (WCAG AAA)</span>
              </p>
              <p className="text-[11px] text-[var(--sentinel-ink-muted)] leading-snug">
                Boosts text, border, and focus contrast across Light and Dark themes.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.highContrast}
              aria-label="Toggle high-contrast mode"
              data-testid="a11y-high-contrast-toggle"
              onClick={() => onChange({ ...prefs, highContrast: !prefs.highContrast })}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                prefs.highContrast
                  ? 'bg-[var(--sentinel-accent)] border-[var(--sentinel-accent)]'
                  : 'bg-[var(--sentinel-segment)] border-[var(--sentinel-border)]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  prefs.highContrast ? 'translate-x-5.5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Text Scale Control */}
          <div className="surface-inset rounded-md p-3.5 space-y-2.5">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-[var(--sentinel-ink)] flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5 text-[var(--sentinel-accent)] shrink-0" />
                <span>Text Size</span>
              </p>
              <p className="text-[11px] text-[var(--sentinel-ink-muted)] leading-snug">
                Scales interface typography smoothly without clipping controls.
              </p>
            </div>
            <div
              role="radiogroup"
              aria-label="Text size scale"
              className="grid grid-cols-3 gap-2"
            >
              {TEXT_SCALE_CHOICES.map((choice) => {
                const selected = prefs.textScale === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-testid={`a11y-text-scale-${choice.id}`}
                    onClick={() => onChange({ ...prefs, textScale: choice.id })}
                    className={`px-2.5 py-2 rounded-md border text-center transition-colors cursor-pointer ${
                      selected
                        ? 'border-[var(--sentinel-accent)] bg-[var(--sentinel-accent-soft)] text-[var(--sentinel-accent-soft-ink)] font-semibold'
                        : 'border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink-secondary)] hover:border-[var(--sentinel-accent)]'
                    }`}
                  >
                    <span className="block text-xs">{choice.label}</span>
                    <span className="block font-mono text-[10px] opacity-80">{choice.pct}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reduce Motion Toggle */}
          <div className="surface-inset rounded-md p-3.5 flex items-center justify-between gap-4">
            <div className="space-y-0.5 min-w-0">
              <p className="text-xs font-semibold text-[var(--sentinel-ink)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--sentinel-accent)] shrink-0" />
                <span>Reduce Motion</span>
              </p>
              <p className="text-[11px] text-[var(--sentinel-ink-muted)] leading-snug">
                Disables pulsing alerts, animated transitions, and smooth scrolling.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.reduceMotion}
              aria-label="Toggle reduced motion"
              data-testid="a11y-reduce-motion-toggle"
              onClick={() => onChange({ ...prefs, reduceMotion: !prefs.reduceMotion })}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                prefs.reduceMotion
                  ? 'bg-[var(--sentinel-accent)] border-[var(--sentinel-accent)]'
                  : 'bg-[var(--sentinel-segment)] border-[var(--sentinel-border)]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  prefs.reduceMotion ? 'translate-x-5.5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] flex items-center justify-between gap-2">
          {isCustomized ? (
            <button
              type="button"
              onClick={() => onChange(DEFAULT_A11Y_PREFS)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-ink)] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
          ) : (
            <span className="text-[11px] text-[var(--sentinel-ink-muted)]">
              Keyboard: Tab / Esc supported
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-md bg-[var(--sentinel-accent)] hover:bg-[var(--sentinel-accent-hover)] text-white cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
