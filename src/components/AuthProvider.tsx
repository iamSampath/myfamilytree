"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { fb, firebaseConfigured } from "@/lib/firebase";

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
  const signOutUser = async () => { await signOut(fb().auth); };
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

export function SignInCard({ message }: { message: string }) {
  const { signIn } = useAuth();
  const [err, setErr] = useState("");
  return (
    <div className="card">
      <h2>Sign in</h2>
      <p className="muted">{message}</p>
      <div className="row">
        <button className="primary" type="button" onClick={() => signIn().catch((e) => setErr(e?.code === "auth/popup-closed-by-user" ? "" : "Sign-in didn't complete. Allow pop-ups for this site and try again."))}>Sign in with Google</button>
      </div>
      {err && <p className="error">{err}</p>}
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
