/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);

const setupAppCheck = () => {
  const siteKey = String((import.meta as any).env.VITE_FIREBASE_APP_CHECK_SITE_KEY || '').trim();
  const debugToken = String((import.meta as any).env.VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN || '').trim();
  const isProduction = (import.meta as any).env.PROD === true;
  const isDev = (import.meta as any).env.DEV === true;

  if (!siteKey) {
    if (isProduction) {
      console.warn('Firebase App Check chưa được cấu hình. Hãy set VITE_FIREBASE_APP_CHECK_SITE_KEY trước khi bật enforcement.');
    }
    return;
  }

  try {
    if (!isProduction && isDev && debugToken) {
      (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken === 'true' ? true : debugToken;
    }

    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true
    });
  } catch (err) {
    console.warn('Không thể khởi tạo Firebase App Check:', err);
  }
};

setupAppCheck();

// Initialize Firestore
export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

// Initialize Storage
export const storage = getStorage(app);

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

/**
 * Handle Firestore security and permission errors and throw structured JSON log.
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errMessage = error instanceof Error ? error.message : String(error);
  
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection check helper (not run automatically at boot to prevent noise/permission warnings before login)
export async function testConnectionAfterLogin(uid: string) {
  try {
    if (firebaseConfig.apiKey.includes('mock-api-key')) {
      console.warn("Using placeholder Firebase configuration. Please set up real Firebase project credential.");
      return;
    }
    await getDocFromServer(doc(db, 'users', uid));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration: Client is offline.");
    } else {
      console.warn("Firebase connection test logged: ", error);
    }
  }
}
