"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile,
} from "firebase/auth";
import { fb } from "@/lib/firebase";
import { authErrorMessage, safeNext, signupProblems } from "@/lib/authHelpers";
import { GoogleButton, useAuth } from "./AuthProvider";

/** Sign-up or sign-in form: email + password, with Google as an alternative. */
export function AuthForm({ mode }: { mode: "signup" | "signin" }) {
  const next = safeNext(useSearchParams().get("next"));
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  // While a new account is being set up (name + verification email), don't leave the page yet:
  // leaving early cancels the verification email.
  const finishing = useRef(false);

  // Once signed in (by any method), continue to where they were going.
  useEffect(() => { if (!loading && user && !finishing.current) window.location.href = next; }, [user, loading, next]);

  const other = mode === "signup" ? "/signin" : "/signup";
  const otherHref = `${other}${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]); setInfo("");
    if (mode === "signup") {
      const probs = signupProblems(name, email, password);
      if (probs.length) { setErrors(probs); return; }
    }
    setBusy(true);
    try {
      const { auth } = fb();
      if (mode === "signup") {
        finishing.current = true;
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: name.trim().slice(0, 120) });
        await cred.user.reload();
        try {
          await sendEmailVerification(cred.user);
        } catch {
          // The account exists; they can resend the email from the home page.
        }
        window.location.href = next;
        return;
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      // The effect above redirects once the sign-in is registered.
    } catch (err: any) {
      finishing.current = false;
      const msg = authErrorMessage(err?.code, mode);
      if (msg) setErrors([msg]);
      setBusy(false);
    }
  };

  const reset = async () => {
    setErrors([]); setInfo("");
    if (!email.trim()) { setErrors(["Enter your email above, then tap “Forgot password?” again."]); return; }
    try {
      await sendPasswordResetEmail(fb().auth, email.trim());
      setInfo(`If ${email.trim()} has an account, a reset link is on its way. Check your inbox and spam folder.`);
    } catch (err: any) {
      setErrors([authErrorMessage(err?.code, "reset")]);
    }
  };

  if (user) return <p className="muted">Signing you in…</p>;
  return (
    <div className="auth-card card">
      <div className="stack" style={{ gap: 6 }}>
        <p className="eyebrow">{mode === "signup" ? "New here" : "Welcome back"}</p>
        <h1>{mode === "signup" ? "Create your account" : "Sign in"}</h1>
        <p className="muted">{mode === "signup" ? "Start your family tree, or accept an invite from a relative." : "Open your family trees."}</p>
      </div>

      <GoogleButton label={mode === "signup" ? "Sign up with Google" : "Continue with Google"} />
      <div className="divider" role="separator"><span>or use your email</span></div>

      <form onSubmit={submit} noValidate>
        {mode === "signup" && (
          <label>Your name
            <input id="auth-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </label>
        )}
        <label>Email
          <input id="auth-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>Password{mode === "signup" && <span className="hint">At least 8 characters</span>}
          <span className="pw">
            <input id="auth-password" type={show ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="link" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button>
          </span>
        </label>
        {mode === "signin" && <div><button type="button" className="link" onClick={reset}>Forgot password?</button></div>}
        {errors.length > 0 && <ul className="error">{errors.map((x) => <li key={x}>{x}</li>)}</ul>}
        {info && <p className="notice">{info}</p>}
        <button className="primary wide" type="submit" disabled={busy}>{busy ? (mode === "signup" ? "Creating account…" : "Signing in…") : (mode === "signup" ? "Create account" : "Sign in")}</button>
      </form>

      <p className="muted switch">
        {mode === "signup" ? "Already have an account? " : "New here? "}
        <a href={otherHref}>{mode === "signup" ? "Sign in" : "Create an account"}</a>
      </p>
    </div>
  );
}
