"use client";
import { useEffect, useState } from "react";
import { useAuth, NotConfigured, TopBar } from "@/components/AuthProvider";
import { sendEmailVerification } from "firebase/auth";
import { firebaseConfigured } from "@/lib/firebase";
import { createTree, listMyTrees } from "@/lib/data";
import type { Role, Tree } from "@/lib/types";

const roleName: Record<Role, string> = { owner: "Owner", editor: "Editor", viewer: "Viewer" };

/** Small illustration of a family: a couple joined at a brass dot, two children below. */
function HeroTree() {
  const card = (x: number, y: number, sex: "M" | "F", name: string, goth: string) => (
    <g className={`hero-card ${sex}`}>
      <rect x={x - 62} y={y - 30} width={124} height={60} rx={10} />
      <text className="hn" x={x} y={y - 6} textAnchor="middle">{name}</text>
      <line x1={x - 44} x2={x + 44} y1={y + 6} y2={y + 6} />
      <text className="hg" x={x} y={y + 21} textAnchor="middle">{goth}</text>
    </g>
  );
  return (
    <svg className="hero-tree" viewBox="0 0 360 250" role="img" aria-label="Example family tree: a couple and their two children">
      <path className="hero-edge" d="M118 50 H242 M180 50 V128 M95 128 H265 M95 128 V170 M265 128 V170" />
      <circle className="hero-dot" cx="180" cy="50" r="7" />
      {card(78, 50, "M", "Ravi", "Father")}
      {card(282, 50, "F", "Lata", "Mother")}
      {card(95, 200, "M", "Anil", "Son")}
      {card(265, 200, "F", "Kavya", "Daughter")}
    </svg>
  );
}

const features = [
  { t: "A tree that draws itself", d: "Add parents, spouses and children. The tree arranges itself, so it stays neat as your family grows." },
  { t: "Build it with family", d: "Send relatives an invite link. Editors can add and change people. Viewers can only see the tree." },
  { t: "Keep names private", d: "Hide a child's name, or anyone's, from Viewers. Every change is saved, so mistakes can be undone." },
  { t: "Works on any device", d: "Use it on your phone or computer. Search for anyone by name and zoom in on any part of the tree." },
];

const steps = [
  { t: "Create an account", d: "Sign up with your email, or with Google in one tap." },
  { t: "Create your tree", d: "Add yourself, then your parents, spouse and children." },
  { t: "Invite your family", d: "Send a link so relatives can add their side of the family." },
];

function Landing() {
  return (
    <>
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">Family tree</p>
          <h1>Your family&apos;s story, passed on for generations.</h1>
          <p className="lead">Chart every name and every branch of your family, with help from relatives wherever they live, so your children and grandchildren always know where they come from.</p>
          <div className="row hero-cta">
            <a href="/signup"><button className="primary big" type="button">Create an account</button></a>
            <a href="/signin"><button className="big" type="button">Sign in</button></a>
          </div>
          <p className="fine">Already have an account from before? Use Sign in, then the same method you used last time (Google or email).</p>
        </div>
        <div className="landing-art"><HeroTree /></div>
      </section>

      <section className="features" aria-label="Features">
        {features.map((f) => (
          <div key={f.t} className="feature">
            <h2>{f.t}</h2>
            <p className="muted">{f.d}</p>
          </div>
        ))}
      </section>

      <section className="howto" aria-labelledby="howto-h">
        <h3 id="howto-h">How it works</h3>
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={s.t}><span className="step-n" aria-hidden="true">{i + 1}</span><div><strong>{s.t}</strong><p className="muted">{s.d}</p></div></li>
          ))}
        </ol>
      </section>
    </>
  );
}

function VerifyBanner() {
  const { user } = useAuth();
  const [sent, setSent] = useState("");
  const resend = () => user && sendEmailVerification(user, { url: `${window.location.origin}/` })
    .then(() => setSent("Sent. It can take a few minutes; check your spam or junk folder too."))
    .catch((e) => setSent(e?.code === "auth/too-many-requests" ? "Already sent recently. Wait a few minutes before asking again." : "Couldn't send right now. Try again in a few minutes."));
  return (
    <div className="notice row" style={{ justifyContent: "space-between" }}>
      <span>Please confirm your email address ({user?.email}) using the link we sent you. Can&apos;t find it? Check spam or junk.</span>
      {sent ? <span>{sent}</span> : <button type="button" onClick={resend}>Resend email</button>}
    </div>
  );
}

function MyTrees() {
  const { user } = useAuth();
  const [trees, setTrees] = useState<(Tree & { role: Role })[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!user) return;
    listMyTrees(user.uid).then(setTrees).catch(() => setErr("Couldn't load your trees. Check your connection and reload."));
  }, [user]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;
    setBusy(true); setErr("");
    try {
      const id = await createTree(user, name.trim());
      window.location.href = `/tree?id=${id}`;
    } catch {
      setErr("Couldn't create the tree. Try again.");
      setBusy(false);
    }
  };

  const first = (user?.displayName || "").split(" ")[0];
  return (
    <>
      <header className="stack" style={{ gap: 6 }}>
        <p className="eyebrow">Welcome back</p>
        <h1>{first ? `Hello, ${first}` : "Your family trees"}</h1>
      </header>
      {user && !user.emailVerified && user.providerData.some((p) => p.providerId === "password") && <VerifyBanner />}
      <section className="stack">
        <h3>Your trees</h3>
        {trees === null ? <p className="muted">Loading your trees…</p> : trees.length === 0 ? (
          <p className="muted">You don&apos;t have any trees yet. Create one below, or open an invite link from a relative.</p>
        ) : (
          <div className="tiles">
            {trees.map((t) => (
              <a key={t.id} href={`/tree?id=${t.id}`} className="tile-link">
                <div className="card tile"><strong>{t.name}</strong><span className="muted">{roleName[t.role]}</span><span className="tile-open">Open tree →</span></div>
              </a>
            ))}
          </div>
        )}
      </section>
      <form className="card" onSubmit={create}>
        <h2>Start a new tree</h2>
        <label>Tree name<span className="hint">For example, &quot;Rao Family&quot;</span>
          <input id="new-tree-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
        </label>
        <div className="row"><button className="primary" type="submit" disabled={busy}>{busy ? "Creating…" : "Create tree"}</button></div>
      </form>
      {err && <p className="error">{err}</p>}
    </>
  );
}

export default function Home() {
  const { user, loading } = useAuth();
  return (
    <>
      <TopBar />
      <main className={`wrap ${user ? "narrow" : "landing"}`}>
        {!firebaseConfigured ? <NotConfigured /> : loading ? <p className="muted">Loading…</p> : user ? <MyTrees /> : <Landing />}
      </main>
    </>
  );
}
