"use client";
import { useEffect, useState } from "react";
import { useAuth, GoogleButton, NotConfigured, TopBar } from "@/components/AuthProvider";
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
    <svg className="hero-tree" viewBox="0 0 360 250" role="img" aria-label="Example family tree: a couple and their two children, each showing their gothram">
      <path className="hero-edge" d="M118 50 H242 M180 50 V128 M95 128 H265 M95 128 V170 M265 128 V170" />
      <circle className="hero-dot" cx="180" cy="50" r="7" />
      {card(78, 50, "M", "Ravi", "Kashyapa")}
      {card(282, 50, "F", "Lata", "Kashyapa")}
      {card(95, 200, "M", "Anil", "Kashyapa")}
      {card(265, 200, "F", "Kavya", "Kashyapa")}
    </svg>
  );
}

const features = [
  { t: "Gothrams worked out", d: "Enter each family's gothram once. Children inherit it, and married women take their husband's." },
  { t: "Build it together", d: "Invite relatives with a link. Editors can add people; Viewers can only look." },
  { t: "Private where it matters", d: "Hide names of children or anyone else from Viewers. Every change can be undone." },
  { t: "Phone and laptop", d: "Find anyone by name, zoom around the tree, and add family from wherever you are." },
];

const steps = [
  { t: "Sign in with Google", d: "No new password to remember." },
  { t: "Create your tree", d: "Add yourself, then parents, spouse and children." },
  { t: "Invite family", d: "Share a link so relatives can fill in their branches." },
];

function Landing() {
  return (
    <>
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">Gothram-aware family trees</p>
          <h1>Your family, every branch, in one place</h1>
          <p className="lead">Build your family tree together with relatives near and far. The app works out each person&apos;s gothram from their father&apos;s line, so you only enter it once.</p>
          <GoogleButton label="Get started with Google" />
          <p className="fine">Your tree is private to the people you invite.</p>
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
