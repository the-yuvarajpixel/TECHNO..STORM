import { useState } from 'react';
import {
  Activity,
  ArrowRight,
  Building2,
  Check,
  Copy,
  Crosshair,
  Globe,
  KeyRound,
  Lock,
  LogOut,
  Moon,
  Shield,
  ShieldAlert,
  Smartphone,
  Sun,
  Terminal,
  UserCheck,
  Webhook,
} from 'lucide-react';
import { LANGUAGE_OPTIONS, type LanguageCode, type UiCopy } from '../lib/i18n';
import type { ProtectedPortalKind } from './ProtectedPortalWrapper';

interface StartLoginViewProps {
  copy: UiCopy;
  lang: LanguageCode;
  onChangeLang: (lang: LanguageCode) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  region?: string;
  authenticatedEmail: string | null;
  authBusy: boolean;
  authError: string | null;
  authRequiredNotice?: string | null;
  initialPortalChoice?: ProtectedPortalKind;
  onClearAuthError: () => void;
  onCancelAuth?: () => void;
  onSelectPortal: (targetPortal: ProtectedPortalKind) => Promise<void>;
  onSignOut: () => Promise<void>;
  connectedAttackers: number;
}

export function StartLoginView({
  copy,
  lang,
  onChangeLang,
  theme,
  onToggleTheme,
  region = 'ap-southeast-2',
  authenticatedEmail,
  authBusy,
  authError,
  authRequiredNotice,
  initialPortalChoice = 'admin',
  onClearAuthError,
  onCancelAuth,
  onSelectPortal,
  onSignOut,
  connectedAttackers,
}: StartLoginViewProps) {
  const [copiedLink, setCopiedLink] = useState(false);

  const attackerUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?portal=attacker`
      : '?portal=attacker';

  const handleCopyAttackerUrl = async () => {
    try {
      await navigator.clipboard.writeText(attackerUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Clipboard blocked in sandbox
    }
  };

  const isSignedIn = Boolean(authenticatedEmail);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--sentinel-bg)] text-[var(--sentinel-ink)]">
      {/* Soft Nude Top Bar matching main workspace */}
      <header className="h-14 bg-[var(--sentinel-nude)] border-b border-[var(--sentinel-border)] px-4 lg:px-8 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-[var(--sentinel-accent)] text-white flex items-center justify-center">
            <Shield className="w-4 h-4" />
          </div>
          <span className="font-title text-xl font-semibold tracking-tight text-[var(--sentinel-ink)]">
            Sentinel
          </span>
          <span className="hidden sm:inline text-xs font-mono text-[var(--sentinel-ink-muted)] pl-2 border-l border-[var(--sentinel-border)]">
            Harbor &amp; Finch LLP · {region}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Language Toggle */}
          <label
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)]"
            aria-label="Select language"
          >
            <Globe className="w-3.5 h-3.5 text-[var(--sentinel-ink-muted)] shrink-0" />
            <select
              value={lang}
              onChange={(e) => onChangeLang(e.target.value as LanguageCode)}
              data-testid="start-language-toggle"
              aria-label="Language"
              className="bg-transparent text-xs font-semibold text-[var(--sentinel-ink)] focus:outline-none cursor-pointer"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option
                  key={opt.code}
                  value={opt.code}
                  className="bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)]"
                >
                  {opt.short}
                </option>
              ))}
            </select>
          </label>

          {/* Dark / Light Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            data-testid="start-theme-toggle"
            aria-label={theme === 'light' ? copy.darkMode : copy.lightMode}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] hover:border-[var(--sentinel-accent)] transition-colors cursor-pointer"
          >
            {theme === 'light' ? (
              <Moon className="w-3.5 h-3.5 text-[var(--sentinel-ink-secondary)]" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-[#FBBF24]" />
            )}
            <span className="hidden sm:inline">
              {theme === 'light' ? copy.darkMode : copy.lightMode}
            </span>
          </button>

          {isSignedIn && (
            <button
              type="button"
              onClick={() => void onSignOut()}
              disabled={authBusy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] hover:border-[var(--sentinel-crit)] hover:text-[var(--sentinel-crit)] transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Entry Canvas — Light Espresso / Deep Roasted Espresso */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-10">
        <div className="w-full max-w-5xl space-y-6">
          {/* Concise Hero Header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--sentinel-accent)]">
                Zero-Trust Security Monitor · Firebase-Protected Portals
              </p>
              <h1 className="font-title text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--sentinel-ink)] leading-[1.14]">
                {copy.overviewHeadline}
              </h1>
              <p className="text-sm text-[var(--sentinel-ink-secondary)] leading-relaxed">
                Sign in with Firebase to enter the unified Admin Management Portal or launch the Demo Attacker shell on a second device.
              </p>
            </div>

            {isSignedIn && (
              <div className="window-suede rounded-md px-3.5 py-2 flex items-center gap-2 text-xs shrink-0">
                <UserCheck className="w-4 h-4 text-[var(--sentinel-accent)] shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sentinel-ink-muted)]">
                    Authenticated via Firebase
                  </p>
                  <p className="font-semibold text-[var(--sentinel-ink)] truncate max-w-[220px]">
                    {authenticatedEmail}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Auth Required Banner when redirected from a protected portal */}
          {authRequiredNotice && !isSignedIn && (
            <div
              role="status"
              data-testid="auth-required-banner"
              className="window-suede rounded-md px-4 py-3 border-l-4 border-l-[var(--sentinel-accent)] flex items-center gap-2.5 text-xs text-[var(--sentinel-ink)]"
            >
              <Lock className="w-4 h-4 text-[var(--sentinel-accent)] shrink-0" />
              <span className="font-medium">{authRequiredNotice}</span>
            </div>
          )}

          {authError && (
            <div
              role="alert"
              className="p-3.5 rounded-md alert-pop-critical flex items-start justify-between gap-3 text-xs text-[var(--sentinel-crit-ink)]"
            >
              <span>{authError}</span>
              <button
                type="button"
                onClick={onClearAuthError}
                className="font-bold underline shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Asymmetric Alternating Windows: Soft Suede (Unified Admin Portal) + Soft Nude (Demo Attacker) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* LEFT: Unified Admin Management Portal Card (Soft Suede) */}
            <section
              aria-label="Unified Admin Management Portal"
              className={`lg:col-span-7 window-suede rounded-lg p-6 sm:p-7 flex flex-col justify-between gap-6 ${
                initialPortalChoice !== 'attacker' ? 'ring-1 ring-[var(--sentinel-accent)]/40' : ''
              }`}
            >
              <div className="space-y-5">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sentinel-accent)]">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Firebase Protected · Unified Management Console</span>
                  </div>
                  <h2 className="font-title text-2xl font-semibold text-[var(--sentinel-ink)]">
                    Sentinel Admin Management Portal
                  </h2>
                  <p className="text-xs text-[var(--sentinel-ink-secondary)] leading-relaxed">
                    One unified workspace combining SecOps response, stealth honey traps, and Executive Board, CFO &amp; Legal oversight.
                  </p>
                </div>

                {/* Unified Capabilities Overview (SecOps + Executive merged cleanly) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-md surface-inset space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--sentinel-ink)]">
                      <Activity className="w-3.5 h-3.5 text-[var(--sentinel-accent)] shrink-0" />
                      <span>Alerts, Fingerprints &amp; Safe Undo</span>
                    </div>
                    <p className="text-[11px] text-[var(--sentinel-ink-secondary)]">
                      Exact log spots, blast-radius preview before containment, and 1-click resolve.
                    </p>
                  </div>

                  <div className="p-3 rounded-md surface-inset space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--sentinel-ink)]">
                      <Building2 className="w-3.5 h-3.5 text-[var(--sentinel-accent)] shrink-0" />
                      <span>Executive, CFO &amp; Legal Oversight</span>
                    </div>
                    <p className="text-[11px] text-[var(--sentinel-ink-secondary)]">
                      Audit Chair control drift, dual-control payment holds, and 72h legal evidence packs.
                    </p>
                  </div>

                  <div className="p-3 rounded-md surface-inset space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--sentinel-ink)]">
                      <Crosshair className="w-3.5 h-3.5 text-[var(--sentinel-accent)] shrink-0" />
                      <span>Stealth Honey Traps &amp; Quarantine</span>
                    </div>
                    <p className="text-[11px] text-[var(--sentinel-ink-secondary)]">
                      Plant invisible decoy keys &amp; vendors that immediately trap and block intruders.
                    </p>
                  </div>

                  <div className="p-3 rounded-md surface-inset space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--sentinel-ink)]">
                      <Webhook className="w-3.5 h-3.5 text-[var(--sentinel-accent)] shrink-0" />
                      <span>Signed Webhooks &amp; Log Vault</span>
                    </div>
                    <p className="text-[11px] text-[var(--sentinel-ink-secondary)]">
                      Real-time WebSocket push, HMAC-SHA256 webhooks, and tamper-evident SHA-256 vault.
                    </p>
                  </div>
                </div>

                {/* Primary Firebase Auth / Enter Unified Admin Portal CTA */}
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={() => void onSelectPortal('admin')}
                    data-testid="firebase-admin-signin-btn"
                    className="w-full py-3 px-4 rounded-md bg-[var(--sentinel-accent)] hover:bg-[var(--sentinel-accent-hover)] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4 shrink-0" />
                    <span>
                      {authBusy
                        ? 'Authenticating with Firebase...'
                        : isSignedIn
                          ? `Enter ${copy.portalAdmin}`
                          : `Sign in with Firebase → ${copy.portalAdmin}`}
                    </span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>
                  {authBusy && onCancelAuth && (
                    <button
                      type="button"
                      onClick={onCancelAuth}
                      className="w-full py-1.5 text-xs font-semibold text-[var(--sentinel-ink-muted)] hover:text-[var(--sentinel-ink)] underline cursor-pointer"
                    >
                      Popup closed or stuck? Cancel and try again
                    </button>
                  )}
                </div>
              </div>

              {/* Minimal Privacy & Security Architecture Footnote */}
              <div className="pt-4 border-t border-[var(--sentinel-border-soft)] grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-[var(--sentinel-ink-muted)]">
                <div>
                  <p className="font-semibold text-[var(--sentinel-ink)]">Verified Identity</p>
                  <p>Google SSO with email-verified Firestore security rules.</p>
                </div>
                <div>
                  <p className="font-semibold text-[var(--sentinel-ink)]">Zero Raw Secrets</p>
                  <p>Edge redaction strips keys &amp; PII using customer salt.</p>
                </div>
                <div>
                  <p className="font-semibold text-[var(--sentinel-ink)]">BYOK KMS ({region})</p>
                  <p>Customer-held KMS key &amp; audited Firestore sessions.</p>
                </div>
              </div>
            </section>

            {/* RIGHT: Demo Attacker Entry Card (Soft Nude — Alternating Window, ALSO Firebase Protected) */}
            <section
              aria-label="Demo Attacker Portal Selection"
              className={`lg:col-span-5 window-nude rounded-lg p-6 sm:p-7 flex flex-col justify-between gap-5 border-t-4 border-t-[var(--sentinel-crit)] ${
                initialPortalChoice === 'attacker' ? 'ring-2 ring-[var(--sentinel-crit)]/50' : ''
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wide text-[var(--sentinel-crit)]">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Firebase Protected · Red-Team</span>
                  </span>
                  {connectedAttackers > 0 && (
                    <span className="text-[11px] font-mono font-bold text-[var(--sentinel-crit)]">
                      {connectedAttackers} active
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <h2 className="font-title text-2xl font-semibold text-[var(--sentinel-ink)]">
                    Demo Attacker Portal
                  </h2>
                  <p className="text-xs text-[var(--sentinel-ink-secondary)] leading-relaxed">
                    Sign in with Firebase on this device or a second phone to manually probe{' '}
                    <strong className="text-[var(--sentinel-ink)]">Harbor &amp; Finch LLP</strong>{' '}
                    and watch real-time alerts &amp; signed webhooks fire inside the Admin Portal.
                  </p>
                </div>

                <ul className="space-y-2 text-xs text-[var(--sentinel-ink-secondary)] pt-1">
                  <li className="flex items-start gap-2">
                    <Terminal className="w-3.5 h-3.5 text-[var(--sentinel-crit)] mt-0.5 shrink-0" />
                    <span>Browse &amp; exfiltrate Harbor &amp; Finch company files and live logs</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <KeyRound className="w-3.5 h-3.5 text-[var(--sentinel-crit)] mt-0.5 shrink-0" />
                    <span>Mutate an API key or trigger a custom off-hours anomaly</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Smartphone className="w-3.5 h-3.5 text-[var(--sentinel-crit)] mt-0.5 shrink-0" />
                    <span>Touching any stealth honey trap immediately locks out the session</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-2.5 pt-2">
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => void onSelectPortal('attacker')}
                  data-testid="start-demo-attacker-btn"
                  className="w-full py-3 px-4 rounded-md bg-[var(--sentinel-crit)] hover:opacity-90 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-opacity cursor-pointer"
                >
                  <Terminal className="w-4 h-4 shrink-0" />
                  <span>
                    {authBusy
                      ? 'Authenticating...'
                      : isSignedIn
                        ? 'Enter Demo Attacker Portal'
                        : 'Sign in with Firebase → Demo Attacker'}
                  </span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={handleCopyAttackerUrl}
                  className="w-full py-2 px-3 rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] hover:border-[var(--sentinel-crit)] text-xs font-semibold text-[var(--sentinel-ink)] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[var(--sentinel-accent)]" />
                      <span>Copied Second-Phone Attacker Link</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[var(--sentinel-ink-muted)]" />
                      <span>Copy Direct Link for Another Phone</span>
                    </>
                  )}
                </button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
