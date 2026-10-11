"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth, NotConfigured, SignInCard, TopBar } from "@/components/AuthProvider";
import { TreeCanvas } from "@/components/TreeCanvas";
import { DataPanel, FamiliesPanel, HistoryPanel, PersonDetails, PersonEditor, SharePanel, type Ctx, type Draft } from "@/components/Panels";
import { firebaseConfigured } from "@/lib/firebase";
import { renameTree, subscribeTree } from "@/lib/data";
import { spouseOf } from "@/lib/family";
import type { Families, HistoryEntry, Member, People, Tree } from "@/lib/types";

type Mode = { kind: "view" } | { kind: "edit"; id: string | null; draft?: Draft } | { kind: "families" } | { kind: "history" } | { kind: "share" } | { kind: "data" };

function TreeApp() {
  const treeId = useSearchParams().get("id") || "";
  const { user, loading } = useAuth();
  const [tree, setTree] = useState<Tree | null | undefined>(undefined);
  const [people, setPeople] = useState<People>({});
  const [families, setFamilies] = useState<Families>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [status, setStatus] = useState("");
  const [denied, setDenied] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!user || !treeId) return;
    return subscribeTree(treeId, {
      tree: setTree, people: setPeople, families: setFamilies, history: setHistory, members: setMembers,
      error: (e: any) => { if (e?.code === "permission-denied") setDenied(true); else setStatus("Live updates stopped. Reload the page."); },
    });
  }, [user, treeId]);

  if (!firebaseConfigured) return <NotConfigured />;
  if (!treeId) return <div className="card"><h2>No tree selected</h2><p className="muted"><a href="/">Go to your trees</a></p></div>;
  if (loading) return <p className="muted">Loading…</p>;
  if (!user) return <SignInCard message="Sign in to open this family tree." />;
  if (denied) return <div className="card"><h2>You don&apos;t have access to this tree</h2><p className="muted">Ask the tree&apos;s owner for an invite link.</p></div>;
  if (tree === undefined) return <p className="muted">Loading the tree…</p>;
  if (tree === null) return <div className="card"><h2>This tree doesn&apos;t exist</h2><p className="muted"><a href="/">Go to your trees</a></p></div>;

  const me = members.find((m) => m.uid === user.uid);
  const role = me?.role ?? "viewer";
  const canEdit = role === "owner" || role === "editor";
  const ctx: Ctx = { tree, people, families, user, role, canEdit, select: (id) => { setSel(id); setMode({ kind: "view" }); }, say: setStatus };
  const empty = Object.keys(people).length === 0;

  const addRelative = (kind: "child" | "spouse" | "parent") => {
    const p = sel ? people[sel] : null;
    if (!p) return;
    const sp = spouseOf(p, people);
    if (kind === "child") {
      const father = p.sex === "F" ? sp : p;
      setMode({ kind: "edit", id: null, draft: { person: { fatherId: father?.id ?? "", motherId: p.sex === "F" ? p.id : sp?.id ?? "", family: father?.family ?? "" } } });
    }
    if (kind === "spouse") setMode({ kind: "edit", id: null, draft: { person: { spouseId: p.id, sex: p.sex === "M" ? "F" : p.sex === "F" ? "M" : "" } } });
    if (kind === "parent") setMode({ kind: "edit", id: null, draft: { person: {}, parentOf: p.id } });
  };

  const panel = () => {
    switch (mode.kind) {
      case "edit": return <PersonEditor key={mode.id ?? "new" + JSON.stringify(mode.draft ?? {})} ctx={ctx} id={mode.id} draft={mode.draft} onDone={(id) => { if (id) setSel(id); setMode({ kind: "view" }); }} />;
      case "families": return <FamiliesPanel ctx={ctx} onClose={() => setMode({ kind: "view" })} />;
      case "history": return <HistoryPanel ctx={ctx} history={history} onClose={() => setMode({ kind: "view" })} />;
      case "share": return <SharePanel ctx={ctx} members={members} onClose={() => setMode({ kind: "view" })} />;
      case "data": return <DataPanel ctx={ctx} onClose={() => setMode({ kind: "view" })} />;
      default:
        if (sel && people[sel]) return <PersonDetails ctx={ctx} id={sel} onEdit={() => setMode({ kind: "edit", id: sel })} onAdd={addRelative} />;
        return (
          <>
            <h2>Pick someone</h2>
            <p className="muted">Tap a person in the tree to see their gothram, parents, spouse and children.</p>
            {!canEdit && <p className="notice">You can view this tree. Ask the owner for editor access to make changes.</p>}
          </>
        );
    }
  };

  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">Family tree</p>
          {renaming ? (
            <form className="row" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) renameTree(tree.id, newName.trim()).then(() => setRenaming(false)).catch(() => setStatus("Couldn't rename the tree.")); }}>
              <input id="tree-name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} autoFocus style={{ width: "auto" }} />
              <button className="primary" type="submit">Save</button><button type="button" onClick={() => setRenaming(false)}>Cancel</button>
            </form>
          ) : (
            <div className="row"><h1>{tree.name}</h1>{role === "owner" && <button type="button" className="link" onClick={() => { setNewName(tree.name); setRenaming(true); }}>Rename</button>}</div>
          )}
        </div>
        <div className="row">
          {canEdit && <button className="primary" type="button" onClick={() => setMode({ kind: "edit", id: null })}>Add person</button>}
          <button type="button" onClick={() => setMode({ kind: "families" })}>Families &amp; gothrams</button>
          <button type="button" onClick={() => setMode({ kind: "share" })}>Share</button>
          <button type="button" onClick={() => setMode({ kind: "history" })}>Edit history</button>
          <button type="button" onClick={() => setMode({ kind: "data" })}>Import / export</button>
        </div>
      </header>
      <div className="legend">
        <span><i className="sw" style={{ background: "var(--m)" }} />Male</span>
        <span><i className="sw" style={{ background: "var(--f)" }} />Female</span>
        <span><i className="sw" style={{ background: "var(--line)" }} />Not set</span>
        <span><i className="sw" style={{ background: "var(--accent)", borderRadius: "50%" }} />Marriage</span>
        <span><em className="goth">Gold italic</em>&nbsp;gothram: father&apos;s line; married women take their husband&apos;s</span>
      </div>
      <div className="main">
        {empty ? (
          <div className="canvas"><div className="empty">
            <h2>No one in this tree yet</h2>
            <p className="muted">Add the first person, or import a tree file.</p>
            {canEdit && <div className="row"><button className="primary" type="button" onClick={() => setMode({ kind: "edit", id: null })}>Add the first person</button><button type="button" onClick={() => setMode({ kind: "data" })}>Import a file</button></div>}
          </div></div>
        ) : <TreeCanvas people={people} families={families} canEdit={canEdit} selected={sel} onSelect={ctx.select} />}
        <aside className="card" aria-live="polite">{panel()}</aside>
      </div>
      <p className="status">{status}</p>
    </>
  );
}

export default function TreePage() {
  return (
    <main className="wrap">
      <TopBar />
      <Suspense fallback={<p className="muted">Loading…</p>}><TreeApp /></Suspense>
    </main>
  );
}
