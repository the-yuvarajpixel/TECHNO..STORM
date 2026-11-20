import type { ReactNode } from 'react';
import { Shield } from 'lucide-react';
import { useFirebaseAuth } from './AuthContext';

export type ProtectedPortalKind = 'admin' | 'attacker';

interface ProtectedPortalWrapperProps {
  requestedPortal: ProtectedPortalKind;
  fallback: (params: {
    requestedPortal: ProtectedPortalKind;
    authRequiredNotice: string;
  }) => ReactNode;
  children: ReactNode;
}

const PORTAL_DISPLAY_NAMES: Record<ProtectedPortalKind, string> = {
  admin: 'Admin Management',
  attacker: 'Demo Attacker',
};

/**
 * Protected route wrapper that enforces Firebase Authentication before rendering
 * either the unified Admin Management Portal or the Demo Attacker Portal.
 */
export function ProtectedPortalWrapper({
  requestedPortal,
  fallback,
  children,
}: ProtectedPortalWrapperProps) {
  const { user, authReady } = useFirebaseAuth();

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[var(--sentinel-bg)] text-[var(--sentinel-ink)] flex items-center justify-center p-6">
        <div className="window-suede rounded-lg px-8 py-6 text-center space-y-2">
          <Shield className="w-6 h-6 text-[var(--sentinel-accent)] mx-auto animate-pulse" />
          <p className="text-xs font-medium text-[var(--sentinel-ink-secondary)]">
            Verifying Firebase authentication...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    const label = PORTAL_DISPLAY_NAMES[requestedPortal];
    return (
      <>
        {fallback({
          requestedPortal,
          authRequiredNotice: `Firebase authentication is required before entering the ${label} portal.`,
        })}
      </>
    );
  }

  return <>{children}</>;
}
