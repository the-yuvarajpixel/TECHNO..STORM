import { useEffect, useState } from 'react';
import { Check, Copy, Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'sidebar' | 'footer';
}

export function PWAInstallButton({ variant = 'footer' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [guideOpen, setGuideOpen] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  useEffect(() => {
    if (!guideOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGuideOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [guideOpen]);

  // Hide install trigger when already running as an installed standalone PWA
  if (isInstalled) {
    return null;
  }

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://sentinel.app';
  const twaCommand = `npx @bubblewrap/cli init --manifest=${origin}/manifest.webmanifest && npx @bubblewrap/cli build`;

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(twaCommand);
      setCopiedCmd(true);
      window.setTimeout(() => setCopiedCmd(false), 2000);
    } catch {
      // Clipboard blocked in sandbox
    }
  };

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setGuideOpen(true);
      }
      return;
    }
    setGuideOpen(true);
  };

  const label = isInstallable
    ? 'Install App'
    : isIOS
      ? 'Install on iOS'
      : isAndroid
        ? 'Install on Android'
        : 'Install App / APK';

  const buttonClasses =
    variant === 'sidebar'
      ? 'w-full flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] hover:border-[var(--sentinel-accent)] transition-colors whitespace-nowrap cursor-pointer'
      : variant === 'compact'
        ? 'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] text-[var(--sentinel-ink)] hover:border-[var(--sentinel-accent)] transition-colors whitespace-nowrap shrink-0 cursor-pointer'
        : 'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] hover:border-[var(--sentinel-accent)] transition-colors whitespace-nowrap shrink-0 cursor-pointer';

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        data-testid="pwa-install-btn"
        aria-label={label}
        className={buttonClasses}
      >
        {isInstallable ? (
          <Download className="w-3.5 h-3.5 text-[var(--sentinel-accent)] shrink-0" />
        ) : (
          <Smartphone className="w-3.5 h-3.5 text-[var(--sentinel-accent)] shrink-0" />
        )}
        <span>{label}</span>
      </button>

      {guideOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-guide-title"
          data-testid="pwa-install-guide-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setGuideOpen(false);
          }}
        >
          <div className="window-suede rounded-lg w-full max-w-lg shadow-2xl overflow-hidden text-left">
            <div className="px-5 py-4 border-b border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Smartphone className="w-4 h-4 text-[var(--sentinel-accent)] shrink-0" />
                <h2
                  id="pwa-install-guide-title"
                  className="font-title text-base font-semibold text-[var(--sentinel-ink)] truncate"
                >
                  Install Sentinel on Android, iOS, or Build APK
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                aria-label="Close installation guide"
                className="p-1.5 rounded-md text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-ink)] hover:bg-[var(--sentinel-hover)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-[var(--sentinel-ink-secondary)]">
              <div className="surface-inset rounded-md p-3.5 space-y-1.5">
                <p className="font-semibold text-[var(--sentinel-ink)]">
                  1. Instant Android Install (Standalone App — No Store Required)
                </p>
                <p className="leading-relaxed">
                  Open this URL in <strong>Chrome on Android</strong>, tap the browser menu (⋮), and choose{' '}
                  <strong>Install app</strong> or <strong>Add to Home screen</strong>. Sentinel launches full-screen with its shield icon, offline cache, and app shortcuts.
                </p>
              </div>

              <div className="surface-inset rounded-md p-3.5 space-y-1.5">
                <p className="font-semibold text-[var(--sentinel-ink)]">
                  2. iPhone &amp; iPad (Safari)
                </p>
                <p className="leading-relaxed">
                  Tap the <strong>Share</strong> icon in the Safari toolbar, scroll down, and tap{' '}
                  <strong>Add to Home Screen</strong>.
                </p>
              </div>

              <div className="surface-inset rounded-md p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-[var(--sentinel-ink)]">
                    3. Package Signed Android APK / AAB (Trusted Web Activity)
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCopyCommand()}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[11px] font-semibold text-[var(--sentinel-ink)] hover:border-[var(--sentinel-accent)] cursor-pointer"
                  >
                    {copiedCmd ? (
                      <>
                        <Check className="w-3 h-3 text-[var(--sentinel-teal)]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="leading-relaxed">
                  Sentinel exposes a compliant Web App Manifest (<code className="font-mono">/manifest.webmanifest</code>) and maskable 512px PNG icons ready for Google&apos;s Bubblewrap TWA packager:
                </p>
                <pre className="p-2.5 rounded bg-[var(--sentinel-suede)] border border-[var(--sentinel-border-soft)] font-mono text-[11px] text-[var(--sentinel-ink)] overflow-x-auto whitespace-pre-wrap break-all">
                  {twaCommand}
                </pre>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] flex justify-end">
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="px-4 py-1.5 text-xs font-semibold rounded-md bg-[var(--sentinel-accent)] hover:bg-[var(--sentinel-accent-hover)] text-white cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="pwa-offline-indicator"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-md border border-[var(--sentinel-high-border)] bg-[var(--sentinel-high-bg)] px-3 py-2 text-xs font-semibold text-[var(--sentinel-high-ink)] shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Offline Mode — Cached interface active; live stream will resume automatically.</span>
    </div>
  );
}
