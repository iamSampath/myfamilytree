"use client";
/**
 * Branded landing page for links in Firebase emails (verify email, reset password, undo email change).
 * Set as the custom action URL in Firebase: Authentication → Templates → (pencil) → Customize action URL.
 */
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { applyActionCode, checkActionCode, confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { NotConfigured, TopBar } from "@/components/AuthProvider";
import { fb, firebaseConfigured } from "@/lib/firebase";

type State =
  | { kind: "working" }
  | { kind: "verified" }
  | { kind: "reset-form"; email: string }
  | { kind: "reset-done" }
  | { kind: "recovered"; email: string }
  | { kind: "error"; title: string; text: string };

const expired: State = { kind: "error", title: "This link has expired or was already used", text: "Links in our emails work once and only for a limited time. Ask for a new one and use the newest email." };

function Action() {
  const q = useSearchParams();
  const mode = q.get("mode");
  const code = q.get("oobCode") || "";
  const [state, setState] = useState<State>({ kind: "working" });
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { auth } = fb();
    if (!code) { setState({ kind: "error", title: "This link is incomplete", text: "Open the link straight from the email, or copy the whole link into your browser." }); return; }
    if (mode === "verifyEmail") {
      applyActionCode(auth, code)
        .then(async () => { await auth.currentUser?.reload().catch(() => {}); setState({ kind: "verified" }); })
        .catch(() => setState(expired));
    } else if (mode === "resetPassword") {
      verifyPasswordResetCode(auth, code).then((email) => setState({ kind: "reset-form", email })).catch(() => setState(expired));
    } else if (mode === "recoverEmail") {
      checkActionCode(auth, code)
        .then((info) => applyActionCode(auth, code).then(() => setState({ kind: "recovered", email: info.data.email ?? "" })))
        .catch(() => setState(expired));
    } else {
      setState({ kind: "error", title: "We don't recognise this link", text: "Open the link straight from the email you received." });
    }
  }, [mode, code]);

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (pw.length < 8) { setErr("Choose a password with at least 8 characters."); return; }
    setBusy(true);
    try { await confirmPasswordReset(fb().auth, code, pw); setState({ kind: "reset-done" }); }
    catch (e: any) { setErr(e?.code === "auth/weak-password" ? "Choose a stronger password: at least 8 characters." : "This link has expired. Ask for a new reset email."); setBusy(false); }
  };

  const shell = (eyebrow: string, title: string, body: React.ReactNode) => (
    <div className="auth-card card">
      <div className="stack" style={{ gap: 6 }}><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>
      {body}
    </div>
  );

  switch (state.kind) {
    case "working": return <p className="muted">Checking your link…</p>;
    case "verified": return shell("Email confirmed", "You're all set", <>
      <p className="muted">Thanks for confirming your email address. You can now use My Family Tree fully.</p>
      <a href="/"><button className="primary wide" type="button">Go to my family trees</button></a></>);
    case "reset-form": return shell("Reset password", "Choose a new password", <>
      <p className="muted">For {state.email}</p>
      <form onSubmit={reset} noValidate>
        <label>New password<span className="hint">At least 8 characters</span>
          <span className="pw">
            <input id="new-password" type={show ? "text" : "password"} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
            <button type="button" className="link" onClick={() => setShow((v) => !v)}>{show ? "Hide" : "Show"}</button>
          </span>
        </label>
        {err && <p className="error" style={{ paddingLeft: 0 }}>{err}</p>}
        <button className="primary wide" type="submit" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
      </form></>);
    case "reset-done": return shell("Password changed", "Your new password is saved", <>
      <p className="muted">Sign in with your email and the new password.</p>
      <a href="/signin"><button className="primary wide" type="button">Sign in</button></a></>);
    case "recovered": return shell("Email restored", "Your sign-in email is back", <>
      <p className="muted">Your account email has been changed back to {state.email}. If you didn&apos;t ask for the change, reset your password now to keep your account safe.</p>
      <a href="/signin"><button className="primary wide" type="button">Sign in</button></a></>);
    case "error": return shell("Link problem", state.title, <>
      <p className="muted">{state.text}</p>
      <div className="row"><a href="/signin"><button className="primary" type="button">Go to sign in</button></a><a href="/">Home</a></div></>);
  }
}

export default function ActionPage() {
  return (
    <>
      <TopBar />
      <main className="wrap auth-wrap">
        {firebaseConfigured ? <Suspense fallback={<p className="muted">Loading…</p>}><Action /></Suspense> : <NotConfigured />}
      </main>
    </>
  );
}
