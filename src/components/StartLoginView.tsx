import { useState } from 'react';
import {
  Accessibility,
  Activity,
  ArrowRight,
  AudioLines,
  Building2,
  Check,
  Copy,
  Crosshair,
  Film,
  Globe,
  KeyRound,
  Lock,
  LogOut,
  MapPin,
  Mic,
  Moon,
  Shield,
  ShieldAlert,
  Smartphone,
  Sun,
  Terminal,
  UserCheck,
  Wand2,
  Webhook,
} from 'lucide-react';
import { LANGUAGE_OPTIONS, type LanguageCode, type UiCopy } from '../lib/i18n';
import type { ProtectedPortalKind } from './ProtectedPortalWrapper';
import { BrandMark } from './BrandMark';
import { OfflineIndicator, PWAInstallButton } from './PWAInstallButton';
import heroCommandImg from '../assets/images/hero_sentinel_command_1795174105039.jpg';
import edgeVaultImg from '../assets/images/sentinel_edge_vault_1795174095830.jpg';
import multimodalOpsImg from '../assets/images/sentinel_multimodal_ops_1795174098767.jpg';

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
  onOpenAccessibility: () => void;
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
  onOpenAccessibility,
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
    <div id="top" className="min-h-screen flex flex-col bg-[var(--sentinel-bg)] text-[var(--sentinel-ink)]">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 h-16 bg-[var(--sentinel-suede)]/95 backdrop-blur border-b border-[var(--sentinel-border)] px-6 lg:px-10 flex items-center justify-between gap-8 shrink-0">
        {/* Zone 1: Clean single-element brand mark */}
        <a
          href="#top"
          className="inline-flex items-center whitespace-nowrap shrink-0"
        >
          <BrandMark />
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav
          aria-label="Primary"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-[var(--sentinel-ink-secondary)]"
        >
          <a
            href="#capabilities"
            className="hover:text-[var(--sentinel-ink)] transition-colors whitespace-nowrap shrink-0"
          >
            Capabilities
          </a>
          <a
            href="#ai-studio"
            className="hover:text-[var(--sentinel-ink)] transition-colors whitespace-nowrap shrink-0"
          >
            AI Studio
          </a>
          <a
            href="#architecture"
            className="hover:text-[var(--sentinel-ink)] transition-colors whitespace-nowrap shrink-0"
          >
            Architecture
          </a>
          <a
            href="#portals"
            className="hover:text-[var(--sentinel-ink)] transition-colors whitespace-nowrap shrink-0"
          >
            Portals
          </a>
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            disabled={authBusy}
            onClick={() => void onSelectPortal('admin')}
            className="px-4 py-2 rounded-md bg-[var(--sentinel-accent)] hover:bg-[var(--sentinel-accent-hover)] disabled:opacity-60 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {authBusy ? 'Authenticating...' : isSignedIn ? 'Open Console' : 'Sign In'}
          </button>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 w-full focus:outline-none">
        {/* Auth Notices (if redirected or error occurred) */}
        {(authRequiredNotice || authError) && (
          <div className="max-w-7xl mx-auto px-6 lg:px-10 pt-6 space-y-3">
            {authRequiredNotice && !isSignedIn && (
              <div
                role="status"
                data-testid="auth-required-banner"
                className="window-suede rounded-md px-4 py-3 flex items-center gap-2.5 text-xs text-[var(--sentinel-ink)]"
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
          </div>
        )}

        {/* Section 1: Asymmetric Editorial Hero */}
        <section className="max-w-7xl mx-auto px-6 lg:px-10 py-10 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between gap-8">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[var(--sentinel-ink-muted)]">
                  <span>Harbor &amp; Finch LLP</span>
                  <span aria-hidden="true">·</span>
                  <span>Region {region}</span>
                  <span aria-hidden="true">·</span>
                  <span>BYOK KMS Enforced</span>
                </div>

                <h1 className="font-title text-[clamp(2.25rem,4vw,3.5rem)] font-bold text-[var(--sentinel-ink)] leading-[1.08]">
                  Minimal-exposure security monitoring built for live incident command.
                </h1>

                <p className="text-base text-[var(--sentinel-ink-secondary)] leading-relaxed max-w-xl">
                  Strip credentials at the edge before logs leave your boundary, verify every audit record with SHA-256 hash chaining, trap intruders with invisible decoys, and brief teams using real-time voice, transcription, and geospatial AI.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={() => void onSelectPortal('admin')}
                    data-testid="firebase-admin-signin-btn"
                    className="inline-flex items-center gap-2.5 px-5 py-3 rounded-md bg-[var(--sentinel-accent)] hover:bg-[var(--sentinel-accent-hover)] disabled:opacity-60 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4 shrink-0" />
                    <span>
                      {authBusy
                        ? 'Authenticating with Firebase...'
                        : isSignedIn
                          ? `Enter ${copy.portalAdmin}`
                          : `Sign in to ${copy.portalAdmin}`}
                    </span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>

                  <a
                    href="#portals"
                    className="inline-flex items-center gap-1.5 px-4 py-3 rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] hover:border-[var(--sentinel-accent)] text-sm font-semibold text-[var(--sentinel-ink)] transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>Portal &amp; Red-Team Access</span>
                  </a>
                </div>

                {authBusy && onCancelAuth && (
                  <button
                    type="button"
                    onClick={onCancelAuth}
                    className="text-xs font-semibold text-[var(--sentinel-ink-muted)] hover:text-[var(--sentinel-ink)] underline cursor-pointer"
                  >
                    Popup closed or stuck? Cancel and try again
                  </button>
                )}
              </div>

              {/* Quantified Proof Strip */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-[var(--sentinel-border)]">
                <div>
                  <p className="font-mono text-2xl font-bold tabular-nums text-[var(--sentinel-ink)]">
                    0 B
                  </p>
                  <p className="text-xs text-[var(--sentinel-ink-muted)]">
                    Plaintext secrets stored
                  </p>
                </div>
                <div>
                  <p className="font-mono text-2xl font-bold tabular-nums text-[var(--sentinel-ink)]">
                    100%
                  </p>
                  <p className="text-xs text-[var(--sentinel-ink-muted)]">
                    SHA-256 vault verified
                  </p>
                </div>
                <div>
                  <p className="font-mono text-2xl font-bold tabular-nums text-[var(--sentinel-ink)]">
                    1-Click
                  </p>
                  <p className="text-xs text-[var(--sentinel-ink-muted)]">
                    Reversible containment
                  </p>
                </div>
              </div>
            </div>

            {/* Hero 16:9 Bespoke Architectural Visual */}
            <div className="lg:col-span-6 relative rounded-lg overflow-hidden border border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] min-h-[300px] lg:min-h-[420px]">
              <img
                src={heroCommandImg}
                alt="Sentinel architectural security operations center with matte slate workstations and subtle cobalt lighting"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent flex flex-col justify-end p-6">
                <p className="text-xs font-mono text-slate-300">
                  Unified Admin Console · Live WebSocket Telemetry
                </p>
                <p className="font-title text-lg font-semibold text-white mt-1">
                  SecOps Triage, Breach Drills &amp; Executive Governance in one protected workspace
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Asymmetric Bento Capabilities & Multimodal AI Studio */}
        <section
          id="capabilities"
          className="border-t border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] py-14 lg:py-20"
        >
          <div className="max-w-7xl mx-auto px-6 lg:px-10 space-y-10">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-mono text-[var(--sentinel-accent)] font-semibold">
                Platform Capabilities
              </p>
              <h2 className="font-title text-2xl sm:text-3xl font-bold text-[var(--sentinel-ink)]">
                Built so a breach of the monitor exposes nothing critical.
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Bento 01: Edge Redaction & Vault */}
              <article className="lg:col-span-7 rounded-lg border border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] overflow-hidden grid grid-cols-1 md:grid-cols-12">
                <div className="md:col-span-7 p-6 flex flex-col justify-between gap-5">
                  <div className="space-y-3">
                    <h3 className="font-title text-xl font-semibold text-[var(--sentinel-ink)]">
                      01. Edge Redaction &amp; Hash-Chained Vault
                    </h3>
                    <p className="text-sm text-[var(--sentinel-ink-secondary)] leading-relaxed">
                      Customer-edge HMAC tokenization strips API keys, IBANs, JWTs, and emails before telemetry crosses into regional storage. Every alert, containment, and undo step is cryptographically chained.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[var(--sentinel-ink-muted)] pt-3 border-t border-[var(--sentinel-divider)]">
                    <span>Deterministic HMAC-SHA256</span>
                    <span aria-hidden="true">·</span>
                    <span>CSV Audit Export</span>
                    <span aria-hidden="true">·</span>
                    <span>30s Auto-Refresh</span>
                  </div>
                </div>
                <div className="md:col-span-5 bg-[var(--sentinel-inset)] min-h-[220px]">
                  <img
                    src={edgeVaultImg}
                    alt="Precision brushed titanium cryptographic data vault enclosed in translucent glass shielding"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              </article>

              {/* Bento 02: Stealth Honey Traps & Breach Drills */}
              <article className="lg:col-span-5 rounded-lg border border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] p-6 flex flex-col justify-between gap-5">
                <div className="space-y-3">
                  <h3 className="font-title text-xl font-semibold text-[var(--sentinel-ink)]">
                    02. Stealth Honey Traps &amp; Sandbox Breach Drills
                  </h3>
                  <p className="text-sm text-[var(--sentinel-ink-secondary)] leading-relaxed">
                    Plant invisible decoy keys and ERP vendors that immediately quarantine intruders on first touch, and run automated multi-system Breach Drills with live Recharts completion telemetry.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[var(--sentinel-divider)] text-xs">
                  <div>
                    <p className="font-semibold text-[var(--sentinel-ink)]">Machine Fingerprints</p>
                    <p className="text-[var(--sentinel-ink-muted)] mt-0.5">
                      Detects off-hours IP &amp; volume spikes
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--sentinel-ink)]">Dual-Control Holds</p>
                    <p className="text-[var(--sentinel-ink-muted)] mt-0.5">
                      Intercepts pre-payout IBAN swaps
                    </p>
                  </div>
                </div>
              </article>

              {/* Bento 03: Multimodal AI Command Studio */}
              <article
                id="ai-studio"
                className="lg:col-span-12 rounded-lg border border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] overflow-hidden grid grid-cols-1 lg:grid-cols-12"
              >
                <div className="lg:col-span-5 bg-[var(--sentinel-inset)] min-h-[240px]">
                  <img
                    src={multimodalOpsImg}
                    alt="Executive security briefing suite with studio microphone and acoustic dark slate walls"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between gap-6">
                  <div className="space-y-2">
                    <h3 className="font-title text-xl sm:text-2xl font-semibold text-[var(--sentinel-ink)]">
                      03. Integrated Multimodal AI Command Studio
                    </h3>
                    <p className="text-sm text-[var(--sentinel-ink-secondary)] leading-relaxed">
                      Every operator inside the Admin Portal gets direct access to six server-side multimodal tools without leaving the security console.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-[var(--sentinel-ink)]">
                        <AudioLines className="w-3.5 h-3.5 text-[var(--sentinel-accent)] shrink-0" />
                        <span>Live Voice Briefings</span>
                      </div>
                      <p className="text-[var(--sentinel-ink-muted)]">
                        Real-time bidirectional voice calls grounded in live telemetry.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-[var(--sentinel-ink)]">
                        <Mic className="w-3.5 h-3.5 text-[var(--sentinel-accent)] shrink-0" />
                        <span>Audio Transcription</span>
                      </div>
                      <p className="text-[var(--sentinel-ink-muted)]">
                        Record microphone incident memos and scan transcripts at the edge.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-[var(--sentinel-ink)]">
                        <MapPin className="w-3.5 h-3.5 text-[var(--sentinel-accent)] shrink-0" />
                        <span>Google Maps Grounding</span>
                      </div>
                      <p className="text-[var(--sentinel-ink-muted)]">
                        Up-to-date facility, cloud region, and emergency office lookups with source links.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-[var(--sentinel-ink)]">
                        <Wand2 className="w-3.5 h-3.5 text-[var(--sentinel-accent)] shrink-0" />
                        <span>Create &amp; Edit Images</span>
                      </div>
                      <p className="text-[var(--sentinel-ink-muted)]">
                        Generate or edit architecture diagrams and visual briefings from prompts.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-[var(--sentinel-ink)]">
                        <Film className="w-3.5 h-3.5 text-[var(--sentinel-accent)] shrink-0" />
                        <span>Text &amp; Photo to Video</span>
                      </div>
                      <p className="text-[var(--sentinel-ink-muted)]">
                        Generate 16:9 or 9:16 video briefings from text or animate uploaded photos.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-[var(--sentinel-ink)]">
                        <Webhook className="w-3.5 h-3.5 text-[var(--sentinel-accent)] shrink-0" />
                        <span>Signed Webhooks</span>
                      </div>
                      <p className="text-[var(--sentinel-ink-muted)]">
                        Real-time WebSocket push and HMAC-SHA256 webhook dispatch.
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Section 3: Protected Portal Access (Unified Admin + Demo Attacker) */}
        <section id="portals" className="max-w-7xl mx-auto px-6 lg:px-10 py-14 lg:py-20 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-mono text-[var(--sentinel-accent)] font-semibold">
                Firebase-Protected Entry
              </p>
              <h2 className="font-title text-2xl sm:text-3xl font-bold text-[var(--sentinel-ink)]">
                Select your operational portal
              </h2>
            </div>

            {isSignedIn && (
              <div className="window-suede rounded-md px-3.5 py-2 flex items-center gap-2.5 text-xs shrink-0">
                <UserCheck className="w-4 h-4 text-[var(--sentinel-teal)] shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-[var(--sentinel-ink-muted)]">Signed in</p>
                  <p className="font-semibold text-[var(--sentinel-ink)] truncate max-w-[220px]">
                    {authenticatedEmail}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Unified Admin Management Portal */}
            <section
              aria-label="Unified Admin Management Portal"
              className={`lg:col-span-7 window-suede rounded-lg p-6 sm:p-8 flex flex-col justify-between gap-6 ${
                initialPortalChoice !== 'attacker' ? 'ring-1 ring-[var(--sentinel-accent)]/40' : ''
              }`}
            >
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <p className="text-xs font-mono text-[var(--sentinel-accent)] font-semibold">
                    Unified Management Console
                  </p>
                  <h3 className="font-title text-2xl font-bold text-[var(--sentinel-ink)]">
                    Sentinel Admin Management Portal
                  </h3>
                  <p className="text-sm text-[var(--sentinel-ink-secondary)] leading-relaxed">
                    One unified workspace combining SecOps triage, Breach Drills, AI Command Studio, Stealth Honey Traps, and Executive Board &amp; Legal oversight.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[var(--sentinel-divider)] text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-[var(--sentinel-ink)]">
                      <Activity className="w-3.5 h-3.5 text-[var(--sentinel-accent)]" />
                      <span>Alerts, Fingerprints &amp; Safe Undo</span>
                    </div>
                    <p className="text-[var(--sentinel-ink-muted)]">
                      Exact log spots, blast-radius preview, and 1-click resolve.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-[var(--sentinel-ink)]">
                      <Building2 className="w-3.5 h-3.5 text-[var(--sentinel-accent)]" />
                      <span>Executive, CFO &amp; Legal Oversight</span>
                    </div>
                    <p className="text-[var(--sentinel-ink-muted)]">
                      Control drift audit, payment holds, and 72h evidence packs.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-[var(--sentinel-ink)]">
                      <Crosshair className="w-3.5 h-3.5 text-[var(--sentinel-accent)]" />
                      <span>Honey Traps &amp; Breach Drills</span>
                    </div>
                    <p className="text-[var(--sentinel-ink-muted)]">
                      Live Recharts drill progress and automatic intruder lockout.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-[var(--sentinel-ink)]">
                      <AudioLines className="w-3.5 h-3.5 text-[var(--sentinel-accent)]" />
                      <span>AI Command Studio</span>
                    </div>
                    <p className="text-[var(--sentinel-ink-muted)]">
                      Voice Live, Audio Transcription, Maps, Image &amp; Video tools.
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={authBusy}
                onClick={() => void onSelectPortal('admin')}
                className="w-full py-3 px-4 rounded-md bg-[var(--sentinel-accent)] hover:bg-[var(--sentinel-accent-hover)] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
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
            </section>

            {/* Demo Attacker Portal */}
            <section
              aria-label="Demo Attacker Portal Selection"
              className={`lg:col-span-5 window-suede rounded-lg p-6 sm:p-8 flex flex-col justify-between gap-6 ${
                initialPortalChoice === 'attacker' ? 'ring-2 ring-[var(--sentinel-crit)]/50' : ''
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 text-xs font-mono">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--sentinel-crit)]">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Red-Team Simulation</span>
                  </span>
                  {connectedAttackers > 0 && (
                    <span className="font-semibold text-[var(--sentinel-crit)] tabular-nums">
                      {connectedAttackers} active
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <h3 className="font-title text-2xl font-bold text-[var(--sentinel-ink)]">
                    Demo Attacker Portal
                  </h3>
                  <p className="text-sm text-[var(--sentinel-ink-secondary)] leading-relaxed">
                    Sign in on this device or a second phone to manually probe{' '}
                    <strong className="text-[var(--sentinel-ink)]">Harbor &amp; Finch LLP</strong>{' '}
                    and observe real-time alerts and webhooks inside the Admin Portal.
                  </p>
                </div>

                <ul className="space-y-2 text-xs text-[var(--sentinel-ink-secondary)] pt-2 border-t border-[var(--sentinel-divider)]">
                  <li className="flex items-start gap-2">
                    <Terminal className="w-3.5 h-3.5 text-[var(--sentinel-crit)] mt-0.5 shrink-0" />
                    <span>Probe company files, mutate API keys, and trigger off-hours anomalies</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Smartphone className="w-3.5 h-3.5 text-[var(--sentinel-crit)] mt-0.5 shrink-0" />
                    <span>Touching any stealth honey trap immediately locks out the session</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-2.5">
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
                  className="w-full py-2 px-3 rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] hover:border-[var(--sentinel-crit)] text-xs font-semibold text-[var(--sentinel-ink)] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[var(--sentinel-teal)]" />
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
        </section>

        {/* Section 4: Architecture Proof & Trust Bar */}
        <section
          id="architecture"
          className="border-t border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] py-10"
        >
          <div className="max-w-7xl mx-auto px-6 lg:px-10 grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs">
            <div className="space-y-1">
              <p className="font-semibold text-[var(--sentinel-ink)]">Verified Identity &amp; Rules</p>
              <p className="text-[var(--sentinel-ink-muted)]">
                Firebase Google SSO with per-operator isolated Firestore security rules.
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-[var(--sentinel-ink)]">Zero Plaintext Persistence</p>
              <p className="text-[var(--sentinel-ink-muted)]">
                Customer-edge redaction strips keys &amp; PII using customer-held HMAC salt.
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-[var(--sentinel-ink)]">Regional BYOK KMS ({region})</p>
              <p className="text-[var(--sentinel-ink-muted)]">
                Regional data residency and server-side Gemini operations with zero client key exposure.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer with Theme & Language Controls */}
      <footer className="border-t border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] px-6 lg:px-10 py-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-[var(--sentinel-ink-muted)]">
          <div className="flex items-center gap-2.5">
            <BrandMark size="sm" />
            <span aria-hidden="true">·</span>
            <span>Harbor &amp; Finch LLP · {region}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <PWAInstallButton variant="footer" />
            <button
              type="button"
              onClick={onOpenAccessibility}
              data-testid="start-a11y-btn"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] hover:border-[var(--sentinel-accent)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Accessibility className="w-3.5 h-3.5 text-[var(--sentinel-accent)]" />
              <span>Accessibility</span>
            </button>
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
              <span>{theme === 'light' ? copy.darkMode : copy.lightMode}</span>
            </button>

            {isSignedIn && (
              <button
                type="button"
                onClick={() => void onSignOut()}
                disabled={authBusy}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] hover:border-[var(--sentinel-crit)] hover:text-[var(--sentinel-crit)] transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>
      </footer>
      <OfflineIndicator />
    </div>
  );
}
