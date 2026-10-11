"use client";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  clearIndexedDbPersistence, connectFirestoreEmulator, initializeFirestore, persistentLocalCache,
  persistentMultipleTabManager, terminate, type Firestore,
} from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
/** Optional: set to turn on Firebase App Check (reCAPTCHA v3), which blocks requests that don't come from this site. */
const recaptchaKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

export function fb() {
  if (!firebaseConfigured) throw new Error("Firebase is not configured: set the NEXT_PUBLIC_FIREBASE_* environment variables.");
  if (!app) {
    app = getApps()[0] ?? initializeApp(config);
    if (recaptchaKey && typeof window !== "undefined") {
      initializeAppCheck(app, { provider: new ReCaptchaV3Provider(recaptchaKey), isTokenAutoRefreshEnabled: true });
    }
    auth = getAuth(app);
    // Keep a local copy so the tree opens fast and survives brief connection drops.
    // It's cleared on sign-out (see clearLocalData).
    try {
      db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
    } catch {
      db = initializeFirestore(app, {});
    }
    if (process.env.NEXT_PUBLIC_USE_EMULATORS === "true") {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
    }
  }
  return { app: app!, auth: auth!, db: db! };
}

/** Remove the local copy of family data from this device (used on sign-out, e.g. on a shared computer). */
export async function clearLocalData() {
  if (!db) return;
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    // Another tab may still hold the cache; it is replaced on next sign-in.
  }
}
