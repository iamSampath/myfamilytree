"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { clearLocalData, fb, firebaseConfigured } from "@/lib/firebase";

interface AuthState { user: User | null; loading: boolean; signIn: () => Promise<void>; signOutUser: () => Promise<void> }
const Ctx = createContext<AuthState>({ user: null, loading: true, signIn: async () => {}, signOutUser: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!firebaseConfigured) { setLoading(false); return; }
    return onAuthStateChanged(fb().auth, (u) => { setUser(u); setLoading(false); });
  }, []);
  const signIn = async () => { await signInWithPopup(fb().auth, new GoogleAuthProvider()); };
  // Sign out, wipe the local copy of family data, and reload to a clean state.
  const signOutUser = async () => { await signOut(fb().auth); await clearLocalData(); window.location.href = "/"; };
  return <Ctx.Provider value={{ user, loading, signIn, signOutUser }}>{children}</Ctx.Provider>;
}

export function NotConfigured() {
  return (
    <div className="card">
      <h2>Firebase isn&apos;t connected yet</h2>
      <p className="muted">Copy <span className="code">.env.example</span> to <span className="code">.env.local</span>, fill in your Firebase web app settings, and restart.</p>
    </div>
  );
}

/** Google sign-in button with the standard Google "G". */
export function GoogleButton({ label = "Sign in with Google" }: { label?: string }) {
  const { signIn } = useAuth();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = () => {
    setBusy(true); setErr("");
    signIn()
      .catch((e) => setErr(e?.code === "auth/popup-closed-by-user" || e?.code === "auth/cancelled-popup-request" ? "" : "Sign-in didn't complete. Allow pop-ups for this site and try again."))
      .finally(() => setBusy(false));
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <button type="button" className="google" onClick={go} disabled={busy}>
        <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
        </svg>
        {busy ? "Opening Google…" : label}
      </button>
      {err && <p className="error" style={{ paddingLeft: 0 }}>{err}</p>}
    </div>
  );
}

export function SignInCard({ message }: { message: string }) {
  return (
    <div className="card">
      <h2>Sign in</h2>
      <p className="muted">{message}</p>
      <div className="row"><GoogleButton /></div>
    </div>
  );
}

export function TopBar() {
  const { user, signOutUser } = useAuth();
  return (
    <header className="appbar">
      <div className="appbar-in">
        <a className="brand" href="/">
          <svg className="brand-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="4.5" r="2.5" /><circle cx="5" cy="19.5" r="2.5" /><circle cx="19" cy="19.5" r="2.5" /><circle cx="12" cy="19.5" r="2.5" />
            <path d="M12 7v5M5 17v-2.5h14V17M12 12v5" />
          </svg>
          My Family Tree
        </a>
        <OfflineNote />
        {user && (
          <div className="who">
            <span>{user.displayName || user.email}</span>
            <button type="button" onClick={() => signOutUser()}>Sign out</button>
          </div>
        )}
      </div>
    </header>
  );
}

/** Small note in the app bar when the device loses its connection. */
function OfflineNote() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  if (online) return null;
  return <span className="offline" role="status">Offline: changes will save when you&apos;re back online</span>;
}

