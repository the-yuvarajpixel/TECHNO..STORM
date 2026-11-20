export type LanguageCode = 'en' | 'es' | 'fr' | 'de';

export const LANGUAGE_OPTIONS: Array<{ code: LanguageCode; short: string; label: string }> = [
  { code: 'en', short: 'EN', label: 'English' },
  { code: 'es', short: 'ES', label: 'Español' },
  { code: 'fr', short: 'FR', label: 'Français' },
  { code: 'de', short: 'DE', label: 'Deutsch' },
];

export interface UiCopy {
  activePortal: string;
  portalAdmin: string;
  portalSecops: string;
  portalExecutive: string;
  portalAttacker: string;
  navOverview: string;
  navExecutive: string;
  navFingerprints: string;
  navHoneyTraps: string;
  navDriftToolkit: string;
  navVault: string;
  navWebhooks: string;
  navArchitecture: string;
  pushAlerts: string;
  demoStart: string;
  demoExit: string;
  attackerLinkBtn: string;
  darkMode: string;
  lightMode: string;
  overviewHeadline: string;
  overviewSubtitle: string;
  metricOpenAlerts: string;
  metricControlDrift: string;
  metricSecretsMasked: string;
  metricLogVault: string;
  alertQueueTitle: string;
  filterAll: string;
  filterOpen: string;
  filterContained: string;
  filterResolved: string;
  inspectLogSpot: string;
  resolveBtn: string;
  resolvedLabel: string;
  approveNarrower: string;
  executeContainment: string;
  undoAction: string;
  blastRadiusTitle: string;
  explainWhyTitle: string;
  teachBaselineTitle: string;
  confirmThreat: string;
  dismissLearn: string;
  execTitle: string;
  execEscalations: string;
  execPaymentTitle: string;
  execLegalTitle: string;
  attackerPortalTitle: string;
  attackerConnected: string;
}

const DICTIONARY: Record<LanguageCode, UiCopy> = {
  en: {
    activePortal: 'Active Portal',
    portalAdmin: 'Admin Portal',
    portalSecops: 'SecOps',
    portalExecutive: 'Executive',
    portalAttacker: 'Attacker',
    navOverview: 'Alerts & Response',
    navExecutive: 'Executive & Board',
    navFingerprints: 'Fingerprints',
    navHoneyTraps: 'Honey Traps',
    navDriftToolkit: 'Control Drift & Toolkit',
    navVault: 'Log Vault & Ingest',
    navWebhooks: 'Webhooks & Push',
    navArchitecture: 'Architecture & Setup',
    pushAlerts: 'Push Alerts',
    demoStart: '3-Min Demo',
    demoExit: 'Exit Demo',
    attackerLinkBtn: 'Phone Attacker',
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',
    overviewHeadline: 'Sentinel: built so a breach of it exposes as little as possible.',
    overviewSubtitle:
      'Every secret and PII field is masked at the customer edge before regional ingestion. Spot anomalies, jump to the exact log line, contain safely, or resolve in one click.',
    metricOpenAlerts: 'Open Alerts',
    metricControlDrift: 'Control Drift',
    metricSecretsMasked: 'Masked at Edge',
    metricLogVault: 'Hash-Chained Vault',
    alertQueueTitle: 'Explain-Why Alert Queue',
    filterAll: 'All',
    filterOpen: 'Open',
    filterContained: 'Contained',
    filterResolved: 'Resolved',
    inspectLogSpot: 'Exact Spot in Logs',
    resolveBtn: 'Resolve',
    resolvedLabel: 'Resolved',
    approveNarrower: 'Approve Narrower Action',
    executeContainment: 'Execute Containment',
    undoAction: 'Undo Action',
    blastRadiusTitle: 'Safe Response — Blast-Radius Preview',
    explainWhyTitle: 'Explain-Why Evidence (Baseline vs Observed)',
    teachBaselineTitle: 'Teach Baseline (Approve / Dismiss)',
    confirmThreat: 'Confirm Threat',
    dismissLearn: 'Dismiss & Learn',
    execTitle: 'Do our live systems match our signed policies and risk register?',
    execEscalations: 'Active Critical & High Escalations',
    execPaymentTitle: 'CFO Dual-Control Payment Sign-Off',
    execLegalTitle: 'General Counsel — 72h Clock & Evidence',
    attackerPortalTitle: 'Demo Attacker Terminal (Harbor & Finch)',
    attackerConnected: 'phone attacker connected',
  },
  es: {
    activePortal: 'Portal Activo',
    portalAdmin: 'Portal Admin',
    portalSecops: 'SecOps',
    portalExecutive: 'Ejecutivo',
    portalAttacker: 'Atacante',
    navOverview: 'Alertas y Respuesta',
    navExecutive: 'Ejecutivo y Junta',
    navFingerprints: 'Huellas API',
    navHoneyTraps: 'Trampas Señuelo',
    navDriftToolkit: 'Deriva y Herramientas',
    navVault: 'Bóveda de Logs',
    navWebhooks: 'Webhooks y Push',
    navArchitecture: 'Arquitectura',
    pushAlerts: 'Alertas Push',
    demoStart: 'Demo 3 Min',
    demoExit: 'Salir Demo',
    attackerLinkBtn: 'Atacante Móvil',
    darkMode: 'Modo Oscuro',
    lightMode: 'Modo Claro',
    overviewHeadline: 'Sentinel: diseñado para exponer lo mínimo ante cualquier brecha.',
    overviewSubtitle:
      'Cada secreto y dato personal se enmascara en el borde del cliente antes de llegar a la región. Inspecciona la línea exacta del log, contén con seguridad o resuelve en un clic.',
    metricOpenAlerts: 'Alertas Abiertas',
    metricControlDrift: 'Deriva de Control',
    metricSecretsMasked: 'Enmascarados',
    metricLogVault: 'Bóveda SHA-256',
    alertQueueTitle: 'Cola de Alertas Explicables',
    filterAll: 'Todas',
    filterOpen: 'Abiertas',
    filterContained: 'Contenidas',
    filterResolved: 'Resueltas',
    inspectLogSpot: 'Ver Punto Exacto en Logs',
    resolveBtn: 'Resolver',
    resolvedLabel: 'Resuelta',
    approveNarrower: 'Aprobar Acción Acotada',
    executeContainment: 'Ejecutar Contención',
    undoAction: 'Deshacer Acción',
    blastRadiusTitle: 'Respuesta Segura — Vista de Impacto',
    explainWhyTitle: 'Evidencia (Línea Base vs Observado)',
    teachBaselineTitle: 'Entrenar Línea Base (Aprobar / Descartar)',
    confirmThreat: 'Confirmar Amenaza',
    dismissLearn: 'Descartar y Aprender',
    execTitle: '¿Coinciden nuestros sistemas en vivo con las políticas firmadas?',
    execEscalations: 'Escalaciones Críticas y Altas Activas',
    execPaymentTitle: 'Aprobación Dual de Pagos (CFO)',
    execLegalTitle: 'Legal — Reloj 72h y Evidencia',
    attackerPortalTitle: 'Terminal de Atacante Demo (Harbor & Finch)',
    attackerConnected: 'atacante móvil conectado',
  },
  fr: {
    activePortal: 'Portail Actif',
    portalAdmin: 'Portail Admin',
    portalSecops: 'SecOps',
    portalExecutive: 'Direction',
    portalAttacker: 'Attaquant',
    navOverview: 'Alertes & Réponse',
    navExecutive: 'Direction & Audit',
    navFingerprints: 'Empreintes API',
    navHoneyTraps: 'Pièges Leurres',
    navDriftToolkit: 'Dérive & Outils',
    navVault: 'Coffre de Journaux',
    navWebhooks: 'Webhooks & Push',
    navArchitecture: 'Architecture',
    pushAlerts: 'Alertes Push',
    demoStart: 'Démo 3 Min',
    demoExit: 'Quitter Démo',
    attackerLinkBtn: 'Mobile Attaquant',
    darkMode: 'Mode Sombre',
    lightMode: 'Mode Clair',
    overviewHeadline: 'Sentinel : conçu pour n’exposer presque rien en cas de compromission.',
    overviewSubtitle:
      'Chaque secret et donnée personnelle est masqué en périphérie client avant l’ingestion régionale. Localisez la ligne exacte du journal, isolez sans risque ou résolvez en un clic.',
    metricOpenAlerts: 'Alertes Ouvertes',
    metricControlDrift: 'Dérive Contrôle',
    metricSecretsMasked: 'Masqués en Bordure',
    metricLogVault: 'Coffre SHA-256',
    alertQueueTitle: 'File d’Alertes Explicables',
    filterAll: 'Toutes',
    filterOpen: 'Ouvertes',
    filterContained: 'Contenues',
    filterResolved: 'Résolues',
    inspectLogSpot: 'Point Exact dans les Logs',
    resolveBtn: 'Résoudre',
    resolvedLabel: 'Résolue',
    approveNarrower: 'Approuver Action Ciblée',
    executeContainment: 'Exécuter Confinement',
    undoAction: 'Annuler l’Action',
    blastRadiusTitle: 'Réponse Sûre — Aperçu de l’Impact',
    explainWhyTitle: 'Preuves (Normal vs Observé)',
    teachBaselineTitle: 'Apprentissage (Confirmer / Ignorer)',
    confirmThreat: 'Confirmer Menace',
    dismissLearn: 'Ignorer & Apprendre',
    execTitle: 'Nos systèmes réels respectent-ils nos politiques signées ?',
    execEscalations: 'Escalades Critiques et Élevées Actives',
    execPaymentTitle: 'Validation Paiements Double Contrôle (DAF)',
    execLegalTitle: 'Juridique — Horloge 72h & Preuves',
    attackerPortalTitle: 'Terminal Attaquant Démo (Harbor & Finch)',
    attackerConnected: 'attaquant mobile connecté',
  },
  de: {
    activePortal: 'Aktives Portal',
    portalAdmin: 'Admin-Portal',
    portalSecops: 'SecOps',
    portalExecutive: 'Vorstand',
    portalAttacker: 'Angreifer',
    navOverview: 'Alarme & Reaktion',
    navExecutive: 'Vorstand & Audit',
    navFingerprints: 'API-Profile',
    navHoneyTraps: 'Köder-Fallen',
    navDriftToolkit: 'Kontroll-Drift & Tools',
    navVault: 'Log-Tresor',
    navWebhooks: 'Webhooks & Push',
    navArchitecture: 'Architektur',
    pushAlerts: 'Push-Alarme',
    demoStart: '3-Min Demo',
    demoExit: 'Demo beenden',
    attackerLinkBtn: 'Handy-Angreifer',
    darkMode: 'Dunkelmodus',
    lightMode: 'Hellmodus',
    overviewHeadline: 'Sentinel: gebaut, damit ein Einbruch so wenig wie möglich preisgibt.',
    overviewSubtitle:
      'Alle Geheimnisse und personenbezogenen Daten werden am Kunden-Edge maskiert. Springen Sie zur exakten Log-Stelle, dämmen Sie sicher ein oder lösen Sie mit einem Klick.',
    metricOpenAlerts: 'Offene Alarme',
    metricControlDrift: 'Kontroll-Drift',
    metricSecretsMasked: 'Am Edge maskiert',
    metricLogVault: 'SHA-256 Tresor',
    alertQueueTitle: 'Erklärbare Alarm-Warteschlange',
    filterAll: 'Alle',
    filterOpen: 'Offen',
    filterContained: 'Eingedämmt',
    filterResolved: 'Gelöst',
    inspectLogSpot: 'Exakte Log-Stelle',
    resolveBtn: 'Lösen',
    resolvedLabel: 'Gelöst',
    approveNarrower: 'Gezielte Maßnahme',
    executeContainment: 'Eindämmung starten',
    undoAction: 'Rückgängig',
    blastRadiusTitle: 'Sichere Reaktion — Wirkungsbereich',
    explainWhyTitle: 'Belege (Normalprofil vs. Beobachtet)',
    teachBaselineTitle: 'Baseline trainieren (Bestätigen / Verwerfen)',
    confirmThreat: 'Bedrohung bestätigen',
    dismissLearn: 'Verwerfen & Lernen',
    execTitle: 'Stimmen unsere Live-Systeme mit den unterzeichneten Richtlinien überein?',
    execEscalations: 'Aktive Kritische & Hohe Eskalationen',
    execPaymentTitle: 'CFO Vier-Augen-Zahlungsfreigabe',
    execLegalTitle: 'Rechtsabteilung — 72h-Frist & Nachweise',
    attackerPortalTitle: 'Demo-Angreifer-Terminal (Harbor & Finch)',
    attackerConnected: 'Handy-Angreifer verbunden',
  },
};

export function getUiCopy(lang: LanguageCode): UiCopy {
  return DICTIONARY[lang] ?? DICTIONARY.en;
}
