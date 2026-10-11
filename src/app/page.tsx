"use client";
import { useEffect, useState } from "react";
import { useAuth, NotConfigured, SignInCard, TopBar } from "@/components/AuthProvider";
import { firebaseConfigured } from "@/lib/firebase";
import { createTree, listMyTrees } from "@/lib/data";
import type { Role, Tree } from "@/lib/types";

const roleName: Record<Role, string> = { owner: "Owner", editor: "Editor", viewer: "Viewer" };

export default function Home() {
  const { user, loading } = useAuth();
  const [trees, setTrees] = useState<(Tree & { role: Role })[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!user) { setTrees(null); return; }
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

  return (
    <>
      <TopBar />
      <main className="wrap narrow">
      <header className="hero">
        <p className="eyebrow">Gothram-aware family trees</p>
        <h1>Build your family tree together</h1>
        <p className="muted">Add relatives, invite family to help, and let the app work out each person&apos;s gothram from their father&apos;s line, including married women, who take their husband&apos;s.</p>
      </header>

      {!firebaseConfigured ? <NotConfigured /> : loading ? <p className="muted">Loading…</p> : !user ? (
        <SignInCard message="Sign in to create a tree or open one you've been invited to." />
      ) : (
        <>
          <section className="stack">
            <h3>Your trees</h3>
            {trees === null ? <p className="muted">Loading your trees…</p> : trees.length === 0 ? (
              <p className="muted">You don&apos;t have any trees yet. Create one below, or open an invite link from a relative.</p>
            ) : (
              <div className="tiles">
                {trees.map((t) => (
                  <a key={t.id} href={`/tree?id=${t.id}`} style={{ textDecoration: "none", color: "inherit" }} className="tile-link">
                    <div className="card tile"><strong>{t.name}</strong><span className="muted">{roleName[t.role]}</span></div>
                  </a>
                ))}
              </div>
            )}
          </section>
          <form className="card" onSubmit={create}>
            <h2>Create a new tree</h2>
            <label>Tree name<span className="hint">For example, &quot;Rao Family&quot;</span>
              <input id="new-tree-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
            </label>
            <div className="row"><button className="primary" type="submit" disabled={busy}>{busy ? "Creating…" : "Create tree"}</button></div>
          </form>
        </>
      )}
      {err && <p className="error">{err}</p>}
    </main>
    </>
  );
}
