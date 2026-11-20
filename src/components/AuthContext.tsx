import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import {
  auth,
  googleProvider,
  syncOperatorOnLogin,
  type OperatorPublicProfile,
} from '../lib/firebase';
import type { LanguageCode } from '../lib/i18n';

export const PENDING_PORTAL_STORAGE_KEY = 'sentinel_pending_portal';

interface FirebaseAuthContextValue {
  user: User | null;
  authReady: boolean;
  authBusy: boolean;
  authError: string | null;
  operatorProfile: OperatorPublicProfile | null;
  signInWithGoogle: (opts: {
    sessionPortal: 'secops' | 'executive' | 'attacker';
    preferredLanguage: LanguageCode;
    preferredTheme: 'light' | 'dark';
  }) => Promise<boolean>;
  signOutAdmin: () => Promise<void>;
  cancelAuth: () => void;
  clearAuthError: () => void;
}

const FirebaseAuthContext = createContext<FirebaseAuthContextValue | null>(null);

function mapFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
  if (code === 'auth/popup-closed-by-user') {
    return 'Sign-in popup was closed before completing authentication. Click Sign in again to retry.';
  }
  if (code === 'auth/cancelled-popup-request') {
    return 'Previous sign-in request was cancelled. Please click Sign in once.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Browser blocked the sign-in popup. Allow popups for this site or wait for redirect sign-in.';
  }
  if (code === 'auth/unauthorized-domain') {
    return `Domain "${hostname}" is not authorized yet. Add "${hostname}" under Firebase Console → Authentication → Settings → Authorized domains.`;
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error contacting Firebase Auth. Check your connection and retry.';
  }
  return err instanceof Error ? err.message : 'Firebase authentication failed.';
}

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [operatorProfile, setOperatorProfile] = useState<OperatorPublicProfile | null>(null);
  const syncedUidRef = useRef<string | null>(null);

  const runBackgroundProfileSync = useCallback(
    (
      signedInUser: User,
      opts: {
        sessionPortal: 'secops' | 'executive' | 'attacker';
        preferredLanguage: LanguageCode;
        preferredTheme: 'light' | 'dark';
      },
    ) => {
      const defaultPortal = opts.sessionPortal === 'executive' ? 'executive' : 'secops';
      syncedUidRef.current = signedInUser.uid;
      void syncOperatorOnLogin({
        user: signedInUser,
        defaultPortal,
        sessionPortal: opts.sessionPortal,
        preferredLanguage: opts.preferredLanguage,
        preferredTheme: opts.preferredTheme,
      })
        .then((profile) => {
          setOperatorProfile(profile);
        })
        .catch((syncErr) => {
          // Never block portal access if Firestore sync hits a transient offline/rule/quota issue
          console.warn('Operator profile background sync warning:', syncErr);
        });
    },
    [],
  );

  useEffect(() => {
    // Safety guard so ProtectedPortalWrapper never stays stuck on "Verifying Firebase authentication..."
    const readyGuardTimer = window.setTimeout(() => {
      setAuthReady(true);
    }, 3500);

    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        window.clearTimeout(readyGuardTimer);
        setUser(firebaseUser);
        setAuthReady(true);
        setAuthBusy(false);
        if (!firebaseUser) {
          setOperatorProfile(null);
          syncedUidRef.current = null;
        }
      },
      (err) => {
        window.clearTimeout(readyGuardTimer);
        setAuthReady(true);
        setAuthBusy(false);
        setAuthError(mapFirebaseAuthError(err));
      },
    );

    // Handle redirect completion if browser fell back to signInWithRedirect (e.g., mobile Safari / popup blocked)
    void getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          setUser(result.user);
          setAuthReady(true);
          setAuthBusy(false);
          if (syncedUidRef.current !== result.user.uid) {
            const pending = window.sessionStorage.getItem(PENDING_PORTAL_STORAGE_KEY);
            runBackgroundProfileSync(result.user, {
              sessionPortal: pending === 'attacker' ? 'attacker' : 'secops',
              preferredLanguage: 'en',
              preferredTheme: 'light',
            });
          }
        }
      })
      .catch((err) => {
        setAuthBusy(false);
        const code = (err as { code?: string })?.code ?? '';
        if (code && code !== 'auth/no-auth-event') {
          setAuthError(mapFirebaseAuthError(err));
        }
      });

    return () => {
      window.clearTimeout(readyGuardTimer);
      unsubscribe();
    };
  }, [runBackgroundProfileSync]);

  const signInWithGoogle = useCallback(
    async (opts: {
      sessionPortal: 'secops' | 'executive' | 'attacker';
      preferredLanguage: LanguageCode;
      preferredTheme: 'light' | 'dark';
    }) => {
      // If Firebase already has an active user, enter immediately without re-opening a popup
      if (auth.currentUser) {
        setUser(auth.currentUser);
        setAuthReady(true);
        setAuthBusy(false);
        return true;
      }

      setAuthBusy(true);
      setAuthError(null);
      try {
        const credential = await signInWithPopup(auth, googleProvider);
        const signedInUser = credential.user;
        // Immediately unlock the UI and enter the portal — never block on Firestore roundtrips
        setUser(signedInUser);
        setAuthReady(true);
        setAuthBusy(false);
        runBackgroundProfileSync(signedInUser, opts);
        return true;
      } catch (err) {
        const code = (err as { code?: string })?.code ?? '';
        // Automatic redirect fallback when browser blocks popups on standalone domains (e.g. Netlify mobile)
        if (
          code === 'auth/popup-blocked' ||
          code === 'auth/operation-not-supported-in-this-environment'
        ) {
          try {
            window.sessionStorage.setItem(
              PENDING_PORTAL_STORAGE_KEY,
              opts.sessionPortal === 'attacker' ? 'attacker' : 'admin',
            );
            await signInWithRedirect(auth, googleProvider);
            return false;
          } catch (redirectErr) {
            setAuthError(mapFirebaseAuthError(redirectErr));
            setAuthBusy(false);
            return false;
          }
        }
        setAuthError(mapFirebaseAuthError(err));
        setAuthBusy(false);
        return false;
      }
    },
    [runBackgroundProfileSync],
  );

  const signOutAdmin = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      window.sessionStorage.removeItem(PENDING_PORTAL_STORAGE_KEY);
      await signOut(auth);
      setUser(null);
      setOperatorProfile(null);
      syncedUidRef.current = null;
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const cancelAuth = useCallback(() => {
    setAuthBusy(false);
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <FirebaseAuthContext.Provider
      value={{
        user,
        authReady,
        authBusy,
        authError,
        operatorProfile,
        signInWithGoogle,
        signOutAdmin,
        cancelAuth,
        clearAuthError,
      }}
    >
      {children}
    </FirebaseAuthContext.Provider>
  );
}

export function useFirebaseAuth() {
  const ctx = useContext(FirebaseAuthContext);
  if (!ctx) {
    throw new Error('useFirebaseAuth must be used inside FirebaseProvider');
  }
  return ctx;
}
