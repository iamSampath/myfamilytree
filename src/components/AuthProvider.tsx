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
      <p className="muted">Copy <span className="code">.env.example</span> to <span className="code">.env.local</span>, fill in your Firebase web app settings, and restart. See the README for the steps.</p>
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
    <div className="topbar">
      <a className="brand" href="/">My Family Tree</a>
      {user && (
        <div className="row">
          <span className="muted">{user.displayName || user.email}</span>
          <button type="button" onClick={() => signOutUser()}>Sign out</button>
        </div>
      )}
    </div>
  );
}
