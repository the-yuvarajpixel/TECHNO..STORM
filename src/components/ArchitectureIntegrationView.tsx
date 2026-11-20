import type { SystemSnapshot } from '../core/types';

interface ArchitectureIntegrationViewProps {
  snapshot: SystemSnapshot;
}

export function ArchitectureIntegrationView({ snapshot }: ArchitectureIntegrationViewProps) {
  const { controlPlane } = snapshot;

  return (
    <div className="space-y-6">
      <section className="window-suede rounded-lg p-6 space-y-5">
        <div className="max-w-3xl">
          <h1 className="text-xl font-bold text-[var(--sentinel-ink)]">
            Minimal-Exposure Architecture &amp; Control-Plane Split
          </h1>
          <p className="mt-1 text-sm text-[var(--sentinel-ink-secondary)] leading-relaxed">
            Partitioned into three trust boundaries so a breach of Sentinel’s control plane exposes zero customer logs, zero raw secrets, and zero write credentials.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-7 bg-[#FAF5F0] border border-[var(--sentinel-border)] rounded-lg p-4">
            <img
              src="/assets/aistudio/sentinel_architecture_1577bfe2.svg"
              alt="Sentinel architecture diagram showing Customer Environment, Regional Data Plane with Customer-Held Key, and Global Control Plane"
              referrerPolicy="no-referrer"
              className="w-full h-auto block"
            />
          </div>

          <div className="xl:col-span-5 space-y-4 text-sm">
            <div className="pb-4 border-b border-[var(--sentinel-divider)]">
              <h2 className="font-semibold text-[var(--sentinel-ink)]">1. Customer Environment (Outbound-Only)</h2>
              <p className="mt-1 text-xs text-[var(--sentinel-ink-secondary)] leading-relaxed">
                Read-only mTLS agent strips API keys, bearer tokens, IBANs, SSNs, and emails into salted HMAC digests before bytes leave your VPC.
              </p>
            </div>

            <div className="pb-4 border-b border-[var(--sentinel-divider)]">
              <h2 className="font-semibold text-[var(--sentinel-teal)]">
                2. Regional Data Plane ({controlPlane.region}, BYOK KMS)
              </h2>
              <p className="mt-1 text-xs text-[var(--sentinel-ink-secondary)] leading-relaxed">
                Runs Normalizer, Detection Engine, Blast-Radius Decision Engine, SHA-256 Log Vault, Notifier, and scoped Response Connector with 1-click Undo under key{' '}
                <span className="font-mono text-[var(--sentinel-ink)] break-all">{controlPlane.customerKmsKeyId}</span>{' '}
                (<span className="font-mono text-[var(--sentinel-ink)]">{controlPlane.customerKeyFingerprint}</span>).
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-[var(--sentinel-ink)]">3. Global Control Plane (Metadata Only)</h2>
              <p className="mt-1 text-xs text-[var(--sentinel-ink-secondary)] leading-relaxed">
                Stores tenant routing and RBAC metadata only — never customer logs, never raw secrets, never KMS key material.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="window-nude rounded-lg p-6 space-y-5">
        <h2 className="text-base font-semibold text-[var(--sentinel-ink)]">
          Protecting Sentinel — And What It Misses
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-[var(--sentinel-ink-secondary)] leading-relaxed">
          <ul className="space-y-2 list-disc pl-4">
            <li>
              <strong className="text-[var(--sentinel-ink)]">Per-customer BYOK keys:</strong> Revoking your KMS key immediately renders regional storage unreadable.
            </li>
            <li>
              <strong className="text-[var(--sentinel-ink)]">Least privilege &amp; self-audit:</strong> Outbound collector is read-only; every Sentinel action (Approve, Dismiss, Contain, Undo, Resolve) is logged in the SHA-256 Vault.
            </li>
            <li>
              <strong className="text-[var(--sentinel-ink)]">Planned milestones (not yet completed):</strong> SOC 2 Type II audit and independent external penetration tests are planned pre-GA milestones.
            </li>
          </ul>

          <ul className="space-y-2 list-disc pl-4">
            <li>
              <strong className="text-[var(--sentinel-ink)]">In-pattern attacker:</strong> An intruder using a valid key strictly inside normal hours, office IPs, and volume will not trip fingerprint baselines.
            </li>
            <li>
              <strong className="text-[var(--sentinel-ink)]">Unconnected systems:</strong> Activity in unmonitored shadow SaaS or databases without an outbound feed cannot be seen.
            </li>
            <li>
              <strong className="text-[var(--sentinel-ink)]">Legal review:</strong> Verify all data-residency and statutory breach-clock claims with legal counsel before production rollout.
            </li>
          </ul>
        </div>
      </section>

      <section className="window-suede rounded-lg p-6 space-y-4">
        <h2 className="text-base font-semibold text-[var(--sentinel-ink)]">
          Production Rollout Checklist (What To Add For Live Enterprise Deployment)
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs text-[var(--sentinel-ink-secondary)] leading-relaxed">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--sentinel-ink)]">1. Auth &amp; Database Persistence</h3>
            <ul className="space-y-1.5 list-disc pl-4">
              <li>SAML 2.0 / OIDC SSO (Okta / Entra ID) with MFA &amp; RBAC roles.</li>
              <li>Managed PostgreSQL (Cloud SQL / RDS) + WORM Object Lock bucket for vault snapshots.</li>
              <li>Read-only DB audit feeds (<span className="font-mono">pgaudit</span>, SQL Audit) — never raw PII tables.</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--sentinel-ink)]">2. Edge Collector &amp; Scaling</h3>
            <ul className="space-y-1.5 list-disc pl-4">
              <li>Containerized Go/Rust or OpenTelemetry outbound mTLS edge agent inside customer VPC.</li>
              <li>Redis Pub/Sub or NATS for multi-node WebSocket fan-out + webhook retry dead-letter queue.</li>
              <li>VAPID / FCM / APNs keys for background mobile push notifications.</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--sentinel-ink)]">3. Infrastructure &amp; Keys</h3>
            <ul className="space-y-1.5 list-disc pl-4">
              <li>
                Customer-held BYOK KMS key ARN configured in <span className="font-mono">{controlPlane.region}</span>:{' '}
                <span className="font-mono break-all text-[var(--sentinel-ink)]">{controlPlane.customerKmsKeyId}</span>.
              </li>
              <li>SPIFFE / private CA mTLS certificates binding each agent to its tenant.</li>
              <li>Regional GKE / Cloud Run isolation separating Data Plane from Control Plane.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
