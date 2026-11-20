import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { LanguageCode } from './i18n';

const app = initializeApp(firebaseConfig);

function createResilientFirestore(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId,
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createResilientFirestore();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Firestore operation timed out (${label})`));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function testConnection() {
  try {
    await withTimeout(getDocFromServer(doc(db, 'test', 'connection')), 5000, 'connection-test');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export interface OperatorPublicProfile {
  uid: string;
  displayName: string;
  defaultPortal: 'secops' | 'executive';
  preferredLanguage: LanguageCode;
  preferredTheme: 'light' | 'dark';
}

function sanitizeDisplayName(raw: string | null | undefined, email: string | null | undefined): string {
  const fallback = email ? email.split('@')[0] : 'Sentinel Operator';
  const cleaned = (raw || fallback).trim().slice(0, 80);
  return cleaned.length > 0 ? cleaned : 'Sentinel Operator';
}

function sanitizeDeviceSummary(): string {
  if (typeof navigator === 'undefined') return 'Web Browser';
  const platform = navigator.platform || 'Web';
  const ua = navigator.userAgent || '';
  const browser = ua.includes('Chrome')
    ? 'Chrome'
    : ua.includes('Safari')
      ? 'Safari'
      : ua.includes('Firefox')
        ? 'Firefox'
        : 'Browser';
  return `${browser} on ${platform}`.trim().slice(0, 120) || 'Web Browser';
}

function generateSessionId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `sess_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
}

/**
 * Syncs verified operator public preferences and PII-isolated private profile in Firestore,
 * then writes an immutable operator_sessions audit entry.
 * All payload fields strictly adhere to firebase-blueprint.json bounds.
 */
export async function syncOperatorOnLogin(params: {
  user: User;
  defaultPortal: 'secops' | 'executive';
  sessionPortal?: 'secops' | 'executive' | 'attacker';
  preferredLanguage: LanguageCode;
  preferredTheme: 'light' | 'dark';
}): Promise<OperatorPublicProfile> {
  const { user, defaultPortal, sessionPortal, preferredLanguage, preferredTheme } = params;
  const uid = user.uid;
  const displayName = sanitizeDisplayName(user.displayName, user.email);
  const email = (user.email ?? '').trim().slice(0, 254);

  const publicPath = `operators/${uid}/public/info`;
  const publicRef = doc(db, 'operators', uid, 'public', 'info');

  let finalProfile: OperatorPublicProfile = {
    uid,
    displayName,
    defaultPortal,
    preferredLanguage,
    preferredTheme,
  };

  try {
    const existingPublic = await withTimeout(getDoc(publicRef), 6000, 'get-public-info');
    if (existingPublic.exists()) {
      const data = existingPublic.data();
      finalProfile = {
        uid,
        displayName:
          typeof data.displayName === 'string' && data.displayName.length > 0
            ? data.displayName.slice(0, 80)
            : displayName,
        defaultPortal:
          data.defaultPortal === 'executive' || data.defaultPortal === 'secops'
            ? data.defaultPortal
            : defaultPortal,
        preferredLanguage:
          data.preferredLanguage === 'en' ||
          data.preferredLanguage === 'es' ||
          data.preferredLanguage === 'fr' ||
          data.preferredLanguage === 'de'
            ? data.preferredLanguage
            : preferredLanguage,
        preferredTheme:
          data.preferredTheme === 'dark' || data.preferredTheme === 'light'
            ? data.preferredTheme
            : preferredTheme,
      };
      await withTimeout(
        updateDoc(publicRef, {
          displayName: finalProfile.displayName,
          defaultPortal,
          preferredLanguage,
          preferredTheme,
          updatedAt: serverTimestamp(),
        }),
        6000,
        'update-public-info',
      );
    } else {
      await withTimeout(
        setDoc(publicRef, {
          uid,
          displayName,
          defaultPortal,
          preferredLanguage,
          preferredTheme,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        6000,
        'create-public-info',
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, publicPath);
  }

  // PII-isolated private profile
  if (email.length >= 3) {
    const privatePath = `operators/${uid}/private/profile`;
    const privateRef = doc(db, 'operators', uid, 'private', 'profile');
    try {
      const existingPrivate = await withTimeout(getDoc(privateRef), 6000, 'get-private-profile');
      if (existingPrivate.exists()) {
        await withTimeout(
          updateDoc(privateRef, {
            email,
            lastLoginAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          6000,
          'update-private-profile',
        );
      } else {
        await withTimeout(
          setDoc(privateRef, {
            uid,
            email,
            lastLoginAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          6000,
          'create-private-profile',
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, privatePath);
    }
  }

  // Immutable session audit log (depends on /operators/{uid}/public/info existing)
  const sessionId = generateSessionId();
  const sessionPath = `operator_sessions/${sessionId}`;
  try {
    await withTimeout(
      setDoc(doc(db, 'operator_sessions', sessionId), {
        uid,
        portal: sessionPortal ?? defaultPortal,
        authProvider: 'google.com',
        deviceSummary: sanitizeDeviceSummary(),
        createdAt: serverTimestamp(),
      }),
      6000,
      'create-operator-session',
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, sessionPath);
  }

  return finalProfile;
}

export async function updateOperatorPreferences(
  uid: string,
  patch: {
    defaultPortal?: 'secops' | 'executive';
    preferredLanguage?: LanguageCode;
    preferredTheme?: 'light' | 'dark';
  },
): Promise<void> {
  const publicPath = `operators/${uid}/public/info`;
  const publicRef = doc(db, 'operators', uid, 'public', 'info');
  try {
    const existing = await withTimeout(getDoc(publicRef), 5000, 'check-public-info');
    if (!existing.exists()) return;
    await withTimeout(
      updateDoc(publicRef, {
        ...patch,
        updatedAt: serverTimestamp(),
      }),
      5000,
      'update-preferences',
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, publicPath);
  }
}

export interface PersistedChatMessage {
  id: string;
  uid: string;
  role: 'user' | 'model';
  content: string;
  model: string;
  createdAtMs: number;
}

function generateChatMessageId(role: 'user' | 'model'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `msg_${Date.now()}_${role}_${rand}`.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
}

/**
 * Subscribes to the authenticated operator's persisted multi-turn Security Analyst chat thread.
 * Queries with `where('uid', '==', uid)` to match Firestore Security Rules list enforcement
 * and sorts chronologically client-side without requiring a composite index.
 */
export function subscribeOperatorChatMessages(
  uid: string,
  onMessages: (messages: PersistedChatMessage[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const chatPath = `operators/${uid}/chat_messages`;
  const q = query(collection(db, 'operators', uid, 'chat_messages'), where('uid', '==', uid));

  return onSnapshot(
    q,
    (snap) => {
      const items: PersistedChatMessage[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const ts = data.createdAt as Timestamp | null | undefined;
        const createdAtMs =
          ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now();
        if (
          (data.role === 'user' || data.role === 'model') &&
          typeof data.content === 'string' &&
          typeof data.model === 'string'
        ) {
          items.push({
            id: docSnap.id,
            uid: typeof data.uid === 'string' ? data.uid : uid,
            role: data.role,
            content: data.content,
            model: data.model,
            createdAtMs,
          });
        }
      });
      items.sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));
      onMessages(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, chatPath);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

/**
 * Persists a single chat turn strictly adhering to firebase-blueprint.json bounds:
 * content <= 8000 chars, model <= 64 chars, valid ID regex.
 */
export async function saveOperatorChatMessage(params: {
  uid: string;
  role: 'user' | 'model';
  content: string;
  model: string;
}): Promise<string> {
  const messageId = generateChatMessageId(params.role);
  const path = `operators/${params.uid}/chat_messages/${messageId}`;
  const cleanContent = params.content.trim().slice(0, 8000);
  const cleanModel = (params.model.trim() || 'operator').slice(0, 64);

  if (!cleanContent) {
    throw new Error('Cannot save empty chat message.');
  }

  try {
    await withTimeout(
      setDoc(doc(db, 'operators', params.uid, 'chat_messages', messageId), {
        uid: params.uid,
        role: params.role,
        content: cleanContent,
        model: cleanModel,
        createdAt: serverTimestamp(),
      }),
      6000,
      'save-chat-message',
    );
    return messageId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Clears all persisted chat messages for the authenticated operator.
 */
export async function clearOperatorChatMessages(uid: string): Promise<void> {
  const path = `operators/${uid}/chat_messages`;
  try {
    const q = query(collection(db, 'operators', uid, 'chat_messages'), where('uid', '==', uid));
    const snap = await withTimeout(getDocs(q), 6000, 'list-chat-clear');
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await withTimeout(batch.commit(), 6000, 'commit-chat-clear');
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
