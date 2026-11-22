import { Suspense, lazy, useEffect, useState } from 'react';
import {
  Accessibility,
  Activity,
  Bell,
  Building2,
  Crosshair,
  Database,
  FileCheck2,
  Globe,
  Home,
  Layers,
  LogOut,
  Menu,
  Moon,
  Play,
  Shield,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Sun,
  Terminal,
  Webhook,
  X,
} from 'lucide-react';
import type { MachineFingerprint, Severity, WebhookEndpoint } from './core/types';
import {
  getBreachDrillScenario,
  type BreachDrillScenario,
  type BreachDrillStepExecutionResult,
} from './core/breachDrill';
import { sentinelApi, useSentinelRealtime } from './lib/api';
import { LANGUAGE_OPTIONS, getUiCopy, type LanguageCode } from './lib/i18n';
import { updateOperatorPreferences } from './lib/firebase';
import { PENDING_PORTAL_STORAGE_KEY, useFirebaseAuth } from './components/AuthContext';
import {
  ProtectedPortalWrapper,
  type ProtectedPortalKind,
} from './components/ProtectedPortalWrapper';
import { StartLoginView } from './components/StartLoginView';
import { OverviewAlertsView } from './components/OverviewAlertsView';
import { PhoneAttackerModal } from './components/PhoneAttackerModal';
import {
  DemoPresenterDock,
  HARBOR_FINCH_DEMO_STEPS,
  type NavSection,
} from './components/DemoPresenterDock';
import { NotificationDrawer } from './components/NotificationDrawer';
import { SecurityChatbotDrawer } from './components/SecurityChatbotDrawer';
import {
  BreachDrillDock,
  BreachDrillModal,
  DRILL_CADENCE_MS,
  clearCompletedDrillHistory,
  loadCompletedDrillHistory,
  upsertCompletedDrillSession,
  type BreachDrillCadence,
  type CompletedDrillSessionRecord,
} from './components/BreachDrillPanel';
import { BrandMark } from './components/BrandMark';
import {
  AccessibilityModal,
  applyAccessibilityPrefs,
  loadAccessibilityPrefs,
  type AccessibilityPrefs,
} from './components/AccessibilityModal';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { severityLabel } from './lib/format';

// Route-level code splitting for faster mobile/PWA startup
const FingerprintsView = lazy(() =>
  import('./components/FingerprintsView').then((m) => ({ default: m.FingerprintsView })),
);
const HoneyTrapsView = lazy(() =>
  import('./components/HoneyTrapsView').then((m) => ({ default: m.HoneyTrapsView })),
);
const DriftToolkitView = lazy(() =>
  import('./components/DriftToolkitView').then((m) => ({ default: m.DriftToolkitView })),
);
const VaultIngestView = lazy(() =>
  import('./components/VaultIngestView').then((m) => ({ default: m.VaultIngestView })),
);
const WebhooksNotificationsView = lazy(() =>
  import('./components/WebhooksNotificationsView').then((m) => ({
    default: m.WebhooksNotificationsView,
  })),
);
const ArchitectureIntegrationView = lazy(() =>
  import('./components/ArchitectureIntegrationView').then((m) => ({
    default: m.ArchitectureIntegrationView,
  })),
);
const AiStudioView = lazy(() =>
  import('./components/AiStudioView').then((m) => ({ default: m.AiStudioView })),
);
const ExecutivePortalView = lazy(() =>
  import('./components/ExecutivePortalView').then((m) => ({ default: m.ExecutivePortalView })),
);
const AttackerPortalView = lazy(() =>
  import('./components/AttackerPortalView').then((m) => ({ default: m.AttackerPortalView })),
);

type ThemeMode = 'light' | 'dark';
type EntryRoute = 'landing' | ProtectedPortalKind;

function detectInitialEntry(): {
  route: EntryRoute;
  portal: ProtectedPortalKind;
  initialView: NavSection;
} {
  if (typeof window === 'undefined') {
    return { route: 'landing', portal: 'admin', initialView: 'overview' };
  }
  const params = new URLSearchParams(window.location.search);
  const p = params.get('portal');
  if (p === 'attacker' || window.location.pathname.includes('/attacker')) {
    return { route: 'attacker', portal: 'attacker', initialView: 'overview' };
  }
  if (p === 'executive' || window.location.pathname.includes('/executive')) {
    return { route: 'admin', portal: 'admin', initialView: 'executive' };
  }
  if (p === 'admin' || p === 'secops' || params.get('demo') === '1') {
    return { route: 'admin', portal: 'admin', initialView: 'overview' };
  }
  return { route: 'landing', portal: 'admin', initialView: 'overview' };
}

function detectInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem('sentinel-theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return 'light';
}

function detectInitialLanguage(): LanguageCode {
  if (typeof window === 'undefined') return 'en';
  const saved = window.localStorage.getItem('sentinel-lang');
  if (saved === 'en' || saved === 'es' || saved === 'fr' || saved === 'de') return saved;
  return 'en';
}

function playSubtleAlertChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  } catch {
    // Ignore autoplay restriction when user hasn't interacted yet
  }
}

export default function App() {
  const initialEntry = detectInitialEntry();

  const {
    user,
    authBusy,
    authError,
    operatorProfile,
    signInWithGoogle,
    signOutAdmin,
    cancelAuth,
    clearAuthError,
  } = useFirebaseAuth();

  const [entryRoute, setEntryRoute] = useState<EntryRoute>(initialEntry.route);
  const [portal, setPortal] = useState<ProtectedPortalKind>(initialEntry.portal);
  const [theme, setTheme] = useState<ThemeMode>(detectInitialTheme);
  const [lang, setLang] = useState<LanguageCode>(detectInitialLanguage);

  const {
    snapshot,
    setSnapshot,
    loading,
    error,
    lastSyncedAt,
    wsStatus,
    liveToast,
    dismissToast,
    browserPushPermission,
    requestBrowserPush,
    refresh,
  } = useSentinelRealtime(portal === 'attacker' ? 'attacker' : 'secops');

  const [activeView, setActiveView] = useState<NavSection>(initialEntry.initialView);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>('alt_payroll_03am');
  const [selectedFpId, setSelectedFpId] = useState<string | null>('fp_payroll');
  const [highlightedVaultSeq, setHighlightedVaultSeq] = useState<number | null>(null);
  const [highlightedAlertId, setHighlightedAlertId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [drillModalOpen, setDrillModalOpen] = useState(false);
  const [activeDrill, setActiveDrill] = useState<{
    drillId: string;
    scenarioId: BreachDrillScenario['id'];
    cadence: BreachDrillCadence;
    status: 'running' | 'paused' | 'completed' | 'aborted';
    startedAt: string;
    nextStepIndex: number;
    results: BreachDrillStepExecutionResult[];
    error: string | null;
  } | null>(null);
  const [firingDrillStep, setFiringDrillStep] = useState<number | null>(null);
  const [completedDrillHistory, setCompletedDrillHistory] = useState<CompletedDrillSessionRecord[]>(
    loadCompletedDrillHistory,
  );
  const [a11yPrefs, setA11yPrefs] = useState<AccessibilityPrefs>(loadAccessibilityPrefs);
  const [a11yModalOpen, setA11yModalOpen] = useState(false);
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [demoActive, setDemoActive] = useState(false);
  const [demoStepIndex, setDemoStepIndex] = useState(0);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const copy = getUiCopy(lang);

  const navItems: Array<{
    id: NavSection;
    label: string;
    breadcrumb: string;
    icon: typeof Shield;
  }> = [
    { id: 'overview', label: copy.navOverview, breadcrumb: copy.navOverview, icon: Shield },
    { id: 'executive', label: copy.navExecutive, breadcrumb: copy.navExecutive, icon: Building2 },
    { id: 'fingerprints', label: copy.navFingerprints, breadcrumb: copy.navFingerprints, icon: Activity },
    { id: 'honey_traps', label: copy.navHoneyTraps, breadcrumb: copy.navHoneyTraps, icon: Crosshair },
    { id: 'drift_toolkit', label: copy.navDriftToolkit, breadcrumb: copy.navDriftToolkit, icon: FileCheck2 },
    { id: 'vault', label: copy.navVault, breadcrumb: copy.navVault, icon: Database },
    { id: 'webhooks', label: copy.navWebhooks, breadcrumb: copy.navWebhooks, icon: Webhook },
    { id: 'ai_studio', label: 'AI Studio', breadcrumb: 'AI Command Studio', icon: Sparkles },
    { id: 'architecture', label: copy.navArchitecture, breadcrumb: copy.navArchitecture, icon: Layers },
  ];

  // Apply Dark / Light mode class to root HTML element
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem('sentinel-theme', theme);
  }, [theme]);

  // Apply WCAG accessibility preferences (High Contrast, Text Scale, Reduce Motion)
  useEffect(() => {
    applyAccessibilityPrefs(a11yPrefs);
  }, [a11yPrefs]);

  // Persist selected language
  useEffect(() => {
    document.documentElement.lang = lang;
    window.localStorage.setItem('sentinel-lang', lang);
  }, [lang]);

  // Support ?demo=1 direct route on initial load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1') {
      setPortal('admin');
      setEntryRoute('admin');
      setDemoActive(true);
      setDemoStepIndex(0);
      setActiveView(HARBOR_FINCH_DEMO_STEPS[0].targetView);
    }
  }, []);

  // Automatically enter pending portal after mobile/popup-blocked redirect authentication completes
  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    const pending = window.sessionStorage.getItem(PENDING_PORTAL_STORAGE_KEY);
    if (pending === 'admin' || pending === 'attacker') {
      window.sessionStorage.removeItem(PENDING_PORTAL_STORAGE_KEY);
      setPortal(pending);
      setEntryRoute(pending);
    }
  }, [user]);

  // Optional audio chime + auto-focus exact incoming attack in Admin portals
  useEffect(() => {
    if (user && entryRoute !== 'landing' && portal !== 'attacker' && liveToast) {
      if (liveToast.origin === 'manual_attacker' && liveToast.alertId) {
        setSelectedAlertId(liveToast.alertId);
      }
      if (snapshot?.notificationPrefs?.soundChimeEnabled) {
        playSubtleAlertChime();
      }
    }
  }, [user, entryRoute, liveToast, portal, snapshot?.notificationPrefs?.soundChimeEnabled]);

  // Automated Breach Drill multi-stage progression timer
  useEffect(() => {
    if (!activeDrill || activeDrill.status !== 'running') return;
    const scenario = getBreachDrillScenario(activeDrill.scenarioId);
    if (!scenario) return;
    if (activeDrill.nextStepIndex >= scenario.stages.length) return;
    if (firingDrillStep !== null) return;

    const cadenceMs = DRILL_CADENCE_MS[activeDrill.cadence];
    if (cadenceMs === null) return; // Manual step mode

    const delay = activeDrill.nextStepIndex === 0 ? 200 : cadenceMs;
    const timer = window.setTimeout(() => {
      void executeBreachDrillStage(activeDrill.drillId, activeDrill.scenarioId, activeDrill.nextStepIndex);
    }, delay);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDrill, firingDrillStep]);

  // Persist completed drill sessions (last 5) and keep active completed session's live response score synced
  useEffect(() => {
    if (!activeDrill || activeDrill.status !== 'completed') return;
    const scenario = getBreachDrillScenario(activeDrill.scenarioId);
    if (!scenario) return;

    const drillAlertIds = activeDrill.results
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

    const totalStages = scenario.stages.length;
    const completedStages = activeDrill.results.length;
    const stageCompletionPct = Math.round((completedStages / Math.max(1, totalStages)) * 100);
    const successRate =
      drillAlerts.length === 0
        ? stageCompletionPct
        : Math.round(
            ((triagedCount * 0.35 + containedCount * 0.35 + resolvedCount * 0.3) /
              drillAlerts.length) *
              100,
          );

    const startMs = Date.parse(activeDrill.startedAt);
    const lastStageExecMs = activeDrill.results.reduce((latest, r) => {
      const parsed = Date.parse(r.executedAt);
      return Number.isNaN(parsed) ? latest : Math.max(latest, parsed);
    }, Number.NaN);
    const durationSec =
      !Number.isNaN(startMs) && !Number.isNaN(lastStageExecMs) && lastStageExecMs >= startMs
        ? Math.max(1, Math.round((lastStageExecMs - startMs) / 1000))
        : scenario.estimatedDurationSec;

    const record: CompletedDrillSessionRecord = {
      drillId: activeDrill.drillId,
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      cadence: activeDrill.cadence,
      completedAt: new Date().toISOString(),
      durationSec,
      completedStages,
      totalStages,
      alertsRaised: drillAlerts.length,
      triagedCount,
      containedCount,
      resolvedCount,
      successRate,
    };

    setCompletedDrillHistory((prev) => upsertCompletedDrillSession(prev, record));
  }, [activeDrill, snapshot?.alerts]);

  const syncUrlPortal = (nextRoute: EntryRoute) => {
    try {
      const url = new URL(window.location.href);
      if (nextRoute === 'landing') {
        url.searchParams.delete('portal');
      } else {
        url.searchParams.set('portal', nextRoute);
      }
      window.history.replaceState({}, '', url.toString());
    } catch {
      // Ignore history API restrictions in sandboxed iframes
    }
  };

  const navigateToPortal = (next: ProtectedPortalKind) => {
    setPortal(next);
    setEntryRoute(next);
    syncUrlPortal(next);
    if (user && next === 'admin') {
      void updateOperatorPreferences(user.uid, { defaultPortal: 'secops' }).catch(() => {});
    }
  };

  const openLandingPage = () => {
    setEntryRoute('landing');
    syncUrlPortal('landing');
  };

  // Called from public StartLoginView — authenticates via Firebase if needed, then enters selected protected portal
  const handleSelectPortalFromLanding = async (targetPortal: ProtectedPortalKind) => {
    if (user) {
      navigateToPortal(targetPortal);
      return;
    }
    const ok = await signInWithGoogle({
      sessionPortal: targetPortal === 'attacker' ? 'attacker' : 'secops',
      preferredLanguage: lang,
      preferredTheme: theme,
    });
    if (ok) {
      navigateToPortal(targetPortal);
    }
  };

  const handleChangeLang = (nextLang: LanguageCode) => {
    setLang(nextLang);
    if (user) {
      void updateOperatorPreferences(user.uid, { preferredLanguage: nextLang }).catch(() => {});
    }
  };

  const handleToggleTheme = () => {
    const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    if (user) {
      void updateOperatorPreferences(user.uid, { preferredTheme: nextTheme }).catch(() => {});
    }
  };

  const handleSignOut = async () => {
    setDemoActive(false);
    setDrawerOpen(false);
    setChatOpen(false);
    setDrillModalOpen(false);
    setActiveDrill(null);
    setMobileMenuOpen(false);
    await signOutAdmin();
    openLandingPage();
  };

  const unreadCount = snapshot?.notifications?.filter((n) => !n.read).length ?? 0;
  const connectedAttackers = snapshot?.connectedRoles?.attacker ?? 0;
  const activeNav = navItems.find((n) => n.id === activeView) ?? navItems[0];

  const handleSelectDemoStep = (idx: number) => {
    const bounded = Math.max(0, Math.min(HARBOR_FINCH_DEMO_STEPS.length - 1, idx));
    navigateToPortal('admin');
    setDemoStepIndex(bounded);
    const step = HARBOR_FINCH_DEMO_STEPS[bounded];
    setActiveView(step.targetView);
    if (step.targetView === 'fingerprints') {
      setSelectedFpId('fp_payroll');
    } else if (step.targetView === 'overview') {
      setSelectedAlertId('alt_payroll_03am');
    }
  };

  const handleStartDemo = () => {
    navigateToPortal('admin');
    setDemoActive(true);
    handleSelectDemoStep(0);
  };

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setBusyAction(key);
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleFeedback = async (alertId: string, decision: 'approve' | 'dismiss', note?: string) => {
    await runAction(`feedback:${alertId}`, async () => {
      const res = await sentinelApi.submitAlertFeedback(alertId, decision, note);
      setSnapshot(res.snapshot);
    });
  };

  const handleExecuteResponse = async (alertId: string, optionId: string) => {
    await runAction(`respond:${alertId}`, async () => {
      const res = await sentinelApi.executeResponse(alertId, optionId);
      setSnapshot(res.snapshot);
    });
  };

  const handleUndoResponse = async (alertId: string) => {
    await runAction(`undo:${alertId}`, async () => {
      const res = await sentinelApi.undoResponse(alertId);
      setSnapshot(res.snapshot);
    });
  };

  const handleResolveAlert = async (alertId: string, note?: string) => {
    await runAction(`resolve:${alertId}`, async () => {
      const res = await sentinelApi.resolveAlert(alertId, note);
      setSnapshot(res.snapshot);
    });
  };

  const handleInspectLogSpot = (vaultSequence: number, alertId: string) => {
    navigateToPortal('admin');
    setSelectedAlertId(alertId);
    setHighlightedVaultSeq(vaultSequence);
    setHighlightedAlertId(alertId);
    setActiveView('vault');
  };

  const handleTriggerTrap = async (trapId: string, sourceIp?: string) => {
    await runAction(`trigger:${trapId}`, async () => {
      const res = await sentinelApi.triggerHoneyTrap(trapId, sourceIp);
      setSnapshot(res.snapshot);
      if (res.alert?.id) {
        setSelectedAlertId(res.alert.id);
      }
    });
  };

  const handleCreateTrap = async (payload: {
    kind: 'honey_key' | 'honey_vendor';
    label: string;
    plantedLocation: string;
  }) => {
    await runAction('create-trap', async () => {
      const res = await sentinelApi.createHoneyTrap(payload);
      setSnapshot(res.snapshot);
    });
  };

  const handleUnblockSession = async (sourceIp: string) => {
    await runAction(`unblock:${sourceIp}`, async () => {
      const res = await sentinelApi.unblockAttackerSession(
        sourceIp,
        user?.displayName || user?.email || 'E. Vance (SecOps)',
      );
      setSnapshot(res.snapshot);
    });
  };

  const handleSimulateFingerprintEvent = async (
    fp: MachineFingerprint,
    mode: 'normal' | 'anomalous',
  ) => {
    await runAction(`sim:${fp.id}`, async () => {
      const now = new Date();
      if (mode === 'anomalous') {
        now.setUTCHours(3, 12, 0, 0);
      } else {
        const safeHour = Math.min(23, Math.max(0, fp.allowedHoursUtc[0] + 2));
        now.setUTCHours(safeHour, 15, 0, 0);
      }

      const res = await sentinelApi.ingestEvent({
        sourceSystem: fp.system,
        rawActor: fp.keyAlias,
        action: mode === 'anomalous' ? 'batch.export.unauthorized' : 'batch.status.poll',
        sourceIp: mode === 'anomalous' ? '185.220.101.77' : fp.knownIps[0],
        endpoint:
          mode === 'anomalous'
            ? '/v2/export/unusual-bulk-dump'
            : fp.typicalEndpoints[0] ?? '/v1/status',
        volumeCount:
          mode === 'anomalous'
            ? Math.max(180, fp.normalVolumeMean * 4)
            : Math.max(10, fp.normalVolumeMean),
        clockSkewMs: mode === 'anomalous' ? 2800 : 120,
        rawTimestamp: now.toISOString(),
        rawPayload:
          mode === 'anomalous'
            ? `Bulk export initiated by ${fp.keyAlias} contact ops-alert@harborfinch.co.uk`
            : `Routine scheduled health check from ${fp.keyAlias}`,
      });
      setSnapshot(res.snapshot);
    });
  };

  const handleResolveHold = async (
    holdId: string,
    decision: 'released_verified' | 'blocked_fraud',
  ) => {
    await runAction(`hold:${holdId}`, async () => {
      const res = await sentinelApi.resolvePaymentHold(holdId, decision);
      setSnapshot(res.snapshot);
    });
  };

  const handleScanTicket = async (payload: { ticketId: string; ticketText: string }) => {
    setBusyAction('scan');
    setActionError(null);
    try {
      const res = await sentinelApi.scanTicket(payload);
      setSnapshot(res.snapshot);
      return {
        ticketId: res.ticketId,
        redactedText: res.redactedText,
        findings: res.findings,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed';
      setActionError(msg);
      throw err;
    } finally {
      setBusyAction(null);
    }
  };

  const handleIngestEvent = async (payload: {
    sourceSystem: string;
    rawActor: string;
    action: string;
    sourceIp: string;
    endpoint: string;
    volumeCount: number;
    clockSkewMs: number;
    rawPayload: string;
  }) => {
    await runAction('ingest', async () => {
      const res = await sentinelApi.ingestEvent(payload);
      setSnapshot(res.snapshot);
    });
  };

  const handleAttackerAction = async (payload: {
    actionType:
      | 'mutate_api_key'
      | 'create_anomaly'
      | 'access_file'
      | 'touch_honey_trap'
      | 'alter_vendor_bank'
      | 'inject_ticket_secret';
    attackerAlias?: string;
    sourceIp?: string;
    targetKeyAlias?: string;
    mutationLabel?: string;
    hourUtc?: number;
    volumeCount?: number;
    endpoint?: string;
    fileId?: string;
    trapId?: string;
    vendorId?: string;
    customPayload?: string;
  }) => {
    setBusyAction(`attacker:${payload.actionType}`);
    setActionError(null);
    try {
      const res = await sentinelApi.runAttackerAction(payload);
      setSnapshot(res.snapshot);
      return {
        terminalOutput: res.terminalOutput,
        vaultSequence: res.record.vaultSequence,
        alertId: res.record.alertId,
        trapped: res.trapped,
        blocked: res.blocked,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Attacker action failed';
      setActionError(msg);
      throw err;
    } finally {
      setBusyAction(null);
    }
  };

  const handleUpdateNotificationPrefs = async (patch: {
    browserPushEnabled?: boolean;
    soundChimeEnabled?: boolean;
    minPushSeverity?: Severity;
  }) => {
    await runAction('prefs', async () => {
      const res = await sentinelApi.updateNotificationPrefs(patch);
      setSnapshot(res.snapshot);
    });
  };

  const handleAddWebhook = async (payload: {
    name: string;
    provider: WebhookEndpoint['provider'];
    url: string;
    minSeverity: Severity;
  }) => {
    await runAction('add-wh', async () => {
      const res = await sentinelApi.addWebhook(payload);
      setSnapshot(res.snapshot);
    });
  };

  const handleToggleWebhook = async (id: string, enabled: boolean) => {
    await runAction(`toggle-wh:${id}`, async () => {
      const res = await sentinelApi.updateWebhook(id, { enabled });
      setSnapshot(res.snapshot);
    });
  };

  const handleDeleteWebhook = async (id: string) => {
    await runAction(`del-wh:${id}`, async () => {
      const res = await sentinelApi.deleteWebhook(id);
      setSnapshot(res.snapshot);
    });
  };

  const handleTestWebhook = async (id: string) => {
    setBusyAction(`test-wh:${id}`);
    setActionError(null);
    try {
      const res = await sentinelApi.testWebhook(id);
      setSnapshot(res.snapshot);
      return res.delivery;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Webhook test failed';
      setActionError(msg);
      throw err;
    } finally {
      setBusyAction(null);
    }
  };

  const handleMarkNotificationsRead = async () => {
    const res = await sentinelApi.markNotificationsRead();
    setSnapshot(res.snapshot);
  };

  const handleResetDemo = async () => {
    await runAction('reset', async () => {
      const res = await sentinelApi.resetDemo();
      setSnapshot(res.snapshot);
      setSelectedAlertId('alt_payroll_03am');
      setSelectedFpId('fp_payroll');
      setHighlightedVaultSeq(null);
      setHighlightedAlertId(null);
    });
  };

  const executeBreachDrillStage = async (
    drillId: string,
    scenarioId: BreachDrillScenario['id'],
    stepIndex: number,
  ) => {
    const scenario = getBreachDrillScenario(scenarioId);
    if (!scenario || stepIndex >= scenario.stages.length) return;

    setFiringDrillStep(stepIndex);
    try {
      const res = await sentinelApi.runBreachDrillStep({
        drillId,
        scenarioId,
        stepIndex,
      });
      setSnapshot(res.snapshot);
      if (res.stepResult.alertId) {
        setSelectedAlertId(res.stepResult.alertId);
      }
      setActiveDrill((prev) => {
        if (!prev || prev.drillId !== drillId) return prev;
        const alreadyRecorded = prev.results.some((r) => r.stepIndex === stepIndex);
        const nextResults = alreadyRecorded ? prev.results : [...prev.results, res.stepResult];
        const nextIndex = stepIndex + 1;
        const finished = nextIndex >= scenario.stages.length;
        return {
          ...prev,
          results: nextResults,
          nextStepIndex: nextIndex,
          status: finished ? 'completed' : prev.status,
          error: null,
        };
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Breach drill stage failed';
      setActiveDrill((prev) =>
        prev && prev.drillId === drillId
          ? { ...prev, status: 'paused', error: msg }
          : prev,
      );
    } finally {
      setFiringDrillStep(null);
    }
  };

  const handleLaunchBreachDrill = (
    scenarioId: BreachDrillScenario['id'],
    cadence: BreachDrillCadence,
  ) => {
    const drillId = `drill_${Date.now()}`;
    setDrillModalOpen(false);
    navigateToPortal('admin');
    setActiveView('overview');
    const startedAt = new Date().toISOString();
    setActiveDrill({
      drillId,
      scenarioId,
      cadence,
      status: 'running',
      startedAt,
      nextStepIndex: 0,
      results: [],
      error: null,
    });
    if (cadence === 'manual') {
      void executeBreachDrillStage(drillId, scenarioId, 0);
    }
  };

  const handleResetDrillSandbox = async () => {
    setActiveDrill(null);
    setFiringDrillStep(null);
    await handleResetDemo();
  };

  const jumpToAlert = (alertId?: string) => {
    navigateToPortal('admin');
    if (alertId) setSelectedAlertId(alertId);
    setActiveView('overview');
  };

  // Public Landing Page — always accessible for portal selection without forcing immediate popup
  if (entryRoute === 'landing') {
    return (
      <>
        <StartLoginView
          copy={copy}
          lang={lang}
          onChangeLang={handleChangeLang}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          region={snapshot?.controlPlane?.region}
          authenticatedEmail={user?.email ?? null}
          authBusy={authBusy}
          authError={authError}
          initialPortalChoice={portal}
          onClearAuthError={clearAuthError}
          onCancelAuth={cancelAuth}
          onSelectPortal={handleSelectPortalFromLanding}
          onSignOut={handleSignOut}
          connectedAttackers={connectedAttackers}
          onOpenAccessibility={() => setA11yModalOpen(true)}
        />
        <AccessibilityModal
          open={a11yModalOpen}
          prefs={a11yPrefs}
          onChange={setA11yPrefs}
          onClose={() => setA11yModalOpen(false)}
        />
      </>
    );
  }

  const operatorDisplayName =
    operatorProfile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Admin';
  const portalLabel = activeNav.breadcrumb;

  const lazyViewFallback = (
    <div
      role="status"
      aria-live="polite"
      className="window-suede rounded-lg p-8 space-y-4"
    >
      <div className="h-5 w-56 bg-[var(--sentinel-inset)] rounded animate-pulse" />
      <div className="h-4 w-full max-w-lg bg-[var(--sentinel-nude)] rounded animate-pulse" />
      <span className="sr-only">Loading view...</span>
    </div>
  );

  // Protected Entry Point: enforces Firebase Authentication before rendering Admin OR Demo Attacker portals
  return (
    <>
      <ProtectedPortalWrapper
        requestedPortal={portal}
        fallback={({ requestedPortal, authRequiredNotice }) => (
          <StartLoginView
            copy={copy}
            lang={lang}
            onChangeLang={handleChangeLang}
            theme={theme}
            onToggleTheme={handleToggleTheme}
            region={snapshot?.controlPlane?.region}
            authenticatedEmail={user?.email ?? null}
            authBusy={authBusy}
            authError={authError}
            authRequiredNotice={authRequiredNotice}
            initialPortalChoice={requestedPortal}
            onClearAuthError={clearAuthError}
            onCancelAuth={cancelAuth}
            onSelectPortal={handleSelectPortalFromLanding}
            onSignOut={handleSignOut}
            connectedAttackers={connectedAttackers}
            onOpenAccessibility={() => setA11yModalOpen(true)}
          />
        )}
      >
      {portal === 'attacker' ? (
        loading ? (
          <div className="min-h-screen bg-[#150E0B] text-[#FAF1E8] flex items-center justify-center p-6">
            <div className="text-center space-y-2">
              <Terminal className="w-7 h-7 text-[#F87171] mx-auto animate-pulse" />
              <p className="text-xs font-mono text-[#D1BCAB]">
                Connecting to Harbor &amp; Finch target workspace...
              </p>
            </div>
          </div>
        ) : error || !snapshot ? (
          <div className="min-h-screen bg-[#150E0B] text-[#FAF1E8] flex items-center justify-center p-6">
            <div className="max-w-sm w-full bg-[#241A15] border border-[#543F34] rounded-lg p-6 text-center space-y-3">
              <p className="text-sm font-semibold text-[#F87171]">
                {error || 'Unable to connect to Harbor & Finch target.'}
              </p>
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="px-3.5 py-2 text-xs font-semibold bg-[#DC2626] text-white rounded-md cursor-pointer"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={openLandingPage}
                  className="px-3.5 py-2 text-xs font-semibold bg-[#382922] text-[#FAF1E8] rounded-md cursor-pointer"
                >
                  Portal Selection
                </button>
              </div>
            </div>
          </div>
        ) : (
          <AppErrorBoundary sectionLabel="Demo Attacker Portal">
            <Suspense fallback={lazyViewFallback}>
              <AttackerPortalView
                snapshot={snapshot}
                wsStatus={wsStatus}
                onExecuteAction={handleAttackerAction}
                onExitToAdmin={() => navigateToPortal('admin')}
                busyAction={busyAction}
              />
            </Suspense>
          </AppErrorBoundary>
        )
      ) : (
        <div className="min-h-screen flex bg-[var(--sentinel-bg)] text-[var(--sentinel-ink)]">
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <div className="sr-only" aria-live="polite" role="status">
            Active section: {portalLabel}
          </div>
          {/* Desktop Sidebar — Unified Admin Management Portal */}
          <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-[var(--sentinel-suede)] border-r border-[var(--sentinel-border)]">
            <div className="h-14 px-4 flex items-center justify-between gap-2 border-b border-[var(--sentinel-border-soft)]">
              <button
                type="button"
                onClick={openLandingPage}
                className="min-w-0 inline-flex items-center hover:opacity-85 transition-opacity cursor-pointer"
                title="Return to Portal Selection"
              >
                <BrandMark size="sm" />
              </button>
              <span className="text-[11px] font-mono text-[var(--sentinel-ink-muted)] truncate">
                {snapshot?.controlPlane?.region ?? 'ap-southeast-2'}
              </span>
            </div>

            {/* 2-Portal Switcher: Unified Admin Portal / Demo Attacker */}
            <div className="p-3 border-b border-[var(--sentinel-border-soft)] bg-[var(--sentinel-nude)]/70 space-y-2">
              <p className="px-1 text-[11px] font-semibold text-[var(--sentinel-ink-muted)]">
                {copy.activePortal}
              </p>
              <div
                className="grid grid-cols-2 gap-1 p-1 bg-[var(--sentinel-inset)] rounded-md"
                role="tablist"
                aria-label="Switch Portal"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={portal === 'admin'}
                  onClick={() => navigateToPortal('admin')}
                  className="px-2 py-1.5 text-[11px] font-semibold rounded transition-colors whitespace-nowrap cursor-pointer bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] shadow-xs"
                >
                  {copy.portalAdmin}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={false}
                  onClick={() => navigateToPortal('attacker')}
                  className="px-2 py-1.5 text-[11px] font-semibold rounded transition-colors whitespace-nowrap cursor-pointer text-[var(--sentinel-crit)] hover:bg-[var(--sentinel-crit-bg)]"
                >
                  {copy.portalAttacker}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setPhoneModalOpen(true)}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] hover:border-[var(--sentinel-crit)] transition-colors cursor-pointer"
              >
                <span className="inline-flex items-center gap-1.5 truncate">
                  <Smartphone className="w-3.5 h-3.5 text-[var(--sentinel-crit)] shrink-0" />
                  <span className="truncate">{copy.attackerLinkBtn}</span>
                </span>
                {connectedAttackers > 0 && (
                  <span className="font-mono text-[10px] font-bold text-[var(--sentinel-crit)] shrink-0">
                    {connectedAttackers} live
                  </span>
                )}
              </button>
            </div>

            <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Sentinel Admin Management sections">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setActiveView(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-[var(--sentinel-accent-soft)] text-[var(--sentinel-accent-soft-ink)] font-semibold'
                        : 'text-[var(--sentinel-ink-secondary)] hover:bg-[var(--sentinel-nude)]/80 hover:text-[var(--sentinel-ink)] font-medium'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Authenticated Firebase Account, PWA Install, Portal Hub & Sign-Out */}
            <div className="p-4 border-t border-[var(--sentinel-border-soft)] text-xs space-y-2.5 text-[var(--sentinel-ink-secondary)]">
              <PWAInstallButton variant="sidebar" />
              <div className="space-y-0.5 min-w-0">
                <p className="font-semibold text-[var(--sentinel-ink)] truncate">
                  {operatorDisplayName}
                </p>
                {user?.email && (
                  <p className="text-[11px] text-[var(--sentinel-ink-muted)] truncate">
                    {user.email}
                  </p>
                )}
                <p className="text-[11px] text-[var(--sentinel-ink-muted)]">
                  Stream:{' '}
                  <span
                    className={
                      wsStatus === 'connected'
                        ? 'text-[var(--sentinel-accent)] font-semibold'
                        : 'text-[var(--sentinel-high)] font-semibold'
                    }
                  >
                    {wsStatus}
                  </span>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={openLandingPage}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] hover:border-[var(--sentinel-accent)] transition-colors cursor-pointer"
                >
                  <Home className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Landing</span>
                </button>
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => void handleSignOut()}
                  data-testid="admin-signout-btn"
                  className="flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] text-[var(--sentinel-ink)] hover:border-[var(--sentinel-crit)] hover:text-[var(--sentinel-crit)] transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </aside>

          {/* Mobile Navigation Drawer */}
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-50 lg:hidden flex bg-black/50">
              <aside className="w-64 bg-[var(--sentinel-suede)] h-full border-r border-[var(--sentinel-border)] flex flex-col">
                <div className="h-14 px-4 flex items-center justify-between gap-2 border-b border-[var(--sentinel-border-soft)] bg-[var(--sentinel-nude)]">
                  <BrandMark size="sm" />
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Close navigation menu"
                    className="p-2 text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-ink)] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3 border-b border-[var(--sentinel-border-soft)] bg-[var(--sentinel-nude)]/60 space-y-2">
                  <div className="grid grid-cols-2 gap-1 p-1 bg-[var(--sentinel-inset)] rounded-md">
                    <button
                      type="button"
                      onClick={() => {
                        navigateToPortal('admin');
                        setMobileMenuOpen(false);
                      }}
                      className="px-2 py-1.5 text-[11px] font-semibold rounded cursor-pointer bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)]"
                    >
                      {copy.portalAdmin}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigateToPortal('attacker');
                        setMobileMenuOpen(false);
                      }}
                      className="px-2 py-1.5 text-[11px] font-semibold rounded cursor-pointer text-[var(--sentinel-crit)]"
                    >
                      {copy.portalAttacker}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setPhoneModalOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] cursor-pointer"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-[var(--sentinel-crit)]" />
                    <span>{copy.attackerLinkBtn}</span>
                  </button>
                </div>

                <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Mobile sections">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const active = activeView === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          navigateToPortal('admin');
                          setActiveView(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-md whitespace-nowrap cursor-pointer ${
                          active
                            ? 'bg-[var(--sentinel-accent-soft)] text-[var(--sentinel-accent-soft-ink)] font-semibold'
                            : 'text-[var(--sentinel-ink-secondary)] hover:bg-[var(--sentinel-nude)] font-medium'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </nav>

                <div className="p-3 border-t border-[var(--sentinel-border-soft)] space-y-2">
                  <PWAInstallButton variant="sidebar" />
                  <p className="text-xs font-semibold text-[var(--sentinel-ink)] truncate">
                    {operatorDisplayName}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        openLandingPage();
                      }}
                      className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] cursor-pointer"
                    >
                      <Home className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Landing</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] text-[var(--sentinel-ink)] cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          )}

          {/* Main Content Shell */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Top Bar — Soft Nude (Light) / Warm Umber Nude (Dark) */}
            <header className="h-14 bg-[var(--sentinel-nude)] border-b border-[var(--sentinel-border)] px-3 lg:px-6 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  aria-label="Open navigation menu"
                  className="lg:hidden p-2 -ml-1 text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-ink)] cursor-pointer"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2 text-sm truncate">
                  <span className="text-[var(--sentinel-ink-muted)] hidden xl:inline whitespace-nowrap">
                    {snapshot?.controlPlane?.tenantName ?? 'Harbor & Finch LLP'}
                  </span>
                  <span className="text-[var(--sentinel-border)] hidden xl:inline" aria-hidden="true">
                    /
                  </span>
                  <span className="font-title text-base font-semibold text-[var(--sentinel-ink)] truncate">{portalLabel}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {/* Language Toggle */}
                <label
                  className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] shrink-0"
                  aria-label="Select language"
                >
                  <Globe className="w-3.5 h-3.5 text-[var(--sentinel-ink-muted)] shrink-0" />
                  <select
                    value={lang}
                    onChange={(e) => handleChangeLang(e.target.value as LanguageCode)}
                    data-testid="language-toggle"
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

                {/* Accessibility Preferences Trigger */}
                <button
                  type="button"
                  onClick={() => setA11yModalOpen(true)}
                  data-testid="topbar-a11y-btn"
                  aria-label="Open accessibility and display preferences"
                  title="Accessibility & Display"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    a11yPrefs.highContrast || a11yPrefs.textScale !== 'md' || a11yPrefs.reduceMotion
                      ? 'border-[var(--sentinel-accent)] bg-[var(--sentinel-accent-soft)] text-[var(--sentinel-accent-soft-ink)]'
                      : 'border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] hover:border-[var(--sentinel-accent)]'
                  }`}
                >
                  <Accessibility className="w-3.5 h-3.5 text-[var(--sentinel-accent)]" aria-hidden="true" />
                  <span className="hidden xl:inline">Accessibility</span>
                </button>

                {/* Dark / Light Mode Toggle */}
                <button
                  type="button"
                  onClick={handleToggleTheme}
                  data-testid="theme-toggle"
                  aria-label={theme === 'light' ? copy.darkMode : copy.lightMode}
                  title={theme === 'light' ? copy.darkMode : copy.lightMode}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] hover:border-[var(--sentinel-accent)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {theme === 'light' ? (
                    <Moon className="w-3.5 h-3.5 text-[var(--sentinel-ink-secondary)]" aria-hidden="true" />
                  ) : (
                    <Sun className="w-3.5 h-3.5 text-[#FBBF24]" aria-hidden="true" />
                  )}
                  <span className="hidden md:inline">
                    {theme === 'light' ? copy.darkMode : copy.lightMode}
                  </span>
                </button>

                {/* Breach Drill Trigger */}
                <button
                  type="button"
                  onClick={() => setDrillModalOpen(true)}
                  data-testid="topbar-breach-drill-btn"
                  aria-label="Run Breach Drill sandbox"
                  className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeDrill && (activeDrill.status === 'running' || activeDrill.status === 'paused')
                      ? 'bg-[var(--sentinel-high-bg)] text-[var(--sentinel-high-ink)] border-[var(--sentinel-high-border)]'
                      : 'bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] border-[var(--sentinel-border)] hover:border-[var(--sentinel-high)]'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-[var(--sentinel-high)] shrink-0" />
                  <span className="hidden md:inline">Breach Drill</span>
                </button>

                {/* Security Analyst Chatbot Drawer Trigger */}
                <button
                  type="button"
                  onClick={() => setChatOpen(true)}
                  data-testid="open-security-chat-btn"
                  aria-label="Open Sentinel Security Analyst chat"
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-accent)]/40 bg-[var(--sentinel-accent-soft)] text-[var(--sentinel-accent-soft-ink)] hover:border-[var(--sentinel-accent)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Analyst AI</span>
                </button>

                {/* Push Alerts Drawer Trigger */}
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  aria-label={`Open push notifications (${unreadCount} unread)`}
                  className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    unreadCount > 0
                      ? 'bg-[var(--sentinel-crit-bg)] text-[var(--sentinel-crit)] border border-[var(--sentinel-crit-border)]'
                      : 'bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] border border-[var(--sentinel-border)]'
                  }`}
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{copy.pushAlerts}</span>
                  <span className="font-mono tabular-nums font-bold" data-testid="unread-push-count">
                    ({unreadCount})
                  </span>
                </button>

                {/* 3-Minute Demo Toggle */}
                <button
                  type="button"
                  onClick={() => (demoActive ? setDemoActive(false) : handleStartDemo())}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    demoActive
                      ? 'bg-[var(--sentinel-ink)] text-[var(--sentinel-suede)]'
                      : 'bg-[var(--sentinel-accent)] text-white hover:bg-[var(--sentinel-accent-hover)]'
                  }`}
                >
                  <Play className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">
                    {demoActive ? copy.demoExit : copy.demoStart}
                  </span>
                </button>
              </div>
            </header>

            {/* Live WebSocket Push Toast */}
            {liveToast && (
              <div
                role="status"
                aria-live="assertive"
                data-testid="live-push-toast"
                className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-5 sm:bottom-5 z-40 sm:max-w-md bg-[#231914] text-white border-2 border-[#DC2626] rounded-lg p-4 shadow-xl"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono font-bold">
                      <span className="text-[#FF7A6B]">
                        LIVE PUSH · {severityLabel(liveToast.severity).toUpperCase()}
                      </span>
                      {liveToast.webhookDispatched && (
                        <span className="text-[#5EEAD4]">· WEBHOOK SENT</span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-white">{liveToast.title}</p>
                    <p className="text-xs text-[#E7D4C6] leading-relaxed">{liveToast.message}</p>
                    <div className="pt-1 flex flex-wrap items-center gap-3">
                      {liveToast.alertId && (
                        <button
                          type="button"
                          onClick={() => {
                            jumpToAlert(liveToast.alertId!);
                            dismissToast();
                          }}
                          className="text-xs font-semibold text-[#5EEAD4] hover:underline cursor-pointer"
                        >
                          Open Alert →
                        </button>
                      )}
                      {liveToast.vaultSequence && liveToast.alertId && (
                        <button
                          type="button"
                          onClick={() => {
                            handleInspectLogSpot(liveToast.vaultSequence!, liveToast.alertId!);
                            dismissToast();
                          }}
                          className="text-xs font-semibold text-[#FDE68A] hover:underline cursor-pointer"
                        >
                          Exact Log Spot (#{liveToast.vaultSequence}) →
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={dismissToast}
                    aria-label="Dismiss notification toast"
                    className="p-1 text-[#C7B3A3] hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Main Scrollable Viewport */}
            <main
              id="main-content"
              tabIndex={-1}
              className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto focus:outline-none"
            >
              {activeDrill && (() => {
                const scenario = getBreachDrillScenario(activeDrill.scenarioId);
                if (!scenario) return null;
                return (
                  <BreachDrillDock
                    drillId={activeDrill.drillId}
                    scenario={scenario}
                    cadence={activeDrill.cadence}
                    status={activeDrill.status}
                    startedAt={activeDrill.startedAt}
                    currentStepIndex={activeDrill.nextStepIndex}
                    firingStepIndex={firingDrillStep}
                    results={activeDrill.results}
                    error={activeDrill.error}
                    snapshot={snapshot}
                    completedSessions={completedDrillHistory}
                    onClearHistory={() => setCompletedDrillHistory(clearCompletedDrillHistory())}
                    onTogglePause={() =>
                      setActiveDrill((prev) =>
                        prev
                          ? {
                              ...prev,
                              status: prev.status === 'running' ? 'paused' : 'running',
                              error: null,
                            }
                          : prev,
                      )
                    }
                    onStepNow={() => {
                      if (firingDrillStep === null) {
                        void executeBreachDrillStage(
                          activeDrill.drillId,
                          activeDrill.scenarioId,
                          activeDrill.nextStepIndex,
                        );
                      }
                    }}
                    onAbort={() =>
                      setActiveDrill((prev) => (prev ? { ...prev, status: 'aborted' } : prev))
                    }
                    onResetSandbox={() => void handleResetDrillSandbox()}
                    onCloseDock={() => setActiveDrill(null)}
                    onOpenAlert={(alertId) => jumpToAlert(alertId)}
                    onInspectVault={(seq, alertId) => handleInspectLogSpot(seq, alertId)}
                    busyAction={busyAction}
                  />
                );
              })()}

              {demoActive && (
                <DemoPresenterDock
                  stepIndex={demoStepIndex}
                  onSelectStep={handleSelectDemoStep}
                  onTriggerHoneyDemo={() => handleTriggerTrap('ht_key_1', '194.26.135.88')}
                  onResetDemo={handleResetDemo}
                  onClose={() => setDemoActive(false)}
                  busyAction={busyAction}
                />
              )}

              {actionError && (
                <div className="mb-4 p-3.5 rounded-md alert-pop-critical flex items-center justify-between text-xs font-medium text-[var(--sentinel-crit-ink)]">
                  <span>{actionError}</span>
                  <button
                    type="button"
                    onClick={() => setActionError(null)}
                    className="font-bold underline cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {loading ? (
                <div className="window-suede rounded-lg p-8 space-y-4">
                  <div className="h-6 w-64 bg-[var(--sentinel-inset)] rounded animate-pulse" />
                  <div className="h-4 w-full max-w-xl bg-[var(--sentinel-nude)] rounded animate-pulse" />
                  <div className="grid grid-cols-4 gap-4 pt-4">
                    <div className="h-16 bg-[var(--sentinel-nude)] rounded animate-pulse" />
                    <div className="h-16 bg-[var(--sentinel-nude)] rounded animate-pulse" />
                    <div className="h-16 bg-[var(--sentinel-nude)] rounded animate-pulse" />
                    <div className="h-16 bg-[var(--sentinel-nude)] rounded animate-pulse" />
                  </div>
                </div>
              ) : error || !snapshot ? (
                <div className="window-suede rounded-lg p-8 text-center space-y-3">
                  <p className="text-sm font-semibold text-[var(--sentinel-crit)]">
                    {error || 'Unable to load Sentinel regional data plane.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[var(--sentinel-accent)] rounded-md hover:bg-[var(--sentinel-accent-hover)] cursor-pointer"
                  >
                    Retry Connection
                  </button>
                </div>
              ) : (
                <AppErrorBoundary key={activeView} sectionLabel={portalLabel}>
                  <Suspense fallback={lazyViewFallback}>
                    {activeView === 'overview' && (
                      <OverviewAlertsView
                        snapshot={snapshot}
                        copy={copy}
                        selectedAlertId={selectedAlertId}
                        onSelectAlert={setSelectedAlertId}
                        onFeedback={handleFeedback}
                        onExecuteResponse={handleExecuteResponse}
                        onUndoResponse={handleUndoResponse}
                        onResolveAlert={handleResolveAlert}
                        onUnblockSession={handleUnblockSession}
                        onInspectLogSpot={handleInspectLogSpot}
                        onOpenView={setActiveView}
                        onStartDemo={handleStartDemo}
                        onOpenPhoneAttackerModal={() => setPhoneModalOpen(true)}
                        onOpenBreachDrill={() => setDrillModalOpen(true)}
                        drillActive={Boolean(
                          activeDrill &&
                            (activeDrill.status === 'running' || activeDrill.status === 'paused'),
                        )}
                        onRefreshAlerts={refresh}
                        lastSyncedAt={lastSyncedAt}
                        busyAction={busyAction}
                      />
                    )}

                    {activeView === 'executive' && (
                      <ExecutivePortalView
                        snapshot={snapshot}
                        copy={copy}
                        onResolveHold={handleResolveHold}
                        onResolveAlert={(alertId) =>
                          handleResolveAlert(alertId, 'Resolved via Admin Executive & Board View')
                        }
                        onInspectLogSpot={handleInspectLogSpot}
                        onSwitchToSecOps={jumpToAlert}
                        busyAction={busyAction}
                      />
                    )}

                    {activeView === 'fingerprints' && (
                      <FingerprintsView
                        snapshot={snapshot}
                        selectedFpId={selectedFpId}
                        onSelectFp={setSelectedFpId}
                        onSimulateAnomaly={handleSimulateFingerprintEvent}
                        onJumpToAlert={jumpToAlert}
                        busyAction={busyAction}
                      />
                    )}

                    {activeView === 'honey_traps' && (
                      <HoneyTrapsView
                        snapshot={snapshot}
                        onTriggerTrap={handleTriggerTrap}
                        onCreateTrap={handleCreateTrap}
                        onUnblockSession={handleUnblockSession}
                        busyAction={busyAction}
                      />
                    )}

                    {activeView === 'drift_toolkit' && (
                      <DriftToolkitView
                        snapshot={snapshot}
                        onResolveHold={handleResolveHold}
                        onScanTicket={handleScanTicket}
                        busyAction={busyAction}
                      />
                    )}

                    {activeView === 'vault' && (
                      <VaultIngestView
                        snapshot={snapshot}
                        highlightedVaultSeq={highlightedVaultSeq}
                        highlightedAlertId={highlightedAlertId}
                        onClearHighlight={() => {
                          setHighlightedVaultSeq(null);
                          setHighlightedAlertId(null);
                        }}
                        onResolveAlert={handleResolveAlert}
                        onReturnToAlert={(alertId) => {
                          setSelectedAlertId(alertId);
                          setActiveView('overview');
                        }}
                        onIngestEvent={handleIngestEvent}
                        busyAction={busyAction}
                      />
                    )}

                    {activeView === 'webhooks' && (
                      <WebhooksNotificationsView
                        snapshot={snapshot}
                        wsStatus={wsStatus}
                        browserPushPermission={browserPushPermission}
                        onRequestBrowserPush={requestBrowserPush}
                        onUpdatePrefs={handleUpdateNotificationPrefs}
                        onAddWebhook={handleAddWebhook}
                        onToggleWebhook={handleToggleWebhook}
                        onDeleteWebhook={handleDeleteWebhook}
                        onTestWebhook={handleTestWebhook}
                        busyAction={busyAction}
                      />
                    )}

                    {activeView === 'ai_studio' && (
                      <AiStudioView
                        snapshot={snapshot}
                        onScanTranscript={handleScanTicket}
                      />
                    )}

                    {activeView === 'architecture' && (
                      <ArchitectureIntegrationView snapshot={snapshot} />
                    )}
                  </Suspense>
                </AppErrorBoundary>
              )}
            </main>
          </div>

          {/* Real-Time Push Notification Drawer */}
          <NotificationDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            notifications={snapshot?.notifications ?? []}
            wsStatus={wsStatus}
            browserPushPermission={browserPushPermission}
            onRequestBrowserPush={requestBrowserPush}
            onMarkAllRead={handleMarkNotificationsRead}
            onSelectAlert={jumpToAlert}
            onOpenWebhooks={() => {
              navigateToPortal('admin');
              setActiveView('webhooks');
            }}
          />

          {/* Gemini Multi-Turn Security Analyst Drawer */}
          <SecurityChatbotDrawer
            open={chatOpen}
            onClose={() => setChatOpen(false)}
            userUid={user?.uid ?? null}
            operatorName={operatorDisplayName}
            snapshot={snapshot}
          />

          {/* Controlled Sandbox Breach Drill Setup Modal */}
          <BreachDrillModal
            open={drillModalOpen}
            onClose={() => setDrillModalOpen(false)}
            onLaunch={handleLaunchBreachDrill}
            isRunning={activeDrill?.status === 'running'}
          />

          {/* Connect Another Phone as Demo Attacker Modal */}
          <PhoneAttackerModal
            open={phoneModalOpen}
            onClose={() => setPhoneModalOpen(false)}
            connectedAttackers={connectedAttackers}
            onSwitchHere={() => {
              setPhoneModalOpen(false);
              navigateToPortal('attacker');
            }}
          />
        </div>
      )}
      </ProtectedPortalWrapper>
      <AccessibilityModal
        open={a11yModalOpen}
        prefs={a11yPrefs}
        onChange={setA11yPrefs}
        onClose={() => setA11yModalOpen(false)}
      />
      <OfflineIndicator />
    </>
  );
}
